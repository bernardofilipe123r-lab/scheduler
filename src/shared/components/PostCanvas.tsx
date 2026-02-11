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
  layout: {
    readCaptionBottom: DEFAULT_READ_CAPTION_BOTTOM,
    titleGap: DEFAULT_TITLE_GAP,
    logoGap: DEFAULT_LOGO_GAP,
    titlePaddingX: 45,
  },
}

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

// ─── Helper: calculate title height ─────────────────────────────────
export function calculateTitleHeight(
  text: string,
  fontSize: number,
  paddingX: number
): number {
  const textWidth = CANVAS_WIDTH - paddingX * 2
  const avgCharWidth = fontSize * 0.48
  const maxCharsPerLine = Math.floor(textWidth / avgCharWidth)

  const upperText = text.toUpperCase()
  const words = upperText.split(' ')
  let lines = 1
  let currentLine = ''

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines++
      currentLine = word
    } else {
      currentLine = testLine
    }
  })

  const lineHeight = fontSize * 1.1
  return (lines - 1) * lineHeight + fontSize
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

/** Title with word-wrap. Always rendered UPPERCASE. */
export function TitleLayer({
  config,
  x,
  y,
  paddingX,
}: {
  config: TitleConfig
  x: number
  y: number
  paddingX: number
}) {
  const textWidth = CANVAS_WIDTH - paddingX * 2
  const upperText = config.text.toUpperCase()
  const words = upperText.split(' ')
  const lines: string[] = []
  let currentLine = ''
  const avgCharWidth = config.fontSize * 0.48
  const maxCharsPerLine = Math.floor(textWidth / avgCharWidth)

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  })
  if (currentLine) lines.push(currentLine)

  const lineHeight = config.fontSize * 1.1

  return (
    <Group x={x} y={y}>
      {lines.map((line, i) => (
        <Text
          key={i}
          text={line}
          fontSize={config.fontSize}
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
  const th = calculateTitleHeight(
    title || 'PLACEHOLDER',
    settings.fontSize,
    gl.titlePaddingX
  )
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
          config={{ text: title, fontSize: settings.fontSize }}
          x={gl.titlePaddingX}
          y={ty}
          paddingX={gl.titlePaddingX}
        />
        <ReadCaption y={rcy} />
      </Layer>
    </Stage>
  )
}
