"""
Bluesky (AT Protocol) token service.

Authentication via App Passwords:
  1. User creates an App Password at bsky.app/settings/app-passwords
  2. We call com.atproto.server.createSession with handle + app_password
  3. Returns accessJwt (short-lived, ~2h) + refreshJwt (longer-lived)
  4. Refresh via com.atproto.server.refreshSession when accessJwt expires
"""
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

BSKY_PDS_URL = "https://bsky.social"


class BskyTokenService:
    def __init__(self, pds_url: str = BSKY_PDS_URL):
        self.pds_url = pds_url.rstrip("/")

    def create_session(self, identifier: str, password: str) -> dict:
        """
        Create a session using handle/DID + app password.

        Args:
            identifier: Bluesky handle (e.g. 'user.bsky.social') or DID
            password: App Password (NOT the account password)

        Returns:
            dict with accessJwt, refreshJwt, did, handle
        """
        resp = httpx.post(
            f"{self.pds_url}/xrpc/com.atproto.server.createSession",
            json={"identifier": identifier, "password": password},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "accessJwt": data["accessJwt"],
            "refreshJwt": data["refreshJwt"],
            "did": data["did"],
            "handle": data["handle"],
        }

    def refresh_session(self, refresh_jwt: str) -> dict:
        """
        Refresh an expired session using the refreshJwt.

        Returns:
            dict with new accessJwt, refreshJwt, did, handle
        """
        resp = httpx.post(
            f"{self.pds_url}/xrpc/com.atproto.server.refreshSession",
            headers={"Authorization": f"Bearer {refresh_jwt}"},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "accessJwt": data["accessJwt"],
            "refreshJwt": data["refreshJwt"],
            "did": data["did"],
            "handle": data["handle"],
        }

    def resolve_handle(self, handle: str) -> Optional[str]:
        """Resolve a handle to a DID."""
        try:
            resp = httpx.get(
                f"{self.pds_url}/xrpc/com.atproto.identity.resolveHandle",
                params={"handle": handle},
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json().get("did")
        except Exception as e:
            logger.warning(f"Failed to resolve handle {handle}: {e}")
            return None

    def upload_blob(self, access_jwt: str, data: bytes, mime_type: str) -> dict:
        """
        Upload a blob (image/video) to the PDS.

        Args:
            access_jwt: Valid access token
            data: Raw binary data
            mime_type: e.g. 'image/jpeg', 'video/mp4'

        Returns:
            Blob reference dict with $type, ref, mimeType, size
        """
        resp = httpx.post(
            f"{self.pds_url}/xrpc/com.atproto.repo.uploadBlob",
            headers={
                "Authorization": f"Bearer {access_jwt}",
                "Content-Type": mime_type,
            },
            content=data,
            timeout=120,
        )
        resp.raise_for_status()
        return resp.json()["blob"]

    def create_post(
        self,
        access_jwt: str,
        did: str,
        text: str,
        embed: Optional[dict] = None,
        facets: Optional[list] = None,
    ) -> dict:
        """
        Create a post on Bluesky.

        Args:
            access_jwt: Valid access token
            did: User's DID
            text: Post text (max 300 graphemes)
            embed: Optional embed (images, video, external link)
            facets: Optional rich text facets (links, mentions)

        Returns:
            dict with uri, cid
        """
        from datetime import datetime, timezone

        record = {
            "$type": "app.bsky.feed.post",
            "text": text,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
        if embed:
            record["embed"] = embed
        if facets:
            record["facets"] = facets

        resp = httpx.post(
            f"{self.pds_url}/xrpc/com.atproto.repo.createRecord",
            headers={"Authorization": f"Bearer {access_jwt}"},
            json={
                "repo": did,
                "collection": "app.bsky.feed.post",
                "record": record,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
