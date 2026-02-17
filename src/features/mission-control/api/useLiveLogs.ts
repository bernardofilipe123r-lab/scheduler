import { useQuery } from '@tanstack/react-query'
import { get } from '@/shared/api/client'

interface LogEntry {
  id: number
  timestamp: string
  level: string
  category: string
  message: string
  metadata?: Record<string, any>
}

interface LogsResponse {
  logs: LogEntry[]
  count: number
}

export function useLiveLogs() {
  return useQuery({
    queryKey: ['mission-control-logs'],
    queryFn: async () => {
      const data = await get<LogsResponse>('/api/logs?since_minutes=60&category=app&order=desc&limit=200')
      return data
    },
    refetchInterval: 2000, // Poll every 2 seconds
    staleTime: 0,
  })
}
