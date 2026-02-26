"""
Meta Data Deletion Callback.

The privacy policy and data deletion pages are served by the React frontend
at /privacy-policy and /data-deletion.

This module only handles the machine-to-machine POST callback that Meta
sends when a user removes the app from their Instagram/Facebook settings.

  POST /api/auth/meta/data-deletion  — Data deletion callback (JSON)
"""
import json
import logging
import hashlib
import hmac
import base64
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["legal"])

SITE_URL = os.environ.get("SITE_URL", "https://viraltoby.com")
META_APP_SECRET = os.environ.get("META_APP_SECRET", "")


# ---------------------------------------------------------------------------
# Data Deletion Callback (POST — called by Meta)
# ---------------------------------------------------------------------------

@router.post("/api/auth/meta/data-deletion")
async def data_deletion_callback(request: Request):
    """
    Meta Data Deletion Callback.
    
    When a user removes the app from their Instagram/Facebook settings,
    Meta sends a signed POST request here. We acknowledge it and return
    a confirmation URL + tracking code.
    
    See: https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
    """
    try:
        body = await request.body()
        form = await request.form()
        signed_request = form.get("signed_request", "")
        
        if not signed_request:
            return JSONResponse({"error": "Missing signed_request"}, status_code=400)
        
        # Parse and verify the signed request
        parts = signed_request.split(".", 1)
        if len(parts) != 2:
            return JSONResponse({"error": "Invalid signed_request format"}, status_code=400)
        
        encoded_sig, payload = parts
        
        # Decode payload to get user_id
        padding = 4 - len(payload) % 4
        payload_padded = payload + "=" * padding
        decoded = json.loads(base64.urlsafe_b64decode(payload_padded))
        user_id = decoded.get("user_id", "unknown")
        
        # Verify signature if we have the app secret
        if META_APP_SECRET:
            expected_sig = hmac.new(
                META_APP_SECRET.encode("utf-8"),
                payload.encode("utf-8"),
                hashlib.sha256
            ).digest()
            sig_padding = 4 - len(encoded_sig) % 4
            decoded_sig = base64.urlsafe_b64decode(encoded_sig + "=" * sig_padding)
            if not hmac.compare_digest(decoded_sig, expected_sig):
                logger.warning(f"Data deletion callback: invalid signature for user {user_id}")
                return JSONResponse({"error": "Invalid signature"}, status_code=403)
        
        # Generate a confirmation code
        confirmation_code = hashlib.sha256(
            f"{user_id}:{datetime.now(timezone.utc).isoformat()}".encode()
        ).hexdigest()[:12]
        
        logger.info(f"Data deletion requested for Meta user_id={user_id}, confirmation={confirmation_code}")
        
        # TODO: When meta_user_id is stored on brands, query and clean up here:
        # db.query(Brand).filter(Brand.meta_user_id == user_id).update({...clear credentials...})
        
        # Return the required response format
        return JSONResponse({
            "url": f"{SITE_URL}/data-deletion",
            "confirmation_code": confirmation_code,
        })
        
    except Exception as e:
        logger.exception(f"Data deletion callback error: {e}")
        return JSONResponse({"error": "Processing error"}, status_code= 500)
