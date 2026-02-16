# Copilot Instructions Research - Reels Automation Platform

**Generated:** February 16, 2026  
**Purpose:** Comprehensive codebase analysis for `.github/copilot-instructions.md` generation

---

## Executive Summary

This is a **production-grade autonomous content engine** that generates, schedules, and publishes social media content (Reels & Posts) across multiple brands and platforms (Instagram, Facebook, YouTube). The system is orchestrated by "Maestro," an AI daemon that manages multiple dynamic AI agents who generate content proposals daily. The architecture is built for scale, supporting unlimited brands with zero content duplication.

**Tech Stack:**
- **Backend:** Python 3.11+, FastAPI, SQLAlchemy, PostgreSQL, APScheduler
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, TanStack Query
- **Media:** Pillow (image), FFmpeg (video), deAPI (AI backgrounds)
- **AI:** DeepSeek (content generation), 3-layer pattern architecture
- **Publishing:** Meta Graph API (Instagram/Facebook), YouTube Data API v3
- **Deployment:** Docker, Railway with persistent volumes

---

## 1. Existing AI Instruction Files

### Found Files:
- **`.github/copilot-instructions.md`** - EXISTS (user's custom orchestrator instructions)

### Content Summary:
The existing file contains **subagent orchestration instructions** that define the AI assistant as an "ORCHESTRATOR ONLY" that should:
- NEVER read files or edit code directly
- Always spawn subagents for all work
- Use a research → spec → implementation workflow
- Create spec documents in `docs/SubAgent docs/`

**Key Rule:** All operations must go through `runSubagent` tool with `description` and `prompt` parameters, never using `agentName: "Plan"`.

**Note:** These are custom workflow instructions, not project/architecture documentation.

---

## 2. Architecture Overview

### 2.1 Core Systems

```
┌─────────────────────────────────────────────────────────────┐
│                        MAESTRO                               │
│   Autonomous AI orchestrator - manages all agents           │
│   • Daily burst at 12PM Lisbon (generates proposals)        │
│   • 8 background cycles (observe, scout, feedback, etc.)    │
│   • Multi-user support with per-user isolation              │
└─────────────────┬───────────────────────────────────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Agent 1 │  │ Agent 2 │  │ Agent N │
│ (Toby)  │  │ (Lexi)  │  │         │
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     └────────────┼────────────┘
                  │
                  ▼
      ┌───────────────────────┐
      │   CONTENT PIPELINE    │
      │  (10-stage process)   │
      └───────────┬───────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│Instagram │ │ Facebook │ │ YouTube  │
│  Reels   │ │  Reels   │ │  Shorts  │
└──────────┘ └──────────┘ └──────────┘
    │             │             │
    ▼             ▼             ▼
[5+ Brands] [5+ Brands]  [5+ Brands]
```

### 2.2 Directory Structure & Purpose

```
app/
├── main.py                    # FastAPI application entry point
├── db_connection.py           # SQLAlchemy session management
│
├── models/                    # SQLAlchemy ORM models
│   ├── base.py               # Base model with common columns
│   ├── jobs.py               # GenerationJob model
│   ├── scheduling.py         # ScheduledReel model
│   ├── brands.py             # Brand configuration model
│   ├── agents.py             # AIAgent, AgentProposal models
│   ├── analytics.py          # PostPerformance, TrendingContent
│   ├── auth.py               # UserProfile, Session models
│   └── ...
│
├── api/                       # FastAPI routes (REST endpoints)
│   ├── routes.py             # Main reels router (legacy)
│   ├── agents/               # Dynamic AI agents CRUD
│   ├── ai_team/              # AI team dashboard
│   ├── analytics/            # Performance metrics
│   ├── auth/                 # Authentication & user management
│   ├── brands/               # Brand management
│   ├── content/              # Jobs, scheduling, publishing
│   ├── maestro/              # Maestro control panel
│   ├── system/               # Health, logs, settings
│   └── youtube/              # YouTube OAuth & publishing
│
├── services/                  # Business logic layer
│   ├── maestro/              # AI orchestrator daemon
│   │   ├── maestro.py       # Main orchestrator (singleton)
│   │   ├── state.py         # Shared state & persistence
│   │   ├── cycles.py        # Background cycles (observe, scout, etc.)
│   │   ├── proposals.py     # Proposal auto-acceptance
│   │   ├── healing.py       # Auto-retry failed jobs
│   │   └── scheduler_logic.py # Auto-scheduling algorithms
│   │
│   ├── agents/               # Dynamic AI agent system
│   │   └── generic_agent.py # DB-driven agent (replaces Toby/Lexi)
│   │
│   ├── content/              # Content generation pipeline
│   │   ├── generator.py     # 3-layer AI content generator
│   │   ├── differentiator.py # Multi-brand content variation
│   │   ├── tracker.py       # Anti-repetition & quality control
│   │   ├── job_manager.py   # Job lifecycle management
│   │   └── job_processor.py # Async job processing
│   │
│   ├── media/                # Media production
│   │   ├── image_generator.py    # Pillow-based image rendering
│   │   ├── video_generator.py    # FFmpeg video production
│   │   ├── ai_background.py      # deAPI AI backgrounds
│   │   ├── caption_builder.py    # Caption + hashtags
│   │   └── post_compositor.py    # Image post composition
│   │
│   ├── publishing/           # Social media publishing
│   │   ├── social_publisher.py   # Instagram & Facebook API
│   │   └── scheduler.py          # DatabaseSchedulerService
│   │
│   ├── brands/               # Brand management
│   │   ├── manager.py       # CRUD operations
│   │   └── resolver.py      # Brand config resolution
│   │
│   ├── analytics/            # Performance tracking
│   │   └── analytics_service.py # Instagram Insights API
│   │
│   └── logging/              # Request/system logging
│       ├── service.py       # Persistent logging service
│       └── middleware.py    # HTTP request capture
│
├── core/                      # Configuration & patterns
│   ├── config.py             # Brand configurations
│   ├── brand_colors.py       # Brand color definitions
│   ├── constants.py          # Global constants
│   ├── viral_patterns.py     # Layer 1: Pattern brain
│   ├── prompt_templates.py   # Layer 2: Prompt templates
│   ├── quality_scorer.py     # Content quality scoring
│   ├── viral_ideas.py        # Example viral content
│   └── cta.py                # Call-to-action templates
│
└── utils/                     # Utility functions
    ├── fonts.py              # Font loading & management
    ├── text_layout.py        # Multi-line text layout
    ├── text_formatting.py    # Smart text wrapping
    └── ffmpeg.py             # FFmpeg wrapper functions

src/                           # React frontend (TypeScript)
├── main.tsx                  # Entry point
├── app/                      # App shell & routing
├── features/                 # Feature modules
├── pages/                    # Page components
└── shared/                   # Shared components & hooks

output/                        # Generated content (persistent volume)
├── videos/                   # MP4 files
├── thumbnails/               # PNG thumbnails
├── posts/                    # Image posts + carousels
└── brand-data/               # Brand logos & assets

docs/SubAgent docs/           # AI-generated specs & research
```

### 2.3 Data Flow: Content Generation → Publishing

```
1. MAESTRO DAILY BURST (12PM Lisbon)
   ├─ Load active agents from DB (ai_agents table)
   ├─ Load active brands from DB (brands table)
   └─ For each agent × brand combination:
      └─ Generate proposals (reel + post)

2. PROPOSAL → JOB CREATION
   ├─ Auto-accept proposal
   ├─ Create GenerationJob (pending)
   └─ Store in generation_jobs table

3. JOB PROCESSING (async background)
   ├─ ContentGeneratorV2: Generate AI content
   │  ├─ Pattern selection (viral_patterns.py)
   │  ├─ DeepSeek API call (prompt_templates.py)
   │  ├─ Quality scoring (quality_scorer.py)
   │  └─ Anti-repetition check (tracker.py)
   │
   ├─ BrandDifferentiator: Create brand variations
   │  └─ 1 base content → 5 unique brand versions
   │
   └─ For each brand:
      ├─ ImageGenerator: Render 1080×1920 image
      │  ├─ AI background (if dark mode)
      │  ├─ Brand colors + logo overlay
      │  └─ Multi-line text layout
      │
      ├─ VideoGenerator: FFmpeg MP4 production
      │  ├─ Image → 7-second video
      │  └─ Background music mixing
      │
      └─ CaptionBuilder: Caption + hashtags

4. READY-TO-SCHEDULE
   ├─ Job status: completed
   └─ brand_outputs: {brand: {reel_id, video, thumbnail}}

5. AUTO-SCHEDULING (Maestro check cycle)
   ├─ Algorithm: schedule_all_ready_reels()
   ├─ Calculate slot: brand.schedule_offset + FIFO
   └─ Create ScheduledReel (scheduled_time)

6. AUTO-PUBLISHING (every 60s)
   ├─ Check for due posts (scheduled_time <= now)
   ├─ Publish to selected platforms:
   │  ├─ Instagram: SocialPublisher.publish_instagram_reel()
   │  ├─ Facebook: SocialPublisher.publish_facebook_reel()
   │  └─ YouTube: YouTubePublisher.upload_short()
   └─ Mark as published with post_ids
```

### 2.4 Key Database Models

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `generation_jobs` | Job lifecycle tracking | job_id, user_id, status, brands, brand_outputs, variant |
| `scheduled_reels` | Publication queue | schedule_id, reel_id, scheduled_time, status, platforms |
| `brands` | Brand configuration | id, display_name, colors, schedule_offset, credentials |
| `ai_agents` | Dynamic AI agents | agent_id, agent_name, personality, strategies, temperature |
| `agent_proposals` | AI proposals | proposal_id, agent_name, content, reasoning, status |
| `post_performance` | Analytics tracking | post_id, platform, views, likes, shares, comments |
| `trending_content` | Trend scouting | topic, source, viral_score, relevance_score |
| `content_history` | Anti-repetition | fingerprint, topic, brand, created_at |
| `user_profiles` | Multi-user support | user_id, email, active, created_at |

---

## 3. Key Patterns & Conventions

### 3.1 Import Structure

**Absolute imports from app root:**
```python
from app.models import GenerationJob, Brand, AIAgent
from app.services.content.generator import ContentGeneratorV2
from app.services.brands.resolver import brand_resolver
from app.core.config import BrandConfig
from app.utils.fonts import get_font_with_fallback
```

**Never use relative imports** (no `from . import` or `from .. import`).

### 3.2 Database Session Management

**Pattern 1: Context manager (recommended)**
```python
from app.db_connection import get_db_session

with get_db_session() as db:
    brands = db.query(Brand).all()
    # Session automatically closed
```

**Pattern 2: FastAPI dependency injection**
```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db_connection import get_db

router = APIRouter()

@router.get("/brands")
def list_brands(db: Session = Depends(get_db)):
    return db.query(Brand).all()
```

**Pattern 3: Manual session (legacy, avoid)**
```python
from app.db_connection import SessionLocal

db = SessionLocal()
try:
    # operations
finally:
    db.close()
```

### 3.3 Service Singletons

**Pattern: Lazy initialization with module-level instance**
```python
# In service module
_instance = None

def get_service():
    global _instance
    if _instance is None:
        _instance = ServiceClass()
    return _instance

# Usage
from app.services.content.generator import get_content_generator
generator = get_content_generator()
```

**Examples:**
- `get_content_generator()` → ContentGeneratorV2
- `brand_resolver` → BrandResolver (module-level)
- `get_maestro()` → MaestroDaemon
- `get_logging_service()` → LoggingService

### 3.4 Error Handling

**Pattern: Try-except with detailed logging**
```python
try:
    result = some_operation()
except Exception as e:
    # Log with context
    self.state.log("agent_name", "Error", f"{str(e)[:200]}", "❌")
    # Increment error counter
    self.state.errors += 1
    # Re-raise if critical, or continue
    traceback.print_exc()
```

**Key principles:**
- Log errors with emoji icons for visual scanning
- Truncate long error messages ([:200])
- Always include context (agent, brand, operation)
- Use `traceback.print_exc()` for debugging
- Store error messages in DB (job.error_message)

### 3.5 API Route Structure

**Pattern: Nested routers with dependency injection**
```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.models import UserProfile

router = APIRouter(prefix="/api/endpoint", tags=["tag"])

@router.get("/path")
async def endpoint(
    db: Session = Depends(get_db),
    current_user: UserProfile = Depends(get_current_user),
):
    """Docstring describing endpoint."""
    # Implementation
    return {"result": data}
```

**Key conventions:**
- Use `/api/` prefix for backend routes
- Frontend routes served by React (no prefix)
- Use `async def` for I/O operations
- Dependency injection for DB, auth
- HTTPException for error responses

### 3.6 File Naming & Organization

| Pattern | Example | Purpose |
|---------|---------|---------|
| `{feature}_routes.py` | `brands_routes.py` | API routes |
| `{service}.py` | `generator.py` | Service class |
| `{domain}.py` | `brands.py` | SQLAlchemy models |
| `{utility}.py` | `fonts.py` | Utility functions |
| `{config}.py` | `config.py` | Configuration |

**File organization rules:**
- One model class per file (unless tightly related)
- Group routes by feature domain in subdirectories
- Services mirror model structure (brands → brands/)
- Utils are pure functions (no state)

### 3.7 Brand Configuration

**CRITICAL: Brand data is database-driven, not hardcoded**

```python
# ✅ CORRECT: Load from database
from app.services.brands.resolver import brand_resolver

brand_config = brand_resolver.get_brand_config("healthycollege")
colors = brand_config.colors
instagram_id = brand_config.instagram_business_account_id

# ❌ WRONG: Hardcoded values
BRAND_COLORS = {
    "healthycollege": "#004f00"  # Never hardcode!
}
```

**Brand data stored in `brands` table:**
- Colors (JSON with light/dark mode)
- Display names
- Social media handles
- API credentials (Instagram, Facebook, YouTube)
- Schedule offsets (stagger posting times)

### 3.8 Multi-User Architecture

**User isolation pattern:**
```python
# ✅ Filter by user_id
jobs = db.query(GenerationJob).filter(
    GenerationJob.user_id == current_user.user_id
).all()

# ✅ Set user_id on create
job = GenerationJob(
    job_id=generate_job_id(),
    user_id=current_user.user_id,
    # ...
)
```

**Multi-user entities:**
- All jobs (generation_jobs)
- All schedules (scheduled_reels)
- All brands (brands)
- All agents (ai_agents)
- All proposals (agent_proposals)

**System-wide entities (no user_id):**
- API quotas (api_quota_usage)
- System logs (system_logs, ai_logs)
- Settings (system_settings)

### 3.9 Content Type Differentiation

**Two content types: `reel` (video) vs `post` (image)**

```python
# Reel: 1080×1920 video with audio
if variant == "reel":
    video_path = generator.generate_video(...)
    platforms = ["instagram", "facebook", "youtube"]

# Post: 1080×1080 image (single or carousel)
elif variant == "post":
    image_path = generator.generate_post_image(...)
    carousel_paths = generator.generate_carousel(...)
    platforms = ["instagram", "facebook"]
```

**Key differences:**
| Property | Reel | Post |
|----------|------|------|
| Dimensions | 1080×1920 (9:16) | 1080×1080 (1:1) |
| Media type | Video (MP4) | Image (PNG) |
| Audio | Background music | None |
| Platforms | IG + FB + YT | IG + FB only |
| Carousel | No | Yes (up to 10 slides) |

---

## 4. Critical Workflows & Commands

### 4.1 Development Setup

```bash
# Backend (Python)
pip install -r requirements.txt

# Frontend (React)
npm install

# Environment variables (create .env file)
DATABASE_URL=postgresql://...
DEEPSEEK_API_KEY=your_key
DEAPI_API_KEY=your_key
SUPABASE_URL=...
SUPABASE_KEY=...
# ... (see .env.example if exists)

# Database initialization
python -c "from app.db_connection import init_db; init_db()"

# Run backend (development)
uvicorn app.main:app --reload --port 8000

# Run frontend (development)
npm run dev

# Build frontend for production
npm run build
```

### 4.2 Docker Deployment

```bash
# Build image
docker build -t reels-automation .

# Run container
docker run -p 8000:8000 \
  -e DATABASE_URL=... \
  -e DEEPSEEK_API_KEY=... \
  -e PORT=8000 \
  -v /app/output:/app/output \
  reels-automation

# Railway deployment
# Automatically deployed via Dockerfile
# Persistent volume mounted at /app/output
```

### 4.3 Testing Key Workflows

```bash
# Test content generation
curl -X POST http://localhost:8000/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "title": "TEST TITLE",
    "content_lines": ["Line 1", "Line 2", "Line 3"],
    "variant": "reel",
    "brands": ["healthycollege"]
  }'

# Test Maestro status
curl http://localhost:8000/api/maestro/status

# Trigger manual burst
curl -X POST http://localhost:8000/api/maestro/trigger-burst

# Check job status
curl http://localhost:8000/jobs/{job_id}

# View scheduled posts
curl http://localhost:8000/api/schedule?status=scheduled

# Health check
curl http://localhost:8000/health
```

### 4.4 Common Debugging Patterns

```python
# Enable detailed logging
print(f"📋 [DEBUG] Variable: {value}", flush=True)

# Check Maestro state
from app.services.maestro.maestro import get_maestro
maestro = get_maestro()
status = maestro.get_status()
print(status["activity_feed"][-10:])  # Last 10 events

# Inspect job progress
from app.db_connection import get_db_session
from app.models import GenerationJob

with get_db_session() as db:
    job = db.query(GenerationJob).filter_by(job_id="GEN-123").first()
    print(f"Status: {job.status}")
    print(f"Progress: {job.progress_percent}%")
    print(f"Current step: {job.current_step}")
    print(f"Brand outputs: {job.brand_outputs}")

# Check brand credentials
from app.services.brands.resolver import brand_resolver
brands = brand_resolver.get_all_brands()
for brand in brands:
    print(f"{brand.display_name}:")
    print(f"  Instagram ID: {brand.instagram_business_account_id or 'MISSING'}")
    print(f"  Facebook ID: {brand.facebook_page_id or 'MISSING'}")
    print(f"  Token: {'✓' if brand.meta_access_token else '✗'}")
```

### 4.5 Database Migrations

**Pattern: Alembic migrations (if set up) OR manual schema updates**

```bash
# Generate migration (if Alembic configured)
alembic revision --autogenerate -m "Description"

# Apply migration
alembic upgrade head

# Manual schema updates (current pattern)
# 1. Update model in app/models/
# 2. Add column with nullable=True or default
# 3. Restart app (SQLAlchemy auto-detects schema changes)
```

**Example: Adding new column**
```python
# In app/models/jobs.py
class GenerationJob(Base):
    # ... existing columns ...
    new_field = Column(String(100), nullable=True)  # Must be nullable!
```

---

## 5. Integration Points & External APIs

### 5.1 DeepSeek AI (Content Generation)

**API:** `https://api.deepseek.com/v1`  
**Used for:** Content generation (titles, lines, captions)  
**Key files:**
- `app/services/content/generator.py` (ContentGeneratorV2)
- `app/core/prompt_templates.py` (SYSTEM_PROMPT, build_runtime_prompt)

**Pattern:**
```python
response = requests.post(
    f"{self.base_url}/chat/completions",
    headers={
        "Authorization": f"Bearer {self.api_key}",
        "Content-Type": "application/json"
    },
    json={
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": runtime_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 1500,
    }
)
```

### 5.2 deAPI (AI Background Images)

**API:** `https://api.deapi.ai/generate`  
**Used for:** Dark mode AI-generated backgrounds  
**Key files:**
- `app/services/media/ai_background.py` (AIBackgroundGenerator)

**Pattern: FIFO queue with status polling**
```python
# 1. Create generation
response = requests.post(
    "https://api.deapi.ai/generate",
    headers={"Authorization": f"Bearer {api_key}"},
    json={"prompt": prompt, "aspect_ratio": "9:16"}
)
generation_id = response.json()["id"]

# 2. Poll for completion (max 60s)
for i in range(60):
    status = requests.get(
        f"https://api.deapi.ai/generations/{generation_id}"
    ).json()
    if status["status"] == "completed":
        image_url = status["output"]
        break
    time.sleep(1)

# 3. Download image
image_data = requests.get(image_url).content
```

### 5.3 Meta Graph API (Instagram & Facebook)

**API:** `https://graph.facebook.com/v21.0`  
**Used for:** Reel publishing, analytics, page info  
**Key files:**
- `app/services/publishing/social_publisher.py` (SocialPublisher)
- `app/services/analytics/analytics_service.py` (AnalyticsService)

**Instagram Reel Publishing (2-step):**
```python
# Step 1: Create container
container_response = requests.post(
    f"https://graph.facebook.com/v21.0/{ig_business_account_id}/media",
    data={
        "media_type": "REELS",
        "video_url": publicly_accessible_url,
        "caption": caption,
        "share_to_feed": "true",
        "access_token": access_token,
    }
)
container_id = container_response.json()["id"]

# Step 2: Publish container
publish_response = requests.post(
    f"https://graph.facebook.com/v21.0/{ig_business_account_id}/media_publish",
    data={
        "creation_id": container_id,
        "access_token": access_token,
    }
)
post_id = publish_response.json()["id"]
```

**Facebook Reel Publishing (1-step):**
```python
response = requests.post(
    f"https://graph.facebook.com/v21.0/{page_id}/video_reels",
    data={
        "upload_phase": "finish",
        "video_id": video_id,  # From chunked upload
        "description": caption,
        "access_token": access_token,
    }
)
```

### 5.4 YouTube Data API v3 (Shorts)

**API:** `https://www.googleapis.com/youtube/v3`  
**Used for:** OAuth, Shorts upload  
**Key files:**
- `app/services/youtube/publisher.py` (YouTubePublisher)
- `app/api/youtube/routes.py` (OAuth flow)

**OAuth Flow:**
```python
# 1. Redirect to Google OAuth
auth_url = (
    "https://accounts.google.com/o/oauth2/v2/auth"
    f"?client_id={CLIENT_ID}"
    f"&redirect_uri={REDIRECT_URI}"
    f"&response_type=code"
    f"&scope=https://www.googleapis.com/auth/youtube.upload"
    f"&access_type=offline"
    f"&prompt=consent"
)

# 2. Exchange code for tokens
token_response = requests.post(
    "https://oauth2.googleapis.com/token",
    data={
        "code": code,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }
)

# 3. Upload video
upload_response = requests.post(
    "https://www.googleapis.com/upload/youtube/v3/videos",
    headers={"Authorization": f"Bearer {access_token}"},
    json={
        "snippet": {
            "title": title,
            "description": description,
            "categoryId": "22",  # People & Blogs
        },
        "status": {"privacyStatus": "public"},
    },
    files={"file": video_file},
)
```

### 5.5 PostgreSQL Database

**Connection:** SQLAlchemy with connection pooling  
**Configuration:**
```python
# app/db_connection.py
DATABASE_URL = os.environ.get("DATABASE_URL")

# Fix postgres:// → postgresql:// (Railway compatibility)
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using
    pool_recycle=3600,   # Recycle connections every hour
)
```

### 5.6 FFmpeg (Video Processing)

**Used for:** Image → Video conversion with audio  
**Key files:**
- `app/utils/ffmpeg.py` (wrapper functions)
- `app/services/media/video_generator.py` (VideoGenerator)

**Pattern:**
```python
ffmpeg_cmd = [
    "ffmpeg", "-y",  # Overwrite
    "-loop", "1",
    "-i", str(image_path),
    "-i", str(audio_path),
    "-c:v", "libx264",
    "-preset", "fast",
    "-t", "7",  # 7 seconds
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    str(output_path),
]
subprocess.run(ffmpeg_cmd, check=True, capture_output=True)
```

---

## 6. Maestro: The AI Orchestrator

### 6.1 Maestro Architecture

**Maestro** is a singleton daemon that runs 8 background cycles:

| Cycle | Frequency | Purpose |
|-------|-----------|---------|
| **CHECK** | 10 min | Triggers daily burst at 12PM Lisbon |
| **HEALING** | 15 min | Auto-retries failed jobs |
| **OBSERVE** | 3 hours | Collects performance metrics |
| **SCOUT** | 4 hours | Scans trending topics |
| **FEEDBACK** | 6 hours | Analyzes 48-72h post performance |
| **EVOLUTION** | Weekly Sun 2AM | Natural selection (agent retirement) |
| **DIAGNOSTICS** | 4 hours | Self-testing subsystems |
| **BOOTSTRAP** | 20 min | Cold-start research (auto-disables) |

### 6.2 Agent System (Dynamic, DB-Driven)

**Architecture Rule:**
> Number of agents MUST equal number of brands. Each agent is "born from" one brand but generates content for ALL brands.

**Agent DNA stored in `ai_agents` table:**
```python
class AIAgent(Base):
    agent_id: str           # Unique identifier
    agent_name: str         # Display name
    personality: str        # Free-form description
    variant: str            # "explorer", "optimizer", etc.
    strategies: JSON        # List of strategies
    temperature: float      # 0.0-1.0
    system_prompt: str      # Full system prompt
    created_for_brand: str  # Brand that spawned this agent
    active: bool
    total_proposals: int
    success_rate: float
```

**Seeding builtin agents on startup:**
```python
# app/services/agents/generic_agent.py
def seed_builtin_agents():
    """Ensure exactly N agents for N brands."""
    brands = get_all_brands()
    existing_agents = get_all_active_agents()
    
    if len(existing_agents) < len(brands):
        # Create new agents for missing brands
        for brand in brands:
            create_agent_for_brand(brand)
```

### 6.3 Daily Burst Workflow

```python
def _run_daily_burst(self):
    """Generate proposals for ALL active users."""
    # 1. Load all active users
    users = db.query(UserProfile).filter_by(active=True).all()
    
    # 2. For each user, run a scoped burst
    for user in users:
        self._run_burst_for_user(user.user_id)
    
    # 3. Mark burst as completed
    set_last_daily_run(datetime.utcnow())

def _run_burst_for_user(self, user_id: str):
    """Generate proposals for this user's brands/agents."""
    # 1. Load user's agents
    agents = get_all_active_agents(user_id=user_id)
    
    # 2. Load user's brands
    brands = _get_all_brands(user_id=user_id)
    
    # 3. Phase 1: Generate REEL proposals (6 per brand)
    for brand in brands:
        for agent in agents:
            proposals = agent.run(
                max_proposals=6 // len(agents),
                content_type="reel",
                brand=brand,
            )
            all_proposals.extend(proposals)
    
    # 4. Phase 2: Generate POST proposals (2 per brand)
    for brand in brands:
        for agent in agents:
            proposals = agent.run(
                max_proposals=2 // len(agents),
                content_type="post",
                brand=brand,
            )
            all_proposals.extend(proposals)
    
    # 5. Auto-accept and process
    self._auto_accept_and_process(all_proposals)
```

### 6.4 Maestro State Persistence

**State stored in `maestro_state` DB table (key-value pairs):**
- `paused`: "true"/"false" (pause generation)
- `posts_paused`: "true"/"false" (legacy, unused)
- `last_daily_run`: ISO timestamp
- Agent metrics (proposals_today, errors, etc.)

**Access pattern:**
```python
# Read
is_paused = _db_get("paused") == "true"

# Write
_db_set("paused", "true")
```

---

## 7. Frontend Architecture (React + TypeScript)

### 7.1 Tech Stack

- **React 18** (modern hooks-based)
- **TypeScript** (strict mode)
- **Vite** (build tool, fast HMR)
- **TanStack Query** (server state management)
- **React Router** (client-side routing)
- **TailwindCSS** (utility-first styling)
- **Recharts** (analytics charts)

### 7.2 Key Pages

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | Dashboard | Job creation & status |
| `/history` | History | Past generations |
| `/scheduled` | Scheduled | Upcoming posts |
| `/brands` | Brands | Brand management |
| `/analytics` | Analytics | Performance metrics |
| `/maestro` | Maestro | Orchestrator control panel |
| `/settings` | Settings | System configuration |
| `/ai-team` | AI Team | Agent management |

### 7.3 API Client Pattern

```typescript
// Using TanStack Query
import { useQuery, useMutation } from '@tanstack/react-query';

// Fetch data
const { data, isLoading, error } = useQuery({
  queryKey: ['jobs'],
  queryFn: async () => {
    const res = await fetch('/jobs/list');
    return res.json();
  },
});

// Mutate data
const mutation = useMutation({
  mutationFn: async (payload) => {
    const res = await fetch('/jobs/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
  },
});
```

---

## 8. Recommendations for `.github/copilot-instructions.md`

### 8.1 What Should Be Included

1. **Project Overview** (2-3 sentences)
   - Autonomous content engine for multi-brand social media
   - Maestro orchestrates AI agents → content generation → publishing
   - Supports Instagram, Facebook, YouTube

2. **Tech Stack Summary**
   - Backend: FastAPI + PostgreSQL + SQLAlchemy
   - Frontend: React 18 + TypeScript + Vite + TailwindCSS
   - Media: Pillow + FFmpeg + deAPI
   - AI: DeepSeek + 3-layer pattern architecture
   - Deployment: Docker + Railway

3. **Architecture Rules** (Critical!)
   - Brand data is DATABASE-DRIVEN, never hardcoded
   - Use absolute imports from `app.` namespace
   - Database sessions via `get_db_session()` context manager
   - Service singletons via `get_service()` pattern
   - Multi-user isolation with `user_id` filtering

4. **File Organization**
   - `app/models/` - SQLAlchemy ORM
   - `app/api/` - FastAPI routes (grouped by domain)
   - `app/services/` - Business logic (mirrors models)
   - `app/core/` - Configuration & patterns
   - `app/utils/` - Pure utility functions
   - `src/` - React frontend

5. **Key Workflows**
   - Content generation: GenerationJob → agent proposals → media production
   - Scheduling: Ready jobs → auto-schedule → publish on time
   - Maestro: Daily burst at 12PM Lisbon → 8 background cycles

6. **Common Patterns**
   - Error handling: Try-except with logging + emoji icons
   - API routes: Nested routers + dependency injection
   - Brand resolution: `brand_resolver.get_brand_config(brand_id)`
   - Content types: `reel` (video) vs `post` (image)

7. **Integration Points**
   - DeepSeek AI (content generation)
   - deAPI (AI backgrounds)
   - Meta Graph API (Instagram/Facebook)
   - YouTube Data API (Shorts)
   - FFmpeg (video processing)

8. **Development Commands**
   ```bash
   # Backend
   uvicorn app.main:app --reload --port 8000
   
   # Frontend
   npm run dev
   
   # Build
   npm run build
   
   # Docker
   docker build -t reels-automation .
   ```

9. **Critical File References**
   - Entry point: `app/main.py`
   - Orchestrator: `app/services/maestro/maestro.py`
   - Content gen: `app/services/content/generator.py`
   - Publishing: `app/services/publishing/social_publisher.py`
   - Brand resolution: `app/services/brands/resolver.py`

10. **Testing Patterns**
    - Manual API testing via curl
    - Check Maestro status: `/api/maestro/status`
    - Trigger burst: `/api/maestro/trigger-burst`
    - Health check: `/health`

### 8.2 What Should NOT Be Included

- ❌ Specific API keys or credentials
- ❌ Database connection strings
- ❌ Hardcoded brand configurations
- ❌ Internal business logic details
- ❌ Complete code examples (keep them concise)
- ❌ Debugging console output samples
- ❌ Version history or changelog

### 8.3 Tone & Style

- **Concise:** Focus on actionable information
- **Structured:** Use headings, lists, tables
- **Reference-heavy:** Link to specific files/functions
- **Pattern-focused:** Show "how we do X" not "here's all the code"
- **Rule-based:** State architectural constraints clearly

### 8.4 Suggested Structure

```markdown
# Reels Automation Platform - Developer Guide

## Overview
[2-3 sentence summary + tech stack]

## Architecture
[High-level diagram + key components]

## Patterns & Conventions
- Import structure
- Database sessions
- Error handling
- API routes
- Service singletons

## Key Workflows
- Content generation pipeline
- Scheduling & publishing
- Maestro orchestration

## File Organization
[Directory structure with purpose]

## Integration Points
[External APIs with key files]

## Development
[Setup, run, build, test commands]

## Critical Rules
- Database-driven configuration
- Multi-user isolation
- Content type differentiation
- Brand credential resolution

## Common Tasks
- Creating a new API endpoint
- Adding a database model
- Modifying content generation
- Debugging Maestro
```

---

## 9. Additional Context

### 9.1 Notable Design Decisions

1. **Why 3-Layer Content Architecture?**
   - Layer 1: Static viral patterns (no API calls)
   - Layer 2: Cached prompt templates (reused across requests)
   - Layer 3: Minimal runtime input (reduces tokens by 80%)
   - **Result:** ~500 tokens/request vs 3000+ in V1

2. **Why Database-Driven Brands?**
   - Original system had hardcoded brand constants everywhere
   - Refactored to `brands` table for CRUD operations
   - Allows unlimited brand scaling without code changes
   - **Migration:** `scripts/migrate_brand_colors.py`

3. **Why Dynamic Agents?**
   - Originally had hardcoded Toby + Lexi classes
   - GenericAgent reads config from `ai_agents` table
   - Enables runtime agent creation/modification via API
   - **Rule:** N agents = N brands (enforced by Maestro)

4. **Why Maestro Singleton?**
   - Needs to persist state across FastAPI request cycles
   - APScheduler background jobs require stable instance
   - Module-level singleton pattern ensures single instance

5. **Why Multi-User Support?**
   - Original design was single-user (no user_id)
   - Added `user_profiles` table + user_id foreign keys
   - All entities now scoped to user (except system logs)
   - **Auth:** Supabase JWT tokens + middleware

### 9.2 Performance Optimizations

- **Brand resolution caching:** `@lru_cache` on lookup functions
- **Connection pooling:** SQLAlchemy pool with pre-ping
- **Async image generation:** Background job processing
- **React code splitting:** Vite lazy-loads pages
- **API response caching:** TanStack Query client-side cache

### 9.3 Security Considerations

- **Credentials in DB:** Brand tokens stored encrypted (at rest)
- **User auth:** Supabase JWT verification middleware
- **CORS:** Restricted origins from environment variable
- **SQL injection:** SQLAlchemy ORM parameterized queries
- **File access:** Output directory isolated to `/app/output`

### 9.4 Logging & Observability

- **Request logging:** All HTTP requests captured to `system_logs`
- **AI activity logs:** Maestro/agent actions to `ai_logs`
- **Retention:** 7-day auto-cleanup (configurable)
- **Deployment tracking:** `DEPLOYMENT_ID` env var

### 9.5 Known Limitations

- **Video processing:** Requires FFmpeg installed (Docker layer)
- **AI backgrounds:** 60-second timeout for deAPI queue
- **YouTube OAuth:** Requires manual token refresh (90-day expiry)
- **Instagram rates:** Meta Graph API limits (varies by account size)
- **Concurrent jobs:** Max ~10 simultaneous (semaphore limit)

---

## 10. Summary & Next Steps

### 10.1 Key Takeaways

This is a **production-grade, multi-tenant, AI-powered content automation platform** with:

✅ **Robust architecture:** Layered services, database-driven config, multi-user support  
✅ **Autonomous operation:** Maestro daemon generates & publishes content daily  
✅ **Scalable design:** Unlimited brands, dynamic agents, brand-specific variations  
✅ **Full-stack:** FastAPI backend + React frontend + Docker deployment  
✅ **Platform integration:** Instagram, Facebook, YouTube (all major short-form video platforms)

### 10.2 Recommended `.github/copilot-instructions.md` Sections

1. **Overview** (what is this project)
2. **Tech Stack** (technologies used)
3. **Architecture** (high-level components)
4. **Patterns & Conventions** (how code is organized)
5. **Key Workflows** (content generation → publishing)
6. **File Organization** (directory structure)
7. **Integration Points** (external APIs)
8. **Development** (setup & run commands)
9. **Critical Rules** (architectural constraints)
10. **Common Tasks** (how to add features, debug)

### 10.3 Files to Reference Explicitly

| Purpose | File Path |
|---------|-----------|
| Entry point | `app/main.py` |
| Orchestrator | `app/services/maestro/maestro.py` |
| Content gen | `app/services/content/generator.py` |
| Publishing | `app/services/publishing/social_publisher.py` |
| Brand config | `app/services/brands/resolver.py` |
| Job model | `app/models/jobs.py` |
| API routes | `app/api/{domain}/routes.py` |
| Frontend entry | `src/main.tsx` |

### 10.4 Spec Document Location

**Output:** `docs/SubAgent docs/copilot-instructions-research.md` ✅

---

**End of Research Document**
