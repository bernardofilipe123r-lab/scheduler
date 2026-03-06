<div align="center">

<br>

```
██╗   ██╗██╗██████╗  █████╗ ██╗  ████████╗ ██████╗ ██████╗ ██╗   ██╗
██║   ██║██║██╔══██╗██╔══██╗██║  ╚══██╔══╝██╔═══██╗██╔══██╗╚██╗ ██╔╝
██║   ██║██║██████╔╝███████║██║     ██║   ██║   ██║██████╔╝ ╚████╔╝
╚██╗ ██╔╝██║██╔══██╗██╔══██║██║     ██║   ██║   ██║██╔══██╗  ╚██╔╝
 ╚████╔╝ ██║██║  ██║██║  ██║███████╗██║   ╚██████╔╝██████╔╝   ██║
  ╚═══╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝    ╚═════╝ ╚═════╝    ╚═╝
```

**It doesn't just publish content. It thinks.**

<br>

![Python](https://img.shields.io/badge/python-3.14+-00435c?style=flat-square&logo=python&logoColor=white)
![React](https://img.shields.io/badge/react-18-00435c?style=flat-square&logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/fastapi-latest-00435c?style=flat-square&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgresql-17-00435c?style=flat-square&logo=postgresql&logoColor=white)
![Railway](https://img.shields.io/badge/railway-deployed-00435c?style=flat-square&logo=railway&logoColor=white)
![License](https://img.shields.io/badge/license-proprietary-111827?style=flat-square)

<br>

**[viraltoby.com](https://viraltoby.com)**

</div>

---

<br>

> *Most platforms schedule posts. This one dreams them into existence.*

<br>

## What is ViralToby?

A **multi-tenant SaaS platform** for autonomous social media content creation and publishing. Not a scheduler. Not a template tool. A system that **observes, learns, creates, and publishes** — across any number of brands, five social platforms, any niche — while you sleep.

Every user brings their own brands. Every brand has its own **Content DNA** — niche, tone, target audience, visual style, topic categories. The platform adapts to all of them. Health, finance, tech, fitness, cooking — it doesn't matter. Toby learns your brand and creates for it.

<br>

## The Architecture

```
                    ┌─────────────────────────────┐
                    │           TOBY               │
                    │    Autonomous AI Strategist   │
                    │   thinks · observes · scouts  │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │     CONTENT PIPELINE          │
                    │  10 stages · zero human input │
                    │                               │
                    │  pattern → prompt → generate  │
                    │  score → deduplicate → split   │
                    │  render → produce → caption    │
                    │  → publish                     │
                    └──────────┬──────────────────┘
                               │
        ┌──────────┬───────────┼───────────┬──────────┐
        ▼          ▼           ▼           ▼          ▼
   ┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
   │Instagram││Facebook ││ YouTube ││ Threads ││ TikTok  │
   │  Reels  ││  Reels  ││ Shorts  ││  Posts  ││ Videos  │
   └─────────┘└─────────┘└─────────┘└─────────┘└─────────┘
        │          │           │           │          │
        ▼          ▼           ▼           ▼          ▼
     ×∞ brands  ×∞ brands  ×∞ brands  ×∞ brands  ×∞ brands
```

<br>

## Under the Hood

| | | |
|:---|:---|:---|
| **Brain** | DeepSeek AI | Content ideation, captions, differentiation |
| **Eyes** | deAPI + Pexels | AI-generated backgrounds + stock image sourcing |
| **Scout** | NewsData.io + Tavily | Real-time story discovery and trend detection |
| **Strategist** | Toby Agent | 11 cognitive agents, 4 strategies, 0 supervision |
| **Engine** | FFmpeg + Pillow + Konva | Image rendering, carousel slides, video production |
| **Spine** | FastAPI + PostgreSQL | REST API, jobs, scheduling, analytics, billing |
| **Face** | React 18 + TypeScript | Full dashboard — brands, analytics, content, admin |
| **Reach** | Meta + YouTube + TikTok APIs | 5-platform OAuth publishing at scale |
| **Home** | Docker + Railway | Cloud-native, auto-deploy on push |

<br>

## The Agent

His name is **Toby**. He doesn't wait for instructions.

```
EXPLORE     → finds topics nobody's tried yet
ITERATE     → fixes what underperformed
DOUBLE DOWN → amplifies what went viral
TRENDING    → adapts what the internet is talking about
```

He runs on an **APScheduler tick loop** — every 5 minutes he evaluates: buffer fill → metric scoring → strategy analysis → trend discovery → phase advancement. 11 specialized cognitive agents (analyst, creator, critic, scout, strategist, publisher, reflector, meta-learner, intelligence, pattern analyzer, experiment designer) collaborate through a shared memory subsystem.

Thompson Sampling drives strategy selection. Experiments run A/B tests autonomously. All state persists in PostgreSQL — survives deploys and restarts.

He never sleeps.

<br>

## Content DNA

Every brand gets a **Content DNA** profile — stored in the `NicheConfig` system. This drives every prompt, every visual, every tone decision:

- **Niche** — what the brand is about
- **Tone** — how it speaks (authoritative, casual, provocative, etc.)
- **Target audience** — who it's for
- **Topic categories** — what subjects to cover
- **Visual style** — color palette, fonts, layout preferences
- **Content formats** — text-based reels, text-video slideshows, carousel posts

Toby never deviates from a brand's DNA. Two brands in the same niche will still produce completely different content.

<br>

## Quality Control

Nothing gets published without passing a 5-dimension scoring engine:

```
Structure       ████████████████████░░  — is it well-formed?
Familiarity     ██████████████████░░░░  — does the audience recognize it?
Novelty         ████████████████░░░░░░  — is it fresh?
Hook Strength   ██████████████████████  — will they stop scrolling?
Plausibility    ████████████████████░░  — is it credible?

≥ 80 → publish    65–79 → regenerate    < 65 → reject
```

Content fingerprinting prevents repetition. 3-day topic cooldowns per brand. Trained on 59 viral patterns with 1M+ views each — but never copies. It learns the *shape* of virality.

<br>

## Content Formats

### Text-Based Reels
Classic format — AI-generated image background with branded text overlay, converted to MP4 with background music. Supports dark/light variants with per-brand theming.

### Text-Video Slideshows
Story-driven slideshows — real images sourced from Pexels/AI, text overlays per frame, thumbnail with title region, fade transitions. Three creation modes: manual, semi-auto (AI discovers + polishes stories), and full-auto.

### Carousel Posts
Multi-slide image carousels rendered via Node.js Konva — branded title slides, content slides with CTAs, all in 1080×1920 format.

<br>

## The Brands

**100% dynamic.** Every user can have any number of brands, each with any combination of connected platforms. Nothing about brands is hardcoded — brand count, names, colors, platform connections, all loaded from the database at runtime.

Each brand gets a unique variation of every piece of content — reordered, reworded, retopicized — in a single AI call. No two brands ever publish identical content, no matter how many are connected.

<br>

## The Pipeline

```
 1. Pattern Selection      59 viral archetypes + topic bucket + format
 2. Prompt Construction    <500 tokens, cached system context per brand
 3. AI Generation          DeepSeek → title, lines, image prompt, caption
 4. Quality Scoring        5-dimension gate (reject / regen / pass)
 5. Anti-Repetition        fingerprint + cooldown + history check
 6. Brand Differentiation  1 piece → ∞ unique variations
 7. Image Rendering        Pillow → branded 1080×1920 with text layout
 8. Video Production       FFmpeg → MP4 with background music + transitions
 9. Caption Building       AI paragraph + CTA + hashtags
10. Publishing             IG + FB + YT + Threads + TikTok → all brands
```

Three-layer architecture: static patterns → cached prompts → minimal runtime calls. ~80% token reduction vs. v1.

<br>

## The Dashboard

Full-featured React SPA at [viraltoby.com](https://viraltoby.com):

- **Home** — overview across all brands
- **Videos** — text-based and text-video reel generation
- **Posts** — carousel post creation
- **Jobs** — real-time job tracking with progress
- **Calendar** — visual schedule management
- **Analytics** — per-brand, per-platform performance metrics
- **Toby** — agent settings, buffer status, feature flags, activity log
- **Brands** — brand management, theme editor, platform connections, Content DNA
- **Admin** — user management, AI service credit monitoring, Supabase infrastructure

<br>

## Numbers

```
Users                       Multi-tenant SaaS
Brands per user             ∞  (unlimited, all dynamic)
Platforms                    5  (Instagram · Facebook · YouTube · Threads · TikTok)
Content formats              3  (Text reels · Text-video · Carousels)
Content pipeline stages     10
Quality dimensions           5
Viral patterns trained      59  (1M+ views each)
Toby cognitive agents       11
Toby strategies              4
Tick interval               5 min
Analytics refresh           12h
```

<br>

## Stack

```
Python 3.14+        FastAPI · SQLAlchemy · APScheduler · Pillow · MoviePy
React 18            TypeScript · Vite · TailwindCSS · TanStack Query · Recharts
PostgreSQL 17       Supabase · Jobs · Brands · Analytics · Content DNA · Toby State
FFmpeg              Image → Video with transitions, audio mixing, text overlays
Node.js             Konva carousel slide rendering
Docker              Containerized deployment on Railway
Meta Graph API      Instagram + Facebook + Threads (v21.0)
YouTube Data API    OAuth 2.0 · Shorts publishing · Quota monitoring
TikTok API          OAuth 2.0 · Video publishing
DeepSeek            Content generation · Captions · Story polishing
deAPI               AI background generation with FIFO queuing
Pexels              Stock image sourcing for text-video slideshows
NewsData.io         Real-time news discovery for trend-based content
Tavily              Web search for story research and fact enrichment
Stripe              Subscription billing with soft-lock enforcement
```

<br>

## QA & CI

Deterministic quality enforcement across three layers:

- **Post-edit hooks** — Python syntax, React hooks lint (per-file, ~1s)
- **Pre-commit hooks** — TypeScript build, ESLint, onboarding validation, API imports (~10s)
- **CI pipeline** — Full import validation, customization drift detection, reviewer guardrails (~2min)

Every push runs `validate_api.py` (109 module import checks + 23 table column alignments) and `validate_customization_drift.py` (agent/route/service coverage).

<br>

---

<div align="center">

<br>

```
Built by ViralToby.
Not open for contributions.
Not looking for stars.

It just runs.
```

<br>

**Proprietary** · [viraltoby.com](https://viraltoby.com) · Est. 2025

<br>

</div>
