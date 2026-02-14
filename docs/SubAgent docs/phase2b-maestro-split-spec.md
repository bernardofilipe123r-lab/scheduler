# Phase 2B: Split maestro.py into 6 modules

## Strategy: Mixin Pattern
MaestroDaemon uses Python mixins so extracted methods keep `self` semantics naturally.

## Files to Create

### 1. `app/services/maestro_state.py` (~350 lines)
Everything ABOVE class MaestroDaemon:
- All imports (os, threading, traceback, datetime, typing, zoneinfo, apscheduler)
- ALL constants: LISBON_TZ, BRAND_HANDLES, CHECK_CYCLE_MINUTES, METRICS_CYCLE_MINUTES, SCAN_CYCLE_MINUTES, FEEDBACK_CYCLE_MINUTES, HEALING_CYCLE_MINUTES, MAX_AUTO_RETRIES, EVOLUTION_DAY, EVOLUTION_HOUR, DIAGNOSTICS_CYCLE_MINUTES, BOOTSTRAP_CYCLE_MINUTES, BOOTSTRAP_MAX_DAYS, JOB_TIMEOUT_MINUTES, STARTUP_DELAY_SECONDS, MAX_CONCURRENT_JOBS, JOB_STAGGER_DELAY, _job_semaphore, PROPOSALS_PER_BRAND_PER_AGENT, POSTS_PER_BRAND
- Functions: _get_all_brands(), _get_all_brands_list(), ALL_BRANDS
- DB helpers: _db_get(), _db_set()
- Pause/resume: is_paused(), set_paused(), is_posts_paused(), set_posts_paused()
- Daily run: get_last_daily_run(), set_last_daily_run()
- Classes: AgentState, MaestroState (with all methods)
- Helpers: _format_uptime(), _time_ago()

### 2. `app/services/maestro_cycles.py` (~500 lines)
A mixin class `CyclesMixin` with methods:
- `_observe_cycle(self)`
- `_scout_cycle(self)`
- `_bootstrap_cycle(self)`
- `_stop_bootstrap_scheduler(self)`
- `_feedback_cycle(self)`
- `_evolution_cycle(self)`
- `_diagnostics_cycle(self)`

Imports from maestro_state: _db_get, _db_set, BOOTSTRAP_CYCLE_MINUTES, BOOTSTRAP_MAX_DAYS, DIAGNOSTICS_CYCLE_MINUTES, EVOLUTION_DAY, EVOLUTION_HOUR

### 3. `app/services/maestro_healing.py` (~350 lines)
A mixin class `HealingMixin` with methods:
- `_healing_cycle(self)` - includes the POPULATION GUARD at the end
- `_diagnose_failure(self, job) -> Dict`
- `_get_retry_count(self, job, db) -> int`
- `_retry_failed_job(self, job, proposal, current_retry, db) -> bool`

Imports from maestro_state: JOB_TIMEOUT_MINUTES, MAX_AUTO_RETRIES, JOB_STAGGER_DELAY

### 4. `app/services/maestro_proposals.py` (~400 lines)
A mixin class `ProposalsMixin` with methods:
- `_auto_accept_and_process(self, proposals)`
- `_examine_and_process_single(self, p_dict, proposal_id, examine_fn, retry_count, max_retries, stats)`
- `_create_and_dispatch_job(self, proposal_id, title, content_lines, slide_texts, image_prompt, agent_name, brand, proposal_variant, content_type)`
- `_regenerate_replacement(self, original_proposal_id, agent_name, content_type, brand, strategy, rejection_reason, examine_fn, retry_count, max_retries)`
- `_process_and_schedule_job(self, job_id, proposal_id, agent_name)`

Imports from maestro_state: _job_semaphore, JOB_STAGGER_DELAY
Imports: auto_schedule_job from maestro_scheduler_logic

### 5. `app/services/maestro_scheduler_logic.py` (~300 lines)
Standalone functions (NOT a mixin):
- `auto_schedule_job(job_id: str)`
- `schedule_all_ready_reels() -> int`

### 6. `app/services/maestro.py` (reduced to ~400 lines)
```python
from app.services.maestro_state import (
    # Re-export everything that external code imports
    MaestroState, AgentState,
    LISBON_TZ, BRAND_HANDLES,
    CHECK_CYCLE_MINUTES, METRICS_CYCLE_MINUTES, SCAN_CYCLE_MINUTES,
    FEEDBACK_CYCLE_MINUTES, HEALING_CYCLE_MINUTES, MAX_AUTO_RETRIES,
    EVOLUTION_DAY, EVOLUTION_HOUR, DIAGNOSTICS_CYCLE_MINUTES,
    BOOTSTRAP_CYCLE_MINUTES, BOOTSTRAP_MAX_DAYS, JOB_TIMEOUT_MINUTES,
    STARTUP_DELAY_SECONDS, MAX_CONCURRENT_JOBS, JOB_STAGGER_DELAY,
    _job_semaphore, PROPOSALS_PER_BRAND_PER_AGENT, POSTS_PER_BRAND,
    _get_all_brands, _get_all_brands_list, ALL_BRANDS,
    _db_get, _db_set,
    is_paused, set_paused, is_posts_paused, set_posts_paused,
    get_last_daily_run, set_last_daily_run,
    _format_uptime, _time_ago,
)
from app.services.maestro_scheduler_logic import auto_schedule_job, schedule_all_ready_reels
from app.services.maestro_cycles import CyclesMixin
from app.services.maestro_healing import HealingMixin
from app.services.maestro_proposals import ProposalsMixin

class MaestroDaemon(ProposalsMixin, CyclesMixin, HealingMixin):
    # __init__, start(), get_status(), _refresh_agent_counts()
    # _check_cycle(), _run_daily_burst(), trigger_burst_now(), run_smart_burst()

# Singleton: _maestro, get_maestro(), maestro_log(), start_maestro()
```

## Critical: Re-exports
maestro.py MUST re-export ALL public symbols so existing `from app.services.maestro import X` still works:
- is_paused, set_paused, is_posts_paused, set_posts_paused
- get_last_daily_run, set_last_daily_run
- auto_schedule_job, schedule_all_ready_reels
- get_maestro, maestro_log, start_maestro
- MaestroDaemon
- ALL constants

## External Imports to Verify
Check what other files import from maestro:
- maestro_routes.py: is_paused, set_paused, is_posts_paused, set_posts_paused, get_maestro, maestro_log, start_maestro
- Other files: auto_schedule_job, schedule_all_ready_reels, maestro_log
- All must keep working via `from app.services.maestro import X`
