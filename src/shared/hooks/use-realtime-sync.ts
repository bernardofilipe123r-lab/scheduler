import { useEffect } from 'react'
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

  useEffect(() => {
    // Delay subscription by one tick to avoid React StrictMode's double-invoke
    // unmounting the channel before the WebSocket connection is established.
    let channel: ReturnType<typeof supabase.channel> | null = null

    const timer = setTimeout(() => {
      channel = supabase
        .channel('db-sync')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'generation_jobs' },
          () => {
            queryClient.invalidateQueries({ queryKey: jobKeys.all })
            queryClient.invalidateQueries({ queryKey: pipelineKeys.all })
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'scheduled_reels' },
          () => {
            queryClient.invalidateQueries({ queryKey: schedulingKeys.all })
          },
        )
        .subscribe()
    }, 0)

    return () => {
      clearTimeout(timer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [queryClient])
}
