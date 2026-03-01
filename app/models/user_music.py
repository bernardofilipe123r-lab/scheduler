"""
User music model — per-user background music tracks for reel video generation.
"""
from datetime import datetime
from app.models.base import Base, Column, String, DateTime, Float, Text


class UserMusic(Base):
    __tablename__ = "user_music"

    id = Column(Text, primary_key=True)
    user_id = Column(Text, nullable=False, index=True)
    filename = Column(Text, nullable=False)
    storage_url = Column(Text, nullable=False)
    duration_seconds = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "filename": self.filename,
            "storage_url": self.storage_url,
            "duration_seconds": self.duration_seconds,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
