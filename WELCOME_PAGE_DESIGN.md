# ViralToby Welcome Page — Design & Strategy Document

> **Purpose**: Define the landing/welcome page for viraltoby.com — the first thing visitors see before signup.
> **Date**: March 7, 2026
> **Status**: Design Proposal — Ready for Review

---

## Table of Contents

1. [Positioning & Legal Safety](#1-positioning--legal-safety)
2. [Competitor Analysis & Inspiration](#2-competitor-analysis--inspiration)
3. [Page Architecture (Sections)](#3-page-architecture-sections)
4. [Section-by-Section Design Spec](#4-section-by-section-design-spec)
5. [Visual Design System](#5-visual-design-system)
6. [Copy Framework](#6-copy-framework)
7. [Responsive Behavior](#7-responsive-behavior)
8. [Technical Notes](#8-technical-notes)

---

## 1. Positioning & Legal Safety

### The Problem

Social media platforms (Meta, YouTube, TikTok) have **tightened AI content policies significantly in 2025-2026**:

| Platform | Key Policy | Risk Level |
|----------|-----------|------------|
| **Meta (IG/FB)** | C2PA labeling standard. Must label "realistic altered or synthetic content." Editorial review/human responsibility exempts from mandatory labeling. | Medium — Toby generates text overlays & videos, not deepfakes |
| **YouTube** | Must disclose realistic synthetic content. "Repetitious/mass-produced" AI content is demonetized under "inauthentic content" rules. | Medium — Shorts are creative, not mass-generated clones |
| **TikTok** | Broadest mandate. All significantly AI-modified content must be labeled. 340% increase in enforcement. Immediate strikes for unlabeled AI content. | Higher — Need clear disclosure strategy |
| **EU AI Act** | From Aug 2, 2026: mandatory disclosure for AI-generated content. **Exemption**: if human reviews, edits, or assumes responsibility. | Critical for EU users |

### The Safe Positioning

**DO NOT say:**
- "100% automated content creation"
- "AI creates and posts without you"
- "Fully autonomous social media"
- "AI-generated content" (as the headline)
- "Set it and forget it" (implies zero human oversight)

**DO say:**
- "AI-powered content assistant"
- "Your AI marketing team" / "Your AI content partner"
- "Create, schedule, and publish — powered by AI"
- "AI helps you create" (human is the actor, AI is the tool)
- "Save hours on content creation"
- "Brand-aligned content suggestions"
- "Review, customize, and publish"

### The Legal Framework

The key legal loophole across ALL platforms: **"human review and editorial responsibility."**

Toby's architecture already supports this — content goes through a quality scoring system and the user's brand config (Content DNA) drives everything. The welcome page should emphasize:

1. **You set the strategy** (Content DNA / brand voice)
2. **AI creates drafts** (not "posts" — "drafts" and "suggestions")
3. **You review and approve** (even if auto-publish exists, frame it as "approved rules")
4. **Content publishes on your schedule** (you're in control)

This is exactly how Ocoya, Buffer, Hootsuite, and every compliant tool positions it.

---

## 2. Competitor Analysis & Inspiration

### Primary Inspiration: Ocoya (ocoya.com)

**Why it works for us:**
- Clean, minimal single-column layout
- Positions AI as "using AI" — a tool, not a replacement
- Generous whitespace, professional without being corporate
- Social media scheduling is front and center
- Simple value prop: create → schedule → analyze
- Inter / Plus Jakarta Sans typography — modern, readable

**What to borrow:**
- Single-column, full-width sections with 1200px content max-width
- Monochromatic base (grays) with selective brand accent colors
- Feature sections as visual cards with product screenshots
- Clean CTA buttons with good contrast
- Platform icon strips showing supported networks

### Secondary Inspiration: Blaze.ai

**What to borrow:**
- The "Apple vibes" — extreme whitespace, restrained palette
- Interactive savings calculator ("How much you save vs. agencies")
- Social proof placement (rating badges + logos BEFORE features)
- Dual CTA pattern: "Start Free Trial" + "Book a Demo"
- Testimonial videos for credibility
- Large product screenshots as section anchors

### Tertiary Inspiration: PromptWatch

**What to borrow:**
- Big stats/numbers for social proof ("X brands", "Y posts created")
- Problem → Solution → Proof narrative flow
- Feature capability cards with icons

### Anti-Inspiration: ContentBot

**What to avoid:**
- Cluttered layout
- Too many features listed at once
- Aggressive AI positioning ("undetectable AI content")

**What to borrow from their copy:**
- Persona-targeted value props (Marketers, Founders, Agencies)
- Case study section with real metrics
- Comparison page concept (could do "Hiring a VA vs. Toby")

---

## 3. Page Architecture (Sections)

The page should be **short and sweet** (as discussed). Aim for **7-8 scroll sections max**, each communicating one clear idea. Total scroll depth: ~4-5 viewport heights on desktop.

```
┌─────────────────────────────────────────┐
│            STICKY NAV BAR               │
│  Logo    Features  Pricing  Login  CTA  │
├─────────────────────────────────────────┤
│                                         │
│              HERO SECTION               │
│     Headline + Sub + CTA + Visual       │
│                                         │
├─────────────────────────────────────────┤
│          SOCIAL PROOF STRIP             │
│   "Trusted by X brands" + platform logos│
├─────────────────────────────────────────┤
│                                         │
│          HOW IT WORKS (3 STEPS)         │
│    1. Set DNA  2. AI Creates  3. Publish│
│                                         │
├─────────────────────────────────────────┤
│                                         │
│        FEATURE SHOWCASE (3 CARDS)       │
│   Content · Scheduling · Analytics      │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│        PLATFORM STRIP / REACH           │
│  IG + FB + YT + TikTok + Threads icons  │
│     "One dashboard, every platform"     │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│      SAVINGS / VALUE COMPARISON         │
│   "Toby vs. Hiring a VA / Agency"       │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│        TESTIMONIAL / CASE STUDY         │
│   Real results from real brands         │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│          FINAL CTA SECTION              │
│    "Ready to grow?" + signup button     │
│                                         │
├─────────────────────────────────────────┤
│              FOOTER                     │
│   Links · Legal · Social · Contact      │
└─────────────────────────────────────────┘
```

---

## 4. Section-by-Section Design Spec

### 4.1 Sticky Navigation Bar

```
┌──────────────────────────────────────────────────────────┐
│  [VA Logo] ViralToby     Features  Pricing     Login  [Get Started ►]  │
└──────────────────────────────────────────────────────────┘
```

- **Height**: 64px
- **Background**: White (`#ffffff`) with subtle bottom border (`1px solid #f0f0f0`)
- **Behavior**: Sticky on scroll. Add slight shadow (`box-shadow: 0 1px 3px rgba(0,0,0,0.05)`) after scrolling past hero
- **Logo**: `va-logo.svg` at 32px height + "ViralToby" text in Poppins 600 weight
- **Nav Links**: Inter 500, 14px, `#374151` (gray-700), hover: `#00435c` (brand primary)
- **CTA Button**: `#00435c` background, white text, rounded-lg (8px), padding 10px 24px
- **Mobile**: Hamburger menu icon at 768px breakpoint

### 4.2 Hero Section

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│                                                          │
│       Your AI-Powered                                    │
│       Content Team                    [Product           │
│                                        Screenshot        │
│       Create, schedule, and publish     or Hero           │
│       content across every platform    Illustration]      │
│       — powered by your brand voice.                     │
│                                                          │
│       [Get Started Free]  [See How It Works]             │
│                                                          │
│       No credit card required · Free plan available      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Layout**: Two-column on desktop (55% text / 45% visual), single column stacked on mobile

**Typography**:
- Headline: Poppins 700, 48px desktop / 32px mobile, `#09090b`
- Subtitle: Inter 400, 18px desktop / 16px mobile, `#6b7280` (gray-500)
- Trust line: Inter 400, 13px, `#9ca3af` (gray-400)

**Visual (right side)**:
- Product screenshot showing the dashboard with a brand's scheduled content
- Or: clean illustration of content flowing from a central hub to platform icons
- Subtle floating animation (translateY oscillation, 3s ease-in-out)

**CTAs**:
- Primary: Filled button, `#00435c`, white text, 16px, rounded-lg, padding 14px 32px
- Secondary: Ghost/outline button, `#00435c` border, `#00435c` text, same sizing
- Hover: Primary darkens to `#002d3f`, Secondary fills with `#00435c` at 5% opacity

**Background**: Clean white or very subtle gradient (`#ffffff` → `#f8fafc`)

### 4.3 Social Proof Strip

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   Trusted by brands growing their social presence        │
│                                                          │
│   [Logo] [Logo] [Logo] [Logo] [Logo] [Logo]             │
│                                                          │
│         ───── or (if no logos yet) ─────                 │
│                                                          │
│   📊 500+ posts created  ·  🎯 5 platforms  ·  ⏱ 40hrs saved/month  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Since we're just starting out**, use stat counters instead of logos:
- "X posts created" / "X platforms supported" / "X hours saved per brand/month"
- Or early adopter testimonial quote
- Can add real logos as customers come in

**Design**:
- Light gray background (`#f9fafb`)
- Centered text, Inter 500, 14px, `#6b7280`
- Stats in larger size: Inter 700, 24px, `#00435c`
- Subtle separator dots between stats
- Horizontal scrolling marquee of platform icons on mobile

### 4.4 How It Works — 3 Steps

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│              How Toby Works For You                      │
│                                                          │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐            │
│   │    1    │    │    2    │    │    3    │            │
│   │  🎨    │    │  ✍️    │    │  🚀    │            │
│   │ Define  │    │  AI     │    │Publish  │            │
│   │ Your    │    │Creates  │    │Every-   │            │
│   │ Brand   │    │Content  │    │ where   │            │
│   │         │    │         │    │         │            │
│   │Set your │    │Toby     │    │Schedule │            │
│   │brand    │    │generates│    │and      │            │
│   │voice,   │    │content  │    │publish  │            │
│   │colors,  │    │aligned  │    │across   │            │
│   │& topics │    │with your│    │IG, FB,  │            │
│   │         │    │DNA      │    │YT, TT,  │            │
│   │         │    │         │    │Threads  │            │
│   └─────────┘    └─────────┘    └─────────┘            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**This section is CRITICAL for legal positioning.** It establishes:
1. **User sets the strategy** (human control)
2. **AI creates based on user input** (tool, not autonomous agent in marketing copy)
3. **User publishes** (human responsibility)

**Layout**: 3-column grid on desktop, vertical stack on mobile
**Cards**: White background, rounded-xl (16px), subtle shadow, 32px padding
**Step numbers**: Circle with `#00435c` background, white text, 28px
**Icons**: Simple line icons or subtle illustrations (NOT robot/AI imagery — use creative/content icons)
**Heading**: Poppins 600, 20px, `#111827`
**Description**: Inter 400, 15px, `#6b7280`, max 2-3 lines
**Connecting line**: Dashed line or arrow between steps on desktop (subtle, gray-300)

### 4.5 Feature Showcase — 3 Pillars

Three alternating left-right sections (like Ocoya/Blaze style):

**Section A: Content Creation**
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   [Screenshot of Reels           Smart Content           │
│    creation interface]           That Sounds Like You    │
│                                                          │
│                                  AI-powered content      │
│                                  crafted from your       │
│                                  brand voice, topics,    │
│                                  and visual style.       │
│                                                          │
│                                  ✓ Reels & Shorts        │
│                                  ✓ Carousel posts        │
│                                  ✓ Branded visuals       │
│                                  ✓ Quality scored        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Section B: Scheduling & Publishing** (reversed layout)
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  One Calendar,                  [Screenshot of           │
│  Every Platform                  Calendar page]          │
│                                                          │
│  Schedule and publish across                             │
│  Instagram, Facebook, YouTube,                           │
│  TikTok, and Threads — all                               │
│  from one dashboard.                                     │
│                                                          │
│  ✓ Visual calendar                                       │
│  ✓ Multi-platform publishing                             │
│  ✓ Optimal timing                                        │
│  ✓ Drag & reschedule                                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Section C: Analytics & Growth**
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   [Screenshot of Analytics      Know What's Working      │
│    dashboard]                                            │
│                                  Track performance       │
│                                  across every brand      │
│                                  and platform.           │
│                                                          │
│                                  ✓ Engagement metrics    │
│                                  ✓ Growth tracking       │
│                                  ✓ Per-platform stats    │
│                                  ✓ Content insights      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Design pattern for each**:
- 50/50 split: screenshot + text
- Alternating sides (left-right-left)
- Screenshots: rounded-xl, subtle shadow, ~400px max height
- Section gap: 80-120px between sections
- Checkmarks: `#10b981` (emerald/success green)
- Feature heading: Poppins 600, 32px, `#111827`
- Feature description: Inter 400, 16px, `#6b7280`
- Bullet items: Inter 500, 15px, `#374151`

### 4.6 Platform Strip

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│              One Dashboard. Every Platform.               │
│                                                          │
│     [IG icon]  [FB icon]  [YT icon]  [TT icon]  [Threads]│
│     Instagram  Facebook   YouTube    TikTok    Threads   │
│                                                          │
│     Connect any combination. Publish everywhere.          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Design**:
- Full-width background: `#00435c` (brand primary) or subtle dark gradient
- White text and icons
- Platform icons at 48px, with official platform colors on hover
- Centered layout, generous vertical padding (64px top/bottom)
- Icons have subtle glow/highlight effect on hover

### 4.7 Value Comparison — Toby vs. The Alternative

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│         Why Brands Choose Toby                           │
│                                                          │
│   ┌──────────────────┬───────────┬───────────┐          │
│   │                  │ Agency /  │   Toby    │          │
│   │                  │   VA      │           │          │
│   ├──────────────────┼───────────┼───────────┤          │
│   │ Monthly cost     │ $2-5K+   │ From $0   │          │
│   │ Content/month    │ 15-30    │ Unlimited │          │
│   │ Platforms        │ 2-3      │ 5         │          │
│   │ Brand voice      │ Hit/miss │ DNA-driven│          │
│   │ Response time    │ 24-48h   │ Instant   │          │
│   │ Analytics        │ Monthly  │ Real-time │          │
│   │ Setup time       │ Weeks    │ Minutes   │          │
│   └──────────────────┴───────────┴───────────┘          │
│                                                          │
│   Inspired by Ferre's idea: "Hire a random VA vs Toby"  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Design**:
- White background
- Table with rounded-xl border, subtle shadow
- "Agency/VA" column: gray background, muted text
- "Toby" column: light primary tint background (`#00435c` at 5%), bold values
- Checkmarks and X marks for yes/no rows
- Heading: Poppins 600, 32px, centered

### 4.8 Testimonial / Case Study

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   ┌─────────────────────────────────────────────┐       │
│   │                                             │       │
│   │  "Toby handles our content across 3 brands  │       │
│   │   and 5 platforms. We went from spending     │       │
│   │   20 hours a week to under 2."              │       │
│   │                                             │       │
│   │   — [Name], [Brand]                         │       │
│   │     [Avatar]  [Platform metrics]            │       │
│   │                                             │       │
│   └─────────────────────────────────────────────┘       │
│                                                          │
│   Use real case studies when available:                   │
│   • 90K Longevity page results                           │
│   • Gym College growth metrics                           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Design**:
- Light background (`#f9fafb`)
- Quote card: white, rounded-xl, generous padding (48px), centered
- Quote text: Poppins 500, 20px italic, `#111827`
- Attribution: Inter 500, 14px, `#6b7280`
- Optional: small metric badges below ("+X followers", "Y posts/month")

### 4.9 Final CTA Section

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│           Ready to Grow Your Brand?                      │
│                                                          │
│     Start creating content in minutes, not hours.        │
│                                                          │
│              [Get Started Free]                           │
│                                                          │
│        No credit card required · Free plan available      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Design**:
- Background: Subtle gradient using brand colors (`#00435c` → `#006d8f`) or clean white
- If dark background: white text, lighter CTA button
- If light background: dark text, standard `#00435c` CTA
- Large heading: Poppins 700, 36px
- Subtext: Inter 400, 16px
- Single, large CTA button: 18px text, padding 16px 40px, rounded-xl
- Trust line below: 13px, muted

### 4.10 Footer

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  [Logo] ViralToby          Product    Legal    Connect   │
│                             Features   Terms    Twitter  │
│  AI-powered content         Pricing    Privacy  Email    │
│  for growing brands.        Login      Data              │
│                                        Deletion          │
│                                                          │
│  © 2026 ViralToby. All rights reserved.                  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Design**:
- Background: `#111827` (gray-900) or `#09090b`
- Text: `#9ca3af` (gray-400)
- Links: `#d1d5db` (gray-300), hover: white
- Logo: grayscale/white variant
- 3-4 column grid on desktop, stacked on mobile
- Legal links MUST include: Terms, Privacy Policy, Data Deletion (required by Meta/TikTok)

---

## 5. Visual Design System

### Colors

```
Primary:        #00435c  (existing brand color — teal/navy)
Primary Light:  #006d8f
Primary Dark:   #002d3f
Background:     #ffffff  (hero, features)
Surface:        #f9fafb  (alternating sections)
Dark Surface:   #111827  (platform strip, footer)
Text Primary:   #111827
Text Secondary: #6b7280
Text Muted:     #9ca3af
Success/Check:  #10b981
Border:         #e5e7eb
```

### Typography

```
Headings:  Poppins (600-700)
  H1: 48px / 56px line-height  (hero)
  H2: 32px / 40px line-height  (section titles)
  H3: 20px / 28px line-height  (card titles)

Body:      Inter (400-500)
  Large:  18px / 28px line-height  (hero subtitle)
  Base:   16px / 24px line-height  (descriptions)
  Small:  14px / 20px line-height  (labels, trust lines)
  Tiny:   13px / 18px line-height  (fine print)
```

### Spacing Scale

```
Section padding:  80px vertical (desktop) / 48px (mobile)
Content max-width: 1200px, centered
Card padding:     32px
Card gap:         24px
Element gap:      16px
Inline gap:       8px
Border radius:    8px (buttons), 12px (cards), 16px (screenshots)
```

### Shadows

```
Card:       0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)
Card hover: 0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.04)
Screenshot: 0 8px 24px rgba(0,0,0,0.12)
Nav sticky: 0 1px 3px rgba(0,0,0,0.05)
```

### Animations

```
Page load:    Fade-in + slide-up (opacity 0→1, translateY 20px→0, 0.6s ease-out)
Scroll reveal: Intersection Observer, staggered per element (100ms delay between siblings)
Hover:        150ms ease (buttons, cards)
Stats counter: Count-up animation on scroll-into-view
Platform icons: Subtle scale(1.05) on hover with color transition
```

---

## 6. Copy Framework

### Tone Guidelines

- **Confident but not arrogant** — "powerful tools" not "the best in the world"
- **Human-centric** — The user is always in control. AI assists, suggests, creates drafts
- **Conversational** — Not corporate. We're a startup, not Salesforce
- **Benefit-driven** — "Save 20 hours/week" not "Our algorithm uses transformer architecture"
- **Platform-safe** — Never imply full automation without human oversight

### Headline Options (pick one for hero)

1. "Your AI-Powered Content Team"
2. "Content Creation, Simplified"
3. "Create. Schedule. Grow." (with "Powered by AI" as subtitle accent)
4. "Meet Toby — Your Brand's Content Partner"
5. "Social Media Content, On Autopilot" — **CAREFUL**: "autopilot" implies no human. Use only if paired with "you set the course" messaging.

### Words to USE freely

```
Create, Schedule, Publish, Grow, Brand voice, Content partner,
AI-powered, Smart, Insights, Multi-platform, Dashboard,
Save time, Streamline, Your brand, Your audience, Your way
```

### Words to AVOID on the landing page

```
Autonomous, Automated posting, Bot, AI-generated, Synthetic,
Autopilot (standalone), No human needed, Hands-free,
Auto-publish (externally), Content factory, Mass produce
```

---

## 7. Responsive Behavior

### Breakpoints (matching existing Tailwind config)

```
Mobile:   < 640px   — single column, stacked sections, hamburger nav
Tablet:   640-1024px — 2-column where possible, condensed spacing
Desktop:  > 1024px   — full layout as designed above
```

### Key Responsive Rules

- **Hero**: Stacks vertically on mobile (text above, visual below)
- **Feature sections**: Stack vertically, always text-then-image order
- **3-step cards**: Stack vertically with step connector becoming vertical line
- **Comparison table**: Horizontal scroll or collapsed accordion on mobile
- **Platform strip**: Icons shrink to 36px on mobile, horizontal scroll if needed
- **Nav**: Collapses to hamburger at 768px
- **Typography**: All headings scale down ~70% on mobile (48→32, 32→24, etc.)

---

## 8. Technical Notes

### Implementation

- **File location**: `src/pages/Welcome.tsx` (new public route at `/`)
- **Route**: Add `/` or `/welcome` as public route in `src/app/routes/index.tsx`
- **Auth redirect**: If user is logged in, redirect to `/` (dashboard). Welcome page only for unauthenticated visitors.
- **Styling**: Tailwind CSS (consistent with existing codebase)
- **No external dependencies needed** — all achievable with existing Tailwind + React setup
- **Images**: Product screenshots to be captured from the actual app (dashboard, calendar, analytics pages)

### Performance

- Lazy-load images below the fold (`loading="lazy"`)
- Use WebP/AVIF for screenshots with PNG fallback
- No heavy animation libraries — CSS animations + Intersection Observer only
- Aim for Lighthouse score > 90 on mobile

### SEO

- Page title: "ViralToby — AI-Powered Social Media Content"
- Meta description: "Create, schedule, and publish social media content across Instagram, Facebook, YouTube, TikTok, and Threads — powered by your brand voice."
- Open Graph tags for social sharing
- Semantic HTML: proper heading hierarchy, landmark elements

---

## Reference Pages for Design Replication

If looking to replicate and adapt a specific existing page, the **top recommendation** in order of relevance:

1. **https://www.ocoya.com/** — Most aligned with our product and positioning. Clean, simple, social-media-first. This is the closest match to what our page should feel like. Short, sweet, effective.

2. **https://www.blaze.ai/** — Premium "Apple vibes." Great savings table, testimonial approach, and dual-CTA pattern. More suited for when we have more social proof and case studies to show.

3. **https://promptwatch.com/** — Good stats/analytics presentation. Useful as inspiration for our analytics feature section and social proof numbers.

4. **https://contentbot.ai/chatgpt-vs-contentbot** — The comparison page concept is great for a future "Toby vs. Hiring a VA" standalone page.

---

## Quick Decision Checklist

- [ ] Pick hero headline (see Section 6)
- [ ] Decide social proof strategy (stats vs. logos vs. early testimonial)
- [ ] Capture/create product screenshots (dashboard, calendar, analytics)
- [ ] Write final copy for each section
- [ ] Decide on pricing section (include on welcome page? or separate /pricing route?)
- [ ] Get case study metrics ready (Longevity 90K, Gym College)
- [ ] Decide: dark or light final CTA section?
- [ ] Logo: need white/monochrome variant for dark sections?

---

*This document provides the complete design specification. The copy can be refined separately, and the implementation is ready to be coded from these specs.*
