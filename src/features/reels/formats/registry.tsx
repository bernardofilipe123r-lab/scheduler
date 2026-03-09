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
import textBasedVideo from '@/assets/videos/format-a-preview.mp4'
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
  /**
   * Mode step: workflow steps shown to the user for auto mode.
   * Each format has its own pipeline, so the steps should reflect what
   * actually happens in the backend. For example:
   *   - format_a: generate topic → write text → AI background → compose video
   *   - format_b: discover stories → write script → source images → render slideshow
   * When adding a NEW FORMAT, define steps that match its actual pipeline.
   */
  autoSteps: string[]
  /** Mode step: workflow steps shown to the user for manual mode */
  manualSteps: string[]
}

export const REEL_FORMATS: ReelFormat[] = [
  {
    id: 'format_a',
    label: 'Format A Reel',
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
    autoSteps: ['Pick topic from your niche', 'Write animated text', 'Generate AI background art', 'Compose video with music'],
    manualSteps: ['You write the text', 'Pick variant & music', 'AI generates background', 'Video rendered'],
  },
  {
    id: 'format_b',
    label: 'Format B Reel',
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
    autoSteps: ['Discover trending stories', 'Write reel script', 'Source real images', 'Render video slideshow'],
    manualSteps: ['You write the script', 'Upload or search images', 'AI applies design settings', 'Slideshow rendered'],
  },
]

/** Get a format by its ID */
export function getReelFormat(id: string): ReelFormat | undefined {
  return REEL_FORMATS.find(f => f.id === id)
}
