"""
Unified Content Generator — single entry point for generating content for ANY brand.

DESIGN PRINCIPLES:
  1. Both Toby orchestrator and /creation tab MUST call this module
  2. Toby's learning (Thompson Sampling) drives diversity for ALL callers —
     /creation is NOT random; it asks Toby's brain what works
  3. Per-brand Content DNA: every call resolves the brand's own PromptContext
  4. Extensible: new content types just add a new generate_* function
  5. Callers CAN override any diversity param (topic, hook, etc.) — but the
     default path uses Toby's learning engine to pick the best strategy

WHAT THIS REPLACES:
  - Scattered generation calls in job_processor.py that had no ctx/diversity
  - format_b_routes.py full_auto that passed no diversity params
  - orchestrator.py's inline generation (now delegates here)
"""
import logging
from typing import Dict, List, Optional

from app.core.prompt_context import PromptContext

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════
# STRATEGY RESOLUTION — ask Toby's brain what works
# ═══════════════════════════════════════════════════════════════

def _resolve_strategy(
    user_id: str,
    brand_id: str,
    content_type: str,
    *,
    topic_hint: Optional[str] = None,
    hook_hint: Optional[str] = None,
    personality_prompt: Optional[str] = None,
    story_category: Optional[str] = None,
    db=None,
) -> dict:
    """
    Ask Toby's learning engine for the best strategy for this brand+type.

    Uses Thompson Sampling when enough data exists, otherwise explores.
    Any explicitly-provided hint overrides the learned choice.

    Returns dict with keys: topic_bucket, hook_strategy, personality_prompt,
    story_category, content_dna_id.
    """
    from app.services.content.content_dna_service import get_content_dna_service

    # Resolve Content DNA for this brand
    content_dna_id = None
    try:
        if db:
            content_dna_id = get_content_dna_service().get_dna_id_for_brand(brand_id, db)
        else:
            from app.db_connection import get_db_session
            with get_db_session() as session:
                content_dna_id = get_content_dna_service().get_dna_id_for_brand(brand_id, session)
    except Exception:
        pass

    # Call learning engine (Thompson Sampling / epsilon-greedy)
    strategy = None
    try:
        from app.services.toby.learning_engine import choose_strategy, get_personality_prompt

        def _choose(session):
            return choose_strategy(
                db=session,
                user_id=user_id,
                brand_id=brand_id,
                content_type=content_type,
                content_dna_id=content_dna_id,
            )

        if db:
            strategy = _choose(db)
        else:
            from app.db_connection import get_db_session
            with get_db_session() as session:
                strategy = _choose(session)
    except Exception as e:
        logger.warning("Learning engine unavailable, using fallbacks: %s", e)

    # Build resolved params: explicit override > learned > fallback
    resolved = {
        "content_dna_id": content_dna_id,
    }

    if strategy:
        from app.services.toby.learning_engine import get_personality_prompt as _get_pp
        resolved["topic_bucket"] = topic_hint or strategy.topic_bucket
        resolved["hook_strategy"] = hook_hint or strategy.hook_strategy
        resolved["personality_prompt"] = personality_prompt or _get_pp(content_type, strategy.personality)
        resolved["story_category"] = story_category or strategy.story_category
        resolved["personality_id"] = strategy.personality
        resolved["title_format"] = strategy.title_format
    else:
        # Fallback when learning engine is unavailable
        import random
        from app.services.toby.learning_engine import TITLE_FORMATS
        resolved["topic_bucket"] = topic_hint or "general"
        resolved["hook_strategy"] = hook_hint or "question"
        resolved["personality_prompt"] = personality_prompt or ""
        resolved["story_category"] = story_category
        resolved["personality_id"] = "edu_calm"
        resolved["title_format"] = random.choice(TITLE_FORMATS)

    return resolved


# ═══════════════════════════════════════════════════════════════
# CONTENT GENERATORS — one per content type
# ═══════════════════════════════════════════════════════════════

def generate_reel_content(
    user_id: str,
    brand_id: str,
    *,
    topic_hint: Optional[str] = None,
    hook_hint: Optional[str] = None,
    personality_prompt: Optional[str] = None,
    db=None,
) -> Dict:
    """
    Generate Format A reel content for a single brand.

    Uses Toby's learning engine to select the best topic/hook/personality,
    then generates via ContentGeneratorV2 with brand-specific Content DNA.

    Returns dict with title, content_lines, image_prompt, quality_score, etc.
    Raises ContentGenerationError on failure.
    """
    from app.services.content.generator import ContentGeneratorV2
    from app.services.content.niche_config_service import NicheConfigService

    # 1. Load brand-specific PromptContext
    ctx = NicheConfigService().get_context(user_id=user_id, brand_id=brand_id, db=db)
    if not ctx:
        ctx = PromptContext()

    # 2. Ask Toby's brain for the best strategy
    strategy = _resolve_strategy(
        user_id, brand_id, "reel",
        topic_hint=topic_hint,
        hook_hint=hook_hint,
        personality_prompt=personality_prompt,
        db=db,
    )

    if strategy["personality_prompt"]:
        ctx.personality_modifier = strategy["personality_prompt"]

    # 3. Generate with full context
    generator = ContentGeneratorV2()
    generator._current_brand = brand_id

    return generator.generate_viral_content(
        topic_hint=strategy["topic_bucket"],
        hook_hint=strategy["hook_strategy"],
        ctx=ctx,
    )


