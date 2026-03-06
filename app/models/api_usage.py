"""APIUsageLog model — tracks external API calls for admin dashboard monitoring."""

from sqlalchemy import Column, String, BigInteger
from sqlalchemy.dialects.postgresql import TIMESTAMP
from app.models.base import Base
from datetime import datetime


class APIUsageLog(Base):
    __tablename__ = "api_usage_log"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    api_name = Column(String(50), nullable=False)
    endpoint = Column(String(200), default="")
    called_at = Column(TIMESTAMP(timezone=True), nullable=False, default=datetime.utcnow)
