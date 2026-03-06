"""StoryPool model — TEXT-VIDEO story dedup and caching."""

from sqlalchemy import Column, String, Text, Index
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP, JSONB
from app.models.base import Base


class StoryPool(Base):
    __tablename__ = "text_video_story_pool"

    id = Column(UUID(as_uuid=False), primary_key=True, server_default="gen_random_uuid()")
    user_id = Column(String(100), nullable=False)
    fingerprint = Column(String(64), nullable=False)
    headline = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    source_url = Column(Text, nullable=True)
    source_name = Column(String(200), nullable=True)
    published_at = Column(TIMESTAMP(timezone=True), nullable=True)
    story_category = Column(String(50), nullable=True)
    niche = Column(String(100), nullable=True)
    polished_data = Column(JSONB, nullable=True)
    status = Column(String(20), default="available")
    used_at = Column(TIMESTAMP(timezone=True), nullable=True)
    used_by_job_id = Column(String(20), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), server_default="now()")

    __table_args__ = (
        Index("ix_story_pool_user_status", "user_id", "status"),
        Index("ix_story_pool_niche", "user_id", "niche", "status"),
        {"extend_existing": True},
    )

    def to_dict(self):
        return {
            "id": str(self.id) if self.id else None,
            "user_id": self.user_id,
            "fingerprint": self.fingerprint,
            "headline": self.headline,
            "summary": self.summary,
            "source_url": self.source_url,
            "source_name": self.source_name,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "story_category": self.story_category,
            "niche": self.niche,
            "status": self.status,
            "used_at": self.used_at.isoformat() if self.used_at else None,
            "used_by_job_id": self.used_by_job_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
