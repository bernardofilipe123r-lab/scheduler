/* ──────────────────────────────────────────────────────────────
   Skeleton / Shimmer loading components
   All page-level skeletons live here, matched to real layouts.
────────────────────────────────────────────────────────────── */
import { motion } from 'framer-motion'

// ── Base shimmer block ──────────────────────────────────────
interface SkProps {
  className?: string
  style?: React.CSSProperties
}
export function Sk({ className = '', style }: SkProps) {
  return <div className={`skeleton rounded ${className}`} style={style} />
}

// ── Inline spinner (SVG, no emoji) ─────────────────────────
interface SpinnerProps {
  size?: number
  className?: string
}
export function Spinner({ size = 28, className = '' }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 50 50"
      fill="none"
      className={`svg-spinner text-primary-500 ${className}`}
    >
      <circle
        cx="25" cy="25" r="20"
        stroke="currentColor" strokeWidth="4"
        className="opacity-20"
      />
      <circle
        cx="25" cy="25" r="20"
        stroke="currentColor" strokeWidth="4"
        strokeLinecap="round"
        className="svg-spinner-circle"
      />
    </svg>
  )
}

// ── Full-page loader (replaces old emoji PageLoader) ────────
export function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center w-full" style={{ minHeight: 'calc(100vh - 10rem)' }}>
      <div className="flex flex-col items-center gap-6">
        {/* Logo + spinning ring */}
        <motion.div
          className="relative flex items-center justify-center"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {/* Spinning arc */}
          <motion.div
            className="absolute rounded-full"
            style={{
              top: -11, right: -11, bottom: -11, left: -11,
              border: '1.5px solid transparent',
              borderTopColor: '#00435c',
              borderRightColor: 'rgba(0, 67, 92, 0.28)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.65, repeat: Infinity, ease: 'linear' }}
          />
          {/* Logo */}
          <svg width="36" height="36" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="8" width="112" height="112" rx="28" fill="#F5EDD8"/>
            <path d="M29 34L48 94H61L42 34H29Z" fill="#1A1A1A"/>
            <path d="M67 94H80L99 34H86L73.5 73.5L61 34H48L67 94Z" fill="#1A1A1A"/>
            <circle cx="99" cy="29" r="7" fill="#1A1A1A" fillOpacity="0.25"/>
            <circle cx="107" cy="40" r="3" fill="#1A1A1A" fillOpacity="0.18"/>
          </svg>
        </motion.div>
      </div>
    </div>
  )
}

// ── Full-screen app-level loader (for auth guards) ──────────
// Background exactly matches the #preloader in index.html to prevent any flicker.
export function AppLoader() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1c1917 50%, #292524 100%)' }}
    >
      {/* Logo + rings container */}
      <motion.div
        className="relative flex items-center justify-center"
        initial={{ scale: 0.72, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.34, 1.56, 0.64, 1] }}
      >
        {/* Outer counter-spinning arc */}
        <motion.div
          className="absolute rounded-full"
          style={{
            top: -27, right: -27, bottom: -27, left: -27,
            border: '1px solid transparent',
            borderTopColor: 'rgba(0, 67, 92, 0.42)',
            borderBottomColor: 'rgba(0, 67, 92, 0.14)',
          }}
          animate={{ rotate: -360 }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
        />
        {/* Inner spinning arc */}
        <motion.div
          className="absolute rounded-full"
          style={{
            top: -15, right: -15, bottom: -15, left: -15,
            border: '1.5px solid transparent',
            borderTopColor: '#00435c',
            borderRightColor: 'rgba(0, 67, 92, 0.32)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.65, repeat: Infinity, ease: 'linear' }}
        />
        {/* Radial glow behind logo */}
        <motion.div
          className="absolute rounded-[28px]"
          style={{
            top: -6, right: -6, bottom: -6, left: -6,
            background: 'radial-gradient(circle at center, rgba(0,67,92,0.38) 0%, transparent 68%)',
          }}
          animate={{ opacity: [0.45, 0.9, 0.45] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Logo */}
        <svg width="80" height="80" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="8" width="112" height="112" rx="28" fill="#F5EDD8"/>
          <path d="M29 34L48 94H61L42 34H29Z" fill="#1A1A1A"/>
          <path d="M67 94H80L99 34H86L73.5 73.5L61 34H48L67 94Z" fill="#1A1A1A"/>
          <circle cx="99" cy="29" r="7" fill="#1A1A1A" fillOpacity="0.25"/>
          <circle cx="107" cy="40" r="3" fill="#1A1A1A" fillOpacity="0.18"/>
        </svg>
      </motion.div>

      {/* Three staggered bouncing dots */}
      <motion.div
        className="flex gap-[7px] mt-[44px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-[5px] h-[5px] rounded-full"
            style={{ background: '#00435c' }}
            animate={{ scale: [0.45, 1, 0.45], opacity: [0.3, 1, 0.3] }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              delay: i * 0.22,
              ease: 'easeInOut',
            }}
          />
        ))}
      </motion.div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// PAGE-SPECIFIC SKELETONS
