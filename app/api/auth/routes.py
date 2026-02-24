"""Authentication routes — backed by Supabase Auth."""
import os
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from app.api.auth.middleware import get_current_user, get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ============================================================================
# REGISTRATION — uses Supabase Admin API (service role) to bypass email limits
# ============================================================================

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


@router.post("/register")
async def register(request: RegisterRequest):
    """Create a new user via Supabase Admin API with auto-confirm (no email sent)."""
    sb = get_supabase_client()
    try:
        result = sb.auth.admin.create_user({
            "email": request.email,
            "password": request.password,
            "email_confirm": True,
            "user_metadata": {"name": request.name},
        })
        user = result.user
        return {
            "status": "success",
            "user": {
                "id": user.id,
                "email": user.email,
                "name": request.name,
            },
        }
    except Exception as e:
        msg = str(e)
        logger.warning("Registration failed for %s: %s", request.email, msg)
        if "already been registered" in msg or "already exists" in msg or "unique" in msg.lower():
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        raise HTTPException(status_code=400, detail=msg)


@router.get("/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return {
        "status": "authenticated",
        "user": {
            "email": user["email"],
            "name": user.get("name", ""),
            "id": user["id"],
        }
    }


# ============================================================================
# LOGS PASSWORD VERIFICATION (separate from Supabase Auth)
# ============================================================================

LOGS_PASSWORD = os.environ.get("LOGS_PASSWORD")


class VerifyLogsPasswordRequest(BaseModel):
    password: str


@router.post("/verify-logs")
async def verify_logs_password(request: VerifyLogsPasswordRequest):
    """Verify the logs dashboard password."""
    if not LOGS_PASSWORD:
        raise HTTPException(status_code=503, detail="Logs password not configured")
    if request.password != LOGS_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid logs password")
    return {"status": "ok"}
