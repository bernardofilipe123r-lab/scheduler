"""
Toby Learning Engine — multi-armed bandit for strategy selection.

Supports both epsilon-greedy and Thompson Sampling selection modes.
Tracks performance per strategy dimension (personality, topic, hook, etc.)
separately for reels and carousels (posts).

Features:
  - Thompson Sampling via Beta distributions (Phase A1)
  - Experiment timeout after 21 days (E6 fix)
  - Single-option experiment guard (J4 fix)
  - Tie-breaking by sample_count (E2 fix)
  - Cross-brand cold-start fallback (Phase C)
  - Per-brand explore ratio (H5)
"""
import random
import uuid
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass, field
from typing import Optional
from sqlalchemy.orm import Session
from app.models.toby import TobyStrategyScore, TobyExperiment, TobyActivityLog


# ── Experiment timeout (E6) ──
EXPERIMENT_TIMEOUT_DAYS = 21

# ── Cold-start threshold (Phase C) ──
COLD_START_THRESHOLD = 5


# Default personality pools per content type
REEL_PERSONALITIES = {
    "edu_calm":  "You are a calm, knowledgeable health educator. Use clear, evidence-based language. Avoid hype.",
    "provoc":    "You challenge common health myths with surprising facts. Use bold, attention-grabbing language.",
    "story":     "Frame every health tip as a mini-story. Use 'Imagine...', 'What if...', personal anecdotes.",
    "data":      "Lead with specific numbers and statistics. '73% of people...', 'Studies show that...'.",
    "urgent":    "Create a sense of urgency around health changes. 'Stop doing this TODAY', 'Your gut is screaming'.",
}

POST_PERSONALITIES = {
    "deep_edu":   "Create thorough, well-structured educational content with clear slide progression.",
    "myth_bust":  "Structure each carousel as debunking a common belief, with evidence on each slide.",
    "listicle":   "Create numbered lists of tips, foods, habits. Each slide = one item.",
    "compare":    "'This vs That' format. Compare foods, habits, routines side-by-side.",
    "protocol":   "Step-by-step guides and daily protocols. Actionable and specific.",
}

HOOK_STRATEGIES = ["question", "myth_buster", "shocking_stat", "personal_story", "bold_claim"]

