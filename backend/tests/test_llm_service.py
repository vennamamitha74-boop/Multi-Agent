import sys
from pathlib import Path
import pytest
from pydantic import BaseModel, Field

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from backend.app.config import settings
from backend.app.services.llm_service import llm_service


class SampleTaskPlan(BaseModel):
    objective: str = Field(description="The main goal of the task")
    estimated_steps: int = Field(description="Number of planned subtasks")
    subtask_titles: list[str] = Field(description="Titles of planned subtasks")


def test_config_loaded():
    assert settings.is_gemini_configured(), "GEMINI_API_KEY should be configured in settings"
    assert settings.is_qdrant_configured(), "Qdrant should be configured in settings"
    assert settings.is_cloudinary_configured(), "Cloudinary should be configured in settings"


def test_llm_service_generate_text():
    response = llm_service.generate_text("Reply with ONLY: 'LLM_HEALTHY'", temperature=0.1)
    assert len(response) > 0
    print(f"\n[Live Gemini Response]: {response}")


def test_llm_service_generate_structured():
    plan = llm_service.generate_structured(
        prompt="Plan a research task to find the best laptop under $1000.",
        response_schema=SampleTaskPlan
    )
    assert isinstance(plan, SampleTaskPlan)
    assert len(plan.subtask_titles) > 0
    print(f"\n[Live Structured Plan]: {plan.model_dump_json(indent=2)}")


if __name__ == "__main__":
    test_config_loaded()
    print("test_config_loaded passed.")
    test_llm_service_generate_text()
    print("test_llm_service_generate_text passed.")
    test_llm_service_generate_structured()
    print("test_llm_service_generate_structured passed.")
