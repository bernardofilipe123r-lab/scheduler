# Ten Tasks — Comprehensive Research & Spec

> Created: 2026-02-17  
> Scope: 10 tasks across frontend and backend

---

## TASK 1: AI Team — "Test Maestro" Button

### Current State

**AI Team page:** [src/pages/AITeam.tsx](src/pages/AITeam.tsx)  
**Route:** `/ai-team` (inside `AppLayout`, requires auth via `AuthGuard`)

#### Admin Detection (AITeam.tsx, lines ~632-633)
```ts
const { user } = useAuth()
const isAdmin = user?.id === '7c7bdcc7-ad79-4554-8d32-e5ef02608e84' || user?.email === 'filipe@healthycollege.co'
```
- Admin check is **hardcoded** in the `MaestroOperations` component
- Admin gets 3 manual burst requests per 24h (tracked in `localStorage` under key `maestro-admin-burst-timestamps`)
- Normal users get 2 requests with 12h cooldown spacing  

#### "Run Now" Button (Daily Burst trigger)
- Located inside `MaestroOperations` → the `daily_burst` cycle card
- Calls `POST /api/maestro/trigger-burst?force=true`
- Backend: [app/api/maestro/routes.py](app/api/maestro/routes.py) — `trigger_burst()` endpoint
- Runs `maestro._run_daily_burst_for_user(user_id)` in a background task

#### Maestro Orchestrator
- **Main class:** [app/services/maestro/maestro.py](app/services/maestro/maestro.py) → `MaestroDaemon`
- **State management:** [app/services/maestro/state.py](app/services/maestro/state.py)
- **Scheduling logic:** [app/services/maestro/scheduler_logic.py](app/services/maestro/scheduler_logic.py)
- **Cycles:** [app/services/maestro/cycles.py](app/services/maestro/cycles.py) (observe, scout, feedback, evolution, diagnostics, bootstrap, learning)
- **Healing:** [app/services/maestro/healing.py](app/services/maestro/healing.py)
- **Proposals:** [app/services/maestro/proposals.py](app/services/maestro/proposals.py)

#### Pause/Resume (OverviewTab, lines ~505-545)
- Shows Pause/Resume button when `isRunning || isPaused`
- Calls `POST /api/maestro/pause` or `POST /api/maestro/resume`
- Optimistic UI update via `localPausedOverride` state

#### What "Test Maestro" Would Need
Currently there is **no** "Test Maestro" button. The closest is:
1. **"Run Now"** button on the Daily Burst card — triggers a full burst
2. **Pause/Resume** toggle in the Overview tab

A "Test Maestro" button would presumably:
- Trigger a single agent to generate 1-2 proposals (not a full burst)
- Or run a diagnostic check (already exists at `/api/agents/diagnostics/run`)
- Or test connectivity to all APIs (deAPI, DeepSeek, Meta)

**No existing test/dry-run endpoint exists** — would need to be created.

---

## TASK 2: Custom Loading for API Quotas

### Current State

**Quotas tab:** `QuotasTab` component in [src/pages/AITeam.tsx](src/pages/AITeam.tsx) (line ~396)

#### Current loading state (line ~411-415):
```tsx
if (quotasLoading) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
    </div>
  )
}
```
This is a **generic spinner** — just a `Loader2` icon spinning. No text, no context, no personality.

#### Existing Loading Patterns in the Codebase

1. **`PageLoader`** — [src/shared/components/PageLoader.tsx](src/shared/components/PageLoader.tsx)
   - Has **per-page themed loading**: emoji + message + animated dots
   - Themes: `ai-team` (🤖 "Agents are thinking"), `videos` (🎬 "Rolling the cameras"), etc.
   - Used by the main AI Team page when initial data loads

2. **`LoadingSpinner`** — [src/shared/components/LoadingSpinner.tsx](src/shared/components/LoadingSpinner.tsx)
   - Simple `Loader2` spinner with optional text
   - Has `FullPageLoader` and `CardLoader` variants

3. **Observatory Loading** — [src/pages/Observatory.tsx](src/pages/Observatory.tsx)
   - `LoadingState` component: animated concentric circles with "CONNECTING" text
   - Dark theme, uses framer-motion

