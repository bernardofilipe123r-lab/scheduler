# Toby Content Diversity — Root Cause & Fix Proposal

**Problem:** Toby generates multiple pieces of content on the same sub-topic on the same day (e.g., three "strength vs size" reels scheduled March 7).

---

## Root Cause (Confirmed via Code Review)

### The planning loop has no shared state across slots

In [content_planner.py:79-84](../app/services/toby/content_planner.py#L79-L84), each slot is planned independently:

```python
for slot in interleaved:
    strategy = _select_strategy_with_combos(
        db, user_id, slot["brand_id"], slot["content_type"],
        state.explore_ratio or 0.30, available_topics,  # Same list every time
    )
```

`available_topics` is a static list fetched once from NicheConfig (all topics, unfiltered). Every slot runs Thompson Sampling independently against the same list with no memory of what was already picked for the other slots in this batch. If "strength_training" has the highest avg score, it wins ~80% of samples — so 4 out of 5 slots pick it.

### Three existing anti-repetition systems that don't prevent clustering

| System | Where | What it catches | Why it fails |
|--------|-------|-----------------|--------------|
| Topic cooldown | `tracker.py:241-295` | Same topic used across days | **Never called from content_planner.py** — `_get_available_topics()` on line 212 pulls raw NicheConfig, not the cooldown-filtered list |
| Title fingerprint | `tracker.py:205` | Near-duplicate titles | Operates post-generation, different titles on same topic pass through |
| PatternSelector recent topics | `viral_patterns.py` | Recent topic repetition | Bypassed — `content_planner.py` doesn't use PatternSelector at all |

### Why the cooldown system doesn't fire

`ContentTracker.get_available_topics()` (the DB-backed cooldown filter in `tracker.py:268`) is completely separate from `content_planner._get_available_topics()` (line 212). The planner's version just does:

```python
def _get_available_topics(db: Session, user_id: str) -> list[str]:
    config = db.query(NicheConfig).filter(...).first()
    if config and config.topic_categories:
        return config.topic_categories   # All topics, no cooldown applied
    return ["general"]
```

`ContentTracker` is used by the legacy `ContentGeneratorV2` pipeline, not by Toby's planner. The two systems are disconnected.

---

## Fix Proposal

Three fixes in priority order. Fix 1 alone solves ~80% of the problem.

---

### Fix 1 — Batch-level topic diversity (highest ROI, ~20 lines)

**File:** [content_planner.py:75-105](../app/services/toby/content_planner.py#L75-L105)

**Change:** Track which topics have already been picked in the current batch. Before each slot, filter `available_topics` to exclude already-picked topics. Only allow a repeat when all topics are exhausted.

```python
# Get available topics from NicheConfig
available_topics = _get_available_topics(db, user_id)

plans = []
topics_picked_this_batch: list[str] = []   # <-- ADD THIS

for slot in interleaved:
    # Exclude topics already picked in this batch, fallback to full list
    remaining = [t for t in available_topics if t not in topics_picked_this_batch]
    topics_for_slot = remaining if remaining else available_topics   # <-- FILTER

    strategy = _select_strategy_with_combos(
        db, user_id, slot["brand_id"], slot["content_type"],
        state.explore_ratio or 0.30, topics_for_slot,   # <-- PASS FILTERED LIST
    )
    topics_picked_this_batch.append(strategy.topic_bucket)   # <-- TRACK PICK

    # ... rest unchanged
```

**Effect:** In a batch of 6 slots with 8 available topics, each topic is picked at most once before any topic repeats. Directly prevents the "4x strength_training" pattern.

**Risk:** Minimal. Pure addition of a local list. Falls back to full topic list when all topics are exhausted. No DB changes needed.

---

### Fix 2 — Wire up the existing topic cooldown at planning time (medium ROI, ~10 lines)

**File:** [content_planner.py:212-223](../app/services/toby/content_planner.py#L212-L223)

**Change:** Replace `_get_available_topics()` with a call to `ContentTracker.get_available_topics()` so the 3-day cooldown window is enforced before planning, not just post-generation.

```python
def _get_available_topics(db: Session, user_id: str) -> list[str]:
    from app.models.niche_config import NicheConfig
    from app.services.content.tracker import ContentTracker

    config = db.query(NicheConfig).filter(NicheConfig.user_id == user_id).first()
    all_topics = config.topic_categories if config and config.topic_categories else ["general"]

    # Apply DB-backed cooldown filter — topics used in last 3 days are excluded
    try:
        tracker = ContentTracker()
        available = tracker.get_available_topics(
            content_type="reel",
            topic_buckets=all_topics,
        )
        return available if available else all_topics
    except Exception:
        return all_topics  # Graceful degradation
```

**Effect:** Topics used in the last 3 days are filtered out before Thompson Sampling even runs. Prevents cross-day repetition. The cooldown system already works and is tested — it just wasn't connected to the planner.

**Risk:** Low. The `ContentTracker.get_available_topics()` already handles the "all on cooldown" edge case by returning the full list. No DB changes.

---

### Fix 3 — Daily topic cap (hard limit, requires DB migration)

**Files:** New DB table + integration in `content_planner.py`

This is a harder constraint for users with fewer topics (e.g., only 3-4 topic categories configured). Even with Fix 1 + 2, if Toby runs multiple ticks in one day with only 3 topics, it'll exhaust Fix 1's batch dedup and loop back.

**Architecture:**

1. Add a `toby_daily_topic_usage` table:
   ```sql
   CREATE TABLE toby_daily_topic_usage (
       id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id     TEXT NOT NULL,
       brand_id    TEXT NOT NULL,
       topic       TEXT NOT NULL,
       usage_date  DATE NOT NULL DEFAULT CURRENT_DATE,
       count       INT NOT NULL DEFAULT 1,
       UNIQUE (user_id, brand_id, topic, usage_date)
   );
   ```

2. In `content_planner.py`, after picking a topic, check the daily count:
   ```python
   MAX_TOPIC_USES_PER_DAY = 2  # configurable per brand later

   def _is_topic_at_daily_cap(db, user_id, brand_id, topic) -> bool:
       row = db.query(DailyTopicUsage).filter_by(
           user_id=user_id, brand_id=brand_id,
           topic=topic, usage_date=date.today()
       ).first()
       return row is not None and row.count >= MAX_TOPIC_USES_PER_DAY
   ```

3. Filter topics by daily cap before passing to strategy selection. Increment on each plan created.

**Effect:** Hard cap on same-topic content per day. Survives multiple ticks, deploys, and restarts (persisted to DB).

**Risk:** Medium. Requires migration + new model. Could over-constrain users with very few topics — needs the "fallback to full list when all capped" safety valve.

---

## Implementation Order

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| 1 | Batch-level topic dedup in planning loop | ~20 lines, no DB | Solves 80% of the problem |
| 2 | Wire up ContentTracker cooldown to planner | ~10 lines, no DB | Prevents cross-day repeats |
| 3 | DB-backed daily topic cap | Migration + ~50 lines | Hard constraint for edge cases |

**Start with Fix 1.** It's the only change needed for the screenshots shown — all 4 "strength_training" slots come from a single planning batch.

---

## Files Involved

| File | Change |
|------|--------|
| [content_planner.py](../app/services/toby/content_planner.py) | Fix 1 (batch dedup) + Fix 2 (wire cooldown) |
| [tracker.py](../app/services/content/tracker.py) | No change — already correct, just unused by planner |
| [learning_engine.py](../app/services/toby/learning_engine.py) | No change needed for Fix 1+2 |
| New migration SQL | Fix 3 only |
| New model `DailyTopicUsage` | Fix 3 only |

---

## What NOT to change

- `ContentTracker` is working correctly — don't refactor it, just call it from the planner
- `_pick_dimension()` in `learning_engine.py` — Thompson Sampling is fine; the bug is upstream (what options it's given)
- Deduplication fingerprinting — title dedup is a separate layer and is working
