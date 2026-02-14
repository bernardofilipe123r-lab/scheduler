import {
  Play,
  Sparkles,
  Heart,
  Flame,
  MessageSquare,
} from 'lucide-react'
import type { TrendingItem } from '@/features/maestro/types'
import { timeAgo } from '@/features/maestro/utils'

interface TrendingPanelProps {
  items: TrendingItem[]
}

export function TrendingPanel({ items }: TrendingPanelProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Trending content discovered by Maestro&apos;s autonomous scout — scans every 4 hours
      </p>

      {items.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Flame className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No trending content found yet</p>
          <p className="text-sm mt-1">Maestro scans for viral health/wellness content every 4 hours</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <div key={item.ig_media_id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-start gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-orange-400 rounded-lg flex items-center justify-center flex-shrink-0">
                {item.media_type === 'VIDEO' ? (
                  <Play className="w-5 h-5 text-white" />
                ) : (
                  <Sparkles className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {item.source_account && (
                    <span className="text-xs font-medium text-gray-900">@{item.source_account}</span>
                  )}
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    item.discovery_method === 'hashtag_search'
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-purple-50 text-purple-600'
                  }`}>
                    {item.discovery_method === 'hashtag_search' ? 'Hashtag' : 'Competitor'}
                  </span>
                </div>
                <p className="text-sm text-gray-700 line-clamp-2">{item.caption || 'No caption'}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{item.like_count.toLocaleString()}</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{item.comments_count.toLocaleString()}</span>
                  <span>{timeAgo(item.discovered_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
