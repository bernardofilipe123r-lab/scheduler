-- Migration: Create text_video_design table
-- Run: psql "$DATABASE_URL" < migrations/text_video_design.sql

CREATE TABLE IF NOT EXISTS text_video_design (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,

    -- Reel body settings
    reel_text_font VARCHAR(100) DEFAULT 'Poppins-Bold.ttf',
    reel_text_size INTEGER DEFAULT 52,
    reel_line_spacing INTEGER DEFAULT 20,
    reel_text_region_pct REAL DEFAULT 0.55,
    reel_text_bg_opacity INTEGER DEFAULT 85,
    reel_show_logo BOOLEAN DEFAULT true,
    reel_show_handle BOOLEAN DEFAULT true,
    reel_handle_text VARCHAR(100) DEFAULT '',
    image_duration REAL DEFAULT 3.0,
    image_fade_duration REAL DEFAULT 0.2,
    reel_total_duration INTEGER DEFAULT 15,
    black_fade_duration REAL DEFAULT 1.0,

    -- Thumbnail settings
    thumbnail_title_color VARCHAR(10) DEFAULT '#FFD700',
    thumbnail_title_font VARCHAR(100) DEFAULT 'Poppins-Bold.ttf',
    thumbnail_title_size INTEGER DEFAULT 72,
    thumbnail_title_max_lines INTEGER DEFAULT 4,
    thumbnail_title_padding_x INTEGER DEFAULT 40,
    thumbnail_image_ratio REAL DEFAULT 0.6,
    thumbnail_divider_style VARCHAR(30) DEFAULT 'line_with_logo',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One design config per user
    CONSTRAINT uq_text_video_design_user UNIQUE (user_id)
);

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'text_video_design'
ORDER BY ordinal_position;
