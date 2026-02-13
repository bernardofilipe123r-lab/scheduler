# Padding Analysis — Post Compositor

## 1. Current Padding Value(s) in `post_compositor.py`

The horizontal padding is defined as a **module-level constant** on line 23:

```python
TITLE_PADDING_X = 45  # pixels per side
```

It is used in **3 places**:

| Location | Usage |
|----------|-------|
| `compose_cover_slide()` line 331 | `max_width = CANVAS_WIDTH - TITLE_PADDING_X * 2` → `1080 - 90 = 990px` |
| `_draw_title()` line 274 | `text_width = CANVAS_WIDTH - TITLE_PADDING_X * 2` → used for centering text within the padded area |
| `_draw_title()` line 279 | `x = TITLE_PADDING_X + (text_width - tw) / 2` → left offset for each centered line |

**Current effective `max_width` = 1080 − 2×45 = 990px**

---

## 2. How `_auto_fit_font_size` Computes `max_width`

`_auto_fit_font_size(text, max_width)` receives `max_width` as a parameter — it does NOT compute it internally. The caller (`compose_cover_slide`) computes it:

```python
max_width = CANVAS_WIDTH - TITLE_PADDING_X * 2   # 1080 - 90 = 990
font_size = _auto_fit_font_size(title, max_width)
```

Inside `_auto_fit_font_size`, the algorithm:

1. **Character-count estimation**: `avg_char_width = font_size * 0.48`, then `max_chars = int(max_width / avg_char_width)`
2. **Try 3 lines** (preferred): Scan font sizes 90→64 (step -2), pick the largest where `_count_lines() == 3`
3. **Try 2 lines**: Scan 90→30, pick the largest where `_count_lines() == 2`
4. **Try 1 line**: Scan 90→30, pick the largest where `_count_lines() <= 1`
5. **Fallback**: Return 30 (AUTO_FIT_MIN)

`_count_lines` uses greedy word-wrapping based on `max_chars` (character count, not pixel measurement).

---

## 3. Where to Change Padding to 0

To set padding to 0, change the constant:

```python
# Line 23 in app/services/post_compositor.py
TITLE_PADDING_X = 0   # was 45
```

This single change propagates to all 3 usage sites because they all reference the constant.

Alternatively, to make `compose_cover_slide` accept a dynamic padding parameter:

```python
def compose_cover_slide(background_path, title, brand, output_path=None, title_padding_x=45):
    max_width = CANVAS_WIDTH - title_padding_x * 2
    ...
```

And update `_draw_title` to also accept the padding parameter instead of using the global.

---

## 4. How Layout Settings from Frontend Reach the Compositor

**They DON'T currently.**

The flow:
1. **Frontend** (`Posts.tsx`): Layout settings including `titlePaddingX` are stored in `settings.layout` state
2. **Persistence**: `saveGeneralSettings()` saves to **`localStorage`** only (see `PostCanvas.tsx` line 304)
3. **Client-side rendering**: `PostCanvas.tsx` uses `gl.titlePaddingX` for Konva canvas rendering (lines 496, 540, 545, 547)
4. **Server-side publish**: `compose_cover_slide()` is called in `app/main.py` line 380 with only 4 args: `background_path`, `title`, `brand`, `output_path` — **no layout settings are passed**
5. **Server constant**: `TITLE_PADDING_X = 45` is hardcoded, completely independent of frontend settings

**The "Horizontal Padding" slider in the frontend only affects the client-side Konva preview. The server-side compositor always uses 45px regardless of what the user sets in the UI.**

---

## 5. Effect of 0 Padding on Font Size Computation

With `TITLE_PADDING_X = 0`:

| Metric | Before (pad=45) | After (pad=0) | Change |
|--------|-----------------|---------------|--------|
| `max_width` | 990px | 1080px | +9.1% wider |
| `max_chars` at 90px font | `int(990 / 43.2) = 22` | `int(1080 / 43.2) = 25` | +3 chars/line |
| `max_chars` at 64px font | `int(990 / 30.72) = 32` | `int(1080 / 30.72) = 35` | +3 chars/line |

**Effects:**
- **Larger font sizes become viable** — more horizontal space means text that previously needed 4 lines at 90px might now fit in 3, so the algorithm picks 90px instead of dropping to a smaller size
- **Shorter titles may fit on fewer lines** — a title that was 2 lines at 90px might become 1 line, causing the algorithm to pick a different (potentially smaller) font size if it prefers 3-line layout
- **Text will be edge-to-edge** — with 0 padding, the title text extends to the full canvas width, which may look cramped against the edges
- The `_draw_title` centering still works (`x = 0 + (1080 - tw) / 2`) but text lines close to `max_width` will nearly touch the image edges

**Recommendation**: If the goal is wider text with larger font, a small padding like 10-20px is safer than 0 to avoid text touching image borders.

---

## Summary

| Item | Current State |
|------|--------------|
| Padding constant | `TITLE_PADDING_X = 45` (line 23) |
| Effective max_width | 990px |
| Frontend setting | `settings.layout.titlePaddingX` — stored in localStorage, **NOT sent to backend** |
| Server-side | Hardcoded, ignores frontend setting |
| Fix location | Single constant change on line 23, or add parameter to `compose_cover_slide()` |
