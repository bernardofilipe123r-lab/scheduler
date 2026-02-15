"""
AgentLearningEngine - Consolidates knowledge acquisition from multiple sources.

Extracts patterns from:
1. Own brand performance data (PostPerformance table)
2. Competitor content (via TrendScout)
3. Trending content analysis

Writes to:
- learned_patterns: Global pattern knowledge base
- brand_performance_memory: Per-brand aggregated insights
- agent_learning_cycles: Audit trail
"""

import math
import logging
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func

from app.models import (
    AIAgent, Brand, PostPerformance, ContentHistory,
    TrendingContent, LearnedPattern, BrandPerformanceMemory,
    CompetitorAccount, AgentLearningCycle
)
from app.db_connection import get_db

logger = logging.getLogger(__name__)

# Pattern decay: weight = e^(-days / DECAY_HALF_LIFE)
PATTERN_DECAY_DAYS = 30


class AgentLearningEngine:
    """Consolidated learning engine for all agent knowledge acquisition."""

    def __init__(self, db: Session):
        self.db = db

    # ═══════════════════════════════════════════════════════════
    # PUBLIC METHODS (called by scheduler)
    # ═══════════════════════════════════════════════════════════

    def run_own_brand_analysis(self, agent_id: str, user_id: str = None):
        """
        Analyze all brands' past performance (database only, no API calls).

        Extracts successful patterns from PostPerformance data and writes
        to learned_patterns and brand_performance_memory tables.
        """
        cycle = self._start_cycle(agent_id, 'own_brand_analysis')

        try:
            brands = self.db.query(Brand).filter(Brand.active == True).all()
            total_patterns = 0
            total_updated = 0
            total_reels = 0

            for brand in brands:
                reels = self.db.query(PostPerformance).filter(
                    PostPerformance.brand == brand.id,
                    PostPerformance.views.isnot(None),
                    PostPerformance.views > 0
                ).order_by(PostPerformance.created_at.desc()).limit(100).all()

                if len(reels) < 5:
                    continue

                total_reels += len(reels)

                # Extract patterns from performance data
                new_count, updated_count = self._extract_patterns_from_reels(
                    reels, brand.id, agent_id
                )
                total_patterns += new_count
                total_updated += updated_count

                # Update brand memory
                self._update_brand_memory(brand.id, reels, user_id)

            self._complete_cycle(
                cycle,
                items_processed=total_reels,
                patterns_discovered=total_patterns,
                patterns_updated=total_updated
            )

            logger.info(
                f"[LEARN] Agent {agent_id}: Analyzed {total_reels} reels across "
                f"{len(brands)} brands, {total_patterns} new patterns, "
                f"{total_updated} updated"
            )

        except Exception as e:
            self._fail_cycle(cycle, str(e))
            logger.error(f"[LEARN] Agent {agent_id} brand analysis failed: {e}")
            raise

    def run_competitor_scrape(self, agent_id: str, user_id: str = None):
        """
        Scrape competitor accounts via Meta API.

        Reads from competitor_accounts table (user-configured),
        uses existing TrendScout for actual API calls.
        """
        cycle = self._start_cycle(agent_id, 'competitor_scrape')

        try:
            from app.services.api_quota_manager import get_quota_manager
            quota = get_quota_manager(self.db)

            # Check quota before starting
            if not quota.should_allow('meta', 'competitor_scrape', calls_needed=5):
                self._complete_cycle(cycle, items_processed=0, api_calls_used=0)
                logger.info(f"[LEARN] Agent {agent_id}: Skipping competitor scrape — quota reserved")
                return

            # Get user-configured competitor accounts
            query = self.db.query(CompetitorAccount).filter(
                CompetitorAccount.active == True
            ).order_by(CompetitorAccount.priority)

            if user_id:
                query = query.filter(CompetitorAccount.user_id == user_id)

            competitors = query.limit(20).all()

            if not competitors:
                self._complete_cycle(cycle, items_processed=0, api_calls_used=0)
                logger.info(f"[LEARN] Agent {agent_id}: No competitor accounts configured")
                return

            total_scraped = 0
            api_calls = 0
            max_calls = min(60, quota.remaining('meta'))

            for comp in competitors:
                if api_calls >= max_calls:
                    break

                try:
                    # Use existing TrendScout for actual scraping
                    # discover_competitor returns List[Dict] with keys:
                    # ig_media_id, source_account, caption, like_count, comments_count, media_type, timestamp
                    posts = self._scrape_competitor(comp)
                    api_calls += 1  # At least 1 API call per competitor

                    for post in posts:
                        pattern = self._extract_pattern_from_competitor_post(post)
                        if pattern:
                            self._upsert_learned_pattern(pattern)
                            total_scraped += 1

                    # Update competitor metadata
                    comp.last_scraped_at = datetime.utcnow()
                    comp.posts_scraped_count = (comp.posts_scraped_count or 0) + len(posts)

                except Exception as e:
                    logger.warning(f"[LEARN] Failed to scrape @{comp.instagram_handle}: {e}")
                    continue

            self.db.commit()

            # Record API usage
            quota.record_usage('meta', api_calls, agent_id=agent_id, operation='competitor_scrape')

            self._complete_cycle(
                cycle,
                items_processed=total_scraped,
                patterns_discovered=total_scraped,
                api_calls_used=api_calls
            )

            logger.info(
                f"[LEARN] Agent {agent_id}: Scraped {total_scraped} posts from "
                f"{len(competitors)} competitors ({api_calls} API calls)"
            )

        except Exception as e:
            self._fail_cycle(cycle, str(e))
            logger.error(f"[LEARN] Agent {agent_id} competitor scrape failed: {e}")
            raise

    def consolidate_patterns(self):
        """
        Apply pattern decay and prune stale low-confidence patterns.
        Runs twice daily (6 AM, 6 PM).
        """
        patterns = self.db.query(LearnedPattern).all()
        now = datetime.utcnow()
        pruned = 0
        updated = 0

        for pattern in patterns:
            days_old = (now - pattern.last_validated_at).total_seconds() / 86400

            # Exponential decay
            new_weight = math.exp(-days_old / PATTERN_DECAY_DAYS)
            pattern.decay_weight = round(new_weight, 4)
            updated += 1

            # Prune if confidence too low AND stale
            if pattern.confidence_score < 0.2 and days_old > 60:
                self.db.delete(pattern)
                pruned += 1

        self.db.commit()
        logger.info(f"[CONSOLIDATE] Updated {updated} patterns, pruned {pruned} stale entries")

    def get_active_patterns(self, pattern_type: str = None, min_confidence: float = 0.3, limit: int = 50) -> List[LearnedPattern]:
        """Get high-confidence patterns for content generation."""
        query = self.db.query(LearnedPattern).filter(
            LearnedPattern.confidence_score >= min_confidence,
            LearnedPattern.decay_weight > 0.1
        )

        if pattern_type:
            query = query.filter(LearnedPattern.pattern_type == pattern_type)

        return query.order_by(
            (LearnedPattern.confidence_score * LearnedPattern.decay_weight).desc()
        ).limit(limit).all()

    # ═══════════════════════════════════════════════════════════
    # PATTERN EXTRACTION
    # ═══════════════════════════════════════════════════════════

    def _extract_patterns_from_reels(self, reels: List[PostPerformance], brand_id: str, agent_id: str) -> tuple:
        """Extract successful patterns from reel performance data. Returns (new_count, updated_count)."""
        new_count = 0
        updated_count = 0

        # Sort by views to find top performers
        sorted_reels = sorted(reels, key=lambda r: r.views or 0, reverse=True)
        top_reels = sorted_reels[:20]  # Top 20% of reels
        avg_views = sum(r.views or 0 for r in reels) // max(len(reels), 1)

        # === Pattern Type 1: Title Structures ===
        title_structures = {}
        for reel in top_reels:
            title = reel.title or ''
            if len(title) < 10:
                continue

            structure = self._extract_title_structure(title.upper())
            if not structure:
                continue

            if structure not in title_structures:
                title_structures[structure] = {'views': [], 'titles': []}
            title_structures[structure]['views'].append(reel.views or 0)
            title_structures[structure]['titles'].append(title)

        for structure, data in title_structures.items():
            if len(data['views']) >= 2:
                is_new = self._upsert_learned_pattern({
                    'type': 'title_structure',
                    'data': {
                        'structure': structure,
                        'example_titles': data['titles'][:3]
                    },
                    'views_avg': sum(data['views']) // len(data['views']),
                    'sample_size': len(data['views']),
                    'brand': brand_id,
                    'agent': agent_id
                })
                if is_new:
                    new_count += 1
                else:
                    updated_count += 1

        # === Pattern Type 2: Posting Time ===
        hour_views = {}
        for reel in reels:
            posted_at = reel.published_at or reel.created_at
            if posted_at and reel.views:
                hour = posted_at.hour
                if hour not in hour_views:
                    hour_views[hour] = []
                hour_views[hour].append(reel.views)

        # Find hours that consistently outperform average
        for hour, views in hour_views.items():
            if len(views) >= 3:
                hour_avg = sum(views) // len(views)
                if hour_avg > avg_views * 1.2:  # 20% above average
                    is_new = self._upsert_learned_pattern({
                        'type': 'posting_time',
                        'data': {'hour_utc': hour, 'performance_lift': round(hour_avg / max(avg_views, 1), 2)},
                        'views_avg': hour_avg,
                        'sample_size': len(views),
                        'brand': brand_id,
                        'agent': agent_id
                    })
                    if is_new:
                        new_count += 1
                    else:
                        updated_count += 1

        # === Pattern Type 3: Keyword Combos ===
        keyword_views = {}
        for reel in top_reels:
            title = reel.title or ''
            keywords = self._extract_keywords(title)
            for kw in keywords:
                if kw not in keyword_views:
                    keyword_views[kw] = []
                keyword_views[kw].append(reel.views or 0)

        for keyword, views in keyword_views.items():
            if len(views) >= 3:
                kw_avg = sum(views) // len(views)
                if kw_avg > avg_views:
                    is_new = self._upsert_learned_pattern({
                        'type': 'keyword_combo',
                        'data': {'keyword': keyword},
                        'views_avg': kw_avg,
                        'sample_size': len(views),
                        'brand': brand_id,
                        'agent': agent_id
                    })
                    if is_new:
                        new_count += 1
                    else:
                        updated_count += 1

        self.db.commit()
        return new_count, updated_count

    def _extract_title_structure(self, title: str) -> Optional[str]:
        """Extract reusable structure from title."""
        patterns = [
            (r'\d+\s+SIGNS?\s+(YOUR|YOU)', 'N_SIGNS'),
            (r'\d+\s+WAYS?\s+TO', 'N_WAYS_TO'),
            (r'\d+\s+THINGS?\s+', 'N_THINGS'),
            (r'^WHY\s+', 'WHY_VERB'),
            (r'^IF\s+YOU', 'IF_YOU_ACTION'),
            (r'^YOUR\s+\w+\s+IS', 'YOUR_X_IS'),
            (r'^STOP\s+', 'STOP_DOING'),
            (r'^DON\'?T\s+', 'DONT_DO'),
            (r'^HOW\s+TO\s+', 'HOW_TO'),
            (r'YOU\s+NEED\s+TO', 'YOU_NEED_TO'),
            (r'NOBODY\s+TELLS?\s+YOU', 'NOBODY_TELLS'),
            (r'WHAT\s+HAPPENS?\s+', 'WHAT_HAPPENS'),
        ]

        for pattern, label in patterns:
            if re.search(pattern, title):
                return label

        return None

    def _extract_keywords(self, title: str) -> List[str]:
        """Extract meaningful keywords from title."""
        stop_words = {
            'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
            'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
            'would', 'could', 'should', 'may', 'might', 'must', 'shall',
            'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in',
            'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about',
            'into', 'through', 'during', 'before', 'after', 'above',
            'below', 'between', 'out', 'off', 'over', 'under', 'again',
            'further', 'then', 'once', 'and', 'but', 'or', 'nor', 'not',
            'so', 'yet', 'both', 'each', 'few', 'more', 'most', 'other',
            'some', 'such', 'no', 'only', 'own', 'same', 'than', 'too',
            'very', 'just', 'because', 'as', 'until', 'while', 'this',
            'that', 'these', 'those', 'it', 'its', 'you', 'your', 'we',
            'our', 'they', 'their', 'what', 'which', 'who', 'when',
            'where', 'why', 'how', 'all', 'any', 'if', 'my', 'his', 'her'
        }

        words = re.findall(r'[a-zA-Z]{3,}', title.lower())
        return [w for w in words if w not in stop_words]

    def _extract_pattern_from_competitor_post(self, post: Dict) -> Optional[Dict]:
        """Extract pattern from a competitor post dict (returned by TrendScout.discover_competitor)."""
        caption = post.get('caption', '') or ''
        if len(caption) < 10:
            return None

        structure = self._extract_title_structure(caption.upper())
        if not structure:
            return None

        return {
            'type': 'title_structure',
            'data': {
                'structure': structure,
                'source': 'competitor',
                'example_titles': [caption[:100]]
            },
            'views_avg': post.get('like_count', 0) or 0,
            'sample_size': 1,
            'brand': 'competitor',
            'agent': 'scout'
        }

    def _upsert_learned_pattern(self, pattern: Dict) -> bool:
        """Insert or update pattern. Returns True if new, False if updated."""
        existing = None

        # Match by structure key
        if 'structure' in pattern.get('data', {}):
            existing = self.db.query(LearnedPattern).filter(
                LearnedPattern.pattern_type == pattern['type'],
                LearnedPattern.pattern_data['structure'].astext == pattern['data']['structure']
            ).first()

        # Fallback: check by keyword
        if not existing and pattern['type'] == 'keyword_combo':
            existing = self.db.query(LearnedPattern).filter(
                LearnedPattern.pattern_type == 'keyword_combo',
                LearnedPattern.pattern_data['keyword'].astext == pattern['data'].get('keyword', '__none__')
            ).first()

        # Fallback: check by hour
        if not existing and pattern['type'] == 'posting_time':
            existing = self.db.query(LearnedPattern).filter(
                LearnedPattern.pattern_type == 'posting_time',
                LearnedPattern.pattern_data['hour_utc'].astext == str(pattern['data'].get('hour_utc', -1))
            ).first()

        if existing:
            # Update confidence and reset decay
            existing.confidence_score = min(1.0, existing.confidence_score + 0.05)
            existing.last_validated_at = datetime.utcnow()
            existing.decay_weight = 1.0
            existing.validation_count = (existing.validation_count or 0) + 1
            existing.sample_size = (existing.sample_size or 0) + pattern.get('sample_size', 1)
            existing.views_avg = (existing.views_avg + pattern['views_avg']) // 2  # Moving average

            # Add brand/agent if not already tracked
            brands = existing.learned_from_brands or []
            if pattern['brand'] not in brands:
                brands.append(pattern['brand'])
                existing.learned_from_brands = brands

            agents = existing.learned_from_agents or []
            if pattern['agent'] not in agents:
                agents.append(pattern['agent'])
                existing.learned_from_agents = agents

            return False  # Updated
        else:
            new_pattern = LearnedPattern(
                pattern_type=pattern['type'],
                pattern_data=pattern['data'],
                confidence_score=0.5,
                views_avg=pattern['views_avg'],
                engagement_rate_avg=0.0,
                sample_size=pattern['sample_size'],
                learned_from_brands=[pattern['brand']],
                learned_from_agents=[pattern['agent']],
                first_seen_at=datetime.utcnow(),
                last_validated_at=datetime.utcnow(),
                validation_count=1,
                decay_weight=1.0
            )
            self.db.add(new_pattern)
            return True  # New

    # ═══════════════════════════════════════════════════════════
    # BRAND MEMORY
    # ═══════════════════════════════════════════════════════════

    def _update_brand_memory(self, brand_id: str, reels: List[PostPerformance], user_id: str = None):
        """Update per-brand aggregated insights."""
        memory = self.db.query(BrandPerformanceMemory).filter_by(brand_id=brand_id).first()

        if not memory:
            resolved_user_id = user_id
            if not resolved_user_id:
                brand = self.db.query(Brand).filter_by(id=brand_id).first()
                resolved_user_id = getattr(brand, 'user_id', 'system') if brand else 'system'

            memory = BrandPerformanceMemory(
                brand_id=brand_id,
                user_id=resolved_user_id or 'system'
            )
            self.db.add(memory)

        # Aggregate views
        views = [r.views for r in reels if r.views]
        if views:
            memory.avg_views = sum(views) // len(views)

        # Aggregate engagement
        eng_rates = [r.engagement_rate for r in reels if r.engagement_rate is not None]
        if eng_rates:
            memory.avg_engagement_rate = round(sum(eng_rates) / len(eng_rates), 4)

        # Top keywords from titles
        all_keywords = []
        for reel in reels:
            title = reel.title or ''
            all_keywords.extend(self._extract_keywords(title))

        keyword_views = {}
        for reel in reels:
            title = reel.title or ''
            for kw in self._extract_keywords(title):
                if kw not in keyword_views:
                    keyword_views[kw] = []
                keyword_views[kw].append(reel.views or 0)

        top_kw = sorted(
            [(kw, sum(v) // len(v), len(v)) for kw, v in keyword_views.items() if len(v) >= 2],
            key=lambda x: x[1],
            reverse=True
        )[:10]
        memory.top_keywords = [{'keyword': kw, 'avg_views': avg, 'count': cnt} for kw, avg, cnt in top_kw]

        # Best posting hours
        hour_views = {}
        for reel in reels:
            posted_at = reel.published_at or reel.created_at
            if posted_at and reel.views:
                h = posted_at.hour
                if h not in hour_views:
                    hour_views[h] = []
                hour_views[h].append(reel.views)

        best_hours = sorted(
            [(h, sum(v) // len(v)) for h, v in hour_views.items() if len(v) >= 2],
            key=lambda x: x[1],
            reverse=True
        )[:5]
        memory.best_posting_hours = [h for h, _ in best_hours]

        memory.total_reels_analyzed = len(reels)
        memory.last_analysis_at = datetime.utcnow()
        memory.analysis_version = (memory.analysis_version or 0) + 1

        self.db.commit()

    # ═══════════════════════════════════════════════════════════
    # COMPETITOR SCRAPING (delegates to TrendScout)
    # ═══════════════════════════════════════════════════════════

    def _scrape_competitor(self, competitor: CompetitorAccount) -> List[Dict]:
        """Scrape a competitor account using existing TrendScout."""
        try:
            from app.services.analytics.trend_scout import TrendScout
            scout = TrendScout()

            handle = competitor.instagram_handle.lstrip('@')
            posts = scout.discover_competitor(handle, limit=3)
            return posts if posts else []
        except Exception as e:
            logger.warning(f"[LEARN] TrendScout failed for @{competitor.instagram_handle}: {e}")
            return []

    # ═══════════════════════════════════════════════════════════
    # CYCLE AUDIT TRAIL
    # ═══════════════════════════════════════════════════════════

    def _start_cycle(self, agent_id: str, cycle_type: str) -> AgentLearningCycle:
        """Log cycle start."""
        cycle = AgentLearningCycle(
            agent_id=agent_id,
            cycle_type=cycle_type,
            status='running',
            started_at=datetime.utcnow()
        )
        self.db.add(cycle)
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
        return cycle

    def _complete_cycle(self, cycle: AgentLearningCycle, items_processed: int = 0,
                       patterns_discovered: int = 0, patterns_updated: int = 0,
                       api_calls_used: int = 0):
        """Log cycle completion."""
        cycle.status = 'completed'
        cycle.completed_at = datetime.utcnow()
        cycle.duration_seconds = int((cycle.completed_at - cycle.started_at).total_seconds())
        cycle.items_processed = items_processed
        cycle.patterns_discovered = patterns_discovered
        cycle.patterns_updated = patterns_updated
        cycle.api_calls_used = api_calls_used
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()

    def _fail_cycle(self, cycle: AgentLearningCycle, error: str):
        """Log cycle failure."""
        cycle.status = 'failed'
        cycle.completed_at = datetime.utcnow()
        cycle.duration_seconds = int((cycle.completed_at - cycle.started_at).total_seconds())
        cycle.error_message = error[:500]  # Truncate long errors
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
