---
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

## React Component Conventions

### Rules of Hooks — CRITICAL
**ALL hooks MUST be called BEFORE any early return (`if (...) return`).**
Violating this causes React error #310 and crashes the entire page in production.

```typescript
// CORRECT
function MyComponent({ data }) {
  const [state, setState] = useState(null);    // hooks first
  const brands = useDynamicBrands();           // hooks first

  if (!data) return <PageLoader />;            // early return AFTER hooks
  return <div>{data.name}</div>;
}

// WRONG — will crash
function MyComponent({ data }) {
  if (!data) return <PageLoader />;            // early return BEFORE hooks
  const [state, setState] = useState(null);    // hook after return = crash
}
```

**Verify before committing:** `npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'`

### Component Structure
- Pages live in `src/pages/` — thin wrappers that compose feature components
- Feature components: `src/features/{domain}/components/`
- Shared/reusable: `src/shared/components/`
- Each feature domain follows: `api/`, `hooks/`, `components/`, `types/`

### State Management
- Server state: TanStack React Query (`useQuery`, `useMutation`)
- Auth state: React Context (`useAuth()` from `src/features/auth/AuthContext.tsx`)
- No Redux/MobX — keep it simple
- Optimistic updates via `onMutate` callbacks in mutations

### Dynamic Brand Data
- **Always use `useDynamicBrands()`** for brand lists, names, colors
- Brand colors come from `b.colors?.primary` in DB — never hardcoded
- Never assume a fixed number of brands
- Iterate over dynamic arrays, never use index-based color assignments

### API Layer Pattern
```typescript
// src/features/{domain}/api/{domain}-api.ts — raw API functions
// src/features/{domain}/hooks/use-{domain}.ts — React Query wrappers
// Pages/components use hooks, never raw API functions directly
```

### Routing
- React Router v6 with lazy-loaded routes (code-splitting)
- Guard components: `AuthGuard`, `AdminGuard`, `OnboardingGuard`
- Route prefetching on hover via `PREFETCH_MAP`

### Styling
- Tailwind CSS for all styling
- `clsx()` for conditional class composition
- Custom CSS only in `src/index.css` for global styles
- Framer Motion for animations
