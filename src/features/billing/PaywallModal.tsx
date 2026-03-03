import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X, Sparkles, Check } from 'lucide-react'
import { apiClient } from '@/shared/api/client'
import type { UnsubscribedBrand } from './useBillingStatus'

const FEATURES = [
  'Autonomous AI content generation (Toby)',
  'Unlimited scheduled posts',
  'Publishing to all connected platforms',
  'Advanced analytics & performance tracking',
  'Content DNA personalization',
  '59 viral content patterns',
  'Video reels + carousel posts',
]

interface PaywallModalProps {
  brands: UnsubscribedBrand[]
  onDismiss: () => void
}

export function PaywallModal({ brands, onDismiss }: PaywallModalProps) {
  const [loadingBrand, setLoadingBrand] = useState<string | null>(null)

  const checkoutMutation = useMutation({
    mutationFn: (brandId: string) =>
      apiClient.post<{ checkout_url: string }>('/api/billing/checkout-session', { brand_id: brandId }),
    onSuccess: (data) => {
      window.location.href = data.checkout_url
    },
    onError: () => {
      setLoadingBrand(null)
    },
  })

  const handleSubscribe = (brandId: string) => {
    setLoadingBrand(brandId)
    checkoutMutation.mutate(brandId)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-8 text-white relative">
          <button
            onClick={onDismiss}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-6 h-6" />
            <h2 className="text-xl font-bold">Activate Your Brand</h2>
          </div>
          <p className="text-violet-100 text-sm">
            Subscribe to unlock full access for each brand — $50/month per brand.
          </p>
        </div>

        {/* Features */}
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Everything included
          </p>
          <ul className="grid grid-cols-1 gap-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                <Check className="w-4 h-4 text-green-500 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Brand list */}
        <div className="px-6 py-4 space-y-3">
          {brands.map((b) => (
            <div
              key={b.brand_id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-gray-50"
            >
              <div>
                <p className="font-medium text-gray-900">{b.brand_name}</p>
                <p className="text-xs text-gray-500">$50 / month</p>
              </div>
              <button
                onClick={() => handleSubscribe(b.brand_id)}
                disabled={loadingBrand === b.brand_id || checkoutMutation.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {loadingBrand === b.brand_id ? 'Redirecting...' : 'Subscribe'}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onDismiss}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Maybe later
          </button>
        </div>

        {checkoutMutation.isError && (
          <div className="px-6 pb-4">
            <p className="text-sm text-red-600">
              Failed to start checkout. Please try again.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
