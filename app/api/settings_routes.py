"""
Application Settings API Routes.

Provides endpoints for managing application-wide settings such as:
- API keys (OpenAI, DeepSeek, DEAPI, etc.)
- Default values (posts per day, etc.)
- Feature flags

Settings are stored in the database and can be updated via the UI.
"""
import os
import json
import logging
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.models import AppSettings


logger = logging.getLogger(__name__)

# Create router for settings endpoints
router = APIRouter(prefix="/settings", tags=["settings"])


# Environment variable name overrides (when the DB key doesn't match the env var name)
SETTING_ENV_OVERRIDES = {
    "deapi_api_key": "DEAPI_API_KEY",
    "deapi_api_key_2": "DEAPI_API_KEY_2",
    "public_url_base": "PUBLIC_URL_BASE",
    "youtube_redirect_uri": "YOUTUBE_REDIRECT_URI",
}


# Default settings to seed if none exist
DEFAULT_SETTINGS = [
    # AI API Keys
    {
        "key": "openai_api_key",
        "value": "",
        "description": "OpenAI API key for GPT models",
        "category": "ai",
        "value_type": "string",
        "sensitive": True
    },
    {
        "key": "deepseek_api_key",
        "value": "",
        "description": "DeepSeek API key for content generation",
        "category": "ai",
        "value_type": "string",
        "sensitive": True
    },
    {
        "key": "deapi_api_key",
        "value": "",
        "description": "DEAPI key for AI image generation",
        "category": "ai",
        "value_type": "string",
        "sensitive": True
    },
    {
        "key": "deapi_api_key_2",
        "value": "",
        "description": "Secondary DEAPI key for AI image generation (fallback)",
        "category": "ai",
        "value_type": "string",
        "sensitive": True
    },
    
    # Content Generation
    {
        "key": "default_caption_count",
        "value": "5",
        "description": "Number of caption variations to generate per reel",
        "category": "content",
        "value_type": "number",
        "sensitive": False
    },
    {
        "key": "default_content_lines",
        "value": "5",
        "description": "Number of content lines per reel",
        "category": "content",
        "value_type": "number",
        "sensitive": False
    },
    {
        "key": "ai_model",
        "value": "deepseek-chat",
        "description": "AI model to use for content generation",
        "category": "ai",
        "value_type": "string",
        "sensitive": False
    },
    
    # Scheduling
    {
        "key": "default_posts_per_day",
        "value": "6",
        "description": "Default number of posts per day per brand",
        "category": "scheduling",
        "value_type": "number",
        "sensitive": False
    },
    {
        "key": "scheduling_timezone",
        "value": "Europe/London",
        "description": "Timezone for scheduling",
        "category": "scheduling",
        "value_type": "string",
        "sensitive": False
    },
    
    # Meta/Instagram
    {
        "key": "instagram_app_id",
        "value": "",
        "description": "Instagram/Meta App ID for OAuth",
        "category": "meta",
        "value_type": "string",
        "sensitive": True
    },
    {
        "key": "instagram_app_secret",
        "value": "",
        "description": "Instagram/Meta App Secret for OAuth",
        "category": "meta",
        "value_type": "string",
        "sensitive": True
    },
    
    # YouTube
    {
        "key": "youtube_client_id",
        "value": "",
        "description": "YouTube OAuth Client ID",
        "category": "youtube",
        "value_type": "string",
        "sensitive": True
    },
    {
        "key": "youtube_client_secret",
        "value": "",
        "description": "YouTube OAuth Client Secret",
        "category": "youtube",
        "value_type": "string",
        "sensitive": True
    },
    {
        "key": "youtube_redirect_uri",
        "value": "",
        "description": "YouTube OAuth Redirect URI",
        "category": "youtube",
        "value_type": "string",
        "sensitive": False
    },
    
    # Application
    {
        "key": "public_url_base",
        "value": "",
        "description": "Public URL base for serving videos/thumbnails to Meta APIs (Railway URL)",
        "category": "application",
        "value_type": "string",
        "sensitive": False
    },
]


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class UpdateSettingRequest(BaseModel):
    """Request to update a single setting."""
    value: str


class BulkUpdateSettingsRequest(BaseModel):
    """Request to update multiple settings at once."""
    settings: Dict[str, str]  # key -> value


class SettingResponse(BaseModel):
    """Response for a single setting."""
    key: str
    value: Optional[str]
    description: Optional[str]
    category: Optional[str]
    value_type: str
    sensitive: bool
    updated_at: Optional[str]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _get_env_key(key: str) -> str:
    """Get the environment variable name for a setting key."""
    return SETTING_ENV_OVERRIDES.get(key, key.upper())


def _get_env_value(key: str) -> Optional[str]:
    """Get the environment variable value for a setting key."""
    env_key = _get_env_key(key)
    return os.getenv(env_key)


def get_setting_value(db: Session, key: str, default: Any = None) -> Any:
    """
    Get a setting value, with fallback to environment variable and default.
    
    Priority:
    1. Database value (if set and not empty)
    2. Environment variable (uppercase key)
    3. Provided default value
    """
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    
    # Check database
    if setting and setting.value:
        value = setting.value
        
        # Convert based on type
        if setting.value_type == "number":
            try:
                return int(value) if "." not in value else float(value)
            except ValueError:
                pass
        elif setting.value_type == "boolean":
            return value.lower() in ("true", "1", "yes")
        elif setting.value_type == "json":
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                pass
        
        return value
    
    # Check environment variable
    env_value = _get_env_value(key)
    if env_value:
        return env_value
    
    return default


