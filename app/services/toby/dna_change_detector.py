"""DNA Change Detector — reset Toby learning when Content DNA identity changes.

When a user fundamentally changes their Content DNA (e.g. niche, tone, topics),
the existing Thompson Sampling strategy scores become invalid because they were
learned for a different content identity. This module detects such changes and
resets learning scoped to the affected DNA.
"""
import hashlib
import json
import logging
from sqlalchemy.orm import Session

from app.models.content_dna import ContentDNAProfile

logger = logging.getLogger(__name__)

# Fields that define the editorial identity of a DNA profile.
# Changes to these fields invalidate learned strategy scores.
_IDENTITY_FIELDS = (
    "niche_name",
    "niche_description",
    "content_tone",
    "topic_categories",
    "topic_keywords",
    "topic_avoid",
    "content_philosophy",
    "brand_personality",
    "brand_focus_areas",
)


def _compute_fingerprint(dna: ContentDNAProfile) -> str:
    """Compute a stable hash of the DNA's identity fields."""
    parts = []
    for field in _IDENTITY_FIELDS:
        val = getattr(dna, field, None)
        if val is None:
            parts.append("")
        elif isinstance(val, (list, dict)):
            parts.append(json.dumps(val, sort_keys=True, default=str))
        else:
            parts.append(str(val).strip().lower())
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def snapshot_fingerprint(dna: ContentDNAProfile) -> str:
    """Take a fingerprint snapshot BEFORE applying updates."""
    return _compute_fingerprint(dna)


def check_and_reset_if_changed(
    db: Session,
    dna: ContentDNAProfile,
    old_fingerprint: str,
    user_id: str,
) -> bool:
    """Compare current DNA state against the pre-update fingerprint.

    If identity fields changed, reset strategy scores scoped to this DNA ID
    and log the event. Returns True if a reset was triggered.
    """
    new_fingerprint = _compute_fingerprint(dna)
    if new_fingerprint == old_fingerprint:
        return False

    dna_id = dna.id
    logger.warning(
        "Content DNA identity changed for %s (fingerprint %s → %s). Resetting strategy scores.",
        dna_id, old_fingerprint[:8], new_fingerprint[:8],
    )

    _reset_learning_for_dna(db, user_id, dna_id)
    return True


def _reset_learning_for_dna(db: Session, user_id: str, content_dna_id: str):
    """Reset Thompson Sampling strategy scores scoped to a specific DNA ID."""
    from app.models.toby import TobyStrategyScore, TobyActivityLog
    from datetime import datetime, timezone

    deleted = (
        db.query(TobyStrategyScore)
        .filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.content_dna_id == content_dna_id,
        )
        .delete()
    )

    db.add(TobyActivityLog(
        user_id=user_id,
        action_type="dna_learning_reset",
        description=(
            f"Content DNA identity changed — reset {deleted} strategy scores "
            f"for DNA {content_dna_id[:8]}. Toby will re-learn strategies for "
            f"this DNA from scratch."
        ),
        level="warning",
        created_at=datetime.now(timezone.utc),
    ))
    db.flush()

    logger.info("Reset %d strategy scores for DNA %s (user %s)", deleted, content_dna_id[:8], user_id[:8])
