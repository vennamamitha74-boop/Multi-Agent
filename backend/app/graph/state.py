from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class Subtask(BaseModel):
    id: str = Field(description="Unique identifier for the subtask (e.g. subtask_1)")
    title: str = Field(description="Short, descriptive title")
    description: str = Field(description="Actionable instructions for the subtask")
    assigned_agent: str = Field(description="Agent responsible: researcher, analyst, executor")
    dependencies: List[str] = Field(default_factory=list, description="IDs of subtasks that must complete first")
    status: str = Field(default="pending", description="pending, running, completed, failed, skipped")
    output: Optional[Any] = Field(default=None, description="Result produced by the subtask")


class TaskPlan(BaseModel):
    objective: str = Field(description="Core objective extracted from user request")
    requirements: List[str] = Field(default_factory=list, description="Explicit and implicit requirements")
    constraints: List[str] = Field(default_factory=list, description="Budget, platform, timeline, or operational limits")
    subtasks: List[Subtask] = Field(default_factory=list, description="Ordered list of decomposed subtasks")


class AgentState(BaseModel):
    task_id: str
    user_id: str = "anonymous_user"
    original_request: str
    requirements: List[str] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    plan: Optional[TaskPlan] = None
    subtasks: List[Subtask] = Field(default_factory=list)
    dependencies: Dict[str, List[str]] = Field(default_factory=dict)
    
    retrieved_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    research_results: Dict[str, Any] = Field(default_factory=dict)
    analysis_results: Dict[str, Any] = Field(default_factory=dict)
    execution_results: Dict[str, Any] = Field(default_factory=dict)
    verification_results: Dict[str, Any] = Field(default_factory=dict)

    agent_statuses: Dict[str, str] = Field(
        default_factory=lambda: {
            "planner": "pending",
            "researcher": "pending",
            "analyst": "pending",
            "executor": "pending",
            "verifier": "pending"
        }
    )
    execution_events: List[Dict[str, Any]] = Field(default_factory=list)
    retry_counts: Dict[str, int] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    final_deliverable: Optional[str] = None
    overall_status: str = "pending"  # pending, running, completed, failed, partially_completed

    def log_event(self, stage: str, message: str, details: Optional[Dict[str, Any]] = None):
        import datetime
        self.execution_events.append({
            "stage": stage,
            "message": message,
            "details": details or {},
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
