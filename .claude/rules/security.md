## Security Rules

### Authentication
- All API routes (except health, legal, OAuth callbacks) require auth via `Depends(get_current_user)`
- Auth validates Supabase JWT from `Authorization: Bearer <token>` header
- Admin routes additionally require `Depends(get_admin_user)` or `Depends(get_super_admin_user)`

### Data Scoping
- ALL database queries MUST be scoped by `user_id` — never return unscoped data
- Brand operations must verify the brand belongs to the requesting user
- Never expose internal IDs, database errors, or stack traces in API responses

### Secrets Management
- Environment variables for all secrets — never hardcode API keys, tokens, or credentials
- Use Railway CLI to set production env vars: `railway variables set KEY=value`
- `.env` files are gitignored — never commit them
- OAuth tokens stored encrypted in DB, refreshed via token services

### OWASP Top 10 Awareness
- SQL injection: Use SQLAlchemy parameterized queries — never f-string SQL
- XSS: React auto-escapes JSX — avoid `dangerouslySetInnerHTML`
- CSRF: Supabase JWT in Authorization header (not cookies) mitigates CSRF
- Input validation: Pydantic models for all request bodies
- File uploads: Validate file types and sizes before processing

### Legal Compliance
When adding/removing a social platform, update all three legal pages:
- `src/pages/Terms.tsx` — service description, third-party services
- `src/pages/PrivacyPolicy.tsx` — data collection, data sharing
- `src/pages/DataDeletion.tsx` — what gets deleted, revoke access instructions
