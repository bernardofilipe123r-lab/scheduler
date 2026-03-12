import type { PipelineItem } from '../model/types'
import { getFirstBrandOutput } from '../model/types'

interface Props {
  item: PipelineItem
}

export function CarouselPreview({ item }: Props) {
  const output = getFirstBrandOutput(item)
  const slides = output?.carousel_paths ?? []
  const cover = slides[0]

  return (
    <div className="relative w-full aspect-[4/5] rounded-lg overflow-hidden bg-gray-100">
      {cover ? (
        <img src={cover} alt={item.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-gray-100 to-gray-200">
          <span className="text-gray-400 text-xs">No preview</span>
        </div>
      )}
      {slides.length > 1 && (
        <span className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full backdrop-blur-sm">
          1/{slides.length}
        </span>
      )}
    </div>
  )
}
