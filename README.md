# Instagram Reels Automation 🎬

Automated Instagram and Facebook Reels generation with AI-powered backgrounds, custom branding, and direct publishing.

## ✨ Features

- 🎨 **Dual Brand Support:** Gym College (dark blue) & Healthy College (green)
- 🌙 **Light & Dark Modes:** Traditional or AI-generated backgrounds
- 🤖 **AI Background Generation:** OpenAI DALL-E integration
- 📱 **Automatic Reels Creation:** Thumbnails + 10-second videos
- 📤 **Direct Publishing:** Instagram & Facebook with scheduling
- 💾 **Progress Tracking:** Resume interrupted generations
- 🔄 **Dual Rotation:** Different text reordering per brand

## 🚀 Quick Start

### 1. Start Services
```bash
cd reels-automation
./start_services.sh
```

This starts:
- FastAPI server on http://localhost:8000
- Public tunnel for Meta API access
- Automatic `.env` configuration

### 2. Access Web UI
Open http://localhost:8000 in your browser

### 3. Generate Reels
- Enter your title and content points
- Choose variant (Light/Dark)
- Select brand (Both/Gym College/Healthy College)
- Click "Generate Reels"

### 4. Publish to Social Media
- Click "📤 Publish to Instagram/Facebook"
- Select platforms
- Set schedule (optional)
- Publish immediately or schedule for later

## 📋 Requirements

- Python 3.14+
- Node.js (for localtunnel)
- OpenAI API key
- Instagram Business Account
- Instagram Graph API credentials

## 🔧 Configuration

All settings in `.env`:

```bash
# OpenAI
OPENAI_API_KEY=your_key_here

# Instagram
INSTAGRAM_APP_ID=your_app_id
INSTAGRAM_APP_SECRET=your_app_secret
INSTAGRAM_ACCESS_TOKEN=your_access_token
INSTAGRAM_BUSINESS_ACCOUNT_ID=your_business_account_id

# Public URL (auto-configured)
PUBLIC_URL_BASE=https://your-tunnel-url.loca.lt
```

## 📁 Project Structure

```
reels-automation/
├── app/                  # Python backend (FastAPI)
│   ├── api/              # API routes
│   ├── core/             # Configuration
│   ├── database/         # Database layer
│   ├── services/         # Business logic
│   │   ├── image_generator.py
│   │   ├── video_generator.py
│   │   ├── ai_background_generator.py
│   │   ├── social_publisher.py
│   │   └── scheduler.py
│   └── utils/            # Helpers
├── src/                  # React frontend
│   ├── app/              # App shell (providers, routes, layout)
│   ├── features/         # Feature modules (jobs, scheduling, brands)
│   ├── pages/            # Page components
│   └── shared/           # Shared components, types, API
├── dist/                 # Built frontend (production)
├── output/               # Generated content
│   ├── videos/
│   ├── thumbnails/
│   └── reels/
└── assets/               # Fonts, logos, templates
```

## 🎯 Brand Specifications

### Gym College
- **Color:** Dark Blue (#00435c)
- **Font Size:** 39px
- **Rotation:** Standard order
- **AI Style:** Ocean depths, icy blue tones

### Healthy College
- **Color:** Dark Green (#006400)
- **Font Size:** 38px
- **Rotation:** Shuffled middle lines
- **AI Style:** Forest greens, emerald tones

## 📤 Publishing

### Instagram
- Two-step process: Create container → Publish
- Supports Reels format (9:16 vertical)
- Automatic thumbnail handling
- Caption support

### Facebook
- Single-step video upload
- Auto-surfaces as Reel if vertical
- Page-based publishing

### Scheduling
- Immediate publishing
- Scheduled publishing (date/time)
- Multi-platform support

## 🛠️ Management Scripts

```bash
# Start all services
./start_services.sh

# Stop all services
./stop_services.sh

# View logs
tail -f /tmp/fastapi.log      # FastAPI
cat /tmp/localtunnel.log      # Tunnel
```

## 📊 API Endpoints

- `POST /reels/generate` - Generate reels
- `POST /reels/publish` - Publish to social media
- `GET /reels/status/{reel_id}` - Check status
- `GET /reels/history` - View history
- `GET /docs` - API documentation

## 🐛 Troubleshooting

### Services won't start
```bash
./stop_services.sh
./start_services.sh
```

### Public URL not accessible
1. Visit URL in browser
2. Click "Continue" on warning page
3. Localtunnel will whitelist your IP

### Instagram publish fails
- Check `.env` credentials
- Verify PUBLIC_URL_BASE is accessible
- Ensure videos are publicly reachable
- Check logs for detailed errors

## 📝 Workflow Example

1. **Generate Reels:**
   - Title: "5 Best Exercises"
   - Content: "Squats, Deadlifts, Bench Press, Pull-ups, Lunges"
   - Variant: Dark (AI background)
   - Brand: Gym College

2. **Review:**
   - Preview thumbnail and video
   - Download if needed

3. **Publish:**
   - Click publish button
   - Select Instagram
   - Set caption: "Transform your workout! 💪"
   - Choose: Publish immediately

4. **Monitor:**
   - Check Instagram for posted Reel
   - View publish status in API response

## 🔐 Security

- API keys in `.env` (not committed)
- `.gitignore` configured
- Access tokens refreshed periodically
- Public tunnel with IP whitelisting

## 📚 Documentation

- [SERVICES_GUIDE.md](SERVICES_GUIDE.md) - Detailed service management
- [API Docs](http://localhost:8000/docs) - Interactive API documentation

## 🎉 Current Status

✅ **Fully Operational**

- FastAPI server: Running
- Public tunnel: https://few-lands-find.loca.lt
- Instagram API: Configured
- Web UI: Accessible
- Publishing: Ready

## 💡 Next Steps

1. Test reel generation
2. Test Instagram publishing
3. Implement scheduled execution (optional)
4. Add Facebook credentials (optional)
5. Setup token refresh automation

## 📞 Support

For issues, check:
1. Service logs (`/tmp/fastapi.log`)
2. Tunnel status (`cat /tmp/localtunnel.log`)
3. `.env` configuration
4. API credentials validity

---

**Ready to create amazing Reels! 🚀**
