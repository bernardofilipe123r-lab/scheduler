"""
Billing API Routes — Stripe subscription management.

Endpoints:
  GET  /api/billing/status              — billing status for current user
  POST /api/billing/checkout-session     — create Stripe Checkout session
  POST /api/billing/portal-session       — create Stripe Customer Portal session
  POST /api/billing/cancel-subscription  — cancel a brand subscription
  POST /api/billing/reactivate-subscription — reactivate pending cancellation
  POST /api/billing/webhook             — Stripe webhook (no auth, sig-verified)
"""
import os
import logging
import time
import threading
from datetime import datetime, timezone, timedelta
from collections import defaultdict

import stripe
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db_connection import get_db
from app.api.auth.middleware import get_current_user
from app.models.auth import UserProfile, EXEMPT_TAGS
from app.models.billing import BrandSubscription
from app.models.brands import Brand
from app.services.billing_utils import (
    is_exempt,
    recalculate_user_billing_status,
    unlock_user_if_needed,
)

log = logging.getLogger(__name__)

router = APIRouter(tags=["billing"])

# ── Stripe API key ──────────────────────────────────────────────────────────
stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

# ── Rate limiter (in-memory, per-process) ────────────────────────────────────
_checkout_rate: dict[str, list[float]] = defaultdict(list)
_rate_lock = threading.Lock()
MAX_CHECKOUT_PER_MIN = 5


def _rate_limit_checkout(user_id: str):
    now = time.time()
    with _rate_lock:
        stamps = _checkout_rate[user_id]
        stamps[:] = [t for t in stamps if now - t < 60]
        if len(stamps) >= MAX_CHECKOUT_PER_MIN:
            raise HTTPException(429, "Too many checkout attempts. Try again in a minute.")
        stamps.append(now)


# ── Request schemas ──────────────────────────────────────────────────────────
class BrandIdBody(BaseModel):
    brand_id: str