// ────────────────────────────────────────────────────────────

// ── Analytics skeleton ──────────────────────────────────────
export function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Sk className="h-8 w-44 rounded-lg" />
          <Sk className="h-4 w-72 rounded" />
        </div>
        <div className="flex gap-2">
          <Sk className="h-9 w-28 rounded-lg" />
          <Sk className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 flex items-center gap-4">
        <Sk className="h-4 w-16 rounded" />
        <Sk className="h-9 w-32 rounded-lg" />
        <Sk className="h-9 w-36 rounded-lg" />
      </div>

      {/* 3 Metric cards */}
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Sk className="w-5 h-5 rounded" />
              <Sk className="h-4 w-28 rounded" />
            </div>
            <Sk className="h-8 w-24 rounded" />
          </div>
        ))}
      </div>

      {/* Chart panels */}
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <Sk className="h-5 w-52 rounded mb-2" />
          <Sk className="h-3 w-80 rounded mb-6" />
          <Sk className="h-[280px] w-full rounded-lg" />
        </div>
      ))}
    </div>
  )
}

// ── Posts skeleton ──────────────────────────────────────────
export function PostsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Sk className="h-8 w-40 rounded-lg" />
        <Sk className="h-4 w-80 rounded" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
        {/* Left column */}
        <div className="space-y-5">
          {/* Title card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <Sk className="h-4 w-20 rounded" />
            <Sk className="h-16 w-full rounded-lg" />
          </div>
          {/* AI Prompt card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <Sk className="h-4 w-28 rounded" />
            <Sk className="h-16 w-full rounded-lg" />
            <Sk className="h-7 w-32 rounded-lg" />
          </div>
          {/* Layout settings card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <Sk className="h-4 w-44 rounded" />
          </div>
        </div>
        {/* Right column */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <Sk className="h-3 w-16 rounded" />
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Sk key={i} className="h-9 rounded-lg" />
              ))}
            </div>
            <div className="border-t border-gray-100" />
            <Sk className="h-3 w-24 rounded" />
            <div className="grid grid-cols-2 gap-2">
              <Sk className="h-14 rounded-lg" />
              <Sk className="h-14 rounded-lg" />
            </div>
          </div>
          <Sk className="h-11 w-full rounded-xl" />
          <Sk className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

// ── Generator / Create Reels skeleton ───────────────────────
export function GeneratorSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <Sk className="h-8 w-44 rounded-lg" />
        <Sk className="h-4 w-72 rounded" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
        {/* Left column */}
        <div className="space-y-5">
          {/* Title card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <Sk className="h-4 w-14 rounded" />
            <Sk className="h-16 w-full rounded-lg" />
          </div>
          {/* Script card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <Sk className="h-4 w-20 rounded" />
            <Sk className="h-24 w-full rounded-lg" />
          </div>
          {/* AI Prompt card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <Sk className="h-4 w-28 rounded" />
            <Sk className="h-16 w-full rounded-lg" />
          </div>
        </div>
        {/* Right column */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <Sk className="h-3 w-16 rounded" />
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <Sk key={i} className="h-9 rounded-lg" />
              ))}
            </div>
            <div className="border-t border-gray-100" />
            <Sk className="h-3 w-20 rounded" />
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <Sk key={i} className="h-10 w-24 rounded-lg" />
              ))}
            </div>
          </div>
          <Sk className="h-11 w-full rounded-xl" />
          <Sk className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

