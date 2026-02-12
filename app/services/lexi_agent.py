"""
Lexi Agent — Data-Driven Content Optimizer.

Lexi is the second AI agent in the Maestro system. While Toby explores
and takes creative risks, Lexi systematically optimises content through
data analysis, incremental refinement, and structured experimentation.

Four strategies:
    1. ANALYZE    — find patterns in top performers and replicate them
    2. REFINE     — take a winner and improve exactly one element
    3. SYSTEMATIC — structured experiment testing a single variable
    4. COMPOUND   — extend a winning series with a fresh episode

Philosophy: "Compound small wins into massive growth."
Risk tolerance: LOW (80% data-backed)
Expected hit rate: 70% (steady, consistent engagement)

Lexi supports both reels and posts, using the same content templates
as Toby but with different strategic approaches.
"""

import json
import os
import random
import re
import time
from datetime import datetime, timedelta, date
from typing import Any, Dict, List, Optional, Tuple

import requests

from app.models import TobyProposal, PostPerformance, TrendingContent, ContentHistory
from app.services.content_tracker import get_content_tracker, TOPIC_BUCKETS


# ── Config ──
MAX_PROPOSALS_PER_DAY = 15  # Shared with Toby — Maestro manages the split

# Brand Instagram handles (for inserting real @handle into AI prompts)
BRAND_HANDLES = {
    "healthycollege": "@thehealthycollege",
    "vitalitycollege": "@thevitalitycollege",
    "longevitycollege": "@thelongevitycollege",
    "holisticcollege": "@theholisticcollege",
    "wellbeingcollege": "@thewellbeingcollege",
}

LEXI_STRATEGY_WEIGHTS = {
    "analyze": 0.30,       # 30% — find patterns in winners
    "refine": 0.40,        # 40% — optimise proven content
    "systematic": 0.15,    # 15% — structured experiments
    "compound": 0.15,      # 15% — extend winning series
}

# ── System Prompts ──

LEXI_SYSTEM_PROMPT = """You are Lexi, a precision content strategist for health & wellness Instagram accounts.

YOUR PHILOSOPHY: "Compound small wins into massive growth."
YOUR MISSION: Systematically optimise engagement through data-driven iteration.

You prioritize:
1. PROVEN PATTERNS over untested ideas (80% weight)
2. INCREMENTAL OPTIMIZATION over big swings
3. DATA-BACKED decisions over gut feelings
4. CONSISTENT ENGAGEMENT over viral moonshots

AUDIENCE AVATAR (internal strategy only — NEVER mention in content):
- Women aged 45+
- Located in the United States, Canada, and United Kingdom
- Health-conscious, interested in natural remedies, supplements, anti-aging, longevity
- Engaged on Instagram, prefers short-form educational video content (Reels)
- Values science-backed information presented accessibly

CRITICAL RULE — NEVER MENTION THE AVATAR DIRECTLY:
- NEVER write "women over 40", "women 45+", "if you're over 50", "for women" etc.
- Content must appeal UNIVERSALLY to anyone interested in health/wellness
- Let the TOPIC itself naturally attract the avatar
- Content-based targeting is KING on Instagram

OUR REEL TEMPLATE (fixed format, text-only overlays on AI-generated background):

1) TITLE — ALL CAPS. Bold, scroll-stopping. Optimized based on proven patterns.
   Top performer examples:
   - "METABOLISM SECRETS DOCTORS DON'T SHARE"
   - "YOUR GUT PRODUCES 90% OF YOUR SEROTONIN"
   - "ONE DAILY HABIT CAN CHANGE YOUR HEALTH"

2) CONTENT LINES — 6-8 numbered text slides.
   Format: "Topic/claim - Supporting fact or benefit"
   Do NOT include any CTA (call-to-action) line — the CTA is added automatically by the system.

3) IMAGE PROMPT — Soft, minimal, calming wellness aesthetic. Main subject CENTERED in UPPER area.
   Must end with: "No text, no letters, no numbers, no symbols, no logos."

4) CAPTION — Full Instagram caption:
   - Hook paragraph, science explanation, CTA blocks, disclaimer, 5-8 hashtags

CONTENT GUIDELINES:
- Health & wellness niche ONLY
- Educational and informational tone
- Science-backed claims with plausible research references
- 60% validating + 40% surprising content mix
- No medical advice or cure claims
- No emojis in title or content_lines (only in caption)
- No em-dashes or en-dashes in content_lines (use regular dash - )

WHAT MAKES YOU DIFFERENT FROM OTHER STRATEGISTS:
- You ALWAYS reference specific performance data when making decisions
- You explain the DATA PATTERN behind every choice
- You change only ONE variable at a time (scientific method)
- You build on proven success, not hope
- Your proposals feel like the "obvious next step" from the data"""


