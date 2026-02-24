# Registration & Onboarding — Analysis & Implementation Plan

## 1. Current State

### What exists today

| Area | Status | Details |
|------|--------|---------|
| Login | ✅ Done | `src/pages/Login.tsx` — email + password, Supabase `signInWithPassword()` |
| Registration | ❌ None | Zero frontend code. Accounts must be manually created in Supabase |
| Email verification | ❌ None | Not implemented |
| Onboarding flow | ❌ None | New users land directly on the full app with no guidance |
| Backend user profile | ⚠️ Partial | `POST /users` exists and is idempotent, but never called from the frontend |

### Auth stack

- **Supabase Auth** — JWT-based, session stored in localStorage by Supabase JS SDK
- `src/features/auth/AuthContext.tsx` — React context managing `user`, `isAuthenticated`, `isLoading`
- `src/features/auth/api/auth-api.ts` — thin wrapper exposing `loginApi()`, `logoutApi()`, `getSessionToken()`
- `src/app/routes/index.tsx` — guards: `AuthGuard` (requires auth), `LoginGuard` (redirects if already authed)

### Key existing components to reuse

| Component / Hook | File | Used in onboarding |
|-----------------|------|--------------------|
| Brand creation wizard | `src/features/brands/components/CreateBrandModal.tsx` | Step 1 |
| `useCreateBrand()` | `src/features/brands/api/use-brands.ts` | Step 1 |
| `NicheConfigForm` | `src/features/brands/components/NicheConfigForm.tsx` | Step 2 |
| `useNicheConfig()` / `useUpdateNicheConfig()` | `src/features/brands/api/use-niche-config.ts` | Step 2 |
| `getConfigStrength()` | `src/features/brands/types/niche-config.ts` | Unlock gate |
| `ConfigStrengthMeter` | `src/features/brands/components/ConfigStrengthMeter.tsx` | Step 2 progress |
| `useBrands()` | `src/features/brands/api/use-brands.ts` | Onboarding status |

### Content DNA strength scoring (already exists)

`getConfigStrength(config)` in `src/features/brands/types/niche-config.ts` returns `'basic' | 'good' | 'excellent'`.

```
Score /12:
  - niche_name filled             → +1
  - content_brief > 50 chars     → +1
  - content_brief > 200 chars    → +1
  - reel_examples >= 3           → +1
  - reel_examples >= 10          → +1
  - post_examples >= 1           → +1
  - cta_options filled           → +1
  - carousel_cta_options filled  → +1   (default 3 are pre-filled)
  - yt_title_examples >= 2       → +1
  - citation_style != 'none'     → +1
  - parent_brand_name filled     → +1

< 40%  → 'basic'   (unlock blocked)
40–74% → 'good'    (unlock allowed ✅)
≥ 75%  → 'excellent'
```

Reaching `'good'` requires a **minimum of ~5 points** (niche name + content brief + 3 reel examples + brand name = already 5, plus carousel_cta_options are pre-filled = 6). Achievable in ~5 minutes of effort.

---

## 2. Desired Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  /login  ──toggle──►  Register form                             │
│                            │                                    │
│                            ▼  supabase.auth.signUp()            │
│                     "Check your inbox"                          │
│                            │                                    │
│                            ▼  user clicks email link            │
│                     Supabase processes URL token                │
│                     onAuthStateChange → isAuthenticated=true    │
│                            │                                    │
│                            ▼                                    │
│             POST /users (create backend profile)                │
│                            │                                    │
│                            ▼                                    │
│              /onboarding  (fullscreen wizard)                   │
│                     Step 1: Create first brand                  │
│                            │  brand created                     │
│                            ▼                                    │
│                     Step 2: Content DNA                         │
│                     (strength meter must reach "good")          │
│                            │  strength ≥ 40%                   │
│                            ▼                                    │
│                     "You're all set!" (1.5s)                    │
│                            │                                    │
│                            ▼                                    │
│                     Full app unlocked  /                        │
└─────────────────────────────────────────────────────────────────┘
```

### Edge cases

| Scenario | Behavior |
|----------|----------|
| User leaves after brand creation, returns next day | `/onboarding` auto-starts at Step 2 |
| User leaves during DNA, returns | `/onboarding` at Step 2 with previous form data |
| Authenticated user navigates to any protected route mid-onboarding | `OnboardingGuard` redirects back to `/onboarding` |
| Authenticated user with complete setup visits `/onboarding` | Redirected to `/` |
| Existing users (pre-created) on login | `needsOnboarding` = false → go straight to `/` |

---

## 3. Files to Create

### `src/features/onboarding/use-onboarding-status.ts`

New React Query hook that determines if the user needs to complete onboarding.

```ts
import { useAuth } from '@/features/auth'
import { useBrands } from '@/features/brands/api/use-brands'
import { useNicheConfig } from '@/features/brands/api/use-niche-config'
import { getConfigStrength } from '@/features/brands/types/niche-config'

