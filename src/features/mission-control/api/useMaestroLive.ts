import { useQuery } from '@tanstack/react-query'
import { get } from '@/shared/api/client'

interface CycleInfo {
  interval_minutes?: number
  schedule?: string
  description: string
  last_run: string | null
  is_complete?: boolean
}

export interface MaestroLiveStatus {
  is_running: boolean
  is_paused: boolean
  uptime_human: string
  total_cycles: number
  total_proposals_generated: number
  current_phase: string | null
  errors: number
  started_at: string | null
  cycles?: Record<string, CycleInfo>
  daily_config?: {
    total_reels: number
    total_posts: number
    today_reels: number
    today_posts: number
  }
  proposal_stats?: {
    total: number
    pending: number
    accepted: number
    rejected: number
  }
}

export function useMaestroLive() {
  return useQuery({
    queryKey: ['mission-control-maestro'],
    queryFn: async () => {
      const data = await get<MaestroLiveStatus>('/api/maestro/status')
      return data
    },
    refetchInterval: 5000,
    staleTime: 2000,
  })
}
