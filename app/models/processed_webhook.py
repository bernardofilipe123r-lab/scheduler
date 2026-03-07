"""
Processed webhook model — tracks Stripe event IDs for idempotent webhook handling.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class ProcessedWebhook(Base):
    """Tracks processed Stripe webhook events to prevent duplicate handling."""
    __tablename__ = "processed_webhooks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(String(255), unique=True, nullable=False, index=True)
    event_type = Column(String(100), nullable=False)
    processed_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
