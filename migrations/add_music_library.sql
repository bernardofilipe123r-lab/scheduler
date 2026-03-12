-- Music library — admin-managed music tracks stored in Supabase Storage.
-- Used by all users for reel video background music.

CREATE TABLE IF NOT EXISTS music_library (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    duration_seconds FLOAT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_music_library_uploaded_at ON music_library (uploaded_at);
