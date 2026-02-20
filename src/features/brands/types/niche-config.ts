export interface ReelExample {
  title: string
  content_lines: string[]
}

export interface PostExample {
  title: string
  slides: string[]
  doi?: string
  /** Max slides for this example (3 or 4). Not persisted — UI-only. */
  _maxSlides?: number
}

export interface CtaOption {
  text: string
  weight: number  // percentage 0-100, all weights must sum to 100
}

export interface NicheConfig {
  id?: string | null
  brand_id?: string | null

  // Core Identity
  niche_name: string
  niche_description: string
  content_brief: string
  target_audience: string
  audience_description: string
  content_tone: string[]
  tone_avoid: string[]

  // Topics
  topic_categories: string[]
  topic_keywords: string[]
  topic_avoid: string[]

  // Content Philosophy
  content_philosophy: string
  hook_themes: string[]

  // Examples
  reel_examples: ReelExample[]
  post_examples: PostExample[]

  // Visual
  image_style_description: string
  image_palette_keywords: string[]
  image_composition_style: string

  // Brand Identity
  brand_personality: string | null
  brand_focus_areas: string[]
  parent_brand_name: string

  // CTAs
  cta_options: CtaOption[]
  hashtags: string[]
  carousel_cta_topic: string
  follow_section_text: string
  save_section_text: string
  disclaimer_text: string

  // Citation & YouTube
  citation_style: string
  citation_source_types: string[]
  yt_title_examples: string[]
  yt_title_bad_examples: string[]
}

export type ConfigStrength = 'basic' | 'good' | 'excellent'

export function getConfigStrength(config: NicheConfig): ConfigStrength {
  let score = 0
  const maxScore = 12

  // Core identity (3 points)
  if (config.niche_name) score++
  if (config.content_brief && config.content_brief.length > 50) score++
  if (config.content_brief && config.content_brief.length > 200) score++

  // Examples (3 points)
  if (config.reel_examples.length >= 3) score++
  if (config.reel_examples.length >= 10) score++
  if (config.post_examples.length >= 1) score++

  // CTAs (1 point)
  if (config.cta_options.length > 0 && config.cta_options.some(c => c.text.trim())) score++

  // Visual & content style (2 points)
  if (config.image_composition_style && config.image_composition_style.trim()) score++
  if (config.carousel_cta_topic && config.carousel_cta_topic.trim()) score++

  // YouTube titles (1 point)
  if ((config.yt_title_examples || []).length >= 2) score++

  // Citation (1 point)
  if (config.citation_style && config.citation_style !== 'none') score++

  // Brand name (1 point)
  if (config.parent_brand_name && config.parent_brand_name.trim()) score++

  const pct = score / maxScore
  if (pct < 0.4) return 'basic'
  if (pct >= 0.75) return 'excellent'
  return 'good'
}

export function getStrengthLabel(strength: ConfigStrength): string {
  switch (strength) {
    case 'basic': return 'Add more details and examples to improve content quality'
    case 'good': return 'Good start! Adding examples will take it to the next level.'
    case 'excellent': return 'Your AI knows exactly what to generate.'
  }
}

export function getStrengthColor(strength: ConfigStrength): string {
  switch (strength) {
    case 'basic': return 'text-red-500'
    case 'good': return 'text-yellow-500'
    case 'excellent': return 'text-green-500'
  }
}

export function getStrengthBarColor(strength: ConfigStrength): string {
  switch (strength) {
    case 'basic': return 'bg-red-500'
    case 'good': return 'bg-yellow-500'
    case 'excellent': return 'bg-green-500'
  }
}

export function getStrengthPercent(strength: ConfigStrength): number {
  switch (strength) {
    case 'basic': return 25
    case 'good': return 65
    case 'excellent': return 100
  }
}
