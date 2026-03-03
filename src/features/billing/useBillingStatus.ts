import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/shared/api/client'

export interface BrandSubscription {
  brand_id: string
  brand_name: string
  status: 'incomplete' | 'active' | 'past_due' | 'cancelled' | 'unpaid'
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export interface UnsubscribedBrand {
  brand_id: string
  brand_name: string
  requires_payment: boolean
}

export interface BillingStatusData {
  tag: string
  billing_status: 'none' | 'active' | 'past_due' | 'locked' | 'cancelled'
  is_exempt: boolean
  stripe_customer_id: string | null
  billing_grace_deadline: string | null
  billing_locked_at: string | null
  subscriptions: BrandSubscription[]
  brands_without_subscription: UnsubscribedBrand[]
}

export function useBillingStatus() {
  return useQuery<BillingStatusData>({
    queryKey: ['billing', 'status'],
    queryFn: () => apiClient.get<BillingStatusData>('/api/billing/status'),
    staleTime: 60_000,
  })
}
