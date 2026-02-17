# Claude Code Guidelines - Reels Automation Project

## 🚨 CRITICAL: Build & Deploy Workflow

**MANDATORY steps after ANY code changes:**

1. ✅ **Build verification**: `npm run build` (TypeScript must compile)
2. ✅ **Commit**: Descriptive message explaining WHY, not just WHAT
3. ✅ **Push**: `git push` immediately (Railway deployment depends on this)

```bash
# Correct workflow example:
npm run build
git add -A
git commit -m "fix: prevent carousel black covers by raising upload exceptions

Supabase upload failures were storing empty strings, causing black
placeholder images to be captured and uploaded as covers.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
git push
```

**Pre-commit hook installed**: Automatically runs `npm run build` before commits.

---

## 📋 Planning & Problem Solving Protocol

### Before Writing ANY Code:

1. **Draft a plan** in thinking blocks:
   - What files need to change?
   - What's the step-by-step approach?
   - What edge cases exist?
   - What could break?

2. **Critique your own plan**:
   - Ask: "What am I missing?"
   - Identify implicit assumptions
   - Consider performance/security implications

3. **Get user confirmation** for non-trivial changes:
   ```
   Here's my implementation plan:

   1. Modify job_processor.py upload_background() to raise exceptions
   2. Add error handling in schedule_routes.py cover upload
   3. Update frontend filtering in PostJobDetail.tsx and Scheduled.tsx

   This ensures upload failures fail fast rather than creating broken posts.
   Proceed with this approach?
   ```

### When Debugging:

Generate diagnostic reports:
```
Let me analyze this systematically:

1. Files modified: [list]
2. Current error: [error message + stack trace]
3. Root cause hypothesis: [reasoning]
4. Proposed fix approaches:
   a) [approach 1 - pros/cons]
   b) [approach 2 - pros/cons]
   c) [approach 3 - pros/cons]
5. Recommended approach: [choice + rationale]
```

---

## 🎯 Context Management

### DO:
- Use file references: `@src/pages/Observatory.tsx:874-942`
- Reference specific functions: `process_post_brand()` in `job_processor.py`
- Use exact code terminology: `thumbnail_path`, `maestro.current_phase`, `carousel_paths`
- Keep prompts laser-focused on one specific problem

### DON'T:
- Dump entire files into chat
- Use vague business terms instead of code identifiers
- Reference "the authentication code" when you mean `get_current_user()` in `app/api/auth.py`
- Mix multiple unrelated issues in one request

### Project Terminology (Use These Exact Terms):

**Backend (Python/FastAPI):**
- `job_processor.py` - Content generation pipeline
- `maestro` - Orchestration system for content operations
- `daily_burst` - Daily content generation cycle (12:00 PM Lisbon)
- `process_post_brand()` - Main carousel post generation method
- `upload_from_path()` / `upload_bytes()` - Supabase storage functions
- `StorageError` - Exception for Supabase upload failures
- `get_current_user()` - Authentication dependency

**Frontend (React/TypeScript):**
- `Observatory.tsx` - Real-time monitoring dashboard
- `PostJobDetail.tsx` - Job detail view with preview
- `Scheduled.tsx` - Calendar view with post previews
- `PostCanvas.tsx` - Image rendering component
- `useMaestroLive()` / `useAgents()` - React Query hooks
- `maestro.current_phase` - Backend phase state (single source of truth)
- `thumbnail_path` - Cover image URL (carousel first slide)
- `carousel_paths` - Text slide image URLs
- `slide_texts` - Slide text content

**Domain Concepts:**
- "Carousel post" not "slideshow" or "gallery"
- "Daily burst" not "scheduled generation"
- "AI agents" not "workers" or "bots"
- "Content proposals" not "drafts" or "suggestions"
- "Observatory" not "monitoring dashboard"

---

## 🏗️ Architecture Principles

