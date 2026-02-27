"""
Persistent OAuth state store backed by PostgreSQL.

Replaces the in-memory _oauth_states dicts in ig_oauth_routes / fb_oauth_routes / youtube routes.
"""
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.oauth_state import OAuthState

logger = logging.getLogger(__name__)


class OAuthStateStore:
    """DB-backed store for OAuth CSRF state tokens."""

    @staticmethod
    def create(db: Session, platform: str, brand_id: str, user_id: str, return_to: Optional[str] = None, code_verifier: Optional[str] = None) -> str:
        """Generate a cryptographic state token, persist it, and return the token string."""
        token = secrets.token_urlsafe(32)
        state = OAuthState(
            state_token=token,
            platform=platform,
            brand_id=brand_id,
            user_id=user_id,
            return_to=return_to,
            code_verifier=code_verifier,
        )
        db.add(state)
        db.commit()

        # Opportunistic cleanup of expired rows (older than 1 hour)
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
            db.query(OAuthState).filter(OAuthState.created_at < cutoff).delete(synchronize_session=False)
            db.commit()
        except Exception:
            db.rollback()

        return token

    @staticmethod
    def validate(db: Session, token: str, platform: str) -> Optional[dict]:
        """
        Validate and consume a state token.

        Returns ``None`` if the token is invalid, expired (>15 min), or already used.
        Otherwise returns ``{"brand_id", "user_id", "return_to"}``.
        """
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
        state: Optional[OAuthState] = db.query(OAuthState).filter(
            OAuthState.state_token == token,
            OAuthState.platform == platform,
            OAuthState.used_at.is_(None),
            OAuthState.created_at > cutoff,
        ).first()

        if not state:
            return None

        # Mark as consumed — prevents replay attacks
        state.used_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "brand_id": state.brand_id,
            "user_id": state.user_id,
            "return_to": state.return_to,
            "code_verifier": state.code_verifier,
        }