# ─────────────────────────────────────────────────────────────────────────────
# CAROUSEL TITLE FORMAT POOL — 40 distinct structural patterns
#
# Each entry maps a format_id → { "template": str, "instruction": str }
# The template uses [X], [Y], [Z] as fill-in slots for DeepSeek.
# The instruction tells DeepSeek EXACTLY how to follow the template.
#
# These are injected into the prompt as a HARD CONSTRAINT so DeepSeek cannot
# freely choose a structure — it must fill in the slots of the given template.
# ─────────────────────────────────────────────────────────────────────────────
CAROUSEL_TITLE_TEMPLATES = {
    # HOW-CAN patterns
    "how_specific_x_supports_y": {
        "template": "HOW A SPECIFIC TYPE OF [X] CAN [VERB] YOUR [Y]",
        "instruction": "Fill in [X] with a specific practice/food/habit, [VERB] with an active verb (improve, boost, protect, regulate, reset), [Y] with a body system or outcome. Example: HOW A SPECIFIC TYPE OF BREATHING CAN REGULATE YOUR STRESS HORMONES",
    },
    "how_x_directly_affects_y": {
        "template": "HOW [X] DIRECTLY AFFECTS YOUR [Y] ACCORDING TO NEW RESEARCH",
        "instruction": "Fill in [X] with a food/habit/nutrient, [Y] with a health outcome or body system. Example: HOW MAGNESIUM DIRECTLY AFFECTS YOUR SLEEP QUALITY ACCORDING TO NEW RESEARCH",
    },
    "how_x_reshapes_y": {
        "template": "HOW [X] PHYSICALLY RESHAPES YOUR [Y] OVER TIME",
        "instruction": "Fill in [X] with a lifestyle habit or nutrient, [Y] with a specific organ or system. Example: HOW INTERMITTENT FASTING PHYSICALLY RESHAPES YOUR MITOCHONDRIA OVER TIME",
    },
    "how_x_in_y_changes_z": {
        "template": "HOW [X] IN YOUR [Y] IS CHANGING YOUR [Z]",
        "instruction": "Fill in [X] with a substance/compound, [Y] with where it is (gut/bloodstream/cells), [Z] with an outcome. Example: HOW LECTINS IN YOUR GUT ARE CHANGING YOUR INFLAMMATION LEVELS",
    },
    # WHY patterns
    "why_most_people_x": {
        "template": "WHY MOST PEOPLE GET [X] COMPLETELY WRONG AND WHAT TO DO INSTEAD",
        "instruction": "Fill in [X] with a common health topic or belief. Example: WHY MOST PEOPLE GET PROTEIN TIMING COMPLETELY WRONG AND WHAT TO DO INSTEAD",
    },
    "why_x_is_the_reason": {
        "template": "WHY [X] IS THE REAL REASON YOU STRUGGLE WITH [Y]",
        "instruction": "Fill in [X] with an overlooked factor, [Y] with a common health complaint. Example: WHY CORTISOL IS THE REAL REASON YOU STRUGGLE WITH BELLY FAT",
    },
    "why_doctors_miss_x": {
        "template": "WHY MOST DOCTORS STILL MISS THE CONNECTION BETWEEN [X] AND [Y]",
        "instruction": "Fill in [X] and [Y] with two connected health topics. Example: WHY MOST DOCTORS STILL MISS THE CONNECTION BETWEEN GUT HEALTH AND SKIN INFLAMMATION",
    },
    "why_your_x_is_lying": {
        "template": "WHY YOUR [X] IS LYING TO YOU ABOUT [Y]",
        "instruction": "Fill in [X] with a common health metric/tool, [Y] with what it misrepresents. Example: WHY YOUR CALORIE COUNT IS LYING TO YOU ABOUT METABOLIC HEALTH",
    },
    # STUDY / RESEARCH patterns
    "study_reveals_x_does_y": {
        "template": "STUDY REVEALS [X] CAN [Y] WITHIN [TIMEFRAME]",
        "instruction": "Fill in [X] with a food/substance, [Y] with a specific health benefit, [TIMEFRAME] with a concrete time period. Example: STUDY REVEALS TART CHERRY CAN REDUCE INFLAMMATION WITHIN 48 HOURS",
    },
    "new_research_links_x_y": {
        "template": "NEW RESEARCH LINKS [X] DEFICIENCY TO [Y] IN OVER [N]% OF ADULTS",
        "instruction": "Fill in [X] with a nutrient, [Y] with a health condition, [N] with a percentage. Example: NEW RESEARCH LINKS VITAMIN K2 DEFICIENCY TO ARTERIAL STIFFNESS IN OVER 60% OF ADULTS",
    },
    "scientists_find_x_does_y": {
        "template": "SCIENTISTS FIND THAT [X] CONSUMPTION [VERB] YOUR [Y] FASTER THAN EXPECTED",
        "instruction": "Fill in [X] with a food or substance, [VERB] with reduces/increases/reshapes, [Y] with a measurable outcome. Example: SCIENTISTS FIND THAT POLYPHENOL CONSUMPTION RESHAPES YOUR GUT MICROBIOME FASTER THAN EXPECTED",
    },
    "research_confirms_x": {
        "template": "RESEARCH CONFIRMS THE [X] TRIGGER MOST PEOPLE OVERLOOK FOR [Y]",
        "instruction": "Fill in [X] with a type of trigger (dietary/lifestyle/hormonal), [Y] with a health outcome. Example: RESEARCH CONFIRMS THE HORMONAL TRIGGER MOST PEOPLE OVERLOOK FOR POOR SLEEP",
    },
    # THE TRUTH / HIDDEN patterns
    "hidden_truth_about_x": {
        "template": "THE HIDDEN TRUTH ABOUT [X] YOUR [SOURCE] NEVER TOLD YOU",
        "instruction": "Fill in [X] with a health topic, [SOURCE] with doctors/nutritionists/dietitians. Example: THE HIDDEN TRUTH ABOUT DIETARY FAT YOUR NUTRITIONIST NEVER TOLD YOU",
    },
    "what_x_actually_does_to_y": {
        "template": "WHAT [X] ACTUALLY DOES TO YOUR [Y] AFTER [TIMEFRAME]",
        "instruction": "Fill in [X] with a food/habit, [Y] with a body outcome, [TIMEFRAME] with a concrete time. Example: WHAT PROCESSED SUGAR ACTUALLY DOES TO YOUR DOPAMINE AFTER ONE WEEK",
    },
    "the_real_reason_x": {
        "template": "THE REAL REASON [X] IS MAKING YOUR [Y] WORSE THAN YOU THINK",
        "instruction": "Fill in [X] with a common food/habit, [Y] with a health complaint. Example: THE REAL REASON STRESS IS MAKING YOUR GUT PERMEABILITY WORSE THAN YOU THINK",
    },
    "what_nobody_tells_you_about_x": {
        "template": "WHAT NOBODY TELLS YOU ABOUT [X] AND YOUR [Y]",
        "instruction": "Fill in [X] with a supplement/food/habit, [Y] with a specific body system. Example: WHAT NOBODY TELLS YOU ABOUT COLLAGEN AND YOUR JOINT CARTILAGE",
    },
    # STOP / QUIT patterns
    "stop_doing_x_if_you_want_y": {
        "template": "STOP DOING [X] IF YOU WANT TO [Y]",
        "instruction": "Fill in [X] with a common but counterproductive habit, [Y] with a desired health outcome. Example: STOP DOING CARDIO FIRST THING IF YOU WANT TO BURN FAT EFFICIENTLY",
    },
    "you_need_to_stop_x": {
        "template": "YOU NEED TO STOP [X] IMMEDIATELY IF YOU HAVE [Y]",
        "instruction": "Fill in [X] with a common habit, [Y] with a specific health condition. Example: YOU NEED TO STOP EATING LATE AT NIGHT IMMEDIATELY IF YOU HAVE ACID REFLUX",
    },
    # BODY'S SECRET / SIGNAL patterns
    "body_signal_not_x": {
        "template": "YOUR BODY'S [ADJECTIVE] WARNING SIGN FOR [CONDITION] IS NOT [COMMON_SYMPTOM]",
        "instruction": "Fill in [ADJECTIVE] with quietest/earliest/most-missed, [CONDITION] with a deficiency or health state, [COMMON_SYMPTOM] with what people wrongly expect. Example: YOUR BODY'S EARLIEST WARNING SIGN FOR IRON DEFICIENCY IS NOT FATIGUE",
    },
    "what_your_x_reveals_about_y": {
        "template": "WHAT YOUR [X] REVEALS ABOUT YOUR [Y] THAT MOST TESTS MISS",
        "instruction": "Fill in [X] with a visible or testable body marker, [Y] with an underlying health state. Example: WHAT YOUR NAIL TEXTURE REVEALS ABOUT YOUR ZINC STATUS THAT MOST TESTS MISS",
    },
    "your_body_does_x_when": {
        "template": "YOUR BODY DOES [X] WHEN YOU [Y] AND MOST PEOPLE NEVER NOTICE",
        "instruction": "Fill in [X] with a biological process, [Y] with a common action/state. Example: YOUR BODY RELEASES ADRENALINE WHEN YOU SKIP BREAKFAST AND MOST PEOPLE NEVER NOTICE",
    },
    # THE SCIENCE patterns
    "science_of_x_and_y": {
        "template": "THE SCIENCE OF [X]: WHY [Y] IS MORE IMPORTANT THAN YOU THINK",
        "instruction": "Fill in [X] with a health mechanism, [Y] with a variable that controls it. Example: THE SCIENCE OF SLEEP CYCLES: WHY SLEEP TIMING IS MORE IMPORTANT THAN YOU THINK",
    },
    "the_link_between_x_and_y": {
        "template": "THE [ADJECTIVE] LINK BETWEEN [X] AND [Y] EXPERTS NOW AGREE ON",
        "instruction": "Fill in [ADJECTIVE] with surprising/powerful/overlooked/undeniable, [X] and [Y] with two connected factors. Example: THE SURPRISING LINK BETWEEN MORNING SUNLIGHT AND EVENING MELATONIN EXPERTS NOW AGREE ON",
    },
    # NUMBER patterns
    "n_signs_x": {
        "template": "THE [N] SIGNS YOUR [X] IS SILENTLY SIGNALING A PROBLEM",
        "instruction": "Fill in [N] with 3-7, [X] with a body system or organ. Example: THE 5 SIGNS YOUR LYMPHATIC SYSTEM IS SILENTLY SIGNALING A PROBLEM",
    },
    "n_foods_x": {
        "template": "THE [N] [TYPE] FOODS THAT [NEGATIVE_EFFECT] YOUR [BODY_SYSTEM]",
        "instruction": "Fill in [N] with 3-7, [TYPE] with common/everyday/processed, [NEGATIVE_EFFECT] with quietly damage/inflame/deplete, [BODY_SYSTEM] with specific organ or system. Example: THE 4 EVERYDAY FOODS THAT QUIETLY DEPLETE YOUR ADRENAL RESERVES",
    },
    "n_underrated_x_for_y": {
        "template": "THE [N] MOST UNDERRATED [X] FOR BETTER [Y] (BACKED BY SCIENCE)",
        "instruction": "Fill in [N] with 3-7, [X] with foods/habits/strategies, [Y] with a health outcome. Example: THE 5 MOST UNDERRATED HABITS FOR BETTER HORMONAL BALANCE (BACKED BY SCIENCE)",
    },
    # THIS IS / NOT WHAT YOU THINK patterns
    "x_is_not_what_you_think": {
        "template": "[X] IS NOT WHAT YOU THINK: THE TRUTH YOUR [Y] MISSED",
        "instruction": "Fill in [X] with a common health concept in ALL CAPS, [Y] with the source that missed it (school/doctor/diet culture). Example: METABOLIC RATE IS NOT WHAT YOU THINK: THE TRUTH YOUR DIET CULTURE MISSED",
    },
    "not_about_x_its_about_y": {
        "template": "IT'S NOT ABOUT [X]: YOUR [Y] ACTUALLY DEPENDS ON [Z]",
        "instruction": "Fill in [X] with the commonly blamed factor, [Y] with the health goal, [Z] with the actual key factor. Example: IT'S NOT ABOUT WILLPOWER: YOUR SUGAR CRAVINGS ACTUALLY DEPEND ON YOUR GUT BACTERIA",
    },
    # BEFORE YOU / IF YOU patterns
    "before_you_x": {
        "template": "BEFORE YOU [X], READ WHAT SCIENCE NOW SAYS ABOUT [Y]",
        "instruction": "Fill in [X] with a common health action (take a supplement/start a diet), [Y] with the topic. Example: BEFORE YOU TAKE VITAMIN D SUPPLEMENTS, READ WHAT SCIENCE NOW SAYS ABOUT COFACTORS",
    },
    "if_you_have_x_you_need_to_know": {
        "template": "IF YOU HAVE [SYMPTOM], THIS IS WHAT YOUR [BODY_PART] IS TRYING TO TELL YOU",
        "instruction": "Fill in [SYMPTOM] with a common complaint, [BODY_PART] with the organ involved. Example: IF YOU HAVE BRAIN FOG, THIS IS WHAT YOUR GUT-BRAIN AXIS IS TRYING TO TELL YOU",
    },
    # DATA / NUMBERS patterns  
    "x_of_adults_dont_know": {
        "template": "[N]% OF ADULTS DON'T KNOW THEIR [X] IS AT DANGEROUS LEVELS",
        "instruction": "Fill in [N] with a realistic percentage (40-80), [X] with a measurable health marker. Example: 67% OF ADULTS DON'T KNOW THEIR OMEGA-3 INDEX IS AT DANGEROUS LEVELS",
    },
    "data_shows_x_doubles_y": {
        "template": "DATA SHOWS [X] [VERB] YOUR RISK OF [Y] BY [N]%",
        "instruction": "Fill in [X] with a lifestyle factor, [VERB] with increases/doubles/reduces, [Y] with a health risk, [N] with a percentage. Example: DATA SHOWS CHRONIC SLEEP DEBT INCREASES YOUR RISK OF METABOLIC SYNDROME BY 45%",
    },
    # WHAT HAPPENS WHEN patterns
    "what_happens_when_x": {
        "template": "WHAT HAPPENS TO YOUR [BODY_SYSTEM] WHEN YOU [ACTION] FOR [TIMEFRAME]",
        "instruction": "Fill in [BODY_SYSTEM] with a specific organ/system, [ACTION] with a habit/change, [TIMEFRAME] with a time period. Example: WHAT HAPPENS TO YOUR GUT MICROBIOME WHEN YOU AVOID PROCESSED FOOD FOR 30 DAYS",
    },
    "what_x_days_of_y_does_to_z": {
        "template": "WHAT [N] DAYS OF [HABIT] DOES TO YOUR [BODY_OUTCOME]",
        "instruction": "Fill in [N] with a number of days, [HABIT] with a specific practice, [BODY_OUTCOME] with a measurable result. Example: WHAT 14 DAYS OF COLD SHOWERS DOES TO YOUR NOREPINEPHRINE LEVELS",
    },
    # MOST PEOPLE DONT patterns
    "most_people_dont_realize_x": {
        "template": "MOST PEOPLE DON'T REALIZE [X] IS AFFECTING THEIR [Y] RIGHT NOW",
        "instruction": "Fill in [X] with a common overlooked factor, [Y] with a health aspect. Example: MOST PEOPLE DON'T REALIZE ARTIFICIAL LIGHT IS AFFECTING THEIR CORTISOL RHYTHM RIGHT NOW",
    },
    "almost_nobody_talks_about_x": {
        "template": "ALMOST NOBODY TALKS ABOUT HOW [X] AFFECTS YOUR [Y]",
        "instruction": "Fill in [X] with an overlooked factor, [Y] with a health outcome. Example: ALMOST NOBODY TALKS ABOUT HOW MEAL ORDER AFFECTS YOUR BLOOD GLUCOSE RESPONSE",
    },
    # THIS SPECIFIC patterns
    "this_x_does_y_faster": {
        "template": "THIS SPECIFIC [X] [VERB] YOUR [Y] FASTER THAN ANY [ALTERNATIVE]",
        "instruction": "Fill in [X] with a habit/food type, [VERB] with repairs/restores/reduces, [Y] with a health outcome, [ALTERNATIVE] with a common alternative. Example: THIS SPECIFIC BREATHING TECHNIQUE LOWERS YOUR CORTISOL FASTER THAN ANY SUPPLEMENT",
    },
    "this_x_is_why_y": {
        "template": "THIS [X] IS EXACTLY WHY YOUR [Y] NEVER IMPROVES",
        "instruction": "Fill in [X] with a specific habit/pattern/mistake, [Y] with a health goal. Example: THIS MORNING PATTERN IS EXACTLY WHY YOUR ENERGY LEVELS NEVER IMPROVE",
    },
    # THE MISTAKE patterns
    "biggest_mistake_for_x": {
        "template": "THE BIGGEST [X] MISTAKE THAT'S QUIETLY DAMAGING YOUR [Y]",
        "instruction": "Fill in [X] with a health category (diet/sleep/exercise), [Y] with a body system. Example: THE BIGGEST HYDRATION MISTAKE THAT'S QUIETLY DAMAGING YOUR KIDNEY FUNCTION",
    },
    "experts_agree_x_is_wrong": {
        "template": "EXPERTS NOW AGREE: EVERYTHING YOU KNOW ABOUT [X] IS WRONG",
        "instruction": "Fill in [X] with a common health topic. Example: EXPERTS NOW AGREE: EVERYTHING YOU KNOW ABOUT DIETARY CHOLESTEROL IS WRONG",
    },
    # YOUR [X] IS / ISN'T patterns
    "your_x_isnt_the_problem": {
        "template": "YOUR [X] ISN'T THE PROBLEM: THE REAL CAUSE OF [Y] EXPLAINED",
        "instruction": "Fill in [X] with the commonly blamed factor, [Y] with a health issue. Example: YOUR GENETICS ISN'T THE PROBLEM: THE REAL CAUSE OF OBESITY EXPLAINED",
    },
    "your_x_needs_y": {
        "template": "YOUR [BODY_PART] DESPERATELY NEEDS [X] AND MOST PEOPLE ARE DEFICIENT",
        "instruction": "Fill in [BODY_PART] with a specific organ (liver/thyroid/adrenals/mitochondria), [X] with a nutrient or practice. Example: YOUR MITOCHONDRIA DESPERATELY NEED COENZYME Q10 AND MOST PEOPLE ARE DEFICIENT",
    },
}

