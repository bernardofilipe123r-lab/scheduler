"""
Feature flag model — persistent, DB-backed feature flags.
"""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime
from app.models.base import Base


class FeatureFlag(Base):
    """Persistent feature flag — survives redeploys."""
    __tablename__ = "feature_flags"

    flag_name = Column(String(100), primary_key=True)
    enabled = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
