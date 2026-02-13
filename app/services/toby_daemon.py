"""
Toby compatibility — redirects toby_log() to Maestro's unified log.

All other TobyDaemon functionality has been removed (replaced by MaestroDaemon).
"""


def toby_log(action: str, detail: str = "", emoji: str = "🤖", level: str = "detail"):
    """Log to Maestro's activity feed. Legacy bridge kept for metrics_collector and trend_scout."""
    try:
        from app.services.maestro import maestro_log
        maestro_log("toby", action, detail, emoji, level)
    except Exception:
        print(f"   [TOBY-LOG] {action} — {detail}", flush=True)
