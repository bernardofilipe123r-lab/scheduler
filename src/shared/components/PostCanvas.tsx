/**
 * Shared Konva canvas components for rendering post images.
 * Used by both the Posts form (preview) and PostJobDetail (final rendering).
 */
import { Stage, Layer, Image as KonvaImage, Rect, Text, Line, Group } from 'react-konva'
import useImage from 'use-image'
import Konva from 'konva'

// ─── Constants ───────────────────────────────────────────────────────
export const CANVAS_WIDTH = 1080
export const CANVAS_HEIGHT = 1350
export const PREVIEW_SCALE = 0.4
export const GRID_PREVIEW_SCALE = 0.25

export const DEFAULT_READ_CAPTION_BOTTOM = 45
export const DEFAULT_TITLE_GAP = 80
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

// ─── Smart text-balancing engine ─────────────────────────────────────

const TITLE_FONT_FAMILY = 'Anton'
const MAX_TITLE_FONT_SIZE = 100
const MIN_TITLE_FONT_SIZE = 40

/** Singleton offscreen canvas for fast text measurement. */
let _measureCtx: CanvasRenderingContext2D | null = null
function getMeasureCtx(): CanvasRenderingContext2D {
  if (!_measureCtx) {
    const c = document.createElement('canvas')
    _measureCtx = c.getContext('2d')!
  }
  return _measureCtx
}

/** Measure pixel width of text at a given font size using Anton font. */
function measureTitleWidth(text: string, fontSize: number): number {
  const ctx = getMeasureCtx()
  ctx.font = `${fontSize}px ${TITLE_FONT_FAMILY}`
  return ctx.measureText(text).width
}

export interface BalancedTitle {
  lines: string[]
  fontSize: number
}

/**
 * Balance title text across 1–3 lines with optimal font size.
 *
 * Strategy:
 * 1. Try fitting in 1 line — maximize font size up to MAX.
 * 2. Try 2 lines — find the split point that minimises width difference.
 * 3. Try 3 lines — find the split points that minimise max width difference.
 * 4. Pick the best: fewest lines first, then largest font, then best balance.
 */
