"""
OAuthState model — persistent storage for OAuth CSRF state tokens.

Replaces the in-memory _oauth_states dicts in route files,
surviving server restarts and multi-instance deployments.
"""
from datetime import datetime, timezone
from app.models.base import Base, Column, String, DateTime


class OAuthState(Base):
    """Stores OAuth state tokens for CSRF protection during OAuth flows."""
    __tablename__ = "oauth_states"

    # Primary key — the cryptographic state token itself
    state_token = Column(String(64), primary_key=True)
    platform = Column(String(20), nullable=False)       # 'instagram', 'facebook', 'youtube'
    brand_id = Column(String(100), nullable=False)
    user_id = Column(String(100), nullable=False)
    return_to = Column(String(50), nullable=True)        # 'onboarding' or None (brands page)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)  # Set when callback consumes it
