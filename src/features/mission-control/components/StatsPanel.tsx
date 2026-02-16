import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, FileText, CheckCircle, XCircle, Briefcase, Calendar, Zap, Activity, Server } from 'lucide-react'
import type { MissionStats } from '../utils/statsCalculator'
import { formatElapsed } from '../utils/statsCalculator'
import type { MaestroLiveStatus } from '../api/useMaestroLive'
import type { MissionMode } from '@/pages/MissionControl'

interface StatsPanelProps {
  stats: MissionStats
  activeAgents: number
  totalAgents: number
  mode: MissionMode
  maestro?: MaestroLiveStatus
}

export function StatsPanel({ stats, activeAgents, totalAgents, mode, maestro }: StatsPanelProps) {
  const [elapsed, setElapsed] = useState(stats.elapsed_seconds)

  useEffect(() => {
    if (mode !== 'active') return
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [mode])

  // Reset elapsed when stats change (new burst)
  useEffect(() => {
    if (mode === 'active') {
      setElapsed(stats.elapsed_seconds)
    }
  }, [stats.elapsed_seconds, mode])

  return (
    <div className="h-full overflow-y-auto p-6">
      <h3 className="text-lg font-bold text-cyan-400 mb-6 font-mono flex items-center gap-2">
        <span className="text-2xl">📊</span>
        {mode === 'idle' ? 'SYSTEM STATUS' : 'MISSION STATS'}
      </h3>

      <div className="space-y-4">
        {/* Maestro status — always shown */}
        <StatCard
          icon={Server}
          label="Maestro"
          value={maestro?.is_running ? (maestro.is_paused ? 'PAUSED' : 'ONLINE') : 'OFFLINE'}
          color={maestro?.is_running && !maestro.is_paused ? 'text-green-400' : maestro?.is_paused ? 'text-yellow-400' : 'text-red-400'}
          delay={0}
        />

        {maestro?.uptime_human && (
          <StatCard icon={Activity} label="Uptime" value={maestro.uptime_human} color="text-gray-400" delay={0.05} />
        )}

        <StatCard
          icon={Zap}
          label="Agent Fleet"
          value={`${activeAgents}/${totalAgents}`}
          color="text-yellow-400"
          delay={0.1}
        />

        {/* Active/Complete mode — show burst stats */}
        {mode !== 'idle' && (
          <>
            <div className="border-t border-gray-800 pt-3 mt-3">
              <p className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-3">Burst Activity</p>
            </div>

            <StatCard icon={Clock} label="Elapsed" value={formatElapsed(elapsed)} color="text-cyan-400" delay={0.15} />
            <StatCard icon={FileText} label="Proposals" value={stats.total_proposals.toString()} color="text-blue-400" delay={0.2} />
            <StatCard icon={CheckCircle} label="Accepted" value={stats.accepted.toString()} color="text-green-400" delay={0.25} />
            <StatCard icon={XCircle} label="Rejected" value={stats.rejected.toString()} color="text-red-400" delay={0.3} />
            <StatCard icon={Briefcase} label="Jobs" value={stats.jobs_created.toString()} color="text-purple-400" delay={0.35} />
            <StatCard icon={Calendar} label="Scheduled" value={stats.scheduled.toString()} color="text-emerald-400" delay={0.4} />

            {/* Acceptance Rate */}
            {stats.total_proposals > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
              >
                <div className="text-xs text-gray-400 font-mono uppercase tracking-wide mb-2">
                  Acceptance Rate
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold text-cyan-400 font-mono">
                    {Math.round((stats.accepted / stats.total_proposals) * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-2 bg-gray-900 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-cyan-500 to-green-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(stats.accepted / stats.total_proposals) * 100}%` }}
                    transition={{ duration: 0.5, delay: 0.5 }}
                  />
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* Idle mode — show daily production from maestro */}
        {mode === 'idle' && maestro?.proposal_stats && (
          <>
            <div className="border-t border-gray-800 pt-3 mt-3">
              <p className="text-[10px] text-gray-600 font-mono uppercase tracking-wider mb-3">Lifetime Stats</p>
            </div>
            <StatCard icon={FileText} label="Total Proposals" value={maestro.proposal_stats.total.toString()} color="text-blue-400" delay={0.15} />
            <StatCard icon={CheckCircle} label="Accepted" value={maestro.proposal_stats.accepted.toString()} color="text-green-400" delay={0.2} />
            <StatCard icon={XCircle} label="Rejected" value={maestro.proposal_stats.rejected.toString()} color="text-red-400" delay={0.25} />
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color, delay }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  color: string
  delay: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
      className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-gray-900 ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-gray-400 font-mono uppercase tracking-wide">
            {label}
          </div>
          <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${color}`}>
            {value}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
