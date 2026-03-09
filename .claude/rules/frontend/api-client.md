---
paths:
  - "src/shared/api/**/*.ts"
  - "src/features/*/api/**/*.ts"
---

## API Client & Data Fetching Conventions

### HTTP Client (`src/shared/api/client.ts`)
- Auto-attaches Supabase JWT via `authHeaders()`
- Methods: `get<T>`, `post<T>`, `put<T>`, `del<T>`, `patch<T>`
- 30s default timeout, customizable per request
- Auto-signout on 401 responses
- FormData support (auto-strips Content-Type header)
- Base URL: `import.meta.env.VITE_API_URL || ''`

### TanStack React Query Patterns
- Query client configured in `src/app/providers/QueryProvider.tsx`
- Default `staleTime: 60s`, `retry: 1`
- Use consistent query key factories per domain:
  ```typescript
  export const jobKeys = {
    all: ['jobs'] as const,
    lists: () => [...jobKeys.all, 'list'] as const,
    detail: (id: string) => [...jobKeys.all, 'detail', id] as const,
  };
  ```

### Real-Time Updates
- Supabase Realtime subscriptions in `src/shared/hooks/use-realtime-sync.ts`
- Subscribes to `generation_jobs` and `scheduled_reels` table changes
- Invalidates React Query cache on DB changes → instant UI updates

### Supabase Client (`src/shared/api/supabase.ts`)
- Singleton client using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Used for auth (login, register, session management) and real-time subscriptions
- Backend API calls go through the HTTP client, NOT Supabase directly

### Environment Variables (Frontend)
```
VITE_API_URL — Backend API base URL
VITE_SUPABASE_URL — Supabase project URL
VITE_SUPABASE_ANON_KEY — Supabase public/anon key
VITE_APP_URL — Frontend URL (for OAuth redirects)
```
