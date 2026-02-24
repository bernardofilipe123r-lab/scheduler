export interface BrandInfo {
  id: string
  name: string
  color: string
  logo: string
}

// Brand theme colors - matches Python brand_colors.py rendering fields
// Each brand has 3 color fields per mode that control actual reel/thumbnail rendering
export interface BrandTheme {
  brandColor: string
  lightThumbnailTextColor: string
  lightContentTitleTextColor: string
  lightContentTitleBgColor: string
  darkThumbnailTextColor: string
  darkContentTitleTextColor: string
  darkContentTitleBgColor: string
}

export const BRAND_THEMES: Record<string, BrandTheme> = {
  // No hardcoded brand themes — theme data comes from the DB (brand.colors).
  // The BrandThemeModal falls back to sensible defaults when a brand is not found here.
}

// Color presets for quick selection — master pool of 100
export interface ColorPreset {
  name: string
  primary: string
  accent: string
  colorName: string
}

export const ALL_COLOR_PRESETS: ColorPreset[] = [
  // Greens
  { name: 'Forest Green', primary: '#004f00', accent: '#16a34a', colorName: 'vibrant green' },
  { name: 'Emerald', primary: '#047857', accent: '#34d399', colorName: 'emerald green' },
  { name: 'Sage', primary: '#4d7c0f', accent: '#84cc16', colorName: 'fresh sage' },
  { name: 'Mint', primary: '#059669', accent: '#6ee7b7', colorName: 'cool mint' },
  { name: 'Lime', primary: '#65a30d', accent: '#a3e635', colorName: 'bright lime' },
  { name: 'Pine', primary: '#14532d', accent: '#22c55e', colorName: 'deep pine' },
  { name: 'Olive', primary: '#3f6212', accent: '#84cc16', colorName: 'warm olive' },
  { name: 'Jade', primary: '#065f46', accent: '#10b981', colorName: 'rich jade' },
  { name: 'Fern', primary: '#166534', accent: '#4ade80', colorName: 'lush fern' },
  { name: 'Moss', primary: '#365314', accent: '#86efac', colorName: 'earthy moss' },

  // Blues
  { name: 'Ocean Blue', primary: '#019dc8', accent: '#0ea5e9', colorName: 'ocean blue' },
  { name: 'Sky Blue', primary: '#0284c7', accent: '#38bdf8', colorName: 'sky blue' },
  { name: 'Navy', primary: '#1e3a5f', accent: '#3b82f6', colorName: 'classic navy' },
  { name: 'Cobalt', primary: '#1d4ed8', accent: '#60a5fa', colorName: 'bold cobalt' },
  { name: 'Steel Blue', primary: '#1e40af', accent: '#93c5fd', colorName: 'steel blue' },
  { name: 'Cerulean', primary: '#0369a1', accent: '#7dd3fc', colorName: 'bright cerulean' },
  { name: 'Sapphire', primary: '#1e3a8a', accent: '#6366f1', colorName: 'deep sapphire' },
  { name: 'Cornflower', primary: '#3730a3', accent: '#818cf8', colorName: 'soft cornflower' },
  { name: 'Azure', primary: '#0c4a6e', accent: '#22d3ee', colorName: 'vivid azure' },
  { name: 'Aegean', primary: '#155e75', accent: '#67e8f9', colorName: 'aegean blue' },

  // Purples
  { name: 'Royal Purple', primary: '#6b21a8', accent: '#a855f7', colorName: 'royal purple' },
  { name: 'Violet', primary: '#7c3aed', accent: '#c084fc', colorName: 'electric violet' },
  { name: 'Amethyst', primary: '#581c87', accent: '#d8b4fe', colorName: 'soft amethyst' },
  { name: 'Plum', primary: '#701a75', accent: '#e879f9', colorName: 'lush plum' },
  { name: 'Grape', primary: '#4c1d95', accent: '#8b5cf6', colorName: 'deep grape' },
  { name: 'Orchid', primary: '#86198f', accent: '#f0abfc', colorName: 'orchid pink' },
  { name: 'Mauve', primary: '#6b21a8', accent: '#d946ef', colorName: 'rich mauve' },
  { name: 'Lavender', primary: '#5b21b6', accent: '#c4b5fd', colorName: 'gentle lavender' },
  { name: 'Iris', primary: '#4338ca', accent: '#a78bfa', colorName: 'iris blue' },
  { name: 'Mulberry', primary: '#831843', accent: '#c026d3', colorName: 'dark mulberry' },

  // Oranges & Yellows
  { name: 'Sunset Orange', primary: '#c2410c', accent: '#f97316', colorName: 'sunset orange' },
  { name: 'Golden Yellow', primary: '#a16207', accent: '#eab308', colorName: 'golden yellow' },
  { name: 'Tangerine', primary: '#ea580c', accent: '#fb923c', colorName: 'bright tangerine' },
  { name: 'Amber', primary: '#b45309', accent: '#f59e0b', colorName: 'warm amber' },
  { name: 'Peach', primary: '#c2410c', accent: '#fdba74', colorName: 'soft peach' },
  { name: 'Marigold', primary: '#ca8a04', accent: '#fde047', colorName: 'vivid marigold' },
  { name: 'Apricot', primary: '#9a3412', accent: '#fed7aa', colorName: 'muted apricot' },
  { name: 'Honey', primary: '#92400e', accent: '#fbbf24', colorName: 'warm honey' },
  { name: 'Saffron', primary: '#854d0e', accent: '#facc15', colorName: 'rich saffron' },
  { name: 'Pumpkin', primary: '#9a3412', accent: '#fb923c', colorName: 'autumn pumpkin' },

  // Reds & Pinks
  { name: 'Ruby Red', primary: '#9f1239', accent: '#f43f5e', colorName: 'ruby red' },
  { name: 'Crimson', primary: '#991b1b', accent: '#ef4444', colorName: 'bold crimson' },
  { name: 'Rose', primary: '#be123c', accent: '#fb7185', colorName: 'elegant rose' },
  { name: 'Coral', primary: '#e11d48', accent: '#fda4af', colorName: 'warm coral' },
  { name: 'Scarlet', primary: '#b91c1c', accent: '#f87171', colorName: 'bright scarlet' },
  { name: 'Cherry', primary: '#881337', accent: '#fda4af', colorName: 'deep cherry' },
  { name: 'Blush', primary: '#be185d', accent: '#f9a8d4', colorName: 'gentle blush' },
  { name: 'Flamingo', primary: '#db2777', accent: '#f472b6', colorName: 'flamingo pink' },
  { name: 'Magenta', primary: '#a21caf', accent: '#f0abfc', colorName: 'hot magenta' },
  { name: 'Raspberry', primary: '#9d174d', accent: '#fb7185', colorName: 'tart raspberry' },

  // Teals & Cyans
  { name: 'Teal', primary: '#0d9488', accent: '#14b8a6', colorName: 'refreshing teal' },
  { name: 'Cyan', primary: '#0891b2', accent: '#22d3ee', colorName: 'electric cyan' },
  { name: 'Turquoise', primary: '#0f766e', accent: '#2dd4bf', colorName: 'bright turquoise' },
  { name: 'Aqua', primary: '#06b6d4', accent: '#67e8f9', colorName: 'cool aqua' },
  { name: 'Sea Green', primary: '#0d9488', accent: '#5eead4', colorName: 'sea green' },
  { name: 'Lagoon', primary: '#0e7490', accent: '#a5f3fc', colorName: 'tropical lagoon' },
  { name: 'Seafoam', primary: '#115e59', accent: '#99f6e4', colorName: 'soft seafoam' },
  { name: 'Verdigris', primary: '#134e4a', accent: '#2dd4bf', colorName: 'antique verdigris' },
  { name: 'Malachite', primary: '#047857', accent: '#34d399', colorName: 'malachite green' },
  { name: 'Spearmint', primary: '#059669', accent: '#a7f3d0', colorName: 'cool spearmint' },

  // Neutrals & Earth tones
  { name: 'Slate Gray', primary: '#334155', accent: '#64748b', colorName: 'modern slate' },
  { name: 'Charcoal', primary: '#1f2937', accent: '#6b7280', colorName: 'sleek charcoal' },
  { name: 'Storm', primary: '#374151', accent: '#9ca3af', colorName: 'stormy gray' },
  { name: 'Graphite', primary: '#27272a', accent: '#71717a', colorName: 'dark graphite' },
  { name: 'Pewter', primary: '#44403c', accent: '#a8a29e', colorName: 'soft pewter' },
  { name: 'Espresso', primary: '#3b0764', accent: '#78350f', colorName: 'dark espresso' },
  { name: 'Walnut', primary: '#451a03', accent: '#a16207', colorName: 'rich walnut' },
  { name: 'Bronze', primary: '#78350f', accent: '#d97706', colorName: 'warm bronze' },
  { name: 'Sienna', primary: '#7c2d12', accent: '#ea580c', colorName: 'burnt sienna' },
  { name: 'Mocha', primary: '#44403c', accent: '#a8a29e', colorName: 'creamy mocha' },

  // Warm tones
  { name: 'Terracotta', primary: '#9a3412', accent: '#c2410c', colorName: 'earthy terracotta' },
  { name: 'Cinnamon', primary: '#92400e', accent: '#d97706', colorName: 'spiced cinnamon' },
  { name: 'Rust', primary: '#7c2d12', accent: '#f97316', colorName: 'rustic orange' },
  { name: 'Copper', primary: '#b45309', accent: '#fbbf24', colorName: 'polished copper' },
  { name: 'Brick', primary: '#991b1b', accent: '#dc2626', colorName: 'classic brick' },
  { name: 'Wine', primary: '#881337', accent: '#be123c', colorName: 'deep wine' },
  { name: 'Burgundy', primary: '#7f1d1d', accent: '#b91c1c', colorName: 'elegant burgundy' },
  { name: 'Mahogany', primary: '#450a0a', accent: '#991b1b', colorName: 'dark mahogany' },
  { name: 'Clay', primary: '#78350f', accent: '#b45309', colorName: 'warm clay' },
  { name: 'Sandstone', primary: '#92400e', accent: '#fde68a', colorName: 'desert sandstone' },

  // Cool & modern
  { name: 'Indigo', primary: '#312e81', accent: '#6366f1', colorName: 'deep indigo' },
  { name: 'Midnight', primary: '#0f172a', accent: '#3b82f6', colorName: 'midnight blue' },
  { name: 'Arctic', primary: '#164e63', accent: '#a5f3fc', colorName: 'arctic ice' },
  { name: 'Glacier', primary: '#0c4a6e', accent: '#bae6fd', colorName: 'glacial blue' },
  { name: 'Dusk', primary: '#4a044e', accent: '#e879f9', colorName: 'twilight dusk' },
  { name: 'Twilight', primary: '#1e1b4b', accent: '#a78bfa', colorName: 'deep twilight' },
  { name: 'Eclipse', primary: '#18181b', accent: '#a855f7', colorName: 'cosmic eclipse' },
  { name: 'Nebula', primary: '#3b0764', accent: '#c084fc', colorName: 'nebula purple' },
  { name: 'Galaxy', primary: '#1e1b4b', accent: '#818cf8', colorName: 'galaxy blue' },
  { name: 'Aurora', primary: '#064e3b', accent: '#a78bfa', colorName: 'aurora glow' },

  // Vibrant & bold
  { name: 'Electric', primary: '#4f46e5', accent: '#22d3ee', colorName: 'electric pop' },
  { name: 'Neon', primary: '#059669', accent: '#fbbf24', colorName: 'neon contrast' },
  { name: 'Tropical', primary: '#0d9488', accent: '#f97316', colorName: 'tropical blend' },
  { name: 'Paradise', primary: '#0891b2', accent: '#f472b6', colorName: 'paradise mix' },
  { name: 'Festival', primary: '#c026d3', accent: '#fbbf24', colorName: 'festival vibes' },
  { name: 'Prism', primary: '#7c3aed', accent: '#06b6d4', colorName: 'prism light' },
  { name: 'Candy', primary: '#db2777', accent: '#a855f7', colorName: 'candy pop' },
  { name: 'Retro', primary: '#ca8a04', accent: '#0891b2', colorName: 'retro vibe' },
  { name: 'Pop Art', primary: '#dc2626', accent: '#2563eb', colorName: 'bold pop art' },
  { name: 'Fiesta', primary: '#ea580c', accent: '#16a34a', colorName: 'fiesta colors' },
]

