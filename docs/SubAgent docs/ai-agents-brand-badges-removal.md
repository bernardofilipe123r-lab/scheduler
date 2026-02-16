# AI Agents Brand Badges Removal - Analysis & Spec

## Issue Summary
AI agents are currently displaying brand badges (like "healthycollege", "vitalitycollege") in the UI, which incorrectly suggests that each agent is tied to a specific brand. This is misleading because:
- **AI agents are NOT attached to specific brands**
- **Each AI agent generates content for ALL brands**
- **The only rule is: NUMBER OF AGENTS = NUMBER OF BRANDS**

The badge is purely for lineage tracking (which brand triggered the agent's creation) and should not be displayed as it creates confusion about the agent's operational scope.

---

## Root Cause

### 1. Data Model
**File:** `app/models/agents.py` (Line 40)
```python
created_for_brand = Column(String(100), nullable=True)
```

The `created_for_brand` field exists in the database for **lineage tracking only** — it records which brand triggered the creation of this agent. It does NOT mean the agent is limited to that brand.

This field is correctly documented in the model docstring:
```python
"""
Dynamic AI agent — each agent works across ALL brands.

Number of agents always matches number of brands.
When a brand is created, a new agent is auto-provisioned.
"""
```

### 2. TypeScript Interface
**File:** `src/pages/AITeam.tsx` (Line 38)
```typescript
interface Agent {
  // ... other fields ...
  created_for_brand: string | null
  // ... other fields ...
}
```

The field is passed through to the frontend in the agent data structure.

### 3. API Response
**File:** `app/api/agents/routes.py` (Line 93)
The agent's `to_dict()` method includes `created_for_brand` in the response:
```python
"created_for_brand": self.created_for_brand,
```

### 4. UI Display Locations

#### Location 1: Retired Agents Section
**File:** `src/pages/AITeam.tsx` (Lines 488-489)
```tsx
{agent.created_for_brand && (
  <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">{agent.created_for_brand}</span>
)}
```

**Context:** This appears in the **retired agents list** within the `LeaderboardTab` component. When an agent is shown in the "Retired" section, the brand badge is displayed next to the agent name.

#### Location 2: Active Agent Card (Expanded View)
**File:** `src/pages/AITeam.tsx` (Line 975)
```tsx
{agent.created_for_brand && <span className="bg-gray-100 px-2 py-0.5 rounded">{agent.created_for_brand}</span>}
```

**Context:** This appears in the **expanded agent card** within the `AgentCard` component. When you click to expand an agent's details in the Leaderboard tab, the brand badge appears in the metadata row alongside temperature, risk tolerance, and other stats.

---

## Visual Context

### Where the badges appear:

1. **Leaderboard Tab → Retired Agents Section**
   ```
   Retired (2)
   ┌────────────────────────────────────────┐
   │ Marco  Gen 3  [healthycollege]  Score: 45 │
   │ Lexi   Gen 2  [vitalitycollege] Score: 38 │
   └────────────────────────────────────────┘
   ```

2. **Leaderboard Tab → Active Agent → Expanded Card**
   ```
   🥇 #1 Toby [Thriving] Gen 4 🟢 generating
      [healthycollege] 🔥 0.85 🎯 high 👁️ 2.3K ❤️ 4.2%
      
      ▼ Expanded details below...
   ```

---

## Data Flow

```
Backend DB (created_for_brand)
    ↓
API: GET /api/agents
    ↓
Frontend: Agent interface
    ↓
UI Components:
  - LeaderboardTab > Retired agents list
  - AgentCard > Expanded metadata row
```

---

## Solution: Remove Brand Badges from UI

### Changes Required

**File:** `src/pages/AITeam.tsx`

#### Change 1: Remove from Retired Agents (Lines 488-489)
**Current:**
```tsx
<div className="flex items-center gap-3">
  <span className="text-lg font-bold text-gray-400">{agent.display_name}</span>
  <span className="text-xs text-gray-400">Gen {agent.generation || 1}</span>
  {agent.created_for_brand && (
    <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">{agent.created_for_brand}</span>
  )}
</div>
```

**New:**
```tsx
<div className="flex items-center gap-3">
  <span className="text-lg font-bold text-gray-400">{agent.display_name}</span>
  <span className="text-xs text-gray-400">Gen {agent.generation || 1}</span>
</div>
```

#### Change 2: Remove from Active Agent Card (Line 975)
**Current:**
```tsx
<div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
  {agent.created_for_brand && <span className="bg-gray-100 px-2 py-0.5 rounded">{agent.created_for_brand}</span>}
  <span className="flex items-center gap-1">
    <Flame className="w-3 h-3" />
    {agent.temperature}
  </span>
  {/* ... rest of stats ... */}
</div>
```

**New:**
```tsx
<div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
  <span className="flex items-center gap-1">
    <Flame className="w-3 h-3" />
    {agent.temperature}
  </span>
  {/* ... rest of stats ... */}
</div>
```

---

## Important: Keep the Data Field

**DO NOT remove:**
- ❌ The `created_for_brand` database column
- ❌ The `created_for_brand` field from TypeScript interfaces
- ❌ The `created_for_brand` field from API responses

**Why?**
- It's used for **lineage tracking** in the backend
- It's used when **spawning new agents** to determine which brand triggered creation
- It's part of the **agent provisioning logic** that ensures `NUMBER OF AGENTS = NUMBER OF BRANDS`

**Backend files that rely on this field:**
- `app/services/brands/manager.py` (Line 420) — Agent cleanup when brand is deleted
- `app/services/agents/evolution_engine.py` (Lines 794, 883) — Spawning new agents
- `app/services/agents/generic_agent.py` (Lines 1127-1128, 1274) — Agent provisioning

---

## Testing Checklist

After making the changes:

1. ✅ **Leaderboard Tab**
   - Verify retired agents section no longer shows brand badges
   - Verify active agents expanded cards no longer show brand badges
   - Verify agent names, generations, and other stats still display correctly

2. ✅ **Agent Functionality**
   - Verify agents can still be created, mutated, cloned, and retired
   - Verify agent evolution still works
   - Verify agents still generate content for all brands

3. ✅ **Backend Integrity**
   - Verify `created_for_brand` is still populated in database for lineage tracking
   - Verify agent provisioning still maintains `NUMBER OF AGENTS = NUMBER OF BRANDS`
   - Verify brand deletion still cleans up associated agents

---

## No Other Components Affected

**Verified clean:** The following pages/components **do NOT** reference `created_for_brand`:
- ❌ `src/features/ai-team/api/use-ai-team.ts` — AgentStatus interface does not include brand
- ❌ `src/features/ai-team/components/CompetitorSection.tsx` — No agent brand display
- ❌ Overview Tab, Timeline Tab, Gene Pool Tab, Health Tab, Quotas Tab — No brand badges
- ❌ Maestro status displays — No agent brand associations shown

---

## Summary

**Files to edit:** 1 file  
**Lines to remove:** 2 conditional rendering blocks  
**Risk:** Low — purely cosmetic UI change, no backend or data changes  
**Estimated time:** 5 minutes

The brand badge removal is a simple UI cleanup that will eliminate user confusion about agent-brand relationships while preserving all backend lineage tracking functionality.
