import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/api/supabase'
import { jobKeys } from '@/features/jobs/hooks/use-jobs'
import { schedulingKeys } from '@/features/scheduling/hooks/use-scheduling'
import { pipelineKeys } from '@/features/pipeline/api/pipeline-api'
import { tobyKeys } from '@/features/toby/hooks/use-toby'

/**
 * Supabase Realtime → TanStack Query bridge.
 *
 * Listens for Postgres row changes via WebSocket and invalidates the
 * matching query cache.  This is the primary update mechanism — polling
 * is just a safety fallback.
 *
 * Tables watched:
 *   generation_jobs  → jobs + pipeline cache
 *   scheduled_reels  → scheduling cache
 *   toby_state       → toby status cache
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient()
  const lastInvalidatedAt = useRef<Record<string, number>>({})

  // Debounced invalidation per group to batch rapid-fire DB updates
  const invalidate = useCallback((group: string, keys: readonly (readonly unknown[])[]) => {
    const now = Date.now()
    if (now - (lastInvalidatedAt.current[group] || 0) < 500) return
    lastInvalidatedAt.current[group] = now
    for (const key of keys) {
      queryClient.invalidateQueries({ queryKey: key })
    }
  }, [queryClient])

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    const timer = setTimeout(() => {
      channel = supabase
        .channel('db-sync')
        // generation_jobs → pipeline + jobs
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'generation_jobs' },
          () => invalidate('pipeline', [jobKeys.all, pipelineKeys.all]),
        )
        // scheduled_reels → calendar + scheduled views
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'scheduled_reels' },
          () => invalidate('scheduling', [schedulingKeys.all]),
        )
        // toby_state → toby status
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'toby_state' },
          () => invalidate('toby', [tobyKeys.status()]),
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') {
            console.warn('[realtime] Channel error — will retry')
          }
        })
    }, 0)

    return () => {
      clearTimeout(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [queryClient, invalidate])
}
