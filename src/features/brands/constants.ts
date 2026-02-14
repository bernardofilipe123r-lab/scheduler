export interface BrandInfo {
  id: string
  name: string
  color: string
  logo: string
}

// Brand theme colors - matches Python brand_colors.py
// Each brand has a primary color, and light/dark mode title and background colors
export interface BrandTheme {
  brandColor: string
  lightTitleColor: string
  lightBgColor: string
  darkTitleColor: string
  darkBgColor: string
}

export const BRAND_THEMES: Record<string, BrandTheme> = {
  healthycollege: {
    brandColor: '#004f00',      // Dark green
    lightTitleColor: '#000000',
    lightBgColor: '#dcf6c8',    // Light green
    darkTitleColor: '#ffffff',
    darkBgColor: '#004f00',     // Dark green
  },
  longevitycollege: {
    brandColor: '#019dc8',      // Cyan
    lightTitleColor: '#000000',
    lightBgColor: '#c8eaf6',    // Light cyan
    darkTitleColor: '#ffffff',
    darkBgColor: '#019dc8',     // Cyan
  },
  wellbeingcollege: {
    brandColor: '#ebbe4d',      // Yellow/gold
    lightTitleColor: '#000000',
    lightBgColor: '#fff4d6',    // Light yellow
    darkTitleColor: '#ffffff',
    darkBgColor: '#ebbe4d',     // Yellow
  },
  vitalitycollege: {
    brandColor: '#028f7a',      // Teal
    lightTitleColor: '#ffffff',
    lightBgColor: '#028f7a',    // Teal
    darkTitleColor: '#ffffff',
    darkBgColor: '#028f7a',     // Teal
  },
  holisticcollege: {
    brandColor: '#f0836e',      // Coral
    lightTitleColor: '#000000',
    lightBgColor: '#f9e0db',    // Light coral
    darkTitleColor: '#ffffff',
    darkBgColor: '#f0836e',     // Coral
  },
}

// Color presets for quick selection
export const COLOR_PRESETS = [
  { name: 'Forest Green', primary: '#004f00', accent: '#16a34a', colorName: 'vibrant green' },
  { name: 'Ocean Blue', primary: '#019dc8', accent: '#0ea5e9', colorName: 'ocean blue' },
  { name: 'Royal Purple', primary: '#6b21a8', accent: '#a855f7', colorName: 'royal purple' },
  { name: 'Sunset Orange', primary: '#c2410c', accent: '#f97316', colorName: 'sunset orange' },
  { name: 'Ruby Red', primary: '#9f1239', accent: '#f43f5e', colorName: 'ruby red' },
  { name: 'Golden Yellow', primary: '#a16207', accent: '#eab308', colorName: 'golden yellow' },
  { name: 'Slate Gray', primary: '#334155', accent: '#64748b', colorName: 'modern slate' },
  { name: 'Teal', primary: '#0d9488', accent: '#14b8a6', colorName: 'refreshing teal' },
]

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
