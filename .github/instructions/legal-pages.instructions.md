---
description: "Use when editing legal pages (Terms, Privacy Policy, Data Deletion). These pages are referenced by Meta, TikTok, and Google developer portals and must stay accurate."
applyTo: ["src/pages/Terms.tsx", "src/pages/PrivacyPolicy.tsx", "src/pages/DataDeletion.tsx"]
---

# Legal Page Rules

These URLs are referenced in **Meta App Dashboard**, **TikTok Developer Portal**, and **Google API Console**. They must stay accurate.

| URL | File |
|-----|------|
| `viraltoby.com/terms` | `src/pages/Terms.tsx` |
| `viraltoby.com/privacy` | `src/pages/PrivacyPolicy.tsx` |
| `viraltoby.com/data-deletion` | `src/pages/DataDeletion.tsx` |

When adding or removing a **social platform integration**, ALL three pages must be updated:
1. **Terms** — List platform in service description & third-party services
2. **Privacy** — Describe data collected (tokens, IDs, profile info)
3. **Data Deletion** — Include platform's tokens/IDs in "What Gets Deleted" list
4. **Privacy** — Include platform in "Your Rights" / "Revoke access" instructions

Currently integrated platforms: **Instagram, Facebook, Threads, TikTok, YouTube**
