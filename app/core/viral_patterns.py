"""
LAYER 1: PATTERN BRAIN (STATIC)

This module contains compressed abstractions of the viral database.
These patterns are NEVER sent per request - they're hardcoded rules
that the system uses to construct prompts and validate outputs.

This replaces sending the full 59-post database every time.
"""

from typing import List, Dict, Optional
from dataclasses import dataclass
from enum import Enum
import random

from app.core.prompt_context import PromptContext


# ============================================================
# TITLE ARCHETYPES - Learned from viral database
# ============================================================

TITLE_ARCHETYPES: List[Dict] = [
    {
        "pattern": "{NUMBER} SIGNS OF {ISSUE}",
        "examples": ["5 SIGNS OF A HIDDEN PROBLEM", "8 SIGNS YOU'RE MAKING A MISTAKE"],
        "variables": {
            "NUMBER": ["4", "5", "6", "8", "9", "10", "12", "16"],
            "ISSUE": ["a hidden problem", "a critical mistake", "something wrong"]
        },
        "hook_type": "fear"
    },
    {
        "pattern": "EXPERTS DON'T WANT YOU TO KNOW {SECRET}",
        "examples": ["EXPERTS DON'T WANT YOU TO KNOW THIS"],
        "variables": {
            "SECRET": ["this", "the real truth", "what they hide"]
        },
        "hook_type": "authority"
    },
    {
        "pattern": "TRY THIS FOR {TIME}",
        "examples": ["TRY THIS FOR 1 WEEK", "TRY THIS FOR 5 DAYS"],
        "variables": {
            "TIME": ["3 days", "5 days", "1 week", "7 days", "10 days", "2 weeks", "1 month"]
        },
        "hook_type": "control"
    },
    {
        "pattern": "{NUMBER} HABITS DESTROYING YOUR {TARGET}",
        "examples": ["7 HABITS DESTROYING YOUR PROGRESS", "THINGS SILENTLY HOLDING YOU BACK"],
        "variables": {
            "NUMBER": ["5", "6", "7", "8", "9", "10"],
            "TARGET": ["progress", "results", "potential", "growth", "success"]
        },
        "hook_type": "fear"
    },
    {
        "pattern": "STOP DOING THIS IF YOU WANT {OUTCOME}",
        "examples": ["STOP DOING THIS IF YOU WANT BETTER RESULTS"],
        "variables": {
            "OUTCOME": ["better results", "real progress", "to succeed", 
                        "to improve", "to level up"]
        },
        "hook_type": "control"
    },
    {
        "pattern": "{ADJECTIVE} TRUTHS ABOUT {TOPIC}",
        "examples": ["8 HARSH TRUTHS", "SHOCKING TRUTHS NO ONE TALKS ABOUT"],
        "variables": {
            "ADJECTIVE": ["harsh", "shocking", "strange", "uncomfortable", "brutal"],
            "TOPIC": ["life", "success", "growth", "relationships", "self-improvement"]
        },
        "hook_type": "curiosity"
    },
    {
        "pattern": "WHAT YOUR {INDICATOR} IS TRYING TO TELL YOU",
        "examples": ["WHAT YOUR RESULTS ARE TRYING TO TELL YOU"],
        "variables": {
            "INDICATOR": ["results", "habits", "routine", "mindset", "patterns"]
        },
        "hook_type": "curiosity"
    },
    {
        "pattern": "DO THESE {NUMBER} THINGS IF YOU WANT TO {GOAL}",
        "examples": ["DO THESE 10 THINGS IF YOU WANT TO SUCCEED"],
        "variables": {
            "NUMBER": ["5", "7", "8", "10", "12"],
            "GOAL": ["succeed", "see real change", "transform your results", 
                     "get ahead", "reach your goals"]
        },
        "hook_type": "hope"
    }
]


# ============================================================
# CONTENT FORMATS - Structural patterns
# ============================================================

class ContentFormat(Enum):
    SHORT_FRAGMENT = "SHORT_FRAGMENT"
    FULL_SENTENCE = "FULL_SENTENCE"
    CAUSE_EFFECT = "CAUSE_EFFECT"
    PURE_LIST = "PURE_LIST"


