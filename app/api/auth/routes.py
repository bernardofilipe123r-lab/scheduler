"""Authentication routes — backed by Supabase Auth."""
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.api.auth.middleware import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
