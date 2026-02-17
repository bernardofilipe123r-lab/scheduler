"""
Rejection feedback API routes.
"""
import uuid
import base64
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException
from app.services.storage.supabase_storage import (
    upload_bytes, StorageError,
)


# Pydantic models
class RejectionFeedbackRequest(BaseModel):
    category: str  # 'bad_image' | 'bad_topic'
    detail: Optional[str] = None  # 'not_centered' | 'image_bug' | 'image_mismatch'
    note: Optional[str] = None  # Free-text note from user
    title: str
    caption: str = ""
    image_prompt: str = ""
    image_data: str = ""  # base64 PNG from canvas
    brand: Optional[str] = None


# Create router
router = APIRouter()


@router.post("/rejection-feedback")
async def save_rejection_feedback(request: RejectionFeedbackRequest):
    """Save rejection feedback to Supabase Storage (feedback bucket).
    Stores JSON metadata + PNG image for later manual review."""
    import json
    from datetime import datetime
    try:
        feedback_id = f"fb_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{str(uuid.uuid4())[:8]}"

        # Upload image if provided
        image_url = None
        if request.image_data:
            image_b64 = request.image_data
            if ',' in image_b64:
                image_b64 = image_b64.split(',', 1)[1]
            image_bytes = base64.b64decode(image_b64)
            try:
                image_url = upload_bytes("feedback", f"{feedback_id}.png", image_bytes, "image/png")
            except StorageError as e:
                print(f"⚠️ Feedback image upload failed: {e}", flush=True)
            print(f"💾 Feedback image uploaded ({len(image_bytes)} bytes)")

        # Upload metadata JSON
        metadata = {
            "id": feedback_id,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "category": request.category,
            "detail": request.detail,
            "note": request.note,
            "title": request.title,
            "caption": request.caption,
            "image_prompt": request.image_prompt,
            "brand": request.brand,
            "image_url": image_url,
        }
        json_bytes = json.dumps(metadata, indent=2, ensure_ascii=False).encode("utf-8")
        try:
            upload_bytes("feedback", f"{feedback_id}.json", json_bytes, "application/json")
        except StorageError as e:
            print(f"⚠️ Feedback metadata upload failed: {e}", flush=True)
        print(f"📝 Feedback metadata uploaded")

        return {"status": "saved", "id": feedback_id, "image_url": image_url}

    except Exception as e:
        print(f"❌ Failed to save rejection feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rejection-feedback")
async def list_rejection_feedback():
    """List all stored rejection feedback entries from Supabase Storage."""
    import json
    try:
        from app.services.storage.supabase_storage import list_files, download_file

        files = list_files("feedback", "")
        entries = []
        for f in files:
            name = f.get("name", "")
            if not name.endswith(".json"):
                continue
            try:
                data_bytes = download_file("feedback", name)
                data = json.loads(data_bytes.decode("utf-8"))
                entries.append(data)
            except Exception:
                continue

        # Sort by timestamp descending
        entries.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
        return {"feedback": entries, "count": len(entries)}

    except Exception as e:
        print(f"❌ Failed to list rejection feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
