"""
GenericAgent — Dynamic AI agent parameterized from the AIAgent DB model.

Each GenericAgent instance reads its config (system prompt, temperature,
strategies, variant, etc.) from the `ai_agents` table.  This replaces the
need for separate TobyAgent and LexiAgent classes — both are now DB-driven
instances of GenericAgent.

When a new brand is created, a new AIAgent row is inserted and Maestro will
automatically include it in the daily burst.  Every agent works across ALL
brands.
"""

import json
import os
import random
import re
import time
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional, Tuple

import requests

from app.models import TobyProposal, PostPerformance, TrendingContent, ContentHistory, AIAgent
from app.services.content_tracker import get_content_tracker, TOPIC_BUCKETS


# ── Shared brand handles (loaded once, updated when brands change) ──

def _load_brand_handles() -> Dict[str, str]:
    """Load brand handles from the DB (Brand table)."""
    try:
        from app.db_connection import SessionLocal
        from app.models import Brand
        db = SessionLocal()
        try:
            brands = db.query(Brand).all()
            handles = {}
            for b in brands:
                handle = b.instagram_handle or f"@the{b.id}"
                if not handle.startswith("@"):
                    handle = f"@{handle}"
                handles[b.id] = handle
            return handles if handles else _default_handles()
        finally:
            db.close()
    except Exception:
        return _default_handles()


def _default_handles() -> Dict[str, str]:
    return {
        "healthycollege": "@thehealthycollege",
        "vitalitycollege": "@thevitalitycollege",
        "longevitycollege": "@thelongevitycollege",
        "holisticcollege": "@theholisticcollege",
        "wellbeingcollege": "@thewellbeingcollege",
    }


# ── Base system prompts for new agents (templates) ──

REEL_SYSTEM_PROMPT_TEMPLATE = """You are {name}, an expert AI content strategist for health & wellness Instagram accounts.

YOUR PERSONALITY: {personality}

AUDIENCE AVATAR (internal strategy only — NEVER mention in content):
- Women aged 45+
- Located in the United States, Canada, and United Kingdom
- Health-conscious, interested in natural remedies, supplements, anti-aging, longevity
- Engaged on Instagram, prefers short-form educational video content (Reels)
- Values science-backed information presented accessibly

CRITICAL RULE — NEVER MENTION THE AVATAR DIRECTLY:
- NEVER write "women over 40", "women 45+", "if you're over 50", "for women", "secrets women should know" etc.
- The content must appeal UNIVERSALLY to anyone interested in health/wellness
- Let the TOPIC itself naturally attract the avatar (e.g. collagen, hormones, metabolism after 30, bone density)
- Instagram's algorithm will target the right audience based on content, not demographic callouts
- Content-based targeting is KING on Instagram — generic appeal, niche knowledge

OUR REEL TEMPLATE (fixed format, text-only overlays on AI-generated background):
Each reel consists of 4 components that you must generate:

1) TITLE — The main hook shown on the cover. ALL CAPS. Bold, attention-grabbing, scroll-stopping.
   Must be useful & attractive. No periods unless two-part statement.
   Top performer examples:
   - "METABOLISM SECRETS DOCTORS DON'T SHARE"
   - "YOUR GUT PRODUCES 90% OF YOUR SEROTONIN"
   - "CARDIO BURNS CALORIES. STRENGTH TRAINING REBUILDS YOUR METABOLISM."
   - "ONE DAILY HABIT CAN CHANGE YOUR HEALTH"

2) CONTENT LINES — 6-8 numbered text slides shown over the background image.
   Each line follows the format: "Topic/claim — Supporting fact or benefit"
   The LAST line (line 7 or 8) is ALWAYS a CTA: "If you want to learn more about your health, follow this page!"
   Example content_lines:
   [
     "Skipping breakfast - Triggers cellular cleanup mode",
     "Protein at every meal - Prevents metabolic slowdown",
     "Caffeine after noon - Slows fat burning 40%",
     "Spicy food daily — Ignites thermogenesis for hours",
     "Standing after eating - Doubles calorie burn rate",
     "Sleeping in cold room - Boosts metabolism overnight",
     "Cold showers - Activates brown fat instantly",
     "If you want to learn more about your health, follow this page!"
   ]

3) IMAGE PROMPT — AI-generated background image.
   Soft, minimal, calming wellness aesthetic. High-end lifestyle photography.
   Main subject CENTERED in UPPER area (bottom third covered by text).
   Must end with: "No text, no letters, no numbers, no symbols, no logos."

4) CAPTION — Full Instagram caption posted below the reel.
   Structure:
   - Paragraph 1: Expand on the title with surprising/counterintuitive science
   - Paragraph 2-3: Explain the mechanism in accessible wellness language
   - CTA block: "👉🏼 Follow @brandhandle for daily content on..." (system replaces @brandhandle)
   - Save/share block: "🩵 This post is designed to be saved and revisited..."
   - Follow block: "💬 If you found this helpful, make sure to follow..."
   - Disclaimer: "🌱 Content provided for educational purposes..."
   - Hashtags: 5-8 relevant health/wellness hashtags

CONTENT GUIDELINES:
- Health & wellness niche ONLY
- Educational and informational tone
- Science-backed claims with plausible research references
- 60% validating (things audience suspects are true) + 40% surprising (new revelation)
- No medical advice or cure claims
- No emojis in title or content_lines (only in caption)
- No em-dashes or en-dashes in content_lines (use regular dash - )

You think like a human content creator but with data-driven decisions.
You explain your reasoning clearly so the human reviewer understands your strategy."""


