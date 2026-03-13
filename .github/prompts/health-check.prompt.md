---
mode: "agent"
description: "Run health check, diagnose failures, and fix them. Use after any pipeline, rendering, or import change."
tools: ["codebase", "terminal", "editFiles"]
---

# Health Check — Diagnose & Fix

Run the pipeline health check, interpret failures, and apply fixes.

## Steps

1. **Run health check:**
   ```bash
   python scripts/health_check.py
   ```

2. **If all pass:** Report summary and exit.

3. **If any fail:** For each failing check:
   - Read the check function in `scripts/health_check.py` to understand what it validates
   - Identify the root cause (missing method, broken import, wrong dimensions, etc.)
   - Apply the minimal fix to the source file
   - Re-run the health check to confirm the fix

4. **After all fixes:** Run the full validation suite:
   ```bash
   python scripts/validate_api.py --imports
   python scripts/health_check.py
   npm run build
   ```

## Check Reference

| Check | What it validates | Common fix |
|-------|-------------------|------------|
| 1 | Font files exist | Restore missing font to assets/fonts/ |
| 2 | FFmpeg binary | Install FFmpeg or add to PATH |
| 3 | CarouselSlideRenderer methods | Fix method name or add missing method |
| 4 | Carousel rendering | Fix render_carousel_images() or its dependencies |
| 5 | Output image dimensions | Fix W/H constants in carousel_slide_renderer.py |
| 6 | Slide count parity | Fix render_all() slide output logic |
| 7 | ContentGeneratorV2 methods | Fix generator.py exports |
| 8 | PromptContext fields | Align PromptContext dataclass with NicheConfig |
| 9 | unified_generator signatures | Fix function signatures (user_id, brand_id) |
| 10 | VARIANT_PROCESSORS | Add missing method to JobProcessor |
| 11 | music_picker exports | Fix music_picker.py function exports |
| 12 | SocialPublisher methods | Add missing publish method to social_publisher.py |
| 13 | db_connection exports | Fix SessionLocal/get_db/get_db_session |
| 14 | DatabaseSchedulerService | Fix scheduler.py method surface |
| 15 | SUPPORTED_PLATFORMS | Sync platforms.py tuple with frozenset |
| 16 | VideoGenerator + FFmpeg | Fix video_generator.py or ffmpeg utils |
| 17 | Toby orchestrator chain | Fix broken import in Toby agent chain |
| 18 | Brand services | Fix brand_resolver or brand_manager |
