# Maestro → Post Pipeline: Complete Analysis

## Executive Summary

The Maestro system has **three generations of code** running simultaneously, with massive duplication and unnecessary complexity. The post creation pipeline goes through 4-5 layers of abstraction that largely duplicate what `JobManager.create_job()` + `JobManager.process_job()` already does.

---

## 1. File-by-File Analysis

### 1.1 `maestro.py` — The Current Orchestrator (v2)

**Role:** The active orchestrator that runs the daily burst, scheduling, healing, evolution, diagnostics, and bootstrap cycles.

**How it creates posts:**
- During `_run_daily_burst()`, Phase 2 generates `POSTS_PER_BRAND = 2` posts per brand per day
- Calls `agent.run(max_proposals=ppb, content_type="post", brand=brand)` on each `GenericAgent`
- The agent call returns proposal dicts → each gets examined by `maestro_examiner.py`
- Accepted proposals go through `_create_and_dispatch_job()`:
  ```python
  variant = "post"
  platforms = ["instagram", "facebook"]
  job = manager.create_job(user_id=proposal_id, title=title,
      content_lines=slide_texts if is_post and slide_texts else content_lines,
      brands=[brand], variant=variant, ai_prompt=image_prompt, ...)
  ```
- Then processed in a background thread via `_process_and_schedule_job()` → `JobManager.process_job()`

**AI Model:** Agents call DeepSeek (`deepseek-chat`) via `generic_agent.py`, `toby_agent.py`, or `lexi_agent.py`.

**Proposal → Job flow:**
1. Agent generates proposal → saved to `TobyProposal` table as `status="pending"`
2. `_auto_accept_and_process()` runs examiner quality gate (`examine_proposal()`)
3. If passed: proposal `status="accepted"`, create `GenerationJob` via `JobManager.create_job()`
4. Process job in background thread (generates video/images/carousel)
5. `auto_schedule_job()` schedules to publishing queue

**Key observation:** Maestro creates jobs for **one brand at a time** (each proposal is brand-specific). This is NOT how the manual `/jobs/create` flow works (that accepts multiple brands per job).

---

### 1.2 `maestro_old_backup.py` — The Legacy Orchestrator (v1)

**Role:** The original Maestro, now a dead backup. Used a 4-phase rotation instead of daily burst.

**Key differences from current:**
| Feature | Old (v1) | Current (v2) |
|---------|----------|--------------|
| Generation pattern | 45-min cycles, 4-phase rotation (Toby reel → Lexi reel → Toby post → Lexi post) | Once-daily burst at 12PM Lisbon |
| Agents | Hardcoded Toby + Lexi | Dynamic agents from DB via `GenericAgent` |
| Brands per job | **ALL 5 brands per job** (`brands=ALL_BRANDS`) | **1 brand per job** |
| Quality gate | None — auto-accept all proposals immediately | Maestro Examiner (DeepSeek scoring, 6.0+ threshold) |
| Pause/Resume | Always running, never pauses | DB-persisted pause state |
| Healing/Evolution | None | Full healing cycle (every 15min), weekly evolution |
| Post variant | `variant = "post" if content_type == "post" else "dark"` | Same |
| Daily limit | 30 proposals/day | Dynamic: 6 reels + 2 posts per brand = 40 total |

**Critical legacy pattern still referenced:** The old `_auto_accept_proposals()` created one job for ALL 5 brands. This meant 1 proposal → 5 brand variations from 1 job. The new Maestro creates 1 proposal → 1 brand → 1 job, meaning 5× more jobs per batch.

---

### 1.3 `maestro_examiner.py` — Quality Gate

**Role:** Scores every AI-generated proposal before it becomes a job. Uses DeepSeek to evaluate across 3 dimensions.

**AI Model:** DeepSeek (`deepseek-chat`), temperature 0.3, max_tokens 500.

**Scoring:**
- `avatar_fit` (35%) — Is this for women 45+?
- `engagement_potential` (35%) — Will it go viral?
- `content_quality` (30%) — Is the advice sound?

