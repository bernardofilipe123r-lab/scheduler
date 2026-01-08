#!/bin/bash
set -e

echo "🚂 Railway Environment Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found"
    echo "📦 Installing Railway CLI..."
    npm install -g @railway/cli
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "🔐 Logging in to Railway..."
    railway login
fi

# Check if linked to project
if ! railway status &> /dev/null; then
    echo "🔗 Linking to Railway project..."
    railway link
fi

echo "📝 Syncing environment variables from .env to Railway..."
echo ""

# Read .env and set variables
while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ $key =~ ^#.*$ ]] && continue
    [[ -z $key ]] && continue
    
    # Remove leading/trailing whitespace
    key=$(echo "$key" | xargs)
    value=$(echo "$value" | xargs)
    
    # Skip if value is empty
    [[ -z $value ]] && continue
    
    # Skip PUBLIC_URL_BASE (Railway auto-detects this)
    [[ $key == "PUBLIC_URL_BASE" ]] && continue
    
    echo "✅ Setting $key"
    railway variables --set "$key=$value" 2>/dev/null || echo "⚠️  Failed to set $key"
done < .env

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Environment variables synced to Railway!"
echo ""
echo "🚀 Railway will auto-deploy on next git push"
echo "📊 Check status: railway status"
echo "📝 View logs: railway logs"
echo ""
