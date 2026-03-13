import { AtSign } from 'lucide-react'
import type { PipelineItem } from '../model/types'
import { getFirstBrandOutput } from '../model/types'

interface Props {
  item: PipelineItem
}

export function ThreadPreview({ item }: Props) {
  const output = getFirstBrandOutput(item)

  // Threads store their content in chain_parts; fall back to caption / content_lines
  const parts: string[] =
    output?.chain_parts && output.chain_parts.length > 0
      ? output.chain_parts
      : item.content_lines?.length
        ? item.content_lines
        : (output?.caption || item.caption)
          ? [(output?.caption || item.caption)!]
          : []

  const preview = parts.slice(0, 3).join('\n')
  const lines = parts  // keep existing "+N more lines" logic below

  return (
    <div className="w-full aspect-[4/5] rounded-lg bg-gray-50 border border-gray-200 p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <AtSign className="w-4 h-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-500">Thread</span>
      </div>
      <p className="text-sm text-gray-700 line-clamp-6 flex-1 leading-relaxed whitespace-pre-wrap">
        {preview || item.caption || 'No content preview'}
      </p>
      {lines.length > 3 && (
        <p className="text-[10px] text-gray-400 mt-2">+{lines.length - 3} more lines</p>
      )}
    </div>
  )
}