export function useOnboardingStatus() {
  const { isAuthenticated } = useAuth()
  const { data: brands, isLoading: brandsLoading } = useBrands()
  const { data: config, isLoading: configLoading } = useNicheConfig()

  const hasBrand = (brands?.length ?? 0) > 0
  const strength = config ? getConfigStrength(config) : 'basic'
  const hasDNA = strength === 'good' || strength === 'excellent'

  const needsOnboarding = isAuthenticated && (!hasBrand || !hasDNA)
  const onboardingStep: 1 | 2 = !hasBrand ? 1 : 2

  return {
    needsOnboarding,
    onboardingStep,   // used to resume mid-flow
    hasBrand,
    hasDNA,
    isLoading: brandsLoading || configLoading,
  }
}
```

**Notes:**
- Both `useBrands()` and `useNicheConfig()` are already used elsewhere — no new API calls, just reusing existing hooks
- Only runs when `isAuthenticated` — hooks are enabled by default but data is `undefined` until auth resolves, which is fine since `needsOnboarding` defaults safe

---

### `src/pages/Onboarding.tsx`

Fullscreen wizard — **no sidebar**. Uses existing brand creation hooks + `NicheConfigForm`.

**Layout structure:**

```
┌──────────────────────────────────────────────────────┐
│  [va-logo]  "Let's get you set up"     [Step 1 of 2] │  ← sticky header
│  ●─────────────────○                                  │  ← progress dots
├──────────────────────────────────────────────────────┤
│                                                       │
│  Step 1: Brand Creation                               │
│  ─ Brand name, brand ID (auto-generated from name)   │
│  ─ Short name (3 letters, auto-suggested)            │
│  ─ Color picker (presets + custom)                   │
│  ─ Logo upload (optional)                            │
│                                                       │
│  Step 2: Content DNA                                  │
│  ─ Full NicheConfigForm, scrollable                  │
│  ─ ConfigStrengthMeter sticky at top                 │
│  ─ "Complete Setup" button enabled only at 'good'+   │
│                                                       │
├──────────────────────────────────────────────────────┤
│  [← Back]                         [Continue →]       │  ← sticky footer
└──────────────────────────────────────────────────────┘
```

**Key decisions:**
- Step 1 skips social platform credentials (step 3 of the existing wizard) — user connects later under Brands → Connections
- Step 2 re-uses `NicheConfigForm` directly — no duplication
- "Complete Setup" button disabled + tooltip when strength is `'basic'`
- On completion: `useQueryClient().invalidateQueries()` → `needsOnboarding` becomes false → `OnboardingPageGuard` auto-redirects to `/`

---

## 4. Files to Modify

### `src/features/auth/api/auth-api.ts`

Add `registerApi()`:

```ts
export async function registerApi(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },                   // stored in user_metadata
      emailRedirectTo: window.location.origin,  // where email link points
    },
  })
  if (error) throw new Error(error.message)
  // data.session is null if email confirmation is required (Supabase setting)
  return data
}
```

---

### `src/features/auth/AuthContext.tsx`

**Two changes:**

**a) Add `register()` to context:**
```ts
interface AuthContextType {
  // ... existing ...
  register: (email: string, password: string, name: string) => Promise<void>
}
```

**b) Sync backend UserProfile on every `SIGNED_IN` event:**

In the `onAuthStateChange` callback, fire-and-forget `POST /users`. This is idempotent — safe to call on every login too.

```ts
const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  setUser(mapUser(session?.user ?? null))
  setIsLoading(false)

  if (event === 'SIGNED_IN' && session?.user) {
    const u = session.user
    apiClient.post('/users', {
      user_id: u.id,
      email: u.email ?? '',
      user_name: u.user_metadata?.name ?? '',
    }).catch(() => {})  // don't block auth on backend failure
  }
})
```

---

### `src/pages/Login.tsx`

Add `mode: 'login' | 'register' | 'verify-email'` state. The **left panel stays identical** across all modes — only the right panel changes.

**Register mode (right panel):**
- Fields: Full Name, Email, Password, Confirm Password
- Validation: passwords match, all fields filled
- Calls `register(name, email, password)` from `useAuth()`
- On success → `setMode('verify-email')`
- Error examples: "Email already in use", "Password must be at least 6 characters"

**Verify-email mode (right panel):**
```
  ✉️  Check your inbox

  We sent a verification link to:
  ┌──────────────────────┐
  │  user@example.com    │
  └──────────────────────┘

  Click the link in the email to activate
  your account and start setting up.

  ← Back to sign in