**Thresholds:**
- ≥ 6.0 → ACCEPT
- 4.5–5.9 → REJECT (gray zone)
- < 4.5 → HARD REJECT

**Failsafe:** If DeepSeek API fails, the proposal auto-passes with a 7.0 score. This means the quality gate is effectively optional.

**Duplication:** This is an entirely extra AI call that does NOT exist in the `/jobs/create` flow. A user creating content manually never gets their content scored by the examiner.

---

### 1.4 `lexi_agent.py` — The Lexi (Legacy) Agent

**Role:** Data-driven content optimizer. One of the two original hardcoded agents.

**How it creates posts:**
- `run(content_type="post")` → `_strategy_post_analyze()` or `_strategy_post_refine()`
- Calls DeepSeek directly (`deepseek-chat`, temp=0.75, max_tokens=2500 for posts)
- Parses JSON response → saves `TobyProposal` with `agent_name="lexi"`, `variant="light"`, `content_type="post"`
- Returns proposal dicts back to Maestro for examination

**Prompt structure:**
- System prompt: `LEXI_POST_SYSTEM_PROMPT` (hardcoded, ~80 lines)
- User prompt: strategy-specific with topic, avoidance list, brand handle injection

**Duplication:**
- Nearly identical `_call_ai_and_save()` method as `toby_agent.py` (same parsing, same DB save)
- Nearly identical `_gather_intelligence()` method 
- Same `_plan_strategies()` pattern with different weights
- Same `_parse_json()` utility method
- All of this is ALSO duplicated in `generic_agent.py`

---

### 1.5 `toby_agent.py` — The Toby (Legacy) Agent

**Role:** Creative risk-taker agent. The original and first agent.

**How it creates posts:**
- `run(content_type="post")` → Routes ALL strategies to `_strategy_post_explore()` (except trending)
  - No iterate, no double_down for posts — all fall through to explore
- Same DeepSeek call as Lexi (temp=0.9 instead of 0.75)
- Saves `TobyProposal` with `agent_name="toby"`, `variant="dark"`

**Post-specific quirk:** For posts, 3 out of 4 strategies (iterate, double_down, explore) all call `_strategy_post_explore()`. Only `trending` calls `_strategy_post_trending()`. This means the strategy system is mostly theater for posts.

**Duplication:**
- `_call_ai_and_save()` is ~95% identical to Lexi's
- `_gather_intelligence()` is ~95% identical to Lexi's  
- `_parse_json()` is 100% identical to Lexi's
- `_generate_proposal_id()` is 100% identical to Lexi's (just different prefix)
- `accept_proposal()` and `reject_proposal()` exist here but are NOT used by current Maestro (v2 handles acceptance in `_auto_accept_and_process`)

---

### 1.6 `toby_daemon.py` — The Toby Daemon (Legacy)

**Role:** The original standalone daemon that ran Toby independently. **Now mostly dead code.**

**Current status:**
- The `TobyDaemon` class is still instantiated (singleton `_daemon`)
- `toby_log()` function is actively used as a logging bridge → redirects to `maestro_log()`
- The THINK, OBSERVE, SCOUT cycles are vestigial — Maestro runs its own versions

**Duplication:**
- `_think_cycle()` duplicates Maestro's burst logic (generate → auto-accept → process)
- `_observe_cycle()` duplicates Maestro's observe cycle
- `_scout_cycle()` duplicates Maestro's scout cycle
- `TobyState` class is a simpler version of `MaestroState`

**The only active function:** `toby_log()` — a redirect function used by `toby_agent.py`.

---

### 1.7 `generic_agent.py` — The Dynamic Agent

**Role:** DB-driven replacement for Toby/Lexi. Each instance is parameterized from `AIAgent` DB model.

**How it creates posts:**
- `run(content_type="post")` → `_generic_strategy()` → one of 4 prompt builders
- Same DeepSeek call pattern as Toby/Lexi but with dynamic temperature and personality
- System prompt built from templates (`POST_SYSTEM_PROMPT_TEMPLATE`), injecting `{name}` and `{personality}`
- Results saved to `TobyProposal` with `agent_name=self.agent_id`

