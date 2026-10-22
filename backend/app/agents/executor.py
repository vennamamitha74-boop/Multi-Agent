import logging
from typing import Any, Dict
from app.graph.state import AgentState
from app.services.llm_service import llm_service

logger = logging.getLogger("executor_agent")


class ExecutorAgent:
    """
    Synthesizes the complete final deliverable from verified research and analytical findings.
    Never produces generic placeholders.
    """

    def run(self, state: AgentState) -> AgentState:
        # Check prerequisites
        if state.agent_statuses.get("analyst") != "completed":
            state.agent_statuses["executor"] = "blocked"
            return state

        state.agent_statuses["executor"] = "running"
        state.log_event("executor", "Synthesizing comprehensive final deliverable from findings")

        research_data = state.research_results.get("summary", "")
        analysis_data = state.analysis_results.get("evaluation", "")
        evidence_list = state.retrieved_evidence

        prompt = (
            f"You are the Executor Agent responsible for crafting the final deliverable.\n\n"
            f"User Goal: \"{state.original_request}\"\n"
            f"Requirements: {state.requirements}\n"
            f"Constraints: {state.constraints}\n\n"
            f"Research Evidence:\n{research_data}\n\n"
            f"Analytical Evaluation:\n{analysis_data}\n\n"
            f"Document/Web Sources:\n{[e.get('source') or e.get('url') for e in evidence_list]}\n\n"
            f"Deliverable Instructions:\n"
            f"1. Generate a comprehensive, professional, well-structured final report in GitHub-flavored Markdown.\n"
            f"2. Structure it clearly: Executive Summary, Detailed Findings & Comparisons, Recommendation/Solution, and Citations & Sources.\n"
            f"3. Strictly avoid generic placeholders like 'TBD', '[insert here]', or vague answers.\n"
            f"4. Cite concrete evidence and include practical details that directly address the user's request.\n"
        )

        try:
            deliverable = llm_service.generate_text(prompt=prompt, temperature=0.3)
            state.final_deliverable = deliverable
            state.execution_results = {
                "deliverable_length": len(deliverable),
                "status": "generated"
            }

            for subtask in state.subtasks:
                if subtask.assigned_agent == "executor" and subtask.status == "pending":
                    subtask.status = "completed"
                    subtask.output = "Deliverable generated"

            state.agent_statuses["executor"] = "completed"
            state.log_event("executor", "Final deliverable generated successfully")

        except Exception as e:
            logger.error(f"Executor agent failed: {e}")
            state.agent_statuses["executor"] = "failed"
            state.errors.append(f"Executor error: {str(e)}")
            state.log_event("executor", f"Execution failed: {str(e)}")

        return state


executor_agent = ExecutorAgent()
