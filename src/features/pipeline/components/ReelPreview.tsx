import type { PipelineItem } from '../model/types'
import { getFirstBrandOutput } from '../model/types'

interface Props {
  item: PipelineItem
}

export function ReelPreview({ item }: Props) {
  const output = getFirstBrandOutput(item)
  const thumb = output?.thumbnail_path
  const video = output?.video_path

  return (
    <div className="relative w-full aspect-[4/5] overflow-hidden bg-gray-900">
      {thumb ? (
        <img src={thumb} alt={item.title} className="w-full h-full object-cover" />
      ) : video ? (
        <video src={video} className="w-full h-full object-cover" muted preload="metadata" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-gray-800 to-gray-900">
          <span className="text-gray-500 text-xs">No preview</span>
        </div>
      )}
      {/* Play icon overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          <div className="w-0 h-0 border-l-[10px] border-l-white border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent ml-0.5" />
        </div>
      </div>
      {/* Gradient overlay */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  )
}
