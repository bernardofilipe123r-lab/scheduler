# deAPI Balance Update Specification

## Research Summary

The deAPI balance fetching functionality is currently implemented but needs an update to handle the new API response format.

---

## Current Implementation

### Location
**File**: [app/services/api_quota_manager.py](../../app/services/api_quota_manager.py)  
**Method**: `fetch_deapi_balance()` (lines 175-209)  
**Called from**: [app/api/ai_team/routes.py](../../app/api/ai_team/routes.py) (line 146) in the `/api/ai-team/quotas` endpoint

### Current Code Structure

```python
async def fetch_deapi_balance(self) -> dict:
    """Fetch deAPI account balance. Endpoint: GET https://api.deapi.ai/api/v1/client/balance"""
    import os
    import httpx

    api_key = os.getenv('DEAPI_API_KEY')
    if not api_key:
        logger.warning('DEAPI_API_KEY not set — cannot fetch deAPI balance')
        return {'error': 'No DEAPI_API_KEY configured'}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                'https://api.deapi.ai/api/v1/client/balance',
                headers={'Authorization': f'Bearer {api_key}'},
            )
            body = resp.text
            if resp.status_code == 200:
                data = resp.json() if body else {}
                balance = data.get('balance', 0)  # ← WRONG: expects balance at root
                account_type = data.get('account_type', 'basic')
                rpm_limit = 300 if account_type == 'premium' else 3
                rpd_limit = None if account_type == 'premium' else 100
                return {
                    'balance': balance,
                    'account_type': account_type,
                    'rpm_limit': rpm_limit,
                    'rpd_limit': rpd_limit,
                    'currency': data.get('currency', 'USD'),
                }
            logger.error(f'deAPI balance fetch failed: HTTP {resp.status_code} — {body[:200]}')
            return {'error': f'HTTP {resp.status_code}'}
    except Exception as e:
        logger.error(f'deAPI balance fetch exception: {e}')
        return {'error': str(e)[:200]}
```

### API Token/Credentials Storage

- **Environment Variable**: `DEAPI_API_KEY`
- **Location**: Set in `.env` file or Railway/deployment environment variables
- **Example file**: `.env.example` (line 7)
- **Also used by**: `AIBackgroundGenerator` in `app/services/media/ai_background.py` (lines 40-44)
- **Settings API**: `app/api/system/settings_routes.py` exposes this as `deapi_api_key` (line 33)

### Current Request Format

```http
GET https://api.deapi.ai/api/v1/client/balance
Authorization: Bearer <DEAPI_API_KEY>
```

### Current Response Parsing

The code currently expects the balance directly at the root level:
```python
balance = data.get('balance', 0)  # Expects: {"balance": 7.924416}
```

---

## What Needs to Change

### ✅ Endpoint (Already Correct)
- **Current**: `https://api.deapi.ai/api/v1/client/balance`
- **New**: `https://api.deapi.ai/api/v1/client/balance`
- **Status**: ✅ No change needed

### ❌ Response Format Parsing
- **Current expectation**: `{"balance": 7.924416, "account_type": "...", ...}`
- **New format**: `{"data": {"balance": 7.924416}}`
- **Issue**: Balance is now nested under `data` key

### 🔸 Headers (Enhancement)
- **Current**: `Authorization: Bearer <token>`
- **Recommended**: Add `Accept: application/json` for explicit content negotiation

---

## New Response Format

```json
{
  "data": {
    "balance": 7.924416
  }
}
```

**Key Changes:**
- Balance is nested under `data.balance` instead of root-level `balance`
- No `account_type`, `currency`, or other metadata appears to be included in the new format

---

## Implementation Changes Required

### File: `app/services/api_quota_manager.py`

**Change 1: Update Response Parsing**

Replace this block (lines ~194-203):
```python
data = resp.json() if body else {}
balance = data.get('balance', 0)
account_type = data.get('account_type', 'basic')
rpm_limit = 300 if account_type == 'premium' else 3
rpd_limit = None if account_type == 'premium' else 100
return {
    'balance': balance,
    'account_type': account_type,
    'rpm_limit': rpm_limit,
    'rpd_limit': rpd_limit,
    'currency': data.get('currency', 'USD'),
}
```

With:
```python
response_data = resp.json() if body else {}
# New format: {"data": {"balance": 7.924416}}
nested_data = response_data.get('data', {})
balance = nested_data.get('balance', 0)

# Account type and other metadata might not be available anymore
# Keep defaults or try to extract from root if they add it back
account_type = nested_data.get('account_type') or response_data.get('account_type', 'basic')
rpm_limit = 300 if account_type == 'premium' else 3
rpd_limit = None if account_type == 'premium' else 100

return {
    'balance': balance,
    'account_type': account_type,
    'rpm_limit': rpm_limit,
    'rpd_limit': rpd_limit,
    'currency': nested_data.get('currency') or response_data.get('currency', 'USD'),
}
```

**Change 2: Add Accept Header**

Update headers (line ~189):
```python
headers={
    'Authorization': f'Bearer {api_key}',
    'Accept': 'application/json'
}
```

---

## Frontend Impact

The frontend (`src/pages/AITeam.tsx`) expects the following fields in the quota response:

```typescript
deapi: {
  balance: number;
  account_type?: string;
  rpm_limit?: number;
  rpd_limit?: number;
  error?: string;
  used?: number;
  limit?: number;
  remaining?: number;
  // ... other quota tracking fields
}
```

**Impact analysis:**
- ✅ `balance` will be correctly populated after the fix
- ✅ `account_type` will continue to have a default value ('basic')
- ✅ `error` handling remains the same
- ⚠️ If the new API doesn't provide account_type/currency, we'll use defaults (should be acceptable)

---

## Testing Recommendations

1. **Local Testing**:
   - Ensure `DEAPI_API_KEY` is set in `.env`
   - Hit `/api/ai-team/quotas` endpoint
   - Verify `deapi.balance` is populated correctly in response
   - Check browser console in AITeam.tsx page for any errors

2. **Error Cases to Test**:
   - Invalid API key (should return `{'error': 'HTTP 401'}` or similar)
   - Missing API key (should return `{'error': 'No DEAPI_API_KEY configured'}`)
   - Network timeout (should return error with exception message)
   - Malformed response (empty `data` object)

3. **Edge Cases**:
   - Very low balance (< $1) — should display in red
   - Medium balance ($1-$5) — should display in amber
   - Good balance (> $5) — should display in green

---

## Rollback Plan

If the new format causes issues:
1. The old parsing can coexist with new by checking both locations:
   ```python
   balance = nested_data.get('balance') or data.get('balance', 0)
   ```
2. This would support both old and new API formats during transition

---

## Files Affected

1. **Primary Change**: `app/services/api_quota_manager.py` (method: `fetch_deapi_balance`)
2. **No Changes Needed**:
   - `app/api/ai_team/routes.py` (just calls the method, doesn't need modification)
   - `src/pages/AITeam.tsx` (already handles the response correctly)
   - `app/services/media/ai_background.py` (uses same API key but different endpoint for image generation)

---

## Summary

**Scope**: Small — single method update  
**Risk**: Low — isolated change with clear error handling  
**Testing**: Medium — verify balance display in UI and various error conditions  
**Deployment**: Can be deployed independently, no database migrations or frontend changes required
