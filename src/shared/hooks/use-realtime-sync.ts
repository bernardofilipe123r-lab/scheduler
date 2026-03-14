import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/api/supabase'
import { jobKeys } from '@/features/jobs/hooks/use-jobs'
import { schedulingKeys } from '@/features/scheduling/hooks/use-scheduling'
import { pipelineKeys } from '@/features/pipeline/api/pipeline-api'

/**
 * Subscribe to Supabase Realtime changes on generation_jobs and scheduled_reels.
 * When a row changes, we invalidate the relevant TanStack Query cache so the UI
 * updates instantly instead of waiting for the next poll cycle.
 *
 * Call this hook once near the root of the app (e.g. in App.tsx or a layout).
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient()
  const lastInvalidatedAt = useRef(0)

  // Debounce invalidation: batch rapid-fire DB updates into a single refetch
  const invalidatePipeline = useCallback(() => {
    const now = Date.now()
    if (now - lastInvalidatedAt.current < 500) return
    lastInvalidatedAt.current = now
    queryClient.invalidateQueries({ queryKey: jobKeys.all })
    queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
  }, [queryClient])

  useEffect(() => {
    // Delay subscription by one tick to avoid React StrictMode's double-invoke
    // unmounting the channel before the WebSocket connection is established.
    let channel: ReturnType<typeof supabase.channel> | null = null

    const timer = setTimeout(() => {
      channel = supabase
        .channel('db-sync')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'generation_jobs' },
          invalidatePipeline,
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'generation_jobs' },
          invalidatePipeline,
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'generation_jobs' },
          invalidatePipeline,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'scheduled_reels' },
          () => {
            queryClient.invalidateQueries({ queryKey: schedulingKeys.all })
          },
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
  }, [queryClient, invalidatePipeline])
}
