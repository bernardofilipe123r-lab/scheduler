"""Shared helpers for content processing pipeline."""
import os
import re
import tempfile
from pathlib import Path
from typing import List, Optional

from app.services.brands.resolver import brand_resolver

# CTA patterns that the AI sometimes generates despite being told not to.
_CTA_PATTERNS = [
    re.compile(r'follow.*page', re.IGNORECASE),
    re.compile(r'follow.*us', re.IGNORECASE),
    re.compile(r'follow.*for.*part', re.IGNORECASE),
    re.compile(r'follow.*for.*more', re.IGNORECASE),
    re.compile(r'follow.*our', re.IGNORECASE),
    re.compile(r'comment.*"', re.IGNORECASE),
    re.compile(r'comment.*lean', re.IGNORECASE),
    re.compile(r'comment.*plan', re.IGNORECASE),
    re.compile(r'if you want to.*(follow|improve|learn)', re.IGNORECASE),
    re.compile(r'stay tuned.*follow', re.IGNORECASE),
]

# Per-brand generation timeout (in seconds). Default: 10 minutes.
BRAND_GENERATION_TIMEOUT = int(os.getenv("BRAND_GENERATION_TIMEOUT_SECONDS", "600"))


def strip_cta_lines(lines: List[str]) -> List[str]:
    """Remove any CTA-like lines that the AI added despite prompt instructions."""
    cleaned = []
    for line in lines:
        if any(p.search(line) for p in _CTA_PATTERNS):
            print(f"   ⚠️ Stripped AI-generated CTA from content_lines: {line[:60]}...", flush=True)
            continue
        cleaned.append(line)
    return cleaned


def get_brand_type(brand_name: str) -> str:
    """Resolve brand name to canonical brand ID."""
    return brand_resolver.resolve_brand_name(brand_name) or brand_name


def download_logo_safe(url: str, label: str) -> Optional[Path]:
    """Download a logo URL to a temp file. Returns Path on success, None on failure."""
    if not url or not url.startswith("http"):
        return None
    try:
        import httpx
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.png')
        tmp.close()
        resp = httpx.get(url, timeout=15, follow_redirects=True)
        if resp.status_code == 200:
            with open(tmp.name, 'wb') as f:
                f.write(resp.content)
            print(f"   ✓ {label} downloaded: {tmp.name}", flush=True)
            return Path(tmp.name)
    except Exception as e:
        print(f"   ⚠️ {label} download failed: {e}", flush=True)
    return None
