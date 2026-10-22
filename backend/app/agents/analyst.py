import logging
from typing import Any, Dict, List
from backend.app.graph.state import AgentState
from backend.app.services.llm_service import llm_service

logger = logging.getLogger("analyst_agent")


class AnalystAgent:
    """
    Analyzes research results, validates feasibility against constraints (budget, specs),
    and highlights trade-offs without fabricating facts.
    """

    def run(self, state: AgentState) -> AgentState:
        # Check prerequisites
        if state.agent_statuses.get("researcher") != "completed":
            state.agent_statuses["analyst"] = "blocked"
            return state

        state.agent_statuses["analyst"] = "running"
        state.log_event("analyst", "Analyzing research findings against constraints and requirements")

        research_summary = state.research_results.get("summary", "No research data provided.")
        constraints_str = ", ".join(state.constraints) if state.constraints else "None specified"
        requirements_str = ", ".join(state.requirements) if state.requirements else "None specified"

        prompt = (
            f"You are the Analyst Agent in a multi-agent system.\n"
            f"Conduct a rigorous evaluation of the research findings against the defined constraints.\n\n"
            f"User Objective: {state.original_request}\n"
            f"Requirements: {requirements_str}\n"
            f"Constraints: {constraints_str}\n\n"
            f"Research Evidence & Summary:\n{research_summary}\n\n"
            f"Instructions:\n"
            f"1. Compare options/solutions against all constraints (especially budget or technical limits).\n"
            f"2. Explicitly flag any options that exceed constraints.\n"
            f"3. Highlight trade-offs, pros, and cons based strictly on the available evidence.\n"
            f"4. Do NOT fabricate missing details; explicitly state if data is missing.\n"
        )

        try:
            analysis_text = llm_service.generate_text(prompt=prompt, temperature=0.2)
            state.analysis_results = {
                "evaluation": analysis_text,
                "constraints_evaluated": state.constraints,
                "requirements_evaluated": state.requirements
            }

            for subtask in state.subtasks:
                if subtask.assigned_agent == "analyst" and subtask.status == "pending":
                    subtask.status = "completed"
                    subtask.output = analysis_text

            state.agent_statuses["analyst"] = "completed"
            state.log_event("analyst", "Analysis completed successfully")

        except Exception as e:
            logger.error(f"Analyst agent failed: {e}")
            state.agent_statuses["analyst"] = "failed"
            state.errors.append(f"Analyst error: {str(e)}")
            state.log_event("analyst", f"Analysis failed: {str(e)}")

        return state


analyst_agent = AnalystAgent()