FORMAT_DEFINITIONS: Dict[str, Dict] = {
    "SHORT_FRAGMENT": {
        "description": "Minimalist, punchy, list-based. Item — Explanation",
        "structure": "{subject} — {explanation}",
        "word_limit": 8,
        "example_structure": "Mistake — Missing the real cause",
        "rules": [
            "No verbs in fragment form",
            "Em-dash separator",
            "Maximum 8 words per line"
        ]
    },
    "FULL_SENTENCE": {
        "description": "Complete sentences with time-bound challenges preferred",
        "structure": "If you {action} for {time}, {outcome} will {result}",
        "word_limit": 20,
        "example_structure": "If you try this for one week, you will notice a real difference.",
        "rules": [
            "Use conditional structure when possible",
            "Include timeframes",
            "Maximum 20 words per line"
        ]
    },
    "CAUSE_EFFECT": {
        "description": "Simple cause → simple outcome. No citations, no disclaimers",
        "structure": "{action/item} — {benefit or consequence}",
        "word_limit": 15,
        "example_structure": "Skipping this step — May lead to slower progress and frustration.",
        "rules": [
            "Action leads to outcome",
            "No explanations beyond one clause",
            "Maximum 15 words per line"
        ]
    },
    "PURE_LIST": {
        "description": "One idea per line. No explanations longer than one clause",
        "structure": "{problem} → {solution}",
        "word_limit": 6,
        "example_structure": "Problem → Simple fix",
        "rules": [
            "Arrow separator",
            "No explanations",
            "Maximum 6 words per line"
        ]
    }
}


# ============================================================
# PSYCHOLOGICAL HOOKS
# ============================================================

class PsychHook(Enum):
    FEAR = "fear"           # damage, disease, aging, mistakes
    CURIOSITY = "curiosity" # strange signs, unknown facts
    AUTHORITY = "authority" # doctors, experts, warnings
    CONTROL = "control"     # simple actions, daily habits
    HOPE = "hope"           # reversal, improvement, prevention


HOOK_DEFINITIONS: Dict[str, Dict] = {
    "fear": {
        "triggers": ["damage", "mistakes", "destruction", "silent killers", "hidden problems"],
        "language": ["destroying", "damaging", "silently", "never ignore", "warning", "dangerous"],
        "intensity": "high"
    },
    "curiosity": {
        "triggers": ["strange signs", "unknown facts", "hidden", "secret", "reveals"],
        "language": ["actually", "really", "trying to tell you", "reveals", "hidden meaning"],
        "intensity": "medium"
    },
    "authority": {
        "triggers": ["experts", "science", "research", "studies", "professionals"],
        "language": ["experts don't want", "science proves", "research shows", "professionals hide"],
        "intensity": "high"
    },
    "control": {
        "triggers": ["simple actions", "daily habits", "easy steps", "quick fix"],
        "language": ["just do this", "try this for", "stop doing", "start today"],
        "intensity": "low"
    },
    "hope": {
        "triggers": ["improvement", "prevention", "recovery", "progress", "transformation"],
        "language": ["will improve", "can reverse", "supports", "strengthens", "prevents"],
        "intensity": "medium"
    }
}


# ============================================================
# TOPIC BUCKETS - Safe health categories
# ============================================================

# Topic buckets are loaded dynamically from NicheConfig.
# This empty list serves as a last-resort fallback.
TOPIC_BUCKETS: List[str] = []


# ============================================================
# PATTERN SELECTOR (MIDDLEWARE)
# ============================================================

@dataclass
class PatternSelection:
    """Selected patterns for a generation request."""
    title_archetype: Dict
    format_style: str
    primary_hook: str
    topic: str
    point_count: int
    

