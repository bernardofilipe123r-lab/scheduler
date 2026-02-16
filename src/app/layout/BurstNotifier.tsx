import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { get } from '@/shared/api/client'

interface BurstStatus {
  current_phase: string | null
}

/**
 * Global component that detects when a Daily Burst starts
 * and shows a clickable toast notification.
 * Mounted inside the auth-guarded router so it runs on every page.
 */
export function BurstNotifier() {
  const navigate = useNavigate()
  const location = useLocation()
  const prevPhase = useRef<string | null>(null)
  const toastShown = useRef(false)

  const { data } = useQuery({
    queryKey: ['burst-notifier-status'],
    queryFn: () => get<BurstStatus>('/api/maestro/status'),
    refetchInterval: 10_000,
    staleTime: 5_000,
  })

  const currentPhase = data?.current_phase ?? null

  useEffect(() => {
    // Detect transition: null/undefined → "generating" or "processing"
    const wasIdle = !prevPhase.current
    const isActive = currentPhase === 'generating' || currentPhase === 'processing'

    if (wasIdle && isActive && !toastShown.current) {
      // Don't show toast if already on Mission Control
      if (location.pathname !== '/mission-control') {
        toastShown.current = true

        toast(
          (t) => (
            <div className="flex items-center gap-3">
              <span className="text-lg">🚀</span>
              <div className="flex-1">
                <p className="font-semibold text-sm">Daily Burst Started!</p>
                <p className="text-xs text-gray-300">Your AI agents are generating content</p>
              </div>
              <button
                onClick={() => {
                  toast.dismiss(t.id)
                  navigate('/mission-control')
                }}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-md transition-colors whitespace-nowrap"
              >
                Watch Live
              </button>
            </div>
          ),
          {
            duration: 15_000,
            style: {
              background: '#1e293b',
              color: '#f1f5f9',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              maxWidth: '420px',
            },
          }
        )
      }
    }

    // Reset when burst ends
    if (!isActive && prevPhase.current) {
      toastShown.current = false
    }

    prevPhase.current = currentPhase
  }, [currentPhase, location.pathname, navigate])

  return null
}
