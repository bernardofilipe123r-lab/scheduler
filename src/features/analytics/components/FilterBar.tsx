import { Filter, ChevronDown } from 'lucide-react'

export function FilterBar({
  brands,
  selectedBrand,
  setSelectedBrand,
  selectedPlatform,
  setSelectedPlatform,
  timeRange,
  setTimeRange,
}: {
  brands: { value: string; label: string }[]
  selectedBrand: string
  setSelectedBrand: (v: string) => void
  selectedPlatform: string
  setSelectedPlatform: (v: string) => void
  timeRange: number
  setTimeRange: (v: number) => void
}) {
  const platforms = [
    { value: 'all', label: 'All Platforms' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'youtube', label: 'YouTube' },
    { value: 'threads', label: 'Threads' },
    { value: 'tiktok', label: 'TikTok' },
  ]
  const times = [
    { value: '7', label: '7 days' },
    { value: '14', label: '14 days' },
    { value: '30', label: '30 days' },
    { value: '60', label: '60 days' },
    { value: '90', label: '90 days' },
    { value: '0', label: 'All Time' },
  ]

  return (
    <div className="flex items-center gap-2 flex-wrap shrink-0">
      <div className="flex items-center gap-1.5 text-gray-400">
        <Filter className="w-4 h-4" />
      </div>
      <div className="relative">
        <select
          value={selectedBrand}
          onChange={(e) => setSelectedBrand(e.target.value)}
          className="appearance-none bg-white border border-gray-200 rounded-lg px-2 py-1.5 pr-7 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer xl:px-3 xl:text-sm xl:pr-8"
        >
          {brands.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none xl:right-2.5" />
      </div>
      <div className="relative">
        <select
          value={selectedPlatform}
          onChange={(e) => setSelectedPlatform(e.target.value)}
          className="appearance-none bg-white border border-gray-200 rounded-lg px-2 py-1.5 pr-7 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer xl:px-3 xl:text-sm xl:pr-8"
        >
          {platforms.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none xl:right-2.5" />
      </div>
      <div className="relative">
        <select
          value={timeRange.toString()}
          onChange={(e) => setTimeRange(parseInt(e.target.value))}
          className="appearance-none bg-white border border-gray-200 rounded-lg px-2 py-1.5 pr-7 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer xl:px-3 xl:text-sm xl:pr-8"
        >
          {times.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none xl:right-2.5" />
      </div>
    </div>
  )
}