# The list of format IDs used by Thompson Sampling (must match keys above)
TITLE_FORMATS = list(CAROUSEL_TITLE_TEMPLATES.keys())

VISUAL_STYLES = ["dark_cinematic", "light_clean", "vibrant_bold"]

# ── Format B personality pool (brain-per-format, Section 22) ──
FORMAT_B_PERSONALITIES = {
    "breaking_news":  "You report just-happened stories with urgency. 'BREAKING:', timely, factual, impactful.",
    "power_moves":    "You narrate bold business and wealth decisions. Confident, awed tone. 'He just sold...'",
    "controversy":    "You present provocative takes and public debates. Two-sided, dramatic. 'Here's what no one is saying...'",
    "underdog":       "You tell surprising success stories from underdogs. Inspirational, 'Nobody expected this...'",
    "mind_blowing":   "You reveal shocking facts and statistics. 'This number will change how you think about...'",
}

FORMAT_B_HOOKS = ["breaking_hook", "statistic_lead", "name_drop", "controversy_opener", "prediction"]

FORMAT_B_TITLE_FORMATS = ["name_action", "shocking_number", "versus_outcome", "one_word_punch", "question_reveal"]

FORMAT_B_VISUAL_STYLES = ["news_dramatic", "cinematic_epic", "minimal_stark"]