#### Recommendation
Replace the generic `Loader2` spinner in `QuotasTab` with a custom loading component that matches the AI Team aesthetic. Options:
- Use `PageLoader` with a new `quotas` theme (e.g., 📊 "Checking API quotas...")
- Or create a mini skeleton loading state showing the card outlines for deAPI and DeepSeek

#### Data Source
- Hook: `useQuotas(activeTab === 'quotas')` from [src/features/ai-team/api/use-ai-team.ts](src/features/ai-team/api/use-ai-team.ts)
- API: `GET /api/ai-team/quotas`
- Refetch interval: 30s when `quotas` tab is active

---

## TASK 3: Disable Dangerous Agent Buttons

### Current State

**Location:** `AgentCard` component in [src/pages/AITeam.tsx](src/pages/AITeam.tsx) (lines ~820-840)

#### Three Dangerous Buttons:
```tsx
<button onClick={onMutate} ...>
  Force Mutate
</button>
<button onClick={onClone} ...>
  Clone DNA
</button>
<button onClick={onRetire} ...>
  Retire
</button>
```

#### Current Safeguards:
- **Force Mutate** & **Clone DNA**: Only disabled during `!!actionLoading` (when another action is in progress). No confirmation dialog.
- **Retire**: Has `confirm()` dialog: `"Retire ${name}? Their DNA will be archived to the gene pool."` + cannot retire builtin agents (backend check)

#### Backend Endpoints ([app/api/agents/routes.py](app/api/agents/routes.py)):
- `POST /api/agents/{id}/mutate` — Re-randomizes DNA (temperature, strategies, weights, variant, risk_tolerance). Increments generation + mutation_count.
- `POST /api/agents/{id}/clone` — Creates new agent with exact DNA copy from source.
- `POST /api/agents/{id}/retire` — Archives DNA to gene pool, sets `active=False`. Cannot retire builtin agents (returns 400).

#### Recommendation
These buttons should be:
1. **Admin-only** — Only show for admin user (using same `isAdmin` check from Task 1)
2. **OR** require confirmation for all three (currently only retire has `confirm()`)
3. **OR** completely hidden/disabled with a tooltip explaining why

Note: There's no "Force" standalone button — the **Force Mutate** button is the "Force" action. The label includes "Force" as part of the mutation action name.

---

## TASK 4: `/app/output` Investigation

### Current State

#### How output is used:

**Dockerfile** (line 77):
```dockerfile
RUN mkdir -p output/videos output/thumbnails output/reels output/schedules output/posts
```

**Docker WORKDIR** is `/app`, so files live at `/app/output/...`

**`app/main.py`** (line ~105):
```python
output_dir = Path("/app/output") if Path("/app/output").exists() else Path("output")
```

#### Files written to output/:
1. **Posts/Carousels**: `output/posts/post_{brand}_{uid8}.png`, `output/posts/post_{brand}_{uid8}_background.png`, `output/posts/post_{brand}_{uid8}_slide{idx}.png`
2. **Videos**: `output/videos/{reel_id}_video.mp4`, `output/videos/{reel_id}.mp4`
3. **Thumbnails**: `output/thumbnails/{reel_id}_thumbnail.png`, `output/thumbnails/{reel_id}.png`
4. **Brand logos**: `output/brand-data/logos/`

#### Path normalization (main.py):
- `_resolve_output_path()` normalizes between Docker (`/app/output/...`) and local (`output/...`)
- Frontend gets URLs like `/output/posts/...` which are served by the static file mount

#### Supabase Storage:
- **Not used yet** for media files. Only used for auth.
- A migration spec exists at [docs/SubAgent docs/templates-storage-spec.md](docs/SubAgent%20docs/templates-storage-spec.md) but hasn't been implemented.
- `@supabase/storage-js` is available as a transitive dependency.

#### The Problem:
Output files exist on Docker's ephemeral filesystem. On Railway/render deploys, `/app/output` is a persistent volume. But if the volume fails or isn't attached, all generated media is lost.