### Storage Layer
```python
# ✅ CORRECT: Raise exceptions on upload failure
try:
    bg_url = upload_from_path("media", bg_remote, str(bg_path))
    print(f"☁️ Background uploaded: {bg_url}")
except StorageError as e:
    print(f"❌ Upload failed: {e}")
    os.unlink(bg_path)
    raise Exception(f"Failed to upload background: {str(e)}")

# ❌ WRONG: Silent failure with empty string
try:
    bg_url = upload_from_path("media", bg_remote, str(bg_path))
except StorageError as e:
    print(f"⚠️ Upload failed: {e}")
    bg_url = ""  # Creates broken posts!
```

**Rules:**
- All media files → Supabase storage (NEVER local filesystem)
- Upload failures → raise exceptions (NEVER store empty strings)
- Empty strings in `thumbnail_path` → black placeholder images

### State Management
```typescript
// ✅ CORRECT: Use backend as single source of truth
const activeCycle = maestro?.current_phase

// ❌ WRONG: Calculate state independently
const activeCycle = calculatePhase(logs)  // Can get out of sync!
```

**Rules:**
- Backend is source of truth for all system state
- Frontend never calculates state independently
- Always use `maestro.current_phase`, never `detectActiveCycle()`

### React Components
```typescript
// ✅ CORRECT: Function signature matches call site
function RecapMode({ activeCycle, stats, maestro }: {
  activeCycle: string | null
  stats: ReturnType<typeof calculateStats>
  maestro: MaestroLiveStatus | undefined
}) { ... }

<RecapMode activeCycle={activeCycle} stats={stats} maestro={maestro} />

// ❌ WRONG: Mismatched parameters cause white screens
function RecapMode({ activeCycle, logs, agents }: { ... }) { ... }
<RecapMode activeCycle={activeCycle} stats={stats} maestro={maestro} />
```

---

## 💻 Code Style Guidelines

### Python (FastAPI Backend)

```python
# Error Handling
# ✅ Use specific exceptions
raise HTTPException(status_code=500, detail=f"Failed to upload: {str(e)}")
raise Exception(f"Background upload failed: {str(e)}")

# ❌ Don't use generic exceptions without context
raise Exception("Upload failed")

# Logging
# ✅ Use emoji prefixes for visual scanning
print(f"☁️ Uploaded to Supabase: {url}")
print(f"❌ Upload failed: {e}")
print(f"✅ Job completed: {job_id}")

# ❌ Don't use plain text
print("Upload successful")

# File Operations
# ✅ Always clean up temp files on error
try:
    result = process_file(path)
except Exception as e:
    os.unlink(path)  # Clean up before re-raising
    raise

# Type Hints
# ✅ Always include type hints
def upload_from_path(bucket: str, remote: str, local: str) -> str:
    pass

# ❌ Don't skip type hints
def upload_from_path(bucket, remote, local):
    pass
```

### TypeScript (React Frontend)

```typescript
// Strict TypeScript
// ✅ Remove unused parameters entirely
function RecapMode({ activeCycle, stats }: {
  activeCycle: string | null
  stats: MissionStats
}) { ... }

// ❌ Don't use underscore prefix (causes build failure)
function RecapMode({ activeCycle, stats, _unused }: { ... }) { ... }

// Null Checks
// ✅ Filter empty strings before rendering
const bgUrl = (raw && raw.trim() !== '') ? raw : null
<PostCanvas backgroundUrl={bgUrl} />

// ❌ Don't pass empty strings to components
<PostCanvas backgroundUrl={thumbnail_path} />  // Might be ""

// React Query
// ✅ Use proper polling for real-time data
const { data: maestro } = useMaestroLive()  // Polls every 2s

// Component Props
// ✅ Match signatures exactly
interface RecapModeProps {
  activeCycle: string | null
  stats: MissionStats
}
function RecapMode({ activeCycle, stats }: RecapModeProps) { ... }
```

### General Standards

