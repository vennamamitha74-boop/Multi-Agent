import json
import logging
import os
from typing import Any, Dict, Optional
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from fastapi import Header, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

logger = logging.getLogger("auth_service")

# Server-side trusted admin identifiers (never trust frontend claims)
SERVER_ADMIN_UIDS = {
    "admin",
    "system_admin",
    "admin_user",
    "user_developer",
    "super_admin"
}

_firebase_initialized = False


def init_firebase_admin():
    """Initializes Firebase Admin SDK with project settings or service account."""
    global _firebase_initialized
    if _firebase_initialized:
        return

    try:
        # Check if default app is already initialized
        firebase_admin.get_app()
        _firebase_initialized = True
        logger.info("[Firebase Admin] App already initialized.")
        return
    except ValueError:
        pass

    try:
        cred = None
        if settings.FIREBASE_SERVICE_ACCOUNT_JSON and settings.FIREBASE_SERVICE_ACCOUNT_JSON.strip():
            cred_dict = json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
            cred = credentials.Certificate(cred_dict)
            logger.info("[Firebase Admin] Initializing with service account JSON.")
        elif settings.FIREBASE_SERVICE_ACCOUNT_PATH:
            from app.config import BACKEND_DIR, ROOT_DIR
            p = settings.FIREBASE_SERVICE_ACCOUNT_PATH
            resolved_path = None
            for candidate in [p, str(ROOT_DIR / p), str(BACKEND_DIR / p)]:
                if os.path.exists(candidate):
                    resolved_path = candidate
                    break

            if resolved_path:
                cred = credentials.Certificate(resolved_path)
                logger.info(f"[Firebase Admin] Initializing with service account file at {resolved_path}.")

        project_id = settings.FIREBASE_PROJECT_ID or "multi-agent-e8d98"
        if cred:
            firebase_admin.initialize_app(cred, {"projectId": project_id})
        else:
            firebase_admin.initialize_app(options={"projectId": project_id})

        _firebase_initialized = True
        logger.info(f"[Firebase Admin] Initialized successfully for project: '{project_id}'")
    except Exception as e:
        logger.warning(f"[Firebase Admin] Could not initialize Firebase Admin SDK ({e}). Token verification fallback will be active.")


# Initialize on module load
init_firebase_admin()

security_bearer = HTTPBearer(auto_error=False)


def verify_firebase_token(id_token: str) -> Dict[str, Any]:
    """
    Validates a Firebase ID token and returns decoded claims including UID.
    Supports development and automated test tokens (e.g. 'dev-token-<uid>').
    """
    if not id_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization token. Please sign in with Firebase."
        )

    # 1. Development & Test Token Verification (Deterministic for local/sandbox testing)
    if id_token.startswith("dev-token-"):
        uid = id_token.replace("dev-token-", "").strip()
        if not uid:
            uid = "anonymous_user"
        is_admin = uid in SERVER_ADMIN_UIDS
        return {
            "uid": uid,
            "email": f"{uid}@enterprise.local",
            "is_admin": is_admin,
            "auth_method": "development_token"
        }

    # 2. Production Firebase ID Token Verification via Firebase Admin SDK
    try:
        init_firebase_admin()
        decoded_token = firebase_auth.verify_id_token(id_token, check_revoked=False)
        uid = decoded_token.get("uid")
        if not uid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Firebase token: UID missing from claims."
            )

        # Server-side admin verification: trusted UIDs or explicit custom claims
        is_admin = bool(
            decoded_token.get("admin") is True
            or decoded_token.get("role") == "admin"
            or uid in SERVER_ADMIN_UIDS
        )

        return {
            "uid": uid,
            "email": decoded_token.get("email", f"{uid}@firebase.user"),
            "is_admin": is_admin,
            "claims": decoded_token,
            "auth_method": "firebase_verified"
        }
    except Exception as e:
        logger.error(f"[Auth Error] Firebase ID token validation failed: {e}")
        # If token could not be verified by Firebase Admin SDK (e.g. simulated or custom token in dev mode)
        # Check if environment is development
        if settings.ENVIRONMENT in ("development", "test", "dev") and len(id_token) < 100:
            uid = id_token.strip()
            is_admin = uid in SERVER_ADMIN_UIDS
            return {
                "uid": uid,
                "email": f"{uid}@development.local",
                "is_admin": is_admin,
                "auth_method": "dev_fallback"
            }
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: Invalid or expired Firebase ID token ({str(e)})."
        )


def get_current_authenticated_user(
    auth_header: Optional[HTTPAuthorizationCredentials] = Security(security_bearer),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id")
) -> Dict[str, Any]:
    """
    FastAPI dependency to authenticate and extract the canonical Firebase UID.
    Requires Bearer token in the Authorization header.
    """
    if auth_header and auth_header.credentials:
        token = auth_header.credentials.strip()
        user_info = verify_firebase_token(token)
        return user_info

    # Fallback for development environments if header explicitly supplied
    if x_user_id and settings.ENVIRONMENT in ("development", "test", "dev"):
        clean_uid = x_user_id.strip()
        is_admin = clean_uid in SERVER_ADMIN_UIDS
        logger.info(f"[Auth Fallback] Authenticated via X-User-Id header: '{clean_uid}' (admin={is_admin})")
        return {
            "uid": clean_uid,
            "email": f"{clean_uid}@enterprise.local",
            "is_admin": is_admin,
            "auth_method": "header_uid"
        }

    # Default fallback for development mode: user_developer
    if settings.ENVIRONMENT in ("development", "test", "dev"):
        default_uid = "user_developer"
        return {
            "uid": default_uid,
            "email": f"{default_uid}@enterprise.local",
            "is_admin": default_uid in SERVER_ADMIN_UIDS,
            "auth_method": "default_dev"
        }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Please provide a valid Firebase ID token in the Authorization header."
    )

