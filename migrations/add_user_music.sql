-- Migration: Add user_music table for per-user background music tracks
-- Each user can upload up to 5 music files, used randomly for reel video generation

CREATE TABLE IF NOT EXISTS user_music (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    filename    TEXT NOT NULL,
    storage_url TEXT NOT NULL,
    duration_seconds DOUBLE PRECISION,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_music_user_id ON user_music (user_id);