POST_SYSTEM_PROMPT_TEMPLATE = """You are {name}, an expert AI content strategist for health & wellness Instagram accounts.
You specialise in creating Instagram carousel POSTS — educational, science-backed, study-referenced content.

YOUR PERSONALITY: {personality}

AUDIENCE AVATAR (internal strategy only — NEVER mention in content):
- Women aged 45+
- Located in the United States, Canada, and United Kingdom
- Health-conscious, interested in natural remedies, supplements, anti-aging, longevity
- Engaged on Instagram, prefers carousel posts with educational depth
- Values science-backed information with real study references

CRITICAL RULE — NEVER MENTION THE AVATAR DIRECTLY:
- NEVER write "women over 40", "women 45+", "if you're over 50", "for women" etc.
- The content must appeal UNIVERSALLY to anyone interested in health/wellness
- Let the TOPIC itself naturally attract the avatar
- Content-based targeting is KING on Instagram

OUR POST TEMPLATE (fixed format — cover slide + 3-4 text carousel slides):

1) TITLE — The main hook on the cover slide. ALL CAPS. Bold, statement-based.

2) SLIDE TEXTS — 3-4 paragraph slides (carousel slides 2, 3, 4, optionally 5):
   Each slide is a standalone paragraph (3-6 sentences) in calm, authoritative, educational tone.

3) IMAGE PROMPT — AI-generated cover image (1080x1350 portrait).
   Soft, minimal, calming wellness aesthetic. Main subject in CENTER/UPPER area.
   Must end with: "No text, no letters, no numbers, no symbols, no logos."

4) CAPTION — Full Instagram caption with REAL study reference:
   - Hook + science explanation + takeaway
   - Source block with REAL DOI
   - Disclaimer block
   - Hashtags: 5-8 relevant health/wellness hashtags

CONTENT GUIDELINES:
- Health & wellness niche ONLY
- Educational, calm, authoritative tone
- Every post MUST reference a real scientific study with valid DOI
- 60% validating + 40% surprising content mix
- No medical advice or cure claims
- No emojis in title or slide_texts (only in caption)
- No em-dashes or en-dashes in title or slide_texts

You think like a human content creator but with data-driven decisions.
You explain your reasoning clearly so the human reviewer understands your strategy."""


# Topic descriptions for strategy prompts
TOPIC_DESCRIPTIONS = {
    "superfoods": "turmeric, ginger, berries, dark leafy greens, fermented foods — nutrients, antioxidants, anti-inflammatory",
    "teas": "green tea, matcha, chamomile, peppermint, herbal blends — catechins, polyphenols, calming herbs",
    "supplements": "vitamin D, omega-3, magnesium, probiotics, collagen — bioavailability, dosage, real benefits",
    "sleep": "circadian rhythm, melatonin, sleep hygiene, REM cycles — deep sleep, recovery, hormones",
    "morning_routines": "cortisol awakening response, hydration, cold water, sunlight, gentle movement",
    "skin_health": "collagen production, retinol, vitamin C serum, hyaluronic acid, antioxidants, UV protection",
    "gut_health": "microbiome, prebiotics, fermented foods, fiber, vagus nerve, leaky gut",
    "hormones": "cortisol, insulin, estrogen, progesterone, thyroid, metabolic hormones",
    "stress_mood": "HPA axis, serotonin, GABA, meditation, breathwork, adaptogens",
    "hydration": "electrolyte balance, filtered water, trace minerals, dehydration signs",
    "brain_health": "BDNF, neuroplasticity, omega-3, polyphenols, cognitive reserve, memory",
    "heart_health": "nitric oxide, CoQ10, omega-3, polyphenols, blood pressure, artery elasticity",
    "strength": "muscle protein synthesis, bone loading, resistance training, recovery, HGH",
    "metabolism": "insulin sensitivity, basal metabolic rate, brown fat, healthy fats, protein timing",
    "cortisol": "stress response, belly fat, sleep disruption, caffeine timing, forest bathing",
    "walking": "walking after meals, zone 2, blood sugar regulation, creativity, lymphatic flow",
    "electrolytes": "sodium, potassium, magnesium, muscle cramps, hydration balance",
    "fiber": "soluble vs insoluble, colon health, satiety, blood sugar control, microbiome feeding",
    "neuroplasticity": "learning, habit formation, synaptic pruning, brain-derived neurotrophic factor",
    "longevity": "blue zones, telomeres, rapamycin, fasting, caloric restriction, NAD+, sirtuins",
}


def _agent_log(agent_name: str, action: str, detail: str, emoji: str = "📌", level: str = "detail"):
    """Unified logging — feeds into both Maestro's activity log and stdout."""
    try:
        from app.services.maestro import get_maestro
        m = get_maestro()
        m._log(emoji, agent_name, action, detail, level=level)
    except Exception:
        pass
    print(f"{emoji} [{agent_name}] {action}: {detail}", flush=True)


