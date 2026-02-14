# Auth & Brands Analysis — Root Cause Report

**Date:** 2026-02-14  
**User:** bernardofilipe123r@gmail.com (UUID: `7c7bdcc7-ad79-4554-8d32-e5ef02608e84`)

---

## Executive Summary

Two interconnected bugs:

1. **Auth 500 errors** — The auth middleware itself is correct, but the `SUPABASE_SERVICE_KEY` env var name used in middleware doesn't match what some code expects. The middleware at `app/api/auth/middleware.py` uses `SUPABASE_SERVICE_KEY` and this IS set on Railway, so JWT validation should work. The likely 500 is from downstream code (brands query) failing, not auth itself.

2. **Brands page shows "No Brands"** — **ROOT CAUSE FOUND.** Brands were seeded at startup with `user_id=None`, but the API filters by the authenticated user's UUID. `None != '7c7bdcc7-...'`, so 0 brands are returned.

---

## 1. Auth Flow Analysis

### Frontend Auth Flow (Working Correctly)
- **Login:** `src/features/auth/AuthContext.tsx` → calls `supabase.auth.signInWithPassword()`
- **Session:** Supabase JS SDK stores JWT in localStorage automatically
- **API calls:** `src/shared/api/client.ts` → `authHeaders()` extracts `session.access_token` and adds `Authorization: Bearer <token>` header to all API requests
- **Supabase config:** `src/shared/api/supabase.ts` uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (both set on Railway)

### Backend Auth Flow (Working Correctly)
- **Middleware:** `app/api/auth/middleware.py` L20-43
  - Uses `HTTPBearer(auto_error=False)` to extract Bearer token
  - Creates Supabase client with `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
  - Calls `supabase.auth.get_user(token)` to validate JWT
  - Returns `{ "id": str(user.id), "email": user.email, ... }`
  - Both env vars ARE set on Railway ✅

### Auth conclusion: **Auth middleware is correct.** The token validation works. The problem manifests as "No Brands" not as an auth error.

---

## 2. Brands "No Brands" Problem — ROOT CAUSE

### The Seed Problem

**File:** `app/main.py` L240  
**Code:** `brands_seeded = seed_brands_if_needed(db)`

This calls `BrandManager.seed_default_brands()` (in `app/services/brands/manager.py` L462-486) **without passing a `user_id`**.

**Result:** All 5 default brands are created with `user_id=None`:
```
id=healthycollege,  user_id=None, name=THE HEALTHY COLLEGE
id=longevitycollege, user_id=None, name=THE LONGEVITY COLLEGE
id=vitalitycollege,  user_id=None, name=THE VITALITY COLLEGE
id=holisticcollege,  user_id=None, name=THE HOLISTIC COLLEGE
id=wellbeingcollege,  user_id=None, name=THE WELLBEING COLLEGE
```

### The Query Problem

**File:** `app/api/brands/routes.py` L104-116  
All brand endpoints require auth and filter by user_id:

```python
@router.get("")
async def list_brands(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),  # ← requires auth
) -> Dict[str, Any]:
    manager = get_brand_manager(db)
    brands = manager.get_all_brands(
        include_inactive=include_inactive,
        user_id=user["id"]  # ← filters by '7c7bdcc7-...'
    )
```

**File:** `app/services/brands/manager.py` L250-260  
```python
def get_all_brands(self, include_inactive=False, user_id=None):
    Brand = self._get_brand_model()
    query = self.db.query(Brand)
    if user_id:
        query = query.filter(Brand.user_id == user_id)  # ← None != '7c7bdcc7-...' → 0 results
    if not include_inactive:
        query = query.filter(Brand.active == True)
    brands = query.order_by(Brand.display_name).all()
    return [b.to_dict() for b in brands]
```

**Query executed:**
```sql
SELECT * FROM brands WHERE user_id = '7c7bdcc7-...' AND active = true ORDER BY display_name
-- Returns 0 rows because all brands have user_id = NULL
```

### Frontend Request Chain

1. `BrandsPage` (`src/pages/Brands.tsx`) calls:
   - `useBrandsList()` → `GET /api/brands/list` ← uses `get_current_user`, filters by user_id
   - `useBrandConnections()` → `GET /api/brands/connections` ← same issue
   - `useBrands()` → `GET /api/v2/brands` ← same issue

2. `src/shared/api/client.ts` correctly attaches JWT to all requests.

3. Backend routes correctly validate JWT and extract user_id.

4. **But the query returns empty because brands.user_id IS NULL.**

### Internal Services (brand_resolver) — Different Problem

The `brand_resolver` singleton (`app/services/brands/resolver.py`) is used by internal services (Maestro, publishing, metrics). It calls `get_all_brands(user_id=None)` which means:
```python
if user_id:  # None is falsy, so this skips the filter
    query = query.filter(Brand.user_id == user_id)
