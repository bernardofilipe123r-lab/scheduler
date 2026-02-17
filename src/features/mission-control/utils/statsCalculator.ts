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

export function calculateStats(logs: LogEntry[], startTime: number, agents: Agent[]): MissionStats {
  console.log('📊 calculateStats called:', {
    'logs type': typeof logs,
    'logs is array': Array.isArray(logs),
    'logs length': logs?.length,
    'agents type': typeof agents,
    'agents is array': Array.isArray(agents),
    'agents length': agents?.length
  })

  const now = Date.now()
  const elapsed = Math.floor((now - startTime) / 1000)

  let proposals = 0
  let accepted = 0
  let rejected = 0
  let jobs = 0
  let scheduled = 0

  // Handle undefined/null arrays
  if (!logs || !agents) {
    console.warn('⚠️ calculateStats: logs or agents is undefined, returning zeros');
    return {
      elapsed_seconds: elapsed,
      total_proposals: 0,
      accepted: 0,
      rejected: 0,
      jobs_created: 0,
      scheduled: 0,
    }
  }

  // Build dynamic agent pattern from actual agents in DB
  const agentNames = agents.map(a => a.agent_id.toUpperCase())
  const hasAgentProposal = (msg: string) => {
    if (!msg.includes('saved:')) return false
    return agentNames.some(name => msg.includes(`${name.toLowerCase()}-`))
  }

  logs.forEach(log => {
    const msg = log.message.toLowerCase()
    
    // Count proposals saved (dynamic - checks actual agent names)
    if (hasAgentProposal(msg)) {
      proposals++
    }
    
    // Count accepted proposals
    if (msg.includes('auto-accepting') || msg.includes('examiner: accept')) {
      accepted++
    }
    
    // Count rejected proposals
    if (msg.includes('examiner: reject') || msg.includes('rejected')) {
      rejected++
    }
    
    // Count jobs created
    if (msg.includes('created generation job') || msg.includes('job id: gen-')) {
      jobs++
    }
    
    // Count scheduled
    if (msg.includes('scheduled reel') || msg.includes('scheduled post') || msg.includes('auto-scheduled')) {
      scheduled++
    }
  })

  return {
    elapsed_seconds: elapsed,
    total_proposals: proposals,
    accepted,
    rejected,
    jobs_created: jobs,
    scheduled,
  }
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
