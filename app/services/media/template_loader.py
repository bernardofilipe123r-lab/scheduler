"""Template loader — fetches brand templates from Supabase Storage with local cache."""

import os
import time
import logging
from pathlib import Path
from io import BytesIO
from PIL import Image

logger = logging.getLogger(__name__)

CACHE_DIR = Path(os.environ.get("TEMPLATE_CACHE_DIR", "/tmp/brand-templates"))
BUCKET = "brand-assets"
CACHE_MAX_AGE = 24 * 60 * 60  # 24 hours in seconds


def _get_storage_client():
    """Create a Supabase storage client using service role key."""
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
    return create_client(url, key).storage


def get_template(brand_id: str, template_type: str) -> Path:
    """Return a local path to the requested template image.

    Args:
        brand_id: e.g. "healthycollege"
        template_type: "thumbnail_template" or "content_template"

    Returns:
        Path to the template PNG on the local filesystem (cached).

    Raises:
        FileNotFoundError: if the template cannot be found anywhere.
    """
    filename = f"{template_type}.png"

    # 1. Check local cache (valid for 24 h)
    cache_path = CACHE_DIR / brand_id / filename
    if cache_path.exists():
        age = time.time() - cache_path.stat().st_mtime
        if age < CACHE_MAX_AGE:
            return cache_path

    # 2. Try Supabase Storage
    storage_path = f"templates/{brand_id}/light mode/{filename}"
    try:
        storage = _get_storage_client()
        data = storage.from_(BUCKET).download(storage_path)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(data)
        logger.info("Downloaded template from storage: %s", storage_path)
        return cache_path
    except Exception as exc:
        logger.warning("Supabase download failed for %s: %s", storage_path, exc)

    # 3. Fallback to local filesystem (backward compat / dev)
    project_root = Path(__file__).resolve().parent.parent.parent
    local_path = project_root / "assets" / "templates" / brand_id / "light mode" / filename
    if local_path.exists():
        logger.info("Using local filesystem template: %s", local_path)
        return local_path

    raise FileNotFoundError(
        f"Template not found: {brand_id}/{filename} "
        "(checked Supabase Storage, local cache, and assets/templates/)"
    )


def load_template_image(brand_id: str, template_type: str) -> Image.Image:
    """Convenience wrapper — returns a PIL Image directly."""
    path = get_template(brand_id, template_type)
    return Image.open(path)
