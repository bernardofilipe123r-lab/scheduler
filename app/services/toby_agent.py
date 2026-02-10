"""
Toby Agent — Phase 3: Autonomous AI Content Strategist.

Toby analyses our IG performance data, external trends, and content
gaps in the health/wellness niche to propose reels (and later posts).

Four strategies:
    1. EXPLORE    — try new topics/angles within the niche
    2. ITERATE    — tweak an underperformer with better hooks/angles
    3. DOUBLE_DOWN — create a variation of our own winning content
    4. TRENDING   — adapt external viral content to our brand template

Guardrails (never overridden):
    - Health/wellness niche only
    - Avatar: women 45+, US/Canada/UK
    - Educational, science-backed tone
    - No medical claims, always include disclaimer

Toby proposes up to MAX_PROPOSALS_PER_DAY (10) reels per day.
Each proposal includes a reasoning explanation of WHY Toby chose it.
User reviews on the Toby page and accepts or rejects.
Accept triggers God Automation to create versions for all brands.
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
MAX_PROPOSALS_PER_DAY = 10
STRATEGY_WEIGHTS = {
    "explore": 0.30,       # 30% — always trying new things
    "iterate": 0.20,       # 20% — fix underperformers
    "double_down": 0.30,   # 30% — capitalise on winners
    "trending": 0.20,      # 20% — adapt external viral content
}

# Avatar and niche guardrails — injected into EVERY Toby prompt
TOBY_SYSTEM_PROMPT = """You are Toby, an expert AI content strategist for health & wellness Instagram accounts.

AUDIENCE AVATAR:
- Women aged 45+
- Located in the United States, Canada, and United Kingdom
- Health-conscious, interested in natural remedies, supplements, anti-aging, longevity
- Engaged on Instagram, prefers short-form educational video content (Reels)
- Values science-backed information presented accessibly

CONTENT GUIDELINES:
- Health & wellness niche ONLY
- Educational and informational tone
- Science-backed claims with real research references
- No medical advice or cure claims
- Visually calming, minimal, lifestyle aesthetic
- Each reel: 5-7 punchy text slides + a health-focused title

FORMATTING RULES:
- Title: Sentence case, no period at end, no ALL CAPS, no numbered lists, no em-dashes
- Content lines: Short, punchy, 1-2 sentences each (5-7 lines)
- Image prompt: Soft, minimal, calming wellness aesthetic

