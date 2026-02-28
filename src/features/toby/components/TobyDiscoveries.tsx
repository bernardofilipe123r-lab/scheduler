import { useState } from 'react'
import { Search, TrendingUp, Hash, User, Heart, MessageCircle, Eye, Clock, Filter } from 'lucide-react'
import { useTobyDiscoverySummary, useTobyDiscovery } from '../hooks'
import type { TobyDiscoveryItem, TobyDiscoverySource } from '../types'

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—'
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const METHOD_LABELS: Record<string, string> = {
  hashtag_search: 'Hashtag',
  business_discovery: 'Competitors',
  own_account: 'Own Account',
}

const METHOD_COLORS: Record<string, string> = {
  hashtag_search: 'bg-purple-50 text-purple-700',
  business_discovery: 'bg-blue-50 text-blue-700',
  own_account: 'bg-gray-50 text-gray-600',
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full ${
      METHOD_COLORS[method] || 'bg-gray-50 text-gray-600'
    }`}>
      {method === 'hashtag_search' ? <Hash className="w-3 h-3" /> : <User className="w-3 h-3" />}
      {METHOD_LABELS[method] || method}
    </span>
  )
}

function SourceRow({ source }: { source: TobyDiscoverySource }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
        <User className="w-4 h-4 text-gray-400" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900 truncate block">@{source.account}</span>
        <MethodBadge method={source.method} />
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-gray-700">{source.count}</div>
        <div className="text-[10px] text-gray-400">items</div>
      </div>
    </div>
  )
}

function DiscoveryCard({ item }: { item: TobyDiscoveryItem }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        {item.source_account && (
          <span className="text-xs font-medium text-gray-700">@{item.source_account}</span>
        )}
        {item.discovery_method && <MethodBadge method={item.discovery_method} />}
        <span className="text-[10px] text-gray-400 ml-auto">{timeAgo(item.discovered_at)}</span>
      </div>
      {item.caption && (
        <p className="text-xs text-gray-600 line-clamp-3">{item.caption}</p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-gray-500">
        {item.media_type && (
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {item.media_type === 'VIDEO' ? 'Reel' : item.media_type === 'CAROUSEL_ALBUM' ? 'Carousel' : 'Post'}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Heart className="w-3 h-3" />
          {formatNumber(item.like_count)}
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="w-3 h-3" />
          {formatNumber(item.comments_count)}
        </span>
      </div>
    </div>
  )
}

type FilterTab = 'all' | 'business_discovery' | 'own_account' | 'hashtag_search'

export function TobyDiscoveries() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const { data: summary, isLoading: summaryLoading } = useTobyDiscoverySummary()
  const { data: discoveryData, isLoading: itemsLoading } = useTobyDiscovery()

  const isLoading = summaryLoading || itemsLoading

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-100 rounded w-1/3" />
          <div className="h-20 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  if (!summary || summary.total === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-500" />
            Trending Discoveries
          </h2>
        </div>
        <div className="p-8 text-center">
          <Search className="w-8 h-8 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No discoveries yet — Toby will start scanning soon</p>
        </div>
      </div>
    )
  }

  const methodEntries = Object.entries(summary.by_method)
  const items = discoveryData?.items ?? []
  const filteredItems = activeTab === 'all' ? items : items.filter(i => i.discovery_method === activeTab)

  // Separate external sources (competitors/hashtags) from own account
  const externalSources = summary.top_sources.filter(s => s.method !== 'own_account')

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: summary.total },
    { key: 'business_discovery', label: 'Competitors', count: summary.by_method['business_discovery'] || 0 },
    { key: 'own_account', label: 'Own Account', count: summary.by_method['own_account'] || 0 },
    ...(summary.by_method['hashtag_search'] ? [{ key: 'hashtag_search' as FilterTab, label: 'Hashtags', count: summary.by_method['hashtag_search'] || 0 }] : []),
  ]

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header with last scan time */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-500" />
            Trending Discoveries
          </h2>
          <span className="text-[11px] font-medium text-gray-400">{formatNumber(summary.total)} total</span>
        </div>
        {summary.last_scan_at && (
          <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-400">
            <Clock className="w-3 h-3" />
            Last scan {timeAgo(summary.last_scan_at)}
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="px-5 py-3 flex gap-3">
        {methodEntries.map(([method, count]) => (
          <div key={method} className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{formatNumber(count)}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{METHOD_LABELS[method] || method}</div>
          </div>
        ))}
      </div>

      {/* External top sources (competitors only) */}
      {externalSources.length > 0 && (
        <>
          <div className="mx-5 border-t border-gray-100" />
          <div className="px-5 pt-3 pb-1">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3" />
              Top External Sources
            </h3>
          </div>
          <div className="px-5 pb-3 divide-y divide-gray-50">
            {externalSources.slice(0, 5).map((source) => (
              <SourceRow key={`${source.account}-${source.method}`} source={source} />
            ))}
          </div>
        </>
      )}

      {/* Top performing highlights */}
      {summary.recent_highlights.length > 0 && (
        <>
          <div className="mx-5 border-t border-gray-100" />
          <div className="px-5 pt-3 pb-1">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Heart className="w-3 h-3" />
              Top Performing
            </h3>
          </div>
          <div className="px-5 pb-4 space-y-2">
            {summary.recent_highlights.map((item) => (
              <DiscoveryCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {/* Filter tabs + Discovery feed */}
      <div className="mx-5 border-t border-gray-100" />
      <div className="px-5 pt-3 pb-1">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
          <Filter className="w-3 h-3" />
          Discovery Feed
        </h3>
        <div className="flex gap-1.5 overflow-x-auto pb-2">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-full whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>
      <div className="px-5 pb-4 space-y-2 max-h-[400px] overflow-y-auto">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <DiscoveryCard key={item.id} item={item} />
          ))
        ) : (
          <p className="text-xs text-gray-400 text-center py-4">No items found for this filter</p>
        )}
      </div>
    </div>
  )
}
