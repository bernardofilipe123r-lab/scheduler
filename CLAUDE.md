# Project Guidelines for Claude Code

## CRITICAL: Build & Deploy Workflow

**ALWAYS follow these steps after making ANY code changes:**

1. **Build first**: Run `npm run build` to verify TypeScript compilation succeeds
2. **Commit changes**: Use descriptive commit messages with `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`
3. **Push to remote**: Always run `git push` after committing

**Never skip these steps!** Railway deployment depends on a successful build.

## TypeScript Standards

- This project uses strict TypeScript configuration
- Unused parameters cause build failures (TS6133)
- Remove unused parameters entirely rather than prefixing with underscore
- Always verify `npm run build` passes before committing

## Architecture Notes

### Storage
- All media storage uses Supabase (not local filesystem)
- Upload failures must raise exceptions (never silently store empty strings)
- See `app/services/content/job_processor.py` and `app/api/content/schedule_routes.py`

### State Management
- Backend is single source of truth for system state
- Frontend should never calculate state independently
- Example: Use `maestro.current_phase` directly, never duplicate phase calculation logic

### Carousel Posts
- Structure: `thumbnail_path` (cover), `carousel_paths` (slides), `slide_texts` (content)
- Always filter empty/null thumbnail URLs before rendering: `(url && url.trim() !== '') ? url : null`

## Common Issues

### Black carousel cover images
**Root cause**: Supabase upload failure stored empty string instead of raising exception
**Fix**: Always raise exceptions on upload failures (see job_processor.py lines 425-444)

### Observatory showing wrong phase
**Root cause**: Frontend calculating phase independently from backend
**Fix**: Use `maestro.current_phase` as single source of truth

### White screen crashes
**Root cause**: React component prop destructuring mismatches
**Fix**: Ensure function signatures match call sites exactly

## Git Workflow

- Main branch: `main`
- Always pull before starting work
- Commit messages should be descriptive and explain WHY, not just WHAT
- Include co-authorship attribution in all commits
- Push immediately after committing (don't batch commits)

## Testing

- Run manual tests on `/observatory` after changes to mission control
- Verify real-time updates during AI generation
- Check browser DevTools Network tab for API errors
- Test carousel preview rendering in `/calendar`
