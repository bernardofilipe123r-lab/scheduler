# ViralToby Billing & Subscription — Implementation Specification

> **Audience:** AI engineering agent with full access to the codebase, Supabase (via `psql "$DATABASE_URL"`), and Railway CLI (`railway variables`, `railway logs`, `railway redeploy`).
>
> **Security level:** CRITICAL — this is a payments system. Every endpoint must be hardened. No shortcuts, no trust of client data, no raw card handling.
>
> **Date:** March 2026

---

## 0. Context You Need

ViralToby is a multi-tenant SaaS. Each user can own N brands. Each brand is independently connected to social platforms (Instagram, Facebook, YouTube, Threads, TikTok) and has its own Content DNA, scheduling, and analytics. An autonomous AI agent called Toby runs every 5 minutes per-user, generating and publishing content.

**Currently the platform is 100% free. That changes now.**

### Pricing
- **$50 USD / month / brand** — no free tier, no trials
- **Exempt users:** `tag` in (`special`, `admin`, `super_admin`) — full access, zero payment
- **All existing users at launch** are migrated to `special` (grandfathered permanently)
- Only **new signups** after this ships get `tag = 'user'` and must pay

### What You Have Access To
- **Supabase PostgreSQL** — direct via `source .env 2>/dev/null; psql "$DATABASE_URL"` — run migrations, verify columns, inspect data
- **Railway CLI** — `railway variables set KEY=value` (triggers redeploy), `railway logs`, `railway status`
- **Stripe account** — API keys exist. You will set env vars on Railway after confirming key values
- **Full codebase** — backend (FastAPI + SQLAlchemy) at `app/`, frontend (React + TypeScript + Vite) at `src/`

### Fundamental Rules (from copilot-instructions.md — NEVER violate)
1. **100% dynamic** — zero hardcoded brand names, colors, IDs, counts. Everything from DB/API at runtime.
2. **Migrations run immediately** — write SQL in `migrations/`, execute with `psql "$DATABASE_URL"`, verify columns exist. SQLAlchemy maps to real columns — missing columns = 500 in production.
3. **Validate after changes** — `python scripts/validate_api.py --imports` after any backend change. Must exit 0.
4. **React hooks before early returns** — every `useState`/`useEffect`/`useMemo`/`useQuery`/custom hook MUST be called before any `if (...) return` statement. Violating this crashes the page.
5. **Git after every logical change** — `git add -A && git commit -m "..." && git push`

---

## 1. Database Schema Changes

### 1.1 Add Billing Columns to `user_profiles`

The `UserProfile` model (`app/models/auth.py`) currently has **no tag or billing columns**. Roles exist only in Supabase Auth `app_metadata`, which is not queryable by background services (Toby, scheduler). We need local columns.

**Migration file:** `migrations/add_user_billing.sql`

```sql
-- ============================================================
-- Migration: Add billing columns to user_profiles
-- Run: source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/add_user_billing.sql
-- ============================================================

BEGIN;

-- User classification tag
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS tag VARCHAR(20) NOT NULL DEFAULT 'user';

-- Stripe linkage
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);

-- Aggregate billing state
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) NOT NULL DEFAULT 'none';

-- Grace period: 7 days after first payment failure
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS billing_grace_deadline TIMESTAMPTZ;

-- When soft-lock was applied
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS billing_locked_at TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_tag ON user_profiles(tag);
CREATE INDEX IF NOT EXISTS idx_user_profiles_billing_status ON user_profiles(billing_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_stripe_cust ON user_profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- GRANDFATHERING: All existing users become 'special' (free forever)
UPDATE user_profiles
  SET tag = 'special'
  WHERE tag = 'user' OR tag IS NULL;

COMMIT;
```

**After running, verify:**
```bash
source .env 2>/dev/null; psql "$DATABASE_URL" -c "
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'user_profiles'
    AND column_name IN ('tag','stripe_customer_id','billing_status','billing_grace_deadline','billing_locked_at')
  ORDER BY column_name;
"
```

**SQLAlchemy model update** — add to `UserProfile` in `app/models/auth.py`:
```python
tag = Column(String(20), nullable=False, default='user')
stripe_customer_id = Column(String(255), unique=True, nullable=True)
billing_status = Column(String(20), nullable=False, default='none')
billing_grace_deadline = Column(DateTime(timezone=True), nullable=True)
billing_locked_at = Column(DateTime(timezone=True), nullable=True)
```

### 1.2 Create `brand_subscriptions` Table

Each brand the user pays for gets its own row linked to a Stripe Subscription.

**Migration file:** `migrations/add_brand_subscriptions.sql`

```sql
-- ============================================================
-- Migration: Create brand_subscriptions table
-- Run: source .env 2>/dev/null; psql "$DATABASE_URL" -f migrations/add_brand_subscriptions.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS brand_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(100) NOT NULL REFERENCES user_profiles(user_id) ON DELETE CASCADE,
  brand_id VARCHAR(50) NOT NULL REFERENCES brands(id) ON DELETE CASCADE,

  -- Stripe objects
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_price_id VARCHAR(255),

  -- Subscription state (synced from Stripe webhooks)
  status VARCHAR(20) NOT NULL DEFAULT 'incomplete',
    -- Values: incomplete | active | past_due | cancelled | unpaid

  -- Billing period
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,

  -- Cancellation
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One subscription per user+brand
  UNIQUE(user_id, brand_id)
);

CREATE INDEX IF NOT EXISTS idx_brand_sub_user ON brand_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_brand_sub_brand ON brand_subscriptions(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_sub_stripe ON brand_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_brand_sub_status ON brand_subscriptions(status);

COMMIT;
```

