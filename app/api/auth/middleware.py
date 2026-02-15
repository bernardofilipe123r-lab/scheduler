"""Supabase Auth middleware for FastAPI."""

import os
import logging
import jwt as pyjwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from supabase import create_client, Client

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

# Cached Supabase client — avoid creating a new client per request
_supabase_client: Client | None = None


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


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Verify Supabase JWT and return user data.
    
    Returns dict with at minimum: { "id": str, "email": str }
    """
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = credentials.credentials
    try:
        # Validate JWT locally — no network call needed
        if SUPABASE_JWT_SECRET:
            payload = pyjwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
            return {
                "id": payload.get("sub", ""),
                "email": payload.get("email", ""),
                "role": payload.get("role", "authenticated"),
            }
        else:
            # Fallback: call Supabase API (slow, but works without JWT secret)
            supabase = get_supabase_client()
            response = supabase.auth.get_user(token)
            user = response.user
            if not user:
                raise HTTPException(status_code=401, detail="Invalid token")
            return {
                "id": user.id,
                "email": user.email or "",
                "role": user.role or "authenticated",
            }
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
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
