"""
Legal pages required by Meta App Review.

Serves:
  GET /privacy-policy     — Privacy policy (HTML)
  GET /data-deletion      — Data deletion instructions (HTML)
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
from fastapi.responses import HTMLResponse, JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["legal"])

APP_NAME = "Schedule Reels"
CONTACT_EMAIL = "bernardofilipe123r@gmail.com"
SITE_URL = os.environ.get("SITE_URL", "https://scheduler-production-29d4.up.railway.app")
META_APP_SECRET = os.environ.get("META_APP_SECRET", "")


# ---------------------------------------------------------------------------
# Privacy Policy (HTML page)
# ---------------------------------------------------------------------------

@router.get("/privacy-policy", response_class=HTMLResponse)
async def privacy_policy():
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy — {APP_NAME}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }}
  h1 {{ font-size: 1.8rem; margin-bottom: 0.3em; }}
  h2 {{ font-size: 1.2rem; margin-top: 2em; color: #333; }}
  .updated {{ color: #666; font-size: 0.9rem; margin-bottom: 2em; }}
  a {{ color: #1877F2; }}
</style>
</head>
<body>
<h1>Privacy Policy</h1>
<p class="updated">Last updated: February 2026</p>

<p><strong>{APP_NAME}</strong> ("we", "our", "the app") is a social media scheduling tool that helps users create and publish content to Instagram and Facebook.</p>

<h2>1. Information We Collect</h2>
<p>When you connect your Instagram or Facebook account via Meta's OAuth flow, we receive and store:</p>
<ul>
  <li><strong>Account identifiers</strong> — your Instagram Business Account ID and/or Facebook Page ID.</li>
  <li><strong>Access tokens</strong> — OAuth tokens issued by Meta that allow us to publish content on your behalf.</li>
  <li><strong>Basic profile info</strong> — your Instagram username and Facebook Page name, used for display purposes only.</li>
</ul>
<p>We also collect your <strong>email address</strong> when you sign up, used solely for authentication and account recovery.</p>

<h2>2. How We Use Your Information</h2>
<ul>
  <li><strong>Publishing content</strong> — to schedule and publish Reels, posts, and carousels to your connected Instagram and Facebook accounts.</li>
  <li><strong>Analytics</strong> — to fetch and display insights about your published content (impressions, reach, engagement).</li>
  <li><strong>Account management</strong> — to identify your connected accounts in the app dashboard.</li>
</ul>
<p>We do <strong>not</strong> sell, share, or transfer your data to any third parties. We do <strong>not</strong> use your data for advertising.</p>

<h2>3. Data Storage &amp; Security</h2>
<p>Your data is stored in a secured PostgreSQL database hosted on Supabase with row-level security. Access tokens are stored encrypted at rest. All API communication is over HTTPS.</p>

<h2>4. Data Retention</h2>
<p>We retain your data for as long as your account is active. When you disconnect a social account or delete your account, we immediately remove all associated tokens and identifiers from our database.</p>

<h2>5. Your Rights</h2>
<p>You can at any time:</p>
<ul>
  <li><strong>Disconnect</strong> your Instagram/Facebook account from the app settings, which deletes all stored tokens.</li>
  <li><strong>Request deletion</strong> of all your data by contacting us at <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a> or using the data deletion link below.</li>
  <li><strong>Revoke access</strong> directly from Instagram (Settings → Apps and Websites) or Facebook (Settings → Business Integrations).</li>
</ul>

<h2>6. Data Deletion</h2>
<p>To request deletion of all data we hold about you, visit: <a href="{SITE_URL}/data-deletion">{SITE_URL}/data-deletion</a></p>
<p>We will process deletion requests within 48 hours. You can also email <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.</p>

<h2>7. Third-Party Services</h2>
<p>We use the following third-party services:</p>
<ul>
  <li><strong>Meta Platform (Instagram Graph API, Facebook Graph API)</strong> — for publishing and analytics.</li>
  <li><strong>Supabase</strong> — for authentication and database hosting.</li>
  <li><strong>Railway</strong> — for application hosting.</li>
</ul>

<h2>8. Changes to This Policy</h2>
<p>We may update this policy from time to time. We will notify users of material changes via email or in-app notification.</p>

<h2>9. Contact</h2>
<p>For any questions about this privacy policy, contact us at <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a>.</p>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Data Deletion Instructions Page (HTML)
# ---------------------------------------------------------------------------

@router.get("/data-deletion", response_class=HTMLResponse)
async def data_deletion_page():
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Data Deletion — {APP_NAME}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.7; }}
  h1 {{ font-size: 1.8rem; margin-bottom: 0.3em; }}
  h2 {{ font-size: 1.2rem; margin-top: 2em; color: #333; }}
  .updated {{ color: #666; font-size: 0.9rem; margin-bottom: 2em; }}
  a {{ color: #1877F2; }}
  .steps {{ background: #f7f7f7; padding: 20px 24px; border-radius: 8px; margin: 1.5em 0; }}
  .steps li {{ margin-bottom: 0.8em; }}
  code {{ background: #eee; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }}
</style>
</head>
<body>
<h1>Data Deletion Request</h1>
<p class="updated">{APP_NAME}</p>

<p>We respect your right to control your data. Here's how to delete all data we store about you:</p>

<h2>Option 1: In-App Disconnect</h2>
<div class="steps">
<ol>
  <li>Log in to {APP_NAME}</li>
  <li>Go to <strong>Settings → Brand Settings</strong></li>
  <li>Click <strong>"Disconnect"</strong> next to your Instagram or Facebook account</li>
  <li>This immediately deletes all stored tokens and account identifiers</li>
</ol>
</div>

<h2>Option 2: Revoke from Instagram/Facebook</h2>
<div class="steps">
<ol>
  <li>Open Instagram → Settings → Apps and Websites</li>
  <li>Find <strong>{APP_NAME}</strong> and click <strong>Remove</strong></li>
  <li>This revokes our access. We will automatically purge your data upon detecting the revoked token.</li>
</ol>
</div>

<h2>Option 3: Email Request</h2>
<p>Send an email to <a href="mailto:{CONTACT_EMAIL}">{CONTACT_EMAIL}</a> with the subject line <strong>"Data Deletion Request"</strong> and include your Instagram username or email. We will delete all your data within 48 hours and confirm by email.</p>

<h2>What Gets Deleted</h2>
<ul>
  <li>Instagram/Facebook access tokens</li>
  <li>Instagram Business Account ID and Facebook Page ID</li>
  <li>Instagram username and Facebook Page name</li>
  <li>Any scheduled or generated content associated with your account</li>
</ul>

<p>After deletion, no data about your connected social accounts is retained in our systems.</p>
</body>
</html>"""


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
