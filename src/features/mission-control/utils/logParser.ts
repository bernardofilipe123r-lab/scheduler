interface LogEntry {
  id: number
  timestamp: string
  level: string
  category: string
  message: string
  metadata?: Record<string, any>
}

export interface ParsedLogEvent {
  id: number
  timestamp: string
  icon: string
  color: string
  message: string
  agentName?: string
}

interface Agent {
  agent_id: string
  [key: string]: any
}

const MAESTRO_PATTERN = /\[MAESTRO\]/i

// Build dynamic agent pattern from actual agents
function buildAgentPattern(agents: Agent[]): RegExp {
  if (agents.length === 0) return /\[AGENT_NEVER_MATCH\]/i
  const names = agents.map(a => a.agent_id.toUpperCase()).join('|')
  return new RegExp(`\\[(${names})\\]`, 'i')
}

export function parseLog(log: LogEntry, agents: Agent[]): ParsedLogEvent {
  const AGENT_PATTERN = buildAgentPattern(agents)
  const msg = log.message
  const msgLower = msg.toLowerCase()

  // Default
  let icon = '📋'
  let color = 'text-gray-400'
  let agentName: string | undefined

  // Extract agent name
  const agentMatch = msg.match(AGENT_PATTERN)
  if (agentMatch) {
    agentName = agentMatch[1]
    icon = '🤖'
    color = 'text-cyan-400'
  }

  // Maestro
  if (MAESTRO_PATTERN.test(msg)) {
    icon = '🎼'
    color = 'text-purple-400'
  }

  // Planning/Strategy
  if (msgLower.includes('planning') || msgLower.includes('strategy')) {
    icon = '🎯'
    color = 'text-blue-400'
  }

  // Generating
  if (msgLower.includes('generating')) {
    icon = '⚡'
    color = 'text-yellow-400'
  }

  // Saved/Created
  if (msgLower.includes('saved:') || msgLower.includes('created')) {
    icon = '💾'
    color = 'text-green-400'
  }

  // API calls
  if (msgLower.includes('api ok') || msgLower.includes('api call')) {
    icon = '✅'
    color = 'text-green-400'
  }

  // Examiner
  if (msgLower.includes('examiner') || msgLower.includes('examining')) {
    icon = '🔍'
    color = 'text-indigo-400'
  }

  // Accepted
  if (msgLower.includes('accept') && !msgLower.includes('rejected')) {
    icon = '✅'
    color = 'text-green-400'
  }

  // Rejected
  if (msgLower.includes('reject')) {
    icon = '❌'
    color = 'text-red-400'
  }

  // Content types
  if (msgLower.includes('reel')) {
    icon = '🎬'
  }
  if (msgLower.includes('post')) {
    icon = '📝'
  }

  // Scheduled
  if (msgLower.includes('scheduled') || msgLower.includes('scheduling')) {
    icon = '📅'
    color = 'text-green-400'
  }

  // Warnings/Errors
  if (msgLower.includes('warning') || msgLower.includes('warn')) {
    icon = '⚠️'
    color = 'text-yellow-400'
  }
  if (msgLower.includes('error') || msgLower.includes('failed')) {
    icon = '🚨'
    color = 'text-red-400'
  }

  // Done/Complete
  if (msgLower.includes('done') || msgLower.includes('complete')) {
    icon = '✓'
    color = 'text-green-400'
  }

  return {
    id: log.id,
    timestamp: log.timestamp,
    icon,
    color,
    message: msg,
    agentName,
  }
}

export function parseLogsToEvents(logs: LogEntry[], agents: Agent[]): ParsedLogEvent[] {
  return logs.map(log => parseLog(log, agents))
}
