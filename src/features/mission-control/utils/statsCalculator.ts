interface LogEntry {
  id: number
  timestamp: string
  level: string
  category: string
  message: string
  metadata?: Record<string, any>
}

export interface MissionStats {
  elapsed_seconds: number
  total_proposals: number
  accepted: number
  rejected: number
  jobs_created: number
  scheduled: number
}

interface Agent {
  agent_id: string
  [key: string]: any
}

export function calculateStats(logs: LogEntry[], startTime: number, _agents: Agent[]): MissionStats {
  const now = Date.now()
  const elapsed = Math.floor((now - startTime) / 1000)

  let proposals = 0
  let accepted = 0
  let rejected = 0
  let jobs = 0
  let scheduled = 0

  if (!logs) {
    return { elapsed_seconds: elapsed, total_proposals: 0, accepted: 0, rejected: 0, jobs_created: 0, scheduled: 0 }
  }

  logs.forEach(log => {
    const msg = log.message.toLowerCase()
    
    // Count proposals generated (matches "✓ Generated N proposal(s)")
    const genMatch = msg.match(/generated (\d+) proposal/)
    if (genMatch) {
      proposals += parseInt(genMatch[1])
    }
    
    // Count accepted (matches "Accepted" action from examiner)
    if (msg.includes('accepted') && (msg.includes('✅') || msg.includes('/10 ✓'))) {
      accepted++
    }
    
    // Count rejected (matches "Rejected" action from examiner)
    if (msg.includes('rejected') || msg.includes('🚫')) {
      rejected++
    }
    
    // Count jobs created (matches "Job created" or "⚙️")
    if (msg.includes('job created') || (msg.includes('⚙️') && msg.includes('job'))) {
      jobs++
    }
    
    // Count scheduled (matches "Job complete + scheduled")
    if (msg.includes('complete + scheduled') || msg.includes('📅')) {
      scheduled++
    }
  })

  return { elapsed_seconds: elapsed, total_proposals: proposals, accepted, rejected, jobs_created: jobs, scheduled }
}

export function calculatePhase(logs: LogEntry[]): string {
  if (!logs || logs.length === 0) return 'STANDBY'

  const recent = logs.slice(0, 10).map(l => l.message.toLowerCase()).join(' ')
  
  if (recent.includes('scheduled') || recent.includes('scheduling')) {
    return 'SCHEDULING'
  }
  if (recent.includes('examiner') || recent.includes('examining')) {
    return 'EXAMINATION'
  }
  if (recent.includes('generating') || recent.includes('planning') || recent.includes('saved:')) {
    return 'GENERATION'
  }
  if (recent.includes('complete') || recent.includes('done')) {
    return 'COMPLETE'
  }
  
  return 'PROCESSING'
}

export function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
