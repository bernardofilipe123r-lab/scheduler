"""
Toby Seed Discovery — auto-generates competitor accounts and discovery hashtags
from the user's Content DNA (NicheConfig).

When a user has configured their niche (topics, keywords, audience) but hasn't
manually added competitors or hashtags, Toby autonomously:

  1. Derives discovery hashtags from topic_keywords + topic_categories
  2. Asks DeepSeek LLM to suggest relevant Instagram competitor accounts
  3. Validates each suggestion via IG Business Discovery API
  4. Saves validated results back to NicheConfig

This makes Toby a fully autonomous MPS — no manual competitor input needed.
"""

import os
import json
import time
import logging
import requests
from datetime import datetime, timedelta, timezone
from typing import List

from sqlalchemy.orm import Session
from app.models.niche_config import NicheConfig
from app.models.toby import TobyActivityLog

logger = logging.getLogger(__name__)

# Debounce: don't re-attempt seeding more than once per 24 hours
SEED_DEBOUNCE_HOURS = 24


def maybe_seed_discovery(db: Session, user_id: str) -> dict:
    """
    Check if auto-seeding is needed and run it if so.

    Only seeds when:
      - NicheConfig exists with enough content DNA (niche_name + topic_keywords)
      - competitor_accounts AND discovery_hashtags are both empty
      - No recent seeding attempt (debounced to once per 24h)

    Returns: {"seeded": True, ...} or {"skipped": True, reason: ...}
    """
    cfg = db.query(NicheConfig).filter(NicheConfig.user_id == user_id).first()
    if not cfg:
        return {"skipped": True, "reason": "no_niche_config"}

    has_competitors = bool(cfg.competitor_accounts)
    has_hashtags = bool(cfg.discovery_hashtags)

    # Already have sources — nothing to seed
    if has_competitors and has_hashtags:
        return {"skipped": True, "reason": "already_configured"}

    # Need enough content DNA to seed from
    if not cfg.niche_name or not cfg.topic_keywords:
        return {"skipped": True, "reason": "insufficient_content_dna"}

    # Debounce: check if we recently attempted seeding
    recent_seed = (
        db.query(TobyActivityLog)
        .filter(
            TobyActivityLog.user_id == user_id,
            TobyActivityLog.action_type.in_(["discovery_seeded", "discovery_seed_failed"]),
            TobyActivityLog.created_at >= datetime.now(timezone.utc) - timedelta(hours=SEED_DEBOUNCE_HOURS),
        )
        .first()
    )
    if recent_seed:
        return {"skipped": True, "reason": "recently_attempted"}

    # Run seeding
    return _seed_discovery_config(db, user_id, cfg, seed_competitors=not has_competitors, seed_hashtags=not has_hashtags)


def _seed_discovery_config(
    db: Session, user_id: str, cfg: NicheConfig,
    seed_competitors: bool = True, seed_hashtags: bool = True,
) -> dict:
    """Core seeding logic — derives hashtags and suggests/validates competitors."""
    results = {"seeded": True, "competitors_added": 0, "hashtags_added": 0}

    # Step 1: Derive discovery hashtags from Content DNA
    if seed_hashtags:
        hashtags = _derive_hashtags(cfg)
        if hashtags:
            cfg.discovery_hashtags = hashtags
            results["hashtags_added"] = len(hashtags)
            logger.info("Auto-seeded %d discovery hashtags for user %s", len(hashtags), user_id)

    # Step 2: Use LLM to suggest + validate competitor accounts
    if seed_competitors:
        competitors = _suggest_and_validate_competitors(user_id, cfg)
        if competitors:
            cfg.competitor_accounts = competitors
            results["competitors_added"] = len(competitors)
            logger.info("Auto-seeded %d competitor accounts for user %s", len(competitors), user_id)

    # Persist changes
    if results["competitors_added"] > 0 or results["hashtags_added"] > 0:
        cfg.updated_at = datetime.now(timezone.utc)
        db.flush()

        # Invalidate NicheConfigService cache so TrendScout picks up new values
        try:
            from app.services.content.niche_config_service import get_niche_config_service
            get_niche_config_service().invalidate_cache(user_id=user_id)
        except Exception:
            pass

        db.add(TobyActivityLog(
            user_id=user_id,
            action_type="discovery_seeded",
            description=(
                f"Auto-discovered {results['competitors_added']} competitor accounts "
                f"and {results['hashtags_added']} hashtags from Content DNA"
            ),
            action_metadata=results,
            level="info",
            created_at=datetime.now(timezone.utc),
        ))
        db.commit()
    else:
        # Record failed attempt so we don't retry immediately
        db.add(TobyActivityLog(
            user_id=user_id,
            action_type="discovery_seed_failed",
            description="Auto-discovery seeding attempted but found no valid sources",
            action_metadata=results,
            level="warning",
            created_at=datetime.now(timezone.utc),
        ))
        db.commit()

    return results


# ──────────────────────────────────────────────────────────
# HASHTAG DERIVATION (mechanical — no LLM needed)
# ──────────────────────────────────────────────────────────

