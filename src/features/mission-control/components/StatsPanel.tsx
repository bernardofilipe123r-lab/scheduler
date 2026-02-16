import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, FileText, CheckCircle, XCircle, Briefcase, Calendar, Zap } from 'lucide-react'
import type { MissionStats } from '../utils/statsCalculator'
import { formatElapsed } from '../utils/statsCalculator'

interface StatsPanelProps {
  stats: MissionStats
  activeAgents: number
  totalAgents: number
}

export function StatsPanel({ stats, activeAgents, totalAgents }: StatsPanelProps) {
  const [elapsed, setElapsed] = useState(stats.elapsed_seconds)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const statItems = [
    { icon: Clock, label: 'Elapsed', value: formatElapsed(elapsed), color: 'text-cyan-400' },
    { icon: FileText, label: 'Total Proposals', value: stats.total_proposals.toString(), color: 'text-blue-400' },
    { icon: CheckCircle, label: 'Accepted', value: stats.accepted.toString(), color: 'text-green-400' },
    { icon: XCircle, label: 'Rejected', value: stats.rejected.toString(), color: 'text-red-400' },
    { icon: Briefcase, label: 'Jobs Created', value: stats.jobs_created.toString(), color: 'text-purple-400' },
    { icon: Calendar, label: 'Scheduled', value: stats.scheduled.toString(), color: 'text-emerald-400' },
    { icon: Zap, label: 'Active Agents', value: `${activeAgents}/${totalAgents}`, color: 'text-yellow-400' },
  ]

  return (
    <div className="h-full overflow-y-auto p-6">
      <h3 className="text-lg font-bold text-cyan-400 mb-6 font-mono flex items-center gap-2">
        <span className="text-2xl">📊</span>
        MISSION STATS
      </h3>

      <div className="space-y-4">
        {statItems.map((item, idx) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="bg-gray-800/50 border border-gray-700 rounded-lg p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-gray-900 ${item.color}`}>
                <item.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-400 font-mono uppercase tracking-wide">
                  {item.label}
                </div>
                <div className={`text-2xl font-bold font-mono tabular-nums mt-1 ${item.color}`}>
                  {item.value}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Acceptance Rate */}
      {stats.total_proposals > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6 bg-gray-800/50 border border-gray-700 rounded-lg p-4"
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
    </div>
  )
}