- **Functions**: Keep under 50 lines; extract helpers if needed
- **Comments**: Only add when logic isn't self-evident (avoid obvious comments)
- **Naming**: Use descriptive names (`process_post_brand` not `ppb`)
- **Error messages**: Include context (what failed, why, what was attempted)

---

## 🧪 Testing Strategy

### Manual Testing Checklist

After changes to content generation:
- [ ] Trigger test burst via Observatory
- [ ] Verify real-time updates in `/observatory` live mode
- [ ] Check carousel preview in `/calendar` shows cover image
- [ ] Verify slide images render correctly in PostJobDetail
- [ ] Check browser DevTools Network tab for API errors

After changes to Observatory:
- [ ] Test all 5 modes: overview, countdown, live, recap, history
- [ ] Verify phase display matches backend `current_phase`
- [ ] Check agent pods render during daily burst
- [ ] Verify activity log shows recent entries
- [ ] Test mode transitions (overview → countdown → live → recap)

### Test Writing Protocol

When adding new features:
1. **You specify test cases**:
   ```
   Write tests for upload_from_path():
   - Happy path: successful upload returns URL
   - Network error: raises StorageError
   - Invalid path: raises FileNotFoundError
   - Empty file: raises ValueError
   - Large file (>10MB): handles correctly
   ```

2. **AI writes the test code**
3. **You review the test** (does it test what you specified?)
4. **AI makes it pass**

---

## 🔍 Common Issues & Fixes

### Issue: TypeScript Build Fails with TS6133 (Unused Parameter)

**Symptoms**: `error TS6133: 'param' is declared but its value is never read`

**Fix**: Remove the parameter entirely from both function signature and call sites

```typescript
// Before (broken)
function RecapMode({ activeCycle, logs, agents }: {
  activeCycle: string | null
  logs: any[]  // ❌ Never used
  agents: Agent[]  // ❌ Never used
}) { ... }

// After (fixed)
function RecapMode({ activeCycle }: {
  activeCycle: string | null
}) { ... }
```

### Issue: Black Carousel Cover Images

**Symptoms**: First slide shows black in `/calendar`, subsequent slides correct

**Root cause**: Supabase upload failed, stored empty string, black placeholder captured

**Fix**: Raise exceptions on upload failures (never store empty strings)

**Files**:
- `app/services/content/job_processor.py:425-444`
- `app/api/content/schedule_routes.py:768-778`

### Issue: Observatory Shows Wrong Phase

**Symptoms**: Display shows "HEALING" when actually generating content

**Root cause**: Frontend calculating phase from logs instead of using backend state

**Fix**: Use `maestro.current_phase` directly (single source of truth)

**File**: `src/pages/Observatory.tsx:452`

### Issue: White Screen on "Watch Live"

**Symptoms**: Full white page after clicking Observatory "Watch Live" button

**Root cause**: React component prop destructuring mismatch

**Fix**: Ensure function parameters match exactly what's passed in JSX

**File**: `src/pages/Observatory.tsx` (LiveMode, RecapMode, HistoryMode)

---

## 🔐 Security & Performance

### Security Review Checklist
- [ ] No hardcoded secrets or API keys
- [ ] Input validation on all user-provided data
- [ ] SQL injection prevention (use parameterized queries)
- [ ] Authentication required for sensitive endpoints
- [ ] File upload size limits enforced

### Performance Review Checklist
- [ ] No N+1 query patterns
- [ ] Database indexes on frequently queried fields
- [ ] Image optimization (compression, lazy loading)
- [ ] React Query caching configured appropriately
- [ ] Unnecessary re-renders avoided (useMemo, useCallback)

---

## 📁 Key Files Reference

### Backend (Python/FastAPI)
- `app/main.py` - FastAPI application entry point
- `app/api/maestro/routes.py` - Maestro orchestration endpoints
- `app/api/content/schedule_routes.py` - Scheduling & preview endpoints
- `app/services/content/job_processor.py` - Content generation pipeline
- `app/api/system/logs_routes.py` - Logging endpoints (NOT `/api/system/logs`)
- `app/api/auth.py` - Authentication (get_current_user dependency)

