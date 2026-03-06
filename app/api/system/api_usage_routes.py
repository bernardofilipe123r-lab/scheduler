"""API routes for API usage monitoring (admin only)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.api.auth.middleware import get_current_user, is_admin_user

router = APIRouter(prefix="/api/admin/api-usage", tags=["admin-api-usage"])


@router.get("")
async def get_api_usage(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Get API usage summary across all external services."""
    # Admin-only check
    if not is_admin_user(user):
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin access required")

    from app.services.monitoring.api_usage_tracker import APIUsageTracker

    tracker = APIUsageTracker(db)
    summary = tracker.get_usage_summary()

    return {"usage": summary}