**This is the ACTIVE path for current Maestro (v2):** `get_all_active_agents()` returns `GenericAgent` instances, not `TobyAgent`/`LexiAgent`.

**Duplication:**
- `_call_ai_and_save()` is the 3rd copy of the same pattern (after Toby, Lexi)
- `_gather_intelligence()` is the 3rd copy (with extra cross-brand + evolution data)
- `_parse_json()` is the 3rd copy (identical)
- `_generate_proposal_id()` is the 3rd copy

**Extra features over Toby/Lexi:**
- Cross-brand portfolio intelligence
- Own account top performers
- Per-agent evolution lessons
- Dynamic personality and temperature from DB
- Randomized DNA with `_randomize_dna()`

---

### 1.8 `maestro_routes.py` — Maestro API Endpoints

**Role:** FastAPI router for Maestro's web API.

**Post-relevant endpoints:**
- `POST /api/maestro/proposals/{id}/accept` — Manual acceptance (creates jobs)
- `POST /api/maestro/trigger-burst` — Triggers smart burst
- `POST /api/maestro/optimize-now` — Triggers Toby×10 + Lexi×10

**`accept_proposal` endpoint logic:**
This endpoint has its OWN job creation logic, separate from Maestro's `_create_and_dispatch_job`:
```python
# Determine brand and variant from proposal
if proposal_brand:
    brands = [proposal_brand]
else:
    brands = ALL_BRANDS  # Legacy fallback

for variant in variants:
    job = manager.create_job(...)
```
This is a 2nd copy of proposal→job creation logic that diverges from Maestro's internal path.

**`optimize-now` endpoint:**
Calls legacy `TobyAgent` and `LexiAgent` directly (NOT `GenericAgent`), generating 5 reels + 5 posts per agent = 20 proposals. These are NOT auto-accepted or auto-processed — they just sit as pending proposals.

---

### 1.9 `toby_routes.py` — Toby API Endpoints (Legacy)

**Role:** Legacy API for the original Toby daemon.

**Post-relevant:**
- `POST /api/toby/proposals/{id}/accept` — Uses `TobyAgent.accept_proposal()`, which just marks proposal as accepted and returns data. Does NOT create a job or process anything.
- This is completely different from `maestro_routes.py`'s accept which creates jobs.

**The Toby routes are vestigial** — the Maestro routes supersede all functionality.

---

### 1.10 `agents_routes.py` — Agent CRUD API

**Role:** CRUD for managing dynamic AI agents (create, update, delete, mutate, clone, retire).

**Post-relevant:** Only indirectly — agents created here will participate in the daily burst.

**No duplication issues** — this is a clean CRUD layer.

---

## 2. How Maestro Decides Post vs Reel

In the current v2 Maestro (`_run_daily_burst()`):

```
Phase 1: REEL proposals
  for each brand:
    distribute PROPOSALS_PER_BRAND_PER_AGENT (6) across agents round-robin
    agent.run(content_type="reel", brand=brand)

Phase 2: POST proposals  
  for each brand:
    distribute POSTS_PER_BRAND (2) across agents round-robin
    agent.run(content_type="post", brand=brand)
```

The reel/post decision is made **at the Maestro level**, not by the agents. Agents receive `content_type` as a parameter and just follow instructions.

**Constants:**
- `PROPOSALS_PER_BRAND_PER_AGENT = 6` → 6 reels per brand per day (30 total)
- `POSTS_PER_BRAND = 2` → 2 posts per brand per day (10 total)
- Total daily: 40 proposals

---

## 3. What is a TobyProposal? How Does It Become a GenerationJob?

### TobyProposal (DB model):
A proposal is the AI-generated content idea that has NOT been turned into actual visual content yet. It contains:
- `title`, `content_lines`, `slide_texts`, `image_prompt`, `caption`
- `brand` — which brand this is for
- `content_type` — "reel" or "post"
- `variant` — "dark", "light", or "post"
- `agent_name` — which AI agent created it
- `strategy` — which strategy generated it (explore, trending, etc.)
- `status` — "pending", "accepted", "rejected"
- `examiner_score`, `examiner_verdict` — quality gate results

