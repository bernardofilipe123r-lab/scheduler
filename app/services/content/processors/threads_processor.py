"""Threads processor — generates thread text content (single posts or chains)."""
import sys
from typing import Dict, Any


def process_threads_brand(manager, db, job_id: str, brand: str) -> Dict[str, Any]:
    """Generate thread text content for a single brand.

    Text-only — no media rendering. Uses ThreadsGenerator to produce
    single posts or thread chains via DeepSeek.
    """
    print(f"\n🧵 process_threads_brand() — brand={brand}", flush=True)
    sys.stdout.flush()

    job = manager.get_job(job_id)
    if not job:
        return {"success": False, "error": f"Job not found: {job_id}"}

    def _update_output(data: dict):
        manager.update_brand_output(job_id, brand, data)

    _update_output({"status": "generating", "progress_message": "Generating thread content..."})

    try:
        from app.core.prompt_context import PromptContext
        from app.services.content.threads_generator import ThreadsGenerator
        from app.services.content.niche_config_service import NicheConfigService

        tg = ThreadsGenerator()

        niche_svc = NicheConfigService()
        ctx = niche_svc.get_context(user_id=job.user_id, brand_id=brand)
        if not ctx:
            ctx = PromptContext()

        is_chain = (job.cta_type or "").lower() == "chain"
        format_type = job.ai_prompt if job.ai_prompt in (
            "value_list", "controversial", "myth_bust", "thread_chain",
            "question_hook", "hot_take", "story_micro"
        ) else None
        manual_text = job.content_lines[0] if job.content_lines else None

        if manual_text:
            if is_chain and len(job.content_lines) >= 2:
                _update_output({
                    "status": "completed",
                    "caption": job.content_lines[0],
                    "is_chain": True,
                    "chain_parts": job.content_lines,
                    "format_type": "thread_chain",
                })
            else:
                _update_output({
                    "status": "completed",
                    "caption": manual_text,
                    "is_chain": False,
                    "format_type": format_type or "manual",
                })
            print(f"   ✅ {brand} manual thread content stored", flush=True)
            return {"success": True, "brand": brand}

        # Auto mode — generate via AI
        if is_chain:
            result = tg.generate_thread_chain(ctx, num_parts=6)
            if result and "parts" in result:
                _update_output({
                    "status": "completed",
                    "caption": result["parts"][0],
                    "is_chain": True,
                    "chain_parts": result["parts"],
                    "format_type": "thread_chain",
                    "topic": result.get("topic", ""),
                })
                print(f"   ✅ {brand} thread chain generated ({len(result['parts'])} parts)", flush=True)
                return {"success": True, "brand": brand}
            else:
                raise ValueError("Thread chain generation returned no results")
        else:
            result = tg.generate_single_post(ctx, format_type=format_type)
            if result and "text" in result:
                _update_output({
                    "status": "completed",
                    "caption": result["text"],
                    "is_chain": False,
                    "format_type": result.get("format_type", format_type or "auto"),
                })
                print(f"   ✅ {brand} thread post generated", flush=True)
                return {"success": True, "brand": brand}
            else:
                raise ValueError("Thread post generation returned no results")

    except Exception as e:
        import traceback
        error_msg = f"{type(e).__name__}: {str(e)}"
        print(f"   ❌ Threads generation failed: {error_msg}", flush=True)
        traceback.print_exc()
        _update_output({"status": "failed", "error": error_msg})
        return {"success": False, "error": error_msg}
