"""Check brand tokens and ProcessingFailedError full messages."""
import sys
sys.path.insert(0, '.')

from app.db_connection import SessionLocal
from app.models.scheduling import ScheduledReel
from app.models.brands import Brand
from sqlalchemy import or_, desc

db = SessionLocal()

# === Check brand token health ===
print("=== BRAND TOKEN STATE ===")
brands = db.query(Brand).all()
for b in brands:
    ig_tok = (b.instagram_access_token or '')[:20] + '...' if b.instagram_access_token else 'NONE'
    meta_tok = (b.meta_access_token or '')[:20] + '...' if b.meta_access_token else 'NONE'
    ig_account = b.instagram_business_account_id or 'NONE'
    # Check for token desync
    has_ig = bool(b.instagram_access_token)
    has_meta = bool(b.meta_access_token)
    match = has_ig == has_meta
    print(f'{b.id:30s} | ig_account={ig_account:25s} | ig_tok={has_ig} | meta_tok={has_meta} | match={match}')

# === ProcessingFailedError - check publish_error ===
print("\n=== ProcessingFailedError via publish_error (first 5) ===")
pfe_posts = db.query(ScheduledReel).filter(
    or_(ScheduledReel.status == 'partial', ScheduledReel.status == 'failed'),
    ScheduledReel.publish_error.like('%ProcessingFailed%')
).order_by(desc(ScheduledReel.created_at)).limit(5).all()

for p in pfe_posts:
    extra = p.extra_data or {}
    brand = str(extra.get('brand', '?'))
    vp = extra.get('video_path', 'MISSING')
    pr = extra.get('publish_results', {}) or {}
    print(f'\nBrand: {brand}')
    print(f'publish_error: {(p.publish_error or "")[:300]}')
    print(f'video_path: {vp[:80] if vp else "NONE"}')
    print(f'publish_results keys: {list(pr.keys()) if pr else "[]"}')
    for plat, res in (pr.items() if pr else []):
        if isinstance(res, dict):
            print(f'  {plat}: success={res.get("success")}, error={str(res.get("error",""))[:100]}')

# === Invalid OAuth - full error + which user ===
print("\n=== Invalid OAuth full messages (first 5) ===")
oauth_posts = db.query(ScheduledReel).filter(
    or_(ScheduledReel.status == 'partial', ScheduledReel.status == 'failed'),
    ScheduledReel.publish_error.like('%Invalid OAuth%')
).order_by(desc(ScheduledReel.created_at)).limit(5).all()

for p in oauth_posts:
    extra = p.extra_data or {}
    brand = str(extra.get('brand', '?'))
    print(f'\nBrand: {brand} | user_id: {p.user_id[:20]}...')
    print(f'publish_error: {(p.publish_error or "")[:200]}')
    pr = extra.get('publish_results', {}) or {}
    for plat, res in (pr.items() if pr else []):
        if isinstance(res, dict):
            print(f'  {plat}: success={res.get("success")}, error={str(res.get("error",""))[:100]}')

db.close()
