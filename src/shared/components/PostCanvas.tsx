/**
 * Shared Konva canvas components for rendering post images.
 * Used by both the Posts form (preview) and PostJobDetail (final rendering).
 */
import { Stage, Layer, Image as KonvaImage, Rect, Text, Line, Group } from 'react-konva'
import useImage from 'use-image'
import Konva from 'konva'
import { BRAND_CONFIG } from '@/features/brands/model/brand-config'

// ─── Constants ───────────────────────────────────────────────────────
export const CANVAS_WIDTH = 1080
export const CANVAS_HEIGHT = 1350
export const PREVIEW_SCALE = 0.4
export const GRID_PREVIEW_SCALE = 0.25

export const DEFAULT_READ_CAPTION_BOTTOM = 45
export const DEFAULT_TITLE_GAP = 40
export const DEFAULT_LOGO_GAP = 36

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  fontSize: 70,
  barWidth: 0,
  slideFontFamily: "Georgia, 'Times New Roman', serif",
  layout: {
    readCaptionBottom: DEFAULT_READ_CAPTION_BOTTOM,
    titleGap: DEFAULT_TITLE_GAP,
    logoGap: DEFAULT_LOGO_GAP,
    titlePaddingX: 45,
  },
}

export const SLIDE_FONT_OPTIONS = [
  { label: 'Georgia (Default)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Inter', value: "Inter, Arial, sans-serif" },
  { label: 'Playfair Display', value: "'Playfair Display', Georgia, serif" },
  { label: 'Lora', value: "Lora, Georgia, serif" },
  { label: 'Merriweather', value: "Merriweather, Georgia, serif" },
  { label: 'Roboto Slab', value: "'Roboto Slab', Georgia, serif" },
  { label: 'Source Serif Pro', value: "'Source Serif Pro', Georgia, serif" },
  { label: 'Libre Baskerville', value: "'Libre Baskerville', Georgia, serif" },
]

export const SETTINGS_STORAGE_KEY = 'posts-general-settings'

// Post scheduling: 2 slots/day (12AM, 12PM) with brand offsets
export const POST_BRAND_OFFSETS: Record<string, number> = {
  healthycollege: 0,
  longevitycollege: 1,
  wellbeingcollege: 2,
  vitalitycollege: 3,
  holisticcollege: 4,
}

// ─── Types ───────────────────────────────────────────────────────────
export interface LayoutConfig {
  readCaptionBottom: number
  titleGap: number
  logoGap: number
  titlePaddingX: number
}

export interface TitleConfig {
  text: string
  fontSize: number
}

export interface GeneralSettings {
  fontSize: number
  barWidth: number
  slideFontFamily?: string
  layout: LayoutConfig
  postsPerDay?: number
}

// ─── Brand configurations ────────────────────────────────────────────
export const BRAND_CONFIGS: Record<
  string,
  { name: string; color: string; colorName: string; accentColor: string }
> = {
  healthycollege: {
    name: 'Healthy College',
    color: '#22c55e',
    colorName: 'vibrant green',
    accentColor: '#16a34a',
  },
  longevitycollege: {
    name: 'Longevity College',
    color: '#0ea5e9',
    colorName: 'electric blue',
    accentColor: '#0284c7',
  },
  vitalitycollege: {
    name: 'Vitality College',
    color: '#14b8a6',
    colorName: 'teal',
    accentColor: '#0d9488',
  },
  wellbeingcollege: {
    name: 'Wellbeing College',
    color: '#eab308',
    colorName: 'golden yellow',
    accentColor: '#ca8a04',
  },
  holisticcollege: {
    name: 'Holistic College',
    color: '#f97316',
    colorName: 'coral orange',
    accentColor: '#ea580c',
  },
}

/**
 * Get brand config with dynamic fallback for unknown brands.
 */
export function getBrandConfig(brandId: string) {
  if (BRAND_CONFIGS[brandId]) return BRAND_CONFIGS[brandId]
  // Check runtime cache (populated by registerBrand via useDynamicBrands)
  const cached = BRAND_CONFIG[brandId]
  if (cached) return { name: cached.label, color: cached.color, colorName: 'custom', accentColor: cached.color }
  // Generate sensible defaults for unknown (new) brands
  const label = brandId.replace(/college$/i, ' College').replace(/^\w/, c => c.toUpperCase())
  return { name: label, color: '#6b7280', colorName: 'gray', accentColor: '#4b5563' }
}