class GenericAgent:
    """
    DB-driven AI agent — all config comes from the AIAgent model.

    Replaces the need for separate TobyAgent / LexiAgent classes.
    Each instance reads its config on init and uses it for API calls.
    """

    def __init__(self, agent_config: AIAgent):
        self.config = agent_config
        self.agent_id = agent_config.agent_id
        self.display_name = agent_config.display_name
        self.temperature = agent_config.temperature
        self.variant = agent_config.variant
        self.proposal_prefix = agent_config.proposal_prefix.upper()
        self.personality = agent_config.personality or "A balanced, data-driven content strategist."
        self.strategy_weights = agent_config.get_strategy_weights()
        self.strategy_names = agent_config.get_strategies()
        self.proposals_per_brand = agent_config.proposals_per_brand
        self.content_types = agent_config.get_content_types()

        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = "https://api.deepseek.com/v1"
        self.tracker = get_content_tracker()
        self.brand_handles = _load_brand_handles()

        _agent_log(self.agent_id, "Init", f"{self.display_name} ready — temp={self.temperature}, variant={self.variant}, strategies={self.strategy_names}")

    # ──────────────────────────────────────────────────────────
    # MAIN: RUN
    # ──────────────────────────────────────────────────────────

    def run(self, max_proposals: int = None, content_type: str = "reel", brand: str = None) -> Dict:
        """Main entry — same interface as TobyAgent.run()."""

        if not self.api_key:
            _agent_log(self.agent_id, "Error", "No DEEPSEEK_API_KEY configured", "❌", "action")
            return {"error": "No DEEPSEEK_API_KEY configured", "proposals": []}

        if max_proposals is None:
            max_proposals = self.proposals_per_brand

        remaining = max_proposals
        brand_label = f" for {brand}" if brand else ""
        ct_label = "📄 POST" if content_type == "post" else "🎬 REEL"
        _agent_log(self.agent_id, "Planning", f"{ct_label}{brand_label} — Generating {remaining} proposals.", "🎯", "detail")

        # Gather intelligence
        intel = self._gather_intelligence(content_type=content_type, brand=brand)

        # Strategy mix
        strategy_plan = self._plan_strategies(remaining, intel)

        # Generate proposals
        proposals = []
        for strategy, count in strategy_plan.items():
            for _ in range(count):
                try:
                    proposal = self._generate_proposal(strategy, intel, content_type=content_type, brand=brand)
                    if proposal:
                        proposals.append(proposal)
                except Exception as e:
                    _agent_log(self.agent_id, "Error", f"Proposal generation failed ({strategy}): {e}", "❌", "detail")

        return {
            "proposals_created": len(proposals),
            "agent": self.agent_id,
            "strategies_used": {s: c for s, c in strategy_plan.items() if c > 0},
            "proposals": [p.to_dict() for p in proposals],
        }

    # ──────────────────────────────────────────────────────────
    # INTELLIGENCE GATHERING
    # ──────────────────────────────────────────────────────────

    def _gather_intelligence(self, content_type: str = "reel", brand: str = None) -> Dict:
        """Gather data needed for decisions (same as Toby/Lexi)."""
        intel: Dict[str, Any] = {"brand": brand}
        brand_label = f" for {brand}" if brand else ""

        # 1. Performance data
        try:
            from app.services.metrics_collector import get_metrics_collector
            collector = get_metrics_collector()
            intel["top_performers"] = collector.get_top_performers("reel", limit=10)
            intel["underperformers"] = collector.get_underperformers("reel", limit=10)
            intel["performance_summary"] = collector.get_performance_summary()
        except Exception:
            intel["top_performers"] = []
            intel["underperformers"] = []
            intel["performance_summary"] = {}

        # 2. Trending
        try:
            from app.services.trend_scout import get_trend_scout
            scout = get_trend_scout()
            intel["trending"] = scout.get_trending_for_toby(min_likes=200, limit=15, content_type=content_type)
        except Exception:
            intel["trending"] = []

        # 2b. Own account top performers (self-awareness)
        try:
            from app.services.trend_scout import get_trend_scout
            scout = get_trend_scout()
            own_top = scout.get_own_account_top_performers(min_likes=50, limit=10, content_type=content_type)
            intel["own_top_performers"] = own_top
        except Exception:
            intel["own_top_performers"] = []

        # 2c. Per-agent evolution lessons (what has this agent learned?)
        try:
            from app.services.evolution_engine import get_agent_lessons
            intel["agent_lessons"] = get_agent_lessons(self.agent_id, limit=5)
        except Exception:
            intel["agent_lessons"] = ""

        # 3. Content history (brand-aware)
        try:
            intel["recent_titles"] = self.tracker.get_recent_titles(content_type, limit=60, brand=brand)
            intel["topics_on_cooldown"] = [
                t for t in TOPIC_BUCKETS
                if t not in self.tracker.get_available_topics(content_type)
            ]
            intel["available_topics"] = self.tracker.get_available_topics(content_type)
            intel["content_stats"] = self.tracker.get_stats(content_type)
            if brand:
                intel["brand_avoidance"] = self.tracker.get_brand_avoidance_prompt(brand=brand, content_type=content_type, days=60)
            else:
                intel["brand_avoidance"] = ""
        except Exception:
            intel["recent_titles"] = []
            intel["topics_on_cooldown"] = []
            intel["available_topics"] = list(TOPIC_BUCKETS)
            intel["content_stats"] = {}
            intel["brand_avoidance"] = ""

        # 4. Best/worst topics
        perf_summary = intel.get("performance_summary", {})
        topic_rankings = perf_summary.get("topic_rankings", [])
        intel["best_topics"] = [t["topic"] for t in topic_rankings[:3]] if topic_rankings else []
        intel["worst_topics"] = [t["topic"] for t in topic_rankings[-3:]] if len(topic_rankings) >= 3 else []

        return intel

    # ──────────────────────────────────────────────────────────
    # STRATEGY PLANNING
    # ──────────────────────────────────────────────────────────

    def _plan_strategies(self, count: int, intel: Dict) -> Dict[str, int]:
        """Weighted strategy allocation with data-aware adjustments."""
        weights = dict(self.strategy_weights)

        # Dynamic weight adjustments based on available data
        # Find the "explore-like" strategy (first one, usually the discovery/explore strategy)
        explore_key = self.strategy_names[0] if self.strategy_names else "explore"
        trending_key = self.strategy_names[-1] if len(self.strategy_names) > 1 else explore_key

        if not intel.get("top_performers"):
            # Kill strategies that need winners (double_down, refine, compound)
            for key in list(weights.keys()):
                if key in ("double_down", "refine", "compound"):
                    removed = weights.pop(key, 0)
                    weights[explore_key] = weights.get(explore_key, 0) + removed * 0.6
                    weights[trending_key] = weights.get(trending_key, 0) + removed * 0.4

        if not intel.get("underperformers"):
            for key in list(weights.keys()):
                if key in ("iterate",):
                    removed = weights.pop(key, 0)
                    weights[explore_key] = weights.get(explore_key, 0) + removed

        if not intel.get("trending"):
            for key in list(weights.keys()):
                if key in ("trending",):
                    removed = weights.pop(key, 0)
                    weights[explore_key] = weights.get(explore_key, 0) + removed

        # Normalise
        total = sum(weights.values())
        if total == 0:
            weights = {explore_key: 1.0}
            total = 1.0

        plan = {}
        allocated = 0
        for strategy, weight in weights.items():
            n = round(count * weight / total)
            plan[strategy] = n
            allocated += n

        # Adjust rounding
        diff = count - allocated
        if diff > 0:
            plan[explore_key] = plan.get(explore_key, 0) + diff
        elif diff < 0:
            for s in sorted(plan.keys(), key=lambda k: plan[k]):
                if plan.get(s, 0) > 0 and diff < 0:
                    plan[s] -= 1
                    diff += 1
                    if diff == 0:
                        break

        active = {s: c for s, c in plan.items() if c > 0}
        plan_str = ", ".join(f"{s}: {c}" for s, c in active.items())
        _agent_log(self.agent_id, "Strategy plan", f"{count} proposals → [{plan_str}]", "🗺️", "detail")

        return plan

    # ──────────────────────────────────────────────────────────
    # PROPOSAL GENERATION — generic strategy router
    # ──────────────────────────────────────────────────────────

    def _generate_proposal(self, strategy: str, intel: Dict, content_type: str = "reel", brand: str = None) -> Optional[TobyProposal]:
        """Route to the appropriate strategy prompt builder."""

        is_post = content_type == "post"

        # Map strategies to their prompt builders
        # All strategies ultimately call _build_prompt_and_generate()
        if is_post:
            return self._generic_strategy(strategy, intel, content_type, brand, is_post=True)
        else:
            return self._generic_strategy(strategy, intel, content_type, brand, is_post=False)

    def _generic_strategy(self, strategy: str, intel: Dict, content_type: str, brand: str = None, is_post: bool = False) -> Optional[TobyProposal]:
        """
        Universal strategy executor — builds the right prompt based on strategy
        name and calls DeepSeek.
        """
        available = intel.get("available_topics", list(TOPIC_BUCKETS))
        recent_titles = intel.get("recent_titles", [])
        brand_label = f" for {brand}" if brand else ""

        topic = random.choice(available) if available else "general"
        topic_desc = TOPIC_DESCRIPTIONS.get(topic, topic)

        avoidance = intel.get("brand_avoidance", "")

        # 🪞 Inject own-account audience insights into context
        own_top = intel.get("own_top_performers", [])
        if own_top:
            own_lines = []
            for item in own_top[:5]:
                caption_preview = (item.get("caption", "") or "")[:100]
                own_lines.append(f"  - @{item.get('source_account', '?')}: {item.get('like_count', 0)} likes | \"{caption_preview}...\"")
            own_block = "\n".join(own_lines)
            avoidance += f"""

YOUR AUDIENCE'S TOP PERFORMERS (content from OUR accounts that resonated):
{own_block}
Learn from what YOUR audience engages with. Use similar angles, tones, or topics that proved popular above."""

        # 🧬 Inject evolution lessons (what this agent has learned from past performance)
        lessons = intel.get("agent_lessons", "")
        if lessons:
            avoidance += f"""

YOUR EVOLUTION HISTORY (what you've learned from past performance):
{lessons}
Apply these learnings — double down on what works, avoid what doesn't."""

        # Strategy-specific prompt building
        if strategy in ("explore", "analyze"):
            prompt = self._build_explore_prompt(topic, topic_desc, recent_titles, avoidance, brand, is_post)
            source_type = "exploration"
        elif strategy in ("iterate", "refine"):
            prompt = self._build_iterate_prompt(intel, topic, avoidance, brand, is_post)
            source_type = "iteration"
        elif strategy in ("double_down", "systematic", "compound"):
            prompt = self._build_double_down_prompt(intel, topic, avoidance, brand, is_post)
            source_type = "amplification"
        elif strategy in ("trending", "post_trending", "post_explore", "post_analyze", "post_refine"):
            prompt = self._build_trending_prompt(intel, topic, avoidance, brand, is_post)
            source_type = "trending"
        else:
            # Default: explore
            prompt = self._build_explore_prompt(topic, topic_desc, recent_titles, avoidance, brand, is_post)
            source_type = "exploration"

        _agent_log(self.agent_id, f"Strategy: {strategy}", f"Topic: {topic}{brand_label}", "💡", "detail")

        return self._call_ai_and_save(
            prompt=prompt,
            strategy=strategy,
            topic=topic,
            content_type=content_type,
            brand=brand,
            source_type=source_type,
        )

    # ──────────────────────────────────────────────────────────
    # PROMPT BUILDERS
    # ──────────────────────────────────────────────────────────

    def _build_explore_prompt(self, topic, topic_desc, recent_titles, avoidance, brand, is_post):
        """Build an explore/analyze strategy prompt."""
        handle = self.brand_handles.get(brand, "@brandhandle")
        titles_block = "\n".join(f"  - {t}" for t in recent_titles[:20]) if recent_titles else "  (no recent titles)"

        content_format = "carousel post with slide_texts" if is_post else "reel with content_lines"

        return f"""Generate a fresh {content_format} about: {topic}
Topic context: {topic_desc}

Brand: {brand or 'generic'}
Instagram handle: {handle}

RECENTLY COVERED TITLES (AVOID DUPLICATING):
{titles_block}

{avoidance}

Create something NEW and DIFFERENT from the above titles.
Pick an unexpected angle or lesser-known fact within the "{topic}" domain.

Respond with a JSON object:
{{
  "title": "YOUR TITLE IN ALL CAPS",
  {"\"slide_texts\": [\"paragraph 1\", \"paragraph 2\", \"paragraph 3\"]," if is_post else "\"content_lines\": [\"Topic - Fact\", \"Topic - Fact\", ..., \"If you want to learn more about your health, follow this page!\"],"}
  "image_prompt": "describe the background image...",
  "caption": "full Instagram caption with {handle}...",
  "reasoning": "explain WHY you chose this angle and what makes it unique"
}}"""

    def _build_iterate_prompt(self, intel, topic, avoidance, brand, is_post):
        """Build an iterate/refine strategy prompt."""
        handle = self.brand_handles.get(brand, "@brandhandle")
        content_format = "carousel post with slide_texts" if is_post else "reel with content_lines"

        # Pick an underperformer to improve
        underperformers = intel.get("underperformers", [])
        if underperformers:
            target = random.choice(underperformers)
            ref_title = target.get("title", "")
            ref_score = target.get("performance_score", 0)
            context = f"""UNDERPERFORMER TO IMPROVE:
Title: "{ref_title}"
Performance score: {ref_score}
What likely went wrong: weak hook, boring angle, or over-covered topic.

Create a BETTER version with a stronger hook, more surprising angle, or more specific claim."""
        else:
            context = f"""No specific underperformer available.
Create a {content_format} about {topic} with the STRONGEST possible hook."""

        return f"""Improve this content as a {content_format}.
Brand: {brand or 'generic'}
Instagram handle: {handle}

{context}

{avoidance}

Respond with a JSON object:
{{
  "title": "YOUR IMPROVED TITLE IN ALL CAPS",
  {"\"slide_texts\": [\"paragraph 1\", \"paragraph 2\", \"paragraph 3\"]," if is_post else "\"content_lines\": [\"Topic - Fact\", \"Topic - Fact\", ..., \"If you want to learn more about your health, follow this page!\"],"}
  "image_prompt": "describe the background image...",
  "caption": "full Instagram caption with {handle}...",
  "reasoning": "explain WHAT you improved and WHY it should perform better"
}}"""

    def _build_double_down_prompt(self, intel, topic, avoidance, brand, is_post):
        """Build a double-down/systematic/compound strategy prompt."""
        handle = self.brand_handles.get(brand, "@brandhandle")
        content_format = "carousel post with slide_texts" if is_post else "reel with content_lines"

        # Pick a top performer to amplify
        top_performers = intel.get("top_performers", [])
        if top_performers:
            target = random.choice(top_performers[:5])
            ref_title = target.get("title", "")
            ref_score = target.get("performance_score", 0)
            context = f"""TOP PERFORMER TO AMPLIFY:
Title: "{ref_title}"
Performance score: {ref_score}
This content resonated. Create a VARIATION that explores the same domain
but from a DIFFERENT angle. Same energy, new information."""
        else:
            context = f"""No top performer data available.
Create the most engaging {content_format} about {topic} possible."""

        return f"""Create a variation of a winning {content_format}.
Brand: {brand or 'generic'}
Instagram handle: {handle}

{context}

{avoidance}

Respond with a JSON object:
{{
  "title": "YOUR VARIATION TITLE IN ALL CAPS",
  {"\"slide_texts\": [\"paragraph 1\", \"paragraph 2\", \"paragraph 3\"]," if is_post else "\"content_lines\": [\"Topic - Fact\", \"Topic - Fact\", ..., \"If you want to learn more about your health, follow this page!\"],"}
  "image_prompt": "describe the background image...",
  "caption": "full Instagram caption with {handle}...",
  "reasoning": "explain how this variation DIFFERS from the original while keeping what works"
}}"""

    def _build_trending_prompt(self, intel, topic, avoidance, brand, is_post):
        """Build a trending strategy prompt."""
        handle = self.brand_handles.get(brand, "@brandhandle")
        content_format = "carousel post with slide_texts" if is_post else "reel with content_lines"

        trending = intel.get("trending", [])
        if trending:
            trend = random.choice(trending[:5])
            trend_caption = (trend.get("caption", "") or "")[:200]
            trend_account = trend.get("source_account", "unknown")
            context = f"""TRENDING CONTENT TO ADAPT:
From: @{trend_account}
Caption preview: "{trend_caption}"
Likes: {trend.get('like_count', 0)}

Adapt the VIRAL FORMAT of this trending content to our health/wellness niche.
Keep the structure that makes it engaging but use our topic and voice."""
        else:
            context = f"""No specific trending content available.
Create a {content_format} about {topic} using a currently popular content format
(controversy, myth-busting, "most people get this wrong", etc.)."""

        return f"""Adapt trending content into a {content_format}.
Brand: {brand or 'generic'}
Instagram handle: {handle}

{context}

{avoidance}

Respond with a JSON object:
{{
  "title": "YOUR TRENDING-INSPIRED TITLE IN ALL CAPS",
  {"\"slide_texts\": [\"paragraph 1\", \"paragraph 2\", \"paragraph 3\"]," if is_post else "\"content_lines\": [\"Topic - Fact\", \"Topic - Fact\", ..., \"If you want to learn more about your health, follow this page!\"],"}
  "image_prompt": "describe the background image...",
  "caption": "full Instagram caption with {handle}...",
  "reasoning": "explain what trending element you adapted and WHY it should work for our audience"
}}"""

    # ──────────────────────────────────────────────────────────
    # AI CALL + DB SAVE
    # ──────────────────────────────────────────────────────────

    def _call_ai_and_save(
        self, prompt: str, strategy: str, topic: str = None,
        content_type: str = "reel", brand: str = None,
        source_type: str = None, source_ig_media_id: str = None,
        source_title: str = None, source_performance_score: float = None,
        source_account: str = None,
    ) -> Optional[TobyProposal]:
        """Call DeepSeek API, parse response, save proposal to DB."""

        is_post = content_type == "post"
        type_label = "📄 Post" if is_post else "🎬 Reel"

        # Build system prompt from template
        system_prompt_template = POST_SYSTEM_PROMPT_TEMPLATE if is_post else REEL_SYSTEM_PROMPT_TEMPLATE
        system_prompt = system_prompt_template.format(
            name=self.display_name,
            personality=self.personality,
        )
        max_tokens = 2500 if is_post else 1500

        try:
            _agent_log(self.agent_id, "API: DeepSeek",
                       f"strategy={strategy}, topic={topic or 'auto'}, temp={self.temperature}, type={type_label}",
                       "🌐", "api")

            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": self.temperature,
                    "max_tokens": max_tokens,
                },
                timeout=60,
            )

            if response.status_code != 200:
                _agent_log(self.agent_id, "API Error", f"HTTP {response.status_code}", "❌", "api")
                return None

            content_text = response.json()["choices"][0]["message"]["content"].strip()
            tokens = response.json().get("usage", {})
            _agent_log(self.agent_id, "API OK",
                       f"tokens: {tokens.get('prompt_tokens', '?')}→{tokens.get('completion_tokens', '?')}",
                       "✅", "api")

            # Parse JSON
            parsed = self._parse_json(content_text)
            if not parsed:
                _agent_log(self.agent_id, "Parse Error", f"Failed to parse JSON ({len(content_text)} chars)", "❌")
                return None

            title = parsed.get("title", "")
            image_prompt = parsed.get("image_prompt", "")
            caption = parsed.get("caption", "")
            reasoning = parsed.get("reasoning", "No reasoning provided")

            if is_post:
                slide_texts = parsed.get("slide_texts", [])
                content_lines = []
                if not title or not slide_texts:
                    return None
            else:
                content_lines = parsed.get("content_lines", [])
                slide_texts = None
                if not title or not content_lines:
                    return None

            # Topic classification
            topic_bucket = topic or ContentHistory.classify_topic_bucket(title)

            # Duplicate check (brand-aware)
            if brand:
                is_dup = self.tracker.is_duplicate_for_brand(title, brand, content_type, days=60)
                if is_dup:
                    if self.tracker.is_high_performer(title, content_type):
                        _agent_log(self.agent_id, "Dup allowed", f"High performer: '{title[:40]}'", "🔄", "detail")
                    else:
                        _agent_log(self.agent_id, "Dup BLOCKED", f"'{title[:40]}' used for {brand} in 60d", "🚫", "detail")
                        return None

            # Quality check
            from app.services.content_tracker import check_post_quality
            quality = check_post_quality(title)

            # Generate proposal ID
            proposal_id = self._generate_proposal_id()

            # Save to DB
            from app.db_connection import SessionLocal
            db = SessionLocal()
            try:
                proposal = TobyProposal(
                    proposal_id=proposal_id,
                    status="pending",
                    content_type=content_type,
                    brand=brand,
                    variant=self.variant,
                    strategy=strategy,
                    reasoning=reasoning,
                    title=title,
                    content_lines=content_lines if content_lines else None,
                    slide_texts=slide_texts if slide_texts else None,
                    image_prompt=image_prompt,
                    caption=caption or None,
                    topic_bucket=topic_bucket,
                    source_type=source_type,
                    source_ig_media_id=source_ig_media_id,
                    source_title=source_title,
                    source_performance_score=source_performance_score,
                    source_account=source_account,
                    quality_score=quality.score,
                    agent_name=self.agent_id,  # ← dynamic agent name
                )
                db.add(proposal)
                db.commit()
                db.refresh(proposal)

                _agent_log(self.agent_id, "Saved",
                           f"{proposal_id} brand={brand} strategy={strategy} topic={topic_bucket} Q={quality.score}",
                           "💾", "detail")

                # Record in content history
                try:
                    self.tracker.record_proposal(
                        title=title, content_type=content_type, brand=brand,
                        caption=caption, content_lines=content_lines,
                        image_prompt=image_prompt, quality_score=quality.score,
                    )
                except Exception:
                    pass

                # Mark trending as used
                if source_type in ("trending_hashtag", "competitor") and source_ig_media_id:
                    try:
                        from app.services.trend_scout import get_trend_scout
                        get_trend_scout().mark_as_used(source_ig_media_id, proposal_id)
                    except Exception:
                        pass

                return proposal
            finally:
                db.close()

        except Exception as e:
            _agent_log(self.agent_id, "Error", f"_call_ai_and_save failed: {str(e)[:200]}", "❌", "api")
            return None

    def _parse_json(self, text: str) -> Optional[Dict]:
        """Parse JSON from AI response, handling markdown wrappers."""
        if "```" in text:
            parts = text.split("```")
            for part in parts:
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:]
                part = part.strip()
                if part.startswith("{"):
                    text = part
                    break
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return None

    def _generate_proposal_id(self) -> str:
        """Generate a unique proposal ID like AGENT-001."""
        from app.db_connection import SessionLocal
        from sqlalchemy import func
        db = SessionLocal()
        try:
            max_id = db.query(func.max(TobyProposal.id)).scalar()
            num = (max_id or 0) + 1
            return f"{self.proposal_prefix}-{num:03d}"
        finally:
            db.close()


