---
name: billing-stripe
description: Use when modifying billing logic, working on Stripe webhooks, changing subscription lifecycle, adjusting grace periods, adding billing exemptions, debugging payment failures, or working on billing UI gates.
---

# Billing & Stripe Integration

## Key Source Files

| File | Purpose |
|------|---------|
| `app/api/billing/routes.py` | All billing endpoints + Stripe webhook handler |
| `app/services/billing_utils.py` | `recalculate_user_billing_status()`, `validate_can_generate()`, `unlock_user_if_needed()` |
| `app/services/billing_enforcer.py` | Pauses content generation/publishing for locked users |
| `app/models/billing.py` | `BrandSubscription` model |
| `app/models/auth.py` | `UserProfile` — `billing_status`, `billing_grace_deadline` |
| `src/features/billing/` | `useBillingStatus`, `useBillingGate`, `LockedBanner`, `PaywallModal` |

## Soft-Lock Lifecycle

```
Payment succeeds → 'active'
    ↓
Payment fails → 'past_due' (grace_deadline = now + 7 days)
    ↓
Grace expires → 'locked' (Toby disabled, posts paused)
    ↓
Payment succeeds → unlock: billing_status='active', re-enable Toby, resume paused posts
```

## Webhook Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Upsert BrandSubscription, set active |
| `invoice.paid` | Set active, call `unlock_user_if_needed()` |
| `invoice.payment_failed` | Set past_due, 7-day grace |
| `customer.subscription.updated` | Sync from Stripe |
| `customer.subscription.deleted` | Set cancelled |

## Generation Gate

`validate_can_generate(user_id, brand_id, db)` — called before every job:
1. Exempt → allowed
2. `billing_status == 'locked'` → denied
3. No active subscription for brand → denied

Also enforced in Toby orchestrator (billing guard).

## Exemptions

`EXEMPT_TAGS = {'special', 'admin', 'super_admin'}` — bypass ALL billing checks.

## Common Mistakes
1. Webhook endpoint has NO standard auth — validate via `stripe.Webhook.construct_event()`
2. Checkout creates 'incomplete' sub, webhook sets 'active' — don't assume active after checkout
3. `unlock_user_if_needed()` must re-enable Toby AND resume paused posts
4. Subscriptions are per-brand, not per-user
5. Grace deadline = `now + 7 days`, not from period_end