const BRAND_ABBREVIATIONS: Record<string, string> = {
  healthycollege: 'HCO',
  holisticcollege: 'HCO',
  longevitycollege: 'LCO',
  vitalitycollege: 'VCO',
  wellbeingcollege: 'WCO',
}

/**
 * Get brand abbreviation with dynamic fallback.
 */
export function getBrandAbbreviation(brandId: string): string {
  if (BRAND_ABBREVIATIONS[brandId]) return BRAND_ABBREVIATIONS[brandId]
  // Generate abbreviation from brand ID: take first letter of each word + 'O'
  const parts = brandId.replace(/college$/i, '').split(/(?=[A-Z])/)
  return (parts[0]?.charAt(0)?.toUpperCase() || 'X') + 'CO'
}

// ─── Text-balancing helper ───────────────────────────────────────────

export interface BalancedTitle {
  lines: string[]
  fontSize: number
}

/**
 * Wrap title into lines using the ORIGINAL character-count estimation,
 * then redistribute words across the SAME number of lines to minimise
 * the length difference between lines (visual balance).
 *
 * Guarantees:
 *  - Font size is NEVER changed.
 *  - Padding is ALWAYS respected (same maxCharsPerLine as original code).
 *  - Line count is determined identically to the original greedy wrap.
 *  - Only improvement: word breaks are optimised for balanced alignment.
 */
export function balanceTitleText(
  title: string,
  maxWidth: number,
  fontSize: number,
): BalancedTitle {
  const upperText = (title || '').toUpperCase().trim()
  const words = upperText.split(/\s+/).filter(Boolean)

  if (words.length === 0) return { lines: [''], fontSize }

  // ── Same character estimation as original code ─────────────────
  const avgCharWidth = fontSize * 0.48
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth)

  // ── Step 1: Greedy wrap (identical to the original TitleLayer) ──
  const greedyLines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (test.length > maxCharsPerLine && current) {
      greedyLines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) greedyLines.push(current)

  const lineCount = greedyLines.length

  // ── Step 2: If 1 line, nothing to balance ──────────────────────
  if (lineCount <= 1) return { lines: greedyLines, fontSize }

  // ── Step 3: For N lines, try all word splits and pick the most
  //    balanced one (all lines must fit within maxCharsPerLine) ────
  if (lineCount === 2) {
    let bestLines: string[] | null = null
    let bestDiff = Infinity
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ')
      const l2 = words.slice(i).join(' ')
      if (l1.length > maxCharsPerLine || l2.length > maxCharsPerLine) continue
      const diff = Math.abs(l1.length - l2.length)
      if (diff < bestDiff) { bestDiff = diff; bestLines = [l1, l2] }
    }
    if (bestLines) return { lines: bestLines, fontSize }
  }

  if (lineCount === 3 && words.length >= 3) {
    let bestLines: string[] | null = null
    let bestDiff = Infinity
    for (let i = 1; i < words.length - 1; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const l1 = words.slice(0, i).join(' ')
        const l2 = words.slice(i, j).join(' ')
        const l3 = words.slice(j).join(' ')
        if (l1.length > maxCharsPerLine || l2.length > maxCharsPerLine || l3.length > maxCharsPerLine) continue
        const diff = Math.max(Math.abs(l1.length - l2.length), Math.abs(l2.length - l3.length), Math.abs(l1.length - l3.length))
        if (diff < bestDiff) { bestDiff = diff; bestLines = [l1, l2, l3] }
      }
    }
    if (bestLines) return { lines: bestLines, fontSize }
  }

  if (lineCount === 4 && words.length >= 4) {
    let bestLines: string[] | null = null
    let bestDiff = Infinity
    for (let i = 1; i < words.length - 2; i++) {
      for (let j = i + 1; j < words.length - 1; j++) {
        for (let k = j + 1; k < words.length; k++) {
          const l1 = words.slice(0, i).join(' ')
          const l2 = words.slice(i, j).join(' ')
          const l3 = words.slice(j, k).join(' ')
          const l4 = words.slice(k).join(' ')
          if (l1.length > maxCharsPerLine || l2.length > maxCharsPerLine ||
              l3.length > maxCharsPerLine || l4.length > maxCharsPerLine) continue
          const diff = Math.max(
            Math.abs(l1.length - l2.length),
            Math.abs(l2.length - l3.length),
            Math.abs(l3.length - l4.length),
            Math.abs(l1.length - l4.length),
          )
          if (diff < bestDiff) { bestDiff = diff; bestLines = [l1, l2, l3, l4] }
        }
      }
    }
    if (bestLines) return { lines: bestLines, fontSize }
  }

  // ── If 5+ lines, clamp to 4 by joining overflow ───────────────
  if (lineCount > 4) {
    const clamped = greedyLines.slice(0, 3)
    clamped.push(greedyLines.slice(3).join(' '))
    // Try to balance 4 lines
    const clampedWords = clamped.join(' ').split(/\s+/).filter(Boolean)
    let bestLines: string[] | null = null
    let bestDiff = Infinity
    for (let i = 1; i < clampedWords.length - 2; i++) {
      for (let j = i + 1; j < clampedWords.length - 1; j++) {
        for (let k = j + 1; k < clampedWords.length; k++) {
          const l1 = clampedWords.slice(0, i).join(' ')
          const l2 = clampedWords.slice(i, j).join(' ')
          const l3 = clampedWords.slice(j, k).join(' ')
          const l4 = clampedWords.slice(k).join(' ')
          if (l1.length > maxCharsPerLine || l2.length > maxCharsPerLine ||
              l3.length > maxCharsPerLine || l4.length > maxCharsPerLine) continue
          const diff = Math.max(
            Math.abs(l1.length - l2.length),
            Math.abs(l2.length - l3.length),
            Math.abs(l3.length - l4.length),
            Math.abs(l1.length - l4.length),
          )
          if (diff < bestDiff) { bestDiff = diff; bestLines = [l1, l2, l3, l4] }
        }
      }
    }
    if (bestLines) return { lines: bestLines, fontSize }
    // If no balanced 4-line combo fits, just clamp
    return { lines: clamped, fontSize }
  }

  // ── Fallback: clamp to max 4 lines ─────────────────────────────
  if (greedyLines.length > 4) {
    const clamped = greedyLines.slice(0, 3)
    clamped.push(greedyLines.slice(3).join(' '))
    return { lines: clamped, fontSize }
  }
  return { lines: greedyLines, fontSize }
}