You think like a human content creator but with data-driven decisions.
You explain your reasoning clearly so the human reviewer understands your strategy."""


class TobyAgent:
    """
    Toby's brain — generates content proposals based on data analysis.
    """

    def __init__(self):
        self.api_key = os.getenv("DEEPSEEK_API_KEY")
        self.base_url = "https://api.deepseek.com/v1"
        self.tracker = get_content_tracker()
        print("✅ TobyAgent initialized (Phase 3: Autonomous AI Content Strategist)", flush=True)

    # ──────────────────────────────────────────────────────────
    # MAIN: RUN TOBY
    # ──────────────────────────────────────────────────────────

    def run(self, max_proposals: int = None) -> Dict:
        """
        Main entry point: Toby analyses data and generates proposals.

        Returns summary of what Toby did.
        """
        if not self.api_key:
            return {"error": "No DEEPSEEK_API_KEY configured", "proposals": []}

        if max_proposals is None:
            max_proposals = MAX_PROPOSALS_PER_DAY

        # Check how many proposals Toby already made today
        today_count = self._count_proposals_today()
        remaining = max(0, max_proposals - today_count)
        if remaining == 0:
            return {
                "message": f"Toby already made {today_count} proposals today (max {max_proposals})",
                "proposals": [],
            }

        # Gather intelligence
        intel = self._gather_intelligence()

        # Decide strategy mix for this run
        strategy_plan = self._plan_strategies(remaining, intel)

        # Generate proposals for each strategy
        proposals = []
        for strategy, count in strategy_plan.items():
            for _ in range(count):
                try:
                    proposal = self._generate_proposal(strategy, intel)
                    if proposal:
                        proposals.append(proposal)
                except Exception as e:
                    print(f"⚠️ Toby proposal generation error ({strategy}): {e}", flush=True)

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

    def _gather_intelligence(self) -> Dict:
        """Gather all data Toby needs to make decisions."""
        intel: Dict[str, Any] = {}

        # 1. Our performance data
        try:
            from app.services.metrics_collector import get_metrics_collector
            collector = get_metrics_collector()
            intel["top_performers"] = collector.get_top_performers("reel", limit=10)
            intel["underperformers"] = collector.get_underperformers("reel", limit=10)
            intel["performance_summary"] = collector.get_performance_summary()
        except Exception as e:
            print(f"⚠️ Toby intel — metrics error: {e}", flush=True)
            intel["top_performers"] = []
            intel["underperformers"] = []
            intel["performance_summary"] = {}

        # 2. External trending content
        try:
            from app.services.trend_scout import get_trend_scout
            scout = get_trend_scout()
            intel["trending"] = scout.get_trending_for_toby(min_likes=200, limit=15)
        except Exception as e:
            print(f"⚠️ Toby intel — trends error: {e}", flush=True)
            intel["trending"] = []

        # 3. Content history & topic gaps
        try:
            intel["recent_titles"] = self.tracker.get_recent_titles("reel", limit=30)
            intel["topics_on_cooldown"] = [
                t for t in TOPIC_BUCKETS
                if t not in self.tracker.get_available_topics("reel")
            ]
            intel["available_topics"] = self.tracker.get_available_topics("reel")
            intel["content_stats"] = self.tracker.get_stats("reel")
        except Exception as e:
            print(f"⚠️ Toby intel — tracker error: {e}", flush=True)
            intel["recent_titles"] = []
            intel["topics_on_cooldown"] = []
            intel["available_topics"] = list(TOPIC_BUCKETS)
            intel["content_stats"] = {}

        # 4. Best-performing topic buckets
        perf_summary = intel.get("performance_summary", {})
        topic_rankings = perf_summary.get("topic_rankings", [])
        intel["best_topics"] = [t["topic"] for t in topic_rankings[:3]] if topic_rankings else []
        intel["worst_topics"] = [t["topic"] for t in topic_rankings[-3:]] if len(topic_rankings) >= 3 else []

        return intel

    # ──────────────────────────────────────────────────────────
    # STRATEGY PLANNING
    # ──────────────────────────────────────────────────────────

    def _plan_strategies(self, count: int, intel: Dict) -> Dict[str, int]:
        """
        Decide how many proposals per strategy.

        Adapts weights based on available data.
        """
        weights = dict(STRATEGY_WEIGHTS)

        # If no performance data yet, shift to explore + trending
        if not intel.get("top_performers"):
            weights["double_down"] = 0.0
            weights["explore"] += 0.15
            weights["trending"] += 0.15

        if not intel.get("underperformers"):
            weights["iterate"] = 0.0
            weights["explore"] += 0.10
            weights["trending"] += 0.10

        if not intel.get("trending"):
            weights["trending"] = 0.0
            weights["explore"] += 0.20

        # Normalise
        total = sum(weights.values())
        if total == 0:
            weights = {"explore": 1.0, "iterate": 0, "double_down": 0, "trending": 0}
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
            plan["explore"] = plan.get("explore", 0) + diff
        elif diff < 0:
            for s in ["iterate", "trending", "double_down", "explore"]:
                if plan.get(s, 0) > 0 and diff < 0:
                    plan[s] -= 1
                    diff += 1
                    if diff == 0:
                        break

        return plan

    # ──────────────────────────────────────────────────────────
    # PROPOSAL GENERATION
    # ──────────────────────────────────────────────────────────

    def _generate_proposal(self, strategy: str, intel: Dict) -> Optional[TobyProposal]:
        """Generate a single proposal using the given strategy."""

        if strategy == "explore":
            return self._strategy_explore(intel)
        elif strategy == "iterate":
            return self._strategy_iterate(intel)
        elif strategy == "double_down":
            return self._strategy_double_down(intel)
        elif strategy == "trending":
            return self._strategy_trending(intel)
        else:
            return self._strategy_explore(intel)

    # ── EXPLORE ──────────────────────────────────────────────

    def _strategy_explore(self, intel: Dict) -> Optional[TobyProposal]:
        """
        EXPLORE strategy: try a new topic/angle.

        Pick a topic that hasn't been covered recently and generate
        fresh content within the health/wellness niche.
        """
        available = intel.get("available_topics", list(TOPIC_BUCKETS))
        recent_titles = intel.get("recent_titles", [])

        topic = random.choice(available) if available else "general"

        topic_descriptions = {
            "superfoods": "superfoods and nutrient-dense foods",
            "teas_drinks": "healthy teas, herbal drinks, and beverages",
            "supplements": "vitamins, minerals, and natural supplements",
            "sleep": "sleep quality, rest, and circadian health",
            "morning_routines": "morning routines and daily habits",
            "skin_antiaging": "skin care, anti-aging, and natural beauty",
            "gut_health": "gut health, digestion, and microbiome",
            "hormones": "hormonal balance and endocrine health",
            "stress_mood": "stress management, mood, and mental wellness",
            "hydration_detox": "hydration, detox, and cleansing",
            "brain_memory": "brain health, memory, and cognitive function",
            "heart_health": "heart health, cardiovascular wellness",
            "general": "general health and wellness",
        }

        topic_desc = topic_descriptions.get(topic, topic)

        avoidance = ""
        if recent_titles:
            avoidance = "\n\nAVOID these recently used titles:\n" + "\n".join(f"- {t}" for t in recent_titles[:15])

        prompt = f"""Generate a new viral Instagram Reel concept about {topic_desc}.

