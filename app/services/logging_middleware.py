"""
HTTP Request/Response Logging Middleware.

Captures every incoming HTTP request with extreme detail:
- Full request headers, body, query params
- Full response headers, body, status code
- Timing (precise millisecond duration)
- Client IP, User-Agent
- Request correlation ID for tracing
- Excludes /logs endpoints to prevent recursion

This middleware is designed for debugging and must be added
to the FastAPI app in main.py.
"""
import time
import uuid
from typing import Callable
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import Message
from io import BytesIO

from app.services.logging_service import get_logging_service, set_request_id, clear_request_id


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that logs every HTTP request/response with full detail.
    
    Features:
    - Assigns a unique request_id to every request
    - Captures request headers, body, query params
    - Captures response headers, body, status
    - Measures precise timing
    - Tracks client IP
    - Auto-skips /logs routes to prevent recursion
    - Truncates large bodies to prevent DB bloat
    """
    
    # Paths to skip logging (prevent recursion and noise)
    SKIP_PATHS = {
        '/logs',
        '/api/logs',
        '/toby-logs',
        '/api/toby-logs',
        '/api/toby/status',
        '/health',
        '/favicon.ico',
    }
    
    # Paths to skip body capture (binary/large content)
    SKIP_BODY_PATHS = {
        '/output/',
        '/assets/',
        '/brand-logos/',
    }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Process the request and log everything."""
        path = request.url.path
        
        # Skip logging for logs endpoint and static assets
        if any(path.startswith(skip) for skip in self.SKIP_PATHS):
            return await call_next(request)
        
        # Generate unique request ID
        request_id = str(uuid.uuid4())
        set_request_id(request_id)
        
        # Add request_id to response headers for external correlation
        start_time = time.time()
        
        try:
            # Capture request details
            method = request.method
            client_ip = request.client.host if request.client else 'unknown'
            query_params = str(request.query_params) if request.query_params else None
            
            # Capture request headers (sanitize sensitive ones)
            request_headers = dict(request.headers)
            self._sanitize_headers(request_headers)
            
            # Capture request body (for non-GET, non-binary requests)
            request_body = None
            skip_body = any(path.startswith(skip) for skip in self.SKIP_BODY_PATHS)
            
            if method in ('POST', 'PUT', 'PATCH') and not skip_body:
                try:
                    body_bytes = await request.body()
                    if body_bytes:
                        try:
                            request_body = body_bytes.decode('utf-8')
                        except UnicodeDecodeError:
                            request_body = f'[BINARY DATA, {len(body_bytes)} bytes]'
                except Exception:
                    request_body = '[COULD NOT READ BODY]'
            
            # Process the request
            response = await call_next(request)
            
            # Calculate duration
            duration_ms = int((time.time() - start_time) * 1000)
            
            # Capture response headers
            response_headers = dict(response.headers) if hasattr(response, 'headers') else {}
            
            # Capture response body for non-streaming, non-binary responses
            response_body = None
            content_type = response_headers.get('content-type', '')
            
            if ('application/json' in content_type or 'text/' in content_type) and not skip_body:
                try:
                    # Read the response body
                    response_body_bytes = b''
                    async for chunk in response.body_iterator:
                        if isinstance(chunk, str):
                            chunk = chunk.encode('utf-8')
                        response_body_bytes += chunk
                    
                    try:
                        response_body = response_body_bytes.decode('utf-8')
                    except UnicodeDecodeError:
                        response_body = f'[BINARY RESPONSE, {len(response_body_bytes)} bytes]'
                    
                    # Reconstruct the response with the consumed body
                    from starlette.responses import Response as StarletteResponse
                    response = StarletteResponse(
                        content=response_body_bytes,
                        status_code=response.status_code,
                        headers=dict(response.headers),
                        media_type=response.media_type,
                    )
                except Exception as e:
                    response_body = f'[COULD NOT CAPTURE RESPONSE: {str(e)}]'
            
            # Add request_id to response headers
            response.headers['X-Request-ID'] = request_id
            
            # Log the request/response
            logging_service = get_logging_service()
            logging_service.log_http_request(
                method=method,
                path=path,
                status_code=response.status_code,
                duration_ms=duration_ms,
                request_headers=request_headers,
                request_body=request_body,
                response_headers=dict(response.headers),
                response_body=response_body,
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
