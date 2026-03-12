"""API routes for Content DNA profile management.

Content DNA profiles define editorial identities — Toby learns per DNA, not per brand.
Brands point to a DNA via brands.content_dna_id.

Endpoints:
  GET    /api/content-dna           — list all DNA profiles for the user
  POST   /api/content-dna           — create a new DNA profile
  GET    /api/content-dna/{dna_id}  — get a specific DNA profile
  PUT    /api/content-dna/{dna_id}  — update a DNA profile
  DELETE /api/content-dna/{dna_id}  — delete a DNA profile (if no brands attached)
  POST   /api/content-dna/{dna_id}/assign-brand  — assign a brand to this DNA
"""
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.models.content_dna import ContentDNAProfile
from app.models.brands import Brand
from app.services.content.content_dna_service import get_content_dna_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content-dna", tags=["content-dna"])


# --- Pydantic schemas ---

class ContentDNACreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    niche_name: Optional[str] = Field(None, max_length=100)
    niche_description: Optional[str] = None
    content_brief: Optional[str] = None
    target_audience: Optional[str] = Field(None, max_length=255)
    audience_description: Optional[str] = None
    content_tone: Optional[list] = None
    tone_avoid: Optional[list] = None
    topic_categories: Optional[list] = None
    topic_keywords: Optional[list] = None
    topic_avoid: Optional[list] = None
    content_philosophy: Optional[str] = None
    hook_themes: Optional[list] = None
    reel_examples: Optional[list] = None
    post_examples: Optional[list] = None
    image_style_description: Optional[str] = None
    image_palette_keywords: Optional[list] = None
    brand_personality: Optional[str] = None
    brand_focus_areas: Optional[list] = None
    parent_brand_name: Optional[str] = Field(None, max_length=100)
    cta_options: Optional[list] = None
    hashtags: Optional[list] = None
    competitor_accounts: Optional[list] = None
    discovery_hashtags: Optional[list] = None
    citation_style: Optional[str] = Field(None, max_length=50)
    citation_source_types: Optional[list] = None
    yt_title_examples: Optional[list] = None
    yt_title_bad_examples: Optional[list] = None
    carousel_cta_topic: Optional[str] = Field(None, max_length=255)
    carousel_cta_options: Optional[list] = None
    carousel_cover_overlay_opacity: Optional[int] = Field(None, ge=0, le=100)
    carousel_content_overlay_opacity: Optional[int] = Field(None, ge=0, le=100)
    follow_section_text: Optional[str] = None
    save_section_text: Optional[str] = None
    disclaimer_text: Optional[str] = None
    format_b_reel_examples: Optional[list] = None
    format_b_story_niches: Optional[list] = None
    format_b_story_tone: Optional[str] = None
    format_b_preferred_categories: Optional[list] = None
    threads_format_weights: Optional[dict] = None


class ContentDNAUpdate(ContentDNACreate):
    name: Optional[str] = Field(None, max_length=100)


class BrandAssignment(BaseModel):
    brand_id: str


# --- Helpers ---

def _dna_to_dict(dna: ContentDNAProfile) -> dict:
    """Convert a ContentDNAProfile row to a JSON-serializable dict."""
    return dna.to_dict()


def _verify_dna_ownership(db: Session, dna_id: str, user_id: str) -> ContentDNAProfile:
    """Fetch a DNA profile and verify the user owns it."""
    dna = db.query(ContentDNAProfile).filter(
        ContentDNAProfile.id == dna_id,
        ContentDNAProfile.user_id == user_id,
    ).first()
    if not dna:
        raise HTTPException(status_code=404, detail="Content DNA profile not found")
    return dna


# --- Routes ---

