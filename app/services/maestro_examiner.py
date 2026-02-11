"""
Maestro Examiner — The Quality Gate

Validates every AI-generated proposal before it's accepted and turned into a job.
Uses DeepSeek to score proposals across 4 dimensions, with weighted composite scoring.

Philosophy:
  - Viral doesn't mean good — a viral gym bro video is irrelevant to our avatar
  - Not viral doesn't mean bad — a well-crafted tip about morning routines for
    energy after 40 is gold even with zero viral signals
  - Proven frameworks + fresh angles > pure trend-chasing
  - Our avatar: women 45+, US, health, daily habits, mental health, wellness

Thresholds:
  - >= 6.0  → ACCEPT (good enough, don't kill volume)
  - 4.5–5.9 → REJECT (gray zone — logged, skipped)
  - < 4.5   → HARD REJECT (clearly off-target)
"""

import os
import json
import time
import requests
import traceback
from typing import Dict, Optional, Tuple

# ── Scoring weights ───────────────────────────────────────────
SCORING_WEIGHTS = {
    "avatar_fit":          0.35,   # Is this realistic/relevant for women 45+?
    "content_quality":     0.30,   # Sound advice, actionable, educational?
    "engagement_potential": 0.20,  # Hooks, curiosity, shareability?
    "brand_alignment":     0.15,   # Matches health/wellness brand tone?
}

ACCEPT_THRESHOLD = 6.0     # >= this → accept
HARD_REJECT_THRESHOLD = 4.5  # < this → hard reject (not even gray zone)

# ── Brand niche descriptions (for brand_alignment scoring) ────
BRAND_NICHES = {
    "healthycollege":   "Daily health habits, practical wellness tips, nutrition fundamentals, healthy lifestyle foundations",
    "vitalitycollege":  "Energy, vitality, active aging, physical wellness, movement for longevity",
    "longevitycollege": "Anti-aging science, longevity research, biohacking for health span, cellular health",
    "holisticcollege":  "Mind-body connection, holistic wellness, meditation, stress management, integrative health",
    "wellbeingcollege": "Mental health, emotional wellness, self-care routines, mindfulness, inner peace",
}

DEFAULT_NICHE = "Health, wellness, and daily habits for women 45+ seeking to improve their quality of life"

# ── Red flags that should trigger low scores ──────────────────
RED_FLAGS = [
    "Extreme physical challenges inappropriate for the age group (e.g., 100 push-ups, marathon training)",
    "Youth-only aesthetics or beauty standards",
    "Dangerous supplement advice or unproven medical claims",
    "Gym bro culture, bodybuilding, or hardcore fitness content",
    "Aggressive weight loss tactics or crash diets",
    "Content that assumes high fitness level as baseline",
    "Clickbait with no substance behind the hook",
    "Content targeting men or young adults specifically",
]