// ── Jobs / History skeleton ─────────────────────────────────
// ⚠️ IMPORTANT FOR FUTURE AI: If you change the layout of History.tsx (Jobs page),
// update this skeleton to match. It mirrors: Header → 5 Status Cards → Filter bar
// (search + content-type toggle + variant select) → Two-column Reels/Posts sections
// with compact job row cards (left color border, meta row, title row, brand badges).
export function JobsSkeleton() {
  // A single fake job row matching History.tsx renderJobCard layout
  const jobRow = (i: number) => (
    <div key={i} className="px-3 py-2.5 rounded-lg border border-l-[3px] border-gray-200">
      {/* Row 1: ID, status badge, scheduling pill, spacer, date */}
      <div className="flex items-center gap-2">
        <Sk className="h-3 w-16 rounded" />
        <Sk className="h-5 w-16 rounded-full" />
        <Sk className="h-4 w-20 rounded-full" />
        <div className="flex-1" />
        <Sk className="h-3 w-24 rounded" />
      </div>
      {/* Row 2: Title */}
      <Sk className="h-3.5 w-4/5 rounded mt-1.5" />
      {/* Row 3: Brand badges */}
      <div className="flex gap-1 mt-1.5">
        {[0, 1].map(j => <Sk key={j} className="h-5 w-20 rounded-md" />)}
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Sk className="h-7 w-16 rounded-lg" />
          <Sk className="h-4 w-28 rounded mt-1" />
        </div>
      </div>

      {/* Status Cards — 5 cards matching History.tsx stat cards */}
      <div className="grid grid-cols-5 gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="p-4 rounded-xl border-2 border-gray-100 bg-white">
            <Sk className="w-10 h-10 rounded-lg mb-3" />
            <Sk className="h-7 w-10 rounded" />
            <Sk className="h-4 w-24 rounded mt-1" />
            <Sk className="h-3 w-full rounded mt-1" />
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4 items-center">
          {/* Search input */}
          <Sk className="h-9 flex-1 min-w-[200px] rounded-lg" />
          {/* Content type toggle (All | Reels | Posts) */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <Sk className="h-8 w-14 rounded-md" />
            <Sk className="h-8 w-16 rounded-md" />
            <Sk className="h-8 w-16 rounded-md" />
          </div>
          {/* Variant select */}
          <Sk className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Two-column Reels / Posts sections */}
      <div className="grid grid-cols-2 gap-6 items-start">
        {/* Reels section */}
        <div className="space-y-1">
          <div className="flex items-center gap-3 mb-2">
            <Sk className="h-5 w-5 rounded" />
            <Sk className="h-5 w-14 rounded" />
            <Sk className="h-4 w-8 rounded" />
          </div>
          {[0, 1, 2, 3, 4, 5].map(jobRow)}
        </div>
        {/* Posts section */}
        <div className="space-y-1">
          <div className="flex items-center gap-3 mb-2">
            <Sk className="h-5 w-5 rounded" />
            <Sk className="h-5 w-14 rounded" />
            <Sk className="h-4 w-8 rounded" />
          </div>
          {[0, 1, 2].map(jobRow)}
        </div>
      </div>
    </div>
  )
}

// ── JobDetail skeleton ──────────────────────────────────────
export function JobDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Sk className="w-9 h-9 rounded-lg shrink-0" />
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-3">
            <Sk className="h-4 w-16 rounded" />
            <Sk className="h-6 w-20 rounded-full" />
          </div>
          <Sk className="h-7 w-96 rounded" />
          <Sk className="h-4 w-48 rounded" />
        </div>
        <Sk className="h-9 w-24 rounded-lg" />
      </div>

      {/* Info card */}
      <div className="bg-white rounded-[10px] border border-gray-200 shadow-sm p-6 space-y-4">
        <div className="grid grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Sk className="h-3 w-20 rounded" />
              <Sk className="h-5 w-32 rounded" />
            </div>
          ))}
        </div>
        <Sk className="h-px w-full rounded" />
        <div className="space-y-2">
          <Sk className="h-4 w-72 rounded" />
          <Sk className="h-4 w-64 rounded" />
          <Sk className="h-4 w-56 rounded" />
        </div>
      </div>

      {/* Brand outputs grid */}
      <div className="grid grid-cols-2 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-[10px] border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <Sk className="w-8 h-8 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Sk className="h-4 w-28 rounded" />
                <Sk className="h-3 w-20 rounded" />
              </div>
              <Sk className="h-5 w-16 rounded-full" />
            </div>
            <Sk className="h-40 w-full rounded-none" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Calendar / Scheduled skeleton ───────────────────────────
