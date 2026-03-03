import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { apiClient } from '@/shared/api/client'

export function LockedBanner() {
  const navigate = useNavigate()

  const portalMutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ portal_url: string }>('/api/billing/portal-session'),
    onSuccess: (data) => {
      window.location.href = data.portal_url
    },
  })

  return (
    <div className="bg-red-600 text-white text-sm px-4 py-2.5 flex items-center gap-3">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <p className="flex-1 min-w-0">
        <span className="font-semibold">Account locked</span> — payment overdue.
        Content generation and publishing are paused.
      </p>
      <button
        onClick={() => portalMutation.mutate()}
        disabled={portalMutation.isPending}
        className="shrink-0 px-3 py-1 text-xs font-semibold bg-white text-red-600 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        {portalMutation.isPending ? 'Loading...' : 'Update Payment'}
      </button>
      <button
        onClick={() => navigate('/billing')}
        className="shrink-0 px-3 py-1 text-xs font-semibold border border-white/50 rounded hover:bg-white/10 transition-colors"
      >
        View Billing
      </button>
    </div>
  )
}