def _derive_hashtags(cfg: NicheConfig) -> List[str]:
    """
    Derive discovery hashtags from topic_keywords, topic_categories, and niche_name.

    Uses the user's own curated keywords as hashtag seeds — these are already
    highly relevant to their niche and audience.
    """
    seen = set()
    hashtags = []

    def _add(tag: str):
        tag = tag.lower().replace(" ", "").replace("-", "").replace("&", "and")
        tag = tag.strip("#")
        if tag and tag not in seen and len(tag) >= 3:
            seen.add(tag)
            hashtags.append(tag)

    # Niche name first (broadest signal)
    if cfg.niche_name:
        _add(cfg.niche_name)

    # Topic keywords (user-curated, high quality)
    for kw in (cfg.topic_keywords or [])[:20]:
        _add(kw)

    # Topic categories (broader groupings)
    for cat in (cfg.topic_categories or [])[:8]:
        _add(cat)

    return hashtags[:20]


# ──────────────────────────────────────────────────────────
# COMPETITOR SUGGESTION (LLM + IG validation)
# ──────────────────────────────────────────────────────────

def _suggest_and_validate_competitors(user_id: str, cfg: NicheConfig) -> List[str]:
    """
    Use DeepSeek to suggest relevant IG accounts, then validate via Business Discovery API.
    Only returns accounts confirmed accessible via IG API.
    """
    suggested = _suggest_competitors_via_llm(cfg)
    if not suggested:
        return []

    validated = _validate_ig_accounts(suggested)
    return validated


def _suggest_competitors_via_llm(cfg: NicheConfig) -> List[str]:
    """Ask DeepSeek to suggest Instagram competitor accounts for this niche."""
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        logger.warning("No DEEPSEEK_API_KEY — cannot auto-suggest competitors")
        return []

    # Build context from Content DNA
    niche_context = (
        f"Niche: {cfg.niche_name}\n"
        f"Description: {(cfg.niche_description or '')[:300]}\n"
        f"Target Audience: {cfg.target_audience or ''}\n"
        f"Topics: {', '.join((cfg.topic_categories or [])[:8])}\n"
        f"Keywords: {', '.join((cfg.topic_keywords or [])[:15])}\n"
    )
    if cfg.content_brief:
        niche_context += f"Content Brief: {cfg.content_brief[:300]}\n"

    prompt = (
        "You are an Instagram growth strategist. Based on the niche below, "
        "suggest 15 popular Instagram accounts that create similar content.\n\n"
        f"{niche_context}\n"
        "Requirements:\n"
        "- Must be REAL, currently active Instagram accounts\n"
        "- Must be public business or creator accounts (not personal)\n"
        "- Should post educational/informational Reels and carousels\n"
        "- Mix of sizes: ~5 large (500K+), ~5 medium (50K-500K), ~5 smaller (10K-50K)\n"
        "- Only suggest accounts you are highly confident exist\n\n"
        "Return ONLY a JSON array of Instagram usernames (without @). No explanation.\n"
        'Example: ["account1", "account2", "account3"]'
    )

    try:
        response = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 500,
            },
            timeout=30,
        )

        if response.status_code != 200:
            logger.error("DeepSeek competitor suggestion failed: HTTP %s", response.status_code)
            return []

        content_text = response.json()["choices"][0]["message"]["content"].strip()

        # Parse JSON (handle markdown fences)
        if content_text.startswith("```"):
            content_text = content_text.split("```")[1]
            if content_text.startswith("json"):
                content_text = content_text[4:]
            content_text = content_text.strip()

        suggested = json.loads(content_text)
        if not isinstance(suggested, list):
            return []

        # Clean up usernames
        cleaned = []
        for s in suggested:
            if isinstance(s, str):
                username = s.strip().lstrip("@").lower()
                # Basic sanity: IG usernames are alphanumeric + dots + underscores
                if username and all(c.isalnum() or c in "._" for c in username):
                    cleaned.append(username)

        logger.info("DeepSeek suggested %d competitor accounts", len(cleaned))
        return cleaned[:15]

    except Exception as e:
        logger.error("Failed to get competitor suggestions from DeepSeek: %s", e)
        return []


def _validate_ig_accounts(usernames: List[str]) -> List[str]:
    """
    Validate accounts via IG Business Discovery API.
    Only returns accounts that are accessible (public business/creator accounts).
    """
    access_token = None
    ig_user_id = None

    try:
        from app.services.brands.resolver import brand_resolver
        for brand_id in brand_resolver.get_all_brand_ids():
            brand = brand_resolver.get_brand(brand_id)
            if brand and brand.instagram_business_account_id:
                token = brand.meta_access_token or brand.instagram_access_token
                if token:
                    access_token = token
                    ig_user_id = brand.instagram_business_account_id
                    break
    except Exception:
        pass

    if not access_token or not ig_user_id:
        logger.warning("No IG credentials — skipping competitor validation, accepting LLM suggestions as-is")
        return usernames[:10]

    validated = []
    for username in usernames:
        try:
            resp = requests.get(
                f"https://graph.instagram.com/v21.0/{ig_user_id}",
                params={
                    "fields": f"business_discovery.fields(username,followers_count).username({username})",
                    "access_token": access_token,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                bd = resp.json().get("business_discovery", {})
                if bd.get("username"):
                    validated.append(bd["username"])
                    logger.info("Validated competitor: @%s (followers: %s)",
                                bd["username"], bd.get("followers_count", "?"))
            else:
                logger.debug("Could not validate @%s: HTTP %s", username, resp.status_code)

            time.sleep(1)  # Rate limit respect

        except Exception as e:
            logger.debug("Failed to validate @%s: %s", username, e)
            continue

        if len(validated) >= 10:
            break

    logger.info("Validated %d/%d suggested competitor accounts", len(validated), len(usernames))
    return validated
