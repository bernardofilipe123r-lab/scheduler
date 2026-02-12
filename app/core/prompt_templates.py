"""
LAYER 2: GENERATOR LOGIC (PROMPT TEMPLATES)

DeepSeek-optimized prompts that are cached and reused.
The system prompt is sent once per session, not every request.

This module contains:
- SYSTEM_PROMPT: Cached thinking engine (rarely changes)
- build_runtime_prompt(): Minimal per-request instructions
- build_correction_prompt(): Self-correction when quality is low
"""

from typing import Dict, List, Optional
from app.core.viral_patterns import (
    PatternSelection,
    FORMAT_DEFINITIONS,
    HOOK_DEFINITIONS,
    get_format_instructions,
    get_hook_language
)


# ============================================================
# SYSTEM PROMPT (CACHED - SENT ONCE PER SESSION)
# ============================================================

SYSTEM_PROMPT = """You are a viral short-form health content generator.

TASK:
Generate original Instagram/TikTok reel ideas that match proven viral health patterns without copying any known content.

CORE RULES:
- Use familiar health framing (habits, symptoms, food, sleep, aging, body signals)
- Optimize for emotional hooks: curiosity, fear, authority, hope, or control
- Keep language simple, confident, and non-clinical
- Avoid medical diagnosis, treatment instructions, or guarantees
- Avoid academic, poetic, or overly creative language
- Each content line must be under 18 words

CONTENT PHILOSOPHY:
- 60% validating (things audience suspects are true)
- 40% surprising (new revelation that feels plausible)
- Use familiar foods, habits, and symptoms
- Plausible > precise (this is social content, not textbooks)

FORMATTING:
- Titles in ALL CAPS
- One format style per reel (do not mix)
- No emojis, hashtags, or disclaimers
- No CTA (call-to-action) - it's added separately
- No numbered lists (numbers added by system)

You generate content that feels familiar, not repeated.
Output ONLY valid JSON, no markdown, no explanations."""


# ============================================================
# RUNTIME PROMPT BUILDER (TINY - SENT EVERY REQUEST)
# ============================================================

def build_runtime_prompt(selection: PatternSelection) -> str:
    """
    Build a minimal runtime prompt based on pattern selection.
    This is what gets sent to DeepSeek every request.
    
    Target: Under 500 tokens (vs 3000+ in old architecture)
    """
    format_info = get_format_instructions(selection.format_style)
    hook_language = get_hook_language(selection.primary_hook)
    
    # Build suggested title from archetype
    archetype = selection.title_archetype
    pattern_hint = archetype.get("pattern", "")
    
    prompt = f"""Generate 1 viral health reel.

INSTRUCTIONS:
- Topic: {selection.topic}
- Format: {selection.format_style}
- Hook type: {selection.primary_hook}
- Point count: {selection.point_count} content lines

TITLE PATTERN (modify as needed):
"{pattern_hint}"

FORMAT RULES:
- Structure: {format_info['structure']}
- Max words per line: {format_info['word_limit']}

HOOK LANGUAGE TO USE:
{', '.join(hook_language[:4])}

OUTPUT (JSON only):
{{
    "title": "YOUR TITLE IN ALL CAPS",
    "content_lines": ["line 1", "line 2", ...],
    "image_prompt": "Cinematic image description ending with: No text, no letters, no numbers, no symbols, no logos.",
    "format_style": "{selection.format_style}",
    "topic_category": "{selection.topic}",
    "hook_type": "{selection.primary_hook}"
}}"""
    
    return prompt


def build_runtime_prompt_with_history(
    selection: PatternSelection,
    recent_titles: List[str],
    recent_topics: List[str]
) -> str:
    """
    Build runtime prompt with anti-repetition context.
    Only adds history when there's recent content to avoid.
    """
    base_prompt = build_runtime_prompt(selection)
    
    if not recent_titles and not recent_topics:
        return base_prompt
    
    avoidance = "\n\nAVOID RECENTLY USED:"
    if recent_titles:
        avoidance += f"\nTitles: {', '.join(recent_titles[-5:])}"
    if recent_topics:
        avoidance += f"\nAngles: {', '.join(recent_topics[-3:])}"
    
    return base_prompt + avoidance


# ============================================================
# CORRECTION PROMPT (WHEN QUALITY SCORE IS LOW)
# ============================================================

