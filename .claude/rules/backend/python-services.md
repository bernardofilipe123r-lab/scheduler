---
paths:
  - "app/services/**/*.py"
---

## Service Layer Conventions

### Architecture
- Services contain business logic — routes are thin wrappers that call services
- Services are organized by domain: `app/services/{domain}/`
- Each service module handles one concern (e.g., `job_processor.py`, `social_publisher.py`)

### Toby Agent System (`app/services/toby/`)
- **Orchestrator** (`orchestrator.py`): 5-minute APScheduler tick loop, entry point for all agent work
- **Agents** (`agents/`): Specialized agents — analyst, creator, critic, scout, strategist, publisher, etc.
- **Memory** (`memory/`): Episodic, semantic, procedural, and world_model subsystems
- **State** (`state.py`): Toby's persistent state machine, stored in PostgreSQL
- Each agent receives a brand context and operates within that brand's Content DNA

### Content Pipeline
1. `content/generator.py` → AI content generation via DeepSeek
2. `content/differentiator.py` → Brand-specific content adaptation
3. `media/carousel_renderer.py` → Pillow-based image rendering
4. `media/video_generator.py` → FFmpeg/MoviePy video composition
5. `media/caption_builder.py` → Platform-specific caption formatting
6. `publishing/social_publisher.py` → Multi-platform publishing

### Database Access in Services
- Use SQLAlchemy sessions via `get_db()` dependency or context manager
- Always scope queries by `user_id` and `brand_id` — never fetch unscoped data
- Commit explicitly after mutations — don't rely on autocommit

### AI Integration
- Primary AI: DeepSeek via OpenAI-compatible client (`openai` package)
- Prompt templates: `app/core/prompt_templates.py`
- Prompt context (Content DNA): `app/core/prompt_context.py`
- Quality scoring: `app/core/quality_scorer.py` (5 dimensions, min 80 to publish)
- Viral patterns: `app/core/viral_patterns.py` (59 trained archetypes)
