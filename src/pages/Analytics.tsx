import { useState, useMemo } from 'react'
import {
  BarChart3, Users, Eye, Zap, RefreshCw,
} from 'lucide-react'
import {
  useAnalytics,
  useRefreshAnalytics,
  useRefreshStatus,
} from '@/features/analytics'
import { useDynamicBrands } from '@/features/brands'
import { FilterBar } from '@/features/analytics/components/FilterBar'
import { OverviewTab } from '@/features/analytics/components/OverviewTab'
import { PostsTab } from '@/features/analytics/components/PostsTab'
import { AnswersTab } from '@/features/analytics/components/AnswersTab'
import { AudienceTab } from '@/features/analytics/components/AudienceTab'

const TABS = [
  { key: 'overview', label: 'Overview', icon: BarChart3 },
  { key: 'posts', label: 'Posts', icon: Eye },
  { key: 'answers', label: 'Answers', icon: Zap },
  { key: 'audience', label: 'Audience', icon: Users },
] as const

type TabKey = (typeof TABS)[number]['key']

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [selectedBrand, setSelectedBrand] = useState('all')
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  const [timeRange, setTimeRange] = useState(30)
  const { brands: dynamicBrands } = useDynamicBrands()
  const { data: analyticsData } = useAnalytics()
  const refreshMutation = useRefreshAnalytics()
  const { data: refreshStatus } = useRefreshStatus()
  const isRefreshing = refreshStatus?.is_refreshing ?? false

  const brandOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'All Brands' }]
    for (const b of dynamicBrands) opts.push({ value: b.id, label: b.label })
    for (const bm of analyticsData?.brands || []) {
      if (!opts.some((o) => o.value === bm.brand)) {
        opts.push({ value: bm.brand, label: bm.display_name })
      }
    }
    return opts
  }, [dynamicBrands, analyticsData?.brands])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7" />
            Analyze
          </h1>
          <p className="text-gray-500 mt-1">Smarter insights, better content</p>
        </div>
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={isRefreshing || refreshMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing || refreshMutation.isPending ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing\u2026' : 'Refresh'}
        </button>
      </div>

      {/* Tab navigation */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-gray-200">
        <div className="flex gap-0 shrink-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap xl:px-5 xl:gap-2 ${
                activeTab === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
        <FilterBar
          brands={brandOptions}
          selectedBrand={selectedBrand}
          setSelectedBrand={setSelectedBrand}
          selectedPlatform={selectedPlatform}
          setSelectedPlatform={setSelectedPlatform}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <OverviewTab brand={selectedBrand} platform={selectedPlatform} days={timeRange} />
      )}
      {activeTab === 'posts' && (
        <PostsTab brand={selectedBrand} days={timeRange} />
      )}
      {activeTab === 'answers' && (
        <AnswersTab brand={selectedBrand} />
      )}
      {activeTab === 'audience' && (
        <AudienceTab brand={selectedBrand} />
      )}
    </div>
  )
}
