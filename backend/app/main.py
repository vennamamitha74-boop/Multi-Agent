import asyncio
import datetime
import json
import logging
import os
import uuid
from typing import Any, Dict, List, Optional
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.config import settings
from app.graph.state import AgentState
from app.graph.workflow import multi_agent_graph
from app.services.rag_service import rag_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("backend_api")

app = FastAPI(
    title="Multi-Agent LLM Framework API",
    version="1.0.0",
    description="Autonomous Task Planning and Multi-Agent Execution Framework"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_ORIGIN,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Persistent store for document metadata and in-memory tasks
TASK_STORE: Dict[str, Dict[str, Any]] = {}

DOCUMENTS_METADATA_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "documents_metadata.json"
)

def load_documents_store() -> List[Dict[str, Any]]:
    """Loads document records from persistent disk storage."""
    try:
        if os.path.exists(DOCUMENTS_METADATA_FILE):
            with open(DOCUMENTS_METADATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
    except Exception as e:
        logger.warning(f"Could not load documents metadata from disk: {e}")
    return []

def save_documents_store(docs: List[Dict[str, Any]]):
    """Saves document records atomically to persistent disk storage."""
    try:
        os.makedirs(os.path.dirname(DOCUMENTS_METADATA_FILE), exist_ok=True)
        temp_file = DOCUMENTS_METADATA_FILE + ".tmp"
        with open(temp_file, "w", encoding="utf-8") as f:
            json.dump(docs, f, indent=2)
        os.replace(temp_file, DOCUMENTS_METADATA_FILE)
    except Exception as e:
        logger.error(f"Failed to persist documents metadata to disk: {e}")

DOCUMENTS_STORE: List[Dict[str, Any]] = load_documents_store()


class HealthResponse(BaseModel):
    status: str
    environment: str
    version: str


class ReadinessResponse(BaseModel):
    ready: bool
    components: Dict[str, Any]


class TaskSubmission(BaseModel):
    request: str = Field(..., min_length=3, description="Natural-language task to plan and execute")
    user_id: Optional[str] = Field(default="anonymous_user")
    document_ids: Optional[List[str]] = Field(default_factory=list)


def execute_agent_workflow(task_id: str, request_text: str, user_id: str):
    """Executes the LangGraph pipeline synchronously within the background worker."""
    logger.info(f"Starting execution of task: {task_id}")
    initial_state = AgentState(
        task_id=task_id,
        user_id=user_id,
        original_request=request_text,
        overall_status="running"
    )
    initial_state.log_event("workflow", "Workflow initiated")

    TASK_STORE[task_id]["status"] = "running"
    TASK_STORE[task_id]["events"] = initial_state.execution_events

    try:
        final_state = multi_agent_graph.invoke(initial_state)

        # Update in-memory task record
        # Note: final_state can be an AgentState or dict depending on LangGraph adapter
        if isinstance(final_state, dict):
            state_dict = final_state
        else:
            state_dict = final_state.model_dump()

        TASK_STORE[task_id].update({
            "status": state_dict.get("overall_status", "completed"),
            "plan": state_dict.get("plan"),
            "subtasks": state_dict.get("subtasks", []),
            "agent_statuses": state_dict.get("agent_statuses", {}),
            "retrieved_evidence": state_dict.get("retrieved_evidence", []),
            "research_results": state_dict.get("research_results", {}),
            "analysis_results": state_dict.get("analysis_results", {}),
            "execution_results": state_dict.get("execution_results", {}),
            "verification_results": state_dict.get("verification_results", {}),
            "final_deliverable": state_dict.get("final_deliverable"),
            "events": state_dict.get("execution_events", []),
            "warnings": state_dict.get("warnings", []),
            "errors": state_dict.get("errors", []),
            "updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
        logger.info(f"Task {task_id} finished with status: {TASK_STORE[task_id]['status']}")

    except Exception as e:
        logger.error(f"Fatal error in task {task_id}: {e}")
        TASK_STORE[task_id]["status"] = "failed"
        TASK_STORE[task_id]["errors"].append(str(e))
        TASK_STORE[task_id]["events"].append({
            "stage": "workflow",
            "message": f"Fatal execution error: {str(e)}",
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })


@app.get("/health", response_model=HealthResponse, tags=["Diagnostics"])
def health_check():
    """Confirms the FastAPI backend is running."""
    return HealthResponse(
        status="healthy",
        environment=settings.ENVIRONMENT,
        version="1.0.0"
    )


@app.get("/ready", response_model=ReadinessResponse, tags=["Diagnostics"])
def readiness_check():
    """Checks operational status of dependencies."""
    components = {
        "gemini": {
            "configured": settings.is_gemini_configured(),
            "model": settings.GEMINI_MODEL,
            "fallbacks": settings.GEMINI_FALLBACK_MODELS
        },
        "qdrant": {
            "configured": settings.is_qdrant_configured(),
            "collection": settings.QDRANT_COLLECTION_NAME
        },
        "cloudinary": {
            "configured": settings.is_cloudinary_configured()
        },
        "firebase": {
            "configured": settings.is_firebase_configured()
        }
    }
    return ReadinessResponse(ready=components["gemini"]["configured"], components=components)


@app.post("/api/tasks", status_code=status.HTTP_202_ACCEPTED, tags=["Tasks"])
def create_task(submission: TaskSubmission, background_tasks: BackgroundTasks):
    """Submits a natural-language task for planning and execution."""
    task_id = str(uuid.uuid4())
    task_record = {
        "task_id": task_id,
        "user_id": submission.user_id,
        "original_request": submission.request,
        "status": "pending",
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "plan": None,
        "subtasks": [],
        "agent_statuses": {
            "planner": "pending",
            "researcher": "pending",
            "analyst": "pending",
            "executor": "pending",
            "verifier": "pending"
        },
        "events": [
            {
                "stage": "queue",
                "message": "Task queued for multi-agent execution",
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
            }
        ],
        "final_deliverable": None,
        "errors": []
    }
    TASK_STORE[task_id] = task_record

    # Schedule asynchronous execution in background
    background_tasks.add_task(execute_agent_workflow, task_id, submission.request, submission.user_id)

    return {"task_id": task_id, "status": "accepted"}


@app.get("/api/tasks", tags=["Tasks"])
def list_tasks():
    """Retrieves all tasks in history."""
    return list(TASK_STORE.values())


@app.get("/api/tasks/{task_id}", tags=["Tasks"])
def get_task(task_id: str):
    """Retrieves execution state of a specific task."""
    if task_id not in TASK_STORE:
        raise HTTPException(status_code=404, detail="Task not found")
    return TASK_STORE[task_id]


@app.get("/api/tasks/{task_id}/events", tags=["Tasks"])
def get_task_events(task_id: str):
    """Retrieves execution events timeline for a task."""
    if task_id not in TASK_STORE:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task_id": task_id, "events": TASK_STORE[task_id].get("events", [])}


@app.post("/api/tasks/{task_id}/retry", tags=["Tasks"])
def retry_task(task_id: str, background_tasks: BackgroundTasks):
    """Retries execution of an eligible failed or partial task."""
    if task_id not in TASK_STORE:
        raise HTTPException(status_code=404, detail="Task not found")
    task = TASK_STORE[task_id]
    background_tasks.add_task(execute_agent_workflow, task_id, task["original_request"], task["user_id"])
    return {"task_id": task_id, "status": "retrying"}


class DocumentQueryRequest(BaseModel):
    query: str = Field(..., min_length=2, description="Natural-language question")
    document_id: Optional[str] = Field(default=None, description="Optional document ID to scope retrieval")
    user_id: Optional[str] = Field(default="anonymous_user")
    top_k: Optional[int] = Field(default=6)
    history: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Recent conversation turns")


@app.get("/api/documents", tags=["Documents & RAG"])
def list_documents(user_id: Optional[str] = None):
    """Lists indexed documents available for RAG."""
    global DOCUMENTS_STORE
    if not DOCUMENTS_STORE:
        DOCUMENTS_STORE = load_documents_store()
    return DOCUMENTS_STORE


@app.post("/api/documents/upload", tags=["Documents & RAG"])
async def upload_document(file: UploadFile = File(...), user_id: str = "anonymous_user"):
    """
    Uploads a PDF, DOCX, or TXT file, parses paragraphs & tables,
    generates overlapping chunks, and indexes them into Qdrant.
    """
    import io
    import re

    filename = file.filename or "uploaded_doc"
    fname_lower = filename.lower()
    content_bytes = await file.read()

    extracted_items = []

    if fname_lower.endswith(".txt"):
        try:
            text = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = content_bytes.decode("latin-1", errors="ignore")
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [text.strip()] if text.strip() else []
        for p in paragraphs:
            extracted_items.append({"content": p, "page_number": 1, "section": "Text Paragraph"})

    elif fname_lower.endswith(".docx"):
        import docx
        try:
            doc = docx.Document(io.BytesIO(content_bytes))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid or corrupted DOCX file: {str(e)}")

        # 1. Extract paragraphs and headings
        for p in doc.paragraphs:
            cleaned = p.text.strip()
            if cleaned:
                extracted_items.append({"content": cleaned, "page_number": 1, "section": "Document Paragraph"})

        # 2. Extract tables (rows and cells)
        for table_idx, table in enumerate(doc.tables, 1):
            table_rows = []
            for row in table.rows:
                cells_text = [cell.text.strip().replace("\n", " ") for cell in row.cells if cell.text.strip()]
                # Deduplicate identical merged cell texts in same row
                deduped = []
                for ct in cells_text:
                    if not deduped or deduped[-1] != ct:
                        deduped.append(ct)
                if deduped:
                    table_rows.append(" | ".join(deduped))
            if table_rows:
                table_content = "\n".join(table_rows)
                extracted_items.append({
                    "content": f"[Table {table_idx}]\n{table_content}",
                    "page_number": 1,
                    "section": f"Table {table_idx}"
                })

    elif fname_lower.endswith(".pdf"):
        extracted_pages = []
        try:
            import fitz
            doc = fitz.open(stream=content_bytes, filetype="pdf")
            for page_idx, page in enumerate(doc, 1):
                p_text = page.get_text().strip()
                if p_text:
                    extracted_pages.append((page_idx, p_text))
        except Exception:
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(content_bytes))
                for page_idx, page in enumerate(reader.pages, 1):
                    p_text = (page.extract_text() or "").strip()
                    if p_text:
                        extracted_pages.append((page_idx, p_text))
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to parse PDF document: {str(e)}")

        for page_num, page_content in extracted_pages:
            extracted_items.append({"content": page_content, "page_number": page_num, "section": f"Page {page_num}"})

    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, DOCX, or TXT.")

    # Validate that non-empty text was extracted
    if not extracted_items:
        raise HTTPException(status_code=400, detail="Document contains no readable text or is empty.")

    # Normalize extracted text and generate overlapping chunks (~500 chars with 100-char overlap)
    chunk_size = 500
    overlap = 100
    chunks = []

    for item in extracted_items:
        raw_content = item["content"].strip()
        raw_content = re.sub(r"[ \t]+", " ", raw_content)
        raw_content = re.sub(r"\n{3,}", "\n\n", raw_content)
        if not raw_content:
            continue

        if len(raw_content) <= chunk_size:
            chunks.append({
                "content": raw_content,
                "page_number": item["page_number"],
                "section": item["section"]
            })
        else:
            start = 0
            while start < len(raw_content):
                chunk_slice = raw_content[start:start + chunk_size].strip()
                if chunk_slice:
                    chunks.append({
                        "content": chunk_slice,
                        "page_number": item["page_number"],
                        "section": item["section"]
                    })
                start += (chunk_size - overlap)

    if not chunks:
        raise HTTPException(status_code=400, detail="Document contains no readable text chunks.")

    doc_id = str(uuid.uuid4())
    indexed_count = rag_service.index_document_chunks(
        chunks=chunks,
        document_id=doc_id,
        filename=filename,
        user_id=user_id
    )

    if indexed_count == 0:
        raise HTTPException(status_code=500, detail="Failed to index document chunks into vector database.")

    # Phase 4: Real Index Verification
    verification = rag_service.verify_document_indexing(document_id=doc_id, expected_min_chunks=1)
    if not verification.get("verified"):
        rag_service.delete_document_chunks(doc_id)
        raise HTTPException(
            status_code=500,
            detail=f"Qdrant vector index verification failed: {verification.get('error', 'Zero searchable points confirmed')}"
        )

    verified_count = verification.get("searchable_chunks", indexed_count)
    doc_record = {
        "document_id": doc_id,
        "filename": filename,
        "user_id": user_id,
        "chunk_count": verified_count,
        "uploaded_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    DOCUMENTS_STORE.append(doc_record)
    save_documents_store(DOCUMENTS_STORE)
    logger.info(f"Successfully processed and verified document '{filename}' with {verified_count} confirmed Qdrant chunks.")
    return doc_record


def classify_query_intent(query: str, history: List[Dict[str, Any]]) -> str:
    """Classifies natural language query into overview, ideas, followup, or specific search."""
    q_lower = query.lower().strip()

    # 1. Follow-up intent (conversation context requested)
    followup_patterns = [
        "second point", "first point", "third point", "fourth point",
        "second recommendation", "first recommendation", "third recommendation", "fourth recommendation",
        "previous suggestion", "previous recommendation", "previous point",
        "improve that", "can you improve that", "give examples", "give an example",
        "explain that", "explain the second", "explain the first", "explain the third",
        "tell me more", "elaborate", "what about that", "how does that work",
        "what does that mean", "expand on", "the recommendation", "the previous",
        "previous", "clarify that", "more detail", "concrete implementation", "how to implement"
    ]
    if history and (
        any(p in q_lower for p in followup_patterns)
        or (len(q_lower.split()) <= 6 and any(w in q_lower.split() for w in ["it", "that", "this", "they", "those", "why", "second", "first", "third"]))
    ):
        return "followup"

    # 2. Document Overview & Summary intent
    overview_patterns = [
        "tell me about this document", "tell me about the document", "summarize this document",
        "summarize the document", "summary of this document", "summary of the document",
        "what does this document contain", "what is this document about", "what is this document",
        "overview of this document", "overview of the document", "document overview",
        "give me an overview", "document summary", "outline of this document", "outline this document",
        "main topics", "key sections", "describe this document"
    ]
    if any(p in q_lower for p in overview_patterns) or (
        len(q_lower.split()) <= 4 and any(w in q_lower.split() for w in ["summarize", "summary", "overview"])
    ):
        return "overview"

    # 3. Ideas and Innovation intent
    ideas_patterns = [
        "idea", "ideas", "innovat", "improve", "improvement", "improvements",
        "suggestion", "suggestions", "recommend", "recommendation", "recommendations",
        "how can we improve", "future work", "enhancement", "enhancements",
        "optimizations", "what else can be done", "next steps for"
    ]
    if any(p in q_lower for p in ideas_patterns):
        return "ideas"

    return "specific"


@app.post("/api/documents/query", tags=["Documents & RAG"])
def query_documents(request: DocumentQueryRequest):
    """
    Intelligent RAG query endpoint:
    - Provides structured document overview on summarization requests.
    - Generates grounded, cited answers for specific questions using hybrid retrieval.
    - Proposes innovative architectural improvements grounded in document context.
    - Supports multi-turn follow-up dialogue while keeping context anchored in evidence.
    - Enforces document isolation between authenticated users.
    - Rejects out-of-scope questions with clear missing information explanations.
    """
    global DOCUMENTS_STORE

    # Reload store from disk if empty
    if not DOCUMENTS_STORE:
        DOCUMENTS_STORE = load_documents_store()

    matching_doc = None
    if request.document_id:
        matching_doc = next((d for d in DOCUMENTS_STORE if d["document_id"] == request.document_id), None)
        # If not found in store, verify if it exists directly in Qdrant
        if not matching_doc:
            q_chunks = rag_service.get_document_chunks(request.document_id, limit=1)
            if q_chunks:
                meta = q_chunks[0].get("metadata", {})
                matching_doc = {
                    "document_id": request.document_id,
                    "filename": meta.get("filename", "Recovered Document"),
                    "user_id": meta.get("user_id", "anonymous_user"),
                    "chunk_count": rag_service.get_points_count(request.document_id),
                    "uploaded_at": meta.get("upload_timestamp") or datetime.datetime.now(datetime.timezone.utc).isoformat()
                }
                DOCUMENTS_STORE.append(matching_doc)
                save_documents_store(DOCUMENTS_STORE)

        if not matching_doc:
            raise HTTPException(status_code=404, detail="Selected document not found in vector knowledge base.")

        # Document Isolation Enforcement (Phase 5, test 8)
        doc_owner = matching_doc.get("user_id", "anonymous_user")
        req_user = request.user_id or "anonymous_user"
        if (
            doc_owner not in ("anonymous_user", "system", "all")
            and req_user not in ("anonymous_user", "admin", "system_admin")
            and doc_owner != req_user
        ):
            logger.warning(f"[Security / Isolation] User '{req_user}' attempted to access document '{request.document_id}' owned by '{doc_owner}'")
            return {
                "question": request.query,
                "answer": f"Access denied: You do not have permission to query document '{matching_doc['filename']}'. Documents are strictly isolated per authenticated user.",
                "is_grounded": False,
                "citations": [],
                "evidence_count": 0,
                "intent": "isolated"
            }

        if matching_doc.get("chunk_count", 0) == 0:
            return {
                "question": request.query,
                "answer": f"Document '{matching_doc['filename']}' has 0 indexed chunks and cannot be queried.",
                "is_grounded": False,
                "citations": [],
                "evidence_count": 0,
                "intent": "none"
            }
    else:
        # If no document_id specified, find documents accessible to this user
        req_user = request.user_id or "anonymous_user"
        user_docs = [
            d for d in DOCUMENTS_STORE
            if d.get("user_id") == req_user or req_user in ("admin", "system_admin", "anonymous_user")
        ]
        matching_doc = next((d for d in user_docs if d.get("chunk_count", 0) > 0), None)

        if not matching_doc and not DOCUMENTS_STORE:
            return {
                "question": request.query,
                "answer": "No documents are currently indexed in the knowledge base. Please upload a document first.",
                "is_grounded": False,
                "citations": [],
                "evidence_count": 0,
                "intent": "none"
            }

    intent = classify_query_intent(request.query, request.history or [])
    doc_id_to_use = request.document_id or (matching_doc["document_id"] if matching_doc else None)

    from app.services.llm_service import llm_service

    # =========================================================================
    # 1. DOCUMENT OVERVIEW & SUMMARY
    # =========================================================================
    if intent == "overview":
        representative_chunks = rag_service.get_representative_chunks(
            document_id=doc_id_to_use,
            max_chunks=8
        ) if doc_id_to_use else []

        if not representative_chunks:
            representative_chunks = rag_service.search_documents(
                query=request.query,
                document_id=doc_id_to_use,
                top_k=6
            )

        context_sections = []
        citations = []
        for idx, c in enumerate(representative_chunks, 1):
            filename = c.get("filename", "Document")
            chunk_id = c.get("chunk_id", f"chunk_{idx}")
            page = c.get("page_number", 1)
            section = c.get("section", "Document Paragraph")
            content = c.get("content", "").strip()
            score = c.get("score", 1.0)

            context_sections.append(
                f"--- SOURCE {idx} (File: {filename}, Section: {section}, Page: {page}, Chunk ID: {chunk_id}) ---\n{content}"
            )
            citations.append({
                "citation_index": idx,
                "filename": filename,
                "chunk_id": chunk_id,
                "page_number": page,
                "section": section,
                "similarity_score": round(score, 4),
                "snippet": content[:200] + ("..." if len(content) > 200 else "")
            })

        full_context = "\n\n".join(context_sections)
        prompt = f"""You are a specialized enterprise document intelligence assistant.
Analyze the provided document passages and generate a clear, comprehensive, and highly structured executive overview.

You MUST structure your response into these exact numbered sections:
1. **Document Purpose**: State the overall objective, scope, domain, and target problem addressed by the document.
2. **Main Topics & Architecture**: Detail the primary themes, systems, frameworks, or workflows discussed.
3. **Important Sections & Structure**: Highlight the primary components, tables, benchmarks, or categories identified.
4. **Key Points & Metrics**: List specific benchmark numbers, performance SLAs, metrics, configurations, or critical findings with exact facts from the text.
5. **Conclusions & Next Steps**: Synthesize the core takeaways, operational recommendations, or stated conclusions.

IMPORTANT RULES:
- Ground your overview strictly in the provided Context passages.
- Cite the corresponding source numbers [Source X] in your text where relevant.
- Maintain professional, clean formatting.

Context:
{full_context}

User Request: {request.query}

Document Overview:"""

        try:
            answer = llm_service.generate_text(prompt, temperature=0.2).strip()
        except Exception as e:
            logger.error(f"Error generating overview: {e}")
            answer = f"Error generating document overview: {str(e)}"

        return {
            "question": request.query,
            "answer": answer,
            "is_grounded": True,
            "citations": citations,
            "evidence_count": len(citations),
            "intent": "overview"
        }

    # =========================================================================
    # 2. IDEAS AND INNOVATION
    # =========================================================================
    elif intent == "ideas":
        specific_chunks = rag_service.search_documents(
            query=request.query,
            document_id=doc_id_to_use,
            top_k=5
        )
        rep_chunks = rag_service.get_representative_chunks(
            document_id=doc_id_to_use,
            max_chunks=4
        ) if doc_id_to_use else []

        combined_map = {}
        for c in (specific_chunks + rep_chunks):
            cid = c.get("chunk_id")
            if cid and cid not in combined_map:
                combined_map[cid] = c

        all_evidence = list(combined_map.values())[:7]

        context_sections = []
        citations = []
        for idx, c in enumerate(all_evidence, 1):
            filename = c.get("filename", "Document")
            chunk_id = c.get("chunk_id", f"chunk_{idx}")
            page = c.get("page_number", 1)
            section = c.get("section", "Document Paragraph")
            content = c.get("content", "").strip()
            score = c.get("score", 0.9)

            context_sections.append(
                f"--- SOURCE {idx} (File: {filename}, Section: {section}, Page: {page}, Chunk ID: {chunk_id}) ---\n{content}"
            )
            citations.append({
                "citation_index": idx,
                "filename": filename,
                "chunk_id": chunk_id,
                "page_number": page,
                "section": section,
                "similarity_score": round(score, 4),
                "snippet": content[:200] + ("..." if len(content) > 200 else "")
            })

        full_context = "\n\n".join(context_sections)
        prompt = f"""You are an enterprise systems architect and innovation strategist.
Analyze the provided document context and generate high-impact improvement recommendations and innovative ideas.

You MUST structure your response into these exact sections:
1. **Document Baseline & Context**:
   Summarize the current baseline technologies, metrics, and goals described in the document. Cite [Source X] for all factual baseline statements.

2. **Identified Limitations & Bottlenecks**:
   Highlight operational or architectural limitations, potential bottlenecks, or scaling challenges based on the document.

3. **Actionable Improvement & Innovation Recommendations**:
   Provide 3 to 4 concrete, prioritized recommendations (e.g. Architectural Scaling, Performance Optimizations, Automated Reliability, or Enterprise Security).
   For EACH recommendation, include:
   - **Proposal**: Concrete technical or architectural action.
   - **Why This is Useful**: Explain the specific benefit (e.g. latency reduction, cost efficiency, resilience).
   - **How it Builds on the Document**: Explicitly connect it back to the baseline components and metrics mentioned in the text.

CRITICAL RULE: Clearly separate existing document facts (which must cite [Source X]) from your AI innovation recommendations.

Context:
{full_context}

User Request: {request.query}

Innovation Recommendations:"""

        try:
            answer = llm_service.generate_text(prompt, temperature=0.3).strip()
        except Exception as e:
            logger.error(f"Error generating innovation ideas: {e}")
            answer = f"Error generating ideas: {str(e)}"

        return {
            "question": request.query,
            "answer": answer,
            "is_grounded": True,
            "citations": citations,
            "evidence_count": len(citations),
            "intent": "ideas"
        }

    # =========================================================================
    # 3. MULTI-TURN CONVERSATION FOLLOW-UP
    # =========================================================================
    elif intent == "followup":
        recent_history = (request.history or [])[-3:]
        history_text = "\n".join([
            f"User: {turn.get('question', '')}\nAssistant: {turn.get('answer', '')}"
            for turn in recent_history
        ])

        prev_query = recent_history[-1].get("question", "") if recent_history else ""
        augmented_query = f"{prev_query} {request.query}".strip()

        evidence_chunks = rag_service.search_documents(
            query=augmented_query,
            document_id=doc_id_to_use,
            top_k=5
        )
        if not evidence_chunks:
            evidence_chunks = rag_service.get_representative_chunks(document_id=doc_id_to_use, max_chunks=4)

        context_sections = []
        citations = []
        for idx, c in enumerate(evidence_chunks, 1):
            filename = c.get("filename", "Document")
            chunk_id = c.get("chunk_id", f"chunk_{idx}")
            page = c.get("page_number", 1)
            section = c.get("section", "Document Paragraph")
            content = c.get("content", "").strip()
            score = c.get("score", 0.8)

            context_sections.append(
                f"--- SOURCE {idx} (File: {filename}, Section: {section}, Page: {page}, Chunk ID: {chunk_id}) ---\n{content}"
            )
            citations.append({
                "citation_index": idx,
                "filename": filename,
                "chunk_id": chunk_id,
                "page_number": page,
                "section": section,
                "similarity_score": round(score, 4),
                "snippet": content[:200] + ("..." if len(content) > 200 else "")
            })

        full_context = "\n\n".join(context_sections)
        prompt = f"""You are a specialized enterprise document intelligence assistant maintaining an ongoing dialogue with the user.
Answer the user's follow-up question in the context of the recent conversation and grounded in the provided document evidence.

Recent Conversation:
{history_text}

Context from Document:
{full_context}

User Follow-Up: {request.query}

Rules:
1. Seamlessly address the follow-up question (e.g. explaining the specified point, giving concrete examples, or expanding on previous suggestions).
2. Connect your explanations to the factual evidence provided in the Context above, citing [Source X].
3. If the follow-up asks for information not present or inferable from the document context, clearly state what information is missing.
4. Keep the response crisp, professional, and well-structured.

Answer:"""

        try:
            answer = llm_service.generate_text(prompt, temperature=0.2).strip()
        except Exception as e:
            logger.error(f"Error handling follow-up: {e}")
            answer = f"Error generating answer: {str(e)}"

        return {
            "question": request.query,
            "answer": answer,
            "is_grounded": True,
            "citations": citations,
            "evidence_count": len(citations),
            "intent": "followup"
        }

    # =========================================================================
    # 4. SPECIFIC QUESTION ANSWERING
    # =========================================================================
    else:
        evidence_chunks = rag_service.search_documents(
            query=request.query,
            user_id=request.user_id,
            document_id=doc_id_to_use,
            top_k=request.top_k or 5
        )

        max_score = max((c.get("score", 0) for c in evidence_chunks), default=0.0)
        max_lex = max((c.get("lexical_score", 0) for c in evidence_chunks), default=0.0)

        # If zero lexical overlap and very low similarity, question is out-of-scope / unrelated
        if (max_score < 0.08 and max_lex == 0.0) or not evidence_chunks:
            target_filename = matching_doc["filename"] if matching_doc else "the indexed documents"
            return {
                "question": request.query,
                "answer": f"The indexed document '{target_filename}' does not contain sufficient information to answer this question. The document focuses on its indexed technical domain and does not contain evidence or metrics regarding '{request.query}'.",
                "is_grounded": False,
                "citations": [],
                "evidence_count": 0,
                "intent": "specific"
            }

        valid_chunks = [c for c in evidence_chunks if c.get("content", "").strip()]

        context_sections = []
        citations = []
        for idx, c in enumerate(valid_chunks, 1):
            filename = c.get("filename", "Document")
            chunk_id = c.get("chunk_id", f"chunk_{idx}")
            page = c.get("page_number", 1)
            section = c.get("section", "Document Paragraph")
            score = c.get("score", 0.0)
            content = c.get("content", "").strip()

            context_sections.append(
                f"--- SOURCE {idx} (File: {filename}, Section: {section}, Page: {page}, Chunk ID: {chunk_id}) ---\n{content}"
            )
            citations.append({
                "citation_index": idx,
                "filename": filename,
                "chunk_id": chunk_id,
                "page_number": page,
                "section": section,
                "similarity_score": round(score, 4),
                "snippet": content[:200] + ("..." if len(content) > 200 else "")
            })

        full_context = "\n\n".join(context_sections)
        prompt = f"""You are a specialized enterprise document intelligence assistant.
Answer the user's question based strictly and ONLY on the factual evidence provided in the Context below.

Rules:
1. If the context does not contain sufficient facts to answer the question, state exactly: "The provided document does not contain sufficient information to answer this question."
2. Do not speculate, extrapolate, or introduce facts not found in the Context.
3. Cite the relevant source numbers [Source X] in your answer when referencing specific information.
4. Keep the answer clear, professional, and well-structured.

Context:
{full_context}

User Question: {request.query}

Answer:"""

        try:
            answer = llm_service.generate_text(prompt, temperature=0.1).strip()
        except Exception as e:
            logger.error(f"Error invoking Gemini for RAG answer: {e}")
            answer = f"Error generating grounded answer: {str(e)}"

        # If answer states that context is insufficient, mark is_grounded as False
        is_grounded = True
        if "does not contain sufficient information" in answer.lower():
            is_grounded = False

        return {
            "question": request.query,
            "answer": answer,
            "is_grounded": is_grounded,
            "citations": citations if is_grounded else [],
            "evidence_count": len(citations) if is_grounded else 0,
            "intent": "specific"
        }


@app.delete("/api/documents/{document_id}", tags=["Documents & RAG"])
def delete_document(document_id: str):
    """Deletes a document and its vector chunks from Qdrant and the persistent store."""
    global DOCUMENTS_STORE
    if not DOCUMENTS_STORE:
        DOCUMENTS_STORE = load_documents_store()

    existing = next((d for d in DOCUMENTS_STORE if d["document_id"] == document_id), None)
    if not existing:
        raise HTTPException(status_code=404, detail="Document not found")

    rag_service.delete_document_chunks(document_id)
    DOCUMENTS_STORE = [d for d in DOCUMENTS_STORE if d["document_id"] != document_id]
    save_documents_store(DOCUMENTS_STORE)
    return {"status": "deleted", "document_id": document_id}