# ─── Agent Factory ────────────────────────────────────────────

# Cache of instantiated agents
_agent_cache: Dict[str, GenericAgent] = {}


def get_all_active_agents() -> List[GenericAgent]:
    """Load all active agents from DB and return GenericAgent instances."""
    global _agent_cache
    from app.db_connection import SessionLocal

    db = SessionLocal()
    try:
        configs = db.query(AIAgent).filter(AIAgent.active == True).order_by(AIAgent.id).all()
        agents = []
        for cfg in configs:
            if cfg.agent_id not in _agent_cache:
                _agent_cache[cfg.agent_id] = GenericAgent(cfg)
            agents.append(_agent_cache[cfg.agent_id])
        return agents
    finally:
        db.close()


def get_agent(agent_id: str) -> Optional[GenericAgent]:
    """Get a specific agent by ID."""
    global _agent_cache
    if agent_id in _agent_cache:
        return _agent_cache[agent_id]

    from app.db_connection import SessionLocal
    db = SessionLocal()
    try:
        cfg = db.query(AIAgent).filter(AIAgent.agent_id == agent_id, AIAgent.active == True).first()
        if cfg:
            _agent_cache[agent_id] = GenericAgent(cfg)
            return _agent_cache[agent_id]
        return None
    finally:
        db.close()


