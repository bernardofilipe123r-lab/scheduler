export function fmtSlotHour(h: number): string {
  if (h === 0) return '12AM'
  if (h === 12) return '12PM'
  return h < 12 ? `${h}AM` : `${h - 12}PM`
}

export function SlotChip({ hour, filled, isPast, isSoon, kind, variant }: { hour: number; filled: boolean; isPast: boolean; isSoon: boolean; kind: 'reel' | 'post'; variant?: 'light' | 'dark' }) {
  const label = fmtSlotHour(hour)
  const variantLabel = kind === 'reel' && variant ? (variant === 'dark' ? 'Dark' : 'Light') : ''
  const typeLabel = kind === 'reel' ? 'Reel' : 'Carousel'
  const stateLabel = filled ? 'Filled' : isPast ? 'Missed' : isSoon ? 'Up next' : 'Open'
  const tipText = [typeLabel, variantLabel, stateLabel, label].filter(Boolean).join(' · ')

  // Variant letter colors (independent of state)
  const variantLetterColor = kind === 'reel'
    ? (variant === 'dark' ? '#6366f1' : '#f59e0b')
    : undefined

  // Background & text based on state
  const lightAccent = '#f59e0b'
  const darkAccent = '#6366f1'
  let bg: string, textCls: string, border: string, iconColor: string
  if (filled) {
    bg = 'bg-green-100'; textCls = 'text-green-700'; border = 'border-green-200'
    iconColor = kind === 'reel' ? (variant === 'dark' ? darkAccent : lightAccent) : '#16a34a'
  } else if (isPast) {
    bg = 'bg-rose-50'; textCls = 'text-rose-400'; border = 'border-rose-200'
    iconColor = kind === 'reel' ? (variant === 'dark' ? '#a5b4fc' : '#fcd34d') : '#fb7185'
  } else if (isSoon) {
    bg = 'bg-amber-50'; textCls = 'text-amber-600'; border = 'border-amber-300 border-dashed'
    iconColor = kind === 'reel' ? (variant === 'dark' ? darkAccent : lightAccent) : '#f59e0b'
  } else {
    bg = 'bg-gray-50'; textCls = 'text-gray-300'; border = 'border-gray-200'
    iconColor = kind === 'reel' ? (variant === 'dark' ? '#c7d2fe' : '#fde68a') : '#d1d5db'
  }

  return (
    <span
      className={`inline-flex flex-col items-center gap-[3px] px-1.5 pt-1 pb-0.5 rounded border cursor-default select-none ${bg} ${border}`}
      title={tipText}
    >
      {/* Type icon */}
      {kind === 'reel' ? (
        // Dot + L/D letter side by side
        <span className="flex items-center gap-0.5 shrink-0">
          <span
            className="block rounded-full shrink-0"
            style={{ width: 5, height: 5, backgroundColor: iconColor }}
          />
          <span style={{ fontSize: 7, fontWeight: 700, lineHeight: 1, color: variantLetterColor }}>
            {variant === 'dark' ? 'D' : 'L'}
          </span>
        </span>
      ) : (
        // Carousel = horizontal line
        <span
          className="block rounded-full shrink-0"
          style={{ width: 8, height: 2, backgroundColor: iconColor }}
        />
      )}
      {/* Time label */}
      <span className={`text-[9px] font-mono font-bold leading-none ${textCls}`}>{label}</span>
    </span>
  )
}
