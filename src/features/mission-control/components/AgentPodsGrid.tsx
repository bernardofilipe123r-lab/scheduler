import { motion } from 'framer-motion'
import { Users } from 'lucide-react'
import type { Agent } from '../api/useAgents'
import { AgentPod } from './AgentPod'

interface AgentPodsGridProps {
  agents: Agent[]
  logs: any[]
}

export function AgentPodsGrid({ agents, logs }: AgentPodsGridProps) {
  console.log('🤖 AgentPodsGrid render:', {
    'agents type': typeof agents,
    'agents is array': Array.isArray(agents),
    'agents length': agents?.length,
    'logs type': typeof logs,
    'logs is array': Array.isArray(logs),
    'logs length': logs?.length
  })

  if (!agents || agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-gray-500">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="font-mono">No active agents detected</p>
        </div>
      </div>
    )
  }

  // Ensure logs is always an array, never undefined
  const safeLogs = logs || []
  console.log('✅ AgentPodsGrid safeLogs:', Array.isArray(safeLogs) ? `array[${safeLogs.length}]` : typeof safeLogs)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
    >
      {agents.map((agent, idx) => (
        <motion.div
          key={agent.agent_id}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: idx * 0.1, duration: 0.3 }}
        >
          <AgentPod agent={agent} logs={safeLogs} />
        </motion.div>
      ))}
    </motion.div>
  )
}
