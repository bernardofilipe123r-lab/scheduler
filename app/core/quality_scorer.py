"""
QUALITY SCORING FUNCTION (QSF)

Judges viral fitness and pattern compliance, NOT truth.
Think of it as a linter for content, not a critic.

5 Dimensions (0-100 total score):
- Structural Compliance (0-25)
- Pattern Familiarity (0-20)
- Novelty (0-20)
- Emotional Hook Strength (0-20)
- Plausibility (0-15)

Thresholds:
- ≥ 80: Publish
- 65-79: Regenerate with tweaks
- < 65: Reject
"""

from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass
import re
from difflib import SequenceMatcher

from app.core.prompt_context import PromptContext


@dataclass
class QualityScore:
    """Complete quality assessment for generated content."""
    total_score: float
    structure_score: float
    familiarity_score: float
    novelty_score: float
    hook_score: float
    plausibility_score: float
    
    # Feedback for correction
    feedback: Dict[str, bool]
    issues: List[str]
    
    @property
    def should_publish(self) -> bool:
        return self.total_score >= 80
    
    @property
    def should_regenerate(self) -> bool:
        return 65 <= self.total_score < 80
    
    @property
    def should_reject(self) -> bool:
        return self.total_score < 65


class QualityScorer:
    """
    Quality scoring function for viral content.
    Judges viral fitness and pattern compliance.
    """
    
    # Weights for each dimension
    WEIGHTS = {
        "structure": 0.25,
        "familiarity": 0.20,
        "novelty": 0.20,
        "hook": 0.20,
        "plausibility": 0.15
    }
    
    # Word limits by format
    FORMAT_WORD_LIMITS = {
        "SHORT_FRAGMENT": 8,
        "FULL_SENTENCE": 20,
        "CAUSE_EFFECT": 15,
        "PURE_LIST": 6
    }
    
    # Point count ranges by format
    FORMAT_POINT_RANGES = {
        "SHORT_FRAGMENT": (5, 12),
        "FULL_SENTENCE": (4, 8),
        "CAUSE_EFFECT": (5, 10),
        "PURE_LIST": (10, 25)
    }
    
    # Hook trigger words
    HOOK_KEYWORDS = {
        "fear": ["destroy", "damage", "kill", "silent", "warning", "danger", "never", 
                 "mistake", "aging", "disease", "harmful", "toxic", "worst"],
        "curiosity": ["secret", "hidden", "reveal", "actually", "really", "trying to tell", 
                      "strange", "shocking", "what your", "signs"],
        "authority": ["doctor", "expert", "science", "research", "study", "proven", 
                      "medical", "clinical", "professional"],
        "control": ["just", "simple", "easy", "try this", "eat this", "stop doing", 
                    "start", "daily", "habit", "routine"],
        "hope": ["improve", "heal", "reverse", "prevent", "boost", "strengthen", 
                 "support", "restore", "recover", "better"]
    }
    
    # Plausibility blacklist
    PLAUSIBILITY_BLACKLIST = [
        "cure", "cures", "guaranteed", "100%", "miracle", "instantly", 
        "immediately reverse", "eliminate all", "never get sick",
        "permanent", "forever", "absolute", "definitely", "proven to cure"
    ]
    
    # Plausibility whitelist (soft language)
    PLAUSIBILITY_WHITELIST = [
        "may", "can", "might", "could", "supports", "associated with",
        "linked to", "often", "commonly", "typically", "generally"
    ]
    
    def __init__(self):
        self._recent_outputs: List[Dict] = []
        self._max_history = 20
    
    def score(
        self,
        content: Dict,
        recent_outputs: Optional[List[Dict]] = None,
        ctx: PromptContext = None
    ) -> QualityScore:
        """
        Score generated content across all dimensions.
        
        Args:
            content: Generated content dict with title, content_lines, etc.
            recent_outputs: Optional list of recent outputs for novelty comparison
            ctx: Optional PromptContext with niche-specific keywords/config
            
        Returns:
            QualityScore with detailed breakdown
        """
        if ctx is None:
            ctx = PromptContext()
        
        if recent_outputs:
            self._recent_outputs = recent_outputs[-self._max_history:]
        
        # Score each dimension
        structure, struct_issues = self._score_structure(content, ctx)
        familiarity, fam_issues = self._score_familiarity(content, ctx)
        novelty, nov_issues = self._score_novelty(content, ctx)
        hook, hook_issues = self._score_hook(content, ctx)
        plausibility, plaus_issues = self._score_plausibility(content, ctx)
        
        # Calculate weighted total
        total = (
            structure * self.WEIGHTS["structure"] +
            familiarity * self.WEIGHTS["familiarity"] +
            novelty * self.WEIGHTS["novelty"] +
            hook * self.WEIGHTS["hook"] +
            plausibility * self.WEIGHTS["plausibility"]
        ) * 100  # Scale to 0-100
        
        # Compile issues
        all_issues = struct_issues + fam_issues + nov_issues + hook_issues + plaus_issues
        
        # Build feedback flags for correction prompt
        feedback = {
            "structure_error": structure < 0.7,
            "low_novelty": novelty < 0.6,
            "weak_hook": hook < 0.5,
            "plausibility_issue": plausibility < 0.6
        }
        
        return QualityScore(
            total_score=round(total, 1),
            structure_score=round(structure * 100, 1),
            familiarity_score=round(familiarity * 100, 1),
            novelty_score=round(novelty * 100, 1),
            hook_score=round(hook * 100, 1),
            plausibility_score=round(plausibility * 100, 1),
            feedback=feedback,
            issues=all_issues
        )
    
    def _score_structure(self, content: Dict, ctx: PromptContext = None) -> Tuple[float, List[str]]:
        """
        Score structural compliance (0-1).
        Pure rule checks - deterministic.
        """
        if ctx is None:
            ctx = PromptContext()
        score = 1.0
        issues = []
        
        title = content.get("title", "")
        lines = content.get("content_lines", [])
        format_style = content.get("format_style", "SHORT_FRAGMENT")
        
        # Check 1: Title in ALL CAPS
        if title != title.upper():
            score -= 0.15
            issues.append("Title not in ALL CAPS")
        
        # Check 2: Title length (3-10 words)
        title_words = len(title.split())
        if title_words < 3:
            score -= 0.1
            issues.append("Title too short")
        elif title_words > 10:
            score -= 0.1
            issues.append("Title too long")
        
        # Check 3: Point count in range
        min_points, max_points = self.FORMAT_POINT_RANGES.get(
            format_style, (5, 10)
        )
        if len(lines) < min_points:
            score -= 0.15
            issues.append(f"Too few points ({len(lines)}, min {min_points})")
        elif len(lines) > max_points:
            score -= 0.1
            issues.append(f"Too many points ({len(lines)}, max {max_points})")
        
        # Check 4: Line word limits
        word_limit = self.FORMAT_WORD_LIMITS.get(format_style, 15)
        over_limit = 0
        for line in lines:
            if len(line.split()) > word_limit:
                over_limit += 1
        
        if over_limit > 0:
            penalty = min(0.2, over_limit * 0.05)
            score -= penalty
            issues.append(f"{over_limit} lines exceed {word_limit} word limit")
        
        # Check 5: No emojis
        emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"
            "\U0001F300-\U0001F5FF"
            "\U0001F680-\U0001F6FF"
            "\U0001F1E0-\U0001F1FF"
            "]+", flags=re.UNICODE
        )
        text = title + " ".join(lines)
        if emoji_pattern.search(text):
            score -= 0.1
            issues.append("Contains emojis")
        
        # Check 6: No hashtags
        if "#" in text:
            score -= 0.1
            issues.append("Contains hashtags")
        
        # Check 7: No numbered lists
        numbered_pattern = re.compile(r'^\d+[\.\)]\s')
        for line in lines:
            if numbered_pattern.match(line):
                score -= 0.05
                issues.append("Contains numbered prefix (should be plain)")
                break
        
        return max(0, score), issues
    
    def _score_familiarity(self, content: Dict, ctx: PromptContext = None) -> Tuple[float, List[str]]:
        """
        Score pattern familiarity (0-1).
        Does it feel like known viral content without copying?
        """
        if ctx is None:
            ctx = PromptContext()
        
        score = 1.0
        issues = []
        
        title = content.get("title", "").upper()
        lines = content.get("content_lines", [])
        
        # Check 1: Uses familiar title patterns
        familiar_patterns = [
            r"SIGNS YOUR",
            r"^\d+\s",
            r"YOUR [A-Z]",
            r"TRY THIS",
            r"HABITS",
            r"MOST PEOPLE",
            r"DESTROYING",
            r"WARNING",
            r"TRUTHS",
            r"IF YOU WANT",
            r"HIDDEN",
            r"REAL REASON",
            r"STOP DOING"
        ]
        
        pattern_matches = sum(
            1 for p in familiar_patterns 
            if re.search(p, title)
        )
        
        if pattern_matches == 0:
            score -= 0.3
            issues.append("Title doesn't match familiar viral patterns")
        
        # Check 2: Niche-relevant framing (only when keywords are configured)
        keywords_to_check = ctx.topic_keywords
        
        text = (title + " " + " ".join(lines)).lower()
        
        if keywords_to_check:
            keyword_count = sum(1 for k in keywords_to_check if k in text)
            if keyword_count < 3:
                niche_label = ctx.niche_name.lower() if ctx.niche_name else "niche"
                score -= 0.2
                issues.append(f"Not enough {niche_label} framing")
        
        # Check 3: Simple, everyday language
        complex_indicators = [
            "utilize", "commence", "furthermore", "nevertheless",
            "paradigm", "synergy", "optimize", "leverage"
        ]
        
        if any(w in text for w in complex_indicators):
            score -= 0.15
            issues.append("Language too academic/complex")
        
        return max(0, score), issues
    
    def _score_novelty(self, content: Dict, ctx: PromptContext = None) -> Tuple[float, List[str]]:
        """
        Score novelty compared to recent outputs (0-1).
        Uses string similarity (Jaccard/bigram).
        """
        if not self._recent_outputs:
            return 1.0, []  # No history to compare
        
        score = 1.0
        issues = []
        
        title = content.get("title", "")
        lines = content.get("content_lines", [])
        current_text = title + " " + " ".join(lines)
        
        # Compare with recent outputs
        max_similarity = 0.0
        for recent in self._recent_outputs:
            recent_title = recent.get("title", "")
            recent_lines = recent.get("content_lines", [])
            recent_text = recent_title + " " + " ".join(recent_lines)
            
            similarity = self._text_similarity(current_text, recent_text)
            max_similarity = max(max_similarity, similarity)
        
        # High similarity = low novelty
        novelty_score = 1.0 - max_similarity
        
        if max_similarity > 0.8:
            score = novelty_score
            issues.append(f"Very similar to recent output ({int(max_similarity*100)}% match)")
        elif max_similarity > 0.6:
            score = novelty_score * 0.8 + 0.2
            issues.append(f"Somewhat similar to recent output ({int(max_similarity*100)}% match)")
        elif max_similarity > 0.4:
            score = novelty_score * 0.5 + 0.5
        else:
            score = 1.0
        
        return max(0, score), issues
    
    def _score_hook(self, content: Dict, ctx: PromptContext = None) -> Tuple[float, List[str]]:
        """
        Score emotional hook strength (0-1).
        Checks for presence of hook triggers.
        """
        score = 0.5  # Baseline
        issues = []
        
        title = content.get("title", "").lower()
        lines = content.get("content_lines", [])
        hook_type = content.get("hook_type", "curiosity")
        
        text = title + " " + " ".join(lines).lower()
        
        # Check for hook keywords
        expected_keywords = self.HOOK_KEYWORDS.get(hook_type, [])
        keyword_hits = sum(1 for k in expected_keywords if k in text)
        
        if keyword_hits >= 3:
            score += 0.4
        elif keyword_hits >= 2:
            score += 0.3
        elif keyword_hits >= 1:
            score += 0.15
        else:
            issues.append(f"Weak {hook_type} hook - missing trigger words")
        
        # Bonus: Check for any strong hooks
        all_hook_keywords = [k for v in self.HOOK_KEYWORDS.values() for k in v]
        total_hooks = sum(1 for k in all_hook_keywords if k in text)
        
        if total_hooks >= 5:
            score += 0.1
        
        # Check for urgency/scarcity indicators
        urgency_words = ["now", "today", "never", "always", "every", "silent", "hidden"]
        if any(w in text for w in urgency_words):
            score += 0.05
        
        return min(1.0, score), issues
    
    def _score_plausibility(self, content: Dict, ctx: PromptContext = None) -> Tuple[float, List[str]]:
        """
        Score social plausibility (0-1).
        Not medical accuracy - believability for social content.
        """
        if ctx is None:
            ctx = PromptContext()
        score = 1.0
        issues = []
        
        lines = content.get("content_lines", [])
        text = " ".join(lines).lower()
        
        # Check 1: Blacklist words
        for blackword in self.PLAUSIBILITY_BLACKLIST:
            if blackword.lower() in text:
                score -= 0.25
                issues.append(f"Contains implausible claim: '{blackword}'")
        
        # Check 2: Whitelist bonus (soft language)
        whitelist_hits = sum(
            1 for w in self.PLAUSIBILITY_WHITELIST 
            if w in text
        )
        if whitelist_hits >= 2:
            score += 0.1
        
        # Check 3: Familiar niche items (only when configured)
        familiar_items = ctx.topic_keywords
        
        if familiar_items:
            familiar_count = sum(1 for f in familiar_items if f in text)
            if familiar_count >= 3:
                score += 0.05
            elif familiar_count == 0 and len(lines) > 5:
                score -= 0.1
                issues.append("No familiar niche items mentioned")
        
        return max(0, min(1.0, score)), issues
    
    def _text_similarity(self, text1: str, text2: str) -> float:
        """Calculate text similarity using SequenceMatcher."""
        return SequenceMatcher(None, text1.lower(), text2.lower()).ratio()
    
    def add_to_history(self, content: Dict) -> None:
        """Add content to history for future novelty checks."""
        self._recent_outputs.append(content)
        if len(self._recent_outputs) > self._max_history:
            self._recent_outputs = self._recent_outputs[-self._max_history:]
    
    def clear_history(self) -> None:
        """Clear the history."""
        self._recent_outputs = []


# Singleton scorer instance
_scorer: Optional[QualityScorer] = None

def get_quality_scorer() -> QualityScorer:
    """Get or create the quality scorer singleton."""
    global _scorer
    if _scorer is None:
        _scorer = QualityScorer()
    return _scorer


def quick_score(content: Dict) -> float:
    """Quick scoring without detailed breakdown."""
    scorer = get_quality_scorer()
    result = scorer.score(content)
    return result.total_score
