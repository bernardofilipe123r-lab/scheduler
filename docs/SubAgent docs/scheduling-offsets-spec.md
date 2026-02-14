# Scheduling Offsets — Simplification Spec

## 1. What is `schedule_offset`?

An integer (0–23) stored on the `brands` table (`Brand.schedule_offset`). It acts as a **per-brand hour stagger** so no two brands ever publish at the same minute.

All time-slot formulas add the offset to a fixed base pattern:

| Content type | Base hours | Posts/day | Pattern |
|---|---|---|---|
| **Reels** | 0, 4, 8, 12, 16, 20 | 6 | Every 4 h, alternating L→D |
| **Posts** | 8, 14 | 2 | Morning + Afternoon |

Example with `offset = 3`:
- Reels → 03:00 L, 07:00 D, 11:00 L, 15:00 D, 19:00 L, 23:00 D
- Posts  → 11:00, 17:00

## 2. How is it currently assigned?

### Backend — hardcoded seed values
In `app/services/brands/manager.py`, `DEFAULT_BRANDS` contains hand-picked offsets:

| Brand | Hardcoded offset |
|---|---|
| healthycollege | 0 |
| longevitycollege | 2 |
| vitalitycollege | 4 |
| holisticcollege | 6 |
| wellbeingcollege | 8 |

These are used only during initial DB seeding (`seed_default_brands()`).

### Frontend — manual slider + smart default
`CreateBrandModal.tsx` (Step 3) exposes a **0–23 slider**. It computes a smart default:

```ts
const defaultOffset = useMemo(() => {
  const maxOffset = existingBrands.reduce((max, b) => {
    const offset = b.schedule_offset ?? BRAND_SCHEDULES[b.id]?.offset ?? 0
    return Math.max(max, offset)
  }, -1)
  return (maxOffset + 1) % 24
}, [existingBrands])
```

And shows a **conflict warning** if the chosen offset already belongs to another brand.

`BrandSettingsModal.tsx` lets users edit the offset after creation via a dropdown.

### Frontend — hardcoded fallback constants
`src/features/brands/constants.ts` still carries a legacy `BRAND_SCHEDULES` map used as fallback when the DB field isn't available:

```ts
export const BRAND_SCHEDULES = {
  healthycollege: { offset: 0, postsPerDay: 2 },
  longevitycollege: { offset: 1, postsPerDay: 2 },
  // ...
}
```

> Note: these offsets **differ** from the backend seed values (1-hour gaps vs 2-hour gaps) — a latent inconsistency.

### API
`POST /api/brands` accepts `schedule_offset` in the request body. `PUT /api/brands/{id}` accepts it in the update payload. There is **no server-side validation** ensuring uniqueness.

## 3. How is it used when scheduling?

### `scheduler.py` — `get_next_available_slot()`
Contains its own **inline** `BRAND_OFFSETS` dict (yet another copy):

```python
BRAND_OFFSETS = {
    "holisticcollege": 0,
    "healthycollege": 1,
    "vitalitycollege": 2,
    "longevitycollege": 3,
    "wellbeingcollege": 4,
}
```

This is **never read from the DB** — it's hardcoded. It computes time slots by applying the offset to the base pattern, then skipping already-occupied slots.

`get_next_available_post_slot()` uses the same inline dict.

### Frontend — `Scheduled.tsx`
Reads `schedule_offset` dynamically from the DB via `useDynamicBrands()` → used for calendar visualisation. ✅ This is the only place that reads from DB correctly.

### Frontend — `CreateBrandModal.tsx` schedule map
Renders a 24-hour timeline showing all brands' reel and post slots, using the DB-backed offset. ✅

## 4. Problems with current approach

| # | Problem |
|---|---|
| 1 | **Three separate hardcoded offset tables** — `DEFAULT_BRANDS` in manager.py, `BRAND_SCHEDULES` in constants.ts, `BRAND_OFFSETS` in scheduler.py — all with **different values**. |
| 2 | **scheduler.py never reads from DB** — `get_next_available_slot()` uses its own hardcoded map, ignoring whatever the user configured. |
| 3 | **No uniqueness enforcement** — two brands can have the same offset; only a UI warning exists. |
| 4 | **Manual configuration burden** — users must pick an offset and understand the slot system. |
| 5 | **Legacy fallback chain** — frontend does `v2Brand?.schedule_offset ?? BRAND_SCHEDULES[b.id]?.offset ?? 0` everywhere, adding complexity. |

## 5. Proposed simplification: Auto-assigned offsets

### Core idea
**Offset = creation order × interval**. Users never see or touch the offset.

### Algorithm

```python
def compute_offset(brand_count_before: int, total_brands: int) -> int:
    """
    Auto-assign offset based on brand creation order.
    Interval = floor(24 / total_brands), min 1.
    """
    interval = max(1, 24 // max(total_brands, 1))
    return (brand_count_before * interval) % 24
```

When a brand is created:
1. Count existing active brands for this user → `n`
2. `offset = n` (simplest: 1-hour gap per brand, supports up to 24 brands)
3. Store in `brands.schedule_offset`

### Where to implement

| File | Change |
|---|---|
| **`app/services/brands/manager.py` — `create_brand()`** | Auto-compute offset; ignore any `schedule_offset` from the request. |
| **`app/services/brands/manager.py` — `DEFAULT_BRANDS`** | Remove hardcoded offsets (or make them `None`; auto-assign during seed). |
| **`app/services/publishing/scheduler.py`** | **Delete** inline `BRAND_OFFSETS` dict. Read offset from DB via brand query. |
| **`src/features/brands/constants.ts`** | Remove `BRAND_SCHEDULES` map entirely. |
| **`src/features/brands/components/CreateBrandModal.tsx`** | Remove Step 3 (schedule offset slider). Show a read-only info box: "Schedule will be auto-assigned". |
| **`src/features/brands/components/BrandSettingsModal.tsx`** | Remove offset dropdown. Show offset as read-only display. |
| **`app/api/brands_routes_v2.py`** | Remove `schedule_offset` from `CreateBrandRequest`. Keep it in `UpdateBrandRequest` for admin override only (optional). |
| **All frontend fallback chains** | Replace `b.schedule_offset ?? BRAND_SCHEDULES[b.id]?.offset ?? 0` with just `b.schedule_offset`. |

### Rebalancing on brand deletion
When a brand is deleted/deactivated, existing offsets stay the same (no rebalancing needed). A gap in the schedule is acceptable — it just means one fewer brand posts in that hour slot.

### Migration for existing brands
Run a one-time migration that assigns offsets `0, 1, 2, 3, 4` (based on `created_at` order) to the 5 existing brands, then deploy the new code.

### Summary of removals
- **3 hardcoded offset maps** → 0 (DB is single source of truth)
- **1 manual UI step** → 0 (auto-assigned)
- **~15 fallback expressions** in frontend → simple `b.schedule_offset`
- **scheduler.py hardcoded lookups** → DB query

---

*Spec created: 2026-02-14*
*Path: `docs/SubAgent docs/scheduling-offsets-spec.md`*
