/**
 * CarouselTextSlide — renders a beige text-only carousel slide (slides 2-4).
 *
 * Design reference: Neuroglobe-style Instagram text posts
 * - Light beige background (#f5f0eb)
 * - Top-left: brand logo/initial + brand name + @handle
 * - Center: educational text paragraph (black, large readable font)
 * - Bottom bar: SHARE ✈️ | SWIPE | SAVE 🔖 (no SWIPE on last slide)
 */
import { Stage, Layer, Rect, Text, Circle, Group } from 'react-konva'
import Konva from 'konva'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './PostCanvas'

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

  // Replace placeholder handle in text
  const displayText = text.replace(/\{\{brandhandle\}\}/g, handle).replace(/@\{\{brandhandle\}\}/g, handle)

  // Layout constants (at 1080x1350 canvas resolution)
  const PAD_X = 80
  const HEADER_Y = 220
  const LOGO_SIZE = 56
  const TEXT_START_Y = 320
  const TEXT_WIDTH = CANVAS_WIDTH - PAD_X * 2
  const BOTTOM_BAR_Y = CANVAS_HEIGHT - 120

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
        <Group x={PAD_X} y={HEADER_Y}>
          {/* Logo circle with initial */}
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
          fontSize={38}
          fontFamily="Georgia, 'Times New Roman', serif"
          fill={TEXT_COLOR}
          x={PAD_X}
          y={TEXT_START_Y}
          width={TEXT_WIDTH}
          lineHeight={1.55}
          wrap="word"
        />

        {/* Bottom bar separator line */}
        <Rect
          x={PAD_X}
          y={BOTTOM_BAR_Y - 20}
          width={TEXT_WIDTH}
          height={1}
          fill="#d4d0cb"
        />

        {/* Bottom bar: SHARE / SWIPE / SAVE */}
        <Group y={BOTTOM_BAR_Y}>
          {/* SHARE */}
          <Text
            text="SHARE  ✈"
            fontSize={24}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fill={TEXT_COLOR}
            x={PAD_X}
            y={0}
            letterSpacing={2}
          />

          {/* SWIPE (only if not last slide) */}
          {!isLastSlide && (
            <Text
              text="SWIPE"
              fontSize={24}
              fontFamily="Inter, Arial, sans-serif"
              fontStyle="bold"
              fill={TEXT_COLOR}
              x={0}
              y={0}
              width={CANVAS_WIDTH}
              align="center"
              letterSpacing={2}
            />
          )}

          {/* SAVE */}
          <Text
            text="🔖 SAVE"
            fontSize={24}
            fontFamily="Inter, Arial, sans-serif"
            fontStyle="bold"
            fill={TEXT_COLOR}
            x={CANVAS_WIDTH - PAD_X - 150}
            y={0}
            width={150}
            align="right"
            letterSpacing={2}
          />
        </Group>
      </Layer>
    </Stage>
  )
}