### Proposal → Job flow in current Maestro:

```
1. Agent.run() → DeepSeek API call → parse JSON → save TobyProposal (status=pending)
                                                         ↓
2. _auto_accept_and_process() iterates proposals
                                                         ↓
3. examine_proposal() → DeepSeek API call (scoring)
                                                         ↓
4a. Score >= 6.0 → proposal.status = "accepted"
4b. Score < 6.0  → proposal.status = "rejected" → _regenerate_replacement()
                                                         ↓
5. _create_and_dispatch_job() → JobManager.create_job()
   Creates GenerationJob with:
   - user_id = proposal_id
   - brands = [single_brand]
   - variant = "post" (for posts)
   - content_lines = slide_texts (for posts)
                                                         ↓
6. Background thread → JobManager.process_job()
   This is where actual content generation happens:
   - Image generation
   - Video creation (for reels)
   - Carousel image rendering (for posts)
   - Thumbnail creation
                                                         ↓
7. auto_schedule_job() → DatabaseSchedulerService
   Find next available slot → create ScheduledReel entry
```

---

## 4. Extra Processing Maestro Does vs Automatic Flow

### What `/jobs/create` (automatic flow) does:
1. `JobManager.create_job()` — creates GenerationJob
2. `JobManager.process_job()` — generates content
3. Done. No scheduling, no examination, no proposals.

### What Maestro adds:
| Extra Step | Purpose | Necessary? |
|------------|---------|------------|
| AI proposal generation | Creates content idea via DeepSeek | YES — this is the creative brain |
| Examiner quality gate | Scores proposals via 2nd DeepSeek call | QUESTIONABLE — auto-passes on API failure |
| Proposal DB storage | `TobyProposal` table tracking | USEFUL for audit/history |
| Rejection + regeneration | Replaces bad proposals | USEFUL but adds latency |
| Semaphore rate limiting | `MAX_CONCURRENT_JOBS = 3` | YES — prevents resource exhaustion |
| Job stagger delay | 8-second delay between launches | YES — Railway resource management |
| Auto-scheduling | `auto_schedule_job()` → slot allocation | YES — publishing automation |
| Healing cycle | Detect stuck/failed jobs, auto-retry | YES — reliability |
| Evolution cycle | Weekly agent DNA mutation | OPTIONAL — evolutionary optimization |
| Bootstrap cycle | Cold-start research gathering | ONE-TIME — auto-disables |

---

## 5. Where Maestro Diverges Unnecessarily

### 5.1 — Three Copies of Agent Code
`toby_agent.py`, `lexi_agent.py`, and `generic_agent.py` all contain nearly identical:
- `_call_ai_and_save()` (~100 lines each)
- `_gather_intelligence()` (~60 lines each)
- `_parse_json()` (~20 lines each)
- `_generate_proposal_id()` (~10 lines each)
- Strategy planning logic (~40 lines each)

**Total duplicated code: ~700+ lines across 3 files.**

`generic_agent.py` is the active path. Toby and Lexi are only used by:
- Legacy fallback in `_run_daily_burst()` when `active_agents` is empty
- `optimize-now` endpoint in `maestro_routes.py`

### 5.2 — Two Copies of Proposal→Job Acceptance
1. `maestro.py::_create_and_dispatch_job()` — used during daily burst
2. `maestro_routes.py::accept_proposal()` — used for manual UI acceptance

These have slightly different logic:
- Maestro's version: always 1 brand per job, variant from `content_type`
- Routes version: 1 brand (if proposal has brand) OR all 5 brands (legacy), variant from proposal OR both dark+light

### 5.3 — Toby Daemon is Dead Code
`toby_daemon.py` contains a full `TobyDaemon` class with THINK, OBSERVE, SCOUT cycles that are never triggered by the current system. Only `toby_log()` is used (as a redirect to `maestro_log`).

