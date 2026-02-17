"""
Supabase Storage helper – thin wrapper around the Supabase Storage REST API.

Uses raw HTTP requests via `requests` so there is no dependency on `supabase-py`.
Supabase is the SOLE storage backend – no local filesystem fallbacks.
Thread-safe: no global mutable state; credentials are read per-call.
"""

import logging
import mimetypes
import os
from pathlib import Path
from typing import Optional

import requests

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------

class StorageError(Exception):
    """Raised when a Supabase Storage operation fails."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_credentials() -> tuple[str, str]:
    """Return (SUPABASE_URL, SUPABASE_SERVICE_KEY) from the environment.

    Raises ``StorageError`` if either value is missing.
    """
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise StorageError(
            "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment"
        )
    return url, key


def _headers(key: str, content_type: Optional[str] = None, upsert: bool = False) -> dict:
    h: dict[str, str] = {"Authorization": f"Bearer {key}", "apikey": key}
    if content_type:
        h["Content-Type"] = content_type
    if upsert:
        h["x-upsert"] = "true"
    return h


def _guess_content_type(path: str) -> str:
    ct, _ = mimetypes.guess_type(path)
    return ct or "application/octet-stream"


# Set of bucket names already verified to exist (once per process lifetime)
_verified_buckets: set[str] = set()


def _ensure_bucket(bucket: str) -> None:
    """Ensure *bucket* exists in Supabase Storage, creating it if needed.

    Results are cached in ``_verified_buckets`` so each bucket is checked at
    most once per process lifetime.  Errors are logged but never raised —
    the subsequent upload call will surface the real failure.
    """
    if bucket in _verified_buckets:
        return

    try:
        url, key = _get_credentials()
    except StorageError:
        return  # credentials missing — let upload_file raise later

    headers = {"Authorization": f"Bearer {key}", "apikey": key}

    # Check whether the bucket already exists
    try:
        resp = requests.get(
            f"{url}/storage/v1/bucket/{bucket}",
            headers=headers,
            timeout=15,
        )
        if resp.status_code == 200:
            _verified_buckets.add(bucket)
            return
    except requests.RequestException as exc:
        logger.warning("Bucket check for '%s' failed: %s", bucket, exc)
        return

    # Bucket does not exist — try to create it
    try:
        resp = requests.post(
            f"{url}/storage/v1/bucket",
            headers={**headers, "Content-Type": "application/json"},
            json={"id": bucket, "name": bucket, "public": True},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            logger.info("Created storage bucket '%s'", bucket)
            _verified_buckets.add(bucket)
        else:
            logger.warning(
                "Failed to create bucket '%s': HTTP %s — %s",
                bucket, resp.status_code, resp.text[:300],
            )
    except requests.RequestException as exc:
        logger.warning("Bucket creation for '%s' failed: %s", bucket, exc)


# ---------------------------------------------------------------------------
# Path helper
# ---------------------------------------------------------------------------

def storage_path(
    user_id: str,
    brand_slug: Optional[str],
    category: str,
    filename: str,
) -> str:
    """Build a user-scoped storage path.

    >>> storage_path("abc-123", "healthycollege", "thumbnails", "REL_thumb.png")
    'abc-123/healthycollege/thumbnails/REL_thumb.png'
    >>> storage_path("abc-123", None, "feedback", "fb.png")
    'abc-123/feedback/fb.png'
    """
    parts = [user_id]
    if brand_slug:
        parts.append(brand_slug)
    parts.extend([category, filename])
    return "/".join(parts)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def upload_file(
    bucket: str,
    path: str,
    file_data: bytes,
    content_type: Optional[str] = None,
) -> str:
    """Upload bytes to Supabase Storage. Returns the public URL.

    Raises ``StorageError`` on failure.
    """
    _ensure_bucket(bucket)
    url, key = _get_credentials()
    ct = content_type or _guess_content_type(path)
    endpoint = f"{url}/storage/v1/object/{bucket}/{path}"

    try:
        resp = requests.post(
            endpoint,
            headers=_headers(key, content_type=ct, upsert=True),
            data=file_data,
            timeout=120,
        )
        resp.raise_for_status()
        return get_public_url(bucket, path)
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        body = exc.response.text[:500] if exc.response is not None else "no response"
        raise StorageError(
            f"Failed to upload {bucket}/{path}: HTTP {status} — {body}"
        ) from exc
    except requests.RequestException as exc:
        raise StorageError(f"Failed to upload {bucket}/{path}: {exc}") from exc


def upload_bytes(
    bucket: str,
    remote_path: str,
    data: bytes,
    content_type: str,
) -> str:
    """Upload raw bytes directly. Returns the public URL.

    Raises ``StorageError`` on failure.
    """
    _ensure_bucket(bucket)
    return upload_file(bucket, remote_path, data, content_type=content_type)


def upload_from_path(bucket: str, remote_path: str, local_path: str) -> str:
    """Read a local file and upload it. Returns the public URL.

    Raises ``StorageError`` on failure (including missing local file).
    """
    abs_path = Path(local_path)
    if not abs_path.is_file():
        raise StorageError(f"Local file not found: {local_path}")

    file_data = abs_path.read_bytes()
    ct = _guess_content_type(local_path)
    return upload_file(bucket, remote_path, file_data, content_type=ct)


def delete_file(bucket: str, path: str) -> bool:
    """Delete a file from Supabase Storage. Returns True on success."""
    url, key = _get_credentials()
    endpoint = f"{url}/storage/v1/object/{bucket}/{path}"

    try:
        resp = requests.delete(
            endpoint,
            headers=_headers(key),
            timeout=30,
        )
        resp.raise_for_status()
        return True
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        body = exc.response.text[:500] if exc.response is not None else "no response"
        logger.error("Failed to delete %s/%s: HTTP %s — %s", bucket, path, status, body)
        return False
    except requests.RequestException as exc:
        logger.exception("Failed to delete %s/%s from Supabase Storage: %s", bucket, path, exc)
        return False


def get_public_url(bucket: str, path: str) -> str:
    """Build the public URL for an object (no network call)."""
    url, _ = _get_credentials()
    return f"{url}/storage/v1/object/public/{bucket}/{path}"


def download_file(bucket: str, path: str) -> bytes:
    """Download a file's contents from Supabase Storage.

    Raises ``StorageError`` on failure.
    """
    url, key = _get_credentials()
    endpoint = f"{url}/storage/v1/object/{bucket}/{path}"

    try:
        resp = requests.get(
            endpoint,
            headers=_headers(key),
            timeout=60,
        )
        resp.raise_for_status()
        return resp.content
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        body = exc.response.text[:500] if exc.response is not None else "no response"
        raise StorageError(
            f"Failed to download {bucket}/{path}: HTTP {status} — {body}"
        ) from exc
    except requests.RequestException as exc:
        raise StorageError(f"Failed to download {bucket}/{path}: {exc}") from exc


def file_exists(bucket: str, path: str) -> bool:
    """Check whether a file exists in Supabase Storage (HEAD request)."""
    url, key = _get_credentials()
    endpoint = f"{url}/storage/v1/object/{bucket}/{path}"

    try:
        resp = requests.head(
            endpoint,
            headers=_headers(key),
            timeout=15,
        )
        return resp.status_code == 200
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        logger.error("Failed to check existence of %s/%s: HTTP %s", bucket, path, status)
        return False
    except requests.RequestException as exc:
        logger.exception("Failed to check existence of %s/%s: %s", bucket, path, exc)
        return False


def list_files(bucket: str, prefix: str) -> list[dict]:
    """List files under a prefix in Supabase Storage.

    Returns a list of dicts with file metadata as returned by the API.
    Raises ``StorageError`` on failure.
    """
    url, key = _get_credentials()
    endpoint = f"{url}/storage/v1/object/list/{bucket}"

    # Split prefix into the folder path and an empty search string
    # so Supabase lists everything under that folder.
    try:
        resp = requests.post(
            endpoint,
            headers=_headers(key, content_type="application/json"),
            json={"prefix": prefix, "limit": 1000},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else "unknown"
        body = exc.response.text[:500] if exc.response is not None else "no response"
        raise StorageError(
            f"Failed to list files in {bucket}/{prefix}: HTTP {status} — {body}"
        ) from exc
    except requests.RequestException as exc:
        raise StorageError(f"Failed to list files in {bucket}/{prefix}: {exc}") from exc
