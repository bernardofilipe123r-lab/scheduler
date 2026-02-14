"""Template management API — list, upload, delete brand templates in Supabase Storage."""

import logging
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File

from app.api.auth.middleware import get_current_user, get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/brands/{brand_id}/templates", tags=["templates"])

BUCKET = "brand-assets"
ALLOWED_TYPES = {"thumbnail_template", "content_template"}


def _storage():
    return get_supabase_client().storage


# ── LIST templates ──────────────────────────────────────────────────────────

@router.get("")
async def list_templates(
    brand_id: str,
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """List all templates for a brand from Supabase Storage."""
    prefix = f"templates/{brand_id}/light mode"
    try:
        files = _storage().from_(BUCKET).list(prefix)
    except Exception as exc:
        logger.error("Storage list failed for %s: %s", prefix, exc)
        raise HTTPException(status_code=502, detail="Could not list templates from storage")

    templates = []
    for f in files:
        name = f.get("name", "")
        if not name.endswith(".png"):
            continue
        storage_path = f"{prefix}/{name}"
        public_url = _storage().from_(BUCKET).get_public_url(storage_path)
        templates.append({
            "name": name,
            "template_type": name.replace(".png", ""),
            "storage_path": storage_path,
            "public_url": public_url,
            "size": f.get("metadata", {}).get("size"),
        })

    return {"brand_id": brand_id, "templates": templates, "count": len(templates)}


# ── UPLOAD a template ───────────────────────────────────────────────────────

@router.post("/{template_type}")
async def upload_template(
    brand_id: str,
    template_type: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Upload (or replace) a template image for a brand."""
    if template_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"template_type must be one of {ALLOWED_TYPES}",
        )

    storage_path = f"templates/{brand_id}/light mode/{template_type}.png"
    data = await file.read()

    try:
        _storage().from_(BUCKET).upload(
            storage_path,
            data,
            file_options={"content-type": "image/png", "upsert": "true"},
        )
    except Exception as exc:
        logger.error("Upload failed for %s: %s", storage_path, exc)
        raise HTTPException(status_code=502, detail="Could not upload template to storage")

    # Invalidate local cache so next render picks up the new file
    from app.services.media.template_loader import CACHE_DIR
    cache_path = CACHE_DIR / brand_id / f"{template_type}.png"
    if cache_path.exists():
        cache_path.unlink()

    public_url = _storage().from_(BUCKET).get_public_url(storage_path)
    return {
        "success": True,
        "storage_path": storage_path,
        "public_url": public_url,
    }


# ── DELETE a template ───────────────────────────────────────────────────────

@router.delete("/{template_type}")
async def delete_template(
    brand_id: str,
    template_type: str,
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Delete a template from Supabase Storage."""
    if template_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"template_type must be one of {ALLOWED_TYPES}",
        )

    storage_path = f"templates/{brand_id}/light mode/{template_type}.png"

    try:
        _storage().from_(BUCKET).remove([storage_path])
    except Exception as exc:
        logger.error("Delete failed for %s: %s", storage_path, exc)
        raise HTTPException(status_code=502, detail="Could not delete template from storage")

    # Also remove from local cache
    from app.services.media.template_loader import CACHE_DIR
    cache_path = CACHE_DIR / brand_id / f"{template_type}.png"
    if cache_path.exists():
        cache_path.unlink()

    return {"success": True, "deleted": storage_path}