### 5.4 — Brand Handles Hardcoded in 4 Places
```python
# In maestro.py:
BRAND_HANDLES = {"healthycollege": "@thehealthycollege", ...}  

# In toby_agent.py:
BRAND_HANDLES = {"healthycollege": "@thehealthycollege", ...}

# In lexi_agent.py:
BRAND_HANDLES = {"healthycollege": "@thehealthycollege", ...}

# In generic_agent.py:
_default_handles() returns {"healthycollege": "@thehealthycollege", ...}
# (also has dynamic loading from DB)
```

### 5.5 — System Prompts Duplicated 3× (Reel) and 3× (Post)
- `toby_agent.py`: `TOBY_SYSTEM_PROMPT` + `TOBY_POST_SYSTEM_PROMPT` (~200 lines)
- `lexi_agent.py`: `LEXI_SYSTEM_PROMPT` + `LEXI_POST_SYSTEM_PROMPT` (~180 lines)
- `generic_agent.py`: `REEL_SYSTEM_PROMPT_TEMPLATE` + `POST_SYSTEM_PROMPT_TEMPLATE` (~200 lines)

These are 90% identical with only personality/name variations. `generic_agent.py` correctly templated this with `{name}` and `{personality}`.

### 5.6 — `maestro_old_backup.py` Creates Jobs for ALL 5 Brands
The old Maestro created 1 job → 5 brands. The new Maestro creates 5 jobs → 1 brand each. This is a fundamental architectural change that means:
- 5× more `GenerationJob` records per day
- 5× more `process_job()` calls
- 5× more background threads
- But better isolation (one brand failure doesn't kill others)

### 5.7 — `optimize-now` Uses Legacy Agents, Not GenericAgent
The `POST /api/maestro/optimize-now` endpoint explicitly imports and calls `TobyAgent` and `LexiAgent` instead of using `get_all_active_agents()`. This means optimize-now bypasses:
- Dynamic agent configuration from DB
- Evolution-learned DNA changes
- Agent personality customization

---

## 6. Complete Code Duplication Inventory

| Duplicated Pattern | Files | Lines (est.) |
|---|---|---|
| `_call_ai_and_save()` | toby_agent, lexi_agent, generic_agent | ~300 |
| `_gather_intelligence()` | toby_agent, lexi_agent, generic_agent | ~200 |
| `_parse_json()` | toby_agent, lexi_agent, generic_agent | ~60 |
| `_generate_proposal_id()` | toby_agent, lexi_agent, generic_agent | ~30 |
| `_plan_strategies()` | toby_agent, lexi_agent, generic_agent | ~120 |
| System prompts (reel + post) | toby_agent, lexi_agent, generic_agent | ~600 |
| `BRAND_HANDLES` dict | maestro, toby_agent, lexi_agent, generic_agent | ~25 |
| `auto_schedule_job()` | maestro (current), maestro_old_backup | ~80 |
| Observe cycle | maestro, maestro_old_backup, toby_daemon | ~50 |
| Scout cycle | maestro, maestro_old_backup, toby_daemon | ~60 |
| Proposal→Job creation | maestro `_create_and_dispatch_job`, maestro_routes `accept_proposal` | ~80 |
| **TOTAL estimated duplicated lines** | | **~1600** |

---

## 7. Recommendations

### Immediate Cleanup (Safe, Zero Behavioral Change):
1. **Delete `toby_daemon.py`** — extract `toby_log()` into a 5-line utility
2. **Delete `maestro_old_backup.py`** — purely dead code
3. **Delete `toby_agent.py` and `lexi_agent.py`** — all functionality exists in `generic_agent.py` with DB-driven agents. The only caller is `optimize-now` which should use `get_all_active_agents()`.

### Consolidation:
4. **Unify proposal→job creation** — Move the accept logic from `maestro_routes.py` into `maestro.py` to avoid divergence
5. **Single `BRAND_HANDLES` source** — Use `generic_agent._load_brand_handles()` everywhere
6. **`optimize-now` should use GenericAgent** — Not legacy Toby/Lexi

### Architectural Simplification:
7. **Consider making the Examiner optional/configurable** — It already auto-passes on API failure, which means all its value is conditional on a DeepSeek API call succeeding
8. **`toby_routes.py` can be removed** if the Maestro routes cover all needs (they do)
