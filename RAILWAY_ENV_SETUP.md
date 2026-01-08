# Railway Environment Variables Setup

## ✅ COMPLETED: System User Token Configuration

You now have a **System User Token** that never expires and has full access to both accounts.

## Railway Environment Variables to Set

Go to your Railway project → Variables tab and add these:

### 🔐 Meta System User Token (Same for Both Accounts)
```bash
# Gym College Account
GYMCOLLEGE_INSTAGRAM_ACCESS_TOKEN=EAANSOCguXOABQZAmZAZC7ocFK2xzzpsBTRBpcU24KHcH1s9iowJRcVtQTgGBLZB2PqUr9Rev1pBlLInzDGKT3r7GDVXbZAL6UZC0u9gb8ZCXlorTnJBCNAlgb16EZBNO9vT8UsLZBE0P0WAbAw4eDjGQY1fgKZCSZBszWL0X8aQWbOqPKNUmB6H3ZCDz3gVavZCvGr6GYEsChlVHdfgcZAy65JDlH280fao2Pvm3rcnUvYWUVZB
GYMCOLLEGE_FACEBOOK_ACCESS_TOKEN=EAANSOCguXOABQZAmZAZC7ocFK2xzzpsBTRBpcU24KHcH1s9iowJRcVtQTgGBLZB2PqUr9Rev1pBlLInzDGKT3r7GDVXbZAL6UZC0u9gb8ZCXlorTnJBCNAlgb16EZBNO9vT8UsLZBE0P0WAbAw4eDjGQY1fgKZCSZBszWL0X8aQWbOqPKNUmB6H3ZCDz3gVavZCvGr6GYEsChlVHdfgcZAy65JDlH280fao2Pvm3rcnUvYWUVZB
GYMCOLLEGE_META_ACCESS_TOKEN=EAANSOCguXOABQZAmZAZC7ocFK2xzzpsBTRBpcU24KHcH1s9iowJRcVtQTgGBLZB2PqUr9Rev1pBlLInzDGKT3r7GDVXbZAL6UZC0u9gb8ZCXlorTnJBCNAlgb16EZBNO9vT8UsLZBE0P0WAbAw4eDjGQY1fgKZCSZBszWL0X8aQWbOqPKNUmB6H3ZCDz3gVavZCvGr6GYEsChlVHdfgcZAy65JDlH280fao2Pvm3rcnUvYWUVZB
GYMCOLLEGE_INSTAGRAM_BUSINESS_ACCOUNT_ID=17841468847801005
GYMCOLLEGE_FACEBOOK_PAGE_ID=421725951022067

# Healthy College Account
HEALTHYCOLLEGE_INSTAGRAM_ACCESS_TOKEN=EAANSOCguXOABQZAmZAZC7ocFK2xzzpsBTRBpcU24KHcH1s9iowJRcVtQTgGBLZB2PqUr9Rev1pBlLInzDGKT3r7GDVXbZAL6UZC0u9gb8ZCXlorTnJBCNAlgb16EZBNO9vT8UsLZBE0P0WAbAw4eDjGQY1fgKZCSZBszWL0X8aQWbOqPKNUmB6H3ZCDz3gVavZCvGr6GYEsChlVHdfgcZAy65JDlH280fao2Pvm3rcnUvYWUVZB
HEALTHYCOLLEGE_FACEBOOK_ACCESS_TOKEN=EAANSOCguXOABQZAmZAZC7ocFK2xzzpsBTRBpcU24KHcH1s9iowJRcVtQTgGBLZB2PqUr9Rev1pBlLInzDGKT3r7GDVXbZAL6UZC0u9gb8ZCXlorTnJBCNAlgb16EZBNO9vT8UsLZBE0P0WAbAw4eDjGQY1fgKZCSZBszWL0X8aQWbOqPKNUmB6H3ZCDz3gVavZCvGr6GYEsChlVHdfgcZAy65JDlH280fao2Pvm3rcnUvYWUVZB
HEALTHYCOLLEGE_META_ACCESS_TOKEN=EAANSOCguXOABQZAmZAZC7ocFK2xzzpsBTRBpcU24KHcH1s9iowJRcVtQTgGBLZB2PqUr9Rev1pBlLInzDGKT3r7GDVXbZAL6UZC0u9gb8ZCXlorTnJBCNAlgb16EZBNO9vT8UsLZBE0P0WAbAw4eDjGQY1fgKZCSZBszWL0X8aQWbOqPKNUmB6H3ZCDz3gVavZCvGr6GYEsChlVHdfgcZAy65JDlH280fao2Pvm3rcnUvYWUVZB
HEALTHYCOLLEGE_INSTAGRAM_BUSINESS_ACCOUNT_ID=17841479849607158
HEALTHYCOLLEGE_FACEBOOK_PAGE_ID=944977965368075

# Legacy/Fallback Tokens (Same System User Token)
INSTAGRAM_ACCESS_TOKEN=EAANSOCguXOABQZAmZAZC7ocFK2xzzpsBTRBpcU24KHcH1s9iowJRcVtQTgGBLZB2PqUr9Rev1pBlLInzDGKT3r7GDVXbZAL6UZC0u9gb8ZCXlorTnJBCNAlgb16EZBNO9vT8UsLZBE0P0WAbAw4eDjGQY1fgKZCSZBszWL0X8aQWbOqPKNUmB6H3ZCDz3gVavZCvGr6GYEsChlVHdfgcZAy65JDlH280fao2Pvm3rcnUvYWUVZB
META_ACCESS_TOKEN=EAANSOCguXOABQZAmZAZC7ocFK2xzzpsBTRBpcU24KHcH1s9iowJRcVtQTgGBLZB2PqUr9Rev1pBlLInzDGKT3r7GDVXbZAL6UZC0u9gb8ZCXlorTnJBCNAlgb16EZBNO9vT8UsLZBE0P0WAbAw4eDjGQY1fgKZCSZBszWL0X8aQWbOqPKNUmB6H3ZCDz3gVavZCvGr6GYEsChlVHdfgcZAy65JDlH280fao2Pvm3rcnUvYWUVZB
FACEBOOK_ACCESS_TOKEN=EAANSOCguXOABQZAmZAZC7ocFK2xzzpsBTRBpcU24KHcH1s9iowJRcVtQTgGBLZB2PqUr9Rev1pBlLInzDGKT3r7GDVXbZAL6UZC0u9gb8ZCXlorTnJBCNAlgb16EZBNO9vT8UsLZBE0P0WAbAw4eDjGQY1fgKZCSZBszWL0X8aQWbOqPKNUmB6H3ZCDz3gVavZCvGr6GYEsChlVHdfgcZAy65JDlH280fao2Pvm3rcnUvYWUVZB
INSTAGRAM_BUSINESS_ACCOUNT_ID=17841468847801005
FACEBOOK_PAGE_ID=421725951022067

# App Configuration
INSTAGRAM_APP_ID=1533600021273075
INSTAGRAM_APP_SECRET=25d65d1962784567128e037600c8314b

# OpenAI (for caption generation)
OPENAI_API_KEY=your-openai-api-key-here
```

