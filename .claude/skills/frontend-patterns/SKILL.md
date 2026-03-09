---
name: frontend-patterns
description: Use when creating React components, adding pages or routes, working with React Query hooks, fixing Rules of Hooks violations, using useDynamicBrands, implementing billing gates, modifying onboarding flow, or adding feature modules.
---

# Frontend Architecture & Patterns

## Tech Stack
React 18 + TypeScript, React Router v6, TanStack React Query, Supabase JS Client, Tailwind CSS, Framer Motion, Vite

## CRITICAL: Rules of Hooks
ALL hooks MUST be called BEFORE any early return. Violation = React error #310 = page crash.
Verify: `npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'`

## Key Hooks

### `useDynamicBrands()` — Brand data source of truth
Returns `{ brands: DynamicBrandInfo[], brandIds, isLoading, isError }`. Color from `b.colors?.primary`. NEVER hardcode brand arrays.

### `useBillingGate(brandId?)` — Access control
Returns `{ allowed, reason, message }`. Gate any generation/scheduling action.

### `useRealtimeSync()` — Live updates
Supabase realtime on `generation_jobs` + `scheduled_reels` → auto-invalidates React Query cache.

## Route Guards
| Guard | Purpose |
|-------|---------|
| `AuthGuard` | Redirect unauthenticated → `/login` |
| `OnboardingGuard` | Force onboarding if `needsOnboarding` |
| `AdminGuard` / `SuperAdminGuard` | Role-based access |

## Key Routes
`/` Dashboard, `/reels` Studio, `/jobs` History, `/calendar`, `/scheduled`, `/brands`, `/analytics`, `/toby` Agent, `/billing`, `/admin` (SuperAdmin)

## API Client (`src/shared/api/client.ts`)
Auto-attaches Supabase JWT, 30s timeout, auto sign-out on 401. Always use `apiClient` — never raw `fetch()`.

## Feature Module Structure
```
src/features/{name}/
├── api/         # React Query hooks
├── hooks/       # Custom hooks
├── components/  # UI components
├── model/       # Types
└── index.ts     # Exports
```

## React Query Patterns
- Query key factories per domain: `brandKeys.all`, `brandKeys.detail(id)`
- Stale times: Brands 5min, Billing 60s, Jobs/Schedules realtime
- Invalidate after mutations: `queryClient.invalidateQueries({ queryKey: brandKeys.all })`

## Common Mistakes
1. Hooks after returns → crash
2. Hardcoded brands → use `useDynamicBrands()` only
3. Missing billing gate on generation actions
4. Raw `fetch()` instead of `apiClient`
5. Supabase for data queries — use API client, Supabase only for auth + realtime