def refresh_agent_cache():
    """Clear cache so agents reload from DB on next call."""
    global _agent_cache
    _agent_cache.clear()


def seed_builtin_agents():
    """
    Ensure Toby and Lexi exist in the ai_agents table.
    Called on app startup. Idempotent.
    """
    from app.db_connection import SessionLocal
    import json

    db = SessionLocal()
    try:
        # Toby
        if not db.query(AIAgent).filter(AIAgent.agent_id == "toby").first():
            db.add(AIAgent(
                agent_id="toby",
                display_name="Toby",
                personality="Creative risk-taker. Explores boldly, swings for viral hits. 'Fortune favors the bold.' High creativity, surprising angles, unexpected facts.",
                temperature=0.9,
                variant="dark",
                proposal_prefix="TOBY",
                strategy_names=json.dumps(["explore", "iterate", "double_down", "trending"]),
                strategy_weights=json.dumps({"explore": 0.30, "iterate": 0.20, "double_down": 0.30, "trending": 0.20}),
                risk_tolerance="high",
                proposals_per_brand=3,
                content_types=json.dumps(["reel"]),
                active=True,
                is_builtin=True,
                created_for_brand="healthycollege",
            ))
            print("✅ Seeded AI agent: Toby (builtin)", flush=True)

        # Lexi
        if not db.query(AIAgent).filter(AIAgent.agent_id == "lexi").first():
            db.add(AIAgent(
                agent_id="lexi",
                display_name="Lexi",
                personality="Precision optimizer. Compound small wins into massive growth. Data-backed, systematic, 80% proven patterns. Consistent engagement over viral moonshots.",
                temperature=0.75,
                variant="light",
                proposal_prefix="LEXI",
                strategy_names=json.dumps(["analyze", "refine", "systematic", "compound"]),
                strategy_weights=json.dumps({"analyze": 0.30, "refine": 0.40, "systematic": 0.15, "compound": 0.15}),
                risk_tolerance="low",
                proposals_per_brand=3,
                content_types=json.dumps(["reel"]),
                active=True,
                is_builtin=True,
                created_for_brand="vitalitycollege",
            ))
            print("✅ Seeded AI agent: Lexi (builtin)", flush=True)

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"⚠️ Agent seeding error: {e}", flush=True)
    finally:
        db.close()