LEXI_POST_SYSTEM_PROMPT = """You are Lexi, a precision content strategist for health & wellness Instagram carousel posts.
You specialise in data-driven, incremental optimisation of educational, science-backed content.

YOUR PHILOSOPHY: "Compound small wins into massive growth."

AUDIENCE AVATAR (internal strategy only — NEVER mention in content):
- Women aged 45+, US/Canada/UK, health-conscious
- NEVER mention demographics directly — let the topic attract the avatar

OUR POST TEMPLATE (cover slide + 3-4 text carousel slides):

1) TITLE — ALL CAPS. Statement-based (NOT list-style "5 SIGNS...").
   Optimised based on proven engagement patterns.

2) SLIDE TEXTS — 3-4 paragraphs (3-6 sentences each):
   - Slide 1: Core scientific explanation
   - Slide 2: Deeper mechanism / practical context
   - Slide 3: Actionable takeaways + recommendations
   - Slide 4 (optional): Closing + CTA
   NO em-dashes or en-dashes.

3) IMAGE PROMPT — 1080x1350 portrait. Soft, minimal wellness aesthetic.
   Must end with: "No text, no letters, no numbers, no symbols, no logos."

4) CAPTION — With REAL DOI reference:
   - Hook, science explanation, practical takeaway
   - Source: Author(s). (Year). Title. Journal. DOI: 10.xxxx/xxxxx (MUST BE REAL)
   - Disclaimer block
   - 5-8 hashtags

CONTENT GUIDELINES:
- Health & wellness only, educational tone
- Every post references a real study with valid DOI
- No medical advice, no demographic callouts
- Optimise based on what the DATA shows works"""


