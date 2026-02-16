import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Rocket, CheckCircle2, Coffee } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { AgentPodsGrid } from '@/features/mission-control/components/AgentPodsGrid'
import { StatsPanel } from '@/features/mission-control/components/StatsPanel'
import { ActivityFeed } from '@/features/mission-control/components/ActivityFeed'
import { useLiveLogs } from '@/features/mission-control/api/useLiveLogs'
import { useAgents } from '@/features/mission-control/api/useAgents'
import { useMaestroLive, type MaestroLiveStatus } from '@/features/mission-control/api/useMaestroLive'
import { calculatePhase, calculateStats } from '@/features/mission-control/utils/statsCalculator'
import { post } from '@/shared/api/client'
import { useAuth } from '@/features/auth'
import toast from 'react-hot-toast'

export type MissionMode = 'idle' | 'active' | 'complete'

function detectMode(logs: any[], maestro: MaestroLiveStatus | undefined): MissionMode {
  if (!maestro || !logs || logs.length === 0) return 'idle'

  const now = Date.now()
  const recentCutoff = now - 5 * 60 * 1000 // 5 min window
  const burstKeywords = ['generating', 'planning', 'saved:', 'examiner', 'auto-accepting', 'smart burst', 'manual burst', 'daily burst', 'burst for user']

  const recentBurstLogs = logs.filter(log => {
    const logTime = new Date(log.timestamp).getTime()
    if (logTime < recentCutoff) return false
    const msgLower = log.message.toLowerCase()
    return burstKeywords.some(kw => msgLower.includes(kw))
  })

  if (recentBurstLogs.length > 0) {
    const latestBurstTime = Math.max(...recentBurstLogs.map((l: any) => new Date(l.timestamp).getTime()))
    const timeSinceLatest = now - latestBurstTime

    // If last burst activity was 60+ seconds ago, check for completion signals
    if (timeSinceLatest > 60000) {
      const veryRecent = logs.slice(0, 5).map((l: any) => l.message.toLowerCase()).join(' ')
      if (veryRecent.includes('burst complete') || veryRecent.includes('all proposals') || veryRecent.includes('daily burst finished')) {
        return 'complete'
      }
    }

    return 'active'
  }

  // If daily targets are met, show complete
  const dc = maestro.daily_config
  if (dc && dc.total_reels > 0 && dc.today_reels >= dc.total_reels && dc.today_posts >= dc.total_posts) {
    return 'complete'
  }

  return 'idle'
}

function getDailyBurstCountdown(maestro: MaestroLiveStatus | undefined): number | null {
  if (!maestro?.cycles?.daily_burst) return null

  const cycle = maestro.cycles.daily_burst
  if (!cycle.schedule) return null

  // Parse "daily@HH:MM TZ" schedule
  const match = cycle.schedule.match(/daily@(\d{2}):(\d{2})\s+(\w+\/\w+)/i)
  if (!match) return null

  const [, hh, mm] = match
  const targetHour = parseInt(hh)
  const targetMin = parseInt(mm)

  // Calculate next run in Lisbon time
  const now = new Date()
  const lisbonNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Lisbon' }))
  const today = new Date(lisbonNow)
  today.setHours(targetHour, targetMin, 0, 0)

  if (lisbonNow > today) {
    today.setDate(today.getDate() + 1)
  }

  const diff = today.getTime() - lisbonNow.getTime()
  return diff > 0 ? diff : null
}

function formatCountdownLarge(ms: number): { hours: string; minutes: string; seconds: string } {
  const totalSecs = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  return {
    hours: h.toString().padStart(2, '0'),
    minutes: m.toString().padStart(2, '0'),
    seconds: s.toString().padStart(2, '0'),
  }
}