def generate_carousel_content(
    user_id: str,
    brand_id: str,
    *,
    topic_hint: Optional[str] = None,
    title_format_hint: Optional[str] = None,
    db=None,
) -> Dict:
    """
    Generate ONE carousel/post for a single brand.

    Uses Toby's learning engine for topic/title_format selection, then generates
    via ContentGeneratorV2 with brand-specific Content DNA.

    Returns dict with title, caption, image_prompt, slide_texts.
    Raises ContentGenerationError on failure.
    """
    from app.services.content.generator import ContentGeneratorV2
    from app.services.content.niche_config_service import NicheConfigService

    # 1. Load brand-specific PromptContext
    ctx = NicheConfigService().get_context(user_id=user_id, brand_id=brand_id, db=db)
    if not ctx:
        ctx = PromptContext()

    # 2. Ask Toby's brain for the best strategy
    strategy = _resolve_strategy(
        user_id, brand_id, "post",
        topic_hint=topic_hint,
        db=db,
    )

    # 3. Resolve title format: explicit hint > learned format > random from pool
    title_format = title_format_hint or strategy.get("title_format")
    if not title_format:
        from app.services.toby.learning_engine import TITLE_FORMATS
        import random
        title_format = random.choice(TITLE_FORMATS)

    # 4. Build brand-scoped + cross-brand avoidance context
    avoidance = _get_brand_avoidance_context(brand_id, "post")

    # 5. Generate with full context + mandatory title format constraint
    generator = ContentGeneratorV2()
    results = generator.generate_post_titles_batch(
        count=1,
        topic_hint=strategy["topic_bucket"],
        ctx=ctx,
        brand_avoidance_context=avoidance,
        title_format=title_format,
    )
    if not results:
        from app.services.content.generator import ContentGenerationError
        raise ContentGenerationError("Carousel generation returned no results")
    return results[0]


def generate_format_b_content(
    user_id: str,
    brand_id: str,
    *,
    niche: Optional[str] = None,
    topic_hint: Optional[str] = None,
    hook_hint: Optional[str] = None,
    personality_prompt: Optional[str] = None,
    story_category: Optional[str] = None,
    db=None,
):
    """
    Generate Format B reel content for a single brand.

    Uses Toby's learning engine for strategy, then generates via StoryPolisher
    with brand-specific niche from Content DNA + recent title avoidance.

    Returns a PolishedStory (dataclass) or None on failure.
    """
    from app.services.discovery.story_polisher import StoryPolisher
    from app.services.content.niche_config_service import NicheConfigService

    # 1. Load brand-specific PromptContext (for niche resolution)
    ctx = NicheConfigService().get_context(user_id=user_id, brand_id=brand_id, db=db)

    # 2. Resolve niche: explicit > Content DNA > fallback
    effective_niche = niche or (ctx.niche_name if ctx else None) or "business"

    # 3. Ask Toby's brain for the best strategy
    strategy = _resolve_strategy(
        user_id, brand_id, "format_b_reel",
        topic_hint=topic_hint,
        hook_hint=hook_hint,
        personality_prompt=personality_prompt,
        story_category=story_category,
        db=db,
    )

    # 4. Gather recent titles for this brand to avoid repetition
    recent_titles = _get_recent_format_b_titles(brand_id, db=db)

    # 5. Generate
    polisher = StoryPolisher()
    return polisher.generate_content(
        niche=effective_niche,
        topic_hint=strategy["topic_bucket"],
        hook_hint=strategy["hook_strategy"],
        personality_prompt=strategy["personality_prompt"],
        story_category=strategy["story_category"] or "",
        recent_titles=recent_titles,
    )


# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

def _get_brand_avoidance_context(brand_id: str, content_type: str) -> str:
    """Get brand-specific + cross-brand title avoidance context for prompt injection."""
    try:
        from app.services.content.tracker import ContentTracker
        tracker = ContentTracker()
        return tracker.get_brand_avoidance_prompt(
            brand=brand_id,
            content_type=content_type,
            cross_brand_days=7,
        )
    except Exception:
        return ""


def _get_recent_format_b_titles(brand_id: str, limit: int = 10, db=None) -> List[str]:
    """Get recent Format B titles for a brand to avoid repetition."""
    try:
        from app.models.jobs import GenerationJob
        from sqlalchemy import Text

        def _query(session):
            rows = (
                session.query(GenerationJob.title)
                .filter(
                    GenerationJob.brands.cast(Text).contains(brand_id),
                    GenerationJob.content_format == "format_b",
                )
                .order_by(GenerationJob.created_at.desc())
                .limit(limit)
                .all()
            )
            return [r.title for r in rows if r.title]

        if db:
            return _query(db)

        from app.db_connection import get_db_session
        with get_db_session() as session:
            return _query(session)
    except Exception:
        return []