export function balanceTitleText(
  title: string,
  maxWidth: number,
  baseFontSize: number,
): BalancedTitle {
  const text = title.toUpperCase().trim()
  const words = text.split(/\s+/).filter(Boolean)

  if (words.length === 0) return { lines: [''], fontSize: baseFontSize }

  const fullText = words.join(' ')

  // ── 1 LINE: find max font size where full text fits ────────────
  if (words.length === 1 || measureTitleWidth(fullText, MIN_TITLE_FONT_SIZE) <= maxWidth) {
    // Binary-search for the largest font size that fits in 1 line
    let lo = MIN_TITLE_FONT_SIZE, hi = MAX_TITLE_FONT_SIZE, best1 = MIN_TITLE_FONT_SIZE
    while (lo <= hi) {
      const mid = Math.round((lo + hi) / 2)
      if (measureTitleWidth(fullText, mid) <= maxWidth) {
        best1 = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    if (best1 >= baseFontSize * 0.8) {
      return { lines: [fullText], fontSize: best1 }
    }
  }

  // ── Helper: best N-line split at a given font size ─────────────
  function best2Split(fs: number) {
    let bestLines: string[] | null = null
    let bestDiff = Infinity
    for (let i = 1; i < words.length; i++) {
      const l1 = words.slice(0, i).join(' ')
      const l2 = words.slice(i).join(' ')
      const w1 = measureTitleWidth(l1, fs)
      const w2 = measureTitleWidth(l2, fs)
      if (w1 > maxWidth || w2 > maxWidth) continue
      const diff = Math.abs(w1 - w2)
      if (diff < bestDiff) { bestDiff = diff; bestLines = [l1, l2] }
    }
    return bestLines ? { lines: bestLines, imbalance: bestDiff / maxWidth } : null
  }

  function best3Split(fs: number) {
    let bestLines: string[] | null = null
    let bestDiff = Infinity
    for (let i = 1; i < words.length - 1; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const l1 = words.slice(0, i).join(' ')
        const l2 = words.slice(i, j).join(' ')
        const l3 = words.slice(j).join(' ')
        const w1 = measureTitleWidth(l1, fs)
        const w2 = measureTitleWidth(l2, fs)
        const w3 = measureTitleWidth(l3, fs)
        if (w1 > maxWidth || w2 > maxWidth || w3 > maxWidth) continue
        const diff = Math.max(Math.abs(w1 - w2), Math.abs(w2 - w3), Math.abs(w1 - w3))
        if (diff < bestDiff) { bestDiff = diff; bestLines = [l1, l2, l3] }
      }
    }
    return bestLines ? { lines: bestLines, imbalance: bestDiff / maxWidth } : null
  }

  // ── 2 LINES: scan font sizes from base upward then downward ────
  if (words.length >= 2) {
    // Try upward from baseFontSize (bigger is better if balanced)
    for (let fs = MAX_TITLE_FONT_SIZE; fs >= baseFontSize; fs -= 2) {
      const r = best2Split(fs)
      if (r && r.imbalance <= 0.35) return { lines: r.lines, fontSize: fs }
    }
    // Try at baseFontSize
    const atBase = best2Split(baseFontSize)
    if (atBase && atBase.imbalance <= 0.45) {
      return { lines: atBase.lines, fontSize: baseFontSize }
    }
    // Try downward
    for (let fs = baseFontSize - 2; fs >= MIN_TITLE_FONT_SIZE; fs -= 2) {
      const r = best2Split(fs)
      if (r && r.imbalance <= 0.45) return { lines: r.lines, fontSize: fs }
    }
  }

  // ── 3 LINES: scan font sizes ───────────────────────────────────
  if (words.length >= 3) {
    for (let fs = MAX_TITLE_FONT_SIZE; fs >= baseFontSize; fs -= 2) {
      const r = best3Split(fs)
      if (r && r.imbalance <= 0.35) return { lines: r.lines, fontSize: fs }
    }
    for (let fs = baseFontSize; fs >= MIN_TITLE_FONT_SIZE; fs -= 2) {
      const r = best3Split(fs)
      if (r && r.imbalance <= 0.50) return { lines: r.lines, fontSize: fs }
    }
  }

  // ── Fallback: best effort at minimum font size ─────────────────
  const fb3 = best3Split(MIN_TITLE_FONT_SIZE)
  if (fb3) return { lines: fb3.lines, fontSize: MIN_TITLE_FONT_SIZE }
  const fb2 = best2Split(MIN_TITLE_FONT_SIZE)
  if (fb2) return { lines: fb2.lines, fontSize: MIN_TITLE_FONT_SIZE }
  return { lines: [fullText], fontSize: MIN_TITLE_FONT_SIZE }
}

// ─── Helper: calculate title height (uses balanced text) ────────────
export function calculateTitleHeight(
  text: string,
  fontSize: number,
  paddingX: number
): number {
  const maxWidth = CANVAS_WIDTH - paddingX * 2
  const balanced = balanceTitleText(text, maxWidth, fontSize)
  const lineHeight = balanced.fontSize * 1.1
  return (balanced.lines.length - 1) * lineHeight + balanced.fontSize
}

// ─── Load / save general settings ────────────────────────────────────
export function loadGeneralSettings(): GeneralSettings {
  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (saved) return JSON.parse(saved) as GeneralSettings
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
  if (!image) return null
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
}: PostCanvasProps) {
  const gl = settings.layout
  const maxWidth = CANVAS_WIDTH - gl.titlePaddingX * 2

  // Compute balanced title once — shared by height calc and rendering
  const balanced = balanceTitleText(
    title || 'PLACEHOLDER',
    maxWidth,
    settings.fontSize,
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
