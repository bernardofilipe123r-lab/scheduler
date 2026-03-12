/**
 * Content DNA Profile — types for the multi-DNA architecture.
 *
 * A Content DNA is an editorial identity ("basket") that one or more brands belong to.
 * Toby learns per (content_dna_id, content_type), not per brand.
 */

import type { NicheConfig, ConfigStrength } from '@/features/brands/types/niche-config'
import { getConfigStrength } from '@/features/brands/types/niche-config'

export interface ContentDNAProfile {
  id: string
  user_id: string
  name: string
  description: string | null

  // All NicheConfig-equivalent fields
  niche_name: string
  niche_description: string
  content_brief: string
  target_audience: string
  audience_description: string
  content_tone: string[]
  tone_avoid: string[]
  topic_categories: string[]
  topic_keywords: string[]
  topic_avoid: string[]
  content_philosophy: string
  hook_themes: string[]
  reel_examples: Array<{ title: string; content_lines: string[] }>
  post_examples: Array<{ title: string; slides: string[]; study_ref?: string }>
  image_style_description: string
  image_palette_keywords: string[]
  brand_personality: string | null
  brand_focus_areas: string[]
  parent_brand_name: string
  cta_options: Array<{ text: string; weight: number }>
  hashtags: string[]
  competitor_accounts: string[]
  discovery_hashtags: string[]
  citation_style: string
  citation_source_types: string[]
  yt_title_examples: string[]
  yt_title_bad_examples: string[]
  carousel_cta_topic: string
  carousel_cta_options: Array<{ text: string; weight: number }>
  carousel_cover_overlay_opacity: number
  carousel_content_overlay_opacity: number
  follow_section_text: string
  save_section_text: string
  disclaimer_text: string
  format_b_reel_examples: Array<{ title: string; content_lines: string[] }>
  format_b_story_niches: string[]
  format_b_story_tone: string
  format_b_preferred_categories: string[]
  threads_format_weights: Record<string, number> | null

  // Metadata
  created_at: string
  updated_at: string | null

  // Populated by list endpoint
  brand_count?: number
  // Populated by get endpoint
  brands?: Array<{ id: string; name: string; active: boolean }>
}

export type ContentDNACreate = {
  name: string
  description?: string
} & Partial<Omit<ContentDNAProfile, 'id' | 'user_id' | 'name' | 'created_at' | 'updated_at' | 'brand_count' | 'brands'>>

export type ContentDNAUpdate = Partial<ContentDNACreate>

/** Get the config strength of a DNA profile by mapping it to NicheConfig shape. */
export function getDNAStrength(dna: ContentDNAProfile): ConfigStrength {
  // Reuse the existing strength calculator by treating DNA as NicheConfig
  return getConfigStrength(dna as unknown as NicheConfig)
}
