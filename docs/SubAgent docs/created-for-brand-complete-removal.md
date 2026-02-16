# Complete Removal of `created_for_brand` Field

**Status:** Ready for Implementation  
**Date:** 2026-02-16  
**Scope:** Database, Backend, Frontend

---

## 🎯 Objective

**DELETE** the `created_for_brand` field from the entire codebase — database model, API schemas, frontend types, and all references.

---

## 📋 Complete File List (41 occurrences)

### Frontend (1 file)
- ✅ `src/pages/AITeam.tsx` (line 38) — TypeScript interface

### Backend (6 files)
- ✅ `app/models/agents.py` (lines 40, 93) — Database column + to_dict()
- ✅ `app/api/agents/routes.py` (lines 47, 131, 320) — API schema + usage
- ✅ `app/services/agents/diagnostics_engine.py` (line 443) — Query filter
- ✅ `app/services/agents/evolution_engine.py` (lines 794, 883) — Read/write in spawn logic
- ✅ `app/services/agents/generic_agent.py` (lines 14, 1025, 1055, 1076, 1096, 1127, 1128, 1274) — Comments, queries, writes
- ✅ `app/services/brands/manager.py` (line 420) — Query when deleting brand

### Documentation (2 files)
- ⚠️ `docs/SubAgent docs/ai-agents-brand-badges-removal.md` — Previous spec (UPDATE or DELETE)
- ⚠️ `docs/SubAgent docs/current-vs-target-architecture.md` (line 97) — Architecture docs

---

## 🔍 Detailed Analysis by File

### 1. **Database Model** — `app/models/agents.py`

**Line 40:**
```python
created_for_brand = Column(String(100), nullable=True)
```

**Line 93 (to_dict method):**
```python
"created_for_brand": self.created_for_brand,
```

**Impact:**
- Database column exists in `ai_agents` table
- SQLAlchemy auto-manages schema (no manual migration needed)
- Column will be dropped on next schema sync if removed from model
- All agents currently have this value set

**Action:**
- ❌ DELETE column definition
- ❌ DELETE from to_dict() return value

---

### 2. **API Routes** — `app/api/agents/routes.py`

**Line 47 (CreateAgentRequest schema):**
```python
created_for_brand: Optional[str] = None  # Which brand triggered this
```

**Line 131 (create_agent endpoint):**
```python
brand_id=req.created_for_brand or "manual",
```

**Line 320 (clone_agent endpoint):**
```python
brand_id=source.created_for_brand or "clone",
```

**Impact:**
- API accepts `created_for_brand` in POST /api/agents
- Used to pass brand context to `create_agent_for_brand()` helper
- Clone endpoint reads from source agent to maintain lineage

**Action:**
- ❌ DELETE field from CreateAgentRequest schema
- ✅ REPLACE with hardcoded value or remove parameter entirely in create_agent
- ✅ REPLACE with hardcoded value in clone_agent

---

### 3. **Generic Agent Service** — `app/services/agents/generic_agent.py`

**Multiple occurrences:**
- Line 14: Comment about lineage tracking
- Lines 1025, 1096: Docstring references
- Lines 1055, 1076, 1274: Setting `created_for_brand` when creating agents
- Lines 1127-1128: Query to get all brands that have agents

**Line 1127-1128 (critical query):**
```python
db.query(AIAgent.created_for_brand)
.filter(AIAgent.active == True, AIAgent.created_for_brand != None)
```

**Impact:**
- Used to track which brands already have agents
- Critical for auto-provisioning logic
- System assumes one agent per brand linkage

**Action:**
- ❌ DELETE all references to created_for_brand
- ✅ NEED REPLACEMENT LOGIC — how to track agents-per-brand without this field?
- ⚠️ **DEPENDENCY RISK:** This logic determines when to spawn new agents

**Suggested Replacement:**
- Count all active agents and compare to brand count
- Or: Add a separate `agent_brand_assignments` table if tracking is needed
- Or: Remove brand-based provisioning entirely (manual agent creation only)

---

### 4. **Evolution Engine** — `app/services/agents/evolution_engine.py`

**Line 794:**
```python
brand_id = dead_agent.created_for_brand or "unknown"
```

**Line 883:**
```python
created_for_brand=brand_id,
```

**Impact:**
- When spawning replacement agents, inherits parent's brand
- Used for lineage tracking only

**Action:**
- ❌ DELETE both lines
- ✅ REPLACE with default value ("auto" or None)

---

### 5. **Diagnostics Engine** — `app/services/agents/diagnostics_engine.py`

**Line 443:**
```python
AIAgent.created_for_brand == None,
```

**Impact:**
- Health check warns if non-builtin agents have no brand
- Part of data consistency validation

**Action:**
- ❌ DELETE this check entirely
- ✅ Remove the condition from the query

---

### 6. **Brands Manager** — `app/services/brands/manager.py`