#### Key References:
- [app/main.py](app/main.py) — Main generation pipeline, writes to output/
- [app/services/maestro/scheduler_logic.py](app/services/maestro/scheduler_logic.py) — Scheduler writes post/reel paths
- [Dockerfile](Dockerfile) — Creates output directories
- [docs/SubAgent docs/templates-storage-spec.md](docs/SubAgent%20docs/templates-storage-spec.md) — Planned Supabase Storage migration

---

## TASK 5: Profile Display Name

### Current State

**Profile page:** [src/pages/Profile.tsx](src/pages/Profile.tsx)  
**Route:** `/profile` (inside `AppLayout`)

#### Current Display:
```tsx
<label>Display Name</label>
<input value={user?.name || ''} readOnly ... />

<label>Email Address</label>
<input value={user?.email || ''} readOnly ... />
```

Both fields are **read-only**. No edit functionality for display name.

#### Where `user.name` comes from:
1. **Frontend AuthContext** ([src/features/auth/AuthContext.tsx](src/features/auth/AuthContext.tsx)):
   ```ts
   name: supaUser.user_metadata?.name || ''
   ```
   So `name` comes from **Supabase `user_metadata.name`**.

2. **Backend** ([app/api/auth_routes.py](app/api/auth_routes.py)):
   ```python
   "name": user.get("name", "")
   ```
   But the middleware ([app/api/auth/middleware.py](app/api/auth/middleware.py)) only extracts `id`, `email`, `role` from the JWT — **no `name` field**.

3. **DB model** ([app/models/auth.py](app/models/auth.py)):
   `UserProfile.user_name` field exists.

#### To Allow Display Name Editing:
- Frontend: Call `supabase.auth.updateUser({ data: { name: newName } })` to update `user_metadata.name`
- Backend: The display name lives in Supabase Auth metadata, not in the local DB's `user_profiles.user_name`
- Profile page needs an edit mode or inline edit for the name field

---

## TASK 6: Password Change Email Confirmation

### Current State

**Password change:** [src/pages/Profile.tsx](src/pages/Profile.tsx) (lines ~34-49)

```tsx
const { error } = await supabase.auth.updateUser({ password: newPw })
```

- Uses **Supabase Auth SDK** directly — `updateUser({ password })` 
- No email confirmation is sent — password is changed immediately
- Only client-side validation: passwords must match and be ≥8 characters

#### Existing Email Infrastructure:
- **Supabase** handles all auth emails (signup confirmation, password reset magic links)
- There is **no custom email sending** infrastructure in the codebase
- No SMTP setup, no SendGrid, no Resend, no email templates

#### Supabase Behavior:
- `supabase.auth.updateUser({ password })` changes the password **immediately** for the current session
- If using `supabase.auth.resetPasswordForEmail(email)`, Supabase sends a magic link email, and the password is changed via the link callback
- Supabase can be configured to require email confirmation for password changes via its dashboard settings

#### To Add Email Confirmation:
Option A: Use Supabase's built-in password reset flow instead of direct update:
1. User clicks "Change Password"
2. Call `supabase.auth.resetPasswordForEmail(user.email)`
3. User receives email with magic link
4. Link redirects back to app → `updateUser({ password })`

Option B: Supabase project settings → require re-authentication before password change (Supabase dashboard config)

---

## TASK 7: Email Change Secure Flow

### Current State

There is **no email change functionality** in the codebase.

- Profile page shows email as **read-only**
- No UI to change email
- No backend endpoint for email changes

#### Supabase Auth Capabilities:
- `supabase.auth.updateUser({ email: newEmail })` — Supabase handles the secure flow:
  1. Sends confirmation email to the **new** email address
  2. Optionally sends notification to the **old** email address
  3. Email isn't changed until the new address is confirmed
  4. Configurable in Supabase dashboard → Auth → Email settings

#### To Implement:
1. **Frontend:** Add "Change Email" section to Profile page with:
   - Input for new email
   - Button that calls `supabase.auth.updateUser({ email: newEmail })`
   - Success message: "Confirmation email sent to new address"
2. **Backend:** No changes needed — Supabase handles the entire flow
3. **Supabase config:** Ensure "Secure email change" is enabled in Auth settings (sends confirmation to both old and new email)

---

## TASK 8: Preview Image Bug (First-Load Issue)

### Current State

