"""
HTTP Request/Response Logging Middleware.

Captures every incoming HTTP request with detail:
- Request headers, query params
- Response status code
- Timing (precise millisecond duration)
- Client IP, User-Agent
- Request correlation ID for tracing
- Excludes /logs endpoints to prevent recursion

Implemented as a pure ASGI middleware (NOT BaseHTTPMiddleware) to avoid
the deadlock issues that BaseHTTPMiddleware causes under concurrent requests.
"""
import time
import uuid
from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from app.services.logging.service import get_logging_service, set_request_id, clear_request_id

# Paths to skip logging (prevent recursion and noise)
_SKIP_PATHS = (
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
)

_SENSITIVE_HEADERS = frozenset({'authorization', 'cookie', 'x-api-key', 'x-access-token'})


def _sanitize_headers(headers: dict) -> dict:
    """Return a copy with sensitive header values redacted."""
    return {
        k: ('***REDACTED***' if k.lower() in _SENSITIVE_HEADERS else v)
        for k, v in headers.items()
    }


class RequestLoggingMiddleware:
    """
    Pure ASGI middleware that logs every HTTP request/response.

    Unlike BaseHTTPMiddleware this never wraps the response body
    through a memory channel, so it cannot deadlock under concurrency.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path: str = scope.get("path", "")
        if any(path.startswith(skip) for skip in _SKIP_PATHS):
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        set_request_id(request_id)

        request = Request(scope, receive)
        method = request.method
        start_time = time.time()
        client_ip = request.client.host if request.client else "unknown"
        query_params = str(request.query_params) if request.query_params else None
        request_headers = _sanitize_headers(dict(request.headers))

        status_code = 500  # default until we capture the real one
        response_headers: dict = {}

        async def send_wrapper(message) -> None:
            nonlocal status_code, response_headers
            if message["type"] == "http.response.start":
                status_code = message["status"]
                raw_headers = message.get("headers", [])
                # Inject X-Request-ID into the response
                raw_headers = list(raw_headers) + [
                    (b"x-request-id", request_id.encode())
                ]
                message = {**message, "headers": raw_headers}
                response_headers = {
                    k.decode(): v.decode() for k, v in raw_headers
                }
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            duration_ms = int((time.time() - start_time) * 1000)
            logging_service = get_logging_service()
            logging_service.log_error(
                message=f"Request failed: {method} {path}",
                exception=exc,
                context={
                    "path": path,
                    "method": method,
                    "duration_ms": duration_ms,
                    "request_id": request_id,
                },
            )
            raise
        else:
            duration_ms = int((time.time() - start_time) * 1000)
            logging_service = get_logging_service()
            logging_service.log_http_request(
                method=method,
                path=path,
                status_code=status_code,
                duration_ms=duration_ms,
                request_headers=request_headers,
                request_body=None,
                response_headers=response_headers,
                response_body=None,
                client_ip=client_ip,
                query_params=query_params,
                request_id=request_id,
            )
        finally:
            clear_request_id()
