import { useQuery } from '@tanstack/react-query'
import { get } from '@/shared/api/client'

export interface Agent {
  agent_id: string
  display_name: string
  personality: string
  temperature: number
  variant: string
  strategy_names: string[]
  strategy_weights: Record<string, number>
  risk_tolerance: string
  active: boolean
  is_builtin: boolean
  brand?: string
}

interface AgentsResponse {
  agents: Agent[]
}

export function useAgents() {
  return useQuery({
    queryKey: ['mission-control-agents'],
    queryFn: async () => {
      const data = await get<AgentsResponse>('/api/agents')
      return data
    },
    refetchInterval: 5000, // Refresh every 5 seconds
    staleTime: 2000,
  })
}
