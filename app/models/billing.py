"""
Brand subscription model — tracks per-brand Stripe subscriptions.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


def _utc_now():
    return datetime.now(timezone.utc)


class BrandSubscription(Base):
    """One subscription per user+brand, linked to a Stripe Subscription."""
    __tablename__ = "brand_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(100), ForeignKey("user_profiles.user_id", ondelete="CASCADE"), nullable=False, index=True)
    brand_id = Column(String(50), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    stripe_subscription_id = Column(String(255), unique=True, nullable=True)
    stripe_price_id = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default="incomplete")
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end = Column(Boolean, nullable=False, default=False)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_utc_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_utc_now)
