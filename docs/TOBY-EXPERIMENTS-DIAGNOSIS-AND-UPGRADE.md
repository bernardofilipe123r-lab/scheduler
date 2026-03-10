# Toby Experiments: Diagnosis & Upgrade Brief

> **Author**: Senior Architecture Review
> **Date**: 2026-03-10
> **Audience**: AI Developer implementing the fixes
> **Constraint**: ZERO data loss — all existing learning data (80 scored posts, 106 published, strategy scores, memories) must remain intact

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [How the Experiment Pipeline Is Supposed to Work](#2-how-the-experiment-pipeline-is-supposed-to-work)
3. [Bug #1 — The Showstopper: Missing UUID Primary Key](#3-bug-1--the-showstopper-missing-uuid-primary-key)
4. [Bug #2 — Unmapped Model Columns: Metadata Silently Lost](#4-bug-2--unmapped-model-columns-metadata-silently-lost)
5. [Bug #3 — Missing Guard in `design_experiment()`](#5-bug-3--missing-guard-in-design_experiment)
6. [Bug #4 — Missing Import in `check_experiment_significance()`](#6-bug-4--missing-import-in-check_experiment_significance)
7. [Bug #5 — Incomplete Experiment Completion Flow](#7-bug-5--incomplete-experiment-completion-flow)
8. [Bug #6 — Frontend-Backend Data Shape Mismatch](#8-bug-6--frontend-backend-data-shape-mismatch)
9. [Level-Up: Architectural Improvements](#9-level-up-architectural-improvements)
10. [Implementation Order & Safety Protocol](#10-implementation-order--safety-protocol)
11. [Verification Checklist](#11-verification-checklist)
12. [File Reference Map](#12-file-reference-map)
13. [Appendix: What You Should See Yourself](#13-appendix-what-you-should-see-yourself)

---

## 1. Executive Summary

**Toby's experiments are stuck at 0 because every experiment creation attempt crashes silently.**

There are **two** code paths that create experiments. **Both** are broken in the same way: they construct a `TobyExperiment` object without providing the `id` field — a required `String(36)` primary key with no default. When SQLAlchemy tries to INSERT the row, PostgreSQL rejects it (NULL primary key), the exception is caught in a try/except, and the function returns `None` silently. No experiment is ever created, no activity log is written, no error surfaces to the dashboard.

Additionally, there are **5 more bugs** of decreasing severity that must be fixed as part of this effort. And there are **3 architectural improvements** that will accelerate Toby's learning speed.

### The 7 Bugs at a Glance

| # | Severity | Bug | File | Impact |
|---|----------|-----|------|--------|
| 1 | **CRITICAL** | Missing `id=str(uuid.uuid4())` in experiment creation | `experiment_designer.py:86`, `pattern_analyzer.py:287` | All experiment INSERTs fail → counter stuck at 0 |
| 2 | HIGH | 4 DB columns exist but aren't declared in model | `app/models/toby.py:89-126` | `hypothesis`, `expected_effect_size`, `achieved_significance`, `p_value` silently dropped |
| 3 | MEDIUM | No active-experiment guard in `design_experiment()` | `experiment_designer.py:86` | Could create duplicate experiments once Bug #1 is fixed |
| 4 | MEDIUM | Missing `TobyContentTag` import | `experiment_designer.py:13` | `check_experiment_significance()` will crash with `NameError` |
| 5 | MEDIUM | Incomplete completion flow in `check_experiment_significance()` | `experiment_designer.py:186-191` | `winner` and `completed_at` never set when statistical significance detected |
| 6 | HIGH | Frontend type expects different shape than backend returns | `src/features/toby/types.ts:163-179` vs `app/models/toby.py:113-126` | Even after fix, `TobyExperiments.tsx` will crash on `.toFixed()` of undefined |
| 7 | LOW | Orchestrator only designs experiments for `"reel"`, never `"post"` | `orchestrator.py:254` | Post strategy never experiments |

---

## 2. How the Experiment Pipeline Is Supposed to Work

Understanding the full lifecycle helps you see exactly where it breaks.

### 2.1 The Three Creation Paths

```
Path A: Orchestrator → design_experiment() [experiment_designer.py]
        ├── Triggered by: Deliberation Loop (Loop 3), every 24h
        ├── For each of the user's brands:
        │   1. Calls DeepSeek Reasoner with strategy context
        │   2. LLM returns JSON: {dimension, options, hypothesis, ...}
        │   3. Creates TobyExperiment row  ← BROKEN (Bug #1)
        │   4. Creates TobyActivityLog row
        │   5. Commits
        └── Sets state.last_deliberation_at = now

Path B: Orchestrator → pattern_analysis_loop() → _queue_experiment() [pattern_analyzer.py]
        ├── Triggered by: Same Deliberation Loop, every 24h
        ├── Pattern analysis returns experiment_suggestions[]
        ├── For each suggestion:
        │   1. Checks for existing active experiment on same dimension (guard exists)
        │   2. Creates TobyExperiment row  ← BROKEN (Bug #1)
        │   3. Flushes
        └── Outer function commits

Path C: create_experiment() [learning_engine.py]
        ├── Called by: Discovery manager, manual API calls
        ├── Has J4 guard (>= 2 options) ✓
        ├── Has active experiment guard ✓
        ├── Sets id=str(uuid.uuid4()) ✓  ← THIS ONE WORKS
        └── Creates activity log
```

### 2.2 The Experiment Lifecycle (Once Created)

```
ACTIVE                                              COMPLETED
  │                                                    │
  ├─ Content is linked via experiment_id              Winner declared
  ├─ Scores update results{} dict                     │
  ├─ check_experiment_significance() via Welch's      How?
  │   t-test for early stopping                       ├─ All options reach min_samples
  └─ check_experiment_timeouts() after 21 days        ├─ Statistical significance (p<0.05, d>0.3)
                                                      └─ Timeout after 21 days
```

### 2.3 The Orchestrator's Deliberation Loop (Where It All Starts)

**File**: `app/services/toby/orchestrator.py`, lines 241-262

```python
# 3b. DELIBERATION LOOP (v3 Loop 3) — daily pattern analysis via DeepSeek R1
try:
    from app.services.toby.feature_flags import is_enabled
    if is_enabled("deliberation_loop") and _should_check(state.last_deliberation_at, 1440):  # 24h
        from app.services.toby.agents.pattern_analyzer import pattern_analysis_loop
        from app.services.toby.agents.experiment_designer import design_experiment
        # Pattern analysis + experiment design per brand
        for brand in user_brands:
            try:
                pattern_analysis_loop(db, user_id, brand.id)       # Path B
            except Exception as pa_err:
                print(f"[TOBY] Pattern analysis failed for {brand.id}: {pa_err}", flush=True)
            try:
                design_experiment(db, user_id, brand.id, "reel")   # Path A
            except Exception as exp_err:
                print(f"[TOBY] Experiment design failed for {brand.id}: {exp_err}", flush=True)
        state.last_deliberation_at = now
        state.updated_at = now
        db.commit()
except Exception as e:
    db.rollback()
    print(f"[TOBY] Deliberation loop failed for {user_id}: {e}", flush=True)
```

**Key observation**: Even when the experiment creation fails, the outer loop catches the exception and STILL sets `state.last_deliberation_at = now`. This means the deliberation loop ran, thought it succeeded, and won't retry for another 24h. The bug is self-reinforcing — it fails silently and doesn't retry.

### 2.4 The Dashboard Counter

**File**: `app/api/toby/routes.py`, lines 60-64

```python
active_experiments = (
    db.query(TobyExperiment)
    .filter(TobyExperiment.user_id == uid, TobyExperiment.status == "active")
    .count()
)
```

This is a simple count of rows with `status='active'`. Since no rows are ever created (Bug #1), the count is always 0.

---

## 3. Bug #1 — The Showstopper: Missing UUID Primary Key

### What's Wrong

The `TobyExperiment` model defines its primary key as:

```python
# app/models/toby.py, line 93
id = Column(String(36), primary_key=True)
```

There is **no default value**, no server-side default, no `default=lambda: str(uuid.uuid4())`. The `id` must be explicitly provided.

**Path A — `design_experiment()`** at `app/services/toby/agents/experiment_designer.py:86-94`:

```python
experiment = TobyExperiment(
    user_id=user_id,
    content_type=content_type,
    dimension=design["dimension"],
    options=design["options"],
    status="active",
    hypothesis=design.get("hypothesis", ""),         # Bug #2: not a column
    expected_effect_size=design.get("expected_effect_size"),  # Bug #2: not a column
    # ❌ NO id= FIELD!
)
db.add(experiment)
db.commit()  # ← PostgreSQL: ERROR: null value in column "id" violates not-null constraint
```

The exception at line 106 (`db.commit()`) is caught by the try/except at line 110:

```python
except Exception as e:
    print(f"[TOBY] Experiment design failed: {e}", flush=True)
    return None
```

**Path B — `_queue_experiment()`** at `app/services/toby/agents/pattern_analyzer.py:287-297`:

```python
experiment = TobyExperiment(
    user_id=user_id,
    content_type=content_type,
    dimension=exp.get("dimension", ""),
    options=exp.get("options", []),
    status="active",
    hypothesis=exp.get("hypothesis", ""),             # Bug #2: not a column
    expected_effect_size=exp.get("expected_effect_size"),  # Bug #2: not a column
    # ❌ NO id= FIELD!
)
db.add(experiment)
db.flush()  # ← Same error, but this one propagates up
```

**Compare with the WORKING function** — `create_experiment()` at `app/services/toby/learning_engine.py:539-549`:

```python
exp = TobyExperiment(
    id=str(uuid.uuid4()),        # ✅ Correctly generates UUID
    user_id=user_id,
    content_type=content_type,
    dimension=dimension,
    options=options,
    results={},                  # ✅ Explicitly initializes
    status="active",
    min_samples=min_samples,     # ✅ Explicitly sets
    started_at=datetime.now(timezone.utc),  # ✅ Explicit
)
```

### Why It's Silent

1. `design_experiment()` — The `try/except Exception` at line 110 swallows the DB error and returns `None`. The `print()` goes to stdout/Railway logs, but no activity log is written (the log creation at line 98-105 was pending in the same transaction that got rolled back).

2. `_queue_experiment()` — The `db.flush()` raises, exception propagates to `pattern_analysis_loop()` line 124 (inside the `for exp in ...` loop), then up to the orchestrator's try/except at line 251-252. Again, printed but not logged.

3. The orchestrator then proceeds to set `state.last_deliberation_at = now` (line 257), marking the deliberation as "done" for 24h. The bug is invisible to the dashboard.

### The Fix

**For `experiment_designer.py:86`**:
```python
import uuid  # Add at top of file

experiment = TobyExperiment(
    id=str(uuid.uuid4()),        # ← ADD THIS
    user_id=user_id,
    content_type=content_type,
    dimension=design["dimension"],
    options=design["options"],
    results={},                   # ← ADD THIS (explicit init)
    status="active",
    min_samples=design.get("recommended_samples", 5),  # ← ADD THIS
    hypothesis=design.get("hypothesis", ""),
    expected_effect_size=design.get("expected_effect_size"),
)
```

**For `pattern_analyzer.py:287`**:
```python
import uuid  # Add at top of file

experiment = TobyExperiment(
    id=str(uuid.uuid4()),        # ← ADD THIS
    user_id=user_id,
    content_type=content_type,
    dimension=exp.get("dimension", ""),
    options=exp.get("options", []),
    results={},                   # ← ADD THIS
    status="active",
    min_samples=5,                # ← ADD THIS
    hypothesis=exp.get("hypothesis", ""),
    expected_effect_size=exp.get("expected_effect_size"),
)
```

### Why Not Fix It in the Model Instead?

You might think: "Why not add `default=lambda: str(uuid.uuid4())` to the model?" That's a valid alternative, but:

1. **Every other model** in the codebase explicitly generates UUIDs at creation time (check `learning_engine.py:264`, `state.py:57`, etc.). Adding a model-level default would be inconsistent.
2. Model-level defaults are invisible — they hide the intent. Explicit `id=str(uuid.uuid4())` makes it clear that a new row is being created.
3. You'd still need to fix the missing `results={}`, `min_samples`, etc. in the constructors.

**However**, if you want belt-and-suspenders, you CAN add the model default as well:

```python
# app/models/toby.py, line 93 (optional)
import uuid
id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
```

This is a safe additive change that would prevent this class of bug in the future.

---

## 4. Bug #2 — Unmapped Model Columns: Metadata Silently Lost

### What's Wrong

The v3 cognitive migration (`migrations/toby_v3_cognitive.sql:247-251`) added 4 columns to the `toby_experiments` table:

```sql
ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS hypothesis TEXT;
ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS expected_effect_size FLOAT;
ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS achieved_significance BOOLEAN;
ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS p_value FLOAT;
```

**But the Python model** (`app/models/toby.py:89-126`) never declared them:

```python
class TobyExperiment(Base):
    __tablename__ = "toby_experiments"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(100), nullable=False, index=True)
    content_type = Column(String(10), nullable=False)
    dimension = Column(String(30), nullable=False)
    options = Column(JSON, nullable=False)
    results = Column(JSON, nullable=False, default=dict)
    status = Column(String(20), nullable=False, default="active")
    winner = Column(String(100), nullable=True)
    started_at = Column(DateTime(timezone=True), default=_utc_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    min_samples = Column(Integer, default=5)
    # ❌ hypothesis — MISSING
    # ❌ expected_effect_size — MISSING
    # ❌ achieved_significance — MISSING
    # ❌ p_value — MISSING
```

### Why It Doesn't Crash (But Is Still Bad)

In SQLAlchemy's declarative base, when you pass `hypothesis="some text"` to the constructor, it:
1. Sets `self.hypothesis = "some text"` as a Python attribute
2. Since there's no `Column` mapping, SQLAlchemy's INSERT statement doesn't include the column
3. The column gets its DB default (NULL)
4. **The value is silently lost**

So `design_experiment()` carefully extracts the hypothesis from the LLM response and passes it to the constructor... and it vanishes.

### The Fix

Add the 4 column declarations to the model (between `min_samples` and `__table_args__`):

```python
# app/models/toby.py — Add after line 106
hypothesis = Column(Text, nullable=True)
expected_effect_size = Column(Float, nullable=True)
achieved_significance = Column(Boolean, nullable=True)
p_value = Column(Float, nullable=True)
```

And update `to_dict()` to include them:

```python
# Add to to_dict() method
"hypothesis": self.hypothesis,
"expected_effect_size": self.expected_effect_size,
"achieved_significance": self.achieved_significance,
"p_value": self.p_value,
```

### Migration Status

**Verify the columns exist in production** before changing the model:

```bash
# Run this first!
psql "$DATABASE_URL" -c "\d toby_experiments"
```

If the columns are there → just update the Python model.
If they're missing → run the migration first:

```bash
psql "$DATABASE_URL" -f migrations/toby_v3_cognitive.sql
```

The migration uses `ADD COLUMN IF NOT EXISTS`, so re-running is safe.

---

## 5. Bug #3 — Missing Guard in `design_experiment()`

### What's Wrong

`create_experiment()` (learning_engine.py:526-537) has a proper guard:

```python
existing = db.query(TobyExperiment).filter(
    TobyExperiment.user_id == user_id,
    TobyExperiment.content_type == content_type,
    TobyExperiment.dimension == dimension,
    TobyExperiment.status == "active",
).first()
if existing:
    return None
```

`_queue_experiment()` (pattern_analyzer.py:274-285) also has this guard.

But `design_experiment()` (experiment_designer.py) has **NO such guard**. It relies entirely on the LLM prompt instruction ("Do NOT test dimensions that already have an active experiment") which is unreliable.

### Why This Matters

Once Bug #1 is fixed, the deliberation loop will iterate over all 7 brands and call `design_experiment()` for each one. The `TobyExperiment` model has `user_id` but NOT `brand_id` — experiments are user-scoped. If the LLM suggests the same dimension for brands 2, 3, and 4, all three would be created. This creates duplicate experiments that confuse the result tracking.

### The Fix

Add the guard before the constructor in `design_experiment()`, between lines 83 and 86:

```python
if not design or not design.get("dimension"):
    return None

# Guard: don't create duplicate experiments for the same dimension
existing_active = (
    db.query(TobyExperiment)
    .filter(
        TobyExperiment.user_id == user_id,
        TobyExperiment.content_type == content_type,
        TobyExperiment.dimension == design["dimension"],
        TobyExperiment.status == "active",
    )
    .first()
)
if existing_active:
    return None

# J4 guard: single-option experiments can never conclude
if len(design.get("options", [])) < 2:
    return None

# Create the experiment
experiment = TobyExperiment(
    ...
```

### Alternative: Make experiments brand-scoped

A more ambitious approach would be to add `brand_id` to `TobyExperiment`. This would allow per-brand experiments (Brand A tests "edu_calm vs provoc" while Brand B tests "question vs bold_claim"). But this requires:
- New migration: `ALTER TABLE toby_experiments ADD COLUMN brand_id VARCHAR(50)`
- Update all experiment queries to filter by brand_id
- Update `update_experiment_results()` and `check_experiment_timeouts()`
- Frontend changes to show experiments per brand

**Recommendation**: Don't do this now. The user-scoped approach is fine for v1. Add `brand_id` later if cross-brand experiment management becomes a real need.

---

## 6. Bug #4 — Missing Import in `check_experiment_significance()`

### What's Wrong

**File**: `app/services/toby/agents/experiment_designer.py`

Line 13 imports:
```python
from app.models.toby import TobyExperiment, TobyActivityLog, TobyStrategyScore
```

But `check_experiment_significance()` at line 134 uses `TobyContentTag`:
```python
option_posts = (
    db.query(TobyContentTag)   # ← NameError: name 'TobyContentTag' is not defined
    ...
)
```

This function is never called in normal flow because experiments never get created (Bug #1). But once experiments exist and `check_experiment_significance()` is invoked, it will crash with a `NameError`.

### The Fix

Add `TobyContentTag` to the import:

```python
from app.models.toby import TobyExperiment, TobyActivityLog, TobyStrategyScore, TobyContentTag
```

---

## 7. Bug #5 — Incomplete Experiment Completion Flow

### What's Wrong

**File**: `app/services/toby/agents/experiment_designer.py`, lines 186-191

When Welch's t-test detects statistical significance:

```python
if significant:
    experiment.status = "completed"
    experiment.achieved_significance = True   # Bug #2: not persisted without model column
    experiment.p_value = float(p_value)       # Bug #2: not persisted without model column
    db.commit()
    # ❌ Missing: experiment.winner = ...
    # ❌ Missing: experiment.completed_at = ...
```

Compare with the proper completion flow in `update_experiment_results()` (learning_engine.py:452-456):

```python
exp.winner = best_opt
exp.status = "completed"
exp.completed_at = datetime.now(timezone.utc)
```

### The Fix

```python
if significant:
    experiment.status = "completed"
    experiment.winner = result["winner"]
    experiment.completed_at = datetime.now(timezone.utc)
    experiment.achieved_significance = True
    experiment.p_value = float(p_value)
    db.commit()
```

Note: `result["winner"]` is already computed at line 179 — just use it.

---

## 8. Bug #6 — Frontend-Backend Data Shape Mismatch

### What's Wrong

This is a **hidden time bomb** that will surface the moment Bug #1 is fixed and experiments appear.

**Backend `TobyExperiment.to_dict()`** returns (app/models/toby.py:113-126):

```python
{
    "id": "uuid-string",
    "user_id": "...",
    "content_type": "reel",
    "dimension": "personality",         # ← Backend calls it "dimension"
    "options": ["edu_calm", "provoc"],  # ← Array of options
    "results": {                        # ← Dict keyed by option name
        "edu_calm": {"count": 3, "total_score": 150, "avg_score": 50, "scores": [48, 52, 50]},
        "provoc": {"count": 4, "total_score": 220, "avg_score": 55, "scores": [52, 56, 58, 54]}
    },
    "status": "active",
    "winner": null,
    "started_at": "2026-03-10T...",
    "completed_at": null,
    "min_samples": 5,
    # After Bug #2 fix:
    "hypothesis": "...",
    "expected_effect_size": 0.3,
    "achieved_significance": null,
    "p_value": null,
}
```

**Frontend `TobyExperiment` type** expects (src/features/toby/types.ts:163-179):

```typescript
export interface TobyExperiment {
  id: number               // Backend sends string UUID, not number
  user_id: string
  experiment_type: string  // Backend sends "dimension", not "experiment_type"
  variant_a: string        // Backend sends options[0], not "variant_a"
  variant_b: string        // Backend sends options[1], not "variant_b"
  samples_a: number        // Backend sends results[opt].count, not "samples_a"
  samples_b: number
  mean_score_a: number     // Backend sends results[opt].avg_score, not "mean_score_a"
  mean_score_b: number
  winner: string | null
  confidence: number       // Backend doesn't send confidence at all
  status: 'active' | 'completed' | 'cancelled'
  started_at: string
  completed_at: string | null
  metadata: Record<string, unknown>  // Backend doesn't send metadata
}
```

The frontend component `TobyExperiments.tsx:8` does:
```tsx
const totalSamples = exp.samples_a + exp.samples_b
```
And line 35:
```tsx
<span>{exp.mean_score_a.toFixed(1)} avg</span>
```

Both will crash: `undefined + undefined = NaN` and `undefined.toFixed(1)` → `TypeError`.

### The Fix (Two Approaches)

**Approach A: Transform backend response (Recommended)**

Add a transformation layer in the API route or create a separate serialization. In `app/api/toby/routes.py`, modify the `/experiments` endpoint to transform the data into the shape the frontend expects:

```python
@router.get("/experiments")
def get_experiments(...):
    ...
    experiments = query.order_by(TobyExperiment.started_at.desc()).all()

    def _format_experiment(e: TobyExperiment) -> dict:
        options = e.options or []
        results = e.results or {}
        opt_a = options[0] if len(options) > 0 else ""
        opt_b = options[1] if len(options) > 1 else ""
        res_a = results.get(opt_a, {})
        res_b = results.get(opt_b, {})

        # Compute confidence from Beta distribution if significance data available
        confidence = 0.0
        if e.p_value is not None:
            confidence = 1.0 - e.p_value

        return {
            "id": e.id,
            "user_id": e.user_id,
            "experiment_type": e.dimension,
            "variant_a": opt_a,
            "variant_b": opt_b,
            "samples_a": res_a.get("count", 0),
            "samples_b": res_b.get("count", 0),
            "mean_score_a": res_a.get("avg_score", 0),
            "mean_score_b": res_b.get("avg_score", 0),
            "winner": e.winner,
            "confidence": confidence,
            "status": e.status,
            "started_at": e.started_at.isoformat() if e.started_at else None,
            "completed_at": e.completed_at.isoformat() if e.completed_at else None,
            "metadata": {
                "hypothesis": e.hypothesis,
                "expected_effect_size": e.expected_effect_size,
                "min_samples": e.min_samples,
                "content_type": e.content_type,
            },
        }

    return {"experiments": [_format_experiment(e) for e in experiments]}
```

**Approach B: Update the frontend type**

Change the TypeScript interface and component to match the backend's actual shape. This is more "correct" architecturally but requires changing both `types.ts` and `TobyExperiments.tsx`.

**Recommendation**: Approach A is faster and safer — it's a single backend change. The frontend already works with the expected shape; you just need the backend to produce it. Approach B is better long-term if you want the frontend to support >2 variants.

---

## 9. Level-Up: Architectural Improvements

Now that we understand why experiments are broken, here's how to take Toby's learning to the next level once the bugs are fixed.

### 9.1 Enable Post-Type Experiments

**Current state**: `orchestrator.py:254` only calls:
```python
design_experiment(db, user_id, brand.id, "reel")
```

Posts never get experiments. With 7 brands and presumably a mix of reels and posts, this means ~50% of the content pipeline is unoptimized.

**Fix**: After line 254, add:
```python
try:
    design_experiment(db, user_id, brand.id, "post")
except Exception as exp_err:
    print(f"[TOBY] Post experiment design failed for {brand.id}: {exp_err}", flush=True)
```

**Impact**: Doubles the surface area for experiments. Post strategies (deep_edu, myth_bust, compare, etc.) will start getting tested.

### 9.2 Lower the Cold-Start Threshold

**Current state**: `learning_engine.py:29`:
```python
COLD_START_THRESHOLD = 10
```

The `_get_effective_explore_ratio()` function (learning_engine.py:200-229) uses this threshold:
- 0 scored posts → 100% exploration (pure random)
- < 5 posts → 80% exploration
- < 10 posts → 50% exploration
- >= 10 posts → base ratio (typically 30%)

With 7 brands and ~80 total scored posts, some brands might have ~11 posts. At the 50% exploration threshold (5-10 posts), Thompson Sampling is being OVERRIDDEN by forced exploration half the time. The Beta distributions already have enough signal after 5 posts to guide exploration naturally.

**Recommendation**: Reduce to `COLD_START_THRESHOLD = 5`:
```python
COLD_START_THRESHOLD = 5
```

Now the progression is:
- 0 posts → 100% exploration
- < 5 posts → 80% exploration (unchanged)
- >= 5 posts → base ratio (30%) — Thompson Sampling takes over

**Impact**: Thompson Sampling kicks in at 5 posts instead of 10. With 7 brands, this means most brands are already past cold-start and will immediately benefit.

### 9.3 Why Pattern Recognition Is Only at 22%

The `compute_learning_confidence()` function (state.py:21-49) calculates:

```python
for dim in ["personality", "topic", "hook", "title_format", "visual_style"]:
    top_3 = TOP 3 options by avg_score for dimension
    for option in top_3:
        total += min(1.0, sample_count / STRATEGY_TARGET_SAMPLES)  # Target: 15
confidence = total / (5 dimensions × 3 options) = total / 15
```

With 80 scored posts across 7 brands and 5 dimensions, the data is spread thin:
- 80 posts / 7 brands ≈ 11 per brand
- 11 posts / 5 dimensions ≈ 2.2 samples per dimension per brand
- But scores are user-scoped (not brand-scoped in the query!), so it's 80 posts / 5 dims ≈ 16 samples per dimension
- Divided across ~5 options per dimension ≈ 3.2 samples per option
- Target is 15 → 3.2 / 15 = 21% ← matches the 22% shown!

**What will fix this**:
1. **Time** — more posts → more samples per option
2. **Experiments** — once working, experiments force sampling of specific options, concentrating data where it's needed instead of relying on random exploration
3. **Lower cold-start** — Thompson Sampling explores more intelligently than random, directing traffic to promising options faster

**The experiments fix alone will significantly accelerate learning** because:
- Instead of randomly exploring 25+ options across 5 dimensions, experiments focus on 2 options per dimension
- Each experiment run concentrates 5-20 samples on specific options
- After 2-3 completed experiments per dimension, the top-3 options will have 10-15 samples each → 67-100% confidence

### 9.4 Future Improvements (Not for This Sprint)

These are architectural ideas for later consideration:

1. **Brand-scoped experiments**: Add `brand_id` to `TobyExperiment` for per-brand A/B tests. Currently, experiments are user-wide, which doesn't account for brand-specific audiences.

2. **Multi-dimensional experiments**: Currently, experiments test ONE dimension at a time (personality OR topic OR hook). A factorial design could test combinations (personality × hook), but this requires more samples and a more complex analysis.

3. **Adaptive sample sizing**: Instead of fixed `min_samples=5`, use sequential analysis (already partially implemented via `check_experiment_significance()`) with a power analysis to determine optimal sample size based on effect size.

4. **Strategy correlation tracking**: Some personality×hook combinations may be synergistic. Track and analyze combination performance, not just individual dimension performance.

---

## 10. Implementation Order & Safety Protocol

### Order of Operations

This order is critical — each step depends on the previous ones.

```
Step 1: Verify DB columns exist (psql)
   ↓
Step 2: Update Python model (app/models/toby.py)
   ↓
Step 3: Fix experiment_designer.py (uuid, import, guard, constructor, completion)
   ↓
Step 4: Fix pattern_analyzer.py (uuid, constructor, J4 guard)
   ↓
Step 5: Fix experiments API route (data shape transformation)
   ↓
Step 6: Add post experiments to orchestrator
   ↓
Step 7: Lower cold-start threshold
   ↓
Step 8: Run validation
   ↓
Step 9: Commit and deploy
```

### Why This Order?

- **Step 1 before Step 2**: Migration-first rule. If the columns don't exist in the DB and you add them to the model, all queries to `toby_experiments` will fail with `column "hypothesis" does not exist`.
- **Step 2 before Steps 3-4**: The model columns must be declared before the code tries to set them (otherwise Bug #2 persists).
- **Step 5 before testing**: Without the API transformation, the frontend will crash even with valid experiments.
- **Steps 6-7 are independent**: These are improvements, not bug fixes. They can be deferred if needed.

### Zero Data Loss Guarantee

Every change in this plan is **additive**:
- No tables dropped
- No columns removed or renamed
- No rows deleted
- Migration uses `ADD COLUMN IF NOT EXISTS` (idempotent, safe to re-run)
- Model changes only ADD column declarations
- Constructor changes only ADD fields to new rows (existing rows untouched)
- API route changes only ADD transformation logic

### Rollback Plan

If something goes wrong:
1. `git revert <commit>` — all changes are in one commit
2. Deploy the revert via Railway
3. Existing data is untouched — no migration to reverse

---

## 11. Verification Checklist

After implementing all changes, run these in order:

### 11.1 DB Schema Verification
```bash
psql "$DATABASE_URL" -c "\d toby_experiments"
```
Confirm columns exist: `hypothesis`, `expected_effect_size`, `achieved_significance`, `p_value`

### 11.2 API Import Validation
```bash
python scripts/validate_api.py --imports
```
Must exit 0.

### 11.3 Full API Validation
```bash
python scripts/validate_api.py
```
Must exit 0.

### 11.4 Frontend Build
```bash
npm run build
```
Must succeed (TypeScript compilation + Vite build).

### 11.5 Tests
```bash
python -m pytest -x
```

### 11.6 Manual Smoke Test (Optional but Recommended)

Open a Python shell connected to the app DB and manually create an experiment to verify the full chain:

```python
import uuid
from datetime import datetime, timezone
from app.models.toby import TobyExperiment

exp = TobyExperiment(
    id=str(uuid.uuid4()),
    user_id="test-user",
    content_type="reel",
    dimension="personality",
    options=["edu_calm", "provoc"],
    results={},
    status="active",
    min_samples=5,
    hypothesis="edu_calm outperforms provoc for health content",
    expected_effect_size=0.3,
)
# Verify all attributes
assert exp.id is not None
assert exp.hypothesis == "edu_calm outperforms provoc for health content"
assert exp.expected_effect_size == 0.3
print("Smoke test passed!")
```

### 11.7 Post-Deploy Monitoring

After deploying, watch Railway logs for:

```bash
railway logs --filter "experiment"
```

Expected log entries after the next deliberation loop (within 24h):
- `[TOBY] Experiment design failed for ...` → Bug NOT fixed (should not appear)
- Activity log entry: `experiment_designed` → Bug IS fixed

Query the DB directly:
```sql
SELECT id, dimension, status, hypothesis, started_at
FROM toby_experiments
WHERE started_at > NOW() - INTERVAL '2 days'
ORDER BY started_at DESC;
```

---

## 12. File Reference Map

### Files to Modify

| File | Line(s) | What to Change | Bug # |
|------|---------|----------------|-------|
| `app/models/toby.py` | After line 106 | Add 4 column declarations | #2 |
| `app/models/toby.py` | Lines 113-126 | Add 4 fields to `to_dict()` | #2 |
| `app/services/toby/agents/experiment_designer.py` | Line 7 | Add `import uuid` | #1 |
| `app/services/toby/agents/experiment_designer.py` | Line 13 | Add `TobyContentTag` to import | #4 |
| `app/services/toby/agents/experiment_designer.py` | Lines 83-94 | Add guard + fix constructor | #1, #3 |
| `app/services/toby/agents/experiment_designer.py` | Lines 186-191 | Fix completion flow | #5 |
| `app/services/toby/agents/pattern_analyzer.py` | Line 9 | Add `import uuid` | #1 |
| `app/services/toby/agents/pattern_analyzer.py` | Lines 287-297 | Fix constructor | #1 |
| `app/services/toby/agents/pattern_analyzer.py` | Before line 274 | Add J4 guard (`len(options) < 2`) | #3 |
| `app/api/toby/routes.py` | Lines 310-326 | Transform response shape | #6 |
| `app/services/toby/orchestrator.py` | After line 254 | Add `"post"` experiment call | Level-up |
| `app/services/toby/learning_engine.py` | Line 29 | `COLD_START_THRESHOLD = 5` | Level-up |

### Files to Read (for Context, Don't Modify)

| File | Why |
|------|-----|
| `app/services/toby/learning_engine.py:510-557` | Reference: `create_experiment()` — the working implementation |
| `app/services/toby/learning_engine.py:411-463` | Reference: `update_experiment_results()` — how results are tracked |
| `app/services/toby/learning_engine.py:465-507` | Reference: `check_experiment_timeouts()` — 21-day force-complete |
| `app/services/toby/orchestrator.py:241-262` | Context: The deliberation loop that triggers experiment creation |
| `app/services/toby/state.py:21-49` | Context: `compute_learning_confidence()` — why pattern recognition is at 22% |
| `src/features/toby/components/TobyExperiments.tsx` | Context: Frontend component that displays experiments |
| `src/features/toby/types.ts:163-179` | Context: Frontend type definition for experiments |
| `migrations/toby_v3_cognitive.sql:247-251` | Context: The migration that added the 4 columns |

---

## 13. Appendix: What You Should See Yourself

Before implementing, verify these things independently:

### A. Confirm the Bug in Logs

Check Railway production logs for experiment-related error messages:

```bash
railway logs --filter "Experiment design failed"
railway logs --filter "Pattern analysis failed"
```

You should see PostgreSQL errors about NULL primary keys. If the deliberation loop has run at least once, these errors will be in the logs.

### B. Confirm No Experiments Exist

```sql
SELECT COUNT(*) FROM toby_experiments;
-- Expected: 0

SELECT * FROM toby_experiments ORDER BY started_at DESC LIMIT 5;
-- Expected: empty result
```

### C. Confirm the Deliberation Loop Has Run

```sql
SELECT last_deliberation_at, last_analysis_at, phase, enabled
FROM toby_state
WHERE user_id = '<your-user-id>';
```

If `last_deliberation_at` is NOT NULL, the deliberation loop ran but experiment creation failed silently.

### D. Confirm the Migration Columns

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'toby_experiments'
ORDER BY ordinal_position;
```

Expected: you should see `hypothesis`, `expected_effect_size`, `achieved_significance`, `p_value` columns.

### E. Validate the Fix Works

After implementing, you can force-trigger the deliberation loop by temporarily resetting `last_deliberation_at`:

```sql
-- DO NOT run this in production unless you're actively monitoring!
-- This forces the next tick to trigger the deliberation loop.
UPDATE toby_state
SET last_deliberation_at = NULL
WHERE user_id = '<your-user-id>';
```

Then monitor logs for `experiment_designed` activity entries.

### F. Cross-Reference `create_experiment()` as the Gold Standard

The function `create_experiment()` at `learning_engine.py:510-557` is the ONLY experiment creation path that works correctly. Use it as your reference implementation when fixing the other two paths. Every field it sets, the other paths should also set.

---

## Summary

The experiment system is architecturally sound — Thompson Sampling, Welch's t-test, sequential testing, timeout protection, cold-start handling — all well-designed. The bug is a simple missing line (`id=str(uuid.uuid4())`) in two functions, compounded by 5 secondary issues. Fixing all 7 bugs and implementing the 2 improvements will:

1. **Unblock experiments** — the counter will start moving
2. **Persist experiment metadata** — hypotheses, significance, p-values will be saved
3. **Prevent duplicates** — guard against LLM suggesting already-tested dimensions
4. **Fix the frontend** — experiments will display correctly
5. **Accelerate learning** — post experiments + lower cold-start threshold
6. **Maintain zero data loss** — all changes are purely additive

Expected timeline for impact: Within 24-48 hours of deployment, the first experiments should appear. Within 2-3 weeks, completed experiments will materially increase pattern recognition from 22% toward 40%+.