**After running, verify:**
```bash
source .env 2>/dev/null; psql "$DATABASE_URL" -c "
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'brand_subscriptions'
  ORDER BY ordinal_position;
"
```

### 1.3 Tag Values

| Tag | Who | Pays? | Full Access? |
|---|---|---|---|
| `user` | Every new signup after launch | Yes | Only with active subscription |
| `special` | All pre-launch users (grandfathered) | No | Always |
| `admin` | Platform admins | No | Always |
| `super_admin` | Platform super admins | No | Always |

### 1.4 `billing_status` Values (on `user_profiles`)

This is the **aggregate** status derived from the user's `brand_subscriptions`:

| Status | Meaning |
|---|---|
| `none` | Exempt user or no billing initiated |
| `active` | At least one subscription active, none past_due |
| `past_due` | Payment failed — grace period running (7 days) |
| `locked` | Grace expired — Toby disabled, posts paused |
| `cancelled` | All subscriptions cancelled |

### 1.5 `brand_subscriptions.status` Values

| Status | Stripe Source Event |
|---|---|
| `incomplete` | Checkout started, not completed |
| `active` | `invoice.paid` / `checkout.session.completed` |
| `past_due` | `invoice.payment_failed` |
| `cancelled` | `customer.subscription.deleted` |
| `unpaid` | All Stripe retries exhausted |

---

## 2. Stripe Integration

### 2.1 Stripe Dashboard Setup (Manual, one-time)

You do NOT do this — this is already done or will be done manually. But for your awareness:

1. **Product** created: "ViralToby Brand Subscription"
2. **Price** created: $50.00 USD / month, recurring → Price ID stored in `STRIPE_PRICE_ID`
3. **Webhook endpoint** registered: `https://viraltoby.com/api/billing/webhook`
4. **Customer Portal** configured: update payment method, cancel, view invoices
5. **Webhook events selected:**
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

### 2.2 Environment Variables

Set these on Railway (which triggers redeploy):

```bash
railway variables set STRIPE_SECRET_KEY=sk_live_...
railway variables set STRIPE_PUBLISHABLE_KEY=pk_live_...
railway variables set STRIPE_WEBHOOK_SECRET=whsec_...
railway variables set STRIPE_PRICE_ID=price_...
railway variables set STRIPE_PORTAL_RETURN_URL=https://viraltoby.com/billing
```

Also add to `.env` for local dev (use `sk_test_` / `pk_test_` keys locally).

### 2.3 Python Dependency

Add to `requirements.txt`:
```
stripe>=8.0.0
```

No frontend Stripe SDK needed — we use Stripe-hosted Checkout and Customer Portal exclusively. **Never build custom card input forms.** This eliminates PCI compliance burden entirely.

---

## 3. Backend Implementation

### 3.1 New Files to Create

| File | Purpose |
|---|---|
| `app/models/billing.py` | `BrandSubscription` SQLAlchemy model |
| `app/api/billing/__init__.py` | Package init |
| `app/api/billing/routes.py` | All billing endpoints |
| `app/services/billing_enforcer.py` | Background job: grace period enforcement |
| `app/services/billing_utils.py` | Shared helpers: `is_exempt()`, `validate_can_generate()`, `recalculate_user_billing_status()` |

### 3.2 Existing Files to Modify

| File | Change |
|---|---|
| `app/models/auth.py` | Add 5 columns to `UserProfile` (tag, stripe_customer_id, billing_status, billing_grace_deadline, billing_locked_at) |
| `app/main.py` | Register `billing_router` at `/api/billing`, add `billing_enforcer` to APScheduler |
| `app/services/toby/orchestrator.py` | Add billing guard before per-user tick |
| `src/app/routes/index.tsx` | Add `/billing` route |
| `src/app/layout/AppLayout.tsx` | Add Billing nav item, add LockedBanner component |

### 3.3 Model: `app/models/billing.py`

```python
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base
import uuid
from datetime import datetime, timezone


class BrandSubscription(Base):
    __tablename__ = "brand_subscriptions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(100), ForeignKey("user_profiles.user_id", ondelete="CASCADE"), nullable=False, index=True)
    brand_id = Column(String(50), ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True)
    stripe_subscription_id = Column(String(255), unique=True, nullable=True)
    stripe_price_id = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default="incomplete")
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end = Column(Boolean, nullable=False, default=False)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
```

### 3.4 API Endpoints: `app/api/billing/routes.py`

Register in `app/main.py`:
```python
from app.api.billing.routes import router as billing_router
app.include_router(billing_router, prefix="/api/billing")
```

#### Endpoints to implement:

**`GET /api/billing/status`** — Auth required
- Returns the user's complete billing state
- Query `user_profiles` for tag, billing_status, stripe_customer_id
- Query `brand_subscriptions` for all user's subscriptions
- Query `brands` for brands without subscriptions
- Response shape:
```json
{
  "tag": "user",
  "billing_status": "active",
  "is_exempt": false,
  "stripe_customer_id": "cus_xxx",
  "subscriptions": [
    {
      "brand_id": "healthycollege",
      "brand_name": "Healthy College",
      "status": "active",
      "current_period_end": "2026-04-03T00:00:00Z",
      "cancel_at_period_end": false
    }
  ],
  "brands_without_subscription": [
    {
      "brand_id": "newbrand",
      "brand_name": "New Brand",
      "requires_payment": true
    }
  ]
}
```

**`POST /api/billing/checkout-session`** — Auth required
- Request: `{ "brand_id": "healthycollege" }`
- **Security checks (ALL required, in order):**
  1. Verify JWT → extract user_id
  2. Verify user is NOT exempt (tag must be `user`) — exempt users don't need checkout
  3. Load brand from DB → verify `brand.user_id == current_user.id` (CRITICAL: prevents subscribing to someone else's brand)
  4. Check no active `BrandSubscription` already exists for this user+brand
  5. Rate limit: max 5 checkout sessions per user per minute (use in-memory counter or Redis)
- **Logic:**
  1. Get or create Stripe Customer:
     ```python
     if not user.stripe_customer_id:
         customer = stripe.Customer.create(
             email=user.email,
             metadata={"viraltoby_user_id": user.user_id}
         )
         user.stripe_customer_id = customer.id
         db.commit()
     ```
  2. Create Checkout Session:
     ```python
     session = stripe.checkout.Session.create(
         customer=user.stripe_customer_id,
         mode="subscription",
         line_items=[{"price": os.getenv("STRIPE_PRICE_ID"), "quantity": 1}],
         metadata={"user_id": user.user_id, "brand_id": brand_id},
         subscription_metadata={"user_id": user.user_id, "brand_id": brand_id},
         success_url=f"{frontend_url}/billing?session_id={{CHECKOUT_SESSION_ID}}&brand_id={brand_id}",
         cancel_url=f"{frontend_url}/billing?cancelled=true",
     )
     ```
  3. Create `BrandSubscription` row with `status='incomplete'`
  4. Return `{ "checkout_url": session.url }`
- **Response:** `{ "checkout_url": "https://checkout.stripe.com/c/pay/cs_live_..." }`
- Frontend redirects to this URL. User pays on Stripe's hosted page.

**`POST /api/billing/portal-session`** — Auth required
- Creates Stripe Customer Portal session for managing payment methods, viewing invoices, cancelling
- **Security:** Verify user has a `stripe_customer_id`. If not, return 400.
- ```python
  session = stripe.billing_portal.Session.create(
      customer=user.stripe_customer_id,
      return_url=os.getenv("STRIPE_PORTAL_RETURN_URL"),
  )
  return {"portal_url": session.url}
  ```

**`POST /api/billing/cancel-subscription`** — Auth required
- Request: `{ "brand_id": "healthycollege" }`
- **Security:** Verify user owns brand. Verify BrandSubscription exists and is active.
- Sets `cancel_at_period_end=True` on Stripe (brand remains active until period end)
- ```python
  stripe.Subscription.modify(
      brand_sub.stripe_subscription_id,
      cancel_at_period_end=True,
  )
  brand_sub.cancel_at_period_end = True
  db.commit()
  ```

**`POST /api/billing/reactivate-subscription`** — Auth required
- Request: `{ "brand_id": "healthycollege" }`
- Reverses a pending cancellation (undo cancel_at_period_end)
- Only valid if subscription is still active and cancel_at_period_end is True

**`POST /api/billing/webhook`** — **NO AUTH** (Stripe signature verification instead)

This is the most security-critical endpoint. See §3.5.

### 3.5 Webhook Handler — SECURITY-CRITICAL

> ⚠️ **This endpoint receives money-related events from Stripe. Every line matters.**

```python
@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    # 1. Read raw body (MUST be raw bytes for signature verification)
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")

    # 2. Verify signature (NEVER skip this)
    try:
        event = stripe.Webhook.construct_event(
            payload,
            sig_header,
            os.getenv("STRIPE_WEBHOOK_SECRET")
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")

    # 3. Route to handler
    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        handle_checkout_completed(data, db)
    elif event_type == "invoice.paid":
        handle_invoice_paid(data, db)
    elif event_type == "invoice.payment_failed":
        handle_payment_failed(data, db)
    elif event_type == "customer.subscription.updated":
        handle_subscription_updated(data, db)
    elif event_type == "customer.subscription.deleted":
        handle_subscription_deleted(data, db)
    else:
        pass  # Ignore unhandled events

    return {"status": "ok"}
```

#### Webhook Security Rules

1. **ALWAYS verify `stripe-signature`** — the `stripe.Webhook.construct_event()` call does this. Never parse the body without verification. An attacker could POST fake events to grant themselves free access.
2. **Use raw bytes** — `await request.body()` not `await request.json()`. Signature verification requires the exact bytes Stripe sent.
3. **Idempotent handlers** — Stripe retries failed webhook deliveries. Use upserts, not inserts. Check if state already matches before writing.
4. **Never trust metadata alone** — after `checkout.session.completed`, retrieve the Subscription from Stripe API to confirm it's real: `stripe.Subscription.retrieve(subscription_id)`.
5. **Log all webhook events** — for audit trail. Log event type + event ID + user_id + brand_id. Never log full card details (Stripe doesn't send them, but be paranoid).
6. **Return 200 quickly** — webhook handlers must respond within 20 seconds. If processing is heavy, acknowledge and process async.

#### Handler: `checkout.session.completed`

```python
def handle_checkout_completed(data, db):
    """User completed Stripe Checkout — activate their brand subscription."""
    # Extract IDs from Checkout Session metadata
    user_id = data.get("metadata", {}).get("user_id")
    brand_id = data.get("metadata", {}).get("brand_id")
    subscription_id = data.get("subscription")

    if not all([user_id, brand_id, subscription_id]):
        log.error(f"Checkout webhook missing metadata: user={user_id} brand={brand_id} sub={subscription_id}")
        return

    # SECURITY: Verify the subscription actually exists on Stripe
    try:
        stripe_sub = stripe.Subscription.retrieve(subscription_id)
    except stripe.error.InvalidRequestError:
        log.error(f"Subscription {subscription_id} not found on Stripe")
        return

    # Verify user+brand ownership
    brand = db.query(Brand).filter_by(id=brand_id, user_id=user_id).first()
    if not brand:
        log.error(f"Brand {brand_id} not found for user {user_id}")
        return

    # Upsert BrandSubscription
    brand_sub = db.query(BrandSubscription).filter_by(
        user_id=user_id, brand_id=brand_id
    ).first()

    now = datetime.now(timezone.utc)
    if brand_sub:
        brand_sub.stripe_subscription_id = subscription_id
        brand_sub.stripe_price_id = stripe_sub["items"]["data"][0]["price"]["id"]
        brand_sub.status = "active"
        brand_sub.current_period_start = datetime.fromtimestamp(stripe_sub["current_period_start"], tz=timezone.utc)
        brand_sub.current_period_end = datetime.fromtimestamp(stripe_sub["current_period_end"], tz=timezone.utc)
        brand_sub.updated_at = now
    else:
        brand_sub = BrandSubscription(
            user_id=user_id,
            brand_id=brand_id,
            stripe_subscription_id=subscription_id,
            stripe_price_id=stripe_sub["items"]["data"][0]["price"]["id"],
            status="active",
            current_period_start=datetime.fromtimestamp(stripe_sub["current_period_start"], tz=timezone.utc),
            current_period_end=datetime.fromtimestamp(stripe_sub["current_period_end"], tz=timezone.utc),
            created_at=now,
            updated_at=now,
        )
        db.add(brand_sub)

    db.commit()

    # Recalculate user-level billing status
    recalculate_user_billing_status(user_id, db)
```

#### Handler: `invoice.paid`

```python
def handle_invoice_paid(data, db):
    """Recurring payment succeeded — ensure subscription is active, clear any grace period."""
    subscription_id = data.get("subscription")
    if not subscription_id:
        return

    brand_sub = db.query(BrandSubscription).filter_by(
        stripe_subscription_id=subscription_id
    ).first()
    if not brand_sub:
        return

    brand_sub.status = "active"
    brand_sub.updated_at = datetime.now(timezone.utc)
    db.commit()

    # If user was in grace or locked, this payment unlocks them
    unlock_user_if_needed(brand_sub.user_id, db)
```

#### Handler: `invoice.payment_failed`

```python
def handle_payment_failed(data, db):
    """Payment failed — mark subscription past_due, start grace period."""
    subscription_id = data.get("subscription")
    if not subscription_id:
        return

    brand_sub = db.query(BrandSubscription).filter_by(
        stripe_subscription_id=subscription_id
    ).first()
    if not brand_sub:
        return

    brand_sub.status = "past_due"
    brand_sub.updated_at = datetime.now(timezone.utc)
    db.commit()

    # Set grace period on user (7 days from now) — only if not already set
    user = db.query(UserProfile).filter_by(user_id=brand_sub.user_id).first()
    if user and not user.billing_grace_deadline:
        user.billing_grace_deadline = datetime.now(timezone.utc) + timedelta(days=7)
        user.billing_status = "past_due"
        db.commit()

    recalculate_user_billing_status(brand_sub.user_id, db)
```

#### Handler: `customer.subscription.deleted`

```python
def handle_subscription_deleted(data, db):
    """Subscription cancelled (end of period or immediate)."""
    subscription_id = data.get("id")
    brand_sub = db.query(BrandSubscription).filter_by(
        stripe_subscription_id=subscription_id
    ).first()
    if not brand_sub:
        return

    brand_sub.status = "cancelled"
    brand_sub.cancelled_at = datetime.now(timezone.utc)
    brand_sub.updated_at = datetime.now(timezone.utc)
    db.commit()

    recalculate_user_billing_status(brand_sub.user_id, db)
```

#### Handler: `customer.subscription.updated`

```python
def handle_subscription_updated(data, db):
    """Sync subscription state from Stripe (status, period, cancellation flag)."""
    subscription_id = data.get("id")
    brand_sub = db.query(BrandSubscription).filter_by(
        stripe_subscription_id=subscription_id
    ).first()
    if not brand_sub:
        return

    brand_sub.status = data.get("status", brand_sub.status)
    brand_sub.cancel_at_period_end = data.get("cancel_at_period_end", False)
    if data.get("current_period_start"):
        brand_sub.current_period_start = datetime.fromtimestamp(data["current_period_start"], tz=timezone.utc)
    if data.get("current_period_end"):
        brand_sub.current_period_end = datetime.fromtimestamp(data["current_period_end"], tz=timezone.utc)
    brand_sub.updated_at = datetime.now(timezone.utc)
    db.commit()

    recalculate_user_billing_status(brand_sub.user_id, db)
```

### 3.6 Billing Utilities: `app/services/billing_utils.py`

```python
EXEMPT_TAGS = frozenset({"special", "admin", "super_admin"})


def is_exempt(user) -> bool:
    """Check if user is exempt from billing."""
    return user.tag in EXEMPT_TAGS


def recalculate_user_billing_status(user_id: str, db):
    """
    Derive user.billing_status from the worst BrandSubscription status.
    Called after every webhook event that modifies a subscription.
    """
    user = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not user:
        return
    if is_exempt(user):
        user.billing_status = "none"
        db.commit()
        return

    subs = db.query(BrandSubscription).filter_by(user_id=user_id).all()
    if not subs:
        user.billing_status = "none"
        db.commit()
        return

    statuses = {s.status for s in subs}

    if "past_due" in statuses:
        user.billing_status = "past_due"
    elif "active" in statuses:
        user.billing_status = "active"
        user.billing_grace_deadline = None
        user.billing_locked_at = None
    elif statuses <= {"cancelled", "unpaid", "incomplete"}:
        user.billing_status = "cancelled"
    db.commit()


def unlock_user_if_needed(user_id: str, db):
    """Called when a payment succeeds. Reverses soft-lock if active."""
    user = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not user or user.billing_status not in ("past_due", "locked"):
        return

    user.billing_status = "active"
    user.billing_grace_deadline = None
    user.billing_locked_at = None

    # Re-enable Toby
    toby_state = db.query(TobyState).filter_by(user_id=user_id).first()
    if toby_state and not toby_state.enabled:
        toby_state.enabled = True

    # Resume future paused posts
    now = datetime.now(timezone.utc)
    db.query(ScheduledReel).filter(
        ScheduledReel.user_id == user_id,
        ScheduledReel.status == "paused",
        ScheduledReel.scheduled_time > now,
    ).update({"status": "scheduled"})

    db.commit()


def validate_can_generate(user_id: str, brand_id: str, db) -> tuple[bool, str | None]:
    """
    Check if a user+brand can generate content.
    Called before every generation job (both user-initiated and Toby-initiated).
    Returns (allowed, reason_if_blocked).
    """
    user = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not user:
        return False, "User not found"

    if is_exempt(user):
        return True, None

    if user.billing_status == "locked":
        return False, "Account locked — payment overdue. Update your payment method at /billing."

    brand_sub = db.query(BrandSubscription).filter_by(
        user_id=user_id, brand_id=brand_id
    ).first()

    if not brand_sub or brand_sub.status not in ("active", "past_due"):
        return False, f"No active subscription for this brand. Subscribe at /billing."

    return True, None
```

### 3.7 Grace Period Enforcer: `app/services/billing_enforcer.py`

Runs as a scheduled background job every 30 minutes (register in `app/main.py` alongside Toby's tick).

```python
def billing_enforcement_tick():
    """
    Find users whose 7-day grace period has expired and soft-lock them.
    - Disable Toby
    - Pause all scheduled (unpublished) posts
    - Set billing_status = 'locked'
    """
    with get_db_session() as db:
        now = datetime.now(timezone.utc)
        expired_users = db.query(UserProfile).filter(
            UserProfile.billing_status == "past_due",
            UserProfile.billing_grace_deadline <= now,
            UserProfile.billing_locked_at.is_(None),
            UserProfile.tag == "user",  # Only lock non-exempt users
        ).all()

        for user in expired_users:
            user.billing_status = "locked"
            user.billing_locked_at = now

            # Disable Toby
            toby_state = db.query(TobyState).filter_by(user_id=user.user_id).first()
            if toby_state:
                toby_state.enabled = False

            # Pause all scheduled (not yet published) posts
            db.query(ScheduledReel).filter(
                ScheduledReel.user_id == user.user_id,
                ScheduledReel.status == "scheduled",
            ).update({"status": "paused"})

            log.warning(f"BILLING: Soft-locked user {user.user_id} — grace period expired")

        db.commit()
```

Register in scheduler (in `app/main.py` where APScheduler is configured):
```python
scheduler.add_job(billing_enforcement_tick, "interval", minutes=30, id="billing_enforcer")
```

### 3.8 Toby Orchestrator Guard

In `app/services/toby/orchestrator.py`, inside the per-user iteration in `toby_tick()`:

```python
# Before processing this user's brands:
user_profile = db.query(UserProfile).filter_by(user_id=user_id).first()
if user_profile and user_profile.tag == "user":
    if user_profile.billing_status not in ("active", "none"):
        # Skip this user — billing issue
        continue
```

This is defense-in-depth. The soft-lock already disables `TobyState.enabled`, but this catches race conditions.

### 3.9 New ScheduledReel Status: `paused`

Currently valid statuses: `"scheduled"`, `"published"`, `"failed"`  
Add: `"paused"`

The publisher service already queries `WHERE status = 'scheduled'`, so `paused` reels are automatically skipped. Verify this by reading the publisher query — if it uses `status = 'scheduled'`, no publisher change needed.

### 3.10 Brand Deletion Safety

When a user deletes a brand that has an active Stripe subscription, the subscription must be cancelled on Stripe BEFORE the brand row is deleted (otherwise the CASCADE deletes the `BrandSubscription` row but Stripe keeps billing).

In the brand deletion endpoint (`DELETE /api/brands/{id}`), add:

```python
# Before deleting brand from DB:
brand_sub = db.query(BrandSubscription).filter_by(
    user_id=current_user["id"], brand_id=brand_id
).first()
if brand_sub and brand_sub.stripe_subscription_id:
    try:
        stripe.Subscription.cancel(brand_sub.stripe_subscription_id)
    except stripe.error.InvalidRequestError:
        pass  # Already cancelled on Stripe
```

---

## 4. Frontend Implementation

### 4.1 New Route

In `src/app/routes/index.tsx`, add under the AuthGuard-protected routes:

```tsx
{ path: 'billing', element: <BillingPage /> }
```

### 4.2 Navigation Item

In `src/app/layout/AppLayout.tsx`, add to `SETTINGS_ITEMS`:

```tsx
{ to: '/billing', label: 'Billing', icon: CreditCard }
```

Import `CreditCard` from `lucide-react`.

### 4.3 Hook: `useBillingStatus()`

**File:** `src/features/billing/useBillingStatus.ts`

```tsx
interface BrandSubscription {
  brand_id: string;
  brand_name: string;
  status: 'incomplete' | 'active' | 'past_due' | 'cancelled' | 'unpaid';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

interface UnsubscribedBrand {
  brand_id: string;
  brand_name: string;
  requires_payment: boolean;
}

interface BillingStatusData {
  tag: string;
  billing_status: 'none' | 'active' | 'past_due' | 'locked' | 'cancelled';
  is_exempt: boolean;
  stripe_customer_id: string | null;
  subscriptions: BrandSubscription[];
  brands_without_subscription: UnsubscribedBrand[];
}

export function useBillingStatus() {
  return useQuery<BillingStatusData>({
    queryKey: ['billing', 'status'],
    queryFn: () => api.get('/api/billing/status').then(r => r.data),
    staleTime: 60_000,
  });
}
```

### 4.4 Hook: `useBillingGate(brandId?)`

**File:** `src/features/billing/useBillingGate.ts`

Returns `{ allowed, reason, message }`. Use this in every component that performs a paid action (generate, schedule, enable Toby):

```tsx
export function useBillingGate(brandId?: string) {
  const { data: billing } = useBillingStatus();

  if (!billing) return { allowed: false, reason: 'loading' as const, message: 'Loading billing status...' };
  if (billing.is_exempt) return { allowed: true, reason: null, message: null };
  if (billing.billing_status === 'locked') return {
    allowed: false,
    reason: 'locked' as const,
    message: 'Account locked — update payment method',
  };

  if (brandId) {
    const hasSub = billing.subscriptions.some(
      s => s.brand_id === brandId && ['active', 'past_due'].includes(s.status)
    );
    if (!hasSub) return {
      allowed: false,
      reason: 'no_subscription' as const,
      message: 'Subscribe to activate this brand',
    };
  }

  return { allowed: true, reason: null, message: null };
}
```

### 4.5 Component: Paywall Modal

**File:** `src/features/billing/PaywallModal.tsx`

Shows after onboarding completes, and on any page where user has unsubscribed brands and tries to perform a paid action.

**Design principles:**
- Lists each unsubscribed brand with a Subscribe button
- Each button calls `POST /api/billing/checkout-session` with the brand_id
- On success, redirects to `checkout_url` (Stripe-hosted page)
- "Maybe later" dismisses for the session (use sessionStorage flag)
- Non-blocking — user can explore the dashboard but actions are gated

**Feature list to show:**
- Autonomous AI content generation (Toby)
- Unlimited scheduled posts
- Publishing to all connected platforms
- Advanced analytics & performance tracking
- Content DNA personalization
- 59 viral content patterns
- Video reels + carousel posts

### 4.6 Component: Locked Banner

**File:** `src/features/billing/LockedBanner.tsx`

Non-dismissible banner at top of every page when `billing_status === 'locked'`:

```
⚠️ Your account is locked due to overdue payment. Content generation and publishing are paused.
[Update Payment Method]  [View Billing →]
```

- "Update Payment Method" → calls `POST /api/billing/portal-session` → redirects to Stripe Portal
- "View Billing" → navigates to `/billing`

Render this in `AppLayout.tsx` above the main content area, conditionally based on `useBillingStatus()`.

### 4.7 Billing Page: `src/pages/Billing.tsx`

**Sections:**

**1. Account Overview**
- Status indicator (Active / Past Due / Locked / Exempt)
- Total monthly cost (count of active subscriptions × $50)
- Next billing date (earliest `current_period_end` across active subs)
- "Manage Payment Method" button → Stripe Portal

**2. Brand Subscriptions** (dynamic list from `useBillingStatus()`)
- For each subscribed brand: name, status, renewal date, Cancel button
- For each unsubscribed brand: name, "Subscribe — $50/mo" button
- Cancel → calls `POST /api/billing/cancel-subscription` → shows "Cancels on {date}"
- Subscribe → calls `POST /api/billing/checkout-session` → redirects to Stripe

**3. Invoice History**
- "View Invoices" button → Stripe Portal (invoices section)

**For exempt users:**
- Show: "✨ Your account has unlimited access. Account type: {tag}. No billing required."
- No subscription cards, no payment buttons

### 4.8 React Hooks Rule — CRITICAL REMINDER

In every component you create:

```tsx
// ✅ ALL hooks at the top, before ANY conditional return
function BillingPage() {
  const { data: billing, isLoading } = useBillingStatus();
  const navigate = useNavigate();
  const [showCancel, setShowCancel] = useState(false);
  const checkoutMutation = useMutation(...);

  // ✅ Early returns AFTER all hooks
  if (isLoading) return <Spinner />;
  if (!billing) return <ErrorState />;

  return <div>...</div>;
}
```

**Never** put a hook after an `if (...) return`. This crashes React.

---

## 5. User Journey — Complete Flow

### 5.1 New User (tag='user')

```
Signup → Onboarding (6 steps, all free) → Complete
  → Redirect to home
  → Paywall modal appears (brand not subscribed)
  → User can dismiss, browse read-only
  → Any action (generate, schedule, enable Toby) re-triggers paywall
  → User clicks Subscribe → Stripe Checkout → pays $50
  → Webhook activates subscription
  → Full access to that brand
```

### 5.2 Adding Second Brand

```
Brands page → Create Brand (free) → Configure (free)
  → Brand exists but no subscription
  → User goes to /billing or sees paywall
  → Subscribe for new brand → Stripe Checkout → $50/mo
  → Now paying $100/mo for 2 brands
```

### 5.3 Payment Failure

```
Stripe renewal fails
  → Webhook: invoice.payment_failed
  → billing_status = 'past_due', grace_deadline = now + 7 days
  → User sees warning banner: "Payment failed — update billing info"
  → Everything still works during grace period
  → If Stripe retry succeeds: back to active, grace cleared
  → If 7 days pass: billing_enforcer soft-locks user
    → Toby disabled
    → Scheduled posts paused
    → Generation blocked
  → User updates payment → Stripe charges → webhook: invoice.paid
  → unlock_user_if_needed() restores everything
```

### 5.4 Voluntary Cancellation

```
User clicks Cancel on billing page
  → cancel_at_period_end = true on Stripe
  → Brand remains active until period end
  → At period end: webhook customer.subscription.deleted
  → Brand locked, Toby off for that brand
  → User can re-subscribe anytime (new checkout)
```

---

## 6. Access Control Matrix

| Action | No Sub | Active | Past Due (grace) | Locked | Exempt |
|---|---|---|---|---|---|
| View dashboard / analytics | ✅ | ✅ | ✅ | ✅ read-only | ✅ |
| Create brand | ✅ | ✅ | ✅ | ✅ | ✅ |
| Configure brand (colors/DNA) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Connect platforms (OAuth) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Generate content** | ❌ paywall | ✅ | ✅ | ❌ locked | ✅ |
| **Schedule post** | ❌ paywall | ✅ | ✅ | ❌ locked | ✅ |
| **Toby running** | ❌ | ✅ | ✅ | ❌ disabled | ✅ |
| **Publish post** | ❌ | ✅ | ✅ | ❌ paused | ✅ |
| View / manage billing | ✅ | ✅ | ✅ | ✅ | ✅ |

**Key insight:** During `past_due` (7-day grace) everything works normally. Users only feel impact when `locked` kicks in. This maximizes payment recovery — most failed payments auto-retry and succeed within days.

---

## 7. Security Checklist

> **This is payments. Every item is mandatory.**

- [ ] **Webhook signature verification** — `stripe.Webhook.construct_event()` on every webhook request. Never skip.
- [ ] **Raw body parsing** — read `request.body()` as bytes, not JSON, before verification.
- [ ] **Server-side only** — `STRIPE_SECRET_KEY` never sent to frontend. All Stripe API calls from backend.
- [ ] **Stripe Checkout hosted** — never build custom card forms. Zero PCI scope.
- [ ] **Customer Portal hosted** — never handle raw payment methods.
- [ ] **Brand ownership validation** — before creating checkout: verify `brand.user_id == current_user.id`.
- [ ] **Rate limiting** — max 5 checkout sessions per user per minute on `POST /api/billing/checkout-session`.
- [ ] **Idempotent webhooks** — use upserts. Stripe retries. Same event arriving twice must not double-activate or double-lock.
- [ ] **Stripe subscription verification** — after `checkout.session.completed`, call `stripe.Subscription.retrieve()` to confirm it's real.
- [ ] **Cancel before delete** — when deleting a brand, cancel its Stripe subscription first.
- [ ] **No user input in Stripe metadata trusted blindly** — after webhook, always verify user+brand exist in DB and ownership matches.
- [ ] **HTTPS only** — webhook URL must be HTTPS (Railway handles this via `viraltoby.com`).
- [ ] **Env var isolation** — use `sk_test_` keys for development, `sk_live_` for production. Never mix.
- [ ] **Audit logging** — log every webhook event type + IDs. Log every checkout session creation. Log every lock/unlock.

---

## 8. Implementation Order

Execute in this exact order. Each step must be verified before proceeding to the next.

### Phase 1: Database + Models
1. Write and run `migrations/add_user_billing.sql`
2. Write and run `migrations/add_brand_subscriptions.sql`
3. Verify both migrations with `psql` column checks
4. Update `app/models/auth.py` — add 5 columns to `UserProfile`
5. Create `app/models/billing.py` — `BrandSubscription` model
6. Run `python scripts/validate_api.py --imports` — must pass

### Phase 2: Backend Services
7. Create `app/services/billing_utils.py` — helpers
8. Create `app/services/billing_enforcer.py` — background job
9. Add billing guard to `app/services/toby/orchestrator.py`
10. Add `validate_can_generate()` check to generation job handler
11. Add Stripe cancel to brand deletion endpoint
12. Run `python scripts/validate_api.py --imports` — must pass

### Phase 3: Backend API
13. Create `app/api/billing/__init__.py`
14. Create `app/api/billing/routes.py` — all 6 endpoints
15. Register router in `app/main.py`
16. Register `billing_enforcement_tick` in APScheduler in `app/main.py`
17. Run `python scripts/validate_api.py --imports` — must pass
18. Update `scripts/validate_api.py` — add billing modules to CRITICAL_MODULES

### Phase 4: Environment
19. Set `STRIPE_SECRET_KEY` on Railway via `railway variables set`
20. Set `STRIPE_PUBLISHABLE_KEY` on Railway
21. Set `STRIPE_WEBHOOK_SECRET` on Railway
22. Set `STRIPE_PRICE_ID` on Railway
23. Set `STRIPE_PORTAL_RETURN_URL=https://viraltoby.com/billing` on Railway
24. Add `stripe>=8.0.0` to `requirements.txt`

### Phase 5: Frontend
25. Create `src/features/billing/useBillingStatus.ts`
26. Create `src/features/billing/useBillingGate.ts`
27. Create `src/features/billing/PaywallModal.tsx`
28. Create `src/features/billing/LockedBanner.tsx`
29. Create `src/pages/Billing.tsx`
30. Add `/billing` route to `src/app/routes/index.tsx`
31. Add Billing nav item to `src/app/layout/AppLayout.tsx`
32. Add `LockedBanner` to `AppLayout.tsx` (conditional on billing_status)
33. Add paywall gate to generation and scheduling components

### Phase 6: Testing
34. Test with Stripe test keys (`sk_test_` / `pk_test_`)
35. Use Stripe CLI: `stripe listen --forward-to localhost:8000/api/billing/webhook`
36. Test: new user → onboarding → paywall → checkout → active
37. Test: payment failure → grace → lock → payment fix → unlock
38. Test: cancel → works until period end → locked
39. Test: exempt user → no paywall, full access
40. Test: webhook replay (same event twice) → idempotent
41. Run `python scripts/validate_api.py` — full validation, must pass

### Phase 7: Deploy
42. `git add -A && git commit -m "feat: billing system with Stripe subscriptions" && git push`
43. Verify Railway redeploy succeeds
44. Check `railway logs` for startup errors
45. Test live webhook with a real $50 payment (refund it after)

---

## 9. Stripe Test Cards

| Card Number | Behavior |
|---|---|
| `4242 4242 4242 4242` | Succeeds |
| `4000 0000 0000 0341` | Attach succeeds, charge fails |
| `4000 0000 0000 3220` | Requires 3D Secure |
| `4000 0000 0000 9995` | Charge fails (insufficient funds) |

Use any future expiry date and any 3-digit CVC.

---

## 10. Edge Cases

| Scenario | Handling |
|---|---|
| User creates brand in onboarding, never pays, returns months later | Brand + Content DNA preserved. Paywall re-appears. Zero data loss. |
| User has 5 brands, cancels 2 | Only those 2 lose generation/scheduling. Other 3 unaffected. |
| Generation starts during grace, grace expires mid-generation | In-progress job completes. Next Toby tick sees locked and stops. |
| Webhook arrives out of order | Use `updated_at` timestamps. Upserts handle idempotency. |
| Super admin manually sets user tag to 'special' | User exempted immediately. All billing enforcement skipped on next check. |
| User deletes brand with active subscription | Cancel subscription on Stripe first (pre-delete hook), then CASCADE deletes BrandSubscription row. |
| Stripe is down | Show user-friendly error: "Payment service temporarily unavailable. Please try again." |
| User changes email | Sync to Stripe Customer on profile update: `stripe.Customer.modify(cust_id, email=new_email)` |

---

*This document is the complete, security-hardened implementation blueprint. Execute phases in order. Verify at each step. No shortcuts on security.*
