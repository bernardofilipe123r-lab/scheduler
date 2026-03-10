---
name: frontend-patterns
description: "React frontend architecture — hooks, routing, React Query, Supabase realtime, dynamic brands, billing gates, onboarding, feature modules. Use when: creating React components, adding pages or routes, working with React Query hooks, fixing Rules of Hooks violations, using useDynamicBrands, implementing billing gates, modifying onboarding flow, adding feature modules, Tailwind styling."
---

# Frontend Architecture & Patterns

## When to Use
- Creating or modifying React components or pages
- Adding new routes or route guards
- Working with React Query (TanStack Query) hooks
- Fixing or preventing Rules of Hooks violations
- Using `useDynamicBrands()` for brand data
- Implementing billing gates or paywall modals
- Modifying the onboarding flow
- Working with Supabase realtime subscriptions
- Adding new feature modules

## CRITICAL: Rules of Hooks

**NEVER place React hooks after an early return.** This causes React error #310 and crashes the page.

```tsx
// ❌ BAD — hook after early return
function MyPage() {
  const { data, isLoading } = useQuery(...)
  if (isLoading) return <Spinner />
  const computed = useMemo(...)     // CRASH
  return <div>{computed}</div>
}

// ✅ GOOD — all hooks before any return
function MyPage() {
  const { data, isLoading } = useQuery(...)
  const computed = useMemo(...)
  if (isLoading) return <Spinner />
  return <div>{computed}</div>
}
```

