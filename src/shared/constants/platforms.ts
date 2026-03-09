/**
 * Platform Registry — single source of truth for all supported social platforms.
 *
 * When adding a new platform (e.g. LinkedIn):
 *   1. Add it to SUPPORTED_PLATFORMS below
 *   2. Add display name + meta to PLATFORM_META
 *   3. Every component that imports from here updates automatically.
 */

/** Canonical list of supported platform IDs — order determines UI display order. */
export const SUPPORTED_PLATFORMS = [
  'instagram',
  'facebook',
  'youtube',
  'threads',
  'tiktok',
  'bluesky',
] as const

/** Union type derived from the canonical list. */
export type Platform = (typeof SUPPORTED_PLATFORMS)[number]

/** Set for O(1) membership checks. */
export const SUPPORTED_PLATFORMS_SET: ReadonlySet<string> = new Set(SUPPORTED_PLATFORMS)

/** Display names and metadata for each platform. */
export const PLATFORM_META: Record<
  Platform,
  { label: string; emoji: string }
> = {
  instagram: { label: 'Instagram', emoji: '📸' },
  facebook:  { label: 'Facebook',  emoji: '📘' },
  youtube:   { label: 'YouTube',   emoji: '📺' },
  threads:   { label: 'Threads',   emoji: '🧵' },
  tiktok:    { label: 'TikTok',    emoji: '🎵' },
  bluesky:   { label: 'Bluesky',  emoji: '🦋' },
}

/** Type guard: is a string a valid Platform? */
export function isValidPlatform(value: string): value is Platform {
  return SUPPORTED_PLATFORMS_SET.has(value)
}

/**
 * Legacy default platforms — used only for backwards-compatible fallbacks
 * when deserializing old jobs that pre-date Threads/TikTok.
 */
export const LEGACY_DEFAULT_PLATFORMS: Platform[] = ['instagram', 'facebook', 'youtube']

// ── Content Types ────────────────────────────────────────────────────

/** Canonical list of supported content-type keys (dict keys in enabled_platforms). */
export const SUPPORTED_CONTENT_TYPES = ['reels', 'posts'] as const

/** Union type derived from the canonical content-type list. */
export type ContentType = (typeof SUPPORTED_CONTENT_TYPES)[number]

/** Display metadata for each content type. */
export const CONTENT_TYPE_META: Record<
  ContentType,
  { label: string; icon: string }
> = {
  reels: { label: 'Reels', icon: '🎬' },
  posts: { label: 'Carousels', icon: '📚' },
}

/**
 * Platforms that cannot publish a given content type.
 * TikTok's API does not support image carousel publishing.
 */
export const CONTENT_TYPE_EXCLUDED_PLATFORMS: Partial<Record<ContentType, readonly Platform[]>> = {
  posts: ['youtube', 'tiktok'],
}

/** Helper: platforms eligible for a given content type (excludes unsupported ones). */
export function getPlatformsForContentType(ct: ContentType): readonly Platform[] {
  const excluded = CONTENT_TYPE_EXCLUDED_PLATFORMS[ct]
  if (!excluded) return SUPPORTED_PLATFORMS
  return SUPPORTED_PLATFORMS.filter(p => !(excluded as readonly string[]).includes(p))
}

/**
 * Per-content-type platform selection dict.
 * `null` means "all connected platforms for all content types" (default).
 * Missing key = all connected platforms for that content type.
 */
export type EnabledPlatformsConfig = Record<ContentType, Platform[]> | null
