"""
Persistent Logging Service - Extreme Detail Level.

This service captures ALL application events and persists them to PostgreSQL
so logs survive deployments. It integrates with Python's logging system,
captures HTTP requests/responses, outbound API calls, user actions, and
system events.

Architecture:
- DatabaseLogHandler: Python logging.Handler that writes to PostgreSQL
- LoggingService: Central service for structured log operations
- Thread-safe buffered writes with periodic flush
- Automatic cleanup of old logs (configurable retention)

Design for external debugging:
- Every log entry has a request_id for correlation
- Deployment ID tracks which deployment generated logs
- Full HTTP request/response capture (headers, body, timing)
- Outbound API call tracking (Meta, OpenAI, YouTube)
- Stack traces for all errors
"""
import os
import sys
import uuid
import json
import time
import logging
import traceback
import threading
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from collections import deque
from contextlib import contextmanager


# Deployment ID - unique per process start, survives restarts
DEPLOYMENT_ID = f"deploy-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"

# Thread-local storage for request context
_request_context = threading.local()


def get_request_id() -> Optional[str]:
    """Get the current request ID from thread-local storage."""
    return getattr(_request_context, 'request_id', None)


def set_request_id(request_id: str):
    """Set the current request ID in thread-local storage."""
    _request_context.request_id = request_id


def clear_request_id():
    """Clear the current request ID from thread-local storage."""
    _request_context.request_id = None


class LogBuffer:
    """Thread-safe buffer for batching log writes to the database."""
    
    def __init__(self, max_size: int = 50, flush_interval: float = 2.0):
        self.buffer: deque = deque()
        self.max_size = max_size
        self.flush_interval = flush_interval
        self.lock = threading.Lock()
        self.last_flush = time.time()
        self._flush_timer: Optional[threading.Timer] = None
        self._running = True
    
    def add(self, entry: Dict[str, Any]):
        """Add a log entry to the buffer."""
        with self.lock:
            self.buffer.append(entry)
            if len(self.buffer) >= self.max_size:
                self._do_flush()
            elif not self._flush_timer:
                self._schedule_flush()
    
    def _schedule_flush(self):
        """Schedule a flush after the interval."""
        if self._running:
            self._flush_timer = threading.Timer(self.flush_interval, self._timed_flush)
            self._flush_timer.daemon = True
            self._flush_timer.start()
    
    def _timed_flush(self):
        """Flush triggered by timer."""
        with self.lock:
            self._flush_timer = None
            self._do_flush()
    
    def _do_flush(self):
        """Flush all buffered entries to the database. Must be called with lock held."""
        if not self.buffer:
            return
        
        entries = list(self.buffer)
        self.buffer.clear()
        self.last_flush = time.time()
        
        # Write in a separate thread to not block the caller
        thread = threading.Thread(target=self._write_to_db, args=(entries,), daemon=True)
        thread.start()
    
    def _write_to_db(self, entries: List[Dict[str, Any]]):
        """Write entries to the database."""
        try:
            from app.db_connection import SessionLocal
            from app.models import LogEntry
            
            db = SessionLocal()
            try:
                for entry_data in entries:
                    log_entry = LogEntry(**entry_data)
                    db.add(log_entry)
                db.commit()
            except Exception as e:
                db.rollback()
                # Fallback: print to stderr so we don't lose logs
                print(f"[LOG-SERVICE] Failed to write {len(entries)} log entries to DB: {e}", file=sys.stderr, flush=True)
            finally:
                db.close()
        except Exception as e:
            print(f"[LOG-SERVICE] Critical: Cannot connect to DB for logging: {e}", file=sys.stderr, flush=True)
    
    def flush_sync(self):
        """Synchronously flush all buffered entries."""
        with self.lock:
            if not self.buffer:
                return
            entries = list(self.buffer)
            self.buffer.clear()
        
        self._write_to_db(entries)
    
    def stop(self):
        """Stop the buffer and flush remaining entries."""
        self._running = False
        if self._flush_timer:
            self._flush_timer.cancel()
        self.flush_sync()


# Global buffer instance
_log_buffer = LogBuffer(max_size=30, flush_interval=1.5)


