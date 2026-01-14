# Railway Volume Setup Guide

## Problem
When you redeploy on Railway, the container's file system is wiped (ephemeral storage), but the PostgreSQL database keeps the file paths. This causes "Thumbnail not found" and "Video not found" errors after deployment.

## Solution: Persistent Volume

Railway Volumes provide persistent storage that survives across deployments.

### Setup Steps (Railway UI Only - No Code Changes Needed)

1. **Go to your Railway dashboard** → Select `scheduler` service

2. **Click Settings** tab (left sidebar)

3. **Scroll down to "Volumes"** section

4. **Click "+ New Volume"** button

5. **Fill in the form**:
   - **Mount Path**: `/app/output` (this is where your videos/thumbnails are stored)
   - Leave other settings as default
   - Click **"Add"**

6. **Wait for automatic redeploy** - Railway will restart your service with the volume attached

**Note**: Railway volumes are configured ONLY through the UI, not in railway.json or code.

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
