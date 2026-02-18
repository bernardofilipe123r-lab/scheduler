"""Update brand instagram_handle and facebook_page_name to use correct 'the' prefix."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.db_connection import get_db_session
from sqlalchemy import text

updates = [
    ('healthycollege', '@thehealthycollege', 'The Healthy College'),
    ('holisticcollege', '@theholisticcollege', 'The Holistic College'),
    ('longevitycollege', '@thelongevitycollege', 'The Longevity College'),
    ('vitalitycollege', '@thevitalitycollege', 'The Vitality College'),
    ('wellbeingcollege', '@thewellbeingcollege', 'The Wellbeing College'),
]

with get_db_session() as db:
    for brand_id, handle, page_name in updates:
        db.execute(
            text('UPDATE brands SET instagram_handle = :handle, facebook_page_name = :page WHERE id = :id'),
            {'handle': handle, 'page': page_name, 'id': brand_id}
        )
    db.commit()
    rows = db.execute(text('SELECT id, instagram_handle, facebook_page_name FROM brands ORDER BY id')).fetchall()
    for r in rows:
        print(r)
print("Done.")
