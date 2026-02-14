"""Auth module — Supabase JWT authentication and user management."""
from app.api.auth.middleware import get_current_user, get_optional_user
from app.api.auth.routes import router as auth_router
