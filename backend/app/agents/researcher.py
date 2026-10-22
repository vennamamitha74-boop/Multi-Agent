import logging
from typing import Any, Dict, List
from app.graph.state import AgentState
from app.services.llm_service import llm_service
from app.services.rag_service import rag_service
from app.services.search_service import search_service

logger = logging.getLogger("researcher_agent")


class ResearcherAgent:
    """
    Retrieves grounded evidence from Qdrant vector database and external search.
    Preserves document sources, citations, and metadata.
    """

    def run(self, state: AgentState) -> AgentState:
        # Check prerequisites
        if state.agent_statuses.get("planner") != "completed":
            state.agent_statuses["researcher"] = "blocked"
            return state

        state.agent_statuses["researcher"] = "running"
        state.log_event("researcher", "Gathering evidence from Qdrant and external search")

        query = state.original_request
        objective = state.plan.objective if state.plan else query

        # 1. Retrieve from Qdrant vector database
        doc_evidence = rag_service.search_documents(
            query=objective,
            user_id=state.user_id,
            top_k=4
        )

        # 2. Retrieve live web search if applicable
        web_evidence = search_service.search(query=objective, max_results=4)

        all_evidence = []
        for doc in doc_evidence:
            all_evidence.append({
                "type": "document",
                "source": doc.get("filename", "unknown"),
                "page": doc.get("page_number", 1),
                "content": doc.get("content", ""),
                "score": doc.get("score")
            })

        for web in web_evidence:
            all_evidence.append({
                "type": "web",
                "source": web.get("source", "Web"),
                "title": web.get("title", ""),
                "snippet": web.get("snippet", ""),
                "url": web.get("url", "")
            })

        state.retrieved_evidence = all_evidence

        # 3. Synthesize structured findings using LLM
        prompt = (
            f"You are the Researcher Agent. Synthesize the findings based on the gathered evidence.\n\n"
            f"Original Request: {state.original_request}\n"
            f"Objective: {objective}\n"
            f"Requirements: {state.requirements}\n"
            f"Constraints: {state.constraints}\n\n"
            f"Collected Evidence:\n"
            f"{all_evidence if all_evidence else 'No external documents or web links found. Use verified knowledge and specify that live evidence was not available.'}\n\n"
            f"Provide a structured research brief summarizing key data points, facts, and source references."
        )

        try:
            summary = llm_service.generate_text(prompt=prompt, temperature=0.3)
            state.research_results = {
                "summary": summary,
                "evidence_count": len(all_evidence),
                "sources": [e.get("source") or e.get("url") for e in all_evidence]
            }

            # Update subtasks assigned to researcher
            for subtask in state.subtasks:
                if subtask.assigned_agent == "researcher" and subtask.status == "pending":
                    subtask.status = "completed"
                    subtask.output = summary

            state.agent_statuses["researcher"] = "completed"
            state.log_event("researcher", f"Research completed with {len(all_evidence)} verified evidence items")

        except Exception as e:
            logger.error(f"Researcher agent failed: {e}")
            state.agent_statuses["researcher"] = "failed"
            state.errors.append(f"Researcher error: {str(e)}")
            state.log_event("researcher", f"Research failed: {str(e)}")

        return state


researcher_agent = ResearcherAgent()
