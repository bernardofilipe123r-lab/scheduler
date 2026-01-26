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


# ============================================================
# TITLE ARCHETYPES - Learned from viral database
# ============================================================

TITLE_ARCHETYPES: List[Dict] = [
    {
        "pattern": "SIGNS YOUR BODY IS {STATE}",
        "examples": ["SIGNS YOUR BODY IS TRYING TO WARN YOU", "SIGNS YOUR BODY IS STARVING INSIDE"],
        "variables": {
            "STATE": ["trying to warn you", "starving inside", "aging too fast", "begging for rest", 
                      "fighting inflammation", "detoxing naturally", "under hidden stress"]
        },
        "hook_type": "curiosity"
    },
    {
        "pattern": "{NUMBER} SIGNS YOUR {BODY_PART} IS {CONDITION}",
        "examples": ["5 SIGNS YOUR LIVER IS IN TROUBLE", "8 SIGNS YOUR GUT IS DAMAGED"],
        "variables": {
            "NUMBER": ["4", "5", "6", "8", "9", "10", "12", "16"],
            "BODY_PART": ["liver", "gut", "brain", "heart", "kidneys", "nervous system", "thyroid"],
            "CONDITION": ["in trouble", "damaged", "overloaded", "struggling", "calling for help"]
        },
        "hook_type": "fear"
    },
    {
        "pattern": "DOCTORS DON'T WANT YOU TO KNOW {SECRET}",
        "examples": ["DOCTORS DON'T WANT YOU TO KNOW THIS ABOUT SLEEP"],
        "variables": {
            "SECRET": ["this about sleep", "this about your gut", "these natural remedies", 
                       "what really causes fatigue", "the truth about inflammation"]
        },
        "hook_type": "authority"
    },
    {
        "pattern": "EAT THIS FOR {TIME}",
        "examples": ["JUST EAT THIS FOR 1 WEEK", "TRY THIS FOR 5 DAYS"],
        "variables": {
            "TIME": ["3 days", "5 days", "1 week", "7 days", "10 days", "2 weeks", "1 month"]
        },
        "hook_type": "control"
    },
    {
        "pattern": "{NUMBER} HABITS DESTROYING YOUR {TARGET}",
        "examples": ["7 HABITS DESTROYING YOUR SLEEP", "THINGS SILENTLY DESTROYING YOUR HEALTH"],
        "variables": {
            "NUMBER": ["5", "6", "7", "8", "9", "10"],
            "TARGET": ["sleep", "health", "energy", "metabolism", "gut", "brain", "hormones", "skin"]
        },
        "hook_type": "fear"
    },
    {
        "pattern": "WHAT YOUR {INDICATOR} IS TRYING TO TELL YOU",
        "examples": ["WHAT YOUR BODY IS TRYING TO TELL YOU", "WHAT YOUR TONGUE REVEALS ABOUT YOUR HEALTH"],
        "variables": {
            "INDICATOR": ["body", "tongue", "skin", "nails", "eyes", "sleep patterns", "cravings"]
        },
        "hook_type": "curiosity"
    },
    {
        "pattern": "STOP DOING THIS IF YOU WANT {OUTCOME}",
        "examples": ["STOP DOING THIS IF YOU WANT BETTER SLEEP"],
        "variables": {
            "OUTCOME": ["better sleep", "more energy", "clear skin", "a healthy gut", 
                        "to lose weight", "mental clarity", "to age slower"]
        },
        "hook_type": "control"
    },
    {
        "pattern": "{ADJECTIVE} TRUTHS ABOUT {TOPIC}",
        "examples": ["8 HARSH TRUTHS", "SHOCKING TRUTHS ABOUT YOUR HEALTH"],
        "variables": {
            "ADJECTIVE": ["harsh", "shocking", "strange", "uncomfortable", "brutal"],
            "TOPIC": ["life", "your health", "success", "aging", "relationships", "self-improvement"]
        },
        "hook_type": "curiosity"
    },
    {
        "pattern": "THESE {PEOPLE} AGE FASTER THAN EVERYONE ELSE",
        "examples": ["THESE MEN AGE FASTER THAN EVERYONE ELSE"],
        "variables": {
            "PEOPLE": ["men", "women", "people", "busy professionals", "night owls", "desk workers"]
        },
        "hook_type": "fear"
    },
    {
        "pattern": "EAT THIS IF YOU ARE {CONDITION}",
        "examples": ["EAT THIS IF YOU ARE SICK", "EAT THIS IF YOU'RE TIRED"],
        "variables": {
            "CONDITION": ["sick", "tired", "stressed", "bloated", "inflamed", "anxious", "exhausted"]
        },
        "hook_type": "control"
    },
    {
        "pattern": "DO THESE {NUMBER} HABITS IF YOU WANT TO {GOAL}",
        "examples": ["DO THESE 10 HABITS IF YOU WANT TO STILL WALK AT 80"],
        "variables": {
            "NUMBER": ["5", "7", "8", "10", "12"],
            "GOAL": ["still walk at 80", "age gracefully", "boost your metabolism", 
                     "sleep like a baby", "have unlimited energy"]
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
        "description": "Minimalist, punchy, list-based. Habit — Consequence OR Symptom — Meaning",
        "structure": "{subject} — {explanation}",
        "word_limit": 8,
        "example_structure": "Cold hands — Iron deficiency",
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
        "example_structure": "If you eat 1 kiwi every morning for a week, your digestion will smooth out.",
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
        "example_structure": "Skipping sunlight daily — May lead to low vitamin D and low mood.",
        "rules": [
            "Action leads to outcome",
            "No explanations beyond one clause",
            "Maximum 15 words per line"
        ]
    },
    "PURE_LIST": {
        "description": "One idea per line. No explanations longer than one clause",
        "structure": "{symptom/condition} → {food/remedy}",
        "word_limit": 6,
        "example_structure": "Fever → Coconut water",
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
        "triggers": ["damage", "disease", "aging", "mistakes", "destruction", "silent killers"],
        "language": ["destroying", "damaging", "silently", "never ignore", "warning", "dangerous"],
        "intensity": "high"
    },
    "curiosity": {
        "triggers": ["strange signs", "unknown facts", "hidden", "secret", "reveals", "what your body"],
        "language": ["actually", "really", "trying to tell you", "reveals", "hidden meaning"],
        "intensity": "medium"
    },
    "authority": {
        "triggers": ["doctors", "experts", "science", "research", "studies"],
        "language": ["doctors don't want", "experts hide", "science proves", "research shows"],
        "intensity": "high"
    },
    "control": {
        "triggers": ["simple actions", "daily habits", "easy steps", "quick fix"],
        "language": ["just do this", "try this for", "eat this", "stop doing", "start today"],
        "intensity": "low"
    },
    "hope": {
        "triggers": ["reversal", "improvement", "prevention", "healing", "recovery"],
        "language": ["will improve", "can reverse", "supports", "strengthens", "prevents"],
        "intensity": "medium"
    }
}


# ============================================================
# TOPIC BUCKETS - Safe health categories
# ============================================================

TOPIC_BUCKETS: List[str] = [
    "gut health",
    "sleep optimization", 
    "nutrition and food",
    "aging and longevity",
    "body signals and warnings",
    "daily habits",
    "mental strength and mindset",
    "stress and nervous system",
    "energy and metabolism",
    "hydration and electrolytes",
    "inflammation and immunity",
    "hormone balance",
    "brain health and memory",
    "detoxification",
    "heart and cardiovascular",
    "nutritional deficiencies"
]


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
        hook_hint: Optional[str] = None
    ) -> PatternSelection:
        """
        Select patterns for content generation.
        Ensures variety and avoids repetition.
        """
        # Select topic - avoid recent
        topic = self._select_topic(topic_hint)
        
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
    
    def _select_topic(self, hint: Optional[str] = None) -> str:
        """Select topic, avoiding recent ones."""
        if hint and hint in TOPIC_BUCKETS:
            return hint
        
        available = [t for t in TOPIC_BUCKETS if t not in self._recent_topics[-3:]]
        if not available:
            available = TOPIC_BUCKETS
        
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
