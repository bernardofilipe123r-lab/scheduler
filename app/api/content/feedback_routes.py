"""
Rejection feedback API routes.
"""
import uuid
import base64
from pathlib import Path
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException


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
    """Save rejection feedback permanently to server filesystem (output/feedback/).
    Stores JSON metadata + PNG image side by side for later manual review."""
    import json
    from datetime import datetime
    try:
        base_dir = Path(__file__).resolve().parent.parent.parent
        feedback_dir = base_dir / "output" / "feedback"
        feedback_dir.mkdir(parents=True, exist_ok=True)

        feedback_id = f"fb_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{str(uuid.uuid4())[:8]}"

        # Save image if provided
        image_filename = None
        if request.image_data:
            image_b64 = request.image_data
            if ',' in image_b64:
                image_b64 = image_b64.split(',', 1)[1]
            image_bytes = base64.b64decode(image_b64)
            image_path = feedback_dir / f"{feedback_id}.png"
            image_path.write_bytes(image_bytes)
            image_filename = f"{feedback_id}.png"
            print(f"💾 Feedback image saved: {image_path} ({len(image_bytes)} bytes)")

        # Save metadata JSON
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
            "image_file": image_filename,
        }
        json_path = feedback_dir / f"{feedback_id}.json"
        json_path.write_text(json.dumps(metadata, indent=2, ensure_ascii=False))
        print(f"📝 Feedback metadata saved: {json_path}")

        return {"status": "saved", "id": feedback_id}

    except Exception as e:
        print(f"❌ Failed to save rejection feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rejection-feedback")
async def list_rejection_feedback():
    """List all stored rejection feedback entries."""
    import json
    try:
        base_dir = Path(__file__).resolve().parent.parent.parent
        feedback_dir = base_dir / "output" / "feedback"
        if not feedback_dir.exists():
            return {"feedback": [], "count": 0}

        entries = []
        for json_file in sorted(feedback_dir.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True):
            try:
                data = json.loads(json_file.read_text())
                entries.append(data)
            except Exception:
                continue

        return {"feedback": entries, "count": len(entries)}

    except Exception as e:
        print(f"❌ Failed to list rejection feedback: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
