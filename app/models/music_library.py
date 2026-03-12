"""MusicLibrary model — admin-managed music tracks stored in Supabase Storage."""

from datetime import datetime

from sqlalchemy import Column, Text, BigInteger, Float, DateTime

from app.models.base import Base


class MusicLibrary(Base):
    __tablename__ = "music_library"

    id = Column(Text, primary_key=True)
    filename = Column(Text, nullable=False)
    storage_url = Column(Text, nullable=False)
    size_bytes = Column(BigInteger, nullable=False, default=0)
    duration_seconds = Column(Float, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "filename": self.filename,
            "storage_url": self.storage_url,
            "size_bytes": self.size_bytes,
            "duration_seconds": self.duration_seconds,
            "uploaded_at": self.uploaded_at.isoformat() if self.uploaded_at else None,
        }
