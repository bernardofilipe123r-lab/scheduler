-- Migration: Add auto_schedule (download mode) and buffer reminder columns to toby_state
-- Date: 2026-06-09

-- auto_schedule: when false, Pipeline "Accept" becomes "Download" (no scheduling)
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS auto_schedule BOOLEAN NOT NULL DEFAULT TRUE;

-- buffer_reminder_enabled: toggles the 1-day-before-buffer-expires email reminder
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS buffer_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- last_buffer_reminder_sent_at: anti-spam tracking for buffer reminder emails
ALTER TABLE toby_state ADD COLUMN IF NOT EXISTS last_buffer_reminder_sent_at TIMESTAMPTZ;
