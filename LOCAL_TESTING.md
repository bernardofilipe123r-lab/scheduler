# Local Testing Guide

## Quick Start

1. **First Time Setup**
```bash
# Create your .env file
cp .env.example .env

# Add your OpenAI API key
nano .env  # or use any text editor
```

2. **Run the Server**
```bash
./run_local.sh
```

3. **Access the Application**
- Main UI: http://localhost:8000
- API Docs: http://localhost:8000/docs  
- Scheduled Posts: http://localhost:8000/scheduled

## What Works Locally

✅ **Fully Functional (No External Services Required)**
- Reel generation (thumbnails, images, videos)
- Local SQLite database (at `./output/schedules.db`)
- Scheduling system
- Web UI
- API endpoints

⚠️ **Requires Credentials (Optional for Testing)**
- OpenAI API (for AI-generated content) - Set `OPENAI_API_KEY` in `.env`
- Instagram/Facebook publishing - Needs `META_ACCESS_TOKEN`

## Database

**Local (SQLite)**
- Location: `./output/schedules.db`
- Auto-created on first run
- No setup required
- Perfect for testing

**Production (PostgreSQL)**
- Used on Railway
- Set `DATABASE_URL` environment variable
- Automatically switches from SQLite

## Testing Without Credentials

You can test reel generation without any API keys by:
1. Using the web UI at http://localhost:8000
2. Creating reels with manual content (not AI-generated)
3. Scheduling posts (they won't actually publish without credentials)
4. Viewing scheduled posts at http://localhost:8000/scheduled

## Troubleshooting

**Port Already in Use**
```bash
# Kill existing server
pkill -f "uvicorn app.main"

# Or use a different port
python -m uvicorn app.main:app --port 8001
```

**Missing Packages**
```bash
source venv/bin/activate
pip install -r requirements.txt
```

**Database Errors**
```bash
# Delete and recreate database
rm output/schedules.db
# Restart server - it will recreate automatically
```

## Project Structure Clean-Up Summary

**Removed:**
- ❌ DEPLOYMENT.md
- ❌ DEPLOYMENT_COMPLETE.md  
- ❌ RAILWAY.md
- ❌ STATUS.md
- ❌ UI_IMPROVEMENTS.md
- ❌ check_scheduled.py
- ❌ check_status.sh
- ❌ docker-compose.yml
- ❌ start.sh, start_services.sh, stop_services.sh

**Added:**
- ✅ .env.example (environment template)
- ✅ run_local.sh (simple local testing script)
- ✅ LOCAL_TESTING.md (this file)

**Kept:**
- ✅ README.md (comprehensive documentation)
- ✅ Dockerfile (for Railway deployment)
- ✅ railway.json (Railway configuration)
- ✅ start.py (production startup script)

## Next Steps

1. **For Local Development**: Just run `./run_local.sh`
2. **For Production**: Already deployed on Railway
3. **Add API Keys**: Edit `.env` to enable AI features and publishing