**Post preview:** `PostCanvas` component at [src/shared/components/PostCanvas.tsx](src/shared/components/PostCanvas.tsx)

Uses **react-konva** (`Stage`, `Layer`, `Image as KonvaImage`) and **use-image** hook for image loading.

#### How images load:
1. **Background images** (AI-generated): URL like `/output/posts/{reel_id}_background.png`
2. **Brand logos**: From localStorage data URLs or `/brand-logos/{filename}` from theme API
3. Both use the `useImage` hook from `use-image` package

#### Likely First-Load Issues:

1. **`useImage` race condition**: The `use-image` hook returns `[image, status]`. On first render, `status` is `'loading'` and `image` is `undefined`. The canvas renders empty, then re-renders when the image loads. If there's no loading fallback, users see a blank canvas briefly.

2. **No image preloading**: Images aren't preloaded before mounting the Konva Stage. The Stage renders immediately with whatever images are available (possibly none).

3. **Server-side paths**: Background images come from `/output/posts/...` which is a static file serve. First load can be slow if:
   - Docker volume is slow to respond
   - No Cache-Control headers on static assets
   - Image is being generated while user is viewing

4. **PostCanvas in Scheduled.tsx** (line ~1175): Uses `bgUrl = selectedPost.reel_id ? \`/output/posts/${selectedPost.reel_id}_background.png\` : null` — if the file doesn't exist yet (job still processing), it returns 404 and the image never loads.

#### Where it's used:
- [src/pages/Scheduled.tsx](src/pages/Scheduled.tsx) — Calendar post detail modal
- [src/pages/Posts.tsx](src/pages/Posts.tsx) — Posts grid
- [src/pages/PostJobDetail.tsx](src/pages/PostJobDetail.tsx) — Post job detail page

#### Fixes Needed:
1. Add loading/fallback state in `PostCanvas` when background image hasn't loaded yet
2. Add error handling for 404 images (broken image indicator)
3. Consider adding `loading="lazy"` or intersection observer for grid views
4. Add image preloading before opening post detail modals

---

## TASK 9: Remove Observatory Button

### Current State

**Navigation:** [src/app/layout/AppLayout.tsx](src/app/layout/AppLayout.tsx)

#### Observatory NavLink (lines ~137-149):
```tsx
<NavLink
  to="/observatory"
  className={({ isActive }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-colors ${
      isActive
        ? 'bg-cyan-50 text-cyan-600'
        : 'text-gray-600 hover:bg-gray-100'
    }`
  }
  title="Observatory"
>
  <Crosshair className="w-4 h-4" />
</NavLink>
```
- It's an **icon-only** button (Crosshair icon) in the top nav bar
- Has unique cyan color scheme (different from all other nav items which use primary/indigo)
- Positioned between "AI Team" NavLink and the Settings dropdown

#### Observatory Route ([src/app/routes/index.tsx](src/app/routes/index.tsx)):
```tsx
<Route path="/observatory" element={<AuthGuard><ObservatoryPage /></AuthGuard>} />
```
- Observatory is **outside** the `AppLayout` (renders without the nav bar)
- Has its own full-screen dark theme layout
- Also redirected from `/mission-control`: `<Route path="mission-control" element={<Navigate to="/observatory" replace />} />`

#### AITeam.tsx also links to Observatory:
```tsx
<button onClick={() => navigate('/observatory')} ...>
  I want to know more
  <ChevronRight />