// ─── Helper: calculate title height ─────────────────────────────────
export function calculateTitleHeight(
  text: string,
  fontSize: number,
  paddingX: number
): number {
  const maxWidth = CANVAS_WIDTH - paddingX * 2
  const balanced = balanceTitleText(text, maxWidth, fontSize)
  const lineHeight = fontSize * 1.1
  return (balanced.lines.length - 1) * lineHeight + fontSize
}

/**
 * Count how many lines `text` needs at `fontSize` using the char-count estimation.
 */
function countLines(text: string, maxWidth: number, fontSize: number): number {
  const avgCharWidth = fontSize * 0.48
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth)
  const upperText = (text || '').toUpperCase().trim()
  const words = upperText.split(/\s+/).filter(Boolean)
  let lineCount = 1
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    if (test.length > maxCharsPerLine && current) {
      lineCount++
      current = word
    } else {
      current = test
    }
  }
  return lineCount
}

const AUTO_FIT_BASE = 80  // Starting font size
const AUTO_FIT_MAX = 90   // Max we'll try bumping to

/**
 * Find the best font size using the base-80 algorithm.
 * Acceptable line counts: 2, 3, or 4. NEVER 1, NEVER 5+.
 * Priority: 3 lines preferred > 4 lines > 2 lines.
 */
