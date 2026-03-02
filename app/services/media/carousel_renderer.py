"""
Render carousel slides using Node.js Konva (pixel-perfect match to frontend).

Extracted from app/main.py so it can be reused by:
- Toby orchestrator (pre-render at job creation)
- Publish flow (JIT fallback)
- Repair scripts
"""
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional


def render_carousel_images(
    brand: str,
    title: str,
    background_image: str,
    slide_texts: list,
    reel_id: str,
    user_id: str = "system",
) -> Optional[dict]:
    """
    Render cover + text slides as PNG images via Node.js Konva.

    Args:
        brand: Brand ID
        title: Post title (rendered on cover)
        background_image: Local file path to the background image
        slide_texts: List of text strings for each carousel slide
        reel_id: Used for filename uniqueness
        user_id: Used for Supabase storage path

    Returns:
        dict with coverUrl, slideUrls (Supabase URLs) on success, None on failure
    """
    uid8 = reel_id[:8] if reel_id else "unknown"

    tmp_dir = tempfile.mkdtemp(prefix="slides_")
    cover_out = os.path.join(tmp_dir, f"post_{brand}_{uid8}.png")
    slide_outputs = [
        os.path.join(tmp_dir, f"post_{brand}_{uid8}_slide{idx}.png")
        for idx in range(len(slide_texts))
    ]

    # Build brand config from DB
    brand_config_data = {}
    logo_local_path = None
    try:
        from app.services.brands.resolver import brand_resolver
        b = brand_resolver.get_brand(brand)
        if b:
            colors = b.colors or {}
            raw_handle = b.instagram_handle or ""
            handle = raw_handle if raw_handle.startswith("@") else f"@{raw_handle}"
            if not handle or handle == "@":
                handle = brand
            brand_config_data = {
                "name": b.display_name or brand,
                "displayName": b.display_name or brand,
                "color": colors.get("primary", "#888888"),
                "accentColor": colors.get("accent", "#666666"),
                "abbreviation": b.short_name or (brand[0].upper() + "CO"),
                "handle": handle,
            }
            if b.logo_path:
                try:
                    import urllib.request
                    logo_url = b.logo_path
                    if logo_url.startswith("http"):
                        logo_ext = os.path.splitext(logo_url.split("?")[0])[1] or ".png"
                        logo_local_path = os.path.join(tmp_dir, f"{brand}_logo{logo_ext}")
                        urllib.request.urlretrieve(logo_url, logo_local_path)
                    elif os.path.isfile(logo_url):
                        logo_local_path = logo_url
                except Exception as logo_err:
                    print(f"[RENDER] Logo download warning: {logo_err}", flush=True)
                    logo_local_path = None
    except Exception:
        pass

    # Resolve script + font paths (works both locally and in Docker)
    # __file__ = app/services/media/carousel_renderer.py → .parent x4 = project root
    project_root = Path(__file__).resolve().parent.parent.parent.parent
    script_dir = project_root / "scripts"
    assets_dir = project_root / "assets"
    render_script = str(script_dir / "render-slides.cjs")
    # Docker paths take priority if they exist
    if Path("/app/scripts/render-slides.cjs").exists():
        render_script = "/app/scripts/render-slides.cjs"

    font_anton = str(assets_dir / "fonts" / "Anton-Regular.ttf")
    font_inter = str(assets_dir / "fonts" / "InterVariable.ttf")
    if Path("/app/assets/fonts/Anton-Regular.ttf").exists():
        font_anton = "/app/assets/fonts/Anton-Regular.ttf"
        font_inter = "/app/assets/fonts/InterVariable.ttf"

    share_icon = str(assets_dir / "icons" / "share.png")
    save_icon = str(assets_dir / "icons" / "save.png")
    if Path("/app/assets/icons/share.png").exists():
        share_icon = "/app/assets/icons/share.png"
        save_icon = "/app/assets/icons/save.png"

    input_data = {
        "brand": brand,
        "brandConfig": brand_config_data,
        "title": title,
        "backgroundImage": background_image,
        "slideTexts": slide_texts,
        "coverOutput": cover_out,
        "slideOutputs": slide_outputs,
        "logoPath": logo_local_path,
        "shareIconPath": share_icon,
        "saveIconPath": save_icon,
        "fontPaths": {
            "anton": font_anton,
            "inter": font_inter,
        },
    }

    json_path = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump(input_data, f)
            json_path = f.name

        result = subprocess.run(
            ["node", render_script, json_path],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            print(f"[RENDER] stderr: {result.stderr}", flush=True)
            return None

        output = json.loads(result.stdout.strip())
        if not output.get("success"):
            print(f"[RENDER] Error: {output.get('error')}", flush=True)
            return None

        # Convert PNGs to JPEG (Instagram carousel API requires JPEG format)
        # and upload rendered images to Supabase
        try:
            from PIL import Image as _PILImage
            from app.services.storage.supabase_storage import upload_from_path, storage_path

            def _convert_png_to_jpeg(png_path: str) -> str:
                """Convert a PNG image to JPEG (RGB, no alpha). Returns the JPEG path."""
                jpg_path = png_path.rsplit(".", 1)[0] + ".jpg"
                img = _PILImage.open(png_path)
                if img.mode == "RGBA":
                    # Flatten alpha onto white background
                    bg = _PILImage.new("RGB", img.size, (255, 255, 255))
                    bg.paste(img, mask=img.split()[3])
                    img = bg
                elif img.mode != "RGB":
                    img = img.convert("RGB")
                img.save(jpg_path, format="JPEG", quality=92, optimize=True)
                return jpg_path

            cover_path = output.get("coverPath", "")
            if cover_path and Path(cover_path).exists():
                cover_jpg = _convert_png_to_jpeg(cover_path)
                cover_name = Path(cover_jpg).name
                cover_remote = storage_path(user_id, brand, "posts", cover_name)
                output["coverUrl"] = upload_from_path("media", cover_remote, cover_jpg)

            slide_urls = []
            for sp in output.get("slidePaths", []):
                if sp and Path(sp).exists():
                    slide_jpg = _convert_png_to_jpeg(sp)
                    slide_name = Path(slide_jpg).name
                    slide_remote = storage_path(user_id, brand, "posts", slide_name)
                    slide_urls.append(upload_from_path("media", slide_remote, slide_jpg))
            output["slideUrls"] = slide_urls
        except Exception as upload_err:
            print(f"[RENDER] Supabase upload warning: {upload_err}", flush=True)

        return output

    except subprocess.TimeoutExpired:
        print("[RENDER] Timeout after 60s", flush=True)
        return None
    except Exception as e:
        print(f"[RENDER] Exception: {e}", flush=True)
        return None
    finally:
        if json_path:
            try:
                os.unlink(json_path)
            except Exception:
                pass
        import shutil as _shutil
        try:
            _shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass
