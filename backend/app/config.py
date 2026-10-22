import os
from pathlib import Path
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

# Directory paths for environment configuration (.env resolution)
BACKEND_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BACKEND_DIR.parent
ENV_FILE = ROOT_DIR / ".env" if (ROOT_DIR / ".env").exists() else (BACKEND_DIR / ".env")

class Settings(BaseSettings):
    # LLM Service (Google Gemini)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.8-flash"
    GEMINI_FALLBACK_MODELS: List[str] = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"]
    GEMINI_TIMEOUT_SECONDS: int = 25
    GEMINI_MAX_RETRIES: int = 2

    # Vector Store (Qdrant Cloud)
    QDRANT_URL: Optional[str] = None
    QDRANT_API_KEY: Optional[str] = None
    QDRANT_COLLECTION_NAME: str = "project_documents"
    EMBEDDING_DIMENSION: int = 768

    # Cloud Asset Storage (Cloudinary)
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    # Firebase Admin Configuration
    FIREBASE_PROJECT_ID: Optional[str] = "multi-agent-e8d98"
    FIREBASE_SERVICE_ACCOUNT_JSON: Optional[str] = None
    FIREBASE_SERVICE_ACCOUNT_PATH: Optional[str] = None

    # Firebase Web / Client Configuration
    FIREBASE_API_KEY: Optional[str] = None
    FIREBASE_AUTH_DOMAIN: Optional[str] = None
    FIREBASE_STORAGE_BUCKET: Optional[str] = None
    FIREBASE_MESSAGING_SENDER_ID: Optional[str] = None
    FIREBASE_APP_ID: Optional[str] = None

    # Server & Security
    FRONTEND_ORIGIN: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"
    ADMIN_BOOTSTRAP_SECRET: str = "admin-bootstrap-secret-change-me"
    BACKEND_PORT: int = 8000
    BACKEND_HOST: str = "0.0.0.0"

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE) if ENV_FILE.exists() else None,
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def is_gemini_configured(self) -> bool:
        return bool(self.GEMINI_API_KEY and self.GEMINI_API_KEY.strip())

    def is_qdrant_configured(self) -> bool:
        return bool(self.QDRANT_URL and self.QDRANT_API_KEY)

    def is_cloudinary_configured(self) -> bool:
        return bool(self.CLOUDINARY_CLOUD_NAME and self.CLOUDINARY_API_KEY and self.CLOUDINARY_API_SECRET)

    def is_firebase_configured(self) -> bool:
        return bool(
            self.FIREBASE_SERVICE_ACCOUNT_JSON 
            or (self.FIREBASE_SERVICE_ACCOUNT_PATH and os.path.exists(self.FIREBASE_SERVICE_ACCOUNT_PATH))
            or self.FIREBASE_PROJECT_ID
        )

settings = Settings()
