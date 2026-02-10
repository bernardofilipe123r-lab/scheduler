"""
Authentication API Routes.

Single-user authentication system.
- Default credentials: healveth@gmail.com / Healveth12345@
- Credentials stored in AppSettings DB table
- JWT-like tokens stored in-memory (cleared on restart)
- Password change support
- Profile editing support
"""
import os
import secrets
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models import AppSettings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Default credentials
DEFAULT_EMAIL = "healveth@gmail.com"
DEFAULT_PASSWORD = "Healveth12345@"
DEFAULT_NAME = "Healveth"

# In-memory store for valid auth tokens (cleared on restart)
_auth_tokens: Dict[str, Dict[str, Any]] = {}

# AppSettings keys for auth
AUTH_EMAIL_KEY = "auth_user_email"
AUTH_PASSWORD_HASH_KEY = "auth_user_password_hash"
AUTH_USER_NAME_KEY = "auth_user_name"


# ============================================================================
# HELPERS
# ============================================================================

def _hash_password(password: str) -> str:
    """Hash a password with SHA-256 + salt."""
    salt = "reels-automation-salt-2026"
    return hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()


def _ensure_auth_settings(db: Session):
    """Ensure auth settings exist in database with defaults."""
    # Email
    email_setting = db.query(AppSettings).filter(AppSettings.key == AUTH_EMAIL_KEY).first()
    if not email_setting:
        email_setting = AppSettings(
            key=AUTH_EMAIL_KEY,
            value=DEFAULT_EMAIL,
            description="Login email address",
            category="auth",
            value_type="string",
            sensitive=False
        )
        db.add(email_setting)
    
    # Password hash
    pw_setting = db.query(AppSettings).filter(AppSettings.key == AUTH_PASSWORD_HASH_KEY).first()
    if not pw_setting:
        pw_setting = AppSettings(
            key=AUTH_PASSWORD_HASH_KEY,
            value=_hash_password(DEFAULT_PASSWORD),
            description="Hashed login password",
            category="auth",
            value_type="string",
            sensitive=True
        )
        db.add(pw_setting)
    
    # User name
    name_setting = db.query(AppSettings).filter(AppSettings.key == AUTH_USER_NAME_KEY).first()
    if not name_setting:
        name_setting = AppSettings(
            key=AUTH_USER_NAME_KEY,
            value=DEFAULT_NAME,
            description="User display name",
            category="auth",
            value_type="string",
            sensitive=False
        )
        db.add(name_setting)
    
    db.commit()


def _get_auth_value(db: Session, key: str) -> Optional[str]:
    """Get an auth setting value from DB."""
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    return setting.value if setting else None


def _set_auth_value(db: Session, key: str, value: str):
    """Set an auth setting value in DB."""
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = AppSettings(key=key, value=value, category="auth", value_type="string")
        db.add(setting)
    db.commit()


def verify_auth_token(
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """
    Dependency to verify auth token on protected endpoints.
    Reads the Authorization header: 'Bearer <token>'
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.replace("Bearer ", "")
    
    if token not in _auth_tokens:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    token_data = _auth_tokens[token]
    
    # Check expiry (30 days)
    if datetime.utcnow() > token_data.get("expires_at", datetime.utcnow()):
        del _auth_tokens[token]
        raise HTTPException(status_code=401, detail="Token expired")
    
    return token_data


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None


class VerifyLogsPasswordRequest(BaseModel):
    password: str


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/login")
async def login(request: LoginRequest, db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Authenticate user and return a session token."""
    _ensure_auth_settings(db)
    
    stored_email = _get_auth_value(db, AUTH_EMAIL_KEY) or DEFAULT_EMAIL
    stored_pw_hash = _get_auth_value(db, AUTH_PASSWORD_HASH_KEY) or _hash_password(DEFAULT_PASSWORD)
    
    # Validate credentials
    if request.email.lower() != stored_email.lower():
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if _hash_password(request.password) != stored_pw_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Generate token (valid for 30 days)
    token = secrets.token_urlsafe(48)
    user_name = _get_auth_value(db, AUTH_USER_NAME_KEY) or DEFAULT_NAME
    
    _auth_tokens[token] = {
        "email": stored_email,
        "name": user_name,
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": datetime.utcnow() + timedelta(days=30),
    }
    
    return {
        "success": True,
        "token": token,
        "user": {
            "email": stored_email,
            "name": user_name,
        }
    }


@router.get("/me")
async def get_me(
    user: Dict = Depends(verify_auth_token),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Get current user info."""
    _ensure_auth_settings(db)
    
    return {
        "email": _get_auth_value(db, AUTH_EMAIL_KEY) or user.get("email"),
        "name": _get_auth_value(db, AUTH_USER_NAME_KEY) or user.get("name"),
    }


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    user: Dict = Depends(verify_auth_token),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Change the user password."""
    _ensure_auth_settings(db)
    
    stored_pw_hash = _get_auth_value(db, AUTH_PASSWORD_HASH_KEY) or _hash_password(DEFAULT_PASSWORD)
    
    # Verify current password
    if _hash_password(request.current_password) != stored_pw_hash:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Validate new password
    if len(request.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    
    # Update password
    _set_auth_value(db, AUTH_PASSWORD_HASH_KEY, _hash_password(request.new_password))
    
    logger.info("User password changed successfully")
    
    return {"success": True, "message": "Password changed successfully"}


@router.put("/profile")
async def update_profile(
    request: UpdateProfileRequest,
    user: Dict = Depends(verify_auth_token),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Update user profile (name and/or email)."""
    _ensure_auth_settings(db)
    
    if request.name is not None:
        _set_auth_value(db, AUTH_USER_NAME_KEY, request.name)
    
    if request.email is not None:
        _set_auth_value(db, AUTH_EMAIL_KEY, request.email)
    
    # Update all active tokens with new info
    new_email = _get_auth_value(db, AUTH_EMAIL_KEY)
    new_name = _get_auth_value(db, AUTH_USER_NAME_KEY)
    
    for token_data in _auth_tokens.values():
        token_data["email"] = new_email
        token_data["name"] = new_name
    
    logger.info("User profile updated")
    
    return {
        "success": True,
        "user": {
            "email": new_email,
            "name": new_name,
        }
    }


@router.post("/logout")
async def logout(
    authorization: Optional[str] = Header(None),
) -> Dict[str, Any]:
    """Logout and invalidate the token."""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        _auth_tokens.pop(token, None)
    
    return {"success": True, "message": "Logged out"}


# ============================================================================
# LOGS PASSWORD VERIFICATION (separate from main auth)
# ============================================================================

LOGS_DEFAULT_PASSWORD = os.getenv("LOGS_PASSWORD", "logs12345@")

@router.post("/verify-logs")
async def verify_logs_password(request: VerifyLogsPasswordRequest) -> Dict[str, Any]:
    """Verify the logs page password (separate from main auth)."""
    expected = os.getenv("LOGS_PASSWORD", LOGS_DEFAULT_PASSWORD)
    
    if request.password != expected:
        raise HTTPException(status_code=401, detail="Invalid logs password")
    
    # Generate a logs-specific token
    token = secrets.token_urlsafe(32)
    _auth_tokens[f"logs_{token}"] = {
        "type": "logs",
        "created_at": datetime.utcnow().isoformat(),
        "expires_at": datetime.utcnow() + timedelta(days=7),
    }
    
    return {"success": True, "token": token}