export function autoFitFontSize(
  text: string,
  maxWidth: number,
  _startSize: number,
  _maxLines: number,
): number {
  // Step 1: Count lines at base font size 80
  const baseLinesCount = countLines(text, maxWidth, AUTO_FIT_BASE)

  // Step 2: If 3 lines at 80, try increasing font (81, 82...) while still 3 lines
  if (baseLinesCount === 3) {
    let bestFs = AUTO_FIT_BASE
    for (let fs = AUTO_FIT_BASE + 1; fs <= AUTO_FIT_MAX; fs++) {
      if (countLines(text, maxWidth, fs) === 3) {
        bestFs = fs
      } else {
        break  // went to 4 lines, stop
      }
    }
    return bestFs
  }

  // Step 3: If 2 lines at 80, try increasing font while still 2 lines
  if (baseLinesCount <= 2) {
    let bestFs = AUTO_FIT_BASE
    for (let fs = AUTO_FIT_BASE + 1; fs <= AUTO_FIT_MAX; fs++) {
      if (countLines(text, maxWidth, fs) <= 2) {
        bestFs = fs
      } else {
        break
      }
    }
    return bestFs
  }

  // Step 4: If 4 lines at 80, that's acceptable — try increasing slightly
  if (baseLinesCount === 4) {
    let bestFs = AUTO_FIT_BASE
    for (let fs = AUTO_FIT_BASE + 1; fs <= AUTO_FIT_MAX; fs++) {
      if (countLines(text, maxWidth, fs) === 4) {
        bestFs = fs
      } else {
        break
      }
    }
    return bestFs
  }

  // Step 5: 5+ lines at 80 — reduce font to get exactly 4 lines
  for (let fs = AUTO_FIT_BASE - 1; fs >= 40; fs--) {
    if (countLines(text, maxWidth, fs) <= 4) {
      return fs
    }
  }

  return AUTO_FIT_BASE  // ultimate fallback
}

// ─── Load / save general settings ────────────────────────────────────
export function loadGeneralSettings(): GeneralSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<GeneralSettings>
      return {
        ...DEFAULT_GENERAL_SETTINGS,
        ...parsed,
        layout: {
          ...DEFAULT_GENERAL_SETTINGS.layout,
          ...(parsed.layout || {}),
        },
      }
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_GENERAL_SETTINGS
}

export function saveGeneralSettings(settings: GeneralSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

// ─── Konva sub-components ────────────────────────────────────────────

/** Full-canvas background image. */
export function BackgroundImageLayer({ imageUrl }: { imageUrl: string }) {
  const [image] = useImage(imageUrl, 'anonymous')
  if (!image) {
    // Show placeholder while image loads to prevent blank canvas caching
    return (
      <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="#1a1a2e" />
    )
  }
  return (
    <KonvaImage
      image={image}
      x={0}
      y={0}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
    />
  )
}

/** Bottom-half gradient overlay. */
export function GradientOverlay() {
  return (
    <Rect
      x={0}
      y={CANVAS_HEIGHT * 0.4}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT * 0.6}
      fillLinearGradientStartPoint={{ x: 0, y: 0 }}
      fillLinearGradientEndPoint={{ x: 0, y: CANVAS_HEIGHT * 0.6 }}
      fillLinearGradientColorStops={[
        0,
        'rgba(0,0,0,0)',
        0.3,
        'rgba(0,0,0,0.5)',
        1,
        'rgba(0,0,0,0.95)',
      ]}
      listening={false}
    />
  )
}

/** Logo bar with horizontal lines — always shows brand abbreviation (HCO, LCO, etc.). */
export function LogoWithLines({
  y,
  barWidth,
  titleWidth,
  brandName,
}: {
  logoUrl?: string | null  // kept for API compat, ignored
  y: number
  barWidth: number
  titleWidth: number
  brandName?: string
}) {
  const logoGapWidth = 113
  const logoHeight = 40

  const effectiveBarWidth =
    barWidth === 0
      ? titleWidth / 2 - logoGapWidth / 2
      : barWidth

  const leftLineEnd = CANVAS_WIDTH / 2 - logoGapWidth / 2
  const leftLineStart = leftLineEnd - effectiveBarWidth
  const rightLineStart = CANVAS_WIDTH / 2 + logoGapWidth / 2
  const rightLineEnd = rightLineStart + effectiveBarWidth

  const abbreviation = brandName
    ? getBrandAbbreviation(brandName)
    : 'LOGO'

  return (
    <Group x={0} y={y}>
      <Line
        points={[
          Math.max(0, leftLineStart),
          logoHeight / 2,
          leftLineEnd,
          logoHeight / 2,
        ]}
        stroke="white"
        strokeWidth={2}
      />
      <Line
        points={[
          rightLineStart,
          logoHeight / 2,
          Math.min(CANVAS_WIDTH, rightLineEnd),
          logoHeight / 2,
        ]}
        stroke="white"
        strokeWidth={2}
      />
      {/* Always render brand abbreviation (HCO, LCO, VCO, WCO) */}
      <Text
        text={abbreviation}
        fontSize={28}
          fontFamily="Inter, sans-serif"
          fontStyle="bold"
          fill="white"
          width={logoGapWidth}
          align="center"
          x={(CANVAS_WIDTH - logoGapWidth) / 2}
          y={logoHeight / 2 - 14}
        />
    </Group>
  )
}

