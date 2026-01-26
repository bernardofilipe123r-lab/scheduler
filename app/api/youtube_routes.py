"""
YouTube OAuth and API routes for the reels automation service.
"""
import os
import json
from typing import Optional
from pathlib import Path
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import RedirectResponse, HTMLResponse
from app.services.youtube_publisher import YouTubePublisher, YouTubeCredentials


# Create router for YouTube endpoints
router = APIRouter(prefix="/youtube", tags=["youtube"])

# Initialize YouTube publisher
youtube_publisher = YouTubePublisher()

# File to store YouTube credentials per brand
YOUTUBE_CREDENTIALS_FILE = Path("youtube_credentials.json")


class YouTubeConnectRequest(BaseModel):
    """Request to initiate YouTube OAuth for a brand."""
    brand: str


def _load_youtube_credentials() -> dict:
    """Load stored YouTube credentials from file."""
    if YOUTUBE_CREDENTIALS_FILE.exists():
        try:
            with open(YOUTUBE_CREDENTIALS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def _save_youtube_credentials(credentials: dict):
    """Save YouTube credentials to file."""
    with open(YOUTUBE_CREDENTIALS_FILE, "w") as f:
        json.dump(credentials, f, indent=2)


@router.get("/connect")
async def youtube_connect(brand: str = Query(..., description="Brand to connect YouTube for")):
    """
    Start the YouTube OAuth flow for a specific brand.
    
    This redirects the user to Google's consent screen where they can:
    1. Log in with their Google account
    2. Select the YouTube channel (if multiple)
    3. Grant upload permissions
    
    After authorization, they'll be redirected to /youtube/callback
    """
    if not youtube_publisher.client_id:
        raise HTTPException(
            status_code=500,
            detail="YouTube OAuth not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET."
        )
    
    # Use brand as state parameter for CSRF and to track which brand
    auth_url = youtube_publisher.get_authorization_url(state=brand)
    
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def youtube_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None
):
    """
    Handle the OAuth callback from Google.
    
    This receives the authorization code and exchanges it for tokens.
    The tokens are then stored for the brand specified in the state parameter.
    """
    if error:
        return HTMLResponse(f"""
        <html>
        <head><title>YouTube Connection Failed</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1 style="color: #ef4444;">❌ Connection Failed</h1>
            <p>Error: {error}</p>
            <p><a href="/">Return to app</a></p>
        </body>
        </html>
        """)
    
    if not code:
        return HTMLResponse("""
        <html>
        <head><title>YouTube Connection Failed</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1 style="color: #ef4444;">❌ No Authorization Code</h1>
            <p>No authorization code received from Google.</p>
            <p><a href="/">Return to app</a></p>
        </body>
        </html>
        """)
    
    brand = state or "unknown"
    
    # Exchange code for tokens
    success, result = youtube_publisher.exchange_code_for_tokens(code)
    
    if not success:
        return HTMLResponse(f"""
        <html>
        <head><title>YouTube Connection Failed</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1 style="color: #ef4444;">❌ Token Exchange Failed</h1>
            <p>Error: {result.get('error', 'Unknown error')}</p>
            <p><a href="/">Return to app</a></p>
        </body>
        </html>
        """)
    
    # Store the credentials for this brand
    credentials = _load_youtube_credentials()
    credentials[brand] = {
        "channel_id": result["channel_id"],
        "channel_name": result["channel_name"],
        "refresh_token": result["refresh_token"]
    }
    _save_youtube_credentials(credentials)
    
    # Also set as environment variable for this session (optional)
    brand_upper = brand.upper()
    os.environ[f"{brand_upper}_YOUTUBE_CHANNEL_ID"] = result["channel_id"]
    os.environ[f"{brand_upper}_YOUTUBE_REFRESH_TOKEN"] = result["refresh_token"]
    
    return HTMLResponse(f"""
    <html>
    <head>
        <title>YouTube Connected!</title>
        <style>
            body {{
                font-family: system-ui, -apple-system, sans-serif;
                padding: 40px;
                text-align: center;
                background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%);
                min-height: 100vh;
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }}
            .card {{
                background: white;
                border-radius: 16px;
                padding: 40px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.2);
                max-width: 500px;
            }}
            h1 {{
                color: #22c55e;
                margin-bottom: 10px;
            }}
            .brand {{
                color: #666;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 1px;
            }}
            .channel {{
                background: #f3f4f6;
                padding: 15px;
                border-radius: 8px;
                margin: 20px 0;
            }}
            .channel-name {{
                font-size: 18px;
                font-weight: 600;
                color: #111;
            }}
            .channel-id {{
                font-size: 12px;
                color: #666;
                font-family: monospace;
            }}
            .btn {{
                background: #ff0000;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                text-decoration: none;
                display: inline-block;
                margin-top: 20px;
                font-weight: 500;
            }}
            .btn:hover {{
                background: #cc0000;
            }}
            .note {{
                font-size: 12px;
                color: #888;
                margin-top: 20px;
            }}
        </style>
    </head>
    <body>
        <div class="card">
            <h1>✅ YouTube Connected!</h1>
            <p class="brand">{brand}</p>
            
            <div class="channel">
                <p class="channel-name">📺 {result['channel_name']}</p>
                <p class="channel-id">{result['channel_id']}</p>
            </div>
            
            <p>This channel is now linked to <strong>{brand}</strong>.</p>
            <p>You can now schedule YouTube Shorts for this brand!</p>
            
            <a href="/" class="btn">Return to App</a>
            
            <p class="note">
                To make this permanent, add these to your .env file:<br>
                <code>{brand_upper}_YOUTUBE_CHANNEL_ID={result['channel_id']}</code><br>
                <code>{brand_upper}_YOUTUBE_REFRESH_TOKEN={result['refresh_token'][:20]}...</code>
            </p>
        </div>
    </body>
    </html>
    """)


