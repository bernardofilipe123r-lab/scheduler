import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, RefreshCw, Filter, ChevronDown,
  ExternalLink,
  Clock, Heart, Reply,
} from 'lucide-react'
import { get } from '@/shared/api'
import { PlatformIcon } from '@/shared/components'
import { useDynamicBrands } from '@/features/brands'

// ─── Types ──────────────────────────────────────────────

interface Comment {
  id: string
  platform: string
  brand: string
  post_id: string
  post_title: string | null
  author_name: string
  author_username: string | null
  author_avatar: string | null
  text: string
  like_count: number
  reply_count: number
  created_at: string
  permalink: string | null
}

interface CommentsResponse {
  comments: Comment[]
  total: number
  has_more: boolean
}

// ─── Helpers ────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function platformColor(platform: string): string {
  switch (platform) {
    case 'instagram': return 'text-pink-500'
    case 'facebook': return 'text-blue-600'
    case 'youtube': return 'text-red-500'
    default: return 'text-gray-500'
  }
}

// ─── Main Page ──────────────────────────────────────────

export function CommunityPage() {
  const [selectedBrand, setSelectedBrand] = useState('all')
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  const { brands: dynamicBrands } = useDynamicBrands()

  const brandOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'All Brands' }]
    for (const b of dynamicBrands) opts.push({ value: b.id, label: b.label })
    return opts
  }, [dynamicBrands])

  const platforms = [
    { value: 'all', label: 'All Platforms' },
    { value: 'instagram', label: 'Instagram' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'youtube', label: 'YouTube' },
  ]

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['community-comments', selectedBrand, selectedPlatform],
    queryFn: async () => {
      const sp = new URLSearchParams()
      if (selectedBrand !== 'all') sp.set('brand', selectedBrand)
      if (selectedPlatform !== 'all') sp.set('platform', selectedPlatform)
      sp.set('limit', '50')
      const q = sp.toString()
      return get<CommentsResponse>(`/api/analytics/v2/comments${q ? `?${q}` : ''}`)
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const comments = data?.comments ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-7 h-7" />
            Community
          </h1>
          <p className="text-gray-500 mt-1">See who's engaging with your content</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Filter className="w-4 h-4" />
        </div>
        <div className="relative">
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {brandOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <div className="relative">
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 pr-8 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {platforms.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <MessageSquare className="w-14 h-14 text-gray-200 mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No comments yet</h3>
          <p className="text-sm text-gray-400 mt-1 max-w-md">
            Reading comments requires Advanced Access for <span className="font-medium">instagram_business_manage_comments</span> in the Meta App Dashboard.
            Request it under App Review &rarr; Permissions and Features.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow transition-shadow">
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="shrink-0">
                  {c.author_avatar ? (
                    <img src={c.author_avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-sm font-bold">
                      {c.author_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900">{c.author_name}</span>
                    {c.author_username && <span className="text-xs text-gray-400">@{c.author_username}</span>}
                    <PlatformIcon platform={c.platform} className={`w-3.5 h-3.5 ${platformColor(c.platform)}`} />
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {timeAgo(c.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{c.text}</p>
                  {c.post_title && (
                    <p className="text-xs text-gray-400 mt-1.5">
                      on <span className="font-medium text-gray-500">{c.post_title}</span>
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-4 mt-2">
                    {c.like_count > 0 && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Heart className="w-3 h-3" /> {c.like_count}
                      </span>
                    )}
                    {c.reply_count > 0 && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Reply className="w-3 h-3" /> {c.reply_count}
                      </span>
                    )}
                    {c.permalink && (
                      <a
                        href={c.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" /> View
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