/**
 * Pick `count` random presets from the master pool.
 * Uses Fisher-Yates partial shuffle for unbiased selection.
 */
export function getRandomPresets(count = 12): ColorPreset[] {
  const pool = [...ALL_COLOR_PRESETS]
  const n = Math.min(count, pool.length)
  for (let i = pool.length - 1; i > pool.length - 1 - n; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(pool.length - n)
}

/** @deprecated Use ALL_COLOR_PRESETS + getRandomPresets() instead */
export const COLOR_PRESETS = ALL_COLOR_PRESETS.slice(0, 8)

// Generate schedule times from offset and posts per day
export function generateSchedule(offset: number, postsPerDay: number): Array<{ hour: number; variant: 'light' | 'dark' }> {
  const interval = Math.floor(24 / postsPerDay)
  const slots: Array<{ hour: number; variant: 'light' | 'dark' }> = []
  
  for (let i = 0; i < postsPerDay; i++) {
    const hour = (offset + i * interval) % 24
    const variant = i % 2 === 0 ? 'light' : 'dark'
    slots.push({ hour, variant })
  }
  
  return slots
}

export function formatHour(hour: number): string {
  if (hour === 0) return '12:00 AM'
  if (hour === 12) return '12:00 PM'
  if (hour < 12) return `${hour}:00 AM`
  return `${hour - 12}:00 PM`
}

// Helper to generate light/dark mode colors from primary
export function generateModeColors(primary: string, accent: string) {
  // Lighten for light mode background
  const lightBg = adjustColorBrightness(primary, 180)
  // Darken for dark mode background
  const darkBg = adjustColorBrightness(primary, -40)
  
  return {
    light_mode: {
      background: lightBg,
      gradient_start: lightBg,
      gradient_end: adjustColorBrightness(accent, 150),
      text: '#000000',
      cta_bg: primary,
      cta_text: '#ffffff',
    },
    dark_mode: {
      background: darkBg,
      gradient_start: darkBg,
      gradient_end: adjustColorBrightness(primary, -20),
      text: '#ffffff',
      cta_bg: accent,
      cta_text: '#ffffff',
    }
  }
}

// Adjust color brightness (positive = lighter, negative = darker)
export function adjustColorBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount))
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
