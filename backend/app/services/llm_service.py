import json
import logging
import re
import time
from typing import Any, Dict, List, Optional, Type, TypeVar
import requests
from pydantic import BaseModel, ValidationError

from backend.app.config import settings

logger = logging.getLogger("llm_service")

T = TypeVar("T", bound=BaseModel)


class LLMServiceError(Exception):
    """Base exception for LLM operations."""
    def __init__(self, message: str, category: str = "llm_error", details: Optional[Dict[str, Any]] = None):
        super().__init__(message)
        self.category = category
        self.details = details or {}


class LLMQuotaExhaustedError(LLMServiceError):
    """Raised when API quota or rate limit is exhausted."""
    def __init__(self, message: str, retry_after: Optional[float] = None):
        super().__init__(message, category="quota_exhausted", details={"retry_after": retry_after})
        self.retry_after = retry_after


class LLMAuthenticationError(LLMServiceError):
    """Raised when the API key is missing or invalid."""
    def __init__(self, message: str):
        super().__init__(message, category="authentication_error")


class LLMTimeoutError(LLMServiceError):
    """Raised when the LLM request times out."""
    def __init__(self, message: str):
        super().__init__(message, category="timeout")


class LLMService:
    """
    Centralized, resilient Google Gemini service.
    Features:
    - Primary model execution with automatic fallback (e.g. gemini-3.8-flash -> gemini-3.5-flash)
    - Rate limit (429) & demand spike (503) retry with exponential backoff
    - Reliable structured JSON output validation using Pydantic
    - Zero API key leakage in logs or exceptions
    """

    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.primary_model = settings.GEMINI_MODEL
        self.fallback_models = [m for m in settings.GEMINI_FALLBACK_MODELS if m != self.primary_model]
        self.timeout = settings.GEMINI_TIMEOUT_SECONDS
        self.max_retries = settings.GEMINI_MAX_RETRIES
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    def _get_candidate_models(self) -> List[str]:
        return [self.primary_model] + self.fallback_models

    def _call_gemini_api(
        self,
        model: str,
        payload: Dict[str, Any],
        timeout: int
    ) -> Dict[str, Any]:
        if not self.api_key:
            raise LLMAuthenticationError("GEMINI_API_KEY is not configured in environment.")

        endpoint = f"{self.base_url}/{model}:generateContent?key={self.api_key}"
        headers = {"Content-Type": "application/json"}

        try:
            response = requests.post(endpoint, json=payload, headers=headers, timeout=timeout)
        except requests.exceptions.Timeout as e:
            raise LLMTimeoutError(f"Gemini API request timed out after {timeout}s on model '{model}'.") from e
        except requests.exceptions.RequestException as e:
            raise LLMServiceError(f"Network error calling Gemini API: {type(e).__name__}", category="network_error") from e

        status = response.status_code
        if status == 200:
            return response.json()

        try:
            err_data = response.json().get("error", {})
            err_msg = err_data.get("message", "Unknown error")
            err_status = err_data.get("status", "")
        except Exception:
            err_msg = response.text[:200]
            err_status = ""

        if status == 429 or "RESOURCE_EXHAUSTED" in err_status or "quota" in err_msg.lower():
            # Extract retry delay if available
            retry_after = 2.0
            match = re.search(r"retry in ([0-9.]+)s", err_msg)
            if match:
                try:
                    retry_after = float(match.group(1))
                except ValueError:
                    pass
            raise LLMQuotaExhaustedError(
                f"Quota/Rate-limit reached on model '{model}'. {err_msg}",
                retry_after=retry_after
            )

        if status in (401, 403):
            raise LLMAuthenticationError(f"Authentication failed for Gemini API: {err_msg}")

        if status == 404:
            raise LLMServiceError(f"Model '{model}' not found or deprecated: {err_msg}", category="model_not_found")

        if status in (500, 503):
            raise LLMServiceError(f"Gemini service temporarily unavailable ({status}) on model '{model}': {err_msg}", category="transient_server_error")

        raise LLMServiceError(f"Gemini API error ({status}) on model '{model}': {err_msg}", category="provider_error")

    def generate_text(
        self,
        prompt: str,
        system_instruction: Optional[str] = None,
        temperature: float = 0.7,
        max_output_tokens: Optional[int] = None
    ) -> str:
        """
        Generates text using the primary model, with automated model fallback and bounded backoff.
        """
        payload: Dict[str, Any] = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
            }
        }
        if max_output_tokens:
            payload["generationConfig"]["maxOutputTokens"] = max_output_tokens

        if system_instruction:
            payload["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        candidate_models = self._get_candidate_models()
        last_exception: Optional[Exception] = None

        for model_idx, model in enumerate(candidate_models):
            for attempt in range(self.max_retries):
                try:
                    logger.info(f"Invoking Gemini model '{model}' (attempt {attempt + 1}/{self.max_retries})...")
                    data = self._call_gemini_api(model, payload, timeout=self.timeout)

                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise LLMServiceError("No candidates returned from Gemini API", category="empty_response")

                    parts = candidates[0].get("content", {}).get("parts", [])
                    if not parts or "text" not in parts[0]:
                        raise LLMServiceError("Malformed response structure from Gemini", category="empty_response")

                    return parts[0]["text"].strip()

                except LLMQuotaExhaustedError as e:
                    last_exception = e
                    # If this is the primary model and quota is exhausted, fall back to next model immediately
                    if model_idx < len(candidate_models) - 1:
                        logger.warning(f"Model '{model}' quota exhausted. Falling back to '{candidate_models[model_idx + 1]}'...")
                        break
                    else:
                        delay = min(e.retry_after or (2 ** attempt), 10.0)
                        logger.warning(f"Rate limited on '{model}'. Waiting {delay:.1f}s before retry...")
                        time.sleep(delay)

                except (LLMTimeoutError, LLMServiceError) as e:
                    last_exception = e
                    if e.category in ("model_not_found", "model_unavailable"):
                        logger.warning(f"Model '{model}' unavailable ({e}). Falling back immediately...")
                        break  # Fall back to next model

                    delay = 1.5 * (attempt + 1)
                    logger.warning(f"Transient error on '{model}' ({e.category}). Retrying in {delay}s...")
                    time.sleep(delay)

        raise LLMServiceError(
            f"All candidate models failed. Last error: {str(last_exception)}",
            category="all_models_failed"
        ) from last_exception

    def generate_structured(
        self,
        prompt: str,
        response_schema: Type[T],
        system_instruction: Optional[str] = None,
        temperature: float = 0.2
    ) -> T:
        """
        Enforces structured JSON output conforming to a Pydantic schema.
        Includes automated markdown block stripping and robust JSON parsing.
        """
        schema_json = json.dumps(response_schema.model_json_schema(), indent=2)
        structural_prompt = (
            f"{prompt}\n\n"
            f"CRITICAL REQUIREMENT: You MUST respond with ONLY a valid, raw JSON object matching the following JSON Schema.\n"
            f"Do not include any surrounding markdown fences like ```json ... ```, do not include any preamble or extra text.\n"
            f"Schema:\n{schema_json}"
        )

        raw_text = self.generate_text(
            prompt=structural_prompt,
            system_instruction=system_instruction,
            temperature=temperature
        )

        cleaned = raw_text.strip()
        # Remove potential markdown fences
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        try:
            parsed_json = json.loads(cleaned)
        except json.JSONDecodeError as e:
            # Fallback regex extraction if model included conversational wrapper
            match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
            if match:
                try:
                    parsed_json = json.loads(match.group(1))
                except json.JSONDecodeError:
                    raise LLMServiceError(f"Failed to parse LLM structured output as JSON: {raw_text[:200]}", category="json_parse_error") from e
            else:
                raise LLMServiceError(f"Failed to parse LLM structured output as JSON: {raw_text[:200]}", category="json_parse_error") from e

        try:
            return response_schema.model_validate(parsed_json)
        except ValidationError as e:
            raise LLMServiceError(f"Structured output failed schema validation: {e}", category="schema_validation_error") from e


# Global singleton instance
llm_service = LLMService()
