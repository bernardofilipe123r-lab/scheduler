"""
Re-render all 18 carousel covers with the updated (lighter) gradient overlay.

For each scheduled post:
  1. Derive the raw AI background URL from job_id + brand
  2. Download it
  3. Re-render cover + text slides via carousel_renderer
  4. Update carousel_paths and thumbnail_path in DB

Usage:
    python3 scripts/rerender_carousels.py          # dry-run
    python3 scripts/rerender_carousels.py --apply   # apply
"""
import json, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv; load_dotenv()
import psycopg2
import requests


def main():
    apply = "--apply" in sys.argv
    if not apply:
        print("DRY-RUN — pass --apply to re-render and update DB\n", flush=True)

    url = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(url)
    cur = conn.cursor()

    cur.execute("""
        SELECT s.schedule_id, s.extra_data, j.brand_outputs
        FROM scheduled_reels s
        LEFT JOIN generation_jobs j ON j.job_id = s.extra_data->>'job_id'
        WHERE s.status = 'scheduled'
          AND s.extra_data->>'variant' = 'post'
          AND s.extra_data->>'job_id' IS NOT NULL
          AND s.extra_data->>'thumbnail_path' IS NOT NULL
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} post-variant scheduled posts", flush=True)

    rendered = 0
    failed = 0
    for schedule_id, ed, brand_outputs in rows:
        if not isinstance(ed, dict):
            ed = json.loads(ed) if ed else {}
        if brand_outputs and not isinstance(brand_outputs, dict):
            brand_outputs = json.loads(brand_outputs)

        job_id = ed.get("job_id", "")
        brand = ed.get("brand", "unknown")
        title = ed.get("title", "")
        slide_texts = ed.get("slide_texts") or []
        tp = ed.get("thumbnail_path", "")

        if not job_id or not slide_texts or not tp:
            continue

        reel_id = f"{job_id}_{brand}"

        # Get raw background URL from generation_jobs (correct user-scoped path)
        raw_bg_url = None
        if brand_outputs:
            bd = brand_outputs.get(brand, {})
            raw_bg_url = bd.get("thumbnail_path")
        if not raw_bg_url:
            # Fallback: derive from scheduled thumbnail_path
            reel_id = f"{job_id}_{brand}"
            base_url = tp.rsplit("/", 1)[0]
            raw_bg_url = f"{base_url}/{reel_id}_background.png"

        print(f"  [{schedule_id[:8]}] {brand} — {len(slide_texts)} slides", flush=True)

        if not apply:
            rendered += 1
            continue

        # Download raw background
        tmp_bg_path = None
        try:
            resp = requests.get(raw_bg_url, timeout=60)
            resp.raise_for_status()
            tmp_bg = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            tmp_bg.write(resp.content)
            tmp_bg.close()
            tmp_bg_path = tmp_bg.name

            from app.services.media.carousel_renderer import render_carousel_images
            composed = render_carousel_images(
                brand=brand,
                title=title,
                background_image=tmp_bg_path,
                slide_texts=slide_texts,
                reel_id=reel_id,
                user_id=ed.get("user_id", "system"),
            )

            if composed:
                cover_url = composed.get("coverUrl") or composed.get("coverPath")
                slide_urls = composed.get("slideUrls") or composed.get("slidePaths") or []
                new_cp = [cover_url] + slide_urls

                ed["thumbnail_path"] = cover_url
                ed["carousel_paths"] = new_cp
                ed["raw_background_url"] = raw_bg_url
                cur.execute(
                    "UPDATE scheduled_reels SET extra_data = %s WHERE schedule_id = %s",
                    (json.dumps(ed), schedule_id)
                )
                rendered += 1
                print(f"    ✅ Rendered {len(new_cp)} images", flush=True)
            else:
                failed += 1
                print(f"    ❌ Renderer returned None", flush=True)
        except Exception as e:
            failed += 1
            print(f"    ❌ Error: {e}", flush=True)
        finally:
            if tmp_bg_path:
                try:
                    os.unlink(tmp_bg_path)
                except Exception:
                    pass

    if apply and rendered > 0:
        conn.commit()
        print(f"\n✅ Re-rendered {rendered} post(s), {failed} failed", flush=True)
    elif apply:
        print(f"\nNo posts re-rendered ({failed} failed)", flush=True)
    else:
        print(f"\n{rendered} post(s) would be re-rendered", flush=True)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