# → Returns all brands regardless of user_id (works for internal use)
```

This is why the **startup logs** show 5 brands with credentials, but the **API** returns 0.

---

## 3. File-by-File Issues

### Files That Need Changes

| File | Line(s) | Issue | Fix |
|------|---------|-------|-----|
| `app/main.py` | 240 | `seed_brands_if_needed(db)` called without `user_id` | Not the right fix — see below |
| `app/services/brands/manager.py` | 462-486 | `seed_default_brands()` sets `user_id=None` | Need a migration to assign brands to user |
| `app/models/brands.py` | 18 | `user_id = Column(String(100), nullable=False)` — declared NOT NULL | DB may have been created before this constraint, or it's being bypassed |

### Files That Are Correct (No Changes Needed)

| File | Status |
|------|--------|
| `app/api/auth/middleware.py` | ✅ Auth works correctly |
| `app/api/auth/routes.py` | ✅ `/api/auth/me` works |
| `src/shared/api/client.ts` | ✅ JWT attached correctly |
| `src/shared/api/supabase.ts` | ✅ Supabase client configured |
| `src/features/auth/AuthContext.tsx` | ✅ Auth state managed correctly |
| `src/features/brands/api/use-brands.ts` | ✅ API calls are correct |
| `src/features/brands/hooks/use-connections.ts` | ✅ Hooks are correct |
| `src/pages/Brands.tsx` | ✅ UI code is correct |

---

## 4. Recommended Fixes

### Fix 1: Database Migration — Assign Existing Brands to User (IMMEDIATE)

Run a SQL update to assign all NULL-user_id brands to the known user:

```sql
UPDATE brands
SET user_id = '7c7bdcc7-ad79-4554-8d32-e5ef02608e84'
WHERE user_id IS NULL;
```

This immediately fixes the "No Brands" problem.

### Fix 2: Fix Startup Seed to Use a Default User (PREVENTIVE)

**File:** `app/main.py` ~L240  
The seed call should look up or accept a default user ID. Options:

**Option A — Skip seed if no user context (recommended for multi-tenant):**
The startup seed should NOT create brands for no user. Brands should only be created via the API (which has user context).

**Option B — Assign to first auth user:**
```python
# In startup:
from app.db_connection import SessionLocal
db = SessionLocal()
# Check if any brands exist at all (any user)
from app.models import Brand
total_brands = db.query(Brand).count()
if total_brands == 0:
    # Don't seed - brands will be created by users via the API
    print("   🏷️ No brands yet — users will create them via the API")
```

**Option C — Accept a DEFAULT_USER_ID env var:**
```python
default_user = os.getenv("DEFAULT_USER_ID")
if default_user:
    brands_seeded = seed_brands_if_needed(db, user_id=default_user)
```

### Fix 3: brand_resolver for Internal Services (NO CHANGE NEEDED)

The `brand_resolver` already handles `user_id=None` gracefully by not filtering, which is correct for internal services like Maestro, publishing, and metrics collection. But after Fix 1 is applied, the resolver will need to be called with `user_id=None` to still get all brands (since brands will have a real `user_id`).

**Potential issue:** After assigning brands to a user, `brand_resolver.get_all_brands()` (with `user_id=None`) will still work because the code only filters when `user_id` is truthy:
```python
if user_id:
    query = query.filter(Brand.user_id == user_id)
```
So passing `None` returns ALL brands. This is correct for internal services. ✅

---

## 5. Verification Steps

After applying Fix 1:

1. **Test auth:** `curl -H "Authorization: Bearer <jwt>" https://<domain>/api/auth/me`
   - Should return `{"status": "authenticated", "user": {"email": "...", "id": "7c7bdcc7-..."}}`

2. **Test brands list:** `curl -H "Authorization: Bearer <jwt>" https://<domain>/api/brands`
   - Should return `{"brands": [...], "count": 5}`

3. **Test frontend:** Login → Brands page → Should show 5 brands

4. **Test internal services:** Railway logs should continue showing 5 brands on startup

---

## 6. Environment Variables (Verified on Railway)

| Variable | Set? | Used By |
|----------|------|---------|
| `SUPABASE_URL` | ✅ | Backend auth middleware |
| `SUPABASE_SERVICE_KEY` | ✅ | Backend auth middleware |
| `SUPABASE_KEY` | ✅ | Backend (publishable key) |
| `VITE_SUPABASE_URL` | ✅ | Frontend Supabase client |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Frontend Supabase client |
| `DATABASE_URL` | ✅ | SQLAlchemy connection |

---

## 7. Architecture Summary

```
Frontend (React + Supabase JS)
  ↓ signInWithPassword()
Supabase Auth (hosted)
  ↓ JWT token
Frontend stores in session
  ↓ Bearer token on every API call
FastAPI Backend
  ↓ middleware.get_current_user() validates JWT via supabase.auth.get_user()
  ↓ extracts user["id"] = UUID
Brand Routes
  ↓ manager.get_all_brands(user_id=UUID)
Database Query
  ↓ WHERE user_id = UUID AND active = true
  ↓ Returns 0 rows (brands have user_id=NULL) ← BUG
Frontend shows "No Brands"
```