class PatternSelector:
    """
    Middleware that decides patterns BEFORE calling DeepSeek.
    This reduces model burden and improves consistency.
    """
    
    def __init__(self):
        self._last_format: Optional[str] = None
        self._recent_topics: List[str] = []
        self._recent_archetypes: List[str] = []
        self._max_history = 10
    
    def select_patterns(
        self,
        topic_hint: Optional[str] = None,
        format_hint: Optional[str] = None,
        hook_hint: Optional[str] = None,
        ctx: PromptContext = None
    ) -> PatternSelection:
        """
        Select patterns for content generation.
        Ensures variety and avoids repetition.
        """
        # Select topic - avoid recent
        topic = self._select_topic(topic_hint, ctx=ctx)
        
        # Select format - never repeat consecutively
        format_style = self._select_format(format_hint)
        
        # Select title archetype - avoid recent
        title_archetype = self._select_archetype()
        
        # Select hook - weighted by archetype preference
        primary_hook = self._select_hook(hook_hint, title_archetype)
        
        # Determine point count based on format
        point_count = self._determine_point_count(format_style)
        
        return PatternSelection(
            title_archetype=title_archetype,
            format_style=format_style,
            primary_hook=primary_hook,
            topic=topic,
            point_count=point_count
        )
    
    def _select_topic(self, hint: Optional[str] = None, ctx: PromptContext = None) -> str:
        """Select topic, avoiding recent ones."""
        if ctx is None:
            ctx = PromptContext()
        topics = ctx.topic_categories if ctx.topic_categories else TOPIC_BUCKETS
        
        if not topics:
            return hint or "general"
        
        if hint and hint in topics:
            return hint
        
        available = [t for t in topics if t not in self._recent_topics[-3:]]
        if not available:
            available = topics
        
        selected = random.choice(available)
        self._recent_topics.append(selected)
        if len(self._recent_topics) > self._max_history:
            self._recent_topics = self._recent_topics[-self._max_history:]
        
        return selected
    
    def _select_format(self, hint: Optional[str] = None) -> str:
        """Select format, never repeating consecutively."""
        if hint and hint in FORMAT_DEFINITIONS:
            self._last_format = hint
            return hint
        
        formats = list(FORMAT_DEFINITIONS.keys())
        if self._last_format:
            formats = [f for f in formats if f != self._last_format]
        
        selected = random.choice(formats)
        self._last_format = selected
        return selected
    
    def _select_archetype(self) -> Dict:
        """Select title archetype, avoiding recent patterns."""
        recent_patterns = [a.get("pattern") for a in self._recent_archetypes[-3:]]
        available = [a for a in TITLE_ARCHETYPES if a["pattern"] not in recent_patterns]
        
        if not available:
            available = TITLE_ARCHETYPES
        
        selected = random.choice(available)
        self._recent_archetypes.append(selected)
        if len(self._recent_archetypes) > self._max_history:
            self._recent_archetypes = self._recent_archetypes[-self._max_history:]
        
        return selected
    
    def _select_hook(self, hint: Optional[str], archetype: Dict) -> str:
        """Select hook, preferring archetype's natural hook."""
        if hint and hint in HOOK_DEFINITIONS:
            return hint
        
        # 70% chance to use archetype's natural hook
        if random.random() < 0.7:
            return archetype.get("hook_type", "curiosity")
        
        # 30% chance to pick random different hook
        hooks = list(HOOK_DEFINITIONS.keys())
        return random.choice(hooks)
    
    def _determine_point_count(self, format_style: str) -> int:
        """Determine appropriate point count for format."""
        if format_style == "PURE_LIST":
            return random.choice([12, 14, 16, 18, 20])
        elif format_style == "SHORT_FRAGMENT":
            return random.choice([6, 7, 8, 9, 10])
        elif format_style == "FULL_SENTENCE":
            return random.choice([4, 5, 6, 7])
        else:  # CAUSE_EFFECT
            return random.choice([6, 7, 8, 9])


# ============================================================
# PATTERN UTILITIES
# ============================================================

def generate_title_from_archetype(archetype: Dict, topic: str) -> str:
    """
    Generate a title by filling in archetype variables.
    Returns a suggested title structure (model can modify).
    """
    pattern = archetype["pattern"]
    variables = archetype.get("variables", {})
    
    for var_name, options in variables.items():
        placeholder = "{" + var_name + "}"
        if placeholder in pattern:
            # Select contextually appropriate option
            selected = random.choice(options)
            pattern = pattern.replace(placeholder, selected)
    
    return pattern.upper()


def get_format_instructions(format_style: str) -> Dict:
    """Get format instructions for the model."""
    return FORMAT_DEFINITIONS.get(format_style, FORMAT_DEFINITIONS["SHORT_FRAGMENT"])


def get_hook_language(hook: str) -> List[str]:
    """Get hook-specific language suggestions."""
    hook_def = HOOK_DEFINITIONS.get(hook, HOOK_DEFINITIONS["curiosity"])
    return hook_def.get("language", [])


# Singleton pattern selector instance
_pattern_selector: Optional[PatternSelector] = None

def get_pattern_selector() -> PatternSelector:
    """Get or create the pattern selector singleton."""
    global _pattern_selector
    if _pattern_selector is None:
        _pattern_selector = PatternSelector()
    return _pattern_selector
