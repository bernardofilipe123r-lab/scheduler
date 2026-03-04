"""
Trending music model — TikTok trending tracks fetched via RapidAPI.
"""
from datetime import datetime
from app.models.base import Base, Column, String, DateTime, Float, Text, Integer


class TrendingMusic(Base):
    __tablename__ = "trending_music"

    id = Column(Text, primary_key=True)
    tiktok_id = Column(Text, nullable=True)
    title = Column(Text, nullable=False)
    author = Column(Text, nullable=True)
    play_url = Column(Text, nullable=False)
    cover_url = Column(Text, nullable=True)
    duration_seconds = Column(Float, nullable=True)
    rank = Column(Integer, nullable=True)
    batch_id = Column(Text, nullable=False)
    fetched_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id": self.id,
            "tiktok_id": self.tiktok_id,
            "title": self.title,
            "author": self.author,
            "play_url": self.play_url,
            "cover_url": self.cover_url,
            "duration_seconds": self.duration_seconds,
            "rank": self.rank,
            "batch_id": self.batch_id,
            "fetched_at": self.fetched_at.isoformat() if self.fetched_at else None,
        }


class TrendingMusicFetch(Base):
    __tablename__ = "trending_music_fetches"

    id = Column(Text, primary_key=True)
    fetched_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    track_count = Column(Integer, nullable=False, default=0)
    source = Column(Text, default="tiktok_rapidapi")
