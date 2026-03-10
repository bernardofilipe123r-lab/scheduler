import { useState, useEffect, useCallback } from 'react'
import { X, Facebook, CheckCircle2, ArrowRight, Shield } from 'lucide-react'

interface FacebookConnectModalProps {
  brandName: string
  onConfirm: () => void
  onClose: () => void
}

export function FacebookConnectModal({ brandName, onConfirm, onClose }: FacebookConnectModalProps) {
  const COUNTDOWN_SECONDS = 5
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const [canConnect, setCanConnect] = useState(false)

  useEffect(() => {
    if (countdown <= 0) {
      setCanConnect(true)
      return
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const handleConfirm = useCallback(() => {
    if (!canConnect) return
    onConfirm()
  }, [canConnect, onConfirm])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Facebook className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">Connect Facebook Pages</h2>
            <p className="text-blue-100 text-sm">for {brandName}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-5">
          <p className="text-gray-600 text-sm leading-relaxed">
            You're about to connect your Facebook Pages. Here's exactly what will happen:
          </p>

          {/* Steps */}
          <div className="space-y-4">
            <Step
              number={1}
              title="Log in to Facebook"
              description="You'll be redirected to Facebook to authorize ViralToby. If you're already logged in, this is instant."
            />
            <Step
              number={2}
              title='Select "Opt in to all current and future Pages"'
              description="This gives ViralToby access to all your Pages at once. You can revoke access anytime from Facebook settings."
              highlight
            />
            <Step
              number={3}
              title="Map Pages to Brands"
              description="You'll return here and see a mapping table. Assign each Facebook Page to the correct brand — all connections happen in one click."
            />
          </div>

          {/* Security note */}
          <div className="flex items-start gap-3 bg-gray-50 rounded-xl p-4">
            <Shield className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-500 leading-relaxed">
              ViralToby only requests permissions to manage and post to your Pages. We never access your personal profile, messages, or friends list. You can disconnect any Page at any time.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConnect}
            className={`
              inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all
              ${canConnect
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }
            `}
          >
            {canConnect ? (
              <>
                Connect to Facebook
                <ArrowRight className="w-4 h-4" />
              </>
            ) : (
              <>
                Read the steps above ({countdown}s)
                <div className="w-4 h-4 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function Step({ number, title, description, highlight }: {
  number: number
  title: string
  description: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`
        w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
        ${highlight ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}
      `}>
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${highlight ? 'text-blue-800' : 'text-gray-900'}`}>
          {title}
        </p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      {highlight && (
        <CheckCircle2 className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
      )}
    </div>
  )
}
