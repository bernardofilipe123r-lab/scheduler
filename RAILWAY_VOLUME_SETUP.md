# Railway Volume Setup Guide

## Problem
When you redeploy on Railway, the container's file system is wiped (ephemeral storage), but the PostgreSQL database keeps the file paths. This causes "Thumbnail not found" and "Video not found" errors after deployment.

## Solution: Create a Volume in Railway

### Step-by-Step Instructions

1. **Open Railway Dashboard** → Navigate to your `scheduler` service

2. **Create the Volume**:
   - In the Railway dashboard, find the option to create a new volume
   - **Mount Path**: `/app/output`
   - Click **Create** or **Add Volume**

3. **Redeploy** - Railway will automatically redeploy your service with the volume attached

4. **Verify** - After deployment completes:
   - Generate a new reel
   - Check that thumbnails and videos load
   - Redeploy again (no code changes)
   - The files should still be there!

### How It Works

- The volume is a persistent disk that survives deployments
- Everything in `/app/output` (videos, thumbnails, reels, database) persists
- Your code already uses `/app/output` when it detects the path exists
- Database and files stay in sync across deployments

### Important Notes

- **Old files are gone** - Files from before the volume was created cannot be recovered
- **New files persist** - All files generated after volume creation will survive redeployments
- **Volume is separate** - Even if you delete the service, the volume remains (delete separately if needed)

### Troubleshooting

If files still disappear after creating the volume:
1. Check Railway deployment logs for: `📁 Static files directory: /app/output`
2. Verify the volume mount path is exactly `/app/output`
3. Ensure the volume is attached to the correct service
4. Try generating a brand new reel after the volume is attached

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
