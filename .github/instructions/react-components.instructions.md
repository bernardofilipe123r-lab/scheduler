---
description: "Use when editing React component files (.tsx). Enforces Rules of Hooks — all hooks must be called before any early return. Covers dynamic brands requirement and billing gate pattern."
applyTo: "src/**/*.tsx"
---

# React Component Rules

- **ALL hooks MUST be called BEFORE any early return.** Placing `useState`, `useEffect`, `useMemo`, `useCallback`, `useQuery`, or any custom `use*` hook after an `if (...) return` causes **React error #310** and crashes the page.

  ```tsx
  // ✅ CORRECT: hooks first, then early returns
  function Page() {
    const { data, isLoading } = useQuery(...)
    const computed = useMemo(...)
    if (isLoading) return <Spinner />
    return <div>{computed}</div>
  }
  ```

- **Never hardcode brand arrays.** Use `useDynamicBrands()` to get brand data. Colors come from `b.colors?.primary` in the database.

- **Gate generation/scheduling actions** with `useBillingGate(brandId)` — check `allowed` before proceeding.

- **Use `apiClient`** from `src/shared/api/client.ts` — never raw `fetch()`. It auto-attaches the Supabase JWT.

- Verify after editing: `npx eslint src/ --rule 'react-hooks/rules-of-hooks: error'`
