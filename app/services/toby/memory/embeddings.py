"""
Embedding generation for Toby's semantic memory system.

Uses OpenAI's text-embedding-3-small model (1536 dimensions)
via the existing openai client configured for DeepSeek or OpenAI.
"""
import os
from typing import Optional
from openai import OpenAI

# Use OpenAI embeddings (DeepSeek doesn't have embedding endpoint)
_embedding_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    """Get or create the OpenAI client for embeddings."""
    global _embedding_client
    if _embedding_client is None:
        api_key = os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
        base_url = None
        # If only DeepSeek key is available, we fall back to a simpler approach
        if os.getenv("OPENAI_API_KEY"):
            _embedding_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        else:
            # Fallback: use DeepSeek client, embeddings won't work but we degrade gracefully
            _embedding_client = OpenAI(
                api_key=os.getenv("DEEPSEEK_API_KEY", ""),
                base_url="https://api.deepseek.com",
            )
    return _embedding_client


def generate_embedding(text: str) -> Optional[list[float]]:
    """Generate a 1536-d embedding for memory storage and retrieval.

    Returns None if embedding generation fails (graceful degradation).
    """
    if not text or not text.strip():
        return None

    try:
        client = _get_client()
        # Truncate to ~8000 tokens worth of text (rough estimate)
        truncated = text[:32000]
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=truncated,
            dimensions=1536,
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"[TOBY] Embedding generation failed (degrading gracefully): {e}", flush=True)
        return None


def generate_embedding_batch(texts: list[str]) -> list[Optional[list[float]]]:
    """Generate embeddings for multiple texts in a single API call."""
    if not texts:
        return []

    try:
        client = _get_client()
        truncated = [t[:32000] for t in texts if t and t.strip()]
        if not truncated:
            return [None] * len(texts)

        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=truncated,
            dimensions=1536,
        )
        embeddings = [d.embedding for d in response.data]

        # Map back to original list (handle empty texts)
        result = []
        embed_idx = 0
        for t in texts:
            if t and t.strip():
                result.append(embeddings[embed_idx] if embed_idx < len(embeddings) else None)
                embed_idx += 1
            else:
                result.append(None)
        return result
    except Exception as e:
        print(f"[TOBY] Batch embedding failed (degrading gracefully): {e}", flush=True)
        return [None] * len(texts)
