#!/bin/bash
set -e

echo "🚀 Starting Local Development Environment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Kill existing processes
echo "🔍 Cleaning up existing processes..."
pkill -f localtunnel || true
pkill -f uvicorn || true
sleep 2

# Start localtunnel in background
echo "🌐 Starting localtunnel..."
npx localtunnel --port 8000 > /tmp/tunnel.log 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel to start and get URL
echo "⏳ Waiting for tunnel URL..."
sleep 5

TUNNEL_URL=$(grep -o 'https://[a-z-]*\.loca\.lt' /tmp/tunnel.log | head -1)

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ Failed to get tunnel URL"
    cat /tmp/tunnel.log
    exit 1
fi

echo "✅ Tunnel URL: $TUNNEL_URL"

# Update .env with tunnel URL
echo "📝 Updating .env..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^PUBLIC_URL_BASE=.*|PUBLIC_URL_BASE=$TUNNEL_URL|" .env
else
    sed -i "s|^PUBLIC_URL_BASE=.*|PUBLIC_URL_BASE=$TUNNEL_URL|" .env
fi

echo "✅ .env updated"

# Open tunnel URL in browser to bypass warning
echo "🌍 Opening tunnel URL in browser (accept the warning)..."
sleep 2
open "$TUNNEL_URL" 2>/dev/null || xdg-open "$TUNNEL_URL" 2>/dev/null || echo "Please visit: $TUNNEL_URL"

echo ""
echo "⚠️  IMPORTANT: Visit $TUNNEL_URL in your browser and click 'Continue'"
echo "⏳ Waiting 10 seconds for you to accept the warning..."
sleep 10

# Start the server
echo ""
echo "🚀 Starting server..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Database: SQLite (./output/schedules.db)"
echo "🌐 Local: http://localhost:8000"
echo "🌐 Public: $TUNNEL_URL"
echo "📄 API Docs: http://localhost:8000/docs"
echo "📅 Scheduled: http://localhost:8000/scheduled"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Trap to clean up on exit
trap 'echo ""; echo "👋 Shutting down..."; pkill -f localtunnel; pkill -f uvicorn; exit 0' INT TERM

# Start server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
