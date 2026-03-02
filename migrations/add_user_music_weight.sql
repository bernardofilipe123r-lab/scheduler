-- Migration: Add weight column to user_music for probability-based selection
-- Weight 0-100, default 100 (equal chance). Toby picks tracks proportional to weight.
-- Also increase max tracks per user from 5 to 20.

ALTER TABLE user_music ADD COLUMN IF NOT EXISTS weight INTEGER NOT NULL DEFAULT 100;
