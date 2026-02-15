"""
HTTP Request/Response Logging Middleware.

Captures every incoming HTTP request with detail:
- Request headers, query params
- Response status code
- Timing (precise millisecond duration)
- Client IP, User-Agent
- Request correlation ID for tracing
- Excludes /logs endpoints to prevent recursion

NOTE: Does NOT consume the response body. Consuming body_iterator
inside BaseHTTPMiddleware causes deadlocks under concurrent requests
and can strip CORS headers during response reconstruction.
"""
import time
import uuid
from typing import Callable
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.services.logging.service import get_logging_service, set_request_id, clear_request_id


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that logs every HTTP request/response.
    
    Features:
    - Assigns a unique request_id to every request
    - Captures request headers, query params
    - Captures response status and timing
    - Tracks client IP
    - Auto-skips /logs routes to prevent recursion
    
    NOTE: Response body is NOT captured to avoid BaseHTTPMiddleware
    deadlocks under concurrent requests.
    """
    
    # Paths to skip logging (prevent recursion and noise)
    SKIP_PATHS = {
        '/logs',
        '/api/logs',
        '/toby-logs',
        '/lexi-logs',
        '/maestro-logs',
        '/ai-logs',
        '/ai-about',
        '/api/ai-logs',
        '/api/toby-logs',
        '/api/toby/status',
        '/health',
        '/favicon.ico',
    }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process the request and log metadata (never consume response body)."""
        path = request.url.path
        
        # Skip logging for logs endpoint and static assets
        if any(path.startswith(skip) for skip in self.SKIP_PATHS):
            return await call_next(request)
        
        # Generate unique request ID
        request_id = str(uuid.uuid4())
        set_request_id(request_id)
        
        start_time = time.time()
        method = request.method
        
        try:
            # Capture request details
            client_ip = request.client.host if request.client else 'unknown'
            query_params = str(request.query_params) if request.query_params else None
            
            # Capture request headers (sanitize sensitive ones)
            request_headers = dict(request.headers)
            self._sanitize_headers(request_headers)
            
            # Process the request — do NOT read request body beforehand
            # (reading body in BaseHTTPMiddleware can deadlock)
            response = await call_next(request)
            
            # Calculate duration
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Add request_id to response headers
            response.headers['X-Request-ID'] = request_id
            
            # Log the request (without response body — avoids deadlock)
            logging_service = get_logging_service()
            logging_service.log_http_request(
                method=method,
                path=path,
                status_code=response.status_code,
                duration_ms=duration_ms,
                request_headers=request_headers,
                request_body=None,
                response_headers=dict(response.headers),
                response_body=None,
                client_ip=client_ip,
                query_params=query_params,
                request_id=request_id,
            )
            
            return response
            
        except Exception as e:
            # Log the error
            duration_ms = int((time.time() - start_time) * 1000)
            logging_service = get_logging_service()
            logging_service.log_error(
                message=f"Request failed: {method} {path}",
                exception=e,
                context={
                    'path': path,
                    'method': method,
                    'duration_ms': duration_ms,
                    'request_id': request_id,
                }
            )
            raise
        finally:
            clear_request_id()
    
    def _sanitize_headers(self, headers: dict):
        """Remove or mask sensitive header values."""
        sensitive_keys = {'authorization', 'cookie', 'x-api-key', 'x-access-token'}
        for key in list(headers.keys()):
            if key.lower() in sensitive_keys:
                headers[key] = '***REDACTED***'