/** Title with balanced line-breaks. Always rendered UPPERCASE. */
export function TitleLayer({
  balanced,
  x,
  y,
  paddingX,
}: {
  balanced: BalancedTitle
  x: number
  y: number
  paddingX: number
}) {
  const textWidth = CANVAS_WIDTH - paddingX * 2
  const lineHeight = balanced.fontSize * 1.1

  return (
    <Group x={x} y={y}>
      {balanced.lines.map((line, i) => (
        <Text
          key={i}
          text={line}
          fontSize={balanced.fontSize}
          fontFamily="Anton"
          fontStyle="normal"
          fill="white"
          width={textWidth}
          align="center"
          y={i * lineHeight}
        />
      ))}
    </Group>
  )
}

/** Bottom label — "Swipe" for carousel or "Read Caption" fallback. */
export function ReadCaption({ y, label }: { y: number; label?: string }) {
  return (
    <Text
      text={label || 'Swipe'}
      fontSize={24}
      fontFamily="Inter, sans-serif"
      fill="white"
      x={0}
      y={y}
      width={CANVAS_WIDTH}
      align="center"
      opacity={0.9}
    />
  )
}

// ─── Composite canvas (renders one brand preview) ────────────────────

interface PostCanvasProps {
  brand: string
  title: string
  backgroundImage: string | null
  settings: GeneralSettings
  scale?: number
  logoUrl?: string | null
  stageRef?: (node: Konva.Stage | null) => void
  /** Max lines for title. Auto-reduces font size to fit. 0 = no limit (edit mode). Default 3. */
  autoFitMaxLines?: number
}

/**
 * Renders a single brand post canvas at the given scale.
 * Optionally captures a ref to the underlying Konva.Stage for export.
 */
export function PostCanvas({
  brand,
  title,
  backgroundImage,
  settings,
  scale = GRID_PREVIEW_SCALE,
  logoUrl = null,
  stageRef,
  autoFitMaxLines = 3,
}: PostCanvasProps) {
  const gl = settings.layout
  const maxWidth = CANVAS_WIDTH - gl.titlePaddingX * 2

  // Auto-fit: find largest font size that fits within maxLines (if enabled)
  const effectiveFontSize = autoFitMaxLines > 0
    ? autoFitFontSize(title || 'PLACEHOLDER', maxWidth, settings.fontSize, autoFitMaxLines)
    : settings.fontSize

  // Compute balanced title once — shared by height calc and rendering
  const balanced = balanceTitleText(
    title || 'PLACEHOLDER',
    maxWidth,
    effectiveFontSize,
  )
  const th = (balanced.lines.length - 1) * (balanced.fontSize * 1.1) + balanced.fontSize

  const rcy = CANVAS_HEIGHT - gl.readCaptionBottom - 24
  const ty = rcy - gl.titleGap - th
  const ly = ty - gl.logoGap - 40

  return (
    <Stage
      ref={stageRef as any}
      width={CANVAS_WIDTH * scale}
      height={CANVAS_HEIGHT * scale}
      scaleX={scale}
      scaleY={scale}
    >
      <Layer>
        {backgroundImage ? (
          <BackgroundImageLayer imageUrl={backgroundImage} />
        ) : (
          <Rect
            x={0}
            y={0}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            fill="#1a1a2e"
          />
        )}
        <GradientOverlay />
        <LogoWithLines
          logoUrl={logoUrl || null}
          y={ly}
          barWidth={settings.barWidth}
          titleWidth={CANVAS_WIDTH - gl.titlePaddingX * 2}
          brandName={brand}
        />
        <TitleLayer
          balanced={balanced}
          x={gl.titlePaddingX}
          y={ty}
          paddingX={gl.titlePaddingX}
        />
        <ReadCaption y={rcy} />
      </Layer>
    </Stage>
  )
}
