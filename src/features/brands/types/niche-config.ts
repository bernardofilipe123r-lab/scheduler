export interface ReelExample {
  title: string
  content_lines: string[]
}

export interface PostExample {
  title: string
  slides: string[]
  doi?: string
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

  // Brand Identity
  brand_personality: string | null
  brand_focus_areas: string[]
  parent_brand_name: string

  // CTAs
  cta_options: CtaOption[]
  hashtags: string[]
  follow_section_text: string
  save_section_text: string
  disclaimer_text: string
}

export type ConfigStrength = 'basic' | 'good' | 'excellent'

export function getConfigStrength(config: NicheConfig): ConfigStrength {
  let score = 0

  if (config.niche_name && config.niche_name !== 'Health & Wellness') score++
  if (config.niche_description) score++
  if (config.target_audience) score++
  if (config.audience_description) score++
  if (config.content_tone.length > 0) score++
  if (config.topic_categories.length > 0) score++
  if (config.content_philosophy) score++
  if (config.cta_options.length > 0) score++

  const totalExamples = config.reel_examples.length + config.post_examples.length

  if (score <= 2 && totalExamples < 3) return 'basic'
  if (score >= 6 && totalExamples >= 5) return 'excellent'
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
