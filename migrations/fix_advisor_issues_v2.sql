-- ============================================================
-- Fix Supabase Advisor Issues — v2 (2026-03-06)
--
-- Addresses the remaining 32 issues after v1 migration:
--
-- 1. RLS Disabled in Public (25 ERRORs) — v1 wrongly disabled RLS.
--    Correct pattern for server-only tables: re-enable RLS + add
--    USING (false) deny policy. service_role bypasses RLS regardless.
--
-- 2. Duplicate indexes still showing (3 WARNs) — drop again cleanly.
--
-- 3. Unused index idx_oauth_states_created (1 INFO) — drop again.
--
-- 4. Unindexed foreign key on brand_subscriptions.brand_id (1 INFO)
--    — add covering index (brand_id FK references brands.id).
-- ============================================================


-- ============================================================
-- SECTION 1: Re-enable RLS + add deny policy on server-only tables
--
-- Keep RLS ON (required for tables in public schema exposed to
-- PostgREST). Add USING (false) to explicitly block direct user
-- access. service_role key bypasses RLS entirely — backend unaffected.
-- ============================================================

-- Helper: enable RLS and add deny-all policy for each server-only table.
-- Policy named "deny_direct_user_access" is clearly intentional.

-- Toby internal tables
ALTER TABLE public.toby_activity_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_brand_config       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_content_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_episodic_memory    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_experiments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_meta_reports       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_procedural_memory  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_raw_signals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_reasoning_traces   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_semantic_memory    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_state              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_strategy_combos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_strategy_scores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_world_model        ENABLE ROW LEVEL SECURITY;

-- System tables (no user_id — purely server-side)
ALTER TABLE public.trending_music          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_music_fetches  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_aggregates    ENABLE ROW LEVEL SECURITY;

-- User-data tables accessed only via FastAPI service_role
ALTER TABLE public.text_video_design           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.text_video_story_pool       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_music                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_subscriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audience_demographics       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_dna_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states                ENABLE ROW LEVEL SECURITY;

-- Add explicit deny-all policies (USING (false) = no row ever visible
-- to anon/authenticated Supabase client users; service_role bypasses).
-- Drop first so this migration is re-runnable.

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_activity_log;
CREATE POLICY "deny_direct_user_access" ON public.toby_activity_log       USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_brand_config;
CREATE POLICY "deny_direct_user_access" ON public.toby_brand_config       USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_content_tags;
CREATE POLICY "deny_direct_user_access" ON public.toby_content_tags       USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_episodic_memory;
CREATE POLICY "deny_direct_user_access" ON public.toby_episodic_memory    USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_experiments;
CREATE POLICY "deny_direct_user_access" ON public.toby_experiments        USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_meta_reports;
CREATE POLICY "deny_direct_user_access" ON public.toby_meta_reports       USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_procedural_memory;
CREATE POLICY "deny_direct_user_access" ON public.toby_procedural_memory  USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_raw_signals;
CREATE POLICY "deny_direct_user_access" ON public.toby_raw_signals        USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_reasoning_traces;
CREATE POLICY "deny_direct_user_access" ON public.toby_reasoning_traces   USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_semantic_memory;
CREATE POLICY "deny_direct_user_access" ON public.toby_semantic_memory    USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_state;
CREATE POLICY "deny_direct_user_access" ON public.toby_state              USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_strategy_combos;
CREATE POLICY "deny_direct_user_access" ON public.toby_strategy_combos    USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_strategy_scores;
CREATE POLICY "deny_direct_user_access" ON public.toby_strategy_scores    USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.toby_world_model;
CREATE POLICY "deny_direct_user_access" ON public.toby_world_model        USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.trending_music;
CREATE POLICY "deny_direct_user_access" ON public.trending_music          USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.trending_music_fetches;
CREATE POLICY "deny_direct_user_access" ON public.trending_music_fetches  USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.api_usage_log;
CREATE POLICY "deny_direct_user_access" ON public.api_usage_log           USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.analytics_aggregates;
CREATE POLICY "deny_direct_user_access" ON public.analytics_aggregates    USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.text_video_design;
CREATE POLICY "deny_direct_user_access" ON public.text_video_design       USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.text_video_story_pool;
CREATE POLICY "deny_direct_user_access" ON public.text_video_story_pool   USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.user_music;
CREATE POLICY "deny_direct_user_access" ON public.user_music              USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.brand_subscriptions;
CREATE POLICY "deny_direct_user_access" ON public.brand_subscriptions     USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.audience_demographics;
CREATE POLICY "deny_direct_user_access" ON public.audience_demographics   USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.content_dna_recommendations;
CREATE POLICY "deny_direct_user_access" ON public.content_dna_recommendations USING (false);

DROP POLICY IF EXISTS "deny_direct_user_access" ON public.oauth_states;
CREATE POLICY "deny_direct_user_access" ON public.oauth_states            USING (false);


-- ============================================================
-- SECTION 2: Drop duplicate indexes (retry from v1)
-- ============================================================

DROP INDEX IF EXISTS idx_brands_user_id;
DROP INDEX IF EXISTS idx_generation_jobs_status;
DROP INDEX IF EXISTS idx_scheduled_reels_status_time;


-- ============================================================
-- SECTION 3: Drop remaining unused index
-- ============================================================

DROP INDEX IF EXISTS idx_oauth_states_created;


-- ============================================================
-- SECTION 4: Add covering index for unindexed foreign key
--
-- brand_subscriptions.brand_id → brands.id FK has no index.
-- Cascaded deletes / joins on brand_id do a seq scan without it.
-- Note: idx_brand_sub_brand was dropped in v1 as "unused".
-- Re-add it here — it covers the FK requirement.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_brand_sub_brand ON public.brand_subscriptions (brand_id);