class DatabaseLogHandler(logging.Handler):
    """
    Python logging.Handler that captures ALL log messages and persists
    them to PostgreSQL via the LogBuffer.
    
    This intercepts every logger.info(), logger.error(), etc. call
    across the entire application.
    """
    
    # Modules to skip to avoid infinite recursion
    SKIP_MODULES = {
        'app.services.logging_service',
        'sqlalchemy.engine',
        'sqlalchemy.pool',
        'sqlalchemy.dialects',
    }
    
    def __init__(self):
        super().__init__()
        self.setLevel(logging.DEBUG)
    
    def emit(self, record: logging.LogRecord):
        """Handle a log record by buffering it for DB write."""
        try:
            # Skip our own module to prevent recursion
            if record.name in self.SKIP_MODULES:
                return
            if any(record.name.startswith(m) for m in self.SKIP_MODULES):
                return
            
            # Build the log entry
            entry = {
                'timestamp': datetime.utcnow(),
                'level': record.levelname,
                'category': 'app_log',
                'source': f"{record.name}:{record.funcName}:{record.lineno}",
                'message': record.getMessage(),
                'details': {
                    'logger_name': record.name,
                    'function': record.funcName,
                    'line_number': record.lineno,
                    'filename': record.filename,
                    'pathname': record.pathname,
                    'process': record.process,
                    'thread_name': record.threadName,
                },
                'request_id': get_request_id(),
                'deployment_id': DEPLOYMENT_ID,
            }
            
            # Capture exception info if present
            if record.exc_info and record.exc_info[1]:
                entry['category'] = 'error'
                entry['level'] = 'ERROR'
                entry['details']['exception_type'] = type(record.exc_info[1]).__name__
                entry['details']['traceback'] = traceback.format_exception(*record.exc_info)
            
            _log_buffer.add(entry)
            
        except Exception:
            # Never let logging failures crash the app
            pass