FORMAT_B_STORY_CATEGORIES = [
    "power_moves", "controversy", "underdog", "prediction", "shocking_stat",
    "human_moment", "industry_shift", "failed_bet", "hidden_cost", "scientific_breakthrough",
]


@dataclass
class StrategyChoice:
    """A strategy decision made by the learning engine for one content slot."""
    personality: str
    topic_bucket: str
    hook_strategy: str
    title_format: str
    visual_style: str
    story_category: Optional[str] = None
    is_experiment: bool = False
    experiment_id: Optional[str] = None
    used_fallback: bool = False


def get_personality_prompt(content_type: str, personality_id: str) -> str:
    """Get the system prompt modifier for a personality."""
    if content_type == "format_b_reel":
        pool = FORMAT_B_PERSONALITIES
    elif content_type == "reel":
        pool = REEL_PERSONALITIES
    else:
        pool = POST_PERSONALITIES
    return pool.get(personality_id, "")


def choose_strategy(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    explore_ratio: float = 0.30,
    available_topics: list[str] = None,
    use_thompson: bool = True,
    content_dna_id: str = None,
) -> StrategyChoice:
    """
    Choose a strategy for the next content piece.

    Supports Thompson Sampling (default) or epsilon-greedy selection.
    Learning is DNA-scoped: keyed by (user_id, content_dna_id, content_type).
    Brands are publishing vehicles — brands in the same DNA pool learning.
    """
    # Resolve DNA from brand if not provided
    if not content_dna_id and brand_id:
        from app.services.content.content_dna_service import get_content_dna_service
        content_dna_id = get_content_dna_service().get_dna_id_for_brand(brand_id, db)

    # H5: Per-DNA dynamic explore ratio based on DNA's data maturity
    effective_explore = _get_effective_explore_ratio(
        db, user_id, content_dna_id, content_type, explore_ratio
    )
    is_explore = random.random() < effective_explore

    # Brain-per-format: route to correct pools based on content_type
    if content_type == "format_b_reel":
        personality_pool = list(FORMAT_B_PERSONALITIES.keys())
        hooks = FORMAT_B_HOOKS
        titles = FORMAT_B_TITLE_FORMATS
        visuals = FORMAT_B_VISUAL_STYLES
    elif content_type == "reel":
        personality_pool = list(REEL_PERSONALITIES.keys())
        hooks = HOOK_STRATEGIES
        titles = TITLE_FORMATS
        visuals = VISUAL_STYLES
    else:
        personality_pool = list(POST_PERSONALITIES.keys())
        hooks = HOOK_STRATEGIES
        titles = TITLE_FORMATS
        visuals = VISUAL_STYLES

    personality = _pick_dimension(
        db, user_id, content_dna_id, content_type, "personality",
        personality_pool,
        is_explore, use_thompson,
    )

    topics = available_topics or ["general"]
    topic = _pick_dimension(
        db, user_id, content_dna_id, content_type, "topic",
        topics, is_explore, use_thompson,
    )

    hook = _pick_dimension(
        db, user_id, content_dna_id, content_type, "hook",
        hooks, is_explore, use_thompson,
    )

    title_fmt = _pick_dimension(
        db, user_id, content_dna_id, content_type, "title_format",
        titles, is_explore, use_thompson,
    )

    visual = _pick_dimension(
        db, user_id, content_dna_id, content_type, "visual_style",
        visuals, is_explore, use_thompson,
    )

    # Format B also picks story_category via Thompson Sampling
    story_category = None
    if content_type == "format_b_reel":
        story_category = _pick_dimension(
            db, user_id, content_dna_id, content_type, "story_category",
            FORMAT_B_STORY_CATEGORIES, is_explore, use_thompson,
        )

    # Check for an active experiment and link to it
    experiment_id = None
    active_exp = (
        db.query(TobyExperiment)
        .filter(
            TobyExperiment.user_id == user_id,
            TobyExperiment.content_type == content_type,
            TobyExperiment.status == "active",
        )
        .first()
    )
    if active_exp:
        experiment_id = active_exp.id

    return StrategyChoice(
        personality=personality,
        topic_bucket=topic,
        hook_strategy=hook,
        title_format=title_fmt,
        visual_style=visual,
        story_category=story_category,
        is_experiment=is_explore,
        experiment_id=experiment_id,
    )


