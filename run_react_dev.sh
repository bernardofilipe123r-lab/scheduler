#!/bin/bash
# Run React frontend in development mode with hot reload
# The Vite dev server proxies API calls to the FastAPI backend

cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "⚛️ Starting React dev server on http://localhost:3000"
echo "📡 API calls proxied to FastAPI backend on http://localhost:8000"
npm run dev