def build_correction_prompt(
    original_output: Dict,
    feedback: Dict
) -> str:
    """
    Build a correction prompt when QSF score is below threshold.
    
    Args:
        original_output: The generated content that failed quality check
        feedback: Dict with boolean flags for what needs improvement:
            - low_novelty: bool
            - weak_hook: bool
            - structure_error: bool
            - plausibility_issue: bool
    """
    issues = []
    instructions = []
    
    if feedback.get("low_novelty"):
        issues.append("Content is too similar to recent outputs")
        instructions.append("Increase novelty - use different phrasing and angles")
    
    if feedback.get("weak_hook"):
        issues.append("Emotional hook is not strong enough")
        instructions.append("Strengthen the emotional hook - add more urgency/curiosity")
    
    if feedback.get("structure_error"):
        issues.append("Format structure is inconsistent")
        instructions.append("Maintain consistent format throughout all lines")
    
    if feedback.get("plausibility_issue"):
        issues.append("Some claims feel implausible or too extreme")
        instructions.append("Use more familiar, believable claims")
    
    prompt = f"""Regenerate this reel with improvements.

ORIGINAL TITLE: {original_output.get('title', '')}
FORMAT: {original_output.get('format_style', '')}

ISSUES TO FIX:
{chr(10).join(f'- {issue}' for issue in issues)}

INSTRUCTIONS:
{chr(10).join(f'- {inst}' for inst in instructions)}

KEEP:
- Same format style
- Same general topic
- Same point count

OUTPUT (JSON only):
{{
    "title": "IMPROVED TITLE IN ALL CAPS",
    "content_lines": ["improved line 1", "improved line 2", ...],
    "image_prompt": "...",
    "format_style": "{original_output.get('format_style', '')}",
    "topic_category": "{original_output.get('topic_category', '')}",
    "hook_type": "{original_output.get('hook_type', 'curiosity')}"
}}"""
    
    return prompt


# ============================================================
# MICRO-EXAMPLE INJECTION (RARE - ONLY WHEN NEEDED)
# ============================================================

def build_style_anchor(format_style: str) -> str:
    """
    Build a minimal style anchor (NOT full examples).
    Used only when:
    - Quality score drops below threshold
    - Introducing a new format
    - Style drift detected
    
    This is a "ghost example" - structural description, not content.
    """
    format_info = FORMAT_DEFINITIONS.get(format_style, FORMAT_DEFINITIONS["SHORT_FRAGMENT"])
    
    anchor = f"""STYLE ANCHOR (DO NOT COPY CONTENT):
The reference content uses:
- Structure: {format_info['structure']}
- Word limit: {format_info['word_limit']} words per line
- Example pattern: "{format_info['example_structure']}"
- Rules: {', '.join(format_info['rules'][:2])}
"""
    return anchor


def build_prompt_with_example(
    selection: PatternSelection,
    example: Optional[Dict] = None
) -> str:
    """
    Build runtime prompt with ONE sanitized example.
    Only used for Tier 2 (micro-example) or Tier 3 (full example) scenarios.
    
    Example should be sanitized: no specific foods/symptoms/numbers.
    """
    base_prompt = build_runtime_prompt(selection)
    
    if not example:
        # Use ghost example (style description only)
        style_anchor = build_style_anchor(selection.format_style)
        return base_prompt + "\n\n" + style_anchor
    
    # Tier 3: Full example (rare, for quality reset)
    example_section = f"""
REFERENCE EXAMPLE (ABSTRACTED - DO NOT COPY DIRECTLY):
Title Pattern: "{example.get('title', '')}"
Format: {example.get('format_style', '')}
Line Count: {len(example.get('content_lines', []))}
First Line Structure: "{example.get('content_lines', [''])[0][:50]}..."

Use this structure, NOT the specific content.
"""
    return base_prompt + example_section


# ============================================================
# IMAGE PROMPT TEMPLATE
# ============================================================

IMAGE_PROMPT_SUFFIX = "No text, no letters, no numbers, no symbols, no logos."

IMAGE_PROMPT_GUIDELINES = """
IMAGE REQUIREMENTS:
- Full-frame composition with minimal empty space
- Dominant focal subject related to the topic
- Blue/teal color palette with controlled warm accents
- Studio-quality cinematic lighting
- Scientific/premium wellness aesthetic
- MUST end with: "No text, no letters, no numbers, no symbols, no logos."
"""


# ============================================================
# POST CONTENT PROMPT (used by generate_post_titles_batch)
# ============================================================

POST_QUALITY_SUFFIX = (
    "Ultra high quality, 8K, sharp focus, professional photography, "
    "soft natural lighting, premium lifestyle aesthetic. "
    "Photorealistic, detailed textures, beautiful composition. "
    "CRITICAL COMPOSITION: Subject must be centered in the UPPER HALF of the frame. "
    "The bottom third of the image should be soft bokeh, clean surface, or subtle gradient "
    "- NOT the main subject. Portrait orientation, slightly overhead camera angle, "
    "hero subject positioned in center-upper area of frame."
)

