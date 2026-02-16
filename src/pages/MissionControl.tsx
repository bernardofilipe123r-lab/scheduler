import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'
import { AgentPodsGrid } from '@/features/mission-control/components/AgentPodsGrid'
import { StatsPanel } from '@/features/mission-control/components/StatsPanel'
import { ActivityFeed } from '@/features/mission-control/components/ActivityFeed'
import { useLiveLogs } from '@/features/mission-control/api/useLiveLogs'
import { useAgents } from '@/features/mission-control/api/useAgents'
import { calculatePhase, calculateStats } from '@/features/mission-control/utils/statsCalculator'

export function MissionControlPage() {
  const navigate = useNavigate()
  const [startTime] = useState(Date.now())
  const { data: logsData, isLoading: logsLoading } = useLiveLogs()
  const { data: agentsData, isLoading: agentsLoading } = useAgents()

  const logs = logsData?.logs || []
  const agents = agentsData?.agents || []
  const stats = calculateStats(logs, startTime)
  const currentPhase = calculatePhase(logs)

  useEffect(() => {
    // Auto-close when mission completes (no new logs in last 30s + stats look complete)
    if (logs.length > 0 && stats.scheduled > 0) {
      const latestLog = logs[0]
      const latestTime = new Date(latestLog.timestamp || 0).getTime()
      const now = Date.now()
      const timeSinceLastLog = now - latestTime

      // If more than 30s since last log and we have scheduled content, consider complete
      if (timeSinceLastLog > 30000 && stats.scheduled >= stats.jobs_created * 0.8) {
        setTimeout(() => {
          // Could show a "Mission Complete" modal before closing
          navigate('/ai-team')
        }, 5000)
      }
    }
  }, [logs, stats, navigate])

  const handleClose = () => {
    navigate('/ai-team')
  }

  if (logsLoading || agentsLoading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="text-cyan-400 text-xl font-mono">
          <div className="animate-pulse">INITIALIZING MISSION CONTROL...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gray-950 text-gray-100 overflow-hidden">
      {/* Grid background effect */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}
      />

      {/* Scan line effect */}
      <motion.div
        className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"
        animate={{
          y: ['0vh', '100vh']
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'linear'
        }}
      />

      {/* Header - Command Bar */}
      <div className="relative border-b border-cyan-500/30 bg-gray-900/80 backdrop-blur-sm">
        <div className="max-w-[2000px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-bold tracking-wider text-cyan-400 font-mono">
                🎯 MISSION CONTROL
              </h1>
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-3 h-3 bg-red-500 rounded-full"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-red-400 font-semibold text-sm tracking-wide">LIVE</span>
              </div>
              <div className="text-sm text-gray-400 font-mono">
                Phase: <span className="text-cyan-300">{currentPhase}</span>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
              title="Close Mission Control"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative h-[calc(100vh-73px)] flex">
        {/* Left/Center - Agent Pods + Activity Feed */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Agent Pods Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            <AgentPodsGrid agents={agents} logs={logs} />
          </div>

          {/* Activity Feed */}
          <div className="h-64 border-t border-cyan-500/30">
            <ActivityFeed logs={logs} />
          </div>
        </div>

        {/* Right Sidebar - Stats Panel */}
        <div className="w-80 border-l border-cyan-500/30 bg-gray-900/50 backdrop-blur-sm">
          <StatsPanel stats={stats} activeAgents={agents.filter(a => a.active).length} totalAgents={agents.length} />
        </div>
      </div>
    </div>
  )
}