## ✅ AUTO-CONFIGURED: Public URL

**You DON'T need to set `PUBLIC_URL_BASE` on Railway!**

The code now automatically detects Railway's public domain using `RAILWAY_PUBLIC_DOMAIN` environment variable (Railway sets this automatically).

**Result:**
- **Local**: Uses `PUBLIC_URL_BASE` from `.env` (tunnel URL like loca.lt/ngrok)
- **Railway**: Automatically uses `https://scheduler-production-cd0b.up.railway.app`

## How It Works

```python
# Auto-detection logic in scheduler
railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN")
if railway_domain:
    public_url_base = f"https://{railway_domain}"  # Railway production
else:
    public_url_base = os.getenv("PUBLIC_URL_BASE", "http://localhost:8000")  # Local dev
```

## Deployment Steps

1. **Push to GitHub** (if not already done)
   ```bash
   git add .
   git commit -m "Add system user token and Railway auto-detection"
   git push origin main
   ```

2. **Railway will auto-deploy**
   - Environment variables persist across deploys
   - No need to restart manually

3. **Test on Railway**
   - Go to https://scheduler-production-cd0b.up.railway.app/scheduled
   - Generate a reel
   - Schedule it or publish immediately
   - Check Instagram/Facebook

## Benefits of This Setup

✅ **Never expires** - System User Token has no expiration  
✅ **Full access** - Can publish to both Gym College and Healthy College  
✅ **No manual switching** - Multi-account publisher handles both  
✅ **Works locally** - Use tunnel for development  
✅ **Works on Railway** - Auto-detects public URL  
✅ **Secure** - Tokens only in environment variables, not in code  

## Troubleshooting

If publishing fails on Railway:
1. Check Railway logs: `railway logs`
2. Verify environment variables are set correctly
3. Test video URL accessibility: `https://scheduler-production-cd0b.up.railway.app/output/videos/[reel_id].mp4`
4. Check that files are being created in `/app/output/videos/` and `/app/output/thumbnails/`

## Local Development

For local development with tunnel:
1. Start localtunnel: `npx localtunnel --port 8000`
2. Copy the URL (e.g., `https://three-maps-run.loca.lt`)
3. Update `.env`: `PUBLIC_URL_BASE=https://three-maps-run.loca.lt`
4. Visit the tunnel URL in browser to accept the warning
5. Restart server: `./run_local.sh`

**Tip:** Use ngrok for more stability: `brew install ngrok && ngrok http 8000`