# ── All available strategies that agents can be born with ──
_ALL_STRATEGIES = ["explore", "iterate", "double_down", "trending", "analyze", "refine", "systematic", "compound"]


def _randomize_dna() -> Dict:
    """
    Generate random agent DNA — temperature, variant, strategies, weights, risk.
    Used when auto-spawning agents for new brands.
    """
    import random as _rng
    temp = round(_rng.uniform(0.70, 0.95), 2)
    variant = _rng.choice(["dark", "light"])
    risk = _rng.choice(["low", "medium", "high"])
    # Pick 4-5 random strategies from the pool
    n_strategies = _rng.randint(4, 5)
    strategies = _rng.sample(_ALL_STRATEGIES, min(n_strategies, len(_ALL_STRATEGIES)))
    # Random weights that sum to 1.0
    raw_weights = [_rng.random() for _ in strategies]
    total = sum(raw_weights)
    weights = {s: round(w / total, 2) for s, w in zip(strategies, raw_weights)}
    # Fix rounding to exactly 1.0
    diff = round(1.0 - sum(weights.values()), 2)
    if diff != 0:
        weights[strategies[0]] = round(weights[strategies[0]] + diff, 2)
    return {
        "temperature": temp,
        "variant": variant,
        "risk_tolerance": risk,
        "strategies": strategies,
        "strategy_weights": weights,
    }


