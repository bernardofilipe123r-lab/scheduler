/**
 * Reel Format Registry — single source of truth for all supported reel formats.
 *
 * When adding a new reel format:
 *   1. Add an entry to REEL_FORMATS below
 *   2. Add a ManualPanel component in ../wizard/
 *   3. Add auto-generate handler in ../wizard/CreateVideoWizard.tsx (autoGenerateHandlers map)
 *   4. If the format needs design settings, add a design tab in DesignEditorTab.tsx
 *   5. Design the "mode" step (auto vs manual) in CreateVideoWizard.tsx Step 4 to
 *      visually match the new format — use the previewGradient, previewVideo, and
 *      format-specific descriptions (autoDescription, manualDescription) to give
 *      users a clear visual connection between what they chose and what they'll get.
 *   6. Everything else (wizard flow, brand/platform/mode selection) updates automatically
 */
import { Film, Image, type LucideIcon } from 'lucide-react'
import textBasedVideo from '@/assets/videos/text-based-preview.mp4'
import videoBasedVideo from '@/assets/videos/video-based-preview.mp4'

export interface ReelFormat {
  /** Unique identifier — matches backend content_format / variant values */
  id: string
  /** Display label in the wizard */
  label: string
  /** Short description shown under the label */
  description: string
  /** Lucide icon class */
  icon: LucideIcon
  /** Whether this format supports 100% automatic generation */
  supportsAuto: boolean
  /** Whether this format supports manual creation */
  supportsManual: boolean
  /** Whether auto mode requires Content DNA (niche) to be configured */
  requiresNiche: boolean
  /** Card preview: gradient background for the visual card */
  previewGradient: string
  /** Card preview: short tagline for the card */
  tagline: string
  /** Card preview: list of visual features for the card */
  features: string[]
  /** Card preview: video URL to play on hover (imported asset) */
  previewVideo: string
  /** Mode step: description for auto mode */
  autoDescription: string
  /** Mode step: description for manual mode */
  manualDescription: string
}

export const REEL_FORMATS: ReelFormat[] = [
  {
    id: 'text_based',
    label: 'Text-Based Reel',
    description: 'AI-generated background with animated text overlays',
    icon: Film,
    supportsAuto: true,
    supportsManual: true,
    requiresNiche: true,
    previewGradient: 'from-violet-600 via-purple-600 to-indigo-700',
    tagline: 'Kinetic text on AI art',
    features: ['AI backgrounds', 'Animated text', 'Music sync'],
    previewVideo: textBasedVideo,
    autoDescription: 'AI picks the topic, writes text, generates background art, and composes the video with music',
    manualDescription: 'You write the text, pick a variant and music — AI generates the background',
  },
  {
    id: 'text_video',
    label: 'Text-Video Reel',
    description: 'Real images with text overlays as a slideshow video',
    icon: Image,
    supportsAuto: true,
    supportsManual: true,
    requiresNiche: true,
    previewGradient: 'from-amber-500 via-orange-500 to-rose-600',
    tagline: 'Photos meet story',
    features: ['Real images', 'Text overlays', 'Slideshow'],
    previewVideo: videoBasedVideo,
    autoDescription: 'AI discovers trending stories, writes reel script, sources real images, and renders the slideshow',
    manualDescription: 'You provide the script, upload or search images — AI renders the final video',
  },
]

/** Get a format by its ID */
export function getReelFormat(id: string): ReelFormat | undefined {
  return REEL_FORMATS.find(f => f.id === id)
}