class LoggingService:
    """
    Central logging service for structured, persistent logging.
    
    Provides methods for logging different event categories with
    full context. All entries are persisted to PostgreSQL.
    """
    
    _instance = None
    _initialized = False
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if LoggingService._initialized:
            return
        LoggingService._initialized = True
        self.deployment_id = DEPLOYMENT_ID
        self._setup_python_logging()
    
    def _setup_python_logging(self):
        """Install the database log handler on the root logger."""
        self.db_handler = DatabaseLogHandler()
        
        # Add to root logger to capture everything
        root_logger = logging.getLogger()
        root_logger.addHandler(self.db_handler)
        
        # Also capture uvicorn and fastapi logs
        for logger_name in ['uvicorn', 'uvicorn.access', 'uvicorn.error', 'fastapi']:
            logger = logging.getLogger(logger_name)
            logger.addHandler(self.db_handler)
        
        # Capture print() statements by redirecting stdout/stderr
        self._install_print_capture()
    
    def _install_print_capture(self):
        """Capture print() statements as log entries."""
        original_stdout = sys.stdout
        original_stderr = sys.stderr
        
        class PrintCapture:
            def __init__(self, original, level='INFO', category='app_log'):
                self.original = original
                self.level = level
                self.category = category
            
            def write(self, text):
                # Always write to original
                if self.original:
                    self.original.write(text)
                    self.original.flush()
                
                # Skip empty lines and whitespace
                stripped = text.strip()
                if not stripped:
                    return
                
                # Skip sqlalchemy and logging internals
                if any(skip in stripped for skip in ['sqlalchemy.', 'LOG-SERVICE']):
                    return
                
                try:
                    entry = {
                        'timestamp': datetime.utcnow(),
                        'level': self.level,
                        'category': self.category,
                        'source': 'stdout' if self.level == 'INFO' else 'stderr',
                        'message': stripped,
                        'details': {'capture_type': 'print'},
                        'request_id': get_request_id(),
                        'deployment_id': DEPLOYMENT_ID,
                    }
                    _log_buffer.add(entry)
                except Exception:
                    pass
            
            def flush(self):
                if self.original:
                    self.original.flush()
            
            def fileno(self):
                if self.original:
                    return self.original.fileno()
                raise AttributeError("no fileno")
            
            def isatty(self):
                return False
            
            # Support all file-like methods
            def __getattr__(self, name):
                return getattr(self.original, name)
        
        sys.stdout = PrintCapture(original_stdout, 'INFO', 'app_log')
        sys.stderr = PrintCapture(original_stderr, 'ERROR', 'app_log')
    
    def log(self, level: str, category: str, message: str, 
            details: Optional[Dict] = None, source: Optional[str] = None,
            duration_ms: Optional[int] = None, http_method: Optional[str] = None,
            http_path: Optional[str] = None, http_status: Optional[int] = None,
            request_id: Optional[str] = None):
        """Write a structured log entry."""
        entry = {
            'timestamp': datetime.utcnow(),
            'level': level.upper(),
            'category': category,
            'source': source or 'app',
            'message': message,
            'details': details,
            'request_id': request_id or get_request_id(),
            'deployment_id': self.deployment_id,
            'duration_ms': duration_ms,
            'http_method': http_method,
            'http_path': http_path,
            'http_status': http_status,
        }
        _log_buffer.add(entry)
    
    def log_http_request(self, method: str, path: str, status_code: int,
                         duration_ms: int, request_headers: Optional[Dict] = None,
                         request_body: Optional[str] = None, 
                         response_headers: Optional[Dict] = None,
                         response_body: Optional[str] = None,
                         client_ip: Optional[str] = None,
                         query_params: Optional[str] = None,
                         request_id: Optional[str] = None):
        """Log an incoming HTTP request with full details."""
        # Truncate bodies to prevent huge DB entries
        max_body = 5000
        if request_body and len(request_body) > max_body:
            request_body = request_body[:max_body] + f'... [TRUNCATED, total {len(request_body)} chars]'
        if response_body and len(response_body) > max_body:
            response_body = response_body[:max_body] + f'... [TRUNCATED, total {len(response_body)} chars]'
        
        # Determine log level based on status
        if status_code >= 500:
            level = 'ERROR'
        elif status_code >= 400:
            level = 'WARNING'
        else:
            level = 'INFO'
        
        self.log(
            level=level,
            category='http_request',
            message=f"{method} {path} → {status_code} ({duration_ms}ms)",
            details={
                'method': method,
                'path': path,
                'status_code': status_code,
                'duration_ms': duration_ms,
                'request_headers': request_headers,
                'request_body': request_body,
                'response_headers': response_headers,
                'response_body': response_body,
                'client_ip': client_ip,
                'query_params': query_params,
            },
            source='middleware.http',
            duration_ms=duration_ms,
            http_method=method,
            http_path=path,
            http_status=status_code,
            request_id=request_id,
        )
    
    def log_outbound_request(self, method: str, url: str, status_code: int,
                              duration_ms: int, service_name: str = 'unknown',
                              request_body: Optional[str] = None,
                              response_body: Optional[str] = None,
                              request_id: Optional[str] = None):
        """Log an outbound HTTP request to an external API."""
        max_body = 3000
        if request_body and len(request_body) > max_body:
            request_body = request_body[:max_body] + '... [TRUNCATED]'
        if response_body and len(response_body) > max_body:
            response_body = response_body[:max_body] + '... [TRUNCATED]'
        
        level = 'ERROR' if status_code >= 400 else 'INFO'
        
        self.log(
            level=level,
            category='http_outbound',
            message=f"[{service_name}] {method} {url} → {status_code} ({duration_ms}ms)",
            details={
                'method': method,
                'url': url,
                'status_code': status_code,
                'duration_ms': duration_ms,
                'service_name': service_name,
                'request_body': request_body,
                'response_body': response_body,
            },
            source=f'outbound.{service_name}',
            duration_ms=duration_ms,
            request_id=request_id,
        )
    
    def log_user_action(self, action: str, details: Optional[Dict] = None,
                         user_id: Optional[str] = None):
        """Log a user-initiated action."""
        self.log(
            level='INFO',
            category='user_action',
            message=f"User action: {action}",
            details={
                'action': action,
                'user_id': user_id,
                **(details or {}),
            },
            source='user_tracking',
        )
    
    def log_system_event(self, event_type: str, message: str,
                          details: Optional[Dict] = None, level: str = 'INFO'):
        """Log a system event (startup, shutdown, scheduler, etc.)."""
        self.log(
            level=level,
            category='system_event',
            message=f"[{event_type}] {message}",
            details={
                'event_type': event_type,
                **(details or {}),
            },
            source='system',
        )
    
    def log_error(self, message: str, exception: Optional[Exception] = None,
                   context: Optional[Dict] = None):
        """Log an error with optional exception traceback."""
        details = context or {}
        if exception:
            details['exception_type'] = type(exception).__name__
            details['exception_message'] = str(exception)
            details['traceback'] = traceback.format_exc()
        
        self.log(
            level='ERROR',
            category='error',
            message=message,
            details=details,
            source='error_handler',
        )
    
    def log_scheduler_event(self, message: str, details: Optional[Dict] = None,
                              level: str = 'INFO'):
        """Log a scheduler-related event."""
        self.log(
            level=level,
            category='scheduler',
            message=message,
            details=details,
            source='scheduler',
        )
    
    def log_publishing_event(self, message: str, details: Optional[Dict] = None,
                               level: str = 'INFO'):
        """Log a social media publishing event."""
        self.log(
            level=level,
            category='publishing',
            message=message,
            details=details,
            source='publisher',
        )
    
    def log_ai_generation(self, message: str, details: Optional[Dict] = None,
                           level: str = 'INFO'):
        """Log an AI content/image generation event."""
        self.log(
            level=level,
            category='ai_generation',
            message=message,
            details=details,
            source='ai_generator',
        )
    
    def flush(self):
        """Flush all buffered log entries to the database."""
        _log_buffer.flush_sync()
    
    def shutdown(self):
        """Shutdown the logging service and flush remaining entries."""
        _log_buffer.stop()
    
    def cleanup_old_logs(self, retention_days: int = 7):
        """Delete logs older than retention_days."""
        try:
            from app.db_connection import SessionLocal
            from app.models import LogEntry
            
            cutoff = datetime.utcnow() - timedelta(days=retention_days)
            db = SessionLocal()
            try:
                deleted = db.query(LogEntry).filter(LogEntry.timestamp < cutoff).delete()
                db.commit()
                self.log_system_event('log_cleanup', f"Deleted {deleted} logs older than {retention_days} days")
                return deleted
            finally:
                db.close()
        except Exception as e:
            print(f"[LOG-SERVICE] Failed to cleanup old logs: {e}", file=sys.__stderr__, flush=True)
            return 0


# Singleton accessor
def get_logging_service() -> LoggingService:
    """Get or create the singleton LoggingService instance."""
    return LoggingService()
