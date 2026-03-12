"""API routes for Content DNA templates — pre-built presets users can copy.

Endpoints:
  GET    /api/content-dna/templates                     — list all active templates
  POST   /api/content-dna/templates/{template_id}/use   — create a DNA profile from a template
"""
import uuid
import logging
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.models.content_dna_template import ContentDNATemplate
from app.models.content_dna import ContentDNAProfile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content-dna/templates", tags=["content-dna-templates"])


@router.get("")
async def list_templates(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """List all active Content DNA templates, sorted by popularity."""
    templates = (
        db.query(ContentDNATemplate)
        .filter(ContentDNATemplate.is_active == True)
        .order_by(ContentDNATemplate.popularity_order.asc())
        .all()
    )
    return {
        "templates": [t.to_dict() for t in templates],
        "count": len(templates),
    }


@router.post("/{template_id}/use", status_code=201)
async def create_from_template(
    template_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Create a new Content DNA profile pre-filled from a template."""
    user_id = user["id"]

    template = db.query(ContentDNATemplate).filter(
        ContentDNATemplate.id == template_id,
        ContentDNATemplate.is_active == True,
    ).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # Create a new DNA profile copying all template fields
    dna = ContentDNAProfile(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=template.template_name,
        description=f"Created from template: {template.template_name}",
    )

    for field in ContentDNATemplate.COPYABLE_FIELDS:
        val = getattr(template, field, None)
        if val is not None:
            setattr(dna, field, val)

    db.add(dna)
    db.commit()
    db.refresh(dna)

    return {"profile": dna.to_dict()}
