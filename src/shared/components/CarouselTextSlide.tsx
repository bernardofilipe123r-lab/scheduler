/**
 * CarouselTextSlide — renders a beige text-only carousel slide (slides 2-4).
 *
 * Design reference: Neuroglobe-style Instagram text posts
 * - Light beige background (#f5f0eb)
 * - Top-left: brand logo/initial + brand name + @handle
 * - Center: educational text paragraph (black, large readable font)
 * - Bottom bar: SHARE (icon) | SWIPE | SAVE (icon) — no SWIPE on last slide
 */
import { useMemo } from 'react'
import { Stage, Layer, Rect, Text, Circle, Group, Image as KonvaImage } from 'react-konva'
import useImage from 'use-image'
import Konva from 'konva'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './PostCanvas'
import shareIconSrc from '@/assets/icons/share.png'
import saveIconSrc from '@/assets/icons/save.png'

// ─── Brand handle mapping ───────────────────────────────────────────
export const BRAND_HANDLES: Record<string, string> = {
  healthycollege: '@thehealthycollege',
  longevitycollege: '@thelongevitycollege',
  wellbeingcollege: '@thewellbeingcollege',
  vitalitycollege: '@thevitalitycollege',
  holisticcollege: '@theholisticcollege',
}

export const BRAND_DISPLAY_NAMES: Record<string, string> = {
  healthycollege: 'The Healthy College',
  longevitycollege: 'The Longevity College',
  wellbeingcollege: 'The Wellbeing College',
  vitalitycollege: 'The Vitality College',
  holisticcollege: 'The Holistic College',
}

const BRAND_COLORS: Record<string, string> = {
  healthycollege: '#22c55e',
  longevitycollege: '#0ea5e9',
  wellbeingcollege: '#eab308',
  vitalitycollege: '#14b8a6',
  holisticcollege: '#f97316',
}

const BG_COLOR = '#f5f0eb'
const TEXT_COLOR = '#1a1a1a'
const SUBTLE_COLOR = '#888888'

// ─── Estimate text height for vertical centering ────────────────────
function estimateTextHeight(
  text: string,
  fontSize: number,
  lineHeight: number,
  maxWidth: number,
): number {
  // Approximate word-wrap line count
  const avgCharWidth = fontSize * 0.48 // rough for Georgia serif
  const words = text.split(/\s+/)
  let lines = 1
  let lineWidth = 0
  for (const word of words) {
    const wordWidth = word.length * avgCharWidth
    if (lineWidth + wordWidth > maxWidth && lineWidth > 0) {
      lines++
      lineWidth = wordWidth + avgCharWidth
    } else {
      lineWidth += wordWidth + avgCharWidth
    }
  }
  return lines * fontSize * lineHeight
}

// ─── Component ──────────────────────────────────────────────────────

interface CarouselTextSlideProps {
  brand: string
  text: string
  isLastSlide: boolean
  scale?: number
  stageRef?: (node: Konva.Stage | null) => void
}

