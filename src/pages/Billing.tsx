import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CreditCard, ExternalLink, Sparkles, AlertTriangle, CheckCircle, XCircle, Clock } from 'lucide-react'
import { apiClient } from '@/shared/api/client'
import { useBillingStatus } from '@/features/billing/useBillingStatus'
import type { BrandSubscription } from '@/features/billing/useBillingStatus'

const STATUS_STYLES: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  active: { label: 'Active', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  past_due: { label: 'Past Due', color: 'text-amber-600 bg-amber-50', icon: AlertTriangle },
  locked: { label: 'Locked', color: 'text-red-600 bg-red-50', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'text-gray-600 bg-gray-100', icon: XCircle },
  none: { label: 'No Subscription', color: 'text-gray-500 bg-gray-50', icon: Clock },
  incomplete: { label: 'Incomplete', color: 'text-gray-500 bg-gray-50', icon: Clock },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.none
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {s.label}
    </span>
  )
}

export function BillingPage() {
  const { data: billing, isLoading } = useBillingStatus()
  const queryClient = useQueryClient()
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)

  const checkoutMutation = useMutation({
    mutationFn: (brandId: string) =>
      apiClient.post<{ checkout_url: string }>('/api/billing/checkout-session', { brand_id: brandId }),
    onSuccess: (data) => {
      window.location.href = data.checkout_url
    },
    onSettled: () => setCheckoutLoading(null),
  })

  const cancelMutation = useMutation({
    mutationFn: (brandId: string) =>
      apiClient.post<{ success: boolean }>('/api/billing/cancel-subscription', { brand_id: brandId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billing', 'status'] }),
  })

  const reactivateMutation = useMutation({
    mutationFn: (brandId: string) =>
      apiClient.post<{ success: boolean }>('/api/billing/reactivate-subscription', { brand_id: brandId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['billing', 'status'] }),
  })

  const portalMutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ portal_url: string }>('/api/billing/portal-session'),
    onSuccess: (data) => {
      window.location.href = data.portal_url
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
      </div>
    )
  }

  if (!billing) {
    return (
      <div className="text-center py-16 text-gray-500">
        Unable to load billing information.
      </div>
    )
  }

  // Exempt users
  if (billing.is_exempt) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 border border-violet-200 rounded-xl p-8 text-center">
          <Sparkles className="w-10 h-10 text-violet-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Unlimited Access</h2>
          <p className="text-gray-600">
            Your account has full access. Account type: <span className="font-semibold capitalize">{billing.tag}</span>. No billing required.
          </p>
        </div>
      </div>
    )
  }

  const activeSubs = billing.subscriptions.filter(s => s.status === 'active' && !s.cancel_at_period_end)
  const monthlyCost = activeSubs.length * 50
  const nextBilling = activeSubs
    .map(s => s.current_period_end)
    .filter(Boolean)
    .sort()[0]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Billing</h1>

      {/* Account Overview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-gray-400" />
          Account Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Status</p>
            <StatusBadge status={billing.billing_status} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Monthly Cost</p>
            <p className="text-2xl font-bold text-gray-900">${monthlyCost}<span className="text-sm text-gray-400">/mo</span></p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Next Billing</p>
            <p className="text-sm text-gray-700">
              {nextBilling ? new Date(nextBilling).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
            </p>
          </div>
        </div>

        {billing.billing_grace_deadline && billing.billing_status === 'past_due' && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertTriangle className="w-4 h-4 inline mr-1" />
            Payment overdue. Grace period ends{' '}
            {new Date(billing.billing_grace_deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.
            Update your payment method to avoid account lock.
          </div>
        )}

        {billing.stripe_customer_id && (
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 disabled:opacity-50 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {portalMutation.isPending ? 'Loading...' : 'Manage Payment Method'}
            </button>
            <button
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
            >
              View Invoices
            </button>
          </div>
        )}
      </div>

      {/* Brand Subscriptions */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Brand Subscriptions</h2>

        {billing.subscriptions.length === 0 && billing.brands_without_subscription.length === 0 && (
          <p className="text-gray-500 text-sm">No brands found. Create a brand first.</p>
        )}

        <div className="space-y-3">
          {/* Active/existing subscriptions */}
          {billing.subscriptions.map((sub: BrandSubscription) => (
            <SubscriptionCard
              key={sub.brand_id}
              sub={sub}
              onCancel={() => cancelMutation.mutate(sub.brand_id)}
              onReactivate={() => reactivateMutation.mutate(sub.brand_id)}
              cancelPending={cancelMutation.isPending}
              reactivatePending={reactivateMutation.isPending}
            />
          ))}

          {/* Brands without subscriptions */}
          {billing.brands_without_subscription.map((b) => (
            <div
              key={b.brand_id}
              className="flex items-center justify-between p-4 rounded-lg border border-dashed border-gray-300 bg-gray-50"
            >
              <div>
                <p className="font-medium text-gray-900">{b.brand_name}</p>
                <p className="text-xs text-gray-500">No active subscription</p>
              </div>
              <button
                onClick={() => { setCheckoutLoading(b.brand_id); checkoutMutation.mutate(b.brand_id) }}
                disabled={checkoutLoading === b.brand_id || checkoutMutation.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {checkoutLoading === b.brand_id ? 'Redirecting...' : 'Subscribe — $50/mo'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SubscriptionCard({
  sub,
  onCancel,
  onReactivate,
  cancelPending,
  reactivatePending,
}: {
  sub: BrandSubscription
  onCancel: () => void
  onReactivate: () => void
  cancelPending: boolean
  reactivatePending: boolean
}) {
  const [showConfirm, setShowConfirm] = useState(false)

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 bg-white">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <p className="font-medium text-gray-900">{sub.brand_name}</p>
          <StatusBadge status={sub.status} />
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>$50/month</span>
          {sub.current_period_end && (
            <span>
              {sub.cancel_at_period_end ? 'Cancels' : 'Renews'}:{' '}
              {new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {sub.status === 'active' && sub.cancel_at_period_end && (
          <button
            onClick={onReactivate}
            disabled={reactivatePending}
            className="px-3 py-1.5 text-sm font-medium text-violet-700 bg-violet-50 rounded-lg hover:bg-violet-100 disabled:opacity-50 transition-colors"
          >
            {reactivatePending ? 'Saving...' : 'Reactivate'}
          </button>
        )}
        {sub.status === 'active' && !sub.cancel_at_period_end && !showConfirm && (
          <button
            onClick={() => setShowConfirm(true)}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        )}
        {showConfirm && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Are you sure?</span>
            <button
              onClick={() => { onCancel(); setShowConfirm(false) }}
              disabled={cancelPending}
              className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {cancelPending ? 'Cancelling...' : 'Confirm Cancel'}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              Keep
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
