"""
API routes aggregator for the reels automation service.

All endpoints live in domain-specific route files.
This module re-exports a single `router` with prefix="/reels"
so that app/main.py needs no changes.
"""
from fastapi import APIRouter
from app.api.content.routes import router as content_router
from app.api.content.reel_routes import router as reel_router
from app.api.content.schedule_routes import router as schedule_router
from app.api.content.publish_routes import router as publish_router
from app.api.auth.user_routes import router as user_router
from app.api.content.feedback_routes import router as feedback_router
from app.api.system.status_routes import router as status_router

router = APIRouter(prefix="/reels", tags=["reels"])

router.include_router(content_router)
router.include_router(reel_router)
router.include_router(schedule_router)
router.include_router(publish_router)
router.include_router(user_router)
router.include_router(feedback_router)
router.include_router(status_router)