export function MissionControlPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [startTime] = useState(Date.now())
  const [countdownMs, setCountdownMs] = useState<number | null>(null)
  const [triggerLoading, setTriggerLoading] = useState(false)

  const { data: logsData, isLoading: logsLoading } = useLiveLogs()
  const { data: agentsData, isLoading: agentsLoading } = useAgents()
  const { data: maestroData, isLoading: maestroLoading } = useMaestroLive()

  const logs = logsData?.logs || []
  const agents = agentsData?.agents || []
  const mode = useMemo(() => detectMode(logs, maestroData), [logs, maestroData])
  const stats = calculateStats(logs, startTime, agents)
  const currentPhase = calculatePhase(logs)

  const isAdmin = user?.id === '7c7bdcc7-ad79-4554-8d32-e5ef02608e84' || user?.email === 'filipe@healthycollege.co'

  // Countdown timer for idle mode
  useEffect(() => {
    const tick = () => {
      const ms = getDailyBurstCountdown(maestroData)
      setCountdownMs(ms)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [maestroData])

  const handleTriggerBurst = async () => {
    setTriggerLoading(true)
    try {
      await post('/api/maestro/trigger-burst?force=true', {})
      toast.success('Daily Burst triggered!')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to trigger burst')
    } finally {
      setTriggerLoading(false)
    }
  }

  const isInitialLoad = (logsLoading || agentsLoading || maestroLoading) && !logsData && !agentsData

  return (
    <div className="fixed inset-0 bg-gray-950 text-gray-100 overflow-hidden">
      {/* Grid background effect */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Scan line effect — only during active */}
      {mode === 'active' && (
        <motion.div
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent pointer-events-none"
          animate={{ y: ['0vh', '100vh'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* Header - Command Bar */}
      <div className="relative border-b border-cyan-500/30 bg-gray-900/80 backdrop-blur-sm z-10">
        <div className="max-w-[2000px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-bold tracking-wider text-cyan-400 font-mono">
                🎯 MISSION CONTROL
              </h1>

              {/* Mode indicator */}
              {mode === 'active' && (
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-3 h-3 bg-red-500 rounded-full"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-red-400 font-semibold text-sm tracking-wide">LIVE</span>
                </div>
              )}

              {mode === 'complete' && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 font-semibold text-sm tracking-wide">COMPLETE</span>
                </div>
              )}

              {mode === 'idle' && (
                <div className="flex items-center gap-2">
                  <Coffee className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-500 font-semibold text-sm tracking-wide">STANDBY</span>
                </div>
              )}

              {mode === 'active' && (
                <div className="text-sm text-gray-400 font-mono">
                  Phase: <span className="text-cyan-300">{currentPhase}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => navigate('/ai-team')}
              className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-200 text-sm"
              title="Back to AI Team"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline font-mono">AI TEAM</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative h-[calc(100vh-73px)] flex">
        {/* Left/Center — Content depends on mode */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <AnimatePresence mode="wait">
            {isInitialLoad ? (
              /* Initial Load */
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex items-center justify-center"
              >
                <div className="text-center">
                  <motion.div
                    className="w-16 h-16 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full mx-auto mb-4"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                  <p className="text-cyan-400 font-mono text-sm">CONNECTING TO SYSTEMS...</p>
                </div>
              </motion.div>
            ) : mode === 'idle' ? (
              /* Idle Mode: Standby Dashboard */
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex-1 overflow-y-auto"
              >
                {/* Hero Countdown */}
                <div className="flex flex-col items-center justify-center py-12 px-6">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <div className="text-center mb-8">
                      <Rocket className="w-12 h-12 text-cyan-500/40 mx-auto mb-4" />
                      <h2 className="text-3xl font-bold text-white font-mono tracking-wide mb-2">
                        NEXT DAILY BURST
                      </h2>
                      <p className="text-gray-500 text-sm max-w-md mx-auto">
                        When the countdown reaches zero, your AI agents will generate fresh content for all your brands.
                        You can also trigger it manually.
                      </p>
                    </div>

                    {/* Countdown Display */}
                    {countdownMs !== null ? (
                      <div className="flex items-center justify-center gap-4 mb-8">
                        {(() => {
                          const ct = formatCountdownLarge(countdownMs)
                          return (
                            <>
                              <CountdownUnit value={ct.hours} label="HOURS" />
                              <span className="text-4xl text-cyan-600 font-mono font-bold mt-[-16px]">:</span>
                              <CountdownUnit value={ct.minutes} label="MIN" />
                              <span className="text-4xl text-cyan-600 font-mono font-bold mt-[-16px]">:</span>
                              <CountdownUnit value={ct.seconds} label="SEC" />
                            </>
                          )
                        })()}
                      </div>
                    ) : (
                      <div className="text-center mb-8">
                        <p className="text-gray-500 font-mono text-sm">Calculating next burst time...</p>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="flex flex-col items-center gap-3">
                      <button
                        onClick={handleTriggerBurst}
                        disabled={triggerLoading}
                        className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
                      >
                        {triggerLoading ? (
                          <motion.div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
                        ) : (
                          <Play className="w-5 h-5" />
                        )}
                        {triggerLoading ? 'Triggering...' : 'Run Daily Burst Now'}
                      </button>
                      <p className="text-[10px] text-gray-600 font-mono">
                        {isAdmin ? 'Admin: up to 3 manual bursts per day' : '12h cooldown between manual bursts'}
                      </p>
                    </div>
                  </motion.div>

                  {/* Today's Progress */}
                  {maestroData?.daily_config && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="mt-12 w-full max-w-lg"
                    >
                      <h3 className="text-sm font-bold text-gray-500 font-mono mb-3 text-center uppercase tracking-wider">
                        Today's Production
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <TodayCard
                          label="Reels"
                          current={maestroData.daily_config.today_reels}
                          target={maestroData.daily_config.total_reels}
                          icon="🎬"
                        />
                        <TodayCard
                          label="Posts"
                          current={maestroData.daily_config.today_posts}
                          target={maestroData.daily_config.total_posts}
                          icon="📝"
                        />
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* Agent Pods (standby mode) */}
                <div className="px-6 pb-6">
                  <h3 className="text-sm font-bold text-gray-500 font-mono mb-3 uppercase tracking-wider">
                    Agent Fleet — Standing By
                  </h3>
                  <AgentPodsGrid agents={agents} logs={[]} />
                </div>
              </motion.div>
            ) : (
              /* Active / Complete Mode: Live Dashboard */
              <motion.div
                key="active"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                {/* Complete Banner */}
                {mode === 'complete' && (
                  <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mx-6 mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3"
                  >
                    <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0" />
                    <div>
                      <h3 className="text-green-400 font-bold font-mono text-sm">MISSION COMPLETE</h3>
                      <p className="text-green-400/70 text-xs">
                        Today's content generation is finished. Results are shown below.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Agent Pods Grid */}
                <div className="flex-1 overflow-y-auto p-6">
                  <AgentPodsGrid agents={agents} logs={logs} />
                </div>

                {/* Activity Feed */}
                <div className="h-64 border-t border-cyan-500/30">
                  <ActivityFeed logs={logs} agents={agents} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right Sidebar — always visible */}
        <div className="w-80 border-l border-cyan-500/30 bg-gray-900/50 backdrop-blur-sm overflow-y-auto">
          <StatsPanel
            stats={stats}
            activeAgents={agents.filter(a => a.active).length}
            totalAgents={agents.length}
            mode={mode}
            maestro={maestroData}
          />
        </div>
      </div>
    </div>
  )
}

/* Sub-Components */

function CountdownUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-gray-900 border border-cyan-500/30 rounded-lg px-5 py-3 min-w-[80px] text-center">
        <span className="text-5xl font-bold text-cyan-400 font-mono tabular-nums">{value}</span>
      </div>
      <span className="text-[10px] text-gray-600 font-mono mt-1 tracking-widest">{label}</span>
    </div>
  )
}

function TodayCard({ label, current, target, icon }: { label: string; current: number; target: number; icon: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
  const isFull = pct >= 100

  return (
    <div className={`bg-gray-900 border rounded-lg p-4 ${isFull ? 'border-green-500/30' : 'border-gray-700'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg">{icon}</span>
        <span className={`text-xs font-mono ${isFull ? 'text-green-400' : 'text-gray-500'}`}>
          {current}/{target}
        </span>
      </div>
      <div className="text-sm font-mono text-gray-400 mb-2">{label}</div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isFull ? 'bg-green-500' : 'bg-cyan-500'}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
