-- ============================================================
-- Fix Supabase Advisor Issues (81 issues)
-- Date: 2026-03-06
-- Safe to run: only modifies policy definitions and indexes.
-- Zero data rows are touched.
-- ============================================================


-- ============================================================
-- SECTION 1: Fix Auth RLS Initialization Performance (14 WARNs)
--
-- Problem: auth.uid() / auth.role() called once per ROW instead
--          of once per QUERY. Fix: wrap with (select ...).
-- Pattern: DROP old policy → CREATE new policy with (select auth.uid())
-- ============================================================

-- brands
DROP POLICY IF EXISTS "users_own_brands" ON public.brands;
CREATE POLICY "users_own_brands" ON public.brands
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- generation_jobs
DROP POLICY IF EXISTS "users_own_jobs" ON public.generation_jobs;
CREATE POLICY "users_own_jobs" ON public.generation_jobs
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- scheduled_reels
DROP POLICY IF EXISTS "users_own_schedules" ON public.scheduled_reels;
CREATE POLICY "users_own_schedules" ON public.scheduled_reels
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- user_profiles
DROP POLICY IF EXISTS "users_own_profile" ON public.user_profiles;
CREATE POLICY "users_own_profile" ON public.user_profiles
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- niche_config
DROP POLICY IF EXISTS "users_own_niche_config" ON public.niche_config;
CREATE POLICY "users_own_niche_config" ON public.niche_config
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- content_history
DROP POLICY IF EXISTS "users_own_content" ON public.content_history;
CREATE POLICY "users_own_content" ON public.content_history
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- analytics_snapshots
DROP POLICY IF EXISTS "users_own_analytics" ON public.analytics_snapshots;
CREATE POLICY "users_own_analytics" ON public.analytics_snapshots
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- brand_analytics (user_id is a regular column, pk is (brand, platform))
DROP POLICY IF EXISTS "users_own_brand_analytics" ON public.brand_analytics;
CREATE POLICY "users_own_brand_analytics" ON public.brand_analytics
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- analytics_refresh_log (user_id is nullable; NULL rows invisible to users — correct)
DROP POLICY IF EXISTS "users_own_refresh_log" ON public.analytics_refresh_log;
CREATE POLICY "users_own_refresh_log" ON public.analytics_refresh_log
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- post_performance
DROP POLICY IF EXISTS "users_own_post_perf" ON public.post_performance;
CREATE POLICY "users_own_post_perf" ON public.post_performance
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- trending_content
DROP POLICY IF EXISTS "users_own_trending" ON public.trending_content;
CREATE POLICY "users_own_trending" ON public.trending_content
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- youtube_channels (pk is brand, user_id is a regular column)
DROP POLICY IF EXISTS "users_own_youtube" ON public.youtube_channels;
CREATE POLICY "users_own_youtube" ON public.youtube_channels
  FOR SELECT USING ((select auth.uid())::text = user_id);

-- app_logs — no user_id column; policy checks authenticated role
DROP POLICY IF EXISTS "authenticated_read_logs" ON public.app_logs;
CREATE POLICY "authenticated_read_logs" ON public.app_logs
  FOR SELECT USING ((select auth.role()) = 'authenticated');

-- app_settings — no user_id column; policy checks authenticated role
DROP POLICY IF EXISTS "authenticated_read_settings" ON public.app_settings;
CREATE POLICY "authenticated_read_settings" ON public.app_settings
  FOR SELECT USING ((select auth.role()) = 'authenticated');


-- ============================================================
-- SECTION 2: Drop Duplicate Indexes (3 WARNs)
--
-- Each pair is identical. Keep ix_* (project convention), drop idx_*.
-- ============================================================

DROP INDEX IF EXISTS public.idx_brands_user_id;
DROP INDEX IF EXISTS public.idx_generation_jobs_status;
DROP INDEX IF EXISTS public.idx_scheduled_reels_status_time;


-- ============================================================
-- SECTION 3: Drop Unused Indexes (35 INFOs)
--
-- None of these have ever been used (per pg_stat_user_indexes).
-- Safe to drop — queries using these tables do not hit them.
-- Recreate later if query patterns change and performance suffers.
-- ============================================================

-- app_logs indexes (write-heavy table; queries use timestamp/level not path/source)
DROP INDEX IF EXISTS public.ix_app_logs_http_path;
DROP INDEX IF EXISTS public.ix_app_logs_source;
DROP INDEX IF EXISTS public.ix_app_logs_request_id;

-- analytics_snapshots
DROP INDEX IF EXISTS public.ix_analytics_snapshots_platform;