```
- No action needed — once user clicks the email link, Supabase processes the URL token, `onAuthStateChange` fires, and routing takes over

**Toggle links:**
- Login → Register: small link at bottom "Don't have an account? Create one →"
- Register → Login: "Already have an account? Sign in"

---

### `src/app/routes/index.tsx`

**Add `OnboardingGuard`** — wraps all protected app child routes:

```tsx
function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { needsOnboarding, isLoading } = useOnboardingStatus()
  if (isLoading) return <AppLoader />
  if (needsOnboarding) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}
```

**Add `OnboardingPageGuard`** — protects the `/onboarding` route itself:

```tsx
function OnboardingPageGuard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { needsOnboarding, isLoading: onboardingLoading } = useOnboardingStatus()

  if (authLoading || onboardingLoading) return <AppLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (!needsOnboarding) return <Navigate to="/" replace />
  return <OnboardingPage />
}
```

**Updated route tree:**

```tsx
<Routes>
  <Route path="/login"      element={<LoginGuard />} />
  <Route path="/onboarding" element={<OnboardingPageGuard />} />

  <Route path="/" element={
    <AuthGuard>
      <OnboardingGuard>
        <AppLayout />
      </OnboardingGuard>
    </AuthGuard>
  }>
    <Route index element={<HomePage />} />
    {/* all existing child routes — no changes */}
  </Route>
</Routes>
```

---

## 5. Backend Considerations

### `POST /users` — already exists, no changes needed

```
POST /users
{
  "user_id": "<supabase UUID>",
  "user_name": "Jane Doe",
  "email": "jane@example.com"
}
```

Called from `AuthContext` on every `SIGNED_IN` event (idempotent — creates or updates).

### Supabase Dashboard settings to verify/enable

| Setting | Location | Value |
|---------|----------|-------|
| Email confirmations | Auth → Providers → Email | **Enabled** |
| `Site URL` | Auth → URL Configuration | Must match deployed app URL (or `localhost:5173` for dev) |
| `Redirect URLs` | Auth → URL Configuration | Add `http://localhost:5173`, production URL |

> Without email confirmations enabled in Supabase, users are signed in immediately after `signUp()` (no verification step). The frontend handles both cases — if `data.session` is null after `signUp()`, it shows the verify-email screen. If `data.session` is not null (confirmations disabled), `onAuthStateChange` fires immediately and onboarding starts right away.

---

## 6. UX Details & Decisions

### Onboarding header copy

- Step 1: "Create your first brand" / subtext: "Give your brand an identity. You can always update it later."
- Step 2: "Define your Content DNA" / subtext: "Tell the AI what you're about. The more detail, the better your content."

### Progress indicator

Simple two-dot indicator: `● ─── ○` (step 1) → `● ─── ●` (step 2 complete).

### What's skipped in Step 1 (platform credentials)

The existing `CreateBrandModal` has 3 steps: Identity → Colors → Connections.
The onboarding wizard includes only Identity + Colors. Connections (Instagram/Facebook/YouTube tokens) are skipped with a note: *"You can connect your social accounts later under Brands → Connections."*

### Why NicheConfig is per-user, not per-brand

The backend `niche_config` table has a unique constraint on `user_id`. One config per user, shared across all their brands. This simplifies onboarding — user fills it once.

### "Complete Setup" button behavior

| Strength | Button state |
|----------|-------------|
| `basic` | Disabled, tooltip: "Keep adding details to reach 'Good' strength" |
| `good` | Enabled — "Complete Setup ✓" |
| `excellent` | Enabled — "Complete Setup ✓" |

---

## 7. Implementation Order

```
1. registerApi()               → src/features/auth/api/auth-api.ts
2. AuthContext register()      → src/features/auth/AuthContext.tsx
   + SIGNED_IN → POST /users
3. Login.tsx modes             → src/pages/Login.tsx
4. useOnboardingStatus         → src/features/onboarding/use-onboarding-status.ts
5. Route guards                → src/app/routes/index.tsx
6. Onboarding.tsx page         → src/pages/Onboarding.tsx
7. npm run build (verify TS)
8. Commit + push
```

---

## 8. Verification Checklist

- [ ] New user registers → sees "check your inbox" screen
- [ ] Clicking email link → redirected to `/onboarding`, Step 1
- [ ] Step 1: fill brand name/colors → "Continue" → Step 2
- [ ] Step 2: "Complete Setup" is disabled while strength is `basic`
- [ ] Step 2: fills niche name + content brief + 3 reel examples + brand name + carousel CTAs (pre-filled) → strength reaches `good` → button enables
- [ ] "Complete Setup" → brief success screen → redirected to `/`
- [ ] All sidebar routes work normally after onboarding
- [ ] User logs out and back in → goes straight to `/` (onboarding not re-triggered)
- [ ] User with only a brand (no DNA) logs in → lands at `/onboarding` Step 2
- [ ] Existing manually-created Supabase users → not sent to onboarding (they have brands + DNA already)
- [ ] `npm run build` passes with zero TypeScript errors