def _get_effective_explore_ratio(
    db: Session,
    user_id: str,
    content_dna_id: str,
    content_type: str,
    base_ratio: float,
) -> float:
    """H5: Compute effective explore ratio based on DNA's data maturity.

    Counts scored posts across ALL brands sharing the same DNA,
    since learning is pooled at the DNA level.
    """
    from app.models.analytics import PostPerformance
    from app.models.brands import Brand

    if not content_dna_id:
        return base_ratio

    # Get all brand IDs that share this DNA
    brand_ids = [
        b.id for b in
        db.query(Brand.id).filter(Brand.content_dna_id == content_dna_id).all()
    ]
    if not brand_ids:
        return 1.0

    count = (
        db.query(PostPerformance)
        .filter(
            PostPerformance.brand.in_(brand_ids),
            PostPerformance.performance_score.isnot(None),
        )
        .count()
    )

    if count == 0:
        return 1.0  # Pure exploration for brand-new DNAs
    elif count < 5:
        return 0.80
    elif count < COLD_START_THRESHOLD:
        return 0.50
    else:
        return base_ratio


def update_strategy_score(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    dimension: str,
    option_value: str,
    score: float,
    weight: float = 1.0,
    content_dna_id: str = None,
):
    """Update running aggregates for a strategy option after scoring.

    Phase 2: Supports weighted Bayesian updates.
    Learning is DNA-scoped: keyed by (user_id, content_dna_id, content_type).
    weight=0.6 for 48h preliminary scores (less reliable)
    weight=1.0 for 7d final scores (full confidence)
    """
    # Resolve DNA from brand if not provided
    if not content_dna_id and brand_id:
        from app.services.content.content_dna_service import get_content_dna_service
        content_dna_id = get_content_dna_service().get_dna_id_for_brand(brand_id, db)

    existing = (
        db.query(TobyStrategyScore)
        .filter(
            TobyStrategyScore.user_id == user_id,
            TobyStrategyScore.content_dna_id == content_dna_id,
            TobyStrategyScore.content_type == content_type,
            TobyStrategyScore.dimension == dimension,
            TobyStrategyScore.option_value == option_value,
        )
        .first()
    )

    if not existing:
        try:
            nested = db.begin_nested()
            existing = TobyStrategyScore(
                id=str(uuid.uuid4()),
                user_id=user_id,
                brand_id=brand_id,
                content_dna_id=content_dna_id,
                content_type=content_type,
                dimension=dimension,
                option_value=option_value,
                sample_count=0,
                total_score=0,
                avg_score=0,
                score_variance=0,
                best_score=0,
                worst_score=100,
                weighted_total=0,
                weight_sum=0,
                alpha=1.0,
                beta_param=1.0,
                recent_scores=[],
            )
            db.add(existing)
            db.flush()
        except Exception:
            nested.rollback()
            # Row already exists (unique constraint) — re-fetch
            existing = (
                db.query(TobyStrategyScore)
                .filter(
                    TobyStrategyScore.user_id == user_id,
                    TobyStrategyScore.content_dna_id == content_dna_id,
                    TobyStrategyScore.content_type == content_type,
                    TobyStrategyScore.dimension == dimension,
                    TobyStrategyScore.option_value == option_value,
                )
                .first()
            )
            if not existing:
                return

    # Ensure fields aren't NULL (fix corrupt pre-existing rows)
    if existing.sample_count is None:
        existing.sample_count = 0
    if existing.total_score is None:
        existing.total_score = 0
    if existing.best_score is None:
        existing.best_score = 0
    if existing.worst_score is None:
        existing.worst_score = 100
    if existing.score_variance is None:
        existing.score_variance = 0

    existing.sample_count += 1
    existing.total_score += score
    existing.avg_score = existing.total_score / existing.sample_count

    # Phase 2: Weighted Bayesian update
    existing.weighted_total = (existing.weighted_total or 0) + score * weight
    existing.weight_sum = (existing.weight_sum or 0) + weight
    # Weighted average is more accurate than simple average when weights differ
    if existing.weight_sum > 0:
        existing.avg_score = existing.weighted_total / existing.weight_sum

    # Phase 2: Update Beta distribution parameters for Thompson Sampling
    # Normalize score to [0, 1] range (scores range ~40-100)
    normalized = max(0.0, min(1.0, (score - 40) / 60.0))
    existing.alpha = (existing.alpha or 1.0) + normalized * weight
    existing.beta_param = (existing.beta_param or 1.0) + (1 - normalized) * weight

    if score > existing.best_score:
        existing.best_score = score
    if score < existing.worst_score:
        existing.worst_score = score

    # Update variance (Welford's online algorithm simplified)
    if existing.sample_count > 1:
        diff = score - existing.avg_score
        existing.score_variance = (
            existing.score_variance * (existing.sample_count - 2) / (existing.sample_count - 1)
            + diff * diff / existing.sample_count
        )

    # Rolling window of last 10 scores
    recent = list(existing.recent_scores or [])
    recent.append(score)
    existing.recent_scores = recent[-10:]
    existing.updated_at = datetime.now(timezone.utc)