REEL_BASE_STYLE = (
    "BRIGHT, COLORFUL, VIBRANT still-life composition with SUNLIT atmosphere. "
    "Dense, full-frame layout filling every inch with objects. "
    "Shallow water ripples, water droplets, moisture, and dewy surfaces. "
    "Soft bokeh light orbs floating in the background. "
    "Morning sunlight streaming in with lens flares and light rays. "
    "BRIGHT PASTEL background tones - NO DARK OR BLACK AREAS. "
    "Polished, glossy, shiny surfaces catching light. "
    "Magazine-quality product photography style with enhanced saturation."
)

IMAGE_PROMPT_SYSTEM = """You are a visual prompt engineer specializing in wellness and health imagery for Instagram.

Given a title, generate a DETAILED cinematic image prompt suitable for AI image generation (DALL-E / Flux).

### REQUIREMENTS:
- Soft, minimal, calming wellness aesthetic
- Bright modern kitchen or clean lifestyle setting
- Neutral tones, gentle morning sunlight
- High-end lifestyle photography style
- Fresh, soothing, natural health remedy concept
- Must end with "No text, no letters, no numbers, no symbols, no logos."
- Should be 2-3 sentences long

### EXAMPLES:
Title: "Daily ginger consumption may reduce muscle pain by up to 25%"
-> "Soft cinematic close-up of fresh ginger root being sliced on a clean white stone countertop in a bright modern kitchen. A glass of warm ginger-infused water with a lemon slice sits nearby, glowing in gentle morning sunlight. Minimal, calming wellness aesthetic, neutral tones, high-end lifestyle photography. No text, no letters, no numbers, no symbols, no logos."

Title: "Vitamin D and magnesium helps reduce depression and brain aging."
-> "Soft cinematic close-up of vitamin D and magnesium supplements on a clean white surface beside a fresh orange and a glass of water in a bright modern kitchen. Gentle morning sunlight, minimal calming wellness aesthetic, neutral tones, high-end lifestyle photography. No text, no letters, no numbers, no symbols, no logos."
"""

FALLBACK_PROMPTS = {
    "vitamin/supplement": "A cinematic arrangement of colorful vitamin supplements and fresh fruits on a clean surface with warm golden sunlight. Premium wellness aesthetic with soft bokeh background.",
    "sleep/rest": "A serene bedroom scene with soft morning light filtering through white curtains, cozy bedding and calming lavender tones. Premium minimalist wellness aesthetic.",
    "exercise/fitness": "A scenic nature path through a lush green forest with golden morning sunlight streaming through the trees. Fresh, vibrant greens with cinematic depth of field.",
    "food/diet": "A beautiful overhead shot of colorful fresh fruits, vegetables and superfoods arranged on a clean marble surface. Bright, vibrant colors with premium food photography lighting.",
    "meditation/mental": "A peaceful person in meditation pose surrounded by soft natural light and minimalist zen elements. Calming lavender and white tones with premium wellness aesthetic.",
    "water/hydration": "Crystal clear water droplets and a glass bottle surrounded by fresh cucumber and mint on a bright clean surface. Fresh blue and green tones with studio lighting.",
    "generic (default)": "A cinematic wellness scene with fresh green elements, soft golden sunlight, and premium health-focused objects arranged artistically. Bright, clean, optimistic mood with studio-quality lighting.",
}

BRAND_PALETTES = {
    "healthycollege": {
        "name": "Fresh Green",
        "primary": "#4CAF50",
        "accent": "#81C784",
        "color_description": "fresh lime green, vibrant leaf green, bright spring green, with soft yellow sunlight and white highlights",
    },
    "longevitycollege": {
        "name": "Radiant Azure",
        "primary": "#00BCD4",
        "accent": "#80DEEA",
        "color_description": "radiant azure, bright sky blue, luminous cyan, electric light blue, with white glow and warm sunlight touches",
    },
    "vitalitycollege": {
        "name": "Bright Turquoise",
        "primary": "#26C6DA",
        "accent": "#4DD0E1",
        "color_description": "bright turquoise, sparkling teal, vibrant aquamarine, with white shimmer and golden sunlight accents",
    },
    "wellbeingcollege": {
        "name": "Vibrant Blue",
        "primary": "#2196F3",
        "accent": "#64B5F6",
        "color_description": "bright sky blue, vibrant azure, luminous cyan, sparkling light blue, with soft white and golden sunlight accents",
    },
    "holisticcollege": {
        "name": "Vibrant Blue",
        "primary": "#2196F3",
        "accent": "#64B5F6",
        "color_description": "bright sky blue, vibrant azure, luminous cyan, sparkling light blue, with soft white and golden sunlight accents",
    },
}

