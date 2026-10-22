import asyncio
import datetime
import logging
import uuid
from typing import Any, Dict, List, Optional
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.app.config import settings
from backend.app.graph.state import AgentState
from backend.app.graph.workflow import multi_agent_graph
from backend.app.services.rag_service import rag_service

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

# In-memory store for task execution and document metadata
TASK_STORE: Dict[str, Dict[str, Any]] = {}
DOCUMENTS_STORE: List[Dict[str, Any]] = []


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


@app.get("/api/documents", tags=["Documents & RAG"])
def list_documents():
    """Lists indexed documents available for RAG."""
    return DOCUMENTS_STORE


@app.post("/api/documents/upload", tags=["Documents & RAG"])
async def upload_document(file: UploadFile = File(...), user_id: str = "anonymous_user"):
    """Uploads a PDF, DOCX, or TXT file, chunks it, and indexes into Qdrant."""
    filename = file.filename or "uploaded_doc"
    content_bytes = await file.read()
    text = ""

    if filename.endswith(".txt"):
        text = content_bytes.decode("utf-8", errors="ignore")
    elif filename.endswith(".pdf"):
        import fitz  # PyMuPDF
        doc = fitz.open(stream=content_bytes, filetype="pdf")
        text = "\n".join([page.get_text() for page in doc])
    elif filename.endswith(".docx"):
        import docx
        import io
        doc = docx.Document(io.BytesIO(content_bytes))
        text = "\n".join([p.text for p in doc.paragraphs])
    else:
        raise HTTPException(status_code=400, detail="Unsupported file format. Please upload PDF, DOCX, or TXT.")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Document contains no readable text.")

    # Split into chunks of ~500 chars with 100 char overlap
    chunk_size = 500
    overlap = 100
    chunks = []
    start = 0
    while start < len(text):
        chunk_text = text[start:start + chunk_size]
        chunks.append({
            "content": chunk_text,
            "page_number": 1
        })
        start += (chunk_size - overlap)

    doc_id = str(uuid.uuid4())
    indexed_count = rag_service.index_document_chunks(
        chunks=chunks,
        document_id=doc_id,
        filename=filename,
        user_id=user_id
    )

    doc_record = {
        "document_id": doc_id,
        "filename": filename,
        "user_id": user_id,
        "chunk_count": indexed_count,
        "uploaded_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }
    DOCUMENTS_STORE.append(doc_record)
    return doc_record
