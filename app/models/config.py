"""
Configuration models: MaestroConfig, AppSettings.
"""
from datetime import datetime
from app.models.base import Base, Column, String, DateTime, Text, Boolean


class MaestroConfig(Base):
    """
    Persistent Maestro state — survives Railway redeploys.

    Stores key-value pairs: is_paused, last_daily_run, etc.
    """
    __tablename__ = "maestro_config"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False, default="")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @staticmethod
    def get(db, key: str, default: str = "") -> str:
        row = db.query(MaestroConfig).filter_by(key=key).first()
        return row.value if row else default

    @staticmethod
    def set(db, key: str, value: str):
        row = db.query(MaestroConfig).filter_by(key=key).first()
        if row:
            row.value = value
            row.updated_at = datetime.utcnow()
        else:
            db.add(MaestroConfig(key=key, value=value, updated_at=datetime.utcnow()))
        db.commit()


class AppSettings(Base):
    """
    Application-wide settings that can be updated via the UI.
    
    This allows users to configure things like API keys, default values,
    etc. without needing to modify .env files or code.
    """
    __tablename__ = "app_settings"
    
    # Setting key (e.g., 'openai_api_key', 'default_posts_per_day')
    key = Column(String(100), primary_key=True)
    
    # Setting value (stored as string, parsed by application)
    value = Column(Text, nullable=True)
    
    # Metadata
    description = Column(Text, nullable=True)  # Human-readable description
    category = Column(String(50), nullable=True)  # For grouping in UI (e.g., 'ai', 'scheduling', 'api')
    value_type = Column(String(20), default="string")  # string, number, boolean, json
    sensitive = Column(Boolean, default=False)  # If True, value is hidden in logs/responses
    
    # Timestamps
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def to_dict(self, include_sensitive=False):
        """Convert to dictionary for API responses."""
        value = self.value
        
        # Mask sensitive values unless explicitly requested
        if self.sensitive and not include_sensitive and value:
            value = "***REDACTED***"
        
        return {
            "key": self.key,
            "value": value,
            "description": self.description,
            "category": self.category,
            "value_type": self.value_type,
            "sensitive": self.sensitive,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
