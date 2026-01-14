# Railway Persistent Storage Solutions

## Problem
When you redeploy on Railway, the container's file system is wiped (ephemeral storage), but the PostgreSQL database keeps the file paths. This causes "Thumbnail not found" and "Video not found" errors after deployment.

## Solution Options

### Option 1: Railway Volume (Recommended - If Available)

**Check if volumes are available on your plan:**

1. In Railway Dashboard, click on your `scheduler` service
2. Look in the left sidebar or top tabs for "Volumes" or "Storage"
3. If not visible, try the Railway CLI:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Add volume
railway volume create output-storage /app/output
```

### Option 2: Use Railway's Built-in Volume Mount (Current Setup)

Your code already checks for `/app/output` - Railway may automatically provide this as a volume if you request it via support or if it's enabled by default.

**Test if it's working:**
- Deploy and generate a reel
- Check Railway logs for: `📁 Static files directory: /app/output`
- Redeploy (without code changes)
- Try accessing the old reel - if it works, volume is persistent!

### Option 3: Cloud Storage (Most Reliable for Production)

Use AWS S3, Cloudflare R2, or similar for permanent file storage.

### How it Works

- The `railway.json` file now includes volume mount configuration
- All files in `/app/output` (videos, thumbnails, reels) persist across deployments
- The database and files stay in sync

### Verification

After deployment with the volume:
1. Generate a new reel
2. Redeploy the service
3. The reel should still be visible and playable

### Important Notes

- Volumes are **per service** - each Railway service needs its own volume
- Volume data persists even if you delete the service (you can delete the volume separately)
- You can browse volume contents in Railway's UI under Settings → Volumes
- The first deployment after adding the volume might not show old files (they're gone), but new files will persist

### Cost

Railway volumes are included in your plan:
- Hobby: 100 GB included
- Pro: 100 GB included + pay for overages

Your current usage (~100 MB of videos) is well within limits.