def create_agent_for_brand(
    brand_id: str,
    agent_name: str,
    personality: str = None,
    temperature: float = 0.85,
    variant: str = "dark",
    strategies: List[str] = None,
    strategy_weights: Dict[str, float] = None,
    randomize: bool = False,
) -> AIAgent:
    """
    Auto-provision a new AI agent when a brand is created.

    When randomize=True, ignores temperature/variant/strategies/strategy_weights
    and generates random DNA instead — making every agent unique at birth.

    Called from brand_manager.create_brand().
    Returns the created AIAgent model.
    """
    import json as _json
    from app.db_connection import SessionLocal

    agent_id = agent_name.lower().replace(" ", "_")
    prefix = agent_name.upper()[:6]

    # 🧬 Randomize DNA if requested
    if randomize:
        dna = _randomize_dna()
        temperature = dna["temperature"]
        variant = dna["variant"]
        strategies = dna["strategies"]
        strategy_weights = dna["strategy_weights"]
        risk_tolerance = dna["risk_tolerance"]
    else:
        risk_tolerance = "medium"

    if strategies is None:
        strategies = ["explore", "iterate", "double_down", "trending"]
    if strategy_weights is None:
        strategy_weights = {"explore": 0.30, "iterate": 0.25, "double_down": 0.25, "trending": 0.20}
    if personality is None:
        personality = f"Balanced content strategist for {brand_id}. Creative yet data-informed. Explores new topics while building on proven patterns."

    db = SessionLocal()
    try:
        existing = db.query(AIAgent).filter(AIAgent.agent_id == agent_id).first()
        if existing:
            return existing

        agent = AIAgent(
            agent_id=agent_id,
            display_name=agent_name,
            personality=personality,
            temperature=temperature,
            variant=variant,
            proposal_prefix=prefix,
            strategy_names=_json.dumps(strategies),
            strategy_weights=_json.dumps(strategy_weights),
            risk_tolerance=risk_tolerance,
            proposals_per_brand=3,
            content_types=_json.dumps(["reel", "post"]),
            active=True,
            is_builtin=False,
            created_for_brand=brand_id,
        )
        db.add(agent)
        db.commit()
        db.refresh(agent)

        # Clear cache so it picks up the new agent
        refresh_agent_cache()

        dna_str = f"temp={temperature}, variant={variant}, strategies={strategies}"
        _agent_log(agent_id, "Created", f"🧬 Agent '{agent_name}' for {brand_id} — DNA: {dna_str}", "🎉", "action")
        return agent
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()