# ═════════════════════════════════════════════════════════════════════════════
# GET /status
# ═════════════════════════════════════════════════════════════════════════════
@router.get("/status")
async def billing_status(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return the current user's full billing state."""
    user_id = user["id"]
    profile = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not profile:
        raise HTTPException(404, "User profile not found")

    exempt = is_exempt(profile)

    subs = db.query(BrandSubscription).filter_by(user_id=user_id).all()
    subscribed_brand_ids = {s.brand_id for s in subs if s.status in ("active", "past_due", "incomplete")}

    all_brands = db.query(Brand).filter_by(user_id=user_id, active=True).all()

    return {
        "tag": profile.tag or "user",
        "billing_status": profile.billing_status or "none",
        "is_exempt": exempt,
        "stripe_customer_id": profile.stripe_customer_id,
        "billing_grace_deadline": (
            profile.billing_grace_deadline.isoformat()
            if profile.billing_grace_deadline
            else None
        ),
        "billing_locked_at": (
            profile.billing_locked_at.isoformat()
            if profile.billing_locked_at
            else None
        ),
        "subscriptions": [
            {
                "brand_id": s.brand_id,
                "brand_name": next(
                    (b.name for b in all_brands if b.id == s.brand_id), s.brand_id
                ),
                "status": s.status,
                "current_period_end": (
                    s.current_period_end.isoformat() if s.current_period_end else None
                ),
                "cancel_at_period_end": s.cancel_at_period_end,
            }
            for s in subs
        ],
        "brands_without_subscription": [
            {
                "brand_id": b.id,
                "brand_name": b.name,
                "requires_payment": not exempt,
            }
            for b in all_brands
            if b.id not in subscribed_brand_ids
        ],
    }


# ═════════════════════════════════════════════════════════════════════════════
# POST /checkout-session
# ═════════════════════════════════════════════════════════════════════════════
@router.post("/checkout-session")
async def create_checkout_session(
    body: BrandIdBody,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a Stripe Checkout session for a brand subscription."""
    user_id = user["id"]
    brand_id = body.brand_id

    _rate_limit_checkout(user_id)

    profile = db.query(UserProfile).filter_by(user_id=user_id).first()
    if not profile:
        raise HTTPException(404, "User profile not found")

    if is_exempt(profile):
        raise HTTPException(400, "Exempt users do not need a subscription.")

    # SECURITY: verify user owns this brand
    brand = db.query(Brand).filter_by(id=brand_id, user_id=user_id, active=True).first()
    if not brand:
        raise HTTPException(404, "Brand not found or does not belong to you.")

    # Check for existing active subscription
    existing = db.query(BrandSubscription).filter_by(
        user_id=user_id, brand_id=brand_id
    ).first()
    if existing and existing.status in ("active", "past_due"):
        raise HTTPException(400, "This brand already has an active subscription.")

    # Get-or-create Stripe Customer
    if not profile.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user.get("email", ""),
            metadata={"viraltoby_user_id": user_id},
        )
        profile.stripe_customer_id = customer.id
        db.commit()

    frontend_url = os.getenv("FRONTEND_URL", "https://viraltoby.com")
    price_id = os.getenv("STRIPE_PRICE_ID", "")
    if not price_id:
        raise HTTPException(500, "Stripe price not configured.")

    session = stripe.checkout.Session.create(
        customer=profile.stripe_customer_id,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        metadata={"user_id": user_id, "brand_id": brand_id},
        subscription_metadata={"user_id": user_id, "brand_id": brand_id},
        success_url=f"{frontend_url}/billing?session_id={{CHECKOUT_SESSION_ID}}&brand_id={brand_id}",
        cancel_url=f"{frontend_url}/billing?cancelled=true",
    )

    # Create an incomplete subscription row so we can track it
    if existing:
        existing.status = "incomplete"
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.add(BrandSubscription(
            user_id=user_id,
            brand_id=brand_id,
            status="incomplete",
        ))
    db.commit()

    return {"checkout_url": session.url}


# ═════════════════════════════════════════════════════════════════════════════
# POST /portal-session
# ═════════════════════════════════════════════════════════════════════════════
@router.post("/portal-session")
async def create_portal_session(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Create a Stripe Customer Portal session."""
    profile = db.query(UserProfile).filter_by(user_id=user["id"]).first()
    if not profile or not profile.stripe_customer_id:
        raise HTTPException(400, "No billing account found. Subscribe first.")

    return_url = os.getenv("STRIPE_PORTAL_RETURN_URL", os.getenv("FRONTEND_URL", "https://viraltoby.com") + "/billing")
    session = stripe.billing_portal.Session.create(
        customer=profile.stripe_customer_id,
        return_url=return_url,
    )
    return {"portal_url": session.url}


# ═════════════════════════════════════════════════════════════════════════════
# POST /cancel-subscription
# ═════════════════════════════════════════════════════════════════════════════
@router.post("/cancel-subscription")
async def cancel_subscription(
    body: BrandIdBody,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Cancel a brand subscription at end of billing period."""
    user_id = user["id"]
    brand_sub = db.query(BrandSubscription).filter_by(
        user_id=user_id, brand_id=body.brand_id
    ).first()
    if not brand_sub or brand_sub.status not in ("active", "past_due"):
        raise HTTPException(404, "No active subscription found for this brand.")

    # SECURITY: verify brand ownership
    brand = db.query(Brand).filter_by(id=body.brand_id, user_id=user_id).first()
    if not brand:
        raise HTTPException(404, "Brand not found.")

    stripe.Subscription.modify(
        brand_sub.stripe_subscription_id,
        cancel_at_period_end=True,
    )
    brand_sub.cancel_at_period_end = True
    brand_sub.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"success": True, "message": "Subscription will cancel at end of billing period."}


# ═════════════════════════════════════════════════════════════════════════════
# POST /reactivate-subscription
# ═════════════════════════════════════════════════════════════════════════════
@router.post("/reactivate-subscription")
async def reactivate_subscription(
    body: BrandIdBody,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Undo pending cancellation — keep subscription active."""
    user_id = user["id"]
    brand_sub = db.query(BrandSubscription).filter_by(
        user_id=user_id, brand_id=body.brand_id,
    ).first()
    if not brand_sub or brand_sub.status != "active" or not brand_sub.cancel_at_period_end:
        raise HTTPException(400, "No pending cancellation to reactivate.")

    stripe.Subscription.modify(
        brand_sub.stripe_subscription_id,
        cancel_at_period_end=False,
    )
    brand_sub.cancel_at_period_end = False
    brand_sub.updated_at = datetime.now(timezone.utc)
    db.commit()

    return {"success": True, "message": "Subscription reactivated."}


# ═════════════════════════════════════════════════════════════════════════════
# POST /webhook  — STRIPE SIGNATURE VERIFIED, NO AUTH
# ═════════════════════════════════════════════════════════════════════════════
@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Receive Stripe webhook events. Signature-verified — no JWT auth.
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(400, "Missing stripe-signature header")

    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret:
        log.error("STRIPE_WEBHOOK_SECRET is not set")
        raise HTTPException(500, "Webhook not configured")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except ValueError:
        raise HTTPException(400, "Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")

    event_type = event["type"]
    data = event["data"]["object"]
    log.info(f"BILLING WEBHOOK: {event_type} | event_id={event.get('id')}")

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(data, db)
    elif event_type == "invoice.paid":
        _handle_invoice_paid(data, db)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(data, db)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(data, db)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data, db)

    return {"status": "ok"}


# ═════════════════════════════════════════════════════════════════════════════
# Webhook handlers (private)
# ═════════════════════════════════════════════════════════════════════════════

def _handle_checkout_completed(data: dict, db: Session):
    user_id = data.get("metadata", {}).get("user_id")
    brand_id = data.get("metadata", {}).get("brand_id")
    subscription_id = data.get("subscription")

    if not all([user_id, brand_id, subscription_id]):
        log.error(f"Checkout webhook missing metadata: user={user_id} brand={brand_id} sub={subscription_id}")
        return

    # SECURITY: verify subscription exists on Stripe
    try:
        stripe_sub = stripe.Subscription.retrieve(subscription_id)
    except stripe.error.InvalidRequestError:
        log.error(f"Subscription {subscription_id} not found on Stripe")
        return

    # Verify brand ownership
    brand = db.query(Brand).filter_by(id=brand_id, user_id=user_id).first()
    if not brand:
        log.error(f"Brand {brand_id} not found for user {user_id}")
        return

    # Upsert BrandSubscription
    now = datetime.now(timezone.utc)
    brand_sub = db.query(BrandSubscription).filter_by(
        user_id=user_id, brand_id=brand_id
    ).first()

    period_start = datetime.fromtimestamp(stripe_sub["current_period_start"], tz=timezone.utc)
    period_end = datetime.fromtimestamp(stripe_sub["current_period_end"], tz=timezone.utc)
    price_id = stripe_sub["items"]["data"][0]["price"]["id"]

    if brand_sub:
        brand_sub.stripe_subscription_id = subscription_id
        brand_sub.stripe_price_id = price_id
        brand_sub.status = "active"
        brand_sub.current_period_start = period_start
        brand_sub.current_period_end = period_end
        brand_sub.updated_at = now
    else:
        brand_sub = BrandSubscription(
            user_id=user_id,
            brand_id=brand_id,
            stripe_subscription_id=subscription_id,
            stripe_price_id=price_id,
            status="active",
            current_period_start=period_start,
            current_period_end=period_end,
            created_at=now,
            updated_at=now,
        )
        db.add(brand_sub)

    db.commit()
    recalculate_user_billing_status(user_id, db)
    log.info(f"BILLING: Checkout completed — user={user_id} brand={brand_id}")


def _handle_invoice_paid(data: dict, db: Session):
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

    unlock_user_if_needed(brand_sub.user_id, db)
    log.info(f"BILLING: Invoice paid — sub={subscription_id}")


def _handle_payment_failed(data: dict, db: Session):
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

    user = db.query(UserProfile).filter_by(user_id=brand_sub.user_id).first()
    if user and not user.billing_grace_deadline:
        user.billing_grace_deadline = datetime.now(timezone.utc) + timedelta(days=7)
        user.billing_status = "past_due"
        db.commit()

    recalculate_user_billing_status(brand_sub.user_id, db)
    log.info(f"BILLING: Payment failed — sub={subscription_id}")


def _handle_subscription_updated(data: dict, db: Session):
    subscription_id = data.get("id")
    brand_sub = db.query(BrandSubscription).filter_by(
        stripe_subscription_id=subscription_id
    ).first()
    if not brand_sub:
        return

    brand_sub.status = data.get("status", brand_sub.status)
    brand_sub.cancel_at_period_end = data.get("cancel_at_period_end", False)
    if data.get("current_period_start"):
        brand_sub.current_period_start = datetime.fromtimestamp(
            data["current_period_start"], tz=timezone.utc
        )
    if data.get("current_period_end"):
        brand_sub.current_period_end = datetime.fromtimestamp(
            data["current_period_end"], tz=timezone.utc
        )
    brand_sub.updated_at = datetime.now(timezone.utc)
    db.commit()

    recalculate_user_billing_status(brand_sub.user_id, db)


def _handle_subscription_deleted(data: dict, db: Session):
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
    log.info(f"BILLING: Subscription deleted — sub={subscription_id}")