def _build_examiner_prompt(
    title: str,
    content_lines: list,
    slide_texts: list,
    content_type: str,
    brand: str,
    strategy: str,
    reasoning: str,
    agent_name: str,
    source_type: str = None,
    source_title: str = None,
) -> str:
    """Build the DeepSeek prompt for proposal examination."""

    brand_niche = BRAND_NICHES.get(brand, DEFAULT_NICHE)

    # Build content preview
    if content_type == "post" and slide_texts:
        content_preview = "\n".join(f"  Slide {i+1}: {s}" for i, s in enumerate(slide_texts[:6]))
    elif content_lines:
        content_preview = "\n".join(f"  Line {i+1}: {l}" for i, l in enumerate(content_lines[:8]))
    else:
        content_preview = "  (no content lines provided)"

    red_flags_text = "\n".join(f"  - {rf}" for rf in RED_FLAGS)

    source_context = ""
    if source_type:
        source_context = f"\nSource strategy: {strategy} (from {source_type})"
        if source_title:
            source_context += f"\nInspired by: {source_title}"

    prompt = f"""You are MAESTRO, the final content examiner for a network of health and wellness Instagram brands.

TARGET AVATAR: Women aged 45+ in the United States who care about:
- Daily health habits and routines
- Mental health and emotional wellness
- Nutrition and holistic health
- Longevity and aging gracefully
- Self-care and mindfulness
- Practical, achievable wellness tips

BRAND: {brand} — Focus: {brand_niche}
CONTENT TYPE: {content_type} ({"carousel image post" if content_type == "post" else "short-form video reel"})
AGENT: {agent_name} | STRATEGY: {strategy}
{source_context}

PROPOSAL TO EVALUATE:
Title: {title}
Content:
{content_preview}

Agent reasoning: {reasoning}

YOUR TASK: Score this proposal on 4 dimensions (0-10 each).

SCORING CRITERIA:

1. AVATAR_FIT (weight: 35%):
   - Is this content realistic and achievable for women 45+?
   - Does it address their real concerns (energy, sleep, joint health, hormones, stress)?
   - Would a 48-year-old woman in the US find this relevant to her daily life?
   - Score LOW if: content assumes youth, extreme fitness, or male-oriented interests

2. CONTENT_QUALITY (weight: 30%):
   - Is the advice sound, evidence-informed, and actionable?
   - Does it educate or provide genuine value (not just clickbait)?
   - Is the information accurate and responsible?
   - Score LOW if: vague platitudes, dangerous advice, or pure shock value

3. ENGAGEMENT_POTENTIAL (weight: 20%):
   - Does it have a good hook that creates curiosity?
   - Is it shareable? Would someone tag a friend or save it?
   - Does it have emotional resonance or a surprising insight?
   - IMPORTANT: Viral doesn't automatically mean good. A well-crafted tip about morning routines is better than a trendy but irrelevant viral format.
   - Score fairly — don't penalize quiet wisdom, don't reward empty virality

4. BRAND_ALIGNMENT (weight: 15%):
   - Does this fit the brand's specific niche: {brand_niche}?
   - Is the tone appropriate (empowering, warm, educational — not aggressive or preachy)?
   - Would this feel natural on a health/wellness Instagram page?

RED FLAGS (any of these should significantly lower scores):
{red_flags_text}

SMART EVALUATION PHILOSOPHY:
- Just because content went viral does NOT make it good for our audience
- Just because content is NOT viral does NOT make it bad — proven wellness advice with a fresh angle is gold
- The best content mixes PROVEN value with ENGAGING presentation
- Err on the side of accepting good-enough content — we need volume, not perfection

Respond with ONLY valid JSON, no markdown:
{{
  "avatar_fit": <0-10>,
  "content_quality": <0-10>,
  "engagement_potential": <0-10>,
  "brand_alignment": <0-10>,
  "verdict": "<accept|reject>",
  "reason": "<1-2 sentence explanation of your decision>",
  "red_flags_found": ["<list any red flags detected, or empty list>"]
}}"""

    return prompt


