"""Pydantic schemas for Pipeline API requests and responses."""
from pydantic import BaseModel, Field
from typing import Optional


class ApproveRequest(BaseModel):
    """Request body for single-item approval."""
    caption: Optional[str] = None


class RejectRequest(BaseModel):
    """Request body for single-item rejection."""
    reason: Optional[str] = None


class BulkApproveRequest(BaseModel):
    """Request body for bulk approval."""
    job_ids: list[str] = Field(..., min_length=1, max_length=200)


class BulkRejectRequest(BaseModel):
    """Request body for bulk rejection."""
    job_ids: list[str] = Field(..., min_length=1, max_length=200)


class EditRequest(BaseModel):
    """Request body for editing a pipeline item."""
    caption: Optional[str] = None
    title: Optional[str] = Field(None, max_length=500)


class RegenerateRequest(BaseModel):
    """Request body for regenerating content to fill gaps."""
    count: int = Field(..., ge=1, le=50)
