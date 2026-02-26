"""Debug Instagram publishing failures across all users."""
import sys
sys.path.insert(0, '.')

from app.db_connection import SessionLocal
from app.models.scheduling import ScheduledReel
from app.models.brands import Brand
from sqlalchemy import or_, desc

db = SessionLocal()

posts = db.query(ScheduledReel).filter(
    or_(ScheduledReel.status == 'partial', ScheduledReel.status == 'failed')
).order_by(desc(ScheduledReel.created_at)).limit(100).all()

print(f'Found {len(posts)} partial/failed posts\n')

err_groups = {}
all_ig_errors = []

for p in posts:
    extra = p.extra_data or {}
    brand = str(extra.get('brand', extra.get('brands', '?')))
    pr = extra.get('publish_results', {}) or {}
    ig = pr.get('instagram', {}) if isinstance(pr, dict) else {}
    ig_err = ig.get('error', '') if isinstance(ig, dict) else ''
    fail_err = p.publish_error or ''
    combined = (ig_err or fail_err or '').strip()
    if combined:
        key = combined[:80]
        if key not in err_groups:
            err_groups[key] = {'count': 0, 'brands': set(), 'full': combined}
        err_groups[key]['count'] += 1
        err_groups[key]['brands'].add(brand)
    if ig_err:
        all_ig_errors.append((brand, p.status, ig_err))

print('=== ALL INSTAGRAM ERRORS ===')
for brand, status, err in all_ig_errors[:30]:
    print(f'  [{status}] {brand}: {err[:120]}')

print()
print('=== ERROR PATTERNS (grouped) ===')
for key, info in sorted(err_groups.items(), key=lambda x: -x[1]['count']):
    print(f'Count={info["count"]}: {info["full"][:120]}')
    print(f'  Brands: {sorted(info["brands"])}')
    print()

# Also check if video_path is missing from recent scheduled posts
print('=== CHECKING VIDEO_PATH PRESENCE ===')
recent = db.query(ScheduledReel).filter(
    ScheduledReel.status == 'scheduled'
).order_by(desc(ScheduledReel.created_at)).limit(20).all()

for p in recent:
    extra = p.extra_data or {}
    brand = str(extra.get('brand', '?'))
    vp = extra.get('video_path', '')
    tp = extra.get('thumbnail_path', '')
    platforms = extra.get('platforms', [])
    print(f'{brand:28s} | video={"YES" if vp else "NO":3s} | thumb={"YES" if tp else "NO":3s} | platforms={platforms}')

db.close()
