"""
Logging models: LogEntry.
"""
from datetime import datetime
from app.models.base import Base, Column, String, DateTime, Text, Integer, JSON, Float


class LogEntry(Base):
    """
    Persistent log entry for extreme-detail debugging.
    
    Stores every log message, HTTP request/response, user action,
    external API call, and system event. Survives deployments via
    PostgreSQL storage. Designed for external debugging access.
    
    Categories:
    - http_request:  Incoming HTTP request/response (method, path, status, timing, headers, body)
    - http_outbound: Outgoing HTTP calls to external APIs (Meta, OpenAI, YouTube, etc.)
    - app_log:       Application log messages (info, warning, error, debug, critical)
    - user_action:   User-initiated actions (schedule, publish, generate, etc.)
    - system_event:  System events (startup, shutdown, scheduler tick, migration, etc.)
    - error:         Exceptions and tracebacks
    - scheduler:     Scheduler-related events (publish check, auto-refresh, etc.)
    - publishing:    Social media publishing events and results
    - ai_generation: AI content/image generation events
    """
    __tablename__ = "app_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Timestamp with timezone for accurate cross-timezone debugging
    timestamp = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False, index=True)
    
    # Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL
    level = Column(String(10), default="INFO", nullable=False, index=True)
    
    # Category for filtering (see docstring above)
    category = Column(String(30), default="app_log", nullable=False, index=True)
    
    # Source: module/file that generated the log
    source = Column(String(200), nullable=True, index=True)
    
    # Main log message
    message = Column(Text, nullable=False)
    
    # Detailed context as JSON blob
    details = Column(JSON, nullable=True)
    
    # Request correlation ID - links all logs from the same HTTP request
    request_id = Column(String(36), nullable=True, index=True)
    
    # Deployment identifier - tracks which deployment generated the log
    deployment_id = Column(String(100), nullable=True, index=True)
    
    # Duration in milliseconds (for timed operations)
    duration_ms = Column(Integer, nullable=True)
    
    # HTTP-specific fields (denormalized for fast queries)
    http_method = Column(String(10), nullable=True)
    http_path = Column(String(500), nullable=True, index=True)
    http_status = Column(Integer, nullable=True)
    
    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "level": self.level,
            "category": self.category,
            "source": self.source,
            "message": self.message,
            "details": self.details,
            "request_id": self.request_id,
            "deployment_id": self.deployment_id,
            "duration_ms": self.duration_ms,
            "http_method": self.http_method,
            "http_path": self.http_path,
            "http_status": self.http_status,
        }
