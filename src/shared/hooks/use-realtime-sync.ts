import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/api/supabase'
import { jobKeys } from '@/features/jobs/hooks/use-jobs'
import { schedulingKeys } from '@/features/scheduling/hooks/use-scheduling'
import { pipelineKeys } from '@/features/pipeline/api/pipeline-api'
import { tobyKeys } from '@/features/toby/hooks/use-toby'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import type { PipelineResponse } from '@/features/pipeline/model/types'

/**
 * Supabase Realtime → TanStack Query bridge.
 *
 * Listens for Postgres row changes via WebSocket and either:
 *   1. Delta-patches the item in cache (UPDATE with matching job_id)
 *   2. Invalidates the query group (INSERT, DELETE, or structural changes)
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

  // Delta-patch a single generation_job in all cached pipeline lists
  const patchPipelineItem = useCallback((row: Record<string, unknown>) => {
    const jobId = row.job_id as string | undefined
    if (!jobId) return false

    let patched = false
    queryClient.setQueriesData<PipelineResponse>(
      { queryKey: [...pipelineKeys.all, 'list'] },
      (old) => {
        if (!old?.items) return old
        const idx = old.items.findIndex((i) => i.job_id === jobId)
        if (idx === -1) return old

        patched = true
        const updated = { ...old, items: [...old.items] }
        const item = { ...updated.items[idx] }

        // Patch fields that commonly change during generation
        if (row.progress_percent != null) item.progress_percent = row.progress_percent as number
        if (row.status != null) item.status = row.status as string
        if (row.pipeline_status != null) item.pipeline_status = row.pipeline_status as 'pending' | 'approved' | 'rejected'
        if (row.caption != null) item.caption = row.caption as string
        if (row.title != null) item.title = row.title as string
        if (row.brand_outputs != null) item.brand_outputs = row.brand_outputs as typeof item.brand_outputs

        updated.items[idx] = item
        return updated
      },
    )
    return patched
  }, [queryClient])

  // Handle generation_jobs changes with delta patching
  const handleJobChange = useCallback(
    (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
      const event = payload.eventType

      // INSERT or DELETE → must invalidate (items moved in/out of lists)
      if (event === 'INSERT' || event === 'DELETE') {
        invalidate('pipeline', [jobKeys.all, pipelineKeys.all])
        return
      }

      // UPDATE → try delta patch first
      if (event === 'UPDATE' && payload.new) {
        const row = payload.new
        const oldRow = payload.old as Record<string, unknown> | undefined

        // If pipeline_status or status changed, the item moves between tabs
        // → must invalidate stats + lists so tab counts update
        const statusChanged =
          (oldRow?.pipeline_status != null && oldRow.pipeline_status !== row.pipeline_status) ||
          (oldRow?.status != null && oldRow.status !== row.status)

        if (statusChanged) {
          invalidate('pipeline', [jobKeys.all, pipelineKeys.all])
          return
        }

        // Try to patch in-place (progress updates, caption edits, etc.)
        const didPatch = patchPipelineItem(row)
        if (!didPatch) {
          // Item not in any cached list — invalidate as fallback
          invalidate('pipeline', [jobKeys.all, pipelineKeys.all])
        }
      }
    },
    [invalidate, patchPipelineItem],
  )

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null

    const timer = setTimeout(() => {
      channel = supabase
        .channel('db-sync')
        // generation_jobs → delta patch or invalidate
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'generation_jobs' },
          handleJobChange,
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
  }, [queryClient, invalidate, handleJobChange])
}
