import { useQuery } from '@tanstack/react-query'
import { Heart, Clock, MessageSquare, Reply, ExternalLink } from 'lucide-react'
import { AnalyticsSkeleton, PlatformIcon } from '@/shared/components'
import { get } from '@/shared/api'

// ─── Types ──────────────────────────────────────────────

interface CommunityComment {
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

// ─── Component ──────────────────────────────────────────

export function CommunityTab({ brand, platform }: { brand?: string; platform?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['community-comments', brand, platform],
    queryFn: async () => {
      const sp = new URLSearchParams()
      if (brand && brand !== 'all') sp.set('brand', brand)
      if (platform && platform !== 'all') sp.set('platform', platform)
      sp.set('limit', '50')
      const q = sp.toString()
      return get<{ comments: CommunityComment[]; total: number; has_more: boolean }>(`/api/analytics/v2/comments${q ? `?${q}` : ''}`)
    },
    staleTime: 5 * 60_000,
    retry: 1,
  })

  const comments = data?.comments ?? []

  if (isLoading) return <AnalyticsSkeleton />

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <MessageSquare className="w-14 h-14 text-gray-200 mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">No comments yet</h3>
        <p className="text-sm text-gray-400 mt-1 max-w-md">
          Reading comments requires Advanced Access for <span className="font-medium">instagram_business_manage_comments</span> in the Meta App Dashboard.
          Request it under App Review &rarr; Permissions and Features.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {comments.map((c) => (
        <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow transition-shadow">
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              {c.author_avatar ? (
                <img src={c.author_avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-sm font-bold">
                  {c.author_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
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
  )
}
