"""Deep dive into IG failure details."""
import sys, json
sys.path.insert(0, '.')

from app.db_connection import SessionLocal
from app.models.scheduling import ScheduledReel
from sqlalchemy import or_, desc

db = SessionLocal()
posts = db.query(ScheduledReel).filter(
    or_(ScheduledReel.status == 'partial', ScheduledReel.status == 'failed')
).order_by(desc(ScheduledReel.created_at)).limit(150).all()

# === Issue 1: ProcessingFailedError detail ===
print("=== ProcessingFailedError FULL DETAIL (first 5) ===")
pfe_count = 0
for p in posts:
    extra = p.extra_data or {}
    pr = extra.get('publish_results', {}) or {}
    ig = pr.get('instagram', {}) if isinstance(pr, dict) else {}
    err = ig.get('error', '') if isinstance(ig, dict) else ''
    if 'ProcessingFailed' in err and pfe_count < 5:
        brand = str(extra.get('brand', '?'))
        vp = extra.get('video_path', 'MISSING')
        platforms = extra.get('platforms', [])
        print(f'\nBrand: {brand}')
        print(f'video_path: {vp}')
        print(f'platforms: {platforms}')
        print(f'IG error: {err}')
        # check what succeeded
        for plat, res in pr.items():
            if isinstance(res, dict) and res.get('success'):
                print(f'  SUCCEEDED: {plat}')
        pfe_count += 1

# === Issue 2: Invalid OAuth - what user / brand has this? ===
print("\n=== Invalid OAuth token - per brand ===")
oauth_brands = {}
for p in posts:
    extra = p.extra_data or {}
    brand = str(extra.get('brand', '?'))
    pr = extra.get('publish_results', {}) or {}
    ig = pr.get('instagram', {}) if isinstance(pr, dict) else {}
    ig_err = ig.get('error', '') if isinstance(ig, dict) else ''
    fail_err = p.publish_error or ''
    combined = ig_err or fail_err or ''
    if 'Invalid OAuth' in combined or 'Cannot parse access token' in combined:
        oauth_brands[brand] = oauth_brands.get(brand, 0) + 1

for brand, count in sorted(oauth_brands.items()):
    print(f'  {brand}: {count} failures')

# === Issue 3: Missing video_url ===
print("\n=== video_url missing (recent partial/failed) ===")
for p in posts:
    extra = p.extra_data or {}
    vp = extra.get('video_path', '')
    brand = str(extra.get('brand', '?'))
    if not vp:
        pr = extra.get('publish_results', {}) or {}
        ig = pr.get('instagram', {}) if isinstance(pr, dict) else {}
        ig_err = ig.get('error', '') if isinstance(ig, dict) else ''
        fail_err = p.publish_error or ''
        err = ig_err or fail_err or ''
        print(f'  {brand} | created_by={p.created_by} | reel_id={p.reel_id} | err={err[:80]}')

db.close()
