import logging
from typing import List
from pydantic import BaseModel, Field

from app.graph.state import AgentState, Subtask, TaskPlan
from app.services.llm_service import llm_service

logger = logging.getLogger("planner_agent")


class RawPlannerOutput(BaseModel):
    objective: str = Field(description="The core objective of the user's request")
    requirements: List[str] = Field(description="Explicit requirements and scope")
    constraints: List[str] = Field(description="Budget, platform, timeline, or technical constraints")
    subtasks: List[Subtask] = Field(description="List of actionable subtasks")


class PlannerAgent:
    """
    Decomposes natural language requests into structured, actionable subtasks.
    Ensures that zero-subtask plans are never produced.
    """

    def run(self, state: AgentState) -> AgentState:
        state.agent_statuses["planner"] = "running"
        state.log_event("planner", "Analyzing request and formulating execution plan")

        prompt = (
            f"You are the Lead Planning Agent in a multi-agent AI system.\n"
            f"Decompose the following user task into structured, dependent subtasks.\n\n"
            f"User Task: \"{state.original_request}\"\n\n"
            f"Rules:\n"
            f"1. You MUST generate at least 3 distinct subtasks.\n"
            f"2. Assign each subtask to either 'researcher', 'analyst', or 'executor'.\n"
            f"3. Clearly identify any dependencies between subtasks.\n"
            f"4. Identify any budget constraints or quality requirements explicitly.\n"
        )

        try:
            plan_output = llm_service.generate_structured(
                prompt=prompt,
                response_schema=RawPlannerOutput,
                temperature=0.2
            )

            # Safeguard: Verify subtasks exist
            if not plan_output.subtasks or len(plan_output.subtasks) == 0:
                raise ValueError("Planner returned an empty list of subtasks.")

            state.plan = TaskPlan(
                objective=plan_output.objective,
                requirements=plan_output.requirements,
                constraints=plan_output.constraints,
                subtasks=plan_output.subtasks
            )
            state.requirements = plan_output.requirements
            state.constraints = plan_output.constraints
            state.subtasks = plan_output.subtasks
            
            # Map dependencies
            state.dependencies = {
                st.id: st.dependencies for st in plan_output.subtasks
            }

            state.agent_statuses["planner"] = "completed"
            state.log_event("planner", f"Successfully planned {len(plan_output.subtasks)} subtasks", {
                "objective": plan_output.objective,
                "subtasks": [s.title for s in plan_output.subtasks]
            })

        except Exception as e:
            logger.error(f"Planner failed: {e}")
            state.agent_statuses["planner"] = "failed"
            state.errors.append(f"Planner error: {str(e)}")
            state.log_event("planner", f"Planning failed: {str(e)}")
            state.overall_status = "failed"

        return state


planner_agent = PlannerAgent()