export function ScheduledSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Sk className="h-8 w-36 rounded-lg" />
          <Sk className="h-4 w-52 rounded" />
        </div>
        <div className="flex gap-2">
          <Sk className="h-9 w-40 rounded-lg" />
          <Sk className="h-9 w-36 rounded-lg" />
          <Sk className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="bg-white rounded-xl p-3 border border-gray-200 flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Sk key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>

      {/* Week row + day columns */}
      <div className="grid grid-cols-7 gap-3">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="space-y-2">
            <Sk className="h-6 w-full rounded-lg" />
            <div className="space-y-2">
              {[0, 1].map((j) => (
                <div key={j} className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
                  <Sk className="h-3 w-16 rounded" />
                  <Sk className="h-4 w-full rounded" />
                  <Sk className="h-4 w-3/4 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Brands list skeleton (MyBrandsTab) ──────────────────────
export function BrandsSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="flex items-stretch">
            {/* Offset bar */}
            <Sk className="w-20 shrink-0 rounded-none" style={{ minHeight: 100 }} />
            {/* Card body */}
            <div className="flex-1 p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Sk className="w-12 h-12 rounded-xl shrink-0" />
                  <div className="space-y-1.5">
                    <Sk className="h-4 w-36 rounded" />
                    <Sk className="h-3 w-24 rounded" />
                  </div>
                </div>
                <Sk className="h-5 w-12 rounded" />
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                {[0, 1, 2, 3, 4].map((j) => (
                  <Sk key={j} className="h-6 w-14 rounded-md" />
                ))}
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Sk className="h-8 w-20 rounded-lg" />
                <Sk className="h-8 w-20 rounded-lg" />
                <Sk className="h-8 w-8 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Connections skeleton ────────────────────────────────────
export function ConnectionsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <Sk className="w-5 h-5 rounded-full" />
            <Sk className="h-4 w-20 rounded" />
          </div>
        ))}
      </div>

      {/* Connection cards grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            {/* Card header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <Sk className="w-10 h-10 rounded-xl" />
              <div className="space-y-1.5 flex-1">
                <Sk className="h-4 w-36 rounded" />
                <Sk className="h-3 w-24 rounded" />
              </div>
              <Sk className="h-6 w-16 rounded-full" />
            </div>
            {/* Platform rows */}
            <div className="divide-y divide-gray-50">
              {[0, 1, 2].map((j) => (
                <div key={j} className="flex items-center gap-3 px-5 py-3">
                  <Sk className="w-6 h-6 rounded-full" />
                  <Sk className="h-4 w-24 rounded" />
                  <div className="flex-1" />
                  <Sk className="h-6 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Settings skeleton ───────────────────────────────────────
export function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Settings category panel */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <Sk className="h-5 w-40 rounded" />
          <Sk className="h-8 w-20 rounded-lg" />
        </div>
        <div className="divide-y divide-gray-50">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 space-y-1">
                <Sk className="h-4 w-36 rounded" />
                <Sk className="h-3 w-56 rounded" />
              </div>
              <Sk className="h-9 w-48 rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* Brand credentials panel */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <Sk className="h-5 w-52 rounded mb-1" />
          <Sk className="h-3 w-80 rounded" />
        </div>
        <SettingsBrandIdsSkeleton />
      </div>
    </div>
  )
}

// ── Settings brand IDs inner skeleton ──────────────────────
export function SettingsBrandIdsSkeleton() {
  return (
    <div className="divide-y divide-gray-50">
      {[0, 1, 2].map((i) => (
        <div key={i} className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <Sk className="w-8 h-8 rounded-lg" />
            <Sk className="h-4 w-32 rounded" />
          </div>
          <div className="grid grid-cols-3 gap-3 pl-11">
            {[0, 1, 2].map((j) => (
              <div key={j} className="space-y-1.5">
                <Sk className="h-3 w-24 rounded" />
                <Sk className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── NicheConfig / Content DNA skeleton ─────────────────────
export function NicheConfigSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="space-y-1.5">
          <Sk className="h-5 w-40 rounded" />
          <Sk className="h-3 w-72 rounded" />
        </div>
        <Sk className="h-9 w-24 rounded-lg" />
      </div>
      {/* Form fields */}
      <div className="p-6 space-y-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Sk className="h-4 w-28 rounded" />
            <Sk className="h-20 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── BrandThemeModal skeleton ────────────────────────────────
export function BrandThemeSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      {/* Mode toggle */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <Sk className="h-8 flex-1 rounded-md" />
        <Sk className="h-8 flex-1 rounded-md" />
      </div>
      {/* Canvas preview */}
      <Sk className="w-full rounded-xl" style={{ aspectRatio: '9/16', maxHeight: 420 }} />
      {/* Controls */}
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Sk className="h-4 w-24 rounded" />
            <Sk className="h-9 flex-1 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Home / Dashboard skeleton ───────────────────────────────
// ⚠️ IMPORTANT FOR FUTURE AI: If you change the layout of Home.tsx, update this
// skeleton to match. It mirrors: Greeting → Stats strip → Today's Coverage →
// Row2 (Brand Health | Jobs Queue | Publishing Today) → Recent Jobs table.
export function HomeSkeleton() {
  return (
    <div className="space-y-6">
      {/* Greeting + Quick actions */}
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Sk className="h-8 w-56 rounded-lg" />
          <Sk className="h-4 w-72 rounded" />
        </div>
        <div className="flex gap-2">
          <Sk className="h-10 w-28 rounded-lg" />
          <Sk className="h-10 w-28 rounded-lg" />
        </div>
      </div>

      {/* Stats strip — 5 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <Sk className="h-3 w-20 rounded mb-2" />
            <Sk className="h-7 w-14 rounded" />
            <Sk className="h-2.5 w-24 rounded mt-2" />
          </div>
        ))}
      </div>

      {/* Today's Coverage panel */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="space-y-1.5">
            <Sk className="h-3 w-28 rounded" />
            <Sk className="h-2.5 w-64 rounded" />
          </div>
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Sk key={i} className="h-6 w-16 rounded" />
            ))}
          </div>
        </div>
        {/* Brand rows */}
        <div className="divide-y divide-gray-50">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-2.5">
              {/* Brand name */}
              <div className="flex items-center gap-2 w-36 shrink-0">
                <Sk className="w-5 h-5 rounded shrink-0" />
                <Sk className="h-3 w-24 rounded" />
              </div>
              {/* Slot chips */}
              <div className="flex items-center gap-1.5 flex-1">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((j) => (
                  <Sk key={j} className="h-8 w-8 rounded" />
                ))}
              </div>
              {/* Status summary */}
              <div className="w-44 space-y-1 flex flex-col items-end shrink-0">
                <Sk className="h-3 w-32 rounded" />
                <Sk className="h-3 w-28 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Row 2: Brand Health | Jobs Queue | Publishing Today */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Brand Health */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <Sk className="h-3 w-24 rounded" />
            <Sk className="h-3 w-16 rounded" />
          </div>
          <div className="divide-y divide-gray-50">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <Sk className="w-8 h-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Sk className="h-3.5 w-28 rounded" />
                  <Sk className="h-2.5 w-16 rounded" />
                </div>
                <div className="flex gap-4 items-center">
                  <div className="space-y-1 text-right">
                    <Sk className="h-3.5 w-10 rounded ml-auto" />
                    <Sk className="h-2 w-12 rounded ml-auto" />
                  </div>
                  <div className="space-y-1 text-right">
                    <Sk className="h-3.5 w-10 rounded ml-auto" />
                    <Sk className="h-2 w-12 rounded ml-auto" />
                  </div>
                  <Sk className="w-2 h-2 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Jobs Queue */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <Sk className="h-3 w-20 rounded" />
            <Sk className="h-3 w-14 rounded" />
          </div>
          {/* Summary numbers */}
          <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-4 py-3 space-y-1">
                <Sk className="h-7 w-8 rounded" />
                <Sk className="h-2.5 w-16 rounded" />
              </div>
            ))}
          </div>
          {/* Recent job rows */}
          <div className="divide-y divide-gray-50">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 px-5 py-2.5">
                <Sk className="h-4 w-10 rounded" />
                <Sk className="w-5 h-5 rounded shrink-0" />
                <div className="flex-1 space-y-1">
                  <Sk className="h-3 w-36 rounded" />
                  <Sk className="h-2.5 w-12 rounded" />
                </div>
                <Sk className="h-4 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Publishing Today — timeline list */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <Sk className="h-3 w-36 rounded" />
            <Sk className="h-3 w-16 rounded" />
          </div>
          <div className="divide-y divide-gray-50">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                <Sk className="h-3 w-11 rounded shrink-0" />
                <Sk className="w-px h-6 rounded shrink-0" />
                <div className="flex-1 space-y-1">
                  <Sk className="h-3 w-28 rounded" />
                  <Sk className="h-2.5 w-20 rounded" />
                </div>
                <Sk className="w-5 h-5 rounded shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Jobs table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <Sk className="h-3 w-20 rounded" />
          <Sk className="h-3 w-14 rounded" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['w-12', 'w-48', 'w-28', 'w-20', 'w-24'].map((w, i) => (
                  <th key={i} className="px-5 py-2.5 text-left">
                    <Sk className={`h-2.5 ${w} rounded`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-5 py-2.5"><Sk className="h-4 w-10 rounded" /></td>
                  <td className="px-5 py-2.5"><Sk className="h-3.5 w-44 rounded" /></td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <Sk className="w-5 h-5 rounded shrink-0" />
                      <Sk className="h-3 w-20 rounded" />
                    </div>
                  </td>
                  <td className="px-5 py-2.5"><Sk className="h-4 w-16 rounded-full" /></td>
                  <td className="px-5 py-2.5"><Sk className="h-3 w-14 rounded" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