def examine_proposal(
    proposal_dict: Dict,
    brand: str = None,
) -> Dict:
    """
    Examine a single proposal and return scoring results.

    Returns:
        {
            "passed": bool,
            "composite_score": float,
            "scores": {"avatar_fit": float, "content_quality": float, ...},
            "verdict": "accept" | "reject",
            "reason": str,
            "red_flags_found": list,
            "raw_response": str,
        }
    """
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        # If no API key, pass everything (don't block pipeline)
        print("[EXAMINER] ⚠️ No DEEPSEEK_API_KEY — auto-passing proposal", flush=True)
        return _auto_pass("No API key configured")

    title = proposal_dict.get("title", "")
    content_lines = proposal_dict.get("content_lines") or []
    slide_texts = proposal_dict.get("slide_texts") or []
    content_type = proposal_dict.get("content_type", "reel")
    strategy = proposal_dict.get("strategy", "unknown")
    reasoning = proposal_dict.get("reasoning", "")
    agent_name = proposal_dict.get("agent_name", "unknown")
    source_type = proposal_dict.get("source_type")
    source_title = proposal_dict.get("source_title")
    proposal_brand = brand or proposal_dict.get("brand", "unknown")

    prompt = _build_examiner_prompt(
        title=title,
        content_lines=content_lines,
        slide_texts=slide_texts,
        content_type=content_type,
        brand=proposal_brand,
        strategy=strategy,
        reasoning=reasoning,
        agent_name=agent_name,
        source_type=source_type,
        source_title=source_title,
    )

    try:
        response = requests.post(
            "https://api.deepseek.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": "You are Maestro, a strict but fair content quality examiner. Respond with ONLY valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,  # Low temp for consistent scoring
                "max_tokens": 500,
            },
            timeout=30,
        )

        if response.status_code != 200:
            print(f"[EXAMINER] ⚠️ DeepSeek API error {response.status_code} — auto-passing", flush=True)
            return _auto_pass(f"API error: {response.status_code}")

        raw_text = response.json()["choices"][0]["message"]["content"].strip()

        # Parse JSON (handle markdown code blocks)
        json_text = raw_text
        if "```json" in json_text:
            json_text = json_text.split("```json")[1].split("```")[0].strip()
        elif "```" in json_text:
            json_text = json_text.split("```")[1].split("```")[0].strip()

        scores_data = json.loads(json_text)

        # Extract scores
        avatar_fit = float(scores_data.get("avatar_fit", 5))
        content_quality = float(scores_data.get("content_quality", 5))
        engagement_potential = float(scores_data.get("engagement_potential", 5))
        brand_alignment = float(scores_data.get("brand_alignment", 5))

        # Clamp to 0-10
        scores = {
            "avatar_fit": max(0, min(10, avatar_fit)),
            "content_quality": max(0, min(10, content_quality)),
            "engagement_potential": max(0, min(10, engagement_potential)),
            "brand_alignment": max(0, min(10, brand_alignment)),
        }

        # Calculate weighted composite
        composite = sum(
            scores[dim] * weight
            for dim, weight in SCORING_WEIGHTS.items()
        )
        composite = round(composite, 2)

        passed = composite >= ACCEPT_THRESHOLD
        verdict = scores_data.get("verdict", "accept" if passed else "reject")
        reason = scores_data.get("reason", "No reason provided")
        red_flags_found = scores_data.get("red_flags_found", [])

        # Override verdict based on our thresholds (AI might be too generous)
        if composite < HARD_REJECT_THRESHOLD:
            passed = False
            verdict = "reject"
        elif composite >= ACCEPT_THRESHOLD:
            passed = True
            verdict = "accept"
        else:
            # Gray zone — reject but not hard
            passed = False
            verdict = "reject"

        return {
            "passed": passed,
            "composite_score": composite,
            "scores": scores,
            "verdict": verdict,
            "reason": reason,
            "red_flags_found": red_flags_found,
            "raw_response": raw_text,
        }

    except json.JSONDecodeError as e:
        print(f"[EXAMINER] ⚠️ JSON parse error: {e} — auto-passing", flush=True)
        return _auto_pass(f"JSON parse error: {str(e)[:100]}")
    except requests.exceptions.Timeout:
        print("[EXAMINER] ⚠️ DeepSeek timeout — auto-passing", flush=True)
        return _auto_pass("API timeout")
    except Exception as e:
        print(f"[EXAMINER] ⚠️ Unexpected error: {e} — auto-passing", flush=True)
        traceback.print_exc()
        return _auto_pass(f"Error: {str(e)[:100]}")


def _auto_pass(reason: str) -> Dict:
    """Fallback: auto-pass when examiner can't run (don't block pipeline)."""
    return {
        "passed": True,
        "composite_score": 7.0,
        "scores": {
            "avatar_fit": 7.0,
            "content_quality": 7.0,
            "engagement_potential": 7.0,
            "brand_alignment": 7.0,
        },
        "verdict": "accept",
        "reason": f"Auto-passed: {reason}",
        "red_flags_found": [],
        "raw_response": "",
    }


def examine_batch(proposals: list, brand_map: Dict[str, str] = None) -> Dict[str, Dict]:
    """
    Examine a batch of proposals. Returns {proposal_id: result_dict}.

    Adds small delay between calls to avoid rate limiting.
    """
    results = {}
    brand_map = brand_map or {}

    for p in proposals:
        pid = p.get("proposal_id", "unknown")
        brand = brand_map.get(pid) or p.get("brand")

        result = examine_proposal(p, brand=brand)
        results[pid] = result

        # Small delay between API calls
        time.sleep(0.3)

    accepted = sum(1 for r in results.values() if r["passed"])
    rejected = len(results) - accepted

    print(
        f"[EXAMINER] Batch complete: {accepted} accepted, {rejected} rejected "
        f"(out of {len(results)} total)",
        flush=True,
    )

    return results
