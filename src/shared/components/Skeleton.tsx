/* ──────────────────────────────────────────────────────────────
   Skeleton / Shimmer loading components
   All page-level skeletons live here, matched to real layouts.
────────────────────────────────────────────────────────────── */

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
interface PageLoaderProps {
  /** Legacy prop kept for compat — now just controls the label */
  page?: 'videos' | 'posts' | 'calendar' | 'analytics' | 'brands' | 'jobs' | 'connections' | 'default'
}
const LABELS: Record<string, string> = {
  videos: 'Loading videos',
  posts: 'Loading posts',
  calendar: 'Loading calendar',
  analytics: 'Loading analytics',
  brands: 'Loading brands',
  jobs: 'Loading jobs',
  connections: 'Loading connections',
  default: 'Loading',
}
export function PageLoader({ page = 'default' }: PageLoaderProps) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size={40} />
        <p className="text-sm text-gray-400 font-medium tracking-wide">{LABELS[page]}</p>
      </div>
    </div>
  )
}

// ── Full-screen app-level loader (for auth guards) ──────────
export function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-5">
        {/* Logo mark */}
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" className="text-primary-500 opacity-90">
          <rect width="48" height="48" rx="12" fill="currentColor" fillOpacity="0.1" />
          <path d="M14 24 L22 32 L34 16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <Spinner size={32} />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────
// PAGE-SPECIFIC SKELETONS
// ────────────────────────────────────────────────────────────

// ── Analytics skeleton ──────────────────────────────────────
export function AnalyticsSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
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
        <div className="bg-white rounded-xl p-4 border border-gray-200 mb-6 flex items-center gap-4">
          <Sk className="h-4 w-16 rounded" />
          <Sk className="h-9 w-32 rounded-lg" />
          <Sk className="h-9 w-36 rounded-lg" />
        </div>

        {/* 3 Metric cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
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
          <div key={i} className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-6">
            <Sk className="h-5 w-52 rounded mb-2" />
            <Sk className="h-3 w-80 rounded mb-6" />
            <Sk className="h-[280px] w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Jobs / History skeleton ─────────────────────────────────
export function JobsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-5 gap-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Sk className="w-4 h-4 rounded" />
              <Sk className="h-3 w-20 rounded" />
            </div>
            <Sk className="h-7 w-10 rounded" />
            <Sk className="h-3 w-28 rounded mt-1" />
          </div>
        ))}
      </div>

      {/* Search / filter row */}
      <div className="flex gap-3">
        <Sk className="h-9 flex-1 rounded-lg" />
        <Sk className="h-9 w-28 rounded-lg" />
        <Sk className="h-9 w-24 rounded-lg" />
      </div>

      {/* Job rows */}
      <div className="space-y-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <Sk className="w-10 h-10 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Sk className="h-4 w-56 rounded" />
              <div className="flex gap-2">
                <Sk className="h-3 w-20 rounded" />
                <Sk className="h-3 w-16 rounded" />
              </div>
            </div>
            <Sk className="h-6 w-20 rounded-full" />
            <Sk className="h-4 w-28 rounded" />
          </div>
        ))}
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
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
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
          <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
          </div>
        ))}
      </div>

      {/* Row 2: 3 panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Brand Health */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <Sk className="h-3 w-24 rounded" />
            <Sk className="h-3 w-16 rounded" />
          </div>
          <div className="divide-y divide-gray-50">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <Sk className="w-8 h-8 rounded-lg shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Sk className="h-3.5 w-28 rounded" />
                  <Sk className="h-2.5 w-20 rounded" />
                </div>
                <div className="flex gap-4">
                  <div className="space-y-1 text-right">
                    <Sk className="h-3.5 w-10 rounded ml-auto" />
                    <Sk className="h-2 w-12 rounded ml-auto" />
                  </div>
                  <div className="space-y-1 text-right">
                    <Sk className="h-3.5 w-10 rounded ml-auto" />
                    <Sk className="h-2 w-12 rounded ml-auto" />
                  </div>
                  <Sk className="w-2 h-2 rounded-full self-center" />
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
          <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
            {[0, 1, 2].map((i) => (
              <div key={i} className="px-4 py-3 space-y-1">
                <Sk className="h-7 w-8 rounded" />
                <Sk className="h-2.5 w-16 rounded" />
              </div>
            ))}
          </div>
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

        {/* Publishing Today */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <Sk className="h-3 w-32 rounded" />
            <Sk className="h-3 w-16 rounded" />
          </div>
          <div className="px-5 py-3 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-1.5">
                {[0, 1, 2].map((i) => (
                  <Sk key={i} className="w-5 h-5 rounded-full ring-2 ring-white" />
                ))}
              </div>
              <Sk className="h-3.5 w-40 rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Recent Jobs table */}
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
