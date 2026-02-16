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

export function calculateStats(logs: LogEntry[], startTime: number): MissionStats {
  const now = Date.now()
  const elapsed = Math.floor((now - startTime) / 1000)

  let proposals = 0
  let accepted = 0
  let rejected = 0
  let jobs = 0
  let scheduled = 0

  logs.forEach(log => {
    const msg = log.message.toLowerCase()
    
    // Count proposals saved
    if (msg.includes('saved:') && (msg.includes('toby-') || msg.includes('lexi-') || msg.includes('raven-') || 
        msg.includes('apex-') || msg.includes('hex-') || msg.includes('nova-') || msg.includes('cipher-'))) {
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
  if (logs.length === 0) return 'STANDBY'
  
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