def correct_preliminary_score(
    db: Session,
    user_id: str,
    brand_id: str,
    content_type: str,
    tag,
    final_score: float,
    content_dna_id: str = None,
):
    """Phase 2: Correct strategy scores when 7d final score replaces 48h preliminary.

    Subtracts the preliminary weight (0.6) and adds the final weight (1.0).
    Learning is DNA-scoped.
    """
    if not tag.preliminary_score:
        return  # No preliminary to correct

    # Resolve DNA from brand if not provided
    if not content_dna_id and brand_id:
        from app.services.content.content_dna_service import get_content_dna_service
        content_dna_id = get_content_dna_service().get_dna_id_for_brand(brand_id, db)

    # Prefer tag's own content_dna_id (recorded at creation time)
    tag_dna_id = getattr(tag, 'content_dna_id', None) or content_dna_id

    preliminary = tag.preliminary_score
    PRELIMINARY_WEIGHT = 0.6
    FINAL_WEIGHT = 1.0

    for dim, val in [
        ("personality", tag.personality),
        ("topic", tag.topic_bucket),
        ("hook", tag.hook_strategy),
        ("title_format", tag.title_format),
        ("visual_style", tag.visual_style),
    ]:
        if not val:
            continue

        existing = (
            db.query(TobyStrategyScore)
            .filter(
                TobyStrategyScore.user_id == user_id,
                TobyStrategyScore.content_dna_id == tag_dna_id,
                TobyStrategyScore.content_type == content_type,
                TobyStrategyScore.dimension == dim,
                TobyStrategyScore.option_value == val,
            )
            .first()
        )
        if not existing:
            continue

        # Undo preliminary contribution
        existing.weighted_total = (existing.weighted_total or 0) - preliminary * PRELIMINARY_WEIGHT
        existing.weight_sum = (existing.weight_sum or 0) - PRELIMINARY_WEIGHT

        # Add final contribution
        existing.weighted_total += final_score * FINAL_WEIGHT
        existing.weight_sum += FINAL_WEIGHT

        if existing.weight_sum > 0:
            existing.avg_score = existing.weighted_total / existing.weight_sum

        # Correct Beta distribution params
        old_norm = max(0.0, min(1.0, (preliminary - 40) / 60.0))
        new_norm = max(0.0, min(1.0, (final_score - 40) / 60.0))
        existing.alpha = max(1.0, (existing.alpha or 1.0) - old_norm * PRELIMINARY_WEIGHT + new_norm * FINAL_WEIGHT)
        existing.beta_param = max(1.0, (existing.beta_param or 1.0) - (1 - old_norm) * PRELIMINARY_WEIGHT + (1 - new_norm) * FINAL_WEIGHT)


def update_experiment_results(
    db: Session,
    user_id: str,
    content_type: str,
    dimension: str,
    option_value: str,
    score: float,
):
    """Update an active experiment with a new score for an option."""
    exp = (
        db.query(TobyExperiment)
        .filter(
            TobyExperiment.user_id == user_id,
            TobyExperiment.content_type == content_type,
            TobyExperiment.dimension == dimension,
            TobyExperiment.status == "active",
        )
        .first()
    )
    if not exp:
        return

    results = dict(exp.results or {})
    if option_value not in results:
        results[option_value] = {"count": 0, "total_score": 0, "avg_score": 0, "scores": []}

    entry = results[option_value]
    entry["count"] += 1
    entry["total_score"] += score
    entry["avg_score"] = entry["total_score"] / entry["count"]
    entry["scores"].append(round(score, 1))
    results[option_value] = entry
    exp.results = results

    # Check if experiment can be completed
    options = exp.options or []
    all_sufficient = all(
        results.get(opt, {}).get("count", 0) >= exp.min_samples
        for opt in options
    )
    if all_sufficient and len(options) > 1:
        # Find winner by highest avg_score
        best_opt = max(options, key=lambda o: results.get(o, {}).get("avg_score", 0))
        exp.winner = best_opt
        exp.status = "completed"
        exp.completed_at = datetime.now(timezone.utc)

        best_avg = results[best_opt]["avg_score"]
        _log(db, user_id, "experiment_completed",
             f"Experiment completed: '{best_opt}' wins for {dimension} ({content_type}) with avg score {best_avg:.1f}",
             level="success",
             metadata={"dimension": dimension, "winner": best_opt, "results": results})