Strategy: EXPLORE — trying a fresh topic/angle that we haven't covered recently.
Topic bucket: {topic}

{avoidance}

Your task:
1. Come up with a compelling, science-backed health claim or insight
2. Create 5-7 punchy text slides for the reel
3. Write a cinematic image prompt for the background
4. Explain WHY you chose this specific topic and angle

OUTPUT FORMAT (JSON only):
{{
    "title": "Health statement title (sentence case, no period, no em-dashes)",
    "content_lines": ["Slide 1 text", "Slide 2 text", "Slide 3 text", "Slide 4 text", "Slide 5 text"],
    "image_prompt": "Soft, minimal wellness aesthetic description. No text, no letters, no numbers, no symbols, no logos.",
    "reasoning": "2-3 sentences explaining why you chose this topic and angle, and why you think it will perform well with women 45+ interested in health."
}}"""

        return self._call_ai_and_save(prompt, strategy="explore", topic=topic)

    # ── ITERATE ──────────────────────────────────────────────

    def _strategy_iterate(self, intel: Dict) -> Optional[TobyProposal]:
        """
        ITERATE strategy: take an underperformer and improve it.

        Analyse what went wrong, propose a better version.
        """
        underperformers = intel.get("underperformers", [])
        if not underperformers:
            return self._strategy_explore(intel)

        # Pick a random underperformer
        source = random.choice(underperformers)
        source_title = source.get("title", "Unknown")
        source_score = source.get("performance_score", 0)
        source_views = source.get("views", 0)
        source_saves = source.get("saves", 0)

        prompt = f"""This reel underperformed. Analyse why and create a better version.

UNDERPERFORMING REEL:
- Title: "{source_title}"
- Performance score: {source_score}/100
- Views: {source_views}
- Saves: {source_saves}

Strategy: ITERATE — improve an underperformer with a better hook, angle, or structure.

Analyse:
1. What likely went wrong with the original (weak hook? boring topic? too vague?)
2. How can we make this topic more engaging for women 45+?
3. Create a completely reworked version — same general topic, much better execution