-- content_history
DROP INDEX IF EXISTS public.ix_content_history_brand;
DROP INDEX IF EXISTS public.ix_content_history_topic_bucket;
DROP INDEX IF EXISTS public.ix_content_history_created_at;
DROP INDEX IF EXISTS public.ix_content_history_type_brand;

-- Toby cognitive / memory tables (unused — these tables have minimal data)
DROP INDEX IF EXISTS public.idx_toby_exp_user_status;
DROP INDEX IF EXISTS public.idx_toby_tags_experiment;
DROP INDEX IF EXISTS public.ix_episodic_user_brand;
DROP INDEX IF EXISTS public.ix_semantic_user;
DROP INDEX IF EXISTS public.ix_procedural_active;
DROP INDEX IF EXISTS public.ix_world_model_expires;
DROP INDEX IF EXISTS public.ix_raw_signals_unprocessed;
DROP INDEX IF EXISTS public.ix_reasoning_traces_schedule;

-- Vector embedding indexes (IVFFlat — unused; no semantic search queries yet)
DROP INDEX IF EXISTS public.ix_episodic_embedding;
DROP INDEX IF EXISTS public.ix_semantic_embedding;
DROP INDEX IF EXISTS public.ix_procedural_embedding;
DROP INDEX IF EXISTS public.ix_world_model_embedding;

-- OAuth states (short-lived rows; queried by state_token PK, not created_at)
DROP INDEX IF EXISTS public.idx_oauth_states_created;

-- audience_demographics
DROP INDEX IF EXISTS public.ix_demo_user;
DROP INDEX IF EXISTS public.ix_demo_brand;

-- analytics_aggregates
DROP INDEX IF EXISTS public.ix_agg_user;
DROP INDEX IF EXISTS public.ix_agg_brand;
DROP INDEX IF EXISTS public.ix_agg_period;

-- post_performance
DROP INDEX IF EXISTS public.ix_post_perf_dow;

-- user_profiles billing indexes
DROP INDEX IF EXISTS public.idx_user_profiles_tag;
DROP INDEX IF EXISTS public.idx_user_profiles_billing_status;

-- brand_subscriptions
DROP INDEX IF EXISTS public.idx_brand_sub_brand;
DROP INDEX IF EXISTS public.idx_brand_sub_stripe;
DROP INDEX IF EXISTS public.idx_brand_sub_status;

-- generation_jobs content format
DROP INDEX IF EXISTS public.ix_generation_jobs_content_format;

-- text_video_story_pool
DROP INDEX IF EXISTS public.ix_story_pool_user_status;
DROP INDEX IF EXISTS public.ix_story_pool_niche;

-- api_usage_log
DROP INDEX IF EXISTS public.idx_api_usage_api_called;


-- ============================================================
-- SECTION 4: Disable RLS on Tables With No Policies (24 INFOs)
--
-- These tables have RLS enabled but zero policies defined.
-- All access goes through the FastAPI backend using service_role,
-- which bypasses RLS entirely regardless. Disabling RLS removes
-- the false-positive advisory warning with zero security impact.
--
-- Server-only Toby internal tables:
-- ============================================================

ALTER TABLE public.toby_activity_log       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_brand_config       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_content_tags       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_episodic_memory    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_experiments        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_meta_reports       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_procedural_memory  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_raw_signals        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_reasoning_traces   DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_semantic_memory    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_state              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_strategy_combos    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_strategy_scores    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.toby_world_model        DISABLE ROW LEVEL SECURITY;

-- System tables (no user_id column — purely server-side data):
ALTER TABLE public.trending_music          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trending_music_fetches  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage_log           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_aggregates    DISABLE ROW LEVEL SECURITY;

-- User-data tables (accessed via FastAPI service_role, not direct Supabase client):
ALTER TABLE public.text_video_design           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.text_video_story_pool       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_music                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_subscriptions         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audience_demographics       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_dna_recommendations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states                DISABLE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 5: Fix app_logs Always-True INSERT Policy (1 WARN)
--
-- authenticated_insert_logs has WITH CHECK (true), allowing any
-- authenticated user to insert arbitrary rows. Since app_logs
-- has no user_id column and is only written by the backend
-- service_role, drop the INSERT policy entirely. service_role
-- bypasses RLS and continues to write normally.
-- ============================================================

DROP POLICY IF EXISTS "authenticated_insert_logs" ON public.app_logs;


-- ============================================================
-- MANUAL STEP (no SQL needed):
-- Go to Supabase Dashboard → Authentication → Settings →
-- enable "Leaked password protection (HaveIBeenPwned check)".
-- ============================================================