export function CarouselTextSlide({
  brand,
  text,
  isLastSlide,
  scale = 0.3,
  stageRef,
}: CarouselTextSlideProps) {
  const brandColor = BRAND_COLORS[brand] || '#0ea5e9'
  const brandName = BRAND_DISPLAY_NAMES[brand] || brand
  const handle = BRAND_HANDLES[brand] || `@the${brand}`

  // Load PNG icons
  const [shareImg] = useImage(shareIconSrc)
  const [saveImg] = useImage(saveIconSrc)

  // Replace placeholder handle in text — handles both {{brandhandle}} and {brandhandle}
  const displayText = text
    .replace(/@\{\{brandhandle\}\}/g, handle)
    .replace(/\{\{brandhandle\}\}/g, handle)
    .replace(/@\{brandhandle\}/g, handle)
    .replace(/\{brandhandle\}/g, handle)

  // Layout constants (at 1080x1350 canvas resolution)
  const PAD_X = 80
  const LOGO_SIZE = 56
  const TEXT_WIDTH = CANVAS_WIDTH - PAD_X * 2
  const BOTTOM_BAR_Y = CANVAS_HEIGHT - 120
  const ICON_SIZE = 30

  // Vertically center brand header + text in available space
  const headerBlockHeight = LOGO_SIZE + 20 // logo + spacing
  const headerTextGap = 30
  const textFontSize = 38
  const textLineHeight = 1.55

  const contentY = useMemo(() => {
    const textH = estimateTextHeight(displayText, textFontSize, textLineHeight, TEXT_WIDTH)
    const totalH = headerBlockHeight + headerTextGap + textH
    const availableH = BOTTOM_BAR_Y - 40 - 60 // between top padding and bottom bar padding
    const centered = 60 + (availableH - totalH) / 2
    return Math.max(60, Math.min(centered, 280)) // clamp reasonable range
  }, [displayText, TEXT_WIDTH, BOTTOM_BAR_Y, headerBlockHeight])

  return (
    <Stage
      ref={stageRef as any}
      width={CANVAS_WIDTH * scale}
      height={CANVAS_HEIGHT * scale}
      scaleX={scale}
      scaleY={scale}
    >
      <Layer>
        {/* Background */}
        <Rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill={BG_COLOR} />

        {/* Brand header: circle avatar + name + handle */}
        <Group x={PAD_X} y={contentY}>
          {/* Colored circle with brand initial */}
          <Circle
            x={LOGO_SIZE / 2}
            y={LOGO_SIZE / 2}
            radius={LOGO_SIZE / 2}
            fill={brandColor}
          />
          <Text
            text={brandName.charAt(0).toUpperCase()}
            fontSize={28}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fill="white"
            width={LOGO_SIZE}
            height={LOGO_SIZE}
            align="center"
            verticalAlign="middle"
            x={0}
            y={0}
          />

          {/* Brand name */}
          <Text
            text={brandName}
            fontSize={30}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fill={TEXT_COLOR}
            x={LOGO_SIZE + 16}
            y={4}
          />

          {/* Handle */}
          <Text
            text={handle}
            fontSize={24}
            fontFamily="Inter, Arial, sans-serif"
            fill={SUBTLE_COLOR}
            x={LOGO_SIZE + 16}
            y={38}
          />
        </Group>

        {/* Main text content */}
        <Text
          text={displayText}
          fontSize={textFontSize}
          fontFamily="Georgia, 'Times New Roman', serif"
          fill={TEXT_COLOR}
          x={PAD_X}
          y={contentY + headerBlockHeight + headerTextGap}
          width={TEXT_WIDTH}
          lineHeight={textLineHeight}
          wrap="word"
        />

        {/* Bottom bar: SHARE (icon) / SWIPE / SAVE (icon) — NO separator line */}
        <Group y={BOTTOM_BAR_Y}>
          {/* SHARE + icon */}
          <Text
            text="SHARE"
            fontSize={24}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fill={TEXT_COLOR}
            x={PAD_X}
            y={2}
            letterSpacing={2}
          />
          {shareImg && (
            <KonvaImage
              image={shareImg}
              x={PAD_X + 110}
              y={-2}
              width={ICON_SIZE}
              height={ICON_SIZE}
            />
          )}

          {/* SWIPE (only if not last slide) */}
          {!isLastSlide && (
            <Text
              text="SWIPE"
              fontSize={24}
              fontFamily="Inter, Arial, sans-serif"
              fontStyle="bold"
              fill={TEXT_COLOR}
              x={0}
              y={2}
              width={CANVAS_WIDTH}
              align="center"
              letterSpacing={2}
            />
          )}

          {/* SAVE icon + text */}
          <Text
            text="SAVE"
            fontSize={24}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fill={TEXT_COLOR}
            x={CANVAS_WIDTH - PAD_X - 130}
            y={2}
            letterSpacing={2}
          />
          {saveImg && (
            <KonvaImage
              image={saveImg}
              x={CANVAS_WIDTH - PAD_X - 38}
              y={-2}
              width={ICON_SIZE}
              height={ICON_SIZE}
            />
          )}
        </Group>
      </Layer>
    </Stage>
  )
}
