-- Add thumbnail_logo_shape column to format_b_design table
-- Values: 'square' (default, current behavior) or 'circular' (like carousels)
ALTER TABLE format_b_design
ADD COLUMN IF NOT EXISTS thumbnail_logo_shape VARCHAR(20) DEFAULT 'square' NOT NULL;
