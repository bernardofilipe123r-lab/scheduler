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
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/30 backdrop-blur-md px-2.5 py-1 rounded-full">
          {slides.slice(0, Math.min(slides.length, 5)).map((_, i) => (
            <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-white' : 'bg-white/40'}`} />
          ))}
          <span className="text-[9px] text-white/70 font-medium ml-0.5">1/{slides.length}</span>
        </div>
      )}
    </div>
  )
}
