"""
Migration: Populate rendering color fields in brands.colors JSON.
Sources values from brand_colors.py hardcoded BRAND_COLORS dict.

Adds 6 new keys to each brand's colors JSON:
  - light_thumbnail_text_color
  - light_content_title_text_color
  - light_content_title_bg_color
  - dark_thumbnail_text_color
  - dark_content_title_text_color
  - dark_content_title_bg_color

Idempotent: safe to run multiple times (overwrites with same values).

Run: python -m scripts.migrate_brand_colors
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db_connection import SessionLocal
from app.models import Brand
from app.core.brand_colors import BRAND_COLORS


def rgb_to_hex(rgb_tuple):
    """Convert (R, G, B) or (R, G, B, A) tuple to hex string (ignores alpha)."""
    return "#{:02x}{:02x}{:02x}".format(rgb_tuple[0], rgb_tuple[1], rgb_tuple[2])


def migrate():
    db = SessionLocal()
    try:
        brands = db.query(Brand).all()
        updated = 0

        for brand in brands:
            brand_id = brand.id
            colors = dict(brand.colors or {})

            if brand_id in BRAND_COLORS:
                config = BRAND_COLORS[brand_id]
                lm = config.light_mode
                dm = config.dark_mode

                colors["light_thumbnail_text_color"] = rgb_to_hex(lm.thumbnail_text_color)
                colors["light_content_title_text_color"] = rgb_to_hex(lm.content_title_text_color)
                colors["light_content_title_bg_color"] = rgb_to_hex(lm.content_title_bg_color)
                colors["dark_thumbnail_text_color"] = rgb_to_hex(dm.thumbnail_text_color)
                colors["dark_content_title_text_color"] = rgb_to_hex(dm.content_title_text_color)
                colors["dark_content_title_bg_color"] = rgb_to_hex(dm.content_title_bg_color)

                brand.colors = colors
                updated += 1
                print(f"  ✓ {brand_id}: populated 6 rendering colors")
                print(f"    light: thumb={colors['light_thumbnail_text_color']}, "
                      f"title_text={colors['light_content_title_text_color']}, "
                      f"title_bg={colors['light_content_title_bg_color']}")
                print(f"    dark:  thumb={colors['dark_thumbnail_text_color']}, "
                      f"title_text={colors['dark_content_title_text_color']}, "
                      f"title_bg={colors['dark_content_title_bg_color']}")
            else:
                print(f"  ⚠ {brand_id}: no hardcoded colors found in BRAND_COLORS, skipping")

        db.commit()
        print(f"\nMigration complete: {updated}/{len(brands)} brands updated")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
