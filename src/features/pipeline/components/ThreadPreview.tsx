import { Heart, MessageCircle, Repeat2, Send } from 'lucide-react'
import type { PipelineItem } from '../model/types'
import { getFirstBrandOutput } from '../model/types'

interface Props {
  item: PipelineItem
}

function ActionIcons() {
  return (
    <div className="flex items-center gap-3 mt-2">
      {[Heart, MessageCircle, Repeat2, Send].map((Icon, i) => (
        <Icon key={i} className="w-3.5 h-3.5 text-gray-400" />
      ))}
    </div>
  )
}

export function ThreadPreview({ item }: Props) {
  const output = getFirstBrandOutput(item)
  const brandName = item.brands[0] ?? 'thread'
  const handle = brandName.toLowerCase().replace(/\s/g, '')

  // Threads store content in chain_parts; fall back to caption / content_lines
  const parts: string[] =
    output?.chain_parts && output.chain_parts.length > 0
      ? output.chain_parts
      : item.content_lines?.length
        ? item.content_lines
        : (output?.caption || item.caption)
          ? [(output?.caption || item.caption)!]
          : ['No content preview']

  // Show first post + a peek at the second (if any) to fill the card
  const visible = parts.slice(0, 2)
  const remaining = parts.length - visible.length

  return (
    <div className="w-full aspect-[4/5] rounded-xl bg-white border border-gray-200 overflow-hidden flex flex-col">
      {/* Header bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-100 bg-gray-50">
        <div className="w-3 h-3 rounded-full bg-gray-900" />
        <span className="text-[11px] font-semibold text-gray-700 tracking-wide">Threads</span>
      </div>

      {/* Posts */}
      <div className="flex-1 overflow-hidden px-3 py-2.5 space-y-0">
        {visible.map((text, idx) => {
          const isLast = idx === visible.length - 1 && remaining === 0
          return (
            <div key={idx} className="flex gap-2.5">
              {/* Avatar + connector */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[10px] font-bold">
                    {brandName[0].toUpperCase()}
                  </span>
                </div>
                {!isLast && (
                  <div className="w-0.5 flex-1 bg-gray-200 my-1 min-h-[12px]" />
                )}
              </div>

              {/* Content */}
              <div className={`flex-1 min-w-0 ${isLast ? 'pb-1' : 'pb-2'}`}>
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] font-semibold text-gray-900">{handle}</span>
                  <span className="text-[9px] text-gray-400">now</span>
                </div>
                <p className="text-[11px] leading-[1.4] text-gray-700 whitespace-pre-line line-clamp-4 mt-0.5">
                  {text}
                </p>
                <ActionIcons />
              </div>
            </div>
          )
        })}

        {/* "+N more posts" stub */}
        {remaining > 0 && (
          <div className="flex gap-2.5 opacity-50">
            <div className="flex flex-col items-center flex-shrink-0">
              <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                <span className="text-gray-500 text-[10px] font-bold">
                  {brandName[0].toUpperCase()}
                </span>
              </div>
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <span className="text-[10px] text-gray-400">+{remaining} more {remaining === 1 ? 'post' : 'posts'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