OUTPUT FORMAT (JSON only):
{{
    "title": "Improved health statement (sentence case, no period, no em-dashes)",
    "content_lines": ["Slide 1", "Slide 2", "Slide 3", "Slide 4", "Slide 5"],
    "image_prompt": "Soft, minimal wellness aesthetic. No text, no letters, no numbers, no symbols, no logos.",
    "reasoning": "2-3 sentences: what went wrong with the original, what you changed and why, and why the new version should perform better."
}}"""

        return self._call_ai_and_save(
            prompt,
            strategy="iterate",
            topic=source.get("topic_bucket"),
            source_type="own_content",
            source_ig_media_id=source.get("ig_media_id"),
            source_title=source_title,
            source_performance_score=source_score,
        )

    # ── DOUBLE DOWN ──────────────────────────────────────────

    def _strategy_double_down(self, intel: Dict) -> Optional[TobyProposal]:
        """
        DOUBLE_DOWN strategy: create a variation of a winner.

        Take a high-performing reel and create something similar but fresh.
        """
        top = intel.get("top_performers", [])
        if not top:
            return self._strategy_explore(intel)

        source = random.choice(top[:5])  # Pick from top 5
        source_title = source.get("title", "Unknown")
        source_score = source.get("performance_score", 0)
        source_views = source.get("views", 0)
        source_saves = source.get("saves", 0)
        source_topic = source.get("topic_bucket", "general")

        prompt = f"""This reel performed exceptionally well. Create a similar variation.

WINNING REEL:
- Title: "{source_title}"
- Topic: {source_topic}
- Performance score: {source_score}/100
- Views: {source_views}
- Saves: {source_saves}

Strategy: DOUBLE_DOWN — create a fresh variation of this winner.

Rules:
1. Keep the SAME topic and general angle
2. Use a DIFFERENT specific claim or insight (not a copy)
3. Maintain the same emotional tone that made the original successful
4. Make it feel fresh — the audience shouldn't think "I've seen this before"

OUTPUT FORMAT (JSON only):
{{
    "title": "New but similar health statement (sentence case, no period, no em-dashes)",
    "content_lines": ["Slide 1", "Slide 2", "Slide 3", "Slide 4", "Slide 5"],
    "image_prompt": "Soft, minimal wellness aesthetic. No text, no letters, no numbers, no symbols, no logos.",
    "reasoning": "2-3 sentences: what made the original successful, what you kept, what you changed, and why this variation should also perform well."
}}"""

        return self._call_ai_and_save(
            prompt,
            strategy="double_down",
            topic=source_topic,
            source_type="own_content",
            source_ig_media_id=source.get("ig_media_id"),
            source_title=source_title,
            source_performance_score=source_score,
        )

    # ── TRENDING ─────────────────────────────────────────────

    def _strategy_trending(self, intel: Dict) -> Optional[TobyProposal]:
        """
        TRENDING strategy: adapt external viral content.

        Take a trending reel from the niche and create our own version
        adapted to our brand template and avatar.
        """
        trending = intel.get("trending", [])
        if not trending:
            return self._strategy_explore(intel)

        source = random.choice(trending[:10])
        source_caption = source.get("caption", "")[:500]
        source_likes = source.get("like_count", 0)
        source_account = source.get("source_account", "unknown")

        prompt = f"""This reel is currently going viral in the health niche. Adapt it for our brand.

TRENDING REEL (from @{source_account}):
- Caption: "{source_caption}"
- Likes: {source_likes}

Strategy: TRENDING — adapt external viral content to our brand template.

Rules:
1. DO NOT copy the content — create an ORIGINAL version inspired by it
2. Adapt the topic/angle to our avatar (women 45+, US/Canada/UK)
3. Keep whatever made the original viral (hook style, topic angle, emotional trigger)
4. Make it science-backed and educational (our brand positioning)
5. Must be relevant to health, wellness, anti-aging, or natural remedies