</button>
```
And the `MaestroOperations` component has a "Watch AI Agents Work Live" button that navigates to `/mission-control` (which redirects to `/observatory`).

#### To Remove:
1. **Remove the NavLink** from `AppLayout.tsx` (lines ~137-149)
2. **Remove the `Crosshair` import** from lucide-react imports
3. **Optionally**: Keep the route alive but remove the nav entry (users can still access via AI Team's "I want to know more" button)

---

## TASK 10: YouTube Connect Auth Error

### Current State

#### Frontend — Connect URL Generation:

**connections-api.ts** ([src/features/brands/api/connections-api.ts](src/features/brands/api/connections-api.ts), line ~65):
```ts
export function getYouTubeConnectUrl(brand: BrandName): string {
  const baseUrl = window.location.origin
  return `${baseUrl}/api/youtube/connect?brand=${brand}`
}
```

**youtube-api.ts** ([src/features/scheduling/api/youtube-api.ts](src/features/scheduling/api/youtube-api.ts), line ~31):
```ts
getConnectUrl: (brand: string) => `/api/youtube/connect?brand=${brand}`,
```

Both generate a URL that does a **full page navigation** (`window.location.href = url`).

#### The Auth Problem:

The connect URL is `/api/youtube/connect?brand={brand}` — a **GET request via browser navigation** (not an AJAX call).

The backend endpoint ([app/api/youtube/routes.py](app/api/youtube/routes.py), line ~38):
```python
@router.get("/connect")
async def youtube_connect(
    brand: str = Query(...),
    user: dict = Depends(get_current_user)  # ← requires JWT
):
```

**The issue:** `get_current_user` depends on `HTTPBearer` middleware which reads the `Authorization: Bearer {token}` header. But when the user navigates via `window.location.href`, the browser makes a **plain GET request** with **no Authorization header** — only cookies are sent.

The Supabase JWT is stored in `localStorage` (not cookies), so the browser's native navigation **cannot** send the auth token.

**Result:** The `/api/youtube/connect` endpoint returns **401 Unauthorized** because there's no Bearer token in the request.

#### How the API client normally works:
The [src/shared/api/client.ts](src/shared/api/client.ts) `get()` function adds auth headers:
```ts
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}
```
But this only works for **fetch/XHR** calls, not browser navigation.

#### Callback Endpoint:
The **callback** endpoint (`/api/youtube/callback`) does **NOT** require auth:
```python
@router.get("/callback")
async def youtube_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db)
):
```
This is correct — the callback comes from Google, not the user's browser session.

#### Fixes:

**Option A — Pass token as query param:**
1. Frontend: `getYouTubeConnectUrl` appends `&token={jwt}` to the URL
2. Backend: Read token from query param instead of header
3. ⚠️ Security concern: JWT in URL appears in browser history, server logs, referrer headers

**Option B — Two-step flow (recommended):**
1. Frontend makes an AJAX `GET /api/youtube/connect?brand={brand}` (with auth header)
2. Backend returns `{ "auth_url": "https://accounts.google.com/..." }` as JSON (instead of RedirectResponse)
3. Frontend then navigates: `window.location.href = data.auth_url`
4. This keeps the JWT out of the URL and uses proper auth

**Option C — Cookie-based session:**
1. Before navigating, make an AJAX call to create a short-lived session cookie
2. The `/connect` endpoint checks the cookie instead of Bearer token
3. More complex, but works with browser navigation

---

## Summary Table

| # | Task | Key Files | Current State | Difficulty |
|---|------|-----------|---------------|------------|
| 1 | Test Maestro button | AITeam.tsx, maestro routes | No test button exists. Run Now = full burst, admin gets 3/day | Medium |
| 2 | Custom loading for API Quotas | AITeam.tsx → QuotasTab | Generic Loader2 spinner, no themed loading | Easy |
| 3 | Disable dangerous agent buttons | AITeam.tsx → AgentCard | Force Mutate + Clone have no confirmation. Retire has confirm(). No admin-only gating. | Easy |
| 4 | /app/output investigation | main.py, Dockerfile, scheduler_logic | Output on Docker volume. No Supabase Storage. Migration spec exists but unimplemented. | Complex |
| 5 | Profile display name | Profile.tsx, AuthContext | Read-only. Name from Supabase user_metadata. No edit UI. | Easy |
| 6 | Password change email confirmation | Profile.tsx | Direct updateUser({password}) — no email confirmation | Medium |
| 7 | Email change secure flow | N/A | No email change feature exists at all | Medium |
| 8 | Preview image bug | PostCanvas.tsx, Scheduled.tsx | useImage hook may not handle loading/error states. No preloading. | Medium |
| 9 | Remove Observatory button | AppLayout.tsx | Crosshair icon NavLink in top nav, lines ~137-149 | Trivial |
| 10 | YouTube connect auth error | connections-api.ts, youtube routes.py | browser navigation has no auth header → 401 | Medium |
