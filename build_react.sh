#!/bin/bash
# Build React frontend for production

cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

echo "🔨 Building React frontend..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build complete! Files in dist/"
else
    echo "❌ Build failed"
    exit 1
fi