OUTPUT FORMAT (JSON only):
{{
    "title": "Our adapted health statement (sentence case, no period, no em-dashes)",
    "content_lines": ["Slide 1", "Slide 2", "Slide 3", "Slide 4", "Slide 5"],
    "image_prompt": "Soft, minimal wellness aesthetic. No text, no letters, no numbers, no symbols, no logos.",
    "reasoning": "2-3 sentences: what makes the trending content viral, how you adapted it for our brand, and why it should resonate with our audience."
}}"""

        return self._call_ai_and_save(
            prompt,
            strategy="trending",
            topic=None,
            source_type="trending_hashtag" if source.get("discovery_method") == "hashtag_search" else "competitor",
            source_ig_media_id=source.get("ig_media_id"),
            source_title=source_caption[:100] if source_caption else None,
            source_account=source_account,
        )

    # ──────────────────────────────────────────────────────────
    # AI CALL & DB SAVE
    # ──────────────────────────────────────────────────────────

    def _call_ai_and_save(
        self,
        prompt: str,
        strategy: str,
        topic: str = None,
        source_type: str = None,
        source_ig_media_id: str = None,
        source_title: str = None,
        source_performance_score: float = None,
        source_account: str = None,
    ) -> Optional[TobyProposal]:
        """Call DeepSeek and save the proposal to DB."""
        try:
            response = requests.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": [
                        {"role": "system", "content": TOBY_SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.9,
                    "max_tokens": 1500,
                },
                timeout=60,
            )

            if response.status_code != 200:
                print(f"⚠️ Toby DeepSeek error: {response.status_code}", flush=True)
                return None

            content_text = response.json()["choices"][0]["message"]["content"].strip()

            # Parse JSON from response
            parsed = self._parse_json(content_text)
            if not parsed:
                return None

            title = parsed.get("title", "")
            content_lines = parsed.get("content_lines", [])
            image_prompt = parsed.get("image_prompt", "")
            reasoning = parsed.get("reasoning", "No reasoning provided")

            if not title or not content_lines:
                print("⚠️ Toby: missing title or content_lines in response", flush=True)
                return None

            # Classify topic
            topic_bucket = topic or ContentHistory.classify_topic_bucket(title)

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
                    content_type="reel",
                    strategy=strategy,
                    reasoning=reasoning,
                    title=title,
                    content_lines=content_lines,
                    image_prompt=image_prompt,
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

                print(f"🤖 Toby proposed [{strategy}] → '{title[:60]}...' ({proposal_id})", flush=True)

                # Mark trending source as used
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
            print(f"⚠️ Toby._call_ai_and_save error: {e}", flush=True)
            return None

    def _parse_json(self, text: str) -> Optional[Dict]:
        """Parse JSON from AI response, handling markdown wrappers."""
        # Strip markdown code blocks
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

        # Try direct parse
        text = text.strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Try extracting JSON object
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass

        print(f"⚠️ Toby: could not parse JSON response", flush=True)
        return None

    def _generate_proposal_id(self) -> str:
        """Generate a unique proposal ID like TOBY-001."""
        from app.db_connection import SessionLocal
        from sqlalchemy import func

        db = SessionLocal()
        try:
            max_id = (
                db.query(func.max(TobyProposal.id))
                .scalar()
            )
            num = (max_id or 0) + 1
            return f"TOBY-{num:03d}"
        finally:
            db.close()

    def _count_proposals_today(self) -> int:
        """Count proposals created today."""
        from app.db_connection import SessionLocal

        db = SessionLocal()
        try:
            today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            count = (
                db.query(TobyProposal)
                .filter(TobyProposal.created_at >= today_start)
                .count()
            )
            return count
        except Exception:
            return 0
        finally:
            db.close()

    # ──────────────────────────────────────────────────────────
    # ACCEPT / REJECT
    # ──────────────────────────────────────────────────────────

    def accept_proposal(self, proposal_id: str) -> Dict:
        """
        Accept a proposal — triggers God Automation to create brand versions.

        Returns the generation result or error.
        """
        from app.db_connection import SessionLocal

        db = SessionLocal()
        try:
            proposal = (
                db.query(TobyProposal)
                .filter(TobyProposal.proposal_id == proposal_id)
                .first()
            )
            if not proposal:
                return {"error": f"Proposal {proposal_id} not found"}

            if proposal.status != "pending":
                return {"error": f"Proposal {proposal_id} is already {proposal.status}"}

            proposal.status = "accepted"
            proposal.reviewed_at = datetime.utcnow()
            db.commit()

            # Record in content tracker
            self.tracker.record(
                title=proposal.title,
                content_type=proposal.content_type,
                quality_score=proposal.quality_score,
            )

            return {
                "status": "accepted",
                "proposal_id": proposal_id,
                "title": proposal.title,
                "content_lines": proposal.content_lines,
                "image_prompt": proposal.image_prompt,
                "content_type": proposal.content_type,
                "strategy": proposal.strategy,
            }
        except Exception as e:
            db.rollback()
            return {"error": str(e)}
        finally:
            db.close()

    def reject_proposal(self, proposal_id: str, notes: str = None) -> Dict:
        """Reject a proposal with optional feedback."""
        from app.db_connection import SessionLocal

        db = SessionLocal()
        try:
            proposal = (
                db.query(TobyProposal)
                .filter(TobyProposal.proposal_id == proposal_id)
                .first()
            )
            if not proposal:
                return {"error": f"Proposal {proposal_id} not found"}

            proposal.status = "rejected"
            proposal.reviewed_at = datetime.utcnow()
            if notes:
                proposal.reviewer_notes = notes
            db.commit()

            return {"status": "rejected", "proposal_id": proposal_id}
        except Exception as e:
            db.rollback()
            return {"error": str(e)}
        finally:
            db.close()

    # ──────────────────────────────────────────────────────────
    # QUERY PROPOSALS
    # ──────────────────────────────────────────────────────────

    def get_proposals(
        self,
        status: str = None,
        limit: int = 50,
    ) -> List[Dict]:
        """Get proposals, optionally filtered by status."""
        from app.db_connection import SessionLocal
        from sqlalchemy import desc

        db = SessionLocal()
        try:
            query = db.query(TobyProposal)
            if status:
                query = query.filter(TobyProposal.status == status)

            proposals = (
                query
                .order_by(desc(TobyProposal.created_at))
                .limit(limit)
                .all()
            )
            return [p.to_dict() for p in proposals]
        finally:
            db.close()

    def get_proposal_stats(self) -> Dict:
        """Get Toby's performance stats."""
        from app.db_connection import SessionLocal
        from sqlalchemy import func

        db = SessionLocal()
        try:
            total = db.query(func.count(TobyProposal.id)).scalar() or 0
            pending = db.query(func.count(TobyProposal.id)).filter(TobyProposal.status == "pending").scalar() or 0
            accepted = db.query(func.count(TobyProposal.id)).filter(TobyProposal.status == "accepted").scalar() or 0
            rejected = db.query(func.count(TobyProposal.id)).filter(TobyProposal.status == "rejected").scalar() or 0

            # Strategy breakdown
            strategy_counts = (
                db.query(TobyProposal.strategy, func.count(TobyProposal.id))
                .group_by(TobyProposal.strategy)
                .all()
            )

            # Acceptance rate per strategy
            strategy_acceptance = {}
            for strategy, count in strategy_counts:
                strat_accepted = (
                    db.query(func.count(TobyProposal.id))
                    .filter(TobyProposal.strategy == strategy, TobyProposal.status == "accepted")
                    .scalar() or 0
                )
                strategy_acceptance[strategy] = {
                    "total": count,
                    "accepted": strat_accepted,
                    "rate": round(strat_accepted / count * 100, 1) if count > 0 else 0,
                }

            today_count = self._count_proposals_today()

            return {
                "total_proposals": total,
                "pending": pending,
                "accepted": accepted,
                "rejected": rejected,
                "acceptance_rate": round(accepted / total * 100, 1) if total > 0 else 0,
                "today_proposals": today_count,
                "max_per_day": MAX_PROPOSALS_PER_DAY,
                "strategy_breakdown": strategy_acceptance,
            }
        except Exception as e:
            return {"error": str(e)}
        finally:
            db.close()


# ── Singleton ──

_agent: Optional[TobyAgent] = None


def get_toby_agent() -> TobyAgent:
    global _agent
    if _agent is None:
        _agent = TobyAgent()
    return _agent
