# Meta API Setup Guide

To actually publish reels to Instagram and Facebook, you need to configure Meta API credentials.

## ⚠️ Current Status

The system is showing "Successfully published" but **nothing is actually being posted** because these credentials are missing:

- `META_ACCESS_TOKEN` - Your Meta/Facebook API token
- `INSTAGRAM_BUSINESS_ACCOUNT_ID` - Your Instagram Business Account ID
- `FACEBOOK_PAGE_ID` - Your Facebook Page ID (optional, for Facebook posting)

## 🚀 Quick Setup

### 1. Create a Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Click "My Apps" → "Create App"
3. Choose "Business" as the app type
4. Fill in your app details

### 2. Get Required IDs and Tokens

#### Instagram Business Account ID:
```bash
# Use Meta Graph API Explorer
https://developers.facebook.com/tools/explorer/

# Query:
GET /me/accounts
# Then for each page:
GET /{page-id}?fields=instagram_business_account
```

#### Access Token:
1. In Meta App Dashboard → Tools → Graph API Explorer
2. Select your app
3. Add permissions: `pages_read_engagement`, `instagram_basic`, `instagram_content_publish`
4. Click "Generate Access Token"
5. **Important**: Convert to long-lived token (60 days) or Page Access Token (never expires)

### 3. Add to `.env` File

Create or edit `.env.local` (for local testing):

```bash
# Meta API Credentials
META_ACCESS_TOKEN=your_access_token_here
INSTAGRAM_BUSINESS_ACCOUNT_ID=your_instagram_business_id
FACEBOOK_PAGE_ID=your_facebook_page_id  # Optional

# Public URL (for Railway or production)
PUBLIC_URL_BASE=https://your-app.railway.app
```

For Railway deployment, add these as environment variables in the Railway dashboard.

## 📚 Detailed Documentation

### Required Permissions

Your Meta App needs these permissions:
- `pages_read_engagement`
- `pages_manage_posts`
- `instagram_basic`
- `instagram_content_publish`

### Video Requirements

Instagram Reels must meet these specs:
- **Format**: MP4 or MOV
- **Codec**: H.264
- **Resolution**: 720p minimum (1080p recommended)
- **Aspect Ratio**: 9:16 (vertical)
- **Duration**: 3-90 seconds
- **Size**: Under 1GB
- **URL**: Must be publicly accessible HTTPS URL

### Troubleshooting

**"Instagram credentials not configured"**
- Check `.env` file has `META_ACCESS_TOKEN` and `INSTAGRAM_BUSINESS_ACCOUNT_ID`
- Restart server after adding credentials: `./run_local.sh`

**"Error validating access token"**
- Token may have expired (they expire after 60-90 days)
- Generate a new long-lived token or use Page Access Token

**"Video URL not accessible"**
- For local testing, you need a public URL (use ngrok or Railway)
- Video must be accessible via HTTPS

**"Invalid business account"**
- Make sure you're using an Instagram **Business** or **Creator** account (not personal)
- The account must be linked to a Facebook Page

## 🧪 Testing Without API

While setting up credentials, you can:
1. Generate reels locally ✅
2. Download reels to folders ✅  
3. Schedule reels (stored in database) ✅
4. Manually upload to Instagram ✅

Publishing to Instagram/Facebook will fail gracefully with clear error messages until credentials are configured.

## 🔗 Useful Links

- [Meta for Developers](https://developers.facebook.com/)
- [Instagram Graph API Docs](https://developers.facebook.com/docs/instagram-api)
- [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
