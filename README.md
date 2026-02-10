<div align="center">

<br>

```
██╗  ██╗███████╗ █████╗ ██╗    ██╗   ██╗███████╗████████╗██╗  ██╗
██║  ██║██╔════╝██╔══██╗██║    ██║   ██║██╔════╝╚══██╔══╝██║  ██║
███████║█████╗  ███████║██║    ██║   ██║█████╗     ██║   ███████║
██╔══██║██╔══╝  ██╔══██║██║    ╚██╗ ██╔╝██╔══╝     ██║   ██╔══██║
██║  ██║███████╗██║  ██║███████╗╚████╔╝ ███████╗   ██║   ██║  ██║
╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝ ╚═══╝  ╚══════╝   ╚═╝   ╚═╝  ╚═╝
```

**It doesn't just publish content. It thinks.**

<br>

![Python](https://img.shields.io/badge/python-3.14+-00435c?style=flat-square&logo=python&logoColor=white)
![React](https://img.shields.io/badge/react-18-00435c?style=flat-square&logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/fastapi-latest-00435c?style=flat-square&logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgresql-16-00435c?style=flat-square&logo=postgresql&logoColor=white)
![Railway](https://img.shields.io/badge/railway-deployed-00435c?style=flat-square&logo=railway&logoColor=white)
![License](https://img.shields.io/badge/license-proprietary-111827?style=flat-square)

<br>

</div>

---

<br>

> *Most platforms schedule posts. This one dreams them into existence.*

<br>

## What is this?

An autonomous content engine. Not a scheduler. Not a template tool. A system that **observes, learns, creates, and publishes** — across multiple brands, multiple platforms, simultaneously — while you sleep.

It runs a network of health & wellness brands. Each with its own voice. Its own colors. Its own audience. And none of them know about each other.

<br>

## The Architecture

```
                    ┌─────────────────────────────┐
                    │         TOBY                 │
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
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐   ┌──────────┐    ┌──────────┐
        │Instagram │   │ Facebook │    │ YouTube  │
        │  Reels   │   │  Reels   │    │  Shorts  │
        └──────────┘   └──────────┘    └──────────┘
              │                │                │
              ▼                ▼                ▼
        ×∞ brands        ×∞ brands       ×∞ brands
```

<br>

## Under the Hood

| | | |
|:---|:---|:---|
| **Brain** | DeepSeek AI | Content ideation, captions, differentiation |
| **Eyes** | deAPI | AI-generated visual backgrounds |
| **Strategist** | Toby Agent | Autonomous daemon — 4 strategies, 0 supervision |
| **Engine** | FFmpeg + Pillow | Image rendering → video production |
| **Spine** | FastAPI + PostgreSQL | REST API, jobs, scheduling, analytics |
| **Face** | React 18 + TypeScript | Admin dashboard with real-time control |
| **Reach** | Meta Graph API + YouTube API | Cross-platform publishing at scale |
| **Home** | Docker + Railway | Cloud-native with persistent volumes |

<br>

## The Agent

His name is **Toby**. He doesn't wait for instructions.

```
EXPLORE     → finds topics nobody's tried yet
ITERATE     → fixes what underperformed
DOUBLE DOWN → amplifies what went viral
TRENDING    → adapts what the internet is talking about
```

He thinks every 45 minutes. Observes every 3 hours. Scouts trends every 4. Generates up to 15 proposals per day — each with reasoning you can read, question, or override.

He never sleeps.

<br>

## Quality Control

Nothing gets published without passing a 5-dimension scoring engine:

```
Structure       ████████████████████░░  — is it well-formed?
Familiarity     ██████████████████░░░░  — does the audience recognize it?
Novelty         ████████████████░░░░░░  — is it fresh?
Hook Strength   ██████████████████████  — will they stop scrolling?
Plausibility    ████████████████████░░  — is it scientifically sound?

≥ 80 → publish    65–79 → regenerate    < 65 → reject
```

Content fingerprinting prevents repetition. 3-day topic cooldowns per brand. Trained on 59 posts with 1M+ views each — but never copies. It learns the *shape* of virality.

<br>

## The Brands

Same problems. Different faces. Infinite scale.

Every brand tackles the same health & wellness topics — nutrition, mental health, physical fitness, anti-aging, mind-body wellness, energy — but each one presents them under a completely independent identity. Different name. Different colors. Different voice. Same pipeline.

The architecture supports an **unlimited number of brands**. Adding one takes minutes.

```
◉ Healthy College     @thehealthycollege
◉ Vitality College    @thevitalitycollege
◉ Longevity College   @thelongevitycollege
◉ Holistic College    @theholisticcollege
◉ Wellbeing College   @thewellbeingcollege
  ...and counting
```

Each brand gets a unique variation of every piece of content — reordered, reworded, retopicized — in a single AI call. No two brands ever publish identical content, no matter how many are connected.

<br>

## The Pipeline

```
1. Pattern Selection      viral archetype + topic bucket + format
2. Prompt Construction    <500 tokens, cached system context
3. AI Generation          DeepSeek → title, lines, image prompt, caption
4. Quality Scoring        5-dimension gate (reject / regen / pass)
5. Anti-Repetition        fingerprint + cooldown + history check
6. Brand Differentiation  1 piece → ∞ unique variations
7. Image Rendering        Pillow → branded 1080×1920 with text layout
8. Video Production       FFmpeg → MP4 with background music
9. Caption Building       AI paragraph + CTA + hashtags
10. Publishing            IG + FB + YT → all brands simultaneously
```

~80% token reduction vs. v1. Three-layer architecture: static patterns → cached prompts → minimal runtime calls.

<br>

## Numbers

```
Brands managed           ∞  (currently 5, scales infinitely)
Platforms                 3  (Instagram · Facebook · YouTube)
Content pipeline stages   10
Quality dimensions        5
Viral patterns trained    59  (1M+ views each)
Toby strategies           4
Toby proposals/day        15
Token reduction vs v1     ~80%
Polling interval          60s
Analytics refresh         12h
Log retention             7 days
```

<br>

## Stack

```
Python 3.14+        FastAPI · SQLAlchemy · APScheduler · Pillow · MoviePy
React 18            TypeScript · Vite · TailwindCSS · TanStack Query · Recharts
PostgreSQL          Jobs · Schedules · Analytics · Brands · Content History
FFmpeg              Image → Video conversion with audio mixing
Docker              Containerized deployment on Railway
Meta Graph API      Instagram + Facebook publishing (v21.0)
YouTube Data API    OAuth 2.0 · Shorts publishing · Quota monitoring
DeepSeek            Content generation · Captions · Differentiation
deAPI               AI background generation with FIFO queuing
```

<br>

---

<div align="center">

<br>

```
Built by Healveth.
Not open for contributions.
Not looking for stars.

It just runs.
```

<br>

**Proprietary** · Est. 2025

<br>

</div>
