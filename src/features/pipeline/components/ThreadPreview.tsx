import { AtSign } from 'lucide-react'
import type { PipelineItem } from '../model/types'

interface Props {
  item: PipelineItem
}

export function ThreadPreview({ item }: Props) {
  const lines = item.content_lines ?? []
  const preview = lines.slice(0, 3).join('\n')

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