**Line 420:**
```python
AIAgent.created_for_brand == brand_id,
```

**Impact:**
- When deleting a brand, finds all agents "born from" it
- Retires those agents automatically

**Action:**
- ❌ DELETE this auto-retirement logic
- ⚠️ **BEHAVIORAL CHANGE:** Deleting a brand will no longer retire agents

**Alternative:**
- Keep agents active when brand deleted (they're multi-brand anyway)
- Or: Track agent-brand relationships in separate table

---

### 7. **Frontend** — `src/pages/AITeam.tsx`

**Line 38 (Agent interface):**
```typescript
created_for_brand: string | null
```

**Impact:**
- TypeScript type definition for agent objects
- Field is not displayed anywhere in UI (removed in previous spec)
- No frontend code reads or uses this field

**Action:**
- ❌ DELETE from interface

---

## ⚠️ Breaking Changes & Dependencies

### 🚨 Critical Issue #1: Agent Auto-Provisioning

**Current Logic:**
```
When brand is created → Check if brand has agent (via created_for_brand) → If not, spawn agent
```

**After Removal:**
- How do we know which brands have agents?
- How do we prevent duplicate agents?

**Solutions:**
1. **Option A:** Remove auto-provisioning entirely (manual agent creation only)
2. **Option B:** Count agents vs brands (always spawn until agent_count == brand_count)
3. **Option C:** Add `agent_brand_assignments` table to track many-to-many relationships

**Recommendation:** Option A — remove auto-provisioning. Agents already work across all brands.

---

### 🚨 Critical Issue #2: Brand Deletion

**Current Behavior:**
- Delete brand → Find agents with `created_for_brand = brand_id` → Retire them

**After Removal:**
- Agents remain active when brand is deleted

**Solution:**
- Acceptable — agents are multi-brand anyway
- Or: Add explicit brand assignment tracking if needed

---

## 🗑️ Removal Order (Safest Sequence)

### Phase 1: Backend Logic (No Breaking Changes)
1. ✅ Remove brand-deletion agent retirement logic (`app/services/brands/manager.py`)
2. ✅ Remove diagnostics check (`app/services/agents/diagnostics_engine.py`)
3. ✅ Remove docstring/comment references (`app/services/agents/generic_agent.py`)

### Phase 2: Backend API (Breaking Change for API Clients)
4. ✅ Update `create_agent_for_brand()` to not set created_for_brand
5. ✅ Update evolution spawn logic to use default value
6. ✅ Remove from CreateAgentRequest schema (`app/api/agents/routes.py`)

### Phase 3: Database Model (Schema Change)
7. ✅ Remove from `to_dict()` method (`app/models/agents.py`)
8. ✅ Remove column definition from AIAgent model
9. ⚠️ **Deploy** — SQLAlchemy will drop column on next app start (if using auto-migration)

### Phase 4: Frontend
10. ✅ Remove from TypeScript interface (`src/pages/AITeam.tsx`)

### Phase 5: Documentation
11. ✅ Update or delete previous spec (`docs/SubAgent docs/ai-agents-brand-badges-removal.md`)
12. ✅ Update architecture docs (`docs/SubAgent docs/current-vs-target-architecture.md`)

---

## 🧪 Testing Checklist

- [ ] Create new agent via API → No `created_for_brand` in request/response
- [ ] Clone existing agent → Works without brand lineage
- [ ] Delete brand → Agents remain active
- [ ] Evolution spawn → New agents created successfully
- [ ] Diagnostics run → No warnings about missing brand
- [ ] Frontend loads → No TypeScript errors
- [ ] Database query → Column dropped (check with `DESCRIBE ai_agents`)

---

## 📝 Migration Notes

**No Alembic Migration Needed**

This project uses SQLAlchemy ORM with auto-schema management. When the column is removed from the model:
- Next app start will auto-detect schema drift
- Column will be dropped automatically (if using `create_all()`)
- **OR** requires manual SQL if using strict migrations:

```sql
ALTER TABLE ai_agents DROP COLUMN created_for_brand;
```

**Data Loss:** The `created_for_brand` values will be permanently deleted. If needed for historical analysis, export first:

```sql
SELECT agent_id, display_name, created_for_brand FROM ai_agents WHERE created_for_brand IS NOT NULL;
```

---

## 🎯 Implementation Summary

**Total Changes:**
- **6 backend files** (7 functional changes)
- **1 frontend file** (1 type change)
- **1 database column** (schema change)
- **2 doc files** (update/delete)

**Estimated Time:** 30-45 minutes

**Risk Level:** 🟡 Medium
- Breaking change for API clients using `created_for_brand`
- Behavioral change in brand deletion
- Auto-provisioning logic removed

**Rollback Plan:**
- Revert commits
- Restore column definition
- Re-add logic
- Run schema migration to restore column

---

## ✅ Ready for Implementation

All references identified. No hidden dependencies found. Removal is safe with documented behavioral changes.
