"""
YouTube OAuth and API routes for the reels automation service.

Architecture (Buffer-style):
1. User clicks "Connect YouTube" → redirects to Google OAuth
2. User authorizes once → we get refresh_token
3. refresh_token stored in DB (never expires unless revoked)
4. For each upload: refresh_token → fresh access_token → upload → discard token
5. User never touches tokens again

The user does ONE thing: click "Connect" and authorize.
Everything else is handled automatically by the backend.
"""
import os
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session

from app.db_connection import get_db, get_db_session
from app.models import YouTubeChannel
from app.services.youtube_publisher import YouTubePublisher, YouTubeCredentials


logger = logging.getLogger(__name__)

# Create router for YouTube endpoints
router = APIRouter(prefix="/youtube", tags=["youtube"])

# Initialize YouTube publisher (handles OAuth and API calls)
youtube_publisher = YouTubePublisher()

# List of valid brands
VALID_BRANDS = [
    "healthycollege",
    "vitalitycollege", 
    "longevitycollege",
    "holisticcollege",
    "wellbeingcollege"
]


@router.get("/connect")
async def youtube_connect(brand: str = Query(..., description="Brand to connect YouTube for")):
    """
    Start the YouTube OAuth flow for a specific brand.
    
    This is the ONLY user interaction required for YouTube.
    After this, uploads happen automatically forever.
    
    Flow:
    1. User clicks "Connect YouTube" for a brand
    2. Redirects to Google consent screen
    3. User picks channel and clicks "Allow"
    4. Callback stores refresh_token in DB
    5. Done - user never does this again
    """
    brand = brand.lower()
    
    if brand not in VALID_BRANDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid brand. Must be one of: {', '.join(VALID_BRANDS)}"
        )
    
    if not youtube_publisher.client_id:
        raise HTTPException(
            status_code=500,
            detail="YouTube OAuth not configured. Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET."
        )
    
    # Use brand as state parameter for CSRF protection and brand tracking
    auth_url = youtube_publisher.get_authorization_url(state=brand)
    
    logger.info(f"Starting YouTube OAuth flow for brand: {brand}")
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def youtube_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Handle the OAuth callback from Google.
    
    This is called ONCE after the user authorizes.
    We exchange the code for tokens and store the refresh_token in DB.
    
    The refresh_token can be used for years without user interaction.
    """
    if error:
        logger.error(f"YouTube OAuth error: {error}")
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
    
    brand = (state or "unknown").lower()
    
    # Exchange authorization code for tokens
    # This gives us both access_token (short-lived) and refresh_token (long-lived)
    success, result = youtube_publisher.exchange_code_for_tokens(code)
    
    if not success:
        logger.error(f"Token exchange failed for {brand}: {result}")
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
    
    # Check if this channel is already connected to ANOTHER brand
    # (Prevent user confusion - same channel can't be used for multiple brands)
    existing_channel = db.query(YouTubeChannel).filter(
        YouTubeChannel.channel_id == result["channel_id"],
        YouTubeChannel.brand != brand
    ).first()
    
    if existing_channel:
        existing_brand_display = existing_channel.brand.replace("college", " College").title()
        brand_display = brand.replace("college", " College").title()
        logger.warning(f"Channel {result['channel_id']} already connected to {existing_channel.brand}, attempted by {brand}")
        return HTMLResponse(f"""
        <html>
        <head>
            <title>Channel Already Connected</title>
            <style>
                body {{
                    font-family: system-ui, -apple-system, sans-serif;
                    padding: 40px;
                    text-align: center;
                    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
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
                h1 {{ color: #f59e0b; margin-bottom: 10px; }}
                .channel {{
                    background: #fef3c7;
                    padding: 15px;
                    border-radius: 8px;
                    margin: 20px 0;
                }}
                .btn {{
                    background: #3b82f6;
                    color: white;
                    padding: 12px 24px;
                    border-radius: 8px;
                    text-decoration: none;
                    display: inline-block;
                    margin-top: 20px;
                    font-weight: 500;
                }}
            </style>
        </head>
        <body>
            <div class="card">
                <h1>⚠️ Channel Already Connected</h1>
                
                <div class="channel">
                    <p><strong>{result['channel_name']}</strong></p>
                    <p style="font-size: 12px; color: #666;">{result['channel_id']}</p>
                </div>
                
                <p>This YouTube channel is already connected to <strong>{existing_brand_display}</strong>.</p>
                <p>Each channel can only be linked to one brand.</p>
                
                <p style="margin-top: 20px; font-size: 14px; color: #666;">
                    To use this channel for <strong>{brand_display}</strong> instead:<br>
                    1. Disconnect it from {existing_brand_display} first<br>
                    2. Then reconnect it to {brand_display}
                </p>
                
                <a href="/" class="btn">Return to App</a>
            </div>
        </body>
        </html>
        """)
    
    # Store the refresh_token in the database
    # This is the ONLY token we need to store long-term
    try:
        # Check if brand already has a channel connected
        existing = db.query(YouTubeChannel).filter(YouTubeChannel.brand == brand).first()
        
        if existing:
            # Update existing record
            existing.channel_id = result["channel_id"]
            existing.channel_name = result["channel_name"]
            existing.refresh_token = result["refresh_token"]
            existing.status = "connected"
            existing.last_error = None
            existing.updated_at = datetime.utcnow()
            logger.info(f"Updated YouTube connection for {brand}: {result['channel_name']}")
        else:
            # Create new record
            youtube_channel = YouTubeChannel(
                brand=brand,
                channel_id=result["channel_id"],
                channel_name=result["channel_name"],
                refresh_token=result["refresh_token"],
                status="connected",
                connected_at=datetime.utcnow()
            )
            db.add(youtube_channel)
            logger.info(f"Created YouTube connection for {brand}: {result['channel_name']}")
        
        db.commit()
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to save YouTube credentials to DB: {e}")
        return HTMLResponse(f"""
        <html>
        <head><title>YouTube Connection Failed</title></head>
        <body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1 style="color: #ef4444;">❌ Database Error</h1>
            <p>Failed to save credentials: {str(e)}</p>
            <p><a href="/">Return to app</a></p>
        </body>
        </html>
        """)
    
    # Success page
    brand_display = brand.replace("college", " College").title()
    return HTMLResponse(f"""
    <html>
    <head>
        <title>YouTube Connected!</title>
        <style>
            body {{
                font-family: system-ui, -apple-system, sans-serif;
                padding: 40px;
                text-align: center;
                background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #bbf7d0 100%);
                min-height: 100vh;
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }}
            .card {{
                background: white;
                border-radius: 20px;
                padding: 48px;
                box-shadow: 0 25px 50px rgba(34, 197, 94, 0.15), 0 0 0 1px rgba(34, 197, 94, 0.1);
                max-width: 480px;
            }}
            .success-icon {{
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
                font-size: 40px;
                box-shadow: 0 8px 24px rgba(34, 197, 94, 0.3);
            }}
            h1 {{
                color: #15803d;
                margin-bottom: 8px;
                font-size: 28px;
                font-weight: 700;
            }}
            .brand {{
                color: #16a34a;
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 2px;
                font-weight: 600;
            }}
            .channel {{
                background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
                padding: 20px;
                border-radius: 12px;
                margin: 24px 0;
                border: 1px solid #bbf7d0;
            }}
            .channel-name {{
                font-size: 20px;
                font-weight: 600;
                color: #15803d;
                margin-bottom: 4px;
            }}
            .channel-id {{
                font-size: 12px;
                color: #16a34a;
                font-family: monospace;
                background: white;
                padding: 4px 10px;
                border-radius: 6px;
                display: inline-block;
            }}
            .message {{
                color: #374151;
                line-height: 1.6;
                margin: 16px 0;
            }}
            .btn {{
                background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
                color: white;
                padding: 14px 32px;
                border-radius: 12px;
                text-decoration: none;
                display: inline-block;
                margin-top: 24px;
                font-weight: 600;
                font-size: 16px;
                box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);
                transition: all 0.2s ease;
            }}
            .btn:hover {{
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(34, 197, 94, 0.5);
            }}
            .note {{
                font-size: 13px;
                color: #16a34a;
                margin-top: 24px;
                background: #f0fdf4;
                padding: 16px;
                border-radius: 12px;
                border: 1px solid #bbf7d0;
                line-height: 1.5;
            }}
            .note strong {{
                color: #15803d;
            }}
        </style>
    </head>
    <body>
        <div class="card">
            <div class="success-icon">✓</div>
            <h1>YouTube Connected!</h1>
            <p class="brand">{brand_display}</p>
            
            <div class="channel">
                <p class="channel-name">📺 {result['channel_name']}</p>
                <p class="channel-id">{result['channel_id']}</p>
            </div>
            
            <p class="message">
                This channel is now linked to <strong>{brand_display}</strong>.<br>
                You can now schedule YouTube Shorts for this brand!
            </p>
            
            <a href="/" class="btn">Return to App</a>
            
            <p class="note">
                <strong>🔒 Secure Connection</strong><br>
                Credentials saved securely. You won't need to connect again unless access is revoked.
            </p>
        </div>
    </body>
    </html>
    """)


@router.get("/status")
async def youtube_status(db: Session = Depends(get_db)):
    """
    Get the connection status for all brands' YouTube channels.
    
    Returns which brands have YouTube connected and quota information.
    """
    # Get all connected channels from database
    channels = db.query(YouTubeChannel).all()
    channel_map = {ch.brand: ch for ch in channels}
    
    status = {}
    for brand in VALID_BRANDS:
        if brand in channel_map:
            ch = channel_map[brand]
            status[brand] = {
                "connected": ch.status == "connected",
                "channel_id": ch.channel_id,
                "channel_name": ch.channel_name,
                "status": ch.status,
                "last_upload_at": ch.last_upload_at.isoformat() if ch.last_upload_at else None,
                "last_error": ch.last_error,
                "connected_at": ch.connected_at.isoformat() if ch.connected_at else None
            }
        else:
            status[brand] = {
                "connected": False,
                "channel_id": None,
                "channel_name": None,
                "status": "not_connected"
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
    
    YouTube API has a daily quota of 10,000 units.
    Video uploads cost ~1,600 units each.
    Resets at midnight Pacific Time.
    """
    return youtube_publisher.get_quota_status()


@router.post("/disconnect/{brand}")
async def youtube_disconnect(brand: str, db: Session = Depends(get_db)):
    """
    Disconnect a YouTube channel from a brand.
    
    This removes the stored credentials from the database.
    The user would need to re-authorize to reconnect.
    
    Note: This doesn't revoke the OAuth token on Google's side.
    To fully revoke, user should go to Google Account → Security → Third-party apps.
    """
    brand = brand.lower()
    
    channel = db.query(YouTubeChannel).filter(YouTubeChannel.brand == brand).first()
    
    if channel:
        db.delete(channel)
        db.commit()
        logger.info(f"Disconnected YouTube channel for {brand}")
        return {"success": True, "message": f"YouTube disconnected for {brand}"}
    
    return {"success": False, "message": f"No YouTube connection found for {brand}"}


def get_youtube_credentials_for_brand(brand: str, db: Session) -> Optional[YouTubeCredentials]:
    """
    Get YouTube credentials for a brand from the database.
    
    This is the function used by the scheduler/publisher to get
    the refresh_token needed for uploads.
    
    Args:
        brand: Brand name (e.g., "healthycollege")
        db: Database session
        
    Returns:
        YouTubeCredentials if found and connected, None otherwise
    """
    channel = db.query(YouTubeChannel).filter(
        YouTubeChannel.brand == brand.lower(),
        YouTubeChannel.status == "connected"
    ).first()
    
    if channel:
        return YouTubeCredentials(
            channel_id=channel.channel_id,
            channel_name=channel.channel_name or brand,
            refresh_token=channel.refresh_token
        )
    
    return None


def update_youtube_channel_status(
    brand: str, 
    db: Session,
    status: str = None,
    last_error: str = None,
    last_upload_at: datetime = None
):
    """
    Update the status of a YouTube channel after an upload attempt.
    
    Called by the scheduler after each upload to track success/failure.
    
    Args:
        brand: Brand name
        db: Database session
        status: New status ("connected", "error", "revoked")
        last_error: Error message if upload failed
        last_upload_at: Timestamp of successful upload
    """
    channel = db.query(YouTubeChannel).filter(YouTubeChannel.brand == brand.lower()).first()
    
    if channel:
        if status:
            channel.status = status
        if last_error is not None:
            channel.last_error = last_error
        if last_upload_at:
            channel.last_upload_at = last_upload_at
            channel.last_error = None  # Clear error on success
        
        channel.updated_at = datetime.utcnow()
        db.commit()
