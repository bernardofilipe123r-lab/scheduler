import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Loader2, AlertCircle, Clock } from 'lucide-react'
import type { Agent } from '../api/useAgents'
import { ProgressRing } from './ProgressRing'

interface AgentPodProps {
  agent: Agent
  logs: any[]
}

type AgentStatus = 'active' | 'waiting' | 'completed' | 'error'

interface AgentProgress {
  status: AgentStatus
  currentBrand: string | null
  progress: number
  reelsGenerated: number
  postsGenerated: number
  totalReels: number
  totalPosts: number
  lastActivity: string | null
}

function calculateAgentProgress(agent: Agent, logs: any[]): AgentProgress {
  const agentName = agent.agent_id.toUpperCase()
  
  // Filter logs for this agent
  const agentLogs = logs.filter(log => 
    log.message.toUpperCase().includes(`[${agentName}]`)
  )

  if (agentLogs.length === 0) {
    return {
      status: 'waiting',
      currentBrand: null,
      progress: 0,
      reelsGenerated: 0,
      postsGenerated: 0,
      totalReels: 6,
      totalPosts: 2,
      lastActivity: null,
    }
  }

  const recentLogs = agentLogs.slice(0, 5)
  const recentMessages = recentLogs.map(l => l.message.toLowerCase()).join(' ')

  // Count saved proposals
  const reels = agentLogs.filter(l => 
    l.message.toLowerCase().includes('saved:') && 
    l.message.toLowerCase().includes('reel')
  ).length
  
  const posts = agentLogs.filter(l => 
    l.message.toLowerCase().includes('saved:') && 
    l.message.toLowerCase().includes('post')
  ).length

  const totalReels = 6
  const totalPosts = 2
  const totalTasks = totalReels + totalPosts
  const completedTasks = Math.min(reels, totalReels) + Math.min(posts, totalPosts)
  const progress = Math.round((completedTasks / totalTasks) * 100)

  // Determine status
  let status: AgentStatus = 'waiting'
  if (recentMessages.includes('error') || recentMessages.includes('failed')) {
    status = 'error'
  } else if (progress >= 100) {
    status = 'completed'
  } else if (recentMessages.includes('generating') || recentMessages.includes('planning') || recentMessages.includes('saved:')) {
    status = 'active'
  }

  // Extract brand from recent activity
  let currentBrand: string | null = null
  const brandMatch = recentLogs[0]?.message.match(/for\s+(\w+)/i)
  if (brandMatch) {
    currentBrand = brandMatch[1]
  }

  // Last activity
  const lastActivity = recentLogs[0]?.message.split(']').pop()?.trim() || null

  return {
    status,
    currentBrand,
    progress,
    reelsGenerated: Math.min(reels, totalReels),
    postsGenerated: Math.min(posts, totalPosts),
    totalReels,
    totalPosts,
    lastActivity,
  }
}

export function AgentPod({ agent, logs }: AgentPodProps) {
  const progress = useMemo(() => calculateAgentProgress(agent, logs), [agent, logs])

  const statusConfig = {
    active: {
      badge: 'ACTIVE',
      badgeClass: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50',
      borderClass: 'border-cyan-500/50 shadow-lg shadow-cyan-500/20',
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
      pulse: true,
    },
    waiting: {
      badge: 'WAITING',
      badgeClass: 'bg-gray-800 text-gray-400 border-gray-700',
      borderClass: 'border-gray-700',
      icon: <Clock className="w-4 h-4" />,
      pulse: false,
    },
    completed: {
      badge: 'COMPLETED',
      badgeClass: 'bg-green-500/20 text-green-400 border-green-500/50',
      borderClass: 'border-green-500/50',
      icon: <CheckCircle2 className="w-4 h-4" />,
      pulse: false,
    },
    error: {
      badge: 'ERROR',
      badgeClass: 'bg-red-500/20 text-red-400 border-red-500/50',
      borderClass: 'border-red-500/50',
      icon: <AlertCircle className="w-4 h-4" />,
      pulse: false,
    },
  }

  const config = statusConfig[progress.status]
  const initials = agent.agent_id.substring(0, 2).toUpperCase()

  return (
    <motion.div
      className={`border ${config.borderClass} bg-gray-900 rounded-lg p-4 transition-all duration-300`}
      animate={config.pulse ? { boxShadow: ['0 0 20px rgba(6, 182, 212, 0.2)', '0 0 40px rgba(6, 182, 212, 0.4)', '0 0 20px rgba(6, 182, 212, 0.2)'] } : {}}
      transition={config.pulse ? { duration: 2, repeat: Infinity } : {}}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
          progress.status === 'active' ? 'bg-gradient-to-br from-cyan-500 to-blue-600' :
          progress.status === 'completed' ? 'bg-green-600' :
          progress.status === 'error' ? 'bg-red-600' :
          'bg-gray-800'
        }`}>
          {progress.status === 'completed' ? '✓' : initials}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-white truncate">{agent.display_name || agent.agent_id}</h3>
          <p className="text-xs text-gray-500 truncate">{agent.personality}</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center justify-center mb-3">
        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-mono font-semibold border ${config.badgeClass}`}>
          {config.icon}
          <span>{config.badge}</span>
        </div>
      </div>

      {/* Progress Ring */}
      {progress.status !== 'waiting' && (
        <div className="flex justify-center mb-3">
          <ProgressRing value={progress.progress} size={80} />
        </div>
      )}

      {/* Stats */}
      <div className="space-y-1 text-sm">
        {progress.currentBrand && (
          <div className="text-center">
            <span className="text-gray-400">Brand: </span>
            <span className="text-cyan-400 font-mono">{progress.currentBrand}</span>
          </div>
        )}
        
        {progress.status !== 'waiting' && (
          <>
            <div className="text-center text-gray-400">
              <span className="text-cyan-400 font-bold">{progress.reelsGenerated}</span>/{progress.totalReels} Reels
            </div>
            <div className="text-center text-gray-400">
              <span className="text-cyan-400 font-bold">{progress.postsGenerated}</span>/{progress.totalPosts} Posts
            </div>
          </>
        )}
      </div>

      {/* Last Activity */}
      {progress.lastActivity && progress.status === 'active' && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-xs text-cyan-400 truncate font-mono">
            {progress.lastActivity.substring(0, 60)}...
          </p>
        </div>
      )}
    </motion.div>
  )
}
