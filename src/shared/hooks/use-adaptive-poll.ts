import { useEffect, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PipelineStats } from '@/features/pipeline/model/types'

/**
 * Activity-aware polling interval hook.
 *
 * Uses three signals to determine how aggressively to poll:
 *   1. Pipeline stats cache — are jobs generating or pending review?
 *   2. Page Visibility API — is the tab in focus?
 *   3. Caller-supplied custom active check (e.g. "any post is publishing")
 *
 * Tiers:
 *   active      — content is generating/publishing, user is looking   → fast poll
 *   idle        — nothing happening, user is looking                  → slow poll
 *   background  — tab is hidden                                       → very slow or off
 */

type PollTier = 'active' | 'idle' | 'background'

interface AdaptivePollOptions {
  /** Interval when content is actively generating/publishing (ms) */
  active: number
  /** Interval when nothing is happening but user is on page (ms) */
  idle: number
  /** Interval when the browser tab is hidden (ms). Use 0 or false to disable. */
  background: number | false
  /** Optional extra check — return true to force "active" tier (e.g. publishing state) */
  isActive?: boolean
}

/** Cached pipeline stats key — matches pipelineKeys.stats() */
const PIPELINE_STATS_KEY = ['pipeline', 'stats'] as const

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden)

  useEffect(() => {
    const handler = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  return visible
}

export function useAdaptivePoll(options: AdaptivePollOptions): number | false {
  const queryClient = useQueryClient()
  const pageVisible = usePageVisible()

  const getTier = useCallback((): PollTier => {
    if (!pageVisible) return 'background'

    // Check caller-supplied active signal
    if (options.isActive) return 'active'

    // Check pipeline stats from cache (no extra fetch)
    const stats = queryClient.getQueryData<PipelineStats>(PIPELINE_STATS_KEY)
    if (stats && stats.generating > 0) return 'active'

    return 'idle'
  }, [pageVisible, options.isActive, queryClient])

  // Re-evaluate tier whenever deps change.
  // We also re-check periodically since the cached stats might update.
  const [interval, setInterval_] = useState<number | false>(() => {
    const tier = getTier()
    if (tier === 'background') return options.background
    return tier === 'active' ? options.active : options.idle
  })

  useEffect(() => {
    const update = () => {
      const tier = getTier()
      const next = tier === 'background'
        ? options.background
        : tier === 'active'
          ? options.active
          : options.idle
      setInterval_((prev) => (prev === next ? prev : next))
    }

    update()

    // Re-evaluate every 5s to catch cache changes (stats updates, etc.)
    const id = window.setInterval(update, 5_000)
    return () => window.clearInterval(id)
  }, [getTier, options.active, options.idle, options.background])

  return interval
}
