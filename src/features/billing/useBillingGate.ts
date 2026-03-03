import { useBillingStatus } from './useBillingStatus'

type GateResult =
  | { allowed: true; reason: null; message: null }
  | { allowed: false; reason: 'loading' | 'locked' | 'no_subscription'; message: string }

export function useBillingGate(brandId?: string): GateResult {
  const { data: billing } = useBillingStatus()

  if (!billing) return { allowed: false, reason: 'loading', message: 'Loading billing status...' }
  if (billing.is_exempt) return { allowed: true, reason: null, message: null }
  if (billing.billing_status === 'locked') return {
    allowed: false,
    reason: 'locked',
    message: 'Account locked — update payment method',
  }

  if (brandId) {
    const hasSub = billing.subscriptions.some(
      s => s.brand_id === brandId && ['active', 'past_due'].includes(s.status)
    )
    if (!hasSub) return {
      allowed: false,
      reason: 'no_subscription',
      message: 'Subscribe to activate this brand',
    }
  }

  return { allowed: true, reason: null, message: null }
}
