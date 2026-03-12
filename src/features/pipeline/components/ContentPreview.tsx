import type { PipelineItem } from '../model/types'
import { getFirstBrandOutput } from '../model/types'
import { ReelPreview } from './ReelPreview'
import { CarouselPreview } from './CarouselPreview'
import { ThreadPreview } from './ThreadPreview'

interface Props {
  item: PipelineItem
}

export function ContentPreview({ item }: Props) {
  if (item.variant === 'threads') {
    return <ThreadPreview item={item} />
  }

  // Check if any brand output has carousel paths
  const output = getFirstBrandOutput(item)
  const hasCarousel = (output?.carousel_paths?.length ?? 0) > 0
  if (item.content_format === 'carousel' || hasCarousel) {
    return <CarouselPreview item={item} />
  }

  // Default: reel/post preview (works for light, dark, format_b, post)
  return <ReelPreview item={item} />
}
