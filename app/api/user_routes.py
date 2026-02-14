"""
User management API routes.
"""
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from app.services.db_scheduler import DatabaseSchedulerService


# Pydantic models
class UserCreateRequest(BaseModel):
    user_id: str
    user_name: str
    email: Optional[str] = None
    instagram_business_account_id: Optional[str] = None
    facebook_page_id: Optional[str] = None
    meta_access_token: Optional[str] = None


# Create router
router = APIRouter()

# Initialize services
scheduler_service = DatabaseSchedulerService()


@router.post("/users")
async def create_user(request: UserCreateRequest):
    """
    Create or update a user profile with Instagram/Facebook credentials.
    
    This allows multiple users to share the system with their own credentials.
    """
    try:
        user = scheduler_service.get_or_create_user(
            user_id=request.user_id,
            user_name=request.user_name,
            email=request.email,
            instagram_account_id=request.instagram_business_account_id,
            facebook_page_id=request.facebook_page_id,
            meta_access_token=request.meta_access_token
        )
        
        return {
            "status": "success",
            "user": user
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create/update user: {str(e)}"
        )


@router.get("/users/{user_id}")
async def get_user(user_id: str):
    """Get user profile information (without tokens)."""
    try:
        from app.db_connection import get_db_session
        from app.models import UserProfile
        
        with get_db_session() as db:
            user = db.query(UserProfile).filter(
                UserProfile.user_id == user_id
            ).first()
            
            if not user:
                raise HTTPException(
                    status_code=404,
                    detail=f"User {user_id} not found"
                )
            
            return user.to_dict(include_tokens=False)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get user: {str(e)}"
        )
