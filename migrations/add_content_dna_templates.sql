-- Migration: Add content_dna_templates table for pre-built DNA presets
-- These are system-wide templates users can copy when creating a new DNA profile.

CREATE TABLE IF NOT EXISTS content_dna_templates (
    id VARCHAR(36) PRIMARY KEY,
    template_name VARCHAR(200) NOT NULL,
    template_category VARCHAR(100) NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    popularity_order INTEGER NOT NULL DEFAULT 0,

    -- Core Identity (same fields as content_dna_profiles)
    niche_name VARCHAR(100) NOT NULL DEFAULT '',
    niche_description TEXT DEFAULT '',
    content_brief TEXT DEFAULT '',
    target_audience VARCHAR(255) DEFAULT '',
    audience_description TEXT DEFAULT '',
    content_tone JSONB DEFAULT '[]'::jsonb,
    tone_avoid JSONB DEFAULT '[]'::jsonb,

    -- Topic Configuration
    topic_categories JSONB DEFAULT '[]'::jsonb,
    topic_keywords JSONB DEFAULT '[]'::jsonb,
    topic_avoid JSONB DEFAULT '[]'::jsonb,

    -- Content Philosophy
    content_philosophy TEXT DEFAULT '',
    hook_themes JSONB DEFAULT '[]'::jsonb,

    -- User Examples
    reel_examples JSONB DEFAULT '[]'::jsonb,
    post_examples JSONB DEFAULT '[]'::jsonb,

    -- Visual Configuration
    image_style_description TEXT DEFAULT '',
    image_palette_keywords JSONB DEFAULT '[]'::jsonb,

    -- Brand Personality
    brand_personality TEXT,
    brand_focus_areas JSONB DEFAULT '[]'::jsonb,
    parent_brand_name VARCHAR(100) DEFAULT '',

    -- CTA Configuration
    cta_options JSONB DEFAULT '[]'::jsonb,
    hashtags JSONB DEFAULT '[]'::jsonb,

    -- Discovery Configuration
    competitor_accounts JSONB DEFAULT '[]'::jsonb,
    discovery_hashtags JSONB DEFAULT '[]'::jsonb,

    -- Citation / Source style
    citation_style VARCHAR(50) DEFAULT 'none',
    citation_source_types JSONB DEFAULT '[]'::jsonb,

    -- YouTube
    yt_title_examples JSONB DEFAULT '[]'::jsonb,
    yt_title_bad_examples JSONB DEFAULT '[]'::jsonb,

    -- Carousel
    carousel_cta_topic VARCHAR(255) DEFAULT '',
    carousel_cta_options JSONB DEFAULT '[]'::jsonb,
    carousel_cover_overlay_opacity INTEGER DEFAULT 65,
    carousel_content_overlay_opacity INTEGER DEFAULT 85,

    -- Caption sections
    follow_section_text TEXT DEFAULT '',
    save_section_text TEXT DEFAULT '',
    disclaimer_text TEXT DEFAULT '',

    -- Format B Reel Configuration
    format_b_reel_examples JSONB DEFAULT '[]'::jsonb,
    format_b_story_niches JSONB DEFAULT '[]'::jsonb,
    format_b_story_tone TEXT DEFAULT '',
    format_b_preferred_categories JSONB DEFAULT '[]'::jsonb,

    -- Threads
    threads_format_weights JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup of active templates
CREATE INDEX IF NOT EXISTS idx_dna_templates_active ON content_dna_templates (is_active, popularity_order);
