"""Supabase Auth middleware for FastAPI."""

import os
import logging
import asyncio
import jwt as pyjwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client
from app.services.logging.service import set_user_id as set_logging_user_id

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

# Cached Supabase client — avoid creating a new client per request
_supabase_client: Client | None = None

# Cached JWKS client for ES256 token validation
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient | None:
    """Get or create a cached JWKS client for the Supabase project."""
    global _jwks_client
    if _jwks_client is not None:
        return _jwks_client
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if not supabase_url:
        return None
    jwks_url = f"{supabase_url}/auth/v1/.well-known/jwks.json"
    _jwks_client = PyJWKClient(jwks_url, cache_keys=True, lifespan=3600, timeout=5)
    return _jwks_client


def get_supabase_client() -> Client:
    """Get or create a cached Supabase client with service role key."""
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    _supabase_client = create_client(url, key)
    return _supabase_client


def _extract_user(payload: dict) -> dict:
    """Extract user info from a decoded JWT payload."""
    app_metadata = payload.get("app_metadata") or {}
    user_metadata = payload.get("user_metadata") or {}

    roles = [
        payload.get("role"),
        payload.get("user_role"),
        app_metadata.get("role"),
        user_metadata.get("role"),
    ]
    normalized_roles = {str(r).strip().lower() for r in roles if r}

    is_admin = (
        "admin" in normalized_roles
        or bool(app_metadata.get("is_admin"))
        or bool(user_metadata.get("is_admin"))
    )

    role = next((str(r) for r in roles if r), "authenticated")

    return {
        "id": payload.get("sub", ""),
        "email": payload.get("email", ""),
        "role": role,
        "is_admin": is_admin,
    }


def is_admin_user(user: dict) -> bool:
    """Return True when the current authenticated user has admin privileges."""
    if not user:
        return False
    if user.get("is_admin") is True:
        return True
    role = str(user.get("role", "")).strip().lower()
    return role == "admin"


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Verify Supabase JWT and return user data.
    
    Tries validation in order:
    1. JWKS (ES256) — fetches public key from Supabase JWKS endpoint
    2. HS256 with SUPABASE_JWT_SECRET (legacy fallback)
    3. Supabase API call (slowest, but always works)
    
    Returns dict with at minimum: { "id": str, "email": str }
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = credentials.credentials

    # --- 1. Try JWKS-based validation (ES256) ---
    jwks_client = _get_jwks_client()
    if jwks_client:
        try:
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = pyjwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256"],
                audience="authenticated",
            )
            user = _extract_user(payload)
            if user.get("id"):
                set_logging_user_id(user["id"])
            return user
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except (pyjwt.InvalidTokenError, Exception) as e:
            logger.debug("JWKS validation failed: %s", e)

    # --- 2. Try HS256 with shared secret (legacy) ---
    if SUPABASE_JWT_SECRET:
        try:
            payload = pyjwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
            user = _extract_user(payload)
            if user.get("id"):
                set_logging_user_id(user["id"])
            return user
        except pyjwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Token expired")
        except pyjwt.InvalidTokenError as e:
            logger.debug("HS256 validation failed: %s", e)

    # --- 3. Fallback: call Supabase API (with 5s timeout) ---
    try:
        supabase = get_supabase_client()
        response = await asyncio.wait_for(
            asyncio.to_thread(supabase.auth.get_user, token),
            timeout=5.0,
        )
        user = response.user
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        app_metadata = user.app_metadata or {}
        user_metadata = user.user_metadata or {}
        roles = [
            user.role,
            app_metadata.get("role"),
            user_metadata.get("role"),
        ]
        normalized_roles = {str(r).strip().lower() for r in roles if r}
        extracted_user = {
            "id": user.id,
            "email": user.email or "",
            "role": next((str(r) for r in roles if r), "authenticated"),
            "is_admin": (
                "admin" in normalized_roles
                or bool(app_metadata.get("is_admin"))
                or bool(user_metadata.get("is_admin"))
            ),
        }
        if extracted_user.get("id"):
            set_logging_user_id(extracted_user["id"])
        return extracted_user
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Auth service timeout")
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication failed")


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict | None:
    """Like get_current_user but returns None for unauthenticated requests."""
    if not credentials:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