@router.get("")
async def list_dna_profiles(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """List all Content DNA profiles for the current user."""
    user_id = user["id"]

    profiles = (
        db.query(ContentDNAProfile)
        .filter(ContentDNAProfile.user_id == user_id)
        .order_by(ContentDNAProfile.created_at.asc())
        .all()
    )

    # Include brand count per DNA
    result = []
    for p in profiles:
        data = _dna_to_dict(p)
        brand_count = db.query(Brand).filter(
            Brand.content_dna_id == p.id,
            Brand.user_id == user_id,
        ).count()
        data["brand_count"] = brand_count
        result.append(data)

    return {"profiles": result, "count": len(result)}


@router.post("", status_code=201)
async def create_dna_profile(
    body: ContentDNACreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Create a new Content DNA profile."""
    user_id = user["id"]

    dna = ContentDNAProfile(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=body.name,
        description=body.description,
    )

    # Apply all optional fields from the request
    field_names = [f for f in ContentDNACreate.__fields__ if f not in ("name", "description")]
    for field_name in field_names:
        val = getattr(body, field_name, None)
        if val is not None:
            setattr(dna, field_name, val)

    db.add(dna)
    db.commit()
    db.refresh(dna)

    return {"profile": _dna_to_dict(dna)}


@router.get("/{dna_id}")
async def get_dna_profile(
    dna_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Get a specific Content DNA profile with its assigned brands."""
    user_id = user["id"]
    dna = _verify_dna_ownership(db, dna_id, user_id)

    brands = db.query(Brand).filter(
        Brand.content_dna_id == dna_id,
        Brand.user_id == user_id,
    ).all()

    data = _dna_to_dict(dna)
    data["brands"] = [{"id": b.id, "name": b.display_name, "active": b.active} for b in brands]
    return {"profile": data}


@router.put("/{dna_id}")
async def update_dna_profile(
    dna_id: str,
    body: ContentDNAUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Update a Content DNA profile."""
    user_id = user["id"]
    dna = _verify_dna_ownership(db, dna_id, user_id)

    update_data = body.dict(exclude_unset=True)
    for field_name, val in update_data.items():
        if hasattr(dna, field_name):
            setattr(dna, field_name, val)

    dna.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(dna)

    # Invalidate service cache
    get_content_dna_service().invalidate_cache(user_id=user_id, content_dna_id=dna_id)

    return {"profile": _dna_to_dict(dna)}


@router.delete("/{dna_id}")
async def delete_dna_profile(
    dna_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Delete a Content DNA profile. Fails if brands are still attached."""
    user_id = user["id"]
    dna = _verify_dna_ownership(db, dna_id, user_id)

    # Check for attached brands
    attached = db.query(Brand).filter(
        Brand.content_dna_id == dna_id,
        Brand.user_id == user_id,
    ).count()
    if attached > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete DNA profile — {attached} brand(s) still assigned. Reassign them first.",
        )

    db.delete(dna)
    db.commit()

    # Invalidate service cache
    get_content_dna_service().invalidate_cache(user_id=user_id)

    return {"deleted": True, "id": dna_id}


@router.post("/{dna_id}/assign-brand")
async def assign_brand_to_dna(
    dna_id: str,
    body: BrandAssignment,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Assign a brand to a Content DNA profile."""
    user_id = user["id"]
    dna = _verify_dna_ownership(db, dna_id, user_id)

    brand = db.query(Brand).filter(
        Brand.id == body.brand_id,
        Brand.user_id == user_id,
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    old_dna_id = brand.content_dna_id
    brand.content_dna_id = dna_id
    db.commit()

    # Invalidate cache for old and new DNA
    svc = get_content_dna_service()
    if old_dna_id:
        svc.invalidate_cache(user_id=user_id, content_dna_id=old_dna_id)
    svc.invalidate_cache(user_id=user_id, content_dna_id=dna_id)

    return {
        "brand_id": brand.id,
        "brand_name": brand.display_name,
        "content_dna_id": dna_id,
        "content_dna_name": dna.name,
    }


@router.post("/{dna_id}/unassign-brand")
async def unassign_brand_from_dna(
    dna_id: str,
    body: BrandAssignment,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Remove a brand's DNA assignment (set content_dna_id to NULL)."""
    user_id = user["id"]
    _verify_dna_ownership(db, dna_id, user_id)

    brand = db.query(Brand).filter(
        Brand.id == body.brand_id,
        Brand.user_id == user_id,
        Brand.content_dna_id == dna_id,
    ).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found or not assigned to this DNA")

    brand.content_dna_id = None
    db.commit()

    get_content_dna_service().invalidate_cache(user_id=user_id, content_dna_id=dna_id)

    return {"brand_id": brand.id, "unassigned": True}