@router.get("/status")
async def youtube_status():
    """
    Get the connection status for all brands' YouTube channels.
    
    Returns which brands have YouTube connected and quota information.
    """
    credentials = _load_youtube_credentials()
    
    # Also check environment variables
    brands = ["gymcollege", "healthycollege", "vitalitycollege", "longevitycollege", "holisticcollege", "wellbeingcollege"]
    
    status = {}
    for brand in brands:
        brand_upper = brand.upper()
        
        # Check file credentials first, then env vars
        if brand in credentials:
            status[brand] = {
                "connected": True,
                "channel_id": credentials[brand]["channel_id"],
                "channel_name": credentials[brand]["channel_name"],
                "source": "file"
            }
        elif os.getenv(f"{brand_upper}_YOUTUBE_CHANNEL_ID"):
            status[brand] = {
                "connected": True,
                "channel_id": os.getenv(f"{brand_upper}_YOUTUBE_CHANNEL_ID"),
                "channel_name": f"{brand.replace('college', ' College').title()}",
                "source": "env"
            }
        else:
            status[brand] = {
                "connected": False,
                "channel_id": None,
                "channel_name": None,
                "source": None
            }
    
    # Get quota status
    quota = youtube_publisher.get_quota_status()
    
    return {
        "brands": status,
        "quota": quota,
        "oauth_configured": bool(youtube_publisher.client_id)
    }


@router.get("/quota")
async def youtube_quota():
    """
    Get current YouTube API quota usage and status.
    """
    return youtube_publisher.get_quota_status()


@router.post("/disconnect/{brand}")
async def youtube_disconnect(brand: str):
    """
    Disconnect a YouTube channel from a brand.
    
    This removes the stored credentials (but doesn't revoke the OAuth token).
    """
    credentials = _load_youtube_credentials()
    
    if brand in credentials:
        del credentials[brand]
        _save_youtube_credentials(credentials)
        
        # Also clear env vars for this session
        brand_upper = brand.upper()
        if f"{brand_upper}_YOUTUBE_CHANNEL_ID" in os.environ:
            del os.environ[f"{brand_upper}_YOUTUBE_CHANNEL_ID"]
        if f"{brand_upper}_YOUTUBE_REFRESH_TOKEN" in os.environ:
            del os.environ[f"{brand_upper}_YOUTUBE_REFRESH_TOKEN"]
        
        return {"success": True, "message": f"YouTube disconnected for {brand}"}
    
    return {"success": False, "message": f"No YouTube connection found for {brand}"}


def get_youtube_credentials_for_brand(brand: str) -> Optional[YouTubeCredentials]:
    """
    Get YouTube credentials for a brand, checking both file and env vars.
    
    Args:
        brand: Brand name (e.g., "healthycollege")
        
    Returns:
        YouTubeCredentials if found, None otherwise
    """
    # Check file credentials first
    credentials = _load_youtube_credentials()
    if brand in credentials:
        return YouTubeCredentials(
            channel_id=credentials[brand]["channel_id"],
            channel_name=credentials[brand]["channel_name"],
            refresh_token=credentials[brand]["refresh_token"]
        )
    
    # Fall back to environment variables
    brand_upper = brand.upper()
    channel_id = os.getenv(f"{brand_upper}_YOUTUBE_CHANNEL_ID")
    refresh_token = os.getenv(f"{brand_upper}_YOUTUBE_REFRESH_TOKEN")
    
    if channel_id and refresh_token:
        return YouTubeCredentials(
            channel_id=channel_id,
            channel_name=f"{brand.replace('college', ' College').title()}",
            refresh_token=refresh_token
        )
    
    return None
