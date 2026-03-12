-- Content DNA Re-Architecture Migration
-- Creates content_dna_profiles table, adds content_dna_id FK to brands and Toby tables,
-- backfills from existing niche_config data.
-- Idempotent: safe to run multiple times.

-- ═══════════════════════════════════════════════════════════════════
-- 1. Create content_dna_profiles table
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS content_dna_profiles (
    id              VARCHAR(36)  PRIMARY KEY,
    user_id         VARCHAR(100) NOT NULL,

    -- Display
    name            VARCHAR(100) NOT NULL DEFAULT 'My Content DNA',
    description     TEXT         DEFAULT '',

    -- Core Identity (mirrors niche_config)
    niche_name              VARCHAR(100) NOT NULL DEFAULT '',
    niche_description       TEXT         DEFAULT '',
    content_brief           TEXT         DEFAULT '',
    target_audience         VARCHAR(255) DEFAULT '',
    audience_description    TEXT         DEFAULT '',
    content_tone            JSONB        DEFAULT '[]',
    tone_avoid              JSONB        DEFAULT '[]',

    -- Topic Configuration
    topic_categories        JSONB        DEFAULT '[]',
    topic_keywords          JSONB        DEFAULT '[]',
    topic_avoid             JSONB        DEFAULT '[]',

    -- Content Philosophy
    content_philosophy      TEXT         DEFAULT '',
    hook_themes             JSONB        DEFAULT '[]',

    -- User Examples
    reel_examples           JSONB        DEFAULT '[]',
    post_examples           JSONB        DEFAULT '[]',

    -- Visual Configuration
    image_style_description TEXT         DEFAULT '',
    image_palette_keywords  JSONB        DEFAULT '[]',

    -- Brand Personality
    brand_personality       TEXT,
    brand_focus_areas       JSONB        DEFAULT '[]',
    parent_brand_name       VARCHAR(100) DEFAULT '',

    -- CTA Configuration
    cta_options             JSONB        DEFAULT '[]',
    hashtags                JSONB        DEFAULT '[]',

    -- Discovery Configuration
    competitor_accounts     JSONB        DEFAULT '[]',
    discovery_hashtags      JSONB        DEFAULT '[]',

    -- Citation / Source
    citation_style          VARCHAR(50)  DEFAULT 'none',
    citation_source_types   JSONB        DEFAULT '[]',

    -- YouTube
    yt_title_examples       JSONB        DEFAULT '[]',
    yt_title_bad_examples   JSONB        DEFAULT '[]',

    -- Carousel
    carousel_cta_topic              VARCHAR(255) DEFAULT '',
    carousel_cta_options            JSONB        DEFAULT '[]',
    carousel_cover_overlay_opacity  INTEGER      DEFAULT 65,
    carousel_content_overlay_opacity INTEGER     DEFAULT 85,

    -- Caption sections
    follow_section_text     TEXT     DEFAULT '',
    save_section_text       TEXT     DEFAULT '',
    disclaimer_text         TEXT     DEFAULT '',

    -- Format B Reel Configuration
    format_b_reel_examples          JSONB DEFAULT '[]',
    format_b_story_niches           JSONB DEFAULT '[]',
    format_b_story_tone             TEXT  DEFAULT '',
    format_b_preferred_categories   JSONB DEFAULT '[]',

    -- Threads
    threads_format_weights  JSONB DEFAULT '{}',

    -- Timestamps
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_content_dna_user ON content_dna_profiles(user_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Add content_dna_id FK to brands
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE brands ADD COLUMN IF NOT EXISTS content_dna_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS ix_brands_content_dna ON brands(content_dna_id);

-- ═══════════════════════════════════════════════════════════════════
-- 3. Add content_dna_id to Toby learning/memory tables
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE toby_strategy_scores ADD COLUMN IF NOT EXISTS content_dna_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS ix_strategy_dna_dim ON toby_strategy_scores(user_id, content_dna_id, content_type, dimension);

ALTER TABLE toby_experiments ADD COLUMN IF NOT EXISTS content_dna_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS ix_exp_dna ON toby_experiments(user_id, content_dna_id, content_type, status);

ALTER TABLE toby_content_tags ADD COLUMN IF NOT EXISTS content_dna_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS ix_tags_dna ON toby_content_tags(user_id, content_dna_id);

ALTER TABLE toby_episodic_memory ADD COLUMN IF NOT EXISTS content_dna_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS ix_episodic_dna ON toby_episodic_memory(user_id, content_dna_id);

ALTER TABLE toby_procedural_memory ADD COLUMN IF NOT EXISTS content_dna_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS ix_procedural_dna ON toby_procedural_memory(user_id, content_dna_id);

ALTER TABLE toby_strategy_combos ADD COLUMN IF NOT EXISTS content_dna_id VARCHAR(36);
CREATE INDEX IF NOT EXISTS ix_combos_dna ON toby_strategy_combos(user_id, content_dna_id);

-- ═══════════════════════════════════════════════════════════════════
-- 4. Backfill: create content_dna_profiles from existing niche_config
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO content_dna_profiles (
    id, user_id, name, niche_name, niche_description, content_brief,
    target_audience, audience_description, content_tone, tone_avoid,
    topic_categories, topic_keywords, topic_avoid,
    content_philosophy, hook_themes, reel_examples, post_examples,
    image_style_description, image_palette_keywords,
    brand_personality, brand_focus_areas, parent_brand_name,
    cta_options, hashtags, competitor_accounts, discovery_hashtags,
    citation_style, citation_source_types,
    yt_title_examples, yt_title_bad_examples,
    carousel_cta_topic, carousel_cta_options,
    carousel_cover_overlay_opacity, carousel_content_overlay_opacity,
    follow_section_text, save_section_text, disclaimer_text,
    format_b_reel_examples, format_b_story_niches, format_b_story_tone, format_b_preferred_categories,
    threads_format_weights,
    created_at, updated_at
)
SELECT
    id, user_id,
    COALESCE(NULLIF(niche_name, ''), 'My Content DNA'),
    niche_name, niche_description, content_brief,
    target_audience, audience_description,
    COALESCE(content_tone, '[]'::jsonb),
    COALESCE(tone_avoid, '[]'::jsonb),
    COALESCE(topic_categories, '[]'::jsonb),
    COALESCE(topic_keywords, '[]'::jsonb),
    COALESCE(topic_avoid, '[]'::jsonb),
    content_philosophy,
    COALESCE(hook_themes, '[]'::jsonb),
    COALESCE(reel_examples, '[]'::jsonb),
    COALESCE(post_examples, '[]'::jsonb),
    image_style_description,
    COALESCE(image_palette_keywords, '[]'::jsonb),
    brand_personality,
    COALESCE(brand_focus_areas, '[]'::jsonb),
    parent_brand_name,
    COALESCE(cta_options, '[]'::jsonb),
    COALESCE(hashtags, '[]'::jsonb),
    COALESCE(competitor_accounts, '[]'::jsonb),
    COALESCE(discovery_hashtags, '[]'::jsonb),
    COALESCE(citation_style, 'none'),
    COALESCE(citation_source_types, '[]'::jsonb),
    COALESCE(yt_title_examples, '[]'::jsonb),
    COALESCE(yt_title_bad_examples, '[]'::jsonb),
    COALESCE(carousel_cta_topic, ''),
    COALESCE(carousel_cta_options, '[]'::jsonb),
    COALESCE(carousel_cover_overlay_opacity, 65),
    COALESCE(carousel_content_overlay_opacity, 85),
    COALESCE(follow_section_text, ''),
    COALESCE(save_section_text, ''),
    COALESCE(disclaimer_text, ''),
    COALESCE(format_b_reel_examples, '[]'::jsonb),
    COALESCE(format_b_story_niches, '[]'::jsonb),
    COALESCE(format_b_story_tone, ''),
    COALESCE(format_b_preferred_categories, '[]'::jsonb),
    COALESCE(threads_format_weights, '{}'::jsonb),
    COALESCE(created_at, now()),
    COALESCE(updated_at, now())
FROM niche_config
WHERE NOT EXISTS (
    SELECT 1 FROM content_dna_profiles cdp WHERE cdp.id = niche_config.id
);

-- ═══════════════════════════════════════════════════════════════════
-- 5. Backfill: assign brands to their user's DNA profile
-- ═══════════════════════════════════════════════════════════════════
UPDATE brands b
SET content_dna_id = (
    SELECT cdp.id FROM content_dna_profiles cdp
    WHERE cdp.user_id = b.user_id
    ORDER BY cdp.created_at ASC
    LIMIT 1
)
WHERE b.content_dna_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 6. Backfill: tag existing Toby learning data with the user's DNA
-- ═══════════════════════════════════════════════════════════════════
UPDATE toby_strategy_scores ts
SET content_dna_id = (
    SELECT cdp.id FROM content_dna_profiles cdp
    WHERE cdp.user_id = ts.user_id
    ORDER BY cdp.created_at ASC LIMIT 1
)
WHERE ts.content_dna_id IS NULL;

UPDATE toby_experiments te
SET content_dna_id = (
    SELECT cdp.id FROM content_dna_profiles cdp
    WHERE cdp.user_id = te.user_id
    ORDER BY cdp.created_at ASC LIMIT 1
)
WHERE te.content_dna_id IS NULL;

UPDATE toby_content_tags tc
SET content_dna_id = (
    SELECT cdp.id FROM content_dna_profiles cdp
    WHERE cdp.user_id = tc.user_id
    ORDER BY cdp.created_at ASC LIMIT 1
)
WHERE tc.content_dna_id IS NULL;

UPDATE toby_episodic_memory em
SET content_dna_id = (
    SELECT cdp.id FROM content_dna_profiles cdp
    WHERE cdp.user_id = em.user_id
    ORDER BY cdp.created_at ASC LIMIT 1
)
WHERE em.content_dna_id IS NULL;

UPDATE toby_procedural_memory pm
SET content_dna_id = (
    SELECT cdp.id FROM content_dna_profiles cdp
    WHERE cdp.user_id = pm.user_id
    ORDER BY cdp.created_at ASC LIMIT 1
)
WHERE pm.content_dna_id IS NULL;

UPDATE toby_strategy_combos sc
SET content_dna_id = (
    SELECT cdp.id FROM content_dna_profiles cdp
    WHERE cdp.user_id = sc.user_id
    ORDER BY cdp.created_at ASC LIMIT 1
)
WHERE sc.content_dna_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 7. updated_at trigger for content_dna_profiles
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION trigger_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_content_dna ON content_dna_profiles;
CREATE TRIGGER set_updated_at_content_dna
    BEFORE UPDATE ON content_dna_profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