class LexiAgent:
    """
    Lexi's brain — generates data-driven content proposals.
    """

    def __init__(self):
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = "https://api.deepseek.com/v1"
        self.tracker = get_content_tracker()
        print("✅ LexiAgent initialized (Data-Driven Content Optimizer)", flush=True)

    # ──────────────────────────────────────────────────────────
    # MAIN: RUN LEXI
    # ──────────────────────────────────────────────────────────

    def run(self, max_proposals: int = None, content_type: str = "reel", brand: str = None) -> Dict:
        """
        Main entry point: Lexi analyses data and generates proposals.

        Args:
            max_proposals: Max proposals this run
            content_type: "reel" or "post"
            brand: Target brand for these proposals (e.g. "healthycollege")

        Returns summary dict.
        """
        from app.services.maestro import maestro_log

        if not self.api_key:
            maestro_log("lexi", "Error", "No DEEPSEEK_API_KEY configured", "❌", "action")
            return {"error": "No DEEPSEEK_API_KEY configured", "proposals": []}

        if max_proposals is None:
            max_proposals = MAX_PROPOSALS_PER_DAY

        # When called with a specific brand (from Maestro), skip daily quota check
        # — Maestro manages the overall budget. max_proposals = how many THIS call.
        today_count = self._count_proposals_today()
        if brand:
            # Per-brand call from Maestro: generate exactly max_proposals
            remaining = max_proposals
        else:
            # Standalone call: enforce daily cap
            remaining = max(0, max_proposals - today_count)
            if remaining == 0:
                maestro_log("lexi", "Quota reached", f"Already made {today_count} proposals today", "😴", "action")
                return {"message": f"Quota reached ({today_count})", "proposals": []}

        brand_label = f" for {brand}" if brand else ""
        ct_label = "📄 POST" if content_type == "post" else "🎬 REEL"
        maestro_log("lexi", "Planning", f"{ct_label}{brand_label} — Today: {today_count} total. Generating {remaining} proposals.", "🎯", "detail")

        intel = self._gather_intelligence(content_type=content_type, brand=brand)
        strategy_plan = self._plan_strategies(remaining, intel)

        proposals = []
        for strategy, count in strategy_plan.items():
            for _ in range(count):
                try:
                    proposal = self._generate_proposal(strategy, intel, content_type=content_type, brand=brand)
                    if proposal:
                        proposals.append(proposal)
                except Exception as e:
                    maestro_log("lexi", "Error", f"Proposal generation failed ({strategy}): {e}", "❌", "detail")

        return {
            "proposals_created": len(proposals),
            "today_total": today_count + len(proposals),
            "max_per_day": max_proposals,
            "strategies_used": {s: c for s, c in strategy_plan.items() if c > 0},
            "intel_summary": {
                "top_performers": len(intel.get("top_performers", [])),
                "underperformers": len(intel.get("underperformers", [])),
                "trending_available": len(intel.get("trending", [])),
                "topics_on_cooldown": intel.get("topics_on_cooldown", []),
            },
            "proposals": [p.to_dict() for p in proposals],
        }

    # ──────────────────────────────────────────────────────────
    # INTELLIGENCE GATHERING
    # ──────────────────────────────────────────────────────────

    def _gather_intelligence(self, content_type: str = "reel", brand: str = None) -> Dict:
        """Gather performance data for data-driven decisions (brand-aware)."""
        from app.services.maestro import maestro_log

        intel: Dict[str, Any] = {}
        intel["brand"] = brand  # Store for strategy methods
        is_post = content_type == "post"
        type_label = "📄 Post" if is_post else "🎬 Reel"
        brand_label = f" for {brand}" if brand else ""
        maestro_log("lexi", "Gathering intelligence", f"Pulling data for {type_label} proposals{brand_label}...", "🔎", "detail")

        # 1. Performance data
        try:
            from app.services.metrics_collector import get_metrics_collector
            collector = get_metrics_collector()

            maestro_log("lexi", "API: MetricsCollector", "get_top_performers(reel, limit=15)", "📡", "api")
            intel["top_performers"] = collector.get_top_performers("reel", limit=15)
            maestro_log("lexi", "Data: Top performers", f"Found {len(intel['top_performers'])} winners", "📊", "data")

            maestro_log("lexi", "API: MetricsCollector", "get_underperformers(reel, limit=10)", "📡", "api")
            intel["underperformers"] = collector.get_underperformers("reel", limit=10)

            maestro_log("lexi", "API: MetricsCollector", "get_performance_summary()", "📡", "api")
            intel["performance_summary"] = collector.get_performance_summary()
        except Exception as e:
            maestro_log("lexi", "Error: Metrics", f"Failed: {e}", "❌", "detail")
            intel["top_performers"] = []
            intel["underperformers"] = []
            intel["performance_summary"] = {}

        # 2. Trending content
        try:
            from app.services.trend_scout import get_trend_scout
            scout = get_trend_scout()
            intel["trending"] = scout.get_trending_for_toby(min_likes=200, limit=15, content_type=content_type)
            maestro_log("lexi", "Data: Trending", f"Found {len(intel['trending'])} trending pieces for {type_label}", "📊", "data")
        except Exception as e:
            maestro_log("lexi", "Error: Trends", f"Failed: {e}", "❌", "detail")
            intel["trending"] = []

        # 3. Content history (brand-aware)
        try:
            maestro_log("lexi", "API: ContentTracker", f"Checking {type_label} history{brand_label} and cooldowns", "📡", "api")
            intel["recent_titles"] = self.tracker.get_recent_titles(content_type, limit=60, brand=brand)
            intel["topics_on_cooldown"] = [
                t for t in TOPIC_BUCKETS
                if t not in self.tracker.get_available_topics(content_type)
            ]
            intel["available_topics"] = self.tracker.get_available_topics(content_type)
            intel["content_stats"] = self.tracker.get_stats(content_type)

            # Build rich brand-specific avoidance block for prompt injection
            if brand:
                intel["brand_avoidance"] = self.tracker.get_brand_avoidance_prompt(
                    brand=brand, content_type=content_type, days=60
                )
            else:
                intel["brand_avoidance"] = ""

            maestro_log("lexi", "Data: Content history",
                        f"{len(intel['recent_titles'])} recent{brand_label}, {len(intel['topics_on_cooldown'])} on cooldown, {len(intel['available_topics'])} available",
                        "📊", "data")
        except Exception as e:
            maestro_log("lexi", "Error: Content tracker", f"Failed: {e}", "❌", "detail")
            intel["recent_titles"] = []
            intel["topics_on_cooldown"] = []
            intel["available_topics"] = list(TOPIC_BUCKETS)
            intel["content_stats"] = {}
            intel["brand_avoidance"] = ""

        # 4. Best/worst topic rankings
        perf_summary = intel.get("performance_summary", {})
        topic_rankings = perf_summary.get("topic_rankings", [])
        intel["best_topics"] = [t["topic"] for t in topic_rankings[:5]] if topic_rankings else []
        intel["worst_topics"] = [t["topic"] for t in topic_rankings[-3:]] if len(topic_rankings) >= 3 else []

        return intel

    # ──────────────────────────────────────────────────────────
    # STRATEGY PLANNING
    # ──────────────────────────────────────────────────────────

    def _plan_strategies(self, count: int, intel: Dict) -> Dict[str, int]:
        """Decide how many proposals per strategy based on data availability."""
        from app.services.maestro import maestro_log

        weights = dict(LEXI_STRATEGY_WEIGHTS)
        adjustments = []

        # Lexi NEEDS top performers for most strategies
        if not intel.get("top_performers"):
            weights["refine"] = 0.0
            weights["compound"] = 0.0
            weights["analyze"] += 0.30
            weights["systematic"] += 0.25
            adjustments.append("No top performers → disabled refine+compound, boosted analyze+systematic")

        if not intel.get("underperformers") and not intel.get("top_performers"):
            weights["analyze"] = 0.5
            weights["systematic"] = 0.5
            adjustments.append("No performance data → 50/50 analyze+systematic")

        if not adjustments:
            adjustments.append("Full data available — using default Lexi weights")

        # Normalise
        total = sum(weights.values())
        if total == 0:
            weights = {"analyze": 1.0, "refine": 0, "systematic": 0, "compound": 0}
            total = 1.0

        plan = {}
        allocated = 0
        for strategy, weight in weights.items():
            n = round(count * weight / total)
            plan[strategy] = n
            allocated += n

        diff = count - allocated
        if diff > 0:
            plan["analyze"] = plan.get("analyze", 0) + diff
        elif diff < 0:
            for s in ["systematic", "compound", "refine", "analyze"]:
                if plan.get(s, 0) > 0 and diff < 0:
                    plan[s] -= 1
                    diff += 1
                    if diff == 0:
                        break

        for adj in adjustments:
            maestro_log("lexi", "Strategy adjustment", adj, "🎛️", "detail")

        active = {s: c for s, c in plan.items() if c > 0}
        plan_str = ", ".join(f"{s}: {c}" for s, c in active.items())
        maestro_log("lexi", "Strategy plan", f"Generating {count} → [{plan_str}]", "🗺️", "detail")

        return plan

    # ──────────────────────────────────────────────────────────
    # PROPOSAL GENERATION (ROUTER)
    # ──────────────────────────────────────────────────────────

    def _generate_proposal(self, strategy: str, intel: Dict, content_type: str = "reel", brand: str = None) -> Optional[TobyProposal]:
        """Route to the right strategy method."""
        if content_type == "post":
            if strategy == "refine":
                return self._strategy_post_refine(intel, brand=brand)
            else:
                return self._strategy_post_analyze(intel, brand=brand)
        else:
            if strategy == "analyze":
                return self._strategy_analyze(intel, brand=brand)
            elif strategy == "refine":
                return self._strategy_refine(intel, brand=brand)
            elif strategy == "systematic":
                return self._strategy_systematic(intel, brand=brand)
            elif strategy == "compound":
                return self._strategy_compound(intel, brand=brand)
            else:
                return self._strategy_analyze(intel, brand=brand)

    # ══════════════════════════════════════════════════════════
    # REEL STRATEGIES
    # ══════════════════════════════════════════════════════════

    def _strategy_analyze(self, intel: Dict, brand: str = None) -> Optional[TobyProposal]:
        """ANALYZE: Find a pattern in top performers and replicate it."""
        from app.services.maestro import maestro_log

        top = intel.get("top_performers", [])
        available = intel.get("available_topics", list(TOPIC_BUCKETS))
        best_topics = intel.get("best_topics", [])
        recent_titles = intel.get("recent_titles", [])

        # Pick from best-performing topics if possible
        topic = random.choice(best_topics) if best_topics else (random.choice(available) if available else "general")
        maestro_log("lexi", "Analyze", f"Data-driven topic: '{topic}' (from {len(best_topics)} best-performing topics)", "📊", "detail")

        top_summary = ""
        if top:
            top_summary = "TOP PERFORMING REELS (patterns to replicate):\n"
            for i, t in enumerate(top[:5]):
                top_summary += f"  #{i+1}: \"{t.get('title', 'N/A')}\" — score {t.get('performance_score', 0)}, views {t.get('views', 0)}, topic: {t.get('topic_bucket', 'N/A')}\n"

        # Use rich brand-aware avoidance (60 days per-brand + cross-brand)
        avoidance = intel.get("brand_avoidance", "")
        if not avoidance and recent_titles:
            avoidance = "\n\nAVOID these recently used titles:\n" + "\n".join(f"- {t}" for t in recent_titles[:30])

        # Use actual brand handle if brand is assigned
        brand_handle = BRAND_HANDLES.get(brand, "@brandhandle") if brand else "@brandhandle"

        prompt = f"""Analyze our top-performing content and create a data-backed new reel.

{top_summary}

Strategy: ANALYZE — find the PATTERN in what works (hook structure, topic angle, emotional trigger) and create content that follows the same pattern.
Best Topic bucket: {topic}

{avoidance}

Your task:
1. Identify the PATTERN shared by top performers (hook type, length, emotional angle)
2. Create new content that follows this proven pattern
3. Use the same structural elements that drove engagement
4. Must be a fresh topic/angle — not a copy, but pattern-matched

REMEMBER: Do NOT mention age, gender, or demographics in any content.

OUTPUT FORMAT (JSON only):
{{
    "title": "PATTERN-MATCHED TITLE IN ALL CAPS",
    "content_lines": ["Fact 1 - Benefit", "Fact 2 - Benefit", "Fact 3 - Benefit", "Fact 4 - Benefit", "Fact 5 - Benefit", "Fact 6 - Benefit"],
    "image_prompt": "Soft, minimal wellness aesthetic. Subject centered upper area. No text, no letters, no numbers, no symbols, no logos.",
    "caption": "Hook paragraph...\\n\\nScience explanation...\\n\\n👉🏼 Follow {brand_handle}...\\n\\n🩵 Save and share...\\n\\n💬 Follow for more...\\n\\n🌱 Educational purposes...\\n\\n#hashtags",
    "reasoning": "What pattern you identified in top performers and how this content replicates it."
}}"""

        return self._call_ai_and_save(prompt, strategy="analyze", topic=topic, brand=brand)

    def _strategy_refine(self, intel: Dict, brand: str = None) -> Optional[TobyProposal]:
        """REFINE: Take a top performer and improve exactly one element."""
        from app.services.maestro import maestro_log

        top = intel.get("top_performers", [])
        if not top:
            maestro_log("lexi", "Refine → Analyze", "No top performers, falling back to analyze", "🔄", "detail")
            return self._strategy_analyze(intel, brand=brand)

        source = random.choice(top[:5])
        source_title = source.get("title", "Unknown")
        source_score = source.get("performance_score", 0)
        source_views = source.get("views", 0)
        source_saves = source.get("saves", 0)
        source_topic = source.get("topic_bucket", "general")

        maestro_log("lexi", "Refine", f"Optimizing winner: '{source_title[:60]}' (score: {source_score})", "🔬", "detail")

        # Use actual brand handle if brand is assigned
        brand_handle = BRAND_HANDLES.get(brand, "@brandhandle") if brand else "@brandhandle"

        prompt = f"""This reel performed well. Create a refined version by improving exactly ONE element.

WINNING REEL:
- Title: "{source_title}"
- Topic: {source_topic}
- Performance score: {source_score}/100
- Views: {source_views}
- Saves: {source_saves}

Strategy: REFINE — improve ONE element (the hook, the structure, OR the angle). Keep everything else the same.

Rules:
1. Identify the ONE element most likely to improve engagement further
2. Change ONLY that element — keep the rest of the winning formula
3. Explain exactly what you changed and WHY (A/B testing mindset)
4. Same topic, same emotional tone, just one variable optimized
5. Do NOT mention age, gender, or demographics

OUTPUT FORMAT (JSON only):
{{
    "title": "REFINED TITLE IN ALL CAPS",
    "content_lines": ["Fact 1 - Benefit", "Fact 2 - Benefit", "Fact 3 - Benefit", "Fact 4 - Benefit", "Fact 5 - Benefit", "Fact 6 - Benefit"],
    "image_prompt": "Soft, minimal wellness aesthetic. Subject centered upper area. No text, no letters, no numbers, no symbols, no logos.",
    "caption": "Hook paragraph...\\n\\nScience explanation...\\n\\n👉🏼 Follow {brand_handle}...\\n\\n🩵 Save and share...\\n\\n💬 Follow for more...\\n\\n🌱 Educational purposes...\\n\\n#hashtags",
    "reasoning": "Which ONE element you changed, why it needed improvement, and what you expect to happen."
}}"""

        return self._call_ai_and_save(
            prompt, strategy="refine", topic=source_topic, brand=brand,
            source_type="own_content",
            source_ig_media_id=source.get("ig_media_id"),
            source_title=source_title,
            source_performance_score=source_score,
        )

    def _strategy_systematic(self, intel: Dict, brand: str = None) -> Optional[TobyProposal]:
        """SYSTEMATIC: Design a structured content experiment."""
        from app.services.maestro import maestro_log

        available = intel.get("available_topics", list(TOPIC_BUCKETS))
        topic = random.choice(available) if available else "general"

        # Pick a variable to test
        test_variables = [
            "hook_type: Test a QUESTION-based hook vs our usual statement hooks",
            "content_depth: Test 8 content lines (deeper) vs standard 6-7",
            "specificity: Test VERY specific claims (exact numbers, studies) vs general claims",
            "emotional_angle: Test fear-based urgency vs positive aspiration",
            "structure: Test a Problem → Solution → Benefit structure vs Topic - Fact",
        ]
        test_var = random.choice(test_variables)

        maestro_log("lexi", "Systematic", f"Testing: {test_var.split(':')[0]} on topic '{topic}'", "🧪", "detail")

        # Use actual brand handle if brand is assigned
        brand_handle = BRAND_HANDLES.get(brand, "@brandhandle") if brand else "@brandhandle"

        prompt = f"""Design a content experiment by testing a specific variable.

Strategy: SYSTEMATIC — methodical A/B testing of one content variable.
Topic bucket: {topic}

EXPERIMENT VARIABLE:
{test_var}

Your task:
1. Create content that specifically tests this variable
2. Clearly state your HYPOTHESIS (what you expect to happen)
3. The content should be measurably different from our standard format
4. Keep everything else standard so the test is clean
5. Do NOT mention age, gender, or demographics

OUTPUT FORMAT (JSON only):
{{
    "title": "EXPERIMENTAL TITLE IN ALL CAPS",
    "content_lines": ["Fact 1 - Benefit", "Fact 2 - Benefit", "Fact 3 - Benefit", "Fact 4 - Benefit", "Fact 5 - Benefit", "Fact 6 - Benefit"],
    "image_prompt": "Soft, minimal wellness aesthetic. Subject centered upper area. No text, no letters, no numbers, no symbols, no logos.",
    "caption": "Hook paragraph...\\n\\nScience explanation...\\n\\n👉🏼 Follow {brand_handle}...\\n\\n🩵 Save and share...\\n\\n💬 Follow for more...\\n\\n🌱 Educational purposes...\\n\\n#hashtags",
    "reasoning": "HYPOTHESIS: [what you expect]. VARIABLE TESTED: [what's different]. CONTROL: [what stayed the same]. EXPECTED OUTCOME: [prediction]."
}}"""

        return self._call_ai_and_save(prompt, strategy="systematic", topic=topic, brand=brand)

    def _strategy_compound(self, intel: Dict, brand: str = None) -> Optional[TobyProposal]:
        """COMPOUND: Extend a winning topic with a fresh episode."""
        from app.services.maestro import maestro_log

        top = intel.get("top_performers", [])
        best_topics = intel.get("best_topics", [])

        if not top and not best_topics:
            maestro_log("lexi", "Compound → Analyze", "No winners to extend, falling back to analyze", "🔄", "detail")
            return self._strategy_analyze(intel, brand=brand)

        # Find the best topic to extend
        topic = random.choice(best_topics) if best_topics else "general"

        # Find examples from this topic
        topic_examples = [t for t in top if t.get("topic_bucket") == topic][:3]
        examples_str = ""
        if topic_examples:
            examples_str = f"PREVIOUS WINS in '{topic}':\n"
            for t in topic_examples:
                examples_str += f"  - \"{t.get('title', 'N/A')}\" (score: {t.get('performance_score', 0)})\n"

        maestro_log("lexi", "Compound", f"Extending winning topic '{topic}' ({len(topic_examples)} prior wins)", "📈", "detail")

        # Use actual brand handle if brand is assigned
        brand_handle = BRAND_HANDLES.get(brand, "@brandhandle") if brand else "@brandhandle"

        prompt = f"""This topic has been consistently successful. Create the next episode in the series.

Strategy: COMPOUND — build on established momentum with a fresh angle on a proven topic.
Topic: {topic}

{examples_str}

Your task:
1. Create a fresh angle on the SAME topic ({topic})
2. Similar enough that fans of the previous posts will engage
3. Different enough that it doesn't feel repetitive
4. Build on the knowledge from previous episodes (go deeper, cover adjacent sub-topics)
5. Maintain the winning formula (tone, structure, depth)
6. Do NOT mention age, gender, or demographics

OUTPUT FORMAT (JSON only):
{{
    "title": "NEXT EPISODE TITLE IN ALL CAPS",
    "content_lines": ["Fact 1 - Benefit", "Fact 2 - Benefit", "Fact 3 - Benefit", "Fact 4 - Benefit", "Fact 5 - Benefit", "Fact 6 - Benefit"],
    "image_prompt": "Soft, minimal wellness aesthetic. Subject centered upper area. No text, no letters, no numbers, no symbols, no logos.",
    "caption": "Hook paragraph...\\n\\nScience explanation...\\n\\n👉🏼 Follow {brand_handle}...\\n\\n🩵 Save and share...\\n\\n💬 Follow for more...\\n\\n🌱 Educational purposes...\\n\\n#hashtags",
    "reasoning": "How this builds on previous wins in this topic, what's new and what's familiar."
}}"""

        return self._call_ai_and_save(
            prompt, strategy="compound", topic=topic, brand=brand,
            source_type="own_content",
            source_title=f"Series: {topic}",
        )

    # ══════════════════════════════════════════════════════════
    # POST (CAROUSEL) STRATEGIES
    # ══════════════════════════════════════════════════════════

    def _post_output_format(self, brand: str = None) -> str:
        """Shared JSON output format for post strategies."""
        brand_handle = BRAND_HANDLES.get(brand, "@brandhandle") if brand else "@brandhandle"
        return f"""OUTPUT FORMAT (JSON only):
{{
    "title": "DATA-OPTIMIZED STATEMENT TITLE IN ALL CAPS",
    "slide_texts": [
        "Slide 2: Core scientific explanation paragraph (3-6 sentences).",
        "Slide 3: Deeper mechanism, practical context (3-6 sentences).",
        "Slide 4: Actionable takeaways (3-6 sentences). End with: Follow {brand_handle} to learn more about your health."
    ],
    "image_prompt": "Soft, minimal wellness aesthetic. 1080x1350 portrait. Subject centered upper area. No text, no letters, no numbers, no symbols, no logos.",
    "caption": "Hook paragraph...\\n\\nScience explanation...\\n\\nPractical takeaway...\\n\\nSource:\\nAuthor(s). (Year). Title. Journal.\\nDOI: 10.xxxx/xxxxx\\n\\nDisclaimer: Educational purposes only...\\n\\n#health #wellness",
    "reasoning": "Data pattern this builds on. What evidence led to this choice."
}}"""

    def _strategy_post_analyze(self, intel: Dict, brand: str = None) -> Optional[TobyProposal]:
        """POST ANALYZE: Data-driven carousel post creation."""
        from app.services.maestro import maestro_log

        available = intel.get("available_topics", list(TOPIC_BUCKETS))
        best_topics = intel.get("best_topics", [])
        recent_titles = intel.get("recent_titles", [])

        topic = random.choice(best_topics) if best_topics else (random.choice(available) if available else "general")
        maestro_log("lexi", "Post Analyze", f"Data-driven topic: '{topic}'", "📄", "detail")

        topic_descriptions = {
            "superfoods": "superfoods, nutrient-dense foods, and healing ingredients",
            "teas_drinks": "healthy teas, herbal drinks, matcha, golden milk",
            "supplements": "vitamins, minerals, collagen, magnesium, omega-3",
            "sleep": "sleep quality, circadian rhythm, melatonin",
            "morning_routines": "morning wellness routines and daily habits",
            "skin_antiaging": "skin health, collagen, anti-aging nutrition",
            "gut_health": "gut microbiome, digestion, prebiotics, fiber",
            "hormones": "hormonal balance, cortisol, thyroid, stress hormones",
            "stress_mood": "stress management, neuroplasticity, mood regulation",
            "hydration_detox": "hydration, cellular water, electrolytes",
            "brain_memory": "brain health, neuroplasticity, memory",
            "heart_health": "cardiovascular wellness, blood pressure",
            "general": "general health and longevity science",
        }
        topic_desc = topic_descriptions.get(topic, topic)

        # Use rich brand-aware avoidance
        avoidance = intel.get("brand_avoidance", "")
        if not avoidance and recent_titles:
            avoidance = "\n\nAVOID these recently used titles:\n" + "\n".join(f"- {t}" for t in recent_titles[:30])

        prompt = f"""Generate a data-optimized Instagram CAROUSEL POST about {topic_desc}.

Strategy: ANALYZE — create an educational carousel building on proven engagement patterns.
Topic bucket: {topic}

{avoidance}

Your task:
1. Find a compelling, science-backed health insight supported by a REAL published study
2. Create an ALL CAPS statement title optimized for engagement (NOT list-style)
3. Write 3-4 slide paragraphs: science → mechanism → practical advice
4. Write an Instagram caption with a REAL DOI reference
5. Explain the DATA reasoning behind your topic and angle choice

REMEMBER: Do NOT mention age, gender, or demographics. Universal appeal.

{self._post_output_format(brand=brand)}"""

        return self._call_ai_and_save(prompt, strategy="analyze", topic=topic, content_type="post", brand=brand)

    def _strategy_post_refine(self, intel: Dict, brand: str = None) -> Optional[TobyProposal]:
        """POST REFINE: Improve a winning topic with carousel variation."""
        from app.services.maestro import maestro_log

        best_topics = intel.get("best_topics", [])
        available = intel.get("available_topics", list(TOPIC_BUCKETS))

        topic = random.choice(best_topics) if best_topics else (random.choice(available) if available else "general")
        maestro_log("lexi", "Post Refine", f"Refining best topic: '{topic}' into carousel post", "🔬", "detail")

        prompt = f"""Create a refined carousel post building on our best-performing topic.

Strategy: REFINE — take our winning topic '{topic}' and create a deeper educational carousel.
Best-performing topic: {topic}

Your task:
1. Go DEEPER into this proven topic than previous content
2. Find a specific sub-angle within {topic} that we haven't fully explored
3. Include a REAL DOI from a verifiable study
4. Create 3-4 educational slides with actionable science
5. Title should be a clear statement, not a list

REMEMBER: Do NOT mention age, gender, or demographics.

{self._post_output_format(brand=brand)}"""

        return self._call_ai_and_save(
            prompt, strategy="refine", topic=topic, content_type="post", brand=brand,
            source_type="own_content",
            source_title=f"Topic leader: {topic}",
        )

    # ──────────────────────────────────────────────────────────
    # AI CALL & DB SAVE
    # ──────────────────────────────────────────────────────────

    def _call_ai_and_save(
        self,
        prompt: str,
        strategy: str,
        topic: str = None,
        content_type: str = "reel",
        brand: str = None,
        source_type: str = None,
        source_ig_media_id: str = None,
        source_title: str = None,
        source_performance_score: float = None,
        source_account: str = None,
    ) -> Optional[TobyProposal]:
        """Call DeepSeek and save proposal to DB with agent_name='lexi'."""
        from app.services.maestro import maestro_log

        is_post = content_type == "post"
        type_label = "📄 Post" if is_post else "🎬 Reel"
        system_prompt = LEXI_POST_SYSTEM_PROMPT if is_post else LEXI_SYSTEM_PROMPT
        max_tokens = 2500 if is_post else 1500

        try:
            prompt_preview = prompt[:120].replace("\n", " ")
            maestro_log("lexi", "API: DeepSeek", f"POST /v1/chat/completions — type={type_label}, strategy={strategy}", "🌐", "api")

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
                    "temperature": 0.75,  # Lexi is more precise than Toby (0.9)
                    "max_tokens": max_tokens,
                },
                timeout=60,
            )

            if response.status_code != 200:
                maestro_log("lexi", "API Error: DeepSeek", f"HTTP {response.status_code} — {response.text[:200]}", "❌", "api")
                return None

            content_text = response.json()["choices"][0]["message"]["content"].strip()
            tokens_used = response.json().get("usage", {})
            maestro_log("lexi", "API Response: DeepSeek",
                        f"HTTP 200 — {tokens_used.get('prompt_tokens', '?')} prompt, {tokens_used.get('completion_tokens', '?')} completion",
                        "✅", "api")

            parsed = self._parse_json(content_text)
            if not parsed:
                maestro_log("lexi", "Parse Error", f"Failed to parse JSON ({len(content_text)} chars)", "❌", "detail")
                return None

            title = parsed.get("title", "")
            image_prompt = parsed.get("image_prompt", "")
            caption = parsed.get("caption", "")
            reasoning = parsed.get("reasoning", "No reasoning provided")

            if is_post:
                slide_texts = parsed.get("slide_texts", [])
                content_lines = []
                if not title or not slide_texts:
                    maestro_log("lexi", "Validation Error", "Missing title or slide_texts", "❌", "detail")
                    return None
                maestro_log("lexi", "Parsed post", f"'{title[:60]}' | {len(slide_texts)} slides", "📋", "detail")
            else:
                content_lines = parsed.get("content_lines", [])
                slide_texts = None
                if not title or not content_lines:
                    maestro_log("lexi", "Validation Error", "Missing title or content_lines", "❌", "detail")
                    return None
                maestro_log("lexi", "Parsed reel", f"'{title[:60]}' | {len(content_lines)} lines", "📋", "detail")

            topic_bucket = topic or ContentHistory.classify_topic_bucket(title)

            # ── Duplicate check (brand-aware, 60-day window) ──
            if brand:
                is_dup = self.tracker.is_duplicate_for_brand(title, brand, content_type, days=60)
                if is_dup:
                    if self.tracker.is_high_performer(title, content_type):
                        maestro_log("lexi", "Duplicate (allowed)", f"'{title[:50]}' high performer — allowing repeat", "🔄", "detail")
                    else:
                        maestro_log("lexi", "Duplicate BLOCKED", f"'{title[:50]}' already used for {brand} in last 60 days — skipping", "🚫", "detail")
                        return None

            from app.services.content_tracker import check_post_quality
            quality = check_post_quality(title)

            proposal_id = self._generate_proposal_id()

            from app.db_connection import SessionLocal
            db = SessionLocal()
            try:
                proposal = TobyProposal(
                    proposal_id=proposal_id,
                    status="pending",
                    agent_name="lexi",  # KEY: identifies this as Lexi's proposal
                    content_type=content_type,
                    brand=brand,
                    variant="light",  # Lexi = light mode
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
                )
                db.add(proposal)
                db.commit()
                db.refresh(proposal)

                maestro_log("lexi", "Saved to DB",
                            f"{type_label} proposal {proposal_id} — brand={brand or 'unassigned'}, strategy={strategy}, topic={topic_bucket}, quality={quality.score}",
                            "💾", "detail")
                print(f"📊 Lexi proposed [{strategy}/{content_type}] → '{title[:60]}...' ({proposal_id}) brand={brand or 'unassigned'}", flush=True)

                # Record in content history for future anti-repetition
                try:
                    self.tracker.record_proposal(
                        title=title, content_type=content_type, brand=brand,
                        caption=caption, content_lines=content_lines,
                        image_prompt=image_prompt, quality_score=quality.score,
                    )
                except Exception:
                    pass  # Non-critical

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
            maestro_log("lexi", "Error: AI call", f"_call_ai_and_save failed: {str(e)[:200]}", "❌", "api")
            return None

    # ──────────────────────────────────────────────────────────
    # UTILITY METHODS
    # ──────────────────────────────────────────────────────────

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

        print(f"⚠️ Lexi: could not parse JSON response", flush=True)
        return None

    def _generate_proposal_id(self) -> str:
        """Generate a unique proposal ID like LEXI-001."""
        from app.db_connection import SessionLocal
        from sqlalchemy import func

        db = SessionLocal()
        try:
            max_id = db.query(func.max(TobyProposal.id)).scalar()
            num = (max_id or 0) + 1
            return f"LEXI-{num:03d}"
        finally:
            db.close()

    def _count_proposals_today(self) -> int:
        """Count Lexi proposals created today."""
        from app.db_connection import SessionLocal

        db = SessionLocal()
        try:
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            count = (
                db.query(TobyProposal)
                .filter(TobyProposal.agent_name == "lexi")
                .filter(TobyProposal.created_at >= today_start)
                .count()
            )
            return count
        except Exception:
            return 0
        finally:
            db.close()


# ── Singleton ──

_lexi_agent: Optional[LexiAgent] = None


def get_lexi_agent() -> LexiAgent:
    global _lexi_agent
    if _lexi_agent is None:
        _lexi_agent = LexiAgent()
    return _lexi_agent
