import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Radio } from 'lucide-react'
import { parseLogsToEvents } from '../utils/logParser'
import type { Agent } from '../api/useAgents'

interface ActivityFeedProps {
  logs: any[]
  agents: Agent[]
}

export function ActivityFeed({ logs, agents }: ActivityFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null)
  const parsedLogs = parseLogsToEvents(logs, agents).slice(0, 50) // Show last 50 logs

  useEffect(() => {
    // Auto-scroll to bottom when new logs arrive
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [logs])

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', { hour12: false })
  }

  return (
    <div className="h-full flex flex-col bg-gray-900/50 backdrop-blur-sm">
      {/* Header */}
      <div className="border-b border-cyan-500/30 px-6 py-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-cyan-400 font-mono flex items-center gap-2">
          <Radio className="w-4 h-4" />
          ACTIVITY FEED
        </h3>
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2 h-2 bg-red-500 rounded-full"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="text-xs text-red-400 font-mono">LIVE</span>
        </div>
      </div>

      {/* Feed Content */}
      <div 
        ref={feedRef}
        className="flex-1 overflow-y-auto px-6 py-3 space-y-1 font-mono text-xs"
      >
        <AnimatePresence mode="popLayout">
          {parsedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
              <span className="text-2xl">📡</span>
              <p className="font-mono text-xs">No recent activity in the last hour</p>
              <p className="font-mono text-[10px] text-gray-600">Logs will appear here when a burst runs</p>
            </div>
          ) : (
            parsedLogs.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex items-start gap-3 py-1 ${event.color} hover:bg-gray-800/30 rounded px-2 -mx-2`}
              >
                <span className="text-gray-500 tabular-nums flex-shrink-0">
                  {formatTime(event.timestamp)}
                </span>
                <span className="flex-shrink-0">{event.icon}</span>
                <span className="flex-1 break-words">
                  {event.message}
                </span>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