### Frontend (React/TypeScript)
- `src/pages/Observatory.tsx` - Real-time monitoring dashboard (5 modes)
- `src/pages/PostJobDetail.tsx` - Job detail with preview
- `src/pages/Scheduled.tsx` - Calendar view with previews
- `src/shared/components/PostCanvas.tsx` - Image rendering
- `src/features/mission-control/api/useMaestroLive.ts` - Maestro polling
- `src/features/mission-control/api/useLiveLogs.ts` - Logs polling (uses `/api/logs`)
- `src/features/mission-control/api/useAgents.ts` - Agents polling

---

## 🎭 AI Pair Programming Expectations

### You (Claude) Are Expected To:
- ✅ Draft plans before coding
- ✅ Think step-by-step out loud
- ✅ Use exact project terminology
- ✅ Review your own code for issues
- ✅ Run `npm run build` before committing
- ✅ Commit and push after every change
- ✅ Explain reasoning for architectural decisions

### You (Claude) Should NOT:
- ❌ Make architecture decisions without user approval
- ❌ Assume implicit requirements
- ❌ Trust your output without verification
- ❌ Skip the build step
- ❌ Batch multiple commits
- ❌ Use generic error messages
- ❌ Dump entire files into responses

### Treat Every Output Like a PR Review:
1. Security: Check for vulnerabilities
2. Performance: Look for inefficiencies
3. Correctness: Verify logic and edge cases
4. Style: Match project conventions
5. Tests: Ensure adequate coverage

---

## 🚀 Workflow Summary

```
┌─────────────────────────────────────────────────────┐
│ 1. User Request                                      │
│    "Fix carousel black covers"                      │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│ 2. Draft Plan (Think Out Loud)                      │
│    - Root cause analysis                            │
│    - Files to modify                                │
│    - Step-by-step approach                          │
│    - Edge cases                                     │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│ 3. Get User Approval                                │
│    Present plan, await confirmation                 │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│ 4. Implement Changes                                │
│    - Use file references                            │
│    - Follow style guidelines                        │
│    - Handle errors properly                         │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│ 5. Verify Build                                     │
│    npm run build                                    │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│ 6. Commit & Push                                    │
│    git add -A                                       │
│    git commit -m "fix: descriptive message"         │
│    git push                                         │
└─────────────────────────────────────────────────────┘
```

---

## 📝 Example of Excellent Interaction

**User**: "Observatory always shows static data (00:00:07, 0 entries), even during AI generation."

**Claude Response**:
```
Let me investigate this systematically:

1. **Root cause hypothesis**: Observatory is calling wrong API endpoints

2. **Investigation plan**:
   - Check useLiveLogs.ts for endpoint URL
   - Verify backend logs_routes.py endpoint path
   - Test endpoint manually

3. **Files to examine**:
   - @src/features/mission-control/api/useLiveLogs.ts
   - @app/api/system/logs_routes.py

[After investigation...]

**Root cause found**: Frontend calls `/api/system/logs` but backend
defines `/api/logs` (no `/system`).

**Fix**: Change line 22 in useLiveLogs.ts:
- OLD: `/api/system/logs?since_minutes=60...`
- NEW: `/api/logs?since_minutes=60...`

**Verification plan**:
1. Build succeeds (`npm run build`)
2. Start app (`python -m uvicorn app.main:app --reload`)
3. Navigate to `/observatory`
4. Check Network tab for 200 OK on `/api/logs`
5. Verify real-time activity appears

Proceed with this fix?
```

---

**Last Updated**: 2025-02-17
**Project**: Instagram Content Automation Platform
**Stack**: FastAPI (Python) + React (TypeScript) + Supabase
**Deployment**: Railway