def seed_settings_if_needed(db: Session) -> int:
    """
    Seed default settings if they don't exist.
    
    Returns the number of settings seeded.
    """
    seeded = 0
    
    for setting_data in DEFAULT_SETTINGS:
        existing = db.query(AppSettings).filter(AppSettings.key == setting_data["key"]).first()
        
        if not existing:
            # Check if there's an env var to use as initial value
            env_value = _get_env_value(setting_data["key"])
            
            setting = AppSettings(
                key=setting_data["key"],
                value=env_value or setting_data.get("value", ""),
                description=setting_data.get("description"),
                category=setting_data.get("category"),
                value_type=setting_data.get("value_type", "string"),
                sensitive=setting_data.get("sensitive", False)
            )
            
            db.add(setting)
            seeded += 1
    
    if seeded > 0:
        db.commit()
        logger.info(f"Seeded {seeded} default settings")
    
    return seeded


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("")
async def list_settings(
    category: Optional[str] = None,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get all settings.
    
    Optionally filter by category (ai, content, scheduling, meta, youtube).
    Sensitive values are redacted unless include_sensitive=true.
    """
    # Seed any new settings that may have been added
    seed_settings_if_needed(db)
    
    query = db.query(AppSettings)
    
    if category:
        query = query.filter(AppSettings.category == category)
    
    settings = query.order_by(AppSettings.category, AppSettings.key).all()
    
    # Build enriched settings with source info and effective values
    enriched_settings = []
    grouped: Dict[str, List[Dict]] = {}
    
    for setting in settings:
        data = setting.to_dict(include_sensitive=True)
        
        # Determine the effective value and its source
        db_value = setting.value
        env_value = _get_env_value(setting.key)
        
        if db_value:
            data["source"] = "database"
            data["has_env_var"] = bool(env_value)
        elif env_value:
            data["source"] = "environment"
            data["value"] = env_value  # Show env var value as effective value
            data["has_env_var"] = True
        else:
            data["source"] = "default"
            data["has_env_var"] = False
        
        data["env_var_name"] = _get_env_key(setting.key)
        
        enriched_settings.append(data)
        
        cat = setting.category or "general"
        if cat not in grouped:
            grouped[cat] = []
        grouped[cat].append(data)
    
    return {
        "settings": enriched_settings,
        "grouped": grouped,
        "count": len(settings)
    }


@router.get("/categories")
async def get_categories(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Get list of all setting categories."""
    from sqlalchemy import distinct
    
    categories = db.query(distinct(AppSettings.category)).all()
    
    return {
        "categories": [c[0] for c in categories if c[0]]
    }


@router.get("/{key}")
async def get_setting(
    key: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Get a single setting by key."""
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    
    data = setting.to_dict(include_sensitive=True)
    
    # Add source info
    db_value = setting.value
    env_value = _get_env_value(setting.key)
    
    if db_value:
        data["source"] = "database"
        data["has_env_var"] = bool(env_value)
    elif env_value:
        data["source"] = "environment"
        data["value"] = env_value
        data["has_env_var"] = True
    else:
        data["source"] = "default"
        data["has_env_var"] = False
    
    data["env_var_name"] = _get_env_key(setting.key)
    
    return data


@router.put("/{key}")
async def update_setting(
    key: str,
    request: UpdateSettingRequest,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Update a single setting."""
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    
    # Validate value type
    if request.value == "***REDACTED***":
        return {
            "success": True,
            "message": f"Setting '{key}' unchanged (redacted value skipped)",
            "setting": setting.to_dict(include_sensitive=True)
        }
    
    if setting.value_type == "number":
        try:
            float(request.value) if "." in request.value else int(request.value)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Value must be a number")
    elif setting.value_type == "boolean":
        if request.value.lower() not in ("true", "false", "1", "0", "yes", "no"):
            raise HTTPException(status_code=400, detail=f"Value must be a boolean (true/false)")
    elif setting.value_type == "json":
        try:
            json.loads(request.value)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail=f"Value must be valid JSON")
    
    setting.value = request.value
    db.commit()
    db.refresh(setting)
    
    logger.info(f"Updated setting: {key}")
    
    return {
        "success": True,
        "message": f"Setting '{key}' updated",
        "setting": setting.to_dict()
    }


@router.post("/bulk")
async def bulk_update_settings(
    request: BulkUpdateSettingsRequest,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Update multiple settings at once.
    
    Useful for saving a settings form.
    """
    updated = []
    errors = []
    
    for key, value in request.settings.items():
        setting = db.query(AppSettings).filter(AppSettings.key == key).first()
        
        if not setting:
            errors.append(f"Setting '{key}' not found")
            continue
        
        # Skip if value is unchanged REDACTED placeholder
        if value == "***REDACTED***":
            continue
        
        setting.value = value
        updated.append(key)
    
    if updated:
        db.commit()
        logger.info(f"Bulk updated {len(updated)} settings")
    
    return {
        "success": len(errors) == 0,
        "updated": updated,
        "errors": errors,
        "count": len(updated)
    }


@router.post("/seed")
async def seed_settings(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """
    Seed default settings if they don't exist.
    
    This is called automatically on app startup, but can also be
    triggered manually.
    """
    count = seed_settings_if_needed(db)
    
    if count > 0:
        return {
            "success": True,
            "message": f"Seeded {count} default settings",
            "count": count
        }
    else:
        return {
            "success": True,
            "message": "All settings already exist, no seeding needed",
            "count": 0
        }


@router.delete("/{key}")
async def delete_setting(
    key: str,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Delete a setting (reset to no value).
    
    The setting row is not deleted, just the value is cleared.
    """
    setting = db.query(AppSettings).filter(AppSettings.key == key).first()
    
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    
    setting.value = None
    db.commit()
    
    return {
        "success": True,
        "message": f"Setting '{key}' cleared"
    }