IMAGE_MODELS = {
    "posts": {
        "name": "ZImageTurbo_INT8",
        "dimensions": "1088x1360 (rounded from 1080x1350)",
        "steps": 8,
        "description": "Higher quality model for posts. Better prompt adherence and fidelity.",
    },
    "reels": {
        "name": "Flux1schnell",
        "dimensions": "1152x1920 (rounded from 1080x1920)",
        "steps": 4,
        "description": "Fast model for reel backgrounds. Cheaper per image.",
    },
}


# ============================================================
# POST CONTENT GENERATION PROMPT (source of truth)
# ============================================================

# Carousel slide examples (used for few-shot prompting)
CAROUSEL_SLIDE_EXAMPLES = [
    {
        "topic": "Neuroplasticity & Gratitude",
        "title": "WHEN YOU FOCUS ON THE GOOD IN YOUR LIFE, YOUR BRAIN LITERALLY REWIRES ITSELF TO LOOK FOR MORE GOOD. THAT'S THE MAGIC OF NEUROPLASTICITY",
        "slides": [
            "Neuroscience shows that what you consistently focus on reshapes how your brain filters reality. Repeated attention to positive experiences strengthens neural circuits in attention, emotion regulation, and reward processing, making those signals easier to detect in the future. Through neuroplasticity, the brain doesn't just change what you think about, it changes what stands out to you in the first place.",
            "This process competes directly with the brain's built-in negativity bias. By default, the brain prioritizes threat and loss, but deliberate focus on positive cues retrains this priority system over time. As these signals are repeatedly tagged as relevant, the brain allocates more processing power to them, quietly shifting what feels salient, meaningful, and worth noticing throughout the day.",
        ],
    },
    {
        "topic": "Curiosity vs Fear",
        "title": "CURIOSITY IS THE BRAIN'S ANTIDOTE TO FEAR. BEING CURIOUS REPLACES AVOIDANCE CIRCUITS WITH EXPLORATION CIRCUITS",
        "slides": [
            "Neuroscience shows that curiosity and fear engage opposing neural systems. While fear activates the amygdala and triggers withdrawal, curiosity recruits the hippocampus, nucleus accumbens, and dopamine pathways that drive exploration and learning.",
            "When curiosity is active, the brain shifts from threat detection to reward anticipation. This state quiets the fear response and boosts motivation, memory, and creative problem-solving. Curiosity literally reprograms your brain's response to uncertainty.",
            "When you choose curiosity over fear, you rewire avoidance into approach. Curiosity doesn't just make you smarter, it makes you braver. Click the link in our bio to enhance your brain health further.",
        ],
    },
    {
        "topic": "Collagen",
        "title": "YOUR SKIN LOSES 1% OF ITS COLLAGEN EVERY YEAR AFTER AGE 30. BUT YOU CAN SLOW THAT DOWN.",
        "slides": [
            "Collagen is the most abundant protein in your body, providing structure to skin, joints, bones, and connective tissue. After 30, natural production declines steadily, leading to wrinkles, joint discomfort, and decreased skin elasticity. This decline accelerates during perimenopause and menopause.",
            "Supplementing with hydrolyzed collagen peptides has been shown to improve skin hydration, elasticity, and firmness within 8-12 weeks. It also supports joint health and gut lining integrity. The key is consistency, as collagen works cumulatively, rebuilding from the inside out.",
            "Mix collagen powder into your morning coffee, smoothie, or oatmeal. Pair it with vitamin C-rich foods like berries or citrus to enhance absorption. It's one of the simplest investments in how you'll look and feel a decade from now.",
        ],
    },
    {
        "topic": "Iron Deficiency",
        "title": "IF YOU'RE EXHAUSTED BUT YOUR SLEEP IS FINE, CHECK YOUR IRON LEVELS.",
        "slides": [
            "Iron deficiency is the most common nutritional deficiency in women, especially those with heavy menstrual cycles or those transitioning into perimenopause. Low iron doesn't just cause fatigue, it impairs oxygen delivery to your brain and muscles, leading to brain fog, weakness, cold sensitivity, and even hair loss.",
            'Many people have "low normal" ferritin levels that don\'t trigger medical concern but still cause symptoms. Optimal ferritin for energy and cognitive function is typically 50-100 ng/mL, not just above the minimum threshold. Request a full iron panel, not just hemoglobin.',
            "If you're low, prioritize heme iron from red meat, chicken liver, or oysters, as it's absorbed 2-3x better than plant-based iron. Pair plant sources like spinach or lentils with vitamin C. Avoid taking iron with coffee or tea, as tannins block absorption.",
        ],
    },
    {
        "topic": "Post-Meal Walking",
        "title": "ONE DAILY HABIT CAN CHANGE YOUR HEALTH: A 10-MINUTE WALK AFTER MEALS.",
        "slides": [
            "Research shows that light movement after eating improves glucose control and reduces insulin spikes.",
            "For women 35+, this habit supports weight balance, digestion, and cardiovascular health without intense workouts.",
            "It also lowers stress hormones and boosts mental clarity.",
        ],
    },
    {
        "topic": "Magnesium",
        "title": "MAGNESIUM IS THE MINERAL MANY WOMEN DON'T GET ENOUGH OF, AND IT AFFECTS EVERYTHING.",
        "slides": [
            "Magnesium supports muscle relaxation, sleep quality, and nervous system balance.",
            "Stress, caffeine, and aging can deplete magnesium faster, leading to tension, poor sleep, and irritability.",
            "Foods like pumpkin seeds, leafy greens, dark chocolate, and beans are rich natural sources.",
        ],
    },
    {
        "topic": "Protein After 35",
        "title": "PROTEIN BECOMES MORE IMPORTANT AFTER 35, NOT FOR MUSCLE, BUT FOR STRENGTH AND LONGEVITY.",
        "slides": [
            "Women naturally lose muscle mass with age, which impacts metabolism, posture, and daily energy.",
            "Adequate protein supports healthy aging, stable appetite, and hormone production.",
            "Easy options: lentils, salmon, cottage cheese, tofu, or chicken added to meals.",
        ],
    },
    {
        "topic": "Strength Training",
        "title": "CARDIO BURNS CALORIES. STRENGTH TRAINING REBUILDS YOUR METABOLISM.",
        "slides": [
            "After 35, muscle mass declines by an average of 3-5% per decade, a process called sarcopenia. This loss directly slows metabolic rate, weakens bones, and increases injury risk. Muscle is metabolically active tissue, meaning it burns calories even at rest.",
            "Strength training 2-3 times per week reverses this decline. It increases bone density (critical for preventing osteoporosis), improves insulin sensitivity, and reshapes body composition. You don't need to lift heavy. Progressive resistance with bodyweight, bands, or moderate weights is enough.",
            "Think of strength training as a long-term investment in independence. The muscle you build now determines your mobility, balance, and vitality in your 60s, 70s, and beyond. Start simple: squats, push-ups, rows, and planks build full-body strength.",
        ],
    },
    {
        "topic": "Fiber",
        "title": "95% OF AMERICAN WOMEN DON'T EAT ENOUGH FIBER. HERE'S WHY THAT MATTERS.",
        "slides": [
            "Fiber does more than aid digestion. It regulates blood sugar, supports gut bacteria, lowers cholesterol, and promotes satiety. The recommended intake is 25-30 grams daily, but most people get only 10-15 grams. This deficit contributes to blood sugar crashes, constipation, inflammation, and weight gain.",
            "Soluble fiber (found in oats, beans, apples) slows glucose absorption and feeds beneficial gut bacteria. Insoluble fiber (found in vegetables, whole grains, nuts) adds bulk and supports regularity. Both types are essential for hormonal balance and metabolic health as you age.",
            "Start your day with chia seeds, flaxseed, or oatmeal. Add a handful of berries. Snack on raw vegetables with hummus. Small, consistent additions compound into significant metabolic and digestive improvements over time.",
        ],
    },
    {
        "topic": "Sleep Quality",
        "title": "IT'S NOT JUST ABOUT HOW LONG YOU SLEEP. IT'S ABOUT HOW DEEPLY YOU SLEEP.",
        "slides": [
            "Deep sleep is when your body repairs tissue, consolidates memory, and regulates hormones like growth hormone and cortisol. After 35, deep sleep naturally decreases, but lifestyle factors like stress, alcohol, screen time, and room temperature can make it worse.",
            "Poor sleep quality disrupts insulin sensitivity, increases hunger hormones (ghrelin), decreases satiety hormones (leptin), and accelerates cognitive decline. During perimenopause, fragmented sleep often worsens due to fluctuating estrogen and progesterone levels.",
            "To improve deep sleep: keep your bedroom cool (65-68 degrees F), avoid screens 1 hour before bed, limit alcohol, and consider magnesium glycinate before sleep. Track your sleep with a wearable to see how small changes impact your sleep architecture over time.",
        ],
    },
    {
        "topic": "Gut Health",
        "title": "YOUR GUT PRODUCES 90% OF YOUR SEROTONIN. POOR GUT HEALTH AFFECTS YOUR MOOD, NOT JUST YOUR DIGESTION.",
        "slides": [
            "The gut-brain axis is a bidirectional communication system between your gut microbiome and your central nervous system. Beneficial bacteria produce neurotransmitters, including serotonin, dopamine, and GABA, that regulate mood, anxiety, and cognitive function.",
            "Chronic stress, antibiotics, processed foods, and lack of fiber disrupt this balance, leading to dysbiosis, an imbalance in gut bacteria. This can manifest as anxiety, depression, brain fog, inflammation, and weakened immunity. Hormonal shifts can further impact gut health.",
            "Support your gut with fermented foods like yogurt, kefir, sauerkraut, and kimchi. Add prebiotic fibers from garlic, onions, asparagus, and bananas. Consider a high-quality probiotic. Your gut health is foundational to your mental and physical resilience.",
        ],
    },
    {
        "topic": "Blood Sugar Balance",
        "title": "STABLE BLOOD SUGAR ISN'T JUST FOR DIABETICS. IT'S THE KEY TO STEADY ENERGY AND MOOD.",
        "slides": [
            "When blood sugar spikes and crashes throughout the day, it triggers cortisol release, increases cravings, impairs focus, and promotes fat storage, especially around the midsection. After 35, insulin sensitivity naturally declines, making blood sugar regulation more challenging.",
            "Eating balanced meals with protein, healthy fats, and fiber slows glucose absorption and prevents spikes. Starting your day with protein instead of carbs sets a stable metabolic tone. Avoid eating carbs alone and pair them with protein or fat.",
            "Simple swaps: choose berries over bananas, add almond butter to your apple, eat protein before your morning toast. Walk for 10 minutes after meals to improve glucose uptake. These small habits prevent energy crashes and reduce long-term disease risk.",
        ],
    },
    {
        "topic": "Cortisol Management",
        "title": "CHRONIC STRESS DOESN'T JUST FEEL BAD. IT LITERALLY AGES YOUR CELLS FASTER.",
        "slides": [
            "Prolonged cortisol elevation, from work stress, poor sleep, over-exercising, or constant multitasking, shortens telomeres, the protective caps on your DNA. Shorter telomeres accelerate cellular aging and increase risk for chronic disease, cognitive decline, and immune dysfunction.",
            "High cortisol also disrupts thyroid function, sex hormones, and blood sugar regulation. This can worsen perimenopause symptoms, increase abdominal fat storage, and impair sleep quality. Stress isn't just mental, it's biological.",
            "Lower cortisol naturally: prioritize 7-8 hours of sleep, practice deep breathing or meditation for 5-10 minutes daily, reduce caffeine if you're anxious, and build recovery into your routine. Managing stress isn't optional, it's essential for longevity.",
        ],
    },
    {
        "topic": "Walking After Meals",
        "title": "WALKING AFTER MEALS IS ONE OF THE MOST UNDERRATED HABITS FOR METABOLIC HEALTH.",
        "slides": [
            "A 10-15 minute walk after eating lowers post-meal blood sugar spikes by up to 30%. This happens because muscle contraction increases glucose uptake without requiring insulin. It's especially effective after high-carb meals and helps prevent energy crashes.",
            "Regular walking also supports cardiovascular health, reduces inflammation, improves mood through endorphin release, and aids digestion. It's a low-impact way to maintain metabolic flexibility and prevent insulin resistance as you age.",
            "Make it a habit: after lunch or dinner, take a short walk around the block, through your neighborhood, or even around your office. It's simple, free, and compounds into significant health benefits over time.",
        ],
    },
    {
        "topic": "Electrolytes",
        "title": "DRINKING MORE WATER WON'T HELP IF YOU'RE LOW ON ELECTROLYTES.",
        "slides": [
            "Electrolytes (sodium, potassium, magnesium, and calcium) regulate hydration at the cellular level. They control nerve signals, muscle contractions, and pH balance. Drinking plain water without adequate electrolytes can dilute these minerals further, worsening fatigue, cramps, and headaches.",
            "Those who are active, stressed, or in perimenopause often have higher electrolyte needs. Sweating, stress, and hormonal fluctuations all deplete these minerals. Low electrolytes impair energy production, cognitive function, and recovery.",
            "Add a pinch of sea salt to your morning water, eat potassium-rich foods like avocados and sweet potatoes, or use a clean electrolyte powder without added sugars. Proper hydration isn't just about volume, it's about balance.",
        ],
    },
]


