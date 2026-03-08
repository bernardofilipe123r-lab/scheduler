/**
 * Reel Format Registry — single source of truth for all supported reel formats.
 *
 * When adding a new reel format:
 *   1. Add an entry to REEL_FORMATS below
 *   2. Add a ManualPanel component in ../wizard/
 *   3. Add auto-generate handler in ../wizard/CreateVideoWizard.tsx (autoGenerateHandlers map)
 *   4. If the format needs design settings, add a design tab in DesignEditorTab.tsx
 *   5. Everything else (wizard flow, brand/platform/mode selection) updates automatically
 */
import { Film, Image, type LucideIcon } from 'lucide-react'

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
  },
  {
    id: 'text_video',
    label: 'Text-Video Reel',
    description: 'Real images with text overlays as a slideshow video',
    icon: Image,
    supportsAuto: true,
    supportsManual: true,
    requiresNiche: true,
  },
]

/** Get a format by its ID */
export function getReelFormat(id: string): ReelFormat | undefined {
  return REEL_FORMATS.find(f => f.id === id)
}