**Verify before committing:**
```bash
npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Routing | React Router v6 |
| Data Fetching | TanStack React Query |
| Auth & DB | Supabase JS Client |
| Styling | Tailwind CSS |
| Animations | Framer Motion |
| Charts | Recharts |
| Canvas | Konva (interactive canvas editing) |
| Toasts | react-hot-toast |
| Build | Vite + TypeScript |

## Provider Stack

```tsx
ReactDOM.render(
  <AppProviders onReady={dismissPreloader}>
    <QueryProvider>           // TanStack Query
      <RealtimeSync>          // Supabase realtime subscriptions
        <RouterProvider />    // React Router
      </RealtimeSync>
    </QueryProvider>
  </AppProviders>
)
```

## Routing Structure

### Route Guards
| Guard | Purpose |
|-------|---------|
| `AuthGuard` | Redirects unauthenticated users to `/login` |
| `LoginGuard` | Redirects authenticated users away from login |
| `AdminGuard` | Requires `user.isAdmin` |
| `SuperAdminGuard` | Requires `user.isSuperAdmin` |
| `OnboardingGuard` | Forces onboarding if `needsOnboarding` |

### Key Routes
| Path | Page | Guard |
|------|------|-------|
| `/` | Home (Dashboard) | Auth + Onboarding |
| `/reels` | Reels Studio (wizard landing → Create Video / Design Editor) | Auth + Onboarding |
| `/jobs`, `/job/:jobId` | History, Job Detail | Auth + Onboarding |
| `/calendar` | Calendar | Auth + Onboarding |
| `/scheduled` | Scheduled Queue | Auth + Onboarding |
| `/brands`, `/brands/new` | Brands, Create Brand | Auth + Onboarding |
| `/analytics` | Analytics | Auth + Onboarding |
| `/toby` | Toby Agent Control | Auth + Onboarding |
| `/billing` | Billing | Auth + Onboarding |
| `/logs` | System Logs | Auth + Admin |
| `/admin` | Admin Panel | Auth + SuperAdmin |
| `/login` | Login | LoginGuard (no auth) |
| `/reset-password` | Password Recovery Completion | Public (email recovery link target) |
| `/terms`, `/privacy`, `/data-deletion` | Legal pages | Public (no auth) |

### Redirects
- `/history` → `/jobs`
- `/connected` → `/brands?tab=connections`
- `/settings` → `/brands?tab=connections`

## Key Hooks

### `useDynamicBrands()` — **MOST IMPORTANT HOOK**

Source: `src/features/brands/hooks/use-dynamic-brands.ts`

```typescript
function useDynamicBrands() {
  return {
    brands: DynamicBrandInfo[]   // { id, label, color, shortName, scheduleOffset, active, has_instagram, has_facebook, ... }
    brandIds: string[]
    isLoading: boolean
    isError: boolean
  }
}
```

- **Source of truth** for all brand data in the frontend
- Color comes from `b.colors?.primary` in the database
- **ALWAYS iterate over this** — never hardcode brand arrays
- Used by: Generator, Analytics, Scheduled, Posts, Calendar, Home, and more

### `useBillingGate(brandId?)` — Access Control

Source: `src/features/billing/useBillingGate.ts`

```typescript
function useBillingGate(brandId?: string) {
  return {
    allowed: boolean
    reason: null | 'loading' | 'locked' | 'no_subscription'
    message: string | null
  }
}
```

Use this to gate any action that requires an active subscription.

### `useBillingStatus()` — Billing Data

Source: `src/features/billing/useBillingStatus.ts`

Queries `/api/billing/status` with 60s stale time. Returns full billing state including per-brand subscriptions.

### `useRealtimeSync()` — Live Updates

Source: `src/shared/hooks/use-realtime-sync.ts`

Subscribes to Supabase `postgres_changes` on:
- `generation_jobs` → invalidates `jobKeys.all`
- `scheduled_reels` → invalidates `schedulingKeys.all`

This means job status and schedule changes appear instantly in the UI without polling.

### `useOnboardingStatus()` — Onboarding Gate

Source: `src/features/onboarding/use-onboarding-status.ts`

Returns `{ needsOnboarding, isLoading }`. Drives the OnboardingGuard and post-onboarding redirect.

## API Client

Source: `src/shared/api/client.ts`

```typescript
export const apiClient = {
  get<T>(endpoint, options?): Promise<T>
  post<T>(endpoint, data?, options?): Promise<T>
  put<T>(endpoint, data?, options?): Promise<T>
  patch<T>(endpoint, data?, options?): Promise<T>
  delete<T>(endpoint, options?): Promise<T>
}
```

Features:
- Auto-attaches Supabase JWT from `supabase.auth.getSession()`
- 30s default timeout (configurable per request)
- Auto sign-out on 401 if session invalid
- Error parsing from `detail`, `message`, or `guidance` response fields

## Feature Module Structure

Each feature in `src/features/` follows this pattern:
```
src/features/{name}/
├── api/           # React Query hooks for API calls
├── hooks/         # Custom hooks
├── components/    # Feature-specific UI components
├── model/         # TypeScript types
├── constants.ts   # Feature constants
└── index.ts       # Public exports
```

Current features: `analytics`, `auth`, `billing`, `brands`, `jobs`, `onboarding`, `scheduling`, `settings`, `toby`

## React Query Patterns

### Query Keys
Each feature has a `keys` utility:
```typescript
export const brandKeys = {
  all: ['brands'] as const,
  list: () => [...brandKeys.all, 'list'] as const,
  detail: (id: string) => [...brandKeys.all, 'detail', id] as const,
}
```

### Stale Times
- Brands: 5 min
- Billing status: 60s
- Analytics: varies
- Jobs/Schedules: realtime via Supabase (no polling)

### Invalidation
After mutations, invalidate relevant query keys:
```typescript
queryClient.invalidateQueries({ queryKey: brandKeys.all })
```

## Common Mistakes to Avoid
1. **Hooks after returns:** ALL hooks MUST be called before any early return — React error #310 crashes the page
2. **Hardcoded brands:** NEVER create static brand arrays — use `useDynamicBrands()` exclusively
3. **Missing billing gate:** Any generation/scheduling action needs `useBillingGate()` check first
4. **Query key collisions:** Use the feature's key factory — don't use raw string arrays
5. **Missing auth header:** Always use `apiClient` — never raw `fetch()` — it auto-attaches JWT
6. **Supabase direct access:** Frontend uses Supabase only for auth + realtime — all data goes through API, not Supabase client for DB