def check_experiment_timeouts(db: Session, user_id: str) -> int:
    """E6 fix: Force-complete stalled experiments after EXPERIMENT_TIMEOUT_DAYS."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=EXPERIMENT_TIMEOUT_DAYS)
    stale = (
        db.query(TobyExperiment)
        .filter(
            TobyExperiment.user_id == user_id,
            TobyExperiment.status == "active",
            TobyExperiment.started_at <= cutoff,
        )
        .all()
    )

    timed_out = 0
    for exp in stale:
        results = exp.results or {}
        best_opt = None
        best_avg = -1
        for opt in (exp.options or []):
            opt_data = results.get(opt, {})
            avg = opt_data.get("avg_score", 0)
            count = opt_data.get("count", 0)
            if avg > best_avg or (avg == best_avg and count > 0):
                best_avg = avg
                best_opt = opt

        exp.status = "completed"
        exp.winner = best_opt
        exp.completed_at = datetime.now(timezone.utc)

        _log(db, user_id, "experiment_timeout",
             f"Experiment timed out after {EXPERIMENT_TIMEOUT_DAYS} days: "
             f"'{best_opt}' declared winner for {exp.dimension} ({exp.content_type})",
             level="warning",
             metadata={
                 "dimension": exp.dimension,
                 "winner": best_opt,
                 "results": results,
                 "timeout_days": EXPERIMENT_TIMEOUT_DAYS,
             })
        timed_out += 1

    return timed_out


def create_experiment(
    db: Session,
    user_id: str,
    content_type: str,
    dimension: str,
    options: list[str],
    min_samples: int = 5,
) -> Optional[TobyExperiment]:
    """Create a new A/B experiment for a dimension if none is active.

    J4 fix: Requires at least 2 options to create a valid experiment.
    """
    # J4 guard: single-option experiments can never conclude
    if len(options) < 2:
        return None

    existing = (
        db.query(TobyExperiment)
        .filter(
            TobyExperiment.user_id == user_id,
            TobyExperiment.content_type == content_type,
            TobyExperiment.dimension == dimension,
            TobyExperiment.status == "active",
        )
        .first()
    )
    if existing:
        return None

    exp = TobyExperiment(
        id=str(uuid.uuid4()),
        user_id=user_id,
        content_type=content_type,
        dimension=dimension,
        options=options,
        results={},
        status="active",
        min_samples=min_samples,
        started_at=datetime.now(timezone.utc),
    )
    db.add(exp)

    _log(db, user_id, "experiment_started",
         f"Started {dimension} experiment for {content_type}s: {options}",
         level="info",
         metadata={"dimension": dimension, "content_type": content_type, "options": options})

    return exp


# Phase 3: Temporal decay halflife
DECAY_HALFLIFE_DAYS = 30


def get_insights(db: Session, user_id: str) -> dict:
    """Get aggregated insights: best topics, hooks, personalities per content type.

    Phase 2: Includes Bayesian confidence intervals from Beta distribution.
    """
    scores = (
        db.query(TobyStrategyScore)
        .filter(TobyStrategyScore.user_id == user_id, TobyStrategyScore.sample_count > 0)
        .all()
    )

    insights = {"reel": {}, "post": {}}
    for s in scores:
        ct = s.content_type
        if ct not in insights:
            continue
        dim = s.dimension
        if dim not in insights[ct]:
            insights[ct][dim] = []

        # Phase 2: Bayesian confidence interval from Beta distribution
        alpha = getattr(s, 'alpha', None) or 1.0
        beta_p = getattr(s, 'beta_param', None) or 1.0
        # Beta mean = alpha / (alpha + beta)
        beta_mean = alpha / (alpha + beta_p) if (alpha + beta_p) > 0 else 0.5
        # Beta standard deviation for confidence interval
        total_ab = alpha + beta_p
        beta_std = (alpha * beta_p / (total_ab * total_ab * (total_ab + 1))) ** 0.5 if total_ab > 1 else 0.25
        # 95% confidence interval (approx 2*std)
        ci_low = max(0, beta_mean - 2 * beta_std)
        ci_high = min(1, beta_mean + 2 * beta_std)

        insights[ct][dim].append({
            "option": s.option_value,
            "avg_score": round(s.avg_score, 1),
            "sample_count": s.sample_count,
            "best_score": round(s.best_score, 1),
            "recent_trend": s.recent_scores,
            "confidence_low": round(ci_low * 100, 1),
            "confidence_high": round(ci_high * 100, 1),
            "beta_mean": round(beta_mean * 100, 1),
        })

    # Sort each dimension by avg_score descending
    for ct in insights:
        for dim in insights[ct]:
            insights[ct][dim].sort(key=lambda x: x["avg_score"], reverse=True)

    return insights


def _thompson_sample(avg_score: float, sample_count: int, alpha: float = None, beta_param: float = None) -> float:
    """Phase A1 / v3: Sample from a Beta distribution for Thompson Sampling.

    Phase 2: Uses stored alpha/beta_param when available for proper Bayesian
    posterior sampling. Falls back to derived params from avg_score/sample_count.
    """
    try:
        import numpy as np
        # Phase 2: Use stored Beta params if available
        if alpha is not None and beta_param is not None and alpha > 0 and beta_param > 0:
            return float(np.random.beta(alpha, beta_param))
        # Fallback: derive from avg_score and sample_count
        p = max(0.01, min(0.99, avg_score / 100.0))
        effective_n = min(sample_count, 50)
        a = max(1.0, effective_n * p)
        b = max(1.0, effective_n * (1 - p))
        return float(np.random.beta(a, b))
    except ImportError:
        if alpha is not None and beta_param is not None and alpha > 0 and beta_param > 0:
            return random.betavariate(alpha, beta_param)
        p = max(0.01, min(0.99, avg_score / 100.0))
        a = max(1.0, min(sample_count, 50) * p)
        b = max(1.0, min(sample_count, 50) * (1 - p))
        return random.betavariate(a, b)


def _pick_dimension(
    db: Session,
    user_id: str,
    content_dna_id: str,
    content_type: str,
    dimension: str,
    options: list[str],
    is_explore: bool,
    use_thompson: bool = True,
) -> str:
    """Pick an option for a dimension using Thompson Sampling or epsilon-greedy.

    Scoped by content_dna_id — all brands sharing a DNA pool their learning.
    """
    if not options:
        return "general"

    if is_explore and not use_thompson:
        # Pure epsilon-greedy explore: random choice
        return random.choice(options)

    # Get all scores for this dimension, scoped to this DNA
    filters = [
        TobyStrategyScore.user_id == user_id,
        TobyStrategyScore.content_type == content_type,
        TobyStrategyScore.dimension == dimension,
        TobyStrategyScore.sample_count > 0,
    ]
    if content_dna_id:
        filters.append(TobyStrategyScore.content_dna_id == content_dna_id)

    all_scores = db.query(TobyStrategyScore).filter(*filters).all()

    # Build map of option -> score record (only valid current options)
    score_map = {}
    for s in all_scores:
        if s.option_value in options:
            score_map[s.option_value] = s

    if not score_map:
        # Phase C: Cross-DNA cold-start fallback — check user-level scores with no DNA
        if content_dna_id:
            cross_dna = (
                db.query(TobyStrategyScore)
                .filter(
                    TobyStrategyScore.user_id == user_id,
                    TobyStrategyScore.content_dna_id.is_(None),
                    TobyStrategyScore.content_type == content_type,
                    TobyStrategyScore.dimension == dimension,
                    TobyStrategyScore.sample_count > 0,
                )
                .all()
            )
            for s in cross_dna:
                if s.option_value in options:
                    score_map[s.option_value] = s

        if not score_map:
            return random.choice(options)

    if use_thompson:
        # Thompson Sampling: draw from Beta distribution for each option
        samples = {}
        for opt in options:
            if opt in score_map:
                rec = score_map[opt]
                samples[opt] = _thompson_sample(
                    rec.avg_score, rec.sample_count,
                    alpha=getattr(rec, 'alpha', None),
                    beta_param=getattr(rec, 'beta_param', None),
                )
            else:
                # Uninformed prior: uniform Beta(1,1)
                samples[opt] = random.betavariate(1.0, 1.0)
        return max(samples, key=samples.get)
    else:
        # Epsilon-greedy exploit with E2 tie-breaking by sample_count
        best_options = sorted(
            score_map.values(),
            key=lambda s: (s.avg_score, s.sample_count),
            reverse=True,
        )

        if best_options:
            top_score = best_options[0].avg_score
            tied = [s for s in best_options if abs(s.avg_score - top_score) < 0.01]
            if len(tied) > 1:
                tied.sort(key=lambda s: s.sample_count, reverse=True)
                chosen = tied[0] if tied[0].sample_count != tied[1].sample_count else random.choice(tied)
            else:
                chosen = tied[0]

            if chosen.option_value in options:
                return chosen.option_value

        return random.choice(options)


# ── Max arms per experiment ──
MAX_EXPERIMENT_ARMS = 8


def _log(db, user_id, action_type, description, level="info", metadata=None):
    db.add(TobyActivityLog(
        user_id=user_id,
        action_type=action_type,
        description=description,
        action_metadata=metadata,
        level=level,
        created_at=datetime.now(timezone.utc),
    ))


def add_option_to_experiment(
    db: Session,
    user_id: str,
    dimension: str,
    new_option: str,
    content_type: str = "reel",
) -> bool:
    """Add a new option to an active experiment for the given dimension.

    Gap 2: Called by discovery_manager when trending hashtags are found.
    Appends the new option with a prior score equal to the current
    experiment mean (fair cold-start). Skips if already present or
    experiment already has MAX_EXPERIMENT_ARMS.

    Returns True if the option was added.
    """
    exp = (
        db.query(TobyExperiment)
        .filter(
            TobyExperiment.user_id == user_id,
            TobyExperiment.content_type == content_type,
            TobyExperiment.dimension == dimension,
            TobyExperiment.status == "active",
        )
        .first()
    )
    if not exp:
        return False

    options = list(exp.options or [])

    # Already present
    if new_option in options:
        return False

    # Guard: max arms
    if len(options) >= MAX_EXPERIMENT_ARMS:
        return False

    # Compute current experiment mean for cold-start prior
    results = dict(exp.results or {})
    all_avgs = [r.get("avg_score", 0) for r in results.values() if r.get("count", 0) > 0]
    mean_score = sum(all_avgs) / len(all_avgs) if all_avgs else 0

    # Append new option
    options.append(new_option)
    exp.options = options

    # Initialize results entry with cold-start prior
    results[new_option] = {"count": 0, "total_score": 0, "avg_score": mean_score, "scores": []}
    exp.results = results

    _log(db, user_id, "experiment_arm_added",
         f"Added '{new_option}' to {dimension} experiment ({content_type}) — "
         f"cold-start prior {mean_score:.1f}, now {len(options)} arms",
         level="info",
         metadata={"dimension": dimension, "new_option": new_option, "total_arms": len(options)})

    return True
