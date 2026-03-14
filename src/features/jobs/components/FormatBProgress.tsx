import { Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Custom SVG Icons ───────────────────────────────────

export function IconContent({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M8 13h3" /><path d="M8 17h6" /><path d="M8 9h1" />
    </svg>
  )
}

export function IconImages({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="3" />
      <circle cx="8.5" cy="9.5" r="2" />
      <path d="M22 15l-4.5-5a2 2 0 0 0-3 0L6 21" />
      <path d="M14 15l-1.5-1.5a2 2 0 0 0-2.8 0L6 17" />
    </svg>
  )
}

export function IconThumbnail({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 15l4-4a2 2 0 0 1 2.8 0L15 16" />
      <path d="M15 13l1.5-1.5a2 2 0 0 1 2.8 0L21 13.5" />
      <path d="M15 8h.01" />
      <path d="M8 21v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

export function IconVideo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="15" height="16" rx="3" />
      <path d="M17 8l4-2.5v13L17 16" />
      <circle cx="9.5" cy="12" r="2.5" />
    </svg>
  )
}

export function IconUpload({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M20 16.8A3 3 0 0 0 18 11h-1.3A8 8 0 1 0 4 15.3" />
    </svg>
  )
}

// ─── Step Configuration ─────────────────────────────────

const FORMAT_B_STEPS = [
  { id: 'content', label: 'Content', Icon: IconContent },
  { id: 'images', label: 'Images', Icon: IconImages },
  { id: 'thumbnail', label: 'Thumbnail', Icon: IconThumbnail },
  { id: 'video', label: 'Video', Icon: IconVideo },
  { id: 'upload', label: 'Upload', Icon: IconUpload },
]

function getActiveStep(message?: string, percent?: number): number {
  if (!message && !percent) return 0
  const msg = (message || '').toLowerCase()
  if (msg.includes('upload')) return 4
  if (msg.includes('composing video') || msg.includes('slideshow')) return 3
  if (msg.includes('composing thumbnail') || msg.includes('thumbnail')) return 2
  if (msg.includes('generating image') || msg.includes('generating images') || msg.includes('sourcing')) return 1
  if (msg.includes('generating content') || msg.includes('starting') || msg.includes('discover')) return 0
  if (typeof percent === 'number') {
    if (percent >= 80) return 4
    if (percent >= 55) return 3
    if (percent >= 40) return 2
    if (percent >= 5) return 1
  }
  return 0
}

// ─── Component ──────────────────────────────────────────

export function FormatBProgress({ message, percent, brand }: { message?: string; percent?: number; brand: string }) {
  const activeStep = getActiveStep(message, percent)
  const progressFraction = activeStep / (FORMAT_B_STEPS.length - 1)

  return (
    <div className="py-10 px-4">
      {/* Step pipeline */}
      <div className="flex items-start justify-between mb-8 relative">
        <div className="absolute top-[22px] left-[10%] right-[10%] h-[2px] bg-gray-100 rounded-full" />
        <motion.div
          className="absolute top-[22px] left-[10%] h-[2px] rounded-full bg-gradient-to-r from-teal-400 via-teal-500 to-emerald-500"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, progressFraction * 80)}%` }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        />

        {FORMAT_B_STEPS.map((step, idx) => {
          const isDone = idx < activeStep
          const isActive = idx === activeStep
          const StepIcon = step.Icon

          return (
            <div key={step.id} className="flex flex-col items-center relative z-10 flex-1">
              <motion.div
                className={`w-11 h-11 rounded-full flex items-center justify-center relative ${
                  isDone
                    ? 'bg-teal-500 text-white shadow-md shadow-teal-200/50'
                    : isActive
                      ? 'bg-stone-800 text-white shadow-xl shadow-stone-300/40'
                      : 'bg-gray-50 ring-1 ring-gray-200 text-gray-300'
                }`}
                initial={false}
                animate={{ scale: isActive ? 1.15 : isDone ? 1.05 : 0.95 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <AnimatePresence mode="wait">
                  {isDone ? (
                    <motion.div
                      key="check"
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    >
                      <Check className="w-4.5 h-4.5" strokeWidth={2.5} />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="icon"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <StepIcon className="w-[18px] h-[18px]" />
                    </motion.div>
                  )}
                </AnimatePresence>

                {isActive && (
                  <motion.span
                    className="absolute -inset-1.5 rounded-full border-2 border-stone-400/20"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: [0, 0.6, 0], scale: [0.9, 1.3, 1.5] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
                  />
                )}
                {isActive && (
                  <motion.span
                    className="absolute -inset-0.5 rounded-full border border-stone-500/10"
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </motion.div>

              <motion.span
                className={`text-[10px] mt-2.5 font-semibold tracking-wide uppercase ${
                  isDone ? 'text-teal-600' : isActive ? 'text-stone-700' : 'text-gray-300'
                }`}
                initial={false}
                animate={{ opacity: isDone || isActive ? 1 : 0.5 }}
                transition={{ duration: 0.3 }}
              >
                {step.label}
              </motion.span>
            </div>
          )
        })}
      </div>

      {/* Status text + progress bar */}
      <div className="text-center space-y-3">
        <AnimatePresence mode="wait">
          <motion.p
            key={message || brand}
            className="text-sm font-medium text-gray-600"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
          >
            {message || `Generating ${brand}...`}
          </motion.p>
        </AnimatePresence>
        {typeof percent === 'number' && (
          <div className="mx-auto max-w-xs">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 via-teal-500 to-emerald-500 relative"
                initial={{ width: 0 }}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
              </motion.div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 tabular-nums font-medium">{percent}%</p>
          </div>
        )}
      </div>
    </div>
  )
}
