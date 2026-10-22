import logging
from typing import Any, Dict, List
from pydantic import BaseModel, Field

from backend.app.graph.state import AgentState
from backend.app.services.llm_service import llm_service

logger = logging.getLogger("verifier_agent")


class VerificationReport(BaseModel):
    is_approved: bool = Field(description="True if deliverable meets all requirements and criteria")
    completeness_score: float = Field(description="Score from 0.0 to 1.0 on requirement coverage")
    evidence_backed: bool = Field(description="True if claims are supported by facts/evidence")
    unsupported_claims: List[str] = Field(default_factory=list, description="List of unverified or hallucinated claims")
    audit_notes: str = Field(description="Summary of verification inspection")


class VerifierAgent:
    """
    Quality gatekeeper. Audits the final deliverable against requirements, constraints,
    and evidence ground truth. A failure is never silently marked as a success.
    """

    def run(self, state: AgentState) -> AgentState:
        # Check prerequisites
        if state.agent_statuses.get("executor") != "completed" or not state.final_deliverable:
            state.agent_statuses["verifier"] = "blocked"
            state.overall_status = "failed"
            return state

        state.agent_statuses["verifier"] = "running"
        state.log_event("verifier", "Auditing deliverable against acceptance criteria and evidence")

        prompt = (
            f"You are the Verifier Agent acting as the critical quality assurance authority.\n"
            f"Audit the following deliverable against original goals, requirements, constraints, and collected evidence.\n\n"
            f"Original Task: \"{state.original_request}\"\n"
            f"Requirements: {state.requirements}\n"
            f"Constraints: {state.constraints}\n\n"
            f"Final Deliverable to Verify:\n{state.final_deliverable}\n\n"
            f"Audit Criteria:\n"
            f"1. Does it satisfy the original task without generic placeholders?\n"
            f"2. Does it respect specified constraints (e.g. budget, scope)?\n"
            f"3. Are the recommendations logical, coherent, and grounded?\n"
        )

        try:
            report = llm_service.generate_structured(
                prompt=prompt,
                response_schema=VerificationReport,
                temperature=0.1
            )

            state.verification_results = report.model_dump()

            if report.is_approved:
                state.agent_statuses["verifier"] = "completed"
                state.overall_status = "completed"
                state.log_event("verifier", f"Deliverable APPROVED (Completeness: {int(report.completeness_score * 100)}%)", {
                    "audit_notes": report.audit_notes
                })
            else:
                state.agent_statuses["verifier"] = "rejected"
                state.overall_status = "partially_completed"
                state.warnings.append(f"Deliverable rejected by verifier: {report.audit_notes}")
                state.log_event("verifier", f"Deliverable REJECTED: {report.audit_notes}", {
                    "unsupported_claims": report.unsupported_claims
                })

        except Exception as e:
            logger.error(f"Verifier agent failed: {e}")
            state.agent_statuses["verifier"] = "failed"
            state.errors.append(f"Verifier error: {str(e)}")
            state.log_event("verifier", f"Verification inspection failed: {str(e)}")
            state.overall_status = "failed"

        return state


verifier_agent = VerifierAgent()