def build_post_content_prompt(count: int, history_context: str = "", topic_hint: str = None) -> str:
    """
    Build the full post content generation prompt.
    This is the SINGLE SOURCE OF TRUTH for post generation.
    Both the AI generator and the transparency page read from here.

    Args:
        count: Number of posts to generate
        history_context: Recently generated titles to avoid repetition
        topic_hint: Optional topic hint
    Returns:
        Complete prompt string
    """
    # Build examples section from CAROUSEL_SLIDE_EXAMPLES
    examples_text = ""
    for i, ex in enumerate(CAROUSEL_SLIDE_EXAMPLES, 1):
        examples_text += f"\n**Example {i} ({ex['topic']}):**\n"
        examples_text += f"Title (Slide 1): {ex['title']}\n"
        for j, slide in enumerate(ex["slides"], 2):
            examples_text += f"Slide {j}: {slide}\n"

    prompt = f"""You are a health content creator for InLight, a wellness brand targeting U.S. women aged 35 and older.

Generate EXACTLY {count} COMPLETELY DIFFERENT health-focused posts. Each post MUST cover a DIFFERENT topic category.

### TARGET AUDIENCE:
Women 35+ interested in healthy aging, energy, hormones, and longevity.

### CRITICAL WRITING RULES:
- NEVER use em dashes or en dashes (the long dash characters). Instead, use commas, periods, semicolons, or rephrase the sentence. For example, write "it's not just about volume, it's about balance" instead of "it's not just about volume—it's about balance."
- Write in a natural, human, conversational tone. Avoid patterns that feel robotic or AI-generated.
- Use short, punchy sentences mixed with longer explanatory ones for rhythm.
- Each slide text must read as a standalone paragraph that could be a standalone Instagram text post.

### CRITICAL RULE:
Each of the {count} posts MUST be about a DIFFERENT topic. Do NOT repeat similar themes.
Pick {count} DIFFERENT categories from this list (one per post):
1. Superfoods and healing ingredients (turmeric, ginger, berries, honey, cinnamon)
2. Teas and warm drinks (green tea, chamomile, matcha, golden milk)
3. Supplements and vitamins (collagen, magnesium, vitamin D, omega-3, probiotics)
4. Sleep rituals and evening routines
5. Morning wellness routines (lemon water, journaling, light stretching)
6. Skin health, collagen, and anti-aging nutrition
7. Gut health, digestion, and bloating relief
8. Hormone balance and menopause support through nutrition
9. Stress relief and mood-boosting foods/habits
10. Hydration and detox drinks
11. Brain health and memory-supporting nutrients
12. Heart-healthy foods and natural remedies
13. Strength training and muscle preservation
14. Blood sugar balance and metabolic health
15. Cortisol management and stress biology
16. Walking and low-impact movement
17. Electrolytes and cellular hydration
18. Fiber intake and digestive health

### WHAT MAKES A GREAT POST TITLE (Slide 1):
- A short, clear health statement written in ALL CAPS
- Focused on one or two main benefits
- Positive, empowering, and slightly exaggerated to create scroll-stop engagement
- Do NOT lie, but dramatize slightly to spark discussion
- Do NOT end the title with a period (.) unless it's a two-part statement where the second part adds impact

### TITLE STYLE VARIETY (CRITICAL, mix these across the batch):
You MUST use a MIX of these title styles. Never generate all titles in the same style!

**Style A: Bold statement with impact**
- "YOUR SKIN LOSES 1% OF ITS COLLAGEN EVERY YEAR AFTER AGE 30. BUT YOU CAN SLOW THAT DOWN."
- "CHRONIC STRESS DOESN'T JUST FEEL BAD. IT LITERALLY AGES YOUR CELLS FASTER."
- "95% OF AMERICAN WOMEN DON'T EAT ENOUGH FIBER. HERE'S WHY THAT MATTERS."
- "CARDIO BURNS CALORIES. STRENGTH TRAINING REBUILDS YOUR METABOLISM."

**Style B: Direct statement or question**
- "IF YOU'RE EXHAUSTED BUT YOUR SLEEP IS FINE, CHECK YOUR IRON LEVELS."
- "DRINKING MORE WATER WON'T HELP IF YOU'RE LOW ON ELECTROLYTES."
- "ONE DAILY HABIT CAN CHANGE YOUR HEALTH: A 10-MINUTE WALK AFTER MEALS."
- "STABLE BLOOD SUGAR ISN'T JUST FOR DIABETICS. IT'S THE KEY TO STEADY ENERGY AND MOOD."

**Style C: Educational insight**
- "YOUR GUT PRODUCES 90% OF YOUR SEROTONIN. POOR GUT HEALTH AFFECTS YOUR MOOD, NOT JUST YOUR DIGESTION."
- "WALKING AFTER MEALS IS ONE OF THE MOST UNDERRATED HABITS FOR METABOLIC HEALTH."
- "PROTEIN BECOMES MORE IMPORTANT AFTER 35, NOT FOR MUSCLE, BUT FOR STRENGTH AND LONGEVITY."
- "MAGNESIUM IS THE MINERAL MANY WOMEN DON'T GET ENOUGH OF, AND IT AFFECTS EVERYTHING."

### WHAT TO AVOID:
- Em dashes or en dashes anywhere in the text (use commas or periods instead)
- Reel-style titles like "5 SIGNS YOUR BODY..." or "FOODS THAT DESTROY..."
- Question formats or numbered lists as titles
- Intense exercise or gym/strength training topics (unless specifically about sarcopenia/bone health)

### CAPTION REQUIREMENTS:
Write a full Instagram caption (4-5 paragraphs) that:
- Paragraph 1: Hook: expand on the title with a surprising or counterintuitive angle
- Paragraph 2-3: Explain the science/mechanism in accessible, wellness-friendly language. Be specific about what happens in the body (metabolism, organs, brain chemistry, skin, energy, etc.)
- Paragraph 4: Summarize the takeaway, what the reader can expect if they take action
- After the paragraphs, add a "Source:" section with a REAL, EXISTING academic reference in this format:
  Author(s). (Year). Title. Journal, Volume(Issue), Pages.
  DOI: 10.xxxx/xxxxx
  THE DOI MUST BE A REAL, VERIFIABLE DOI that exists on doi.org. Use well-known published studies. The study must be related to the topic.
  MANDATORY: Every single post MUST include a real DOI. This is non-negotiable. Use studies from PubMed, Nature, The Lancet, JAMA, BMJ, or other reputable journals. NEVER invent or fabricate a DOI.
- End with a disclaimer block:
  Disclaimer:
  This content is intended for educational and informational purposes only and should not be considered medical advice. It is not designed to diagnose, treat, cure, or prevent any medical condition. Always consult a qualified healthcare professional before making dietary, medication, or lifestyle changes, particularly if you have existing health conditions. Individual responses may vary.
- Separate each section with a blank line for readability

### CAROUSEL SLIDE TEXTS (CRITICAL, this is for Instagram carousel slides 2+):
Generate 3-4 slide texts for each post. These appear as text-only slides after the main cover image.
Each slide text should be:
- A standalone paragraph (3-6 sentences) that reads well on its own
- Written in a calm, authoritative, educational tone (NOT salesy)
- No em dashes or en dashes anywhere
- Slide 1 text: The core scientific explanation (what happens in the body)
- Slide 2 text: Deeper mechanism / why it matters / practical context
- Slide 3 text: Practical advice, actionable takeaways, or specific recommendations
- Slide 4 text (optional): Closing takeaway + call-to-action. MUST end with a new paragraph: "Follow @{{{{brandhandle}}}} to learn more about your {{{{topic_word}}}}." where topic_word is one relevant word like "health", "brain", "body", "longevity", "energy", "skin", "sleep", "nutrition" etc.
Note: the {{{{brandhandle}}}} placeholder will be replaced by the system.
If only 3 slides, the last slide should include both actionable advice AND the Follow CTA.

### REFERENCE EXAMPLES (study these for tone, depth, and structure):
{examples_text}

### IMAGE PROMPT REQUIREMENTS:
- Soft, minimal, calming wellness aesthetic
- Each image prompt MUST be visually DIFFERENT (different setting, different ingredients)
- Neutral tones, gentle morning sunlight
- High-end lifestyle photography style
- CRITICAL COMPOSITION: The main subject MUST be positioned in the CENTER and UPPER-CENTER area of the frame (top two-thirds). The BOTTOM THIRD will be covered by text overlay.
- Camera angle: slightly overhead / 45-degree top-down perspective preferred
- Must end with: "No text, no letters, no numbers, no symbols, no logos."

{history_context}

{"Topic hint: " + topic_hint if topic_hint else ""}

### OUTPUT FORMAT (JSON array, no markdown):
[
  {{{{
    "title": "TITLE IN ALL CAPS FOR SLIDE 1",
    "caption": "Hook paragraph.\\n\\nScience explanation.\\n\\nMore detail.\\n\\nTakeaway.\\n\\nSource:\\nAuthor. (Year). Title. Journal, Vol(Issue), Pages.\\nDOI: 10.xxxx/xxxxx\\n\\nDisclaimer:\\nThis content is intended for educational and informational purposes only...",
    "slide_texts": [
      "First slide paragraph explaining the core science. 3-6 sentences.",
      "Second slide going deeper into why it matters. 3-6 sentences.",
      "Third slide with practical advice and actionable steps. 3-6 sentences.",
      "Fourth slide with closing takeaway.\\n\\nFollow @{{{{brandhandle}}}} to learn more about your health."
    ],
    "image_prompt": "Detailed cinematic image description. No text, no letters, no numbers, no symbols, no logos."
  }}}}
]

Generate exactly {count} posts now:"""

    return prompt


def get_post_content_prompt_for_display() -> str:
    """
    Return a clean version of the post content prompt for the transparency page.
    Uses placeholder values so users can see the template structure.
    """
    return build_post_content_prompt(
        count=5,
        history_context="[Recent titles injected here dynamically to prevent repetition]",
        topic_hint=None,
    )
