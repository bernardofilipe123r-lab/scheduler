---
name: billing-stripe
description: "Stripe billing, subscriptions, soft-lock enforcement, payment webhooks. Use when: modifying billing logic, working on Stripe webhooks, changing subscription lifecycle, adjusting grace periods, adding billing exemptions, debugging payment failures, working on billing UI gates, modifying checkout flow."
---

# Billing & Stripe Integration

## When to Use
- Modifying billing routes or Stripe API calls
- Working on webhook handlers (checkout, invoice, subscription events)
- Changing the soft-lock lifecycle or grace periods
- Adding billing exemptions or modifying exempt tags
- Debugging payment failures or locked users
- Working on frontend billing gates (PaywallModal, LockedBanner)
- Modifying checkout session creation or customer portal

## Key Source Files

| File | Purpose |
|------|---------|
| `app/api/billing/routes.py` | All billing endpoints + Stripe webhook handler |
| `app/services/billing_utils.py` | `recalculate_user_billing_status()`, `validate_can_generate()`, `unlock_user_if_needed()` |
| `app/services/billing_enforcer.py` | Pauses content generation/publishing for locked users |
| `app/models/billing.py` | `BrandSubscription` model |
| `app/models/auth.py` | `UserProfile` — `billing_status`, `billing_grace_deadline`, `billing_locked_at` |
| `src/features/billing/useBillingStatus.ts` | Frontend billing query hook |
| `src/features/billing/useBillingGate.ts` | Frontend access control hook |
| `src/features/billing/LockedBanner.tsx` | Payment failure warning banner |
| `src/features/billing/PaywallModal.tsx` | Subscription upsell modal |

## Soft-Lock Lifecycle

```
Payment succeeds → status: 'active'
    ↓
Payment fails → status: 'past_due' (grace_deadline = now + 7 days)
    ↓
Grace expires → status: 'locked' (Toby disabled, posts paused)
    ↓
Payment succeeds → unlock_user_if_needed():
    - billing_status = 'active'
    - Clear grace_deadline & locked_at
    - Re-enable TobyState.enabled = True
    - Resume paused posts (status='paused' → 'scheduled')
```

## BrandSubscription Model

```python
class BrandSubscription:
    id: UUID (PK)
    user_id: str (FK → user_profiles)
    brand_id: str (FK → brands)
    stripe_subscription_id: str (unique)
    stripe_price_id: str
    status: str  # incomplete, active, past_due, cancelled
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool
    cancelled_at: datetime
    created_at, updated_at: datetime
```

## Billing Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/billing/status` | Yes | Full user billing state + subscriptions |
| POST | `/api/billing/checkout-session` | Yes | Create Stripe Checkout (rate limit: 5/min/user) |
| POST | `/api/billing/portal-session` | Yes | Stripe Customer Portal URL |
| POST | `/api/billing/cancel-subscription` | Yes | Set `cancel_at_period_end=True` |
| POST | `/api/billing/reactivate-subscription` | Yes | Undo pending cancellation |
| POST | `/api/billing/webhook` | **No auth** (sig-verified) | Stripe webhook handler |

## Webhook Events Handled

| Event | Handler | Action |
|-------|---------|--------|
| `checkout.session.completed` | `_handle_checkout_completed()` | Upsert BrandSubscription, set active, recalculate |
| `invoice.paid` | `_handle_invoice_paid()` | Set active, call `unlock_user_if_needed()` |
| `invoice.payment_failed` | `_handle_payment_failed()` | Set past_due, create 7-day grace deadline |
| `customer.subscription.updated` | `_handle_subscription_updated()` | Sync state from Stripe |
| `customer.subscription.deleted` | `_handle_subscription_deleted()` | Set cancelled |

## Billing Status Calculation

`recalculate_user_billing_status(user_id, db)` derives user-level status from worst subscription:
- Exempt user → `'none'` (bypass all)
- Any sub `past_due` → `'past_due'`
- Any sub `active` → `'active'`
- All cancelled/unpaid → `'cancelled'`

## Generation Gate

`validate_can_generate(user_id, brand_id, db)` — **called before every generation job**:
```python
Returns: (allowed: bool, reason: str | None)

# Check order:
1. Exempt → allowed
2. billing_status == 'locked' → denied ("Account locked — payment overdue")
3. No active subscription for brand → denied ("No active subscription")
4. Otherwise → allowed
```

**CRITICAL:** This is also enforced in Toby's orchestrator (`billing guard` skips locked users entirely).

## Exemptions

```python
EXEMPT_TAGS = {'special', 'admin', 'super_admin'}
```

`is_exempt(user)` checks if `user.tag` is in exempt set. Exempt users bypass ALL billing checks.

## Frontend Billing Gates

### `useBillingGate(brandId?)`
```typescript
Returns: {
  allowed: boolean
  reason: null | 'loading' | 'locked' | 'no_subscription'
  message: string | null
}
```
Checks: exempt → bypass. `billing_status === 'locked'` → blocked. Per-brand subscription active/past_due → allowed.

### `useBillingStatus()`
Queries `/api/billing/status` with 60s stale time. Returns: tag, billing_status, is_exempt, stripe_customer_id, subscriptions[], brands_without_subscription[].

## Checkout Flow

```
1. Frontend: POST /api/billing/checkout-session with { brand_id }
2. Backend:
   - Rate limit check (5/min/user)
   - Validate: not exempt, brand belongs to user, no active sub
   - Get/create Stripe Customer (metadata: viraltoby_user_id)
   - Create Checkout Session (mode='subscription', metadata: user_id + brand_id)
   - Create BrandSubscription row with status='incomplete'
   - Return { checkout_url }
3. User completes payment on Stripe
4. Stripe webhook: checkout.session.completed → activate subscription
```

## Common Mistakes to Avoid
1. **Webhook signature:** ALWAYS validate via `stripe.Webhook.construct_event()` — webhook endpoint has NO standard auth
2. **Race condition:** Checkout creates 'incomplete' sub immediately — webhook sets 'active'. Don't assume active after checkout returns
3. **Unlock cascade:** `unlock_user_if_needed()` must re-enable Toby AND resume paused posts — don't just change status
4. **Per-brand scoping:** Subscriptions are per-brand, not per-user. A user with 3 brands needs 3 subscriptions
5. **Grace period math:** grace_deadline = `now + 7 days`, not from period_end. Don't use Stripe's collection method
6. **Exempt bypass:** Exempt users skip ALL billing logic, including Toby billing guard and generation validation
