#!/bin/bash
# Local Testing Script - Run this to test the app locally with SQLite

echo "🚀 Starting Instagram Reels Automation (Local Mode)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Database: SQLite (./output/schedules.db)"
echo "🌐 Server: http://localhost:8000"
echo "📄 API Docs: http://localhost:8000/docs"
echo "📅 Scheduled: http://localhost:8000/scheduled"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Activate virtual environment and run
cd "$(dirname "$0")"
source venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
