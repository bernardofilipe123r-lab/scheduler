-- Add music_track_id column to generation_jobs so the chosen track is persisted.
-- NULL means "auto" (weighted random selection at generation time).
ALTER TABLE generation_jobs
  ADD COLUMN IF NOT EXISTS music_track_id TEXT;
