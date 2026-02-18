"""
Populate niche_config table with global config for user 7c7bdcc7-ad79-4554-8d32-e5ef02608e84.
Idempotent: uses INSERT ... ON CONFLICT DO UPDATE.
"""

import uuid
import json
import psycopg2

USER_ID = "7c7bdcc7-ad79-4554-8d32-e5ef02608e84"
BRAND_ID = None  # Global config

DATA = {
    "niche_name": "Health & Wellness",
    "niche_description": "Viral short-form health content that educates and empowers audiences through proven patterns — body signals, nutrition tips, daily habits, longevity advice, and psychological insights.",
    "target_audience": "U.S. women aged 35+",
    "audience_description": "Women 35+ interested in healthy aging, energy, hormones, and longevity. Health-conscious consumers who scroll Instagram/TikTok for quick, actionable wellness tips.",
    "parent_brand_name": "InLight",
    "topic_categories": ["Body & Warning Signs", "Nutrition & Food Benefits", "Daily Habits & Lifestyle", "Mindset & Psychology", "Aging & Longevity", "Symptoms & Deficiencies", "Food Safety & Storage", "Natural Remedies"],
    "topic_keywords": ["health", "wellness", "body", "nutrition", "digestion", "immunity", "inflammation", "hormones", "energy", "sleep", "aging", "longevity", "detox", "vitamins", "minerals", "hydration", "metabolism", "gut health", "circulation", "stress", "weight loss", "heart health", "brain fog", "thyroid", "magnesium", "vitamin D", "collagen", "antioxidants"],
    "topic_avoid": ["political topics", "religious content", "extreme medical claims", "pharmaceutical promotions", "controversial diets", "body shaming", "fear-mongering without solutions"],
    "content_tone": ["calm", "authoritative", "educational", "empowering", "casual", "energetic", "scientific", "friendly", "confident", "direct", "warm", "inspirational", "professional", "conversational"],
    "tone_avoid": ["clinical", "salesy", "aggressive", "academic", "poetic", "overly creative", "robotic", "preachy", "condescending"],
    "content_philosophy": "60% validating what the audience already suspects (body signals, common mistakes), 40% surprising with new actionable insights (food hacks, little-known facts). Always plausible, never preachy. Social proof through familiar patterns, not medical authority.",
    "hook_themes": ["fear", "curiosity", "authority", "control", "hope"],
    "reel_examples": [
        {
            "title": "5 SIGNS YOUR BODY IS TRYING TO WARN YOU (NEVER IGNORE)",
            "content_lines": [
                "Waking up at 3 AM frequently? This could mean your body is under hidden stress or experiencing hormonal or nervous system imbalance.",
                "Constant goosebumps without cold? It may be linked to heightened nervous system sensitivity or emotional stress responses.",
                "Sudden ear ringing? This can be associated with sensory overload, stress, or changes in blood pressure.",
                "Random body twitches, especially in eyes or lips? This may be a sign of fatigue, mineral deficiencies, dehydration, or nervous system overstimulation.",
                "Forgetting why you entered a room? This often happens when the brain is overloaded, stressed, multitasking excessively, or lacking proper rest."
            ]
        },
        {
            "title": "SILENT HEALTH MISTAKES YOU DON'T NOTICE",
            "content_lines": [
                "Going to bed with wet hair — Can contribute to sinus issues and headaches.",
                "Skipping sunlight daily — May lead to low vitamin D levels and low mood.",
                "Wearing tight clothes often — Can result in poor circulation.",
                "Brushing teeth too hard — Damages tooth enamel.",
                "Skipping meals when busy — Can cause weak digestion and fatigue.",
                "Staying stressed all day — Lowers immunity.",
                "Constant multitasking without breaks — Overstimulates the nervous system.",
                "Inconsistent sleep and wake times — Disrupts circadian rhythm and hormone balance.",
                "Drinking most of your water late in the day — Leads to poor hydration balance and sluggish metabolism."
            ]
        },
        {
            "title": "JUST EAT THIS FOR 1 WEEK",
            "content_lines": [
                "If you eat 1 kiwi every morning for a week, your digestion will smooth out, your vitamin C levels will spike, and your skin will start glowing naturally.",
                "If you eat 1 tablespoon of soaked chia seeds for seven days, your constipation will ease, your gut will work better, and your body will naturally release toxins.",
                "If you drink warm lemon water every morning for seven days, your liver function will support natural detoxification, digestion will improve, and bloating may reduce.",
                "If you eat a small handful of pumpkin seeds daily, your sleep quality, hormone balance, and muscle recovery can improve due to their magnesium and zinc content.",
                "If you eat 1 apple with cinnamon every morning, your blood sugar will stabilize and your metabolism will activate more efficiently."
            ]
        },
        {
            "title": "8 HARSH TRUTHS",
            "content_lines": [
                "Once is a mistake; twice is a decision.",
                "People never forget how you made them feel.",
                "If you're not losing friends, you're not growing.",
                "An apology holds no weight if you have to ask for it.",
                "If your absence doesn't affect them, your presence never mattered.",
                "Know both sides before you judge.",
                "You cannot heal what you refuse to acknowledge and feel.",
                "Growth often requires discomfort before clarity appears."
            ]
        },
        {
            "title": "EAT THIS IF YOU ARE SICK",
            "content_lines": [
                "Fever → Coconut water",
                "Cough → Pineapple",
                "Sore muscles → Tart cherries",
                "Cold & flu → Citrus fruits",
                "Immune system → Mushrooms",
                "Inflammation → Turmeric",
                "Congestion → Peppermint tea",
                "Upset stomach → Papaya",
                "Nausea → Ginger",
                "Weak eyesight → Carrots",
                "Dizziness → Watermelon",
                "Anemia → Spinach",
                "Heartburn → Oatmeal",
                "Sinus infection → Garlic",
                "Fatty liver → Beets",
                "Joint pain → Walnuts",
                "Dry skin → Avocado",
                "Low energy → Dates",
                "Sleep problems → Kiwi",
                "Acne → Almonds",
                "Cholesterol → Oats",
                "Bad breath → Apples"
            ]
        },
        {
            "title": "16 SIGNS YOUR BODY IS STARVING INSIDE",
            "content_lines": [
                "Cold hands – Iron",
                "No appetite – Zinc",
                "Dry eyes – Vitamin A",
                "Short of breath – Iron",
                "Hair falling out – Iron",
                "Dry mouth – Vitamin A",
                "Brittle nails – Biotin (B7)",
                "Tired all day – Vitamin D",
                "Feeling low – Vitamin B6",
                "Forgetfulness – Omega-3",
                "Leg cramps – Magnesium",
                "Brain fog – Vitamin B12",
                "Muscle weakness – Potassium",
                "Frequent infections – Vitamin C",
                "Tingling or numbness – Vitamin B6",
                "Poor sleep quality – Magnesium"
            ]
        },
        {
            "title": "DO THESE 10 HABITS IF YOU WANT TO STILL WALK AT 80",
            "content_lines": [
                "Wake up and drink water before coffee.",
                "Do 10 heel raises before getting out of bed.",
                "Eat protein within 30 minutes of waking.",
                "Gently rotate ankles and shoulders daily.",
                "Walk at least 10 minutes every morning.",
                "Strengthen legs weekly (squats, steps, bands).",
                "Stay hydrated to support circulation and joints.",
                "Train your brain daily (memory or balance work).",
                "Prioritize sleep to protect muscle and coordination.",
                "Maintain vitamin D and mineral intake for bone strength."
            ]
        },
        {
            "title": "DOCTORS DON'T WANT YOU TO KNOW THIS",
            "content_lines": [
                "Daily 1 apple – Supports overall health",
                "Daily 4 almonds – Supports cellular protection",
                "Daily 1 lemon – Supports metabolism",
                "Daily 1 glass of milk – Supports strong bones",
                "Daily 2 cups of water upon waking – Better digestion and detox",
                "Daily 1 banana – Stronger muscles and steady energy",
                "Daily 20 minutes of walking – Better heart health",
                "Daily handful of walnuts – Sharper brain and memory",
                "Daily 1 tablespoon of flaxseeds – Balanced hormones",
                "Daily 1 cup of chamomile tea – Reduced stress and deeper sleep",
                "Daily 10 minutes of stretching – Better flexibility and circulation",
                "Daily 1 serving of leafy greens – Strong immunity and healthier skin",
                "Daily 5 minutes of sunlight – Natural vitamin D boost",
                "Daily breathing exercises – Lower anxiety and improved focus"
            ]
        },
        {
            "title": "HOW TO INCREASE YOUR AURA",
            "content_lines": [
                "Smile with your mouth closed.",
                "Don't talk about your plans; show people the results.",
                "Read a book in public places.",
                "Nod instead of saying yes.",
                "Don't make yourself available all the time.",
                "Don't talk too much about yourself.",
                "Protect your energy first; pause and take one deep intentional breath before entering any space.",
                "Walk with calm confidence; never rush your movements.",
                "Make silence your power; speak only when necessary.",
                "Master your reactions; emotional control is magnetic."
            ]
        },
        {
            "title": "5 COMMON SYMPTOMS THAT LOOK HARMLESS BUT SIGNAL SOMETHING SERIOUS",
            "content_lines": [
                "Frequent yawning during the day – Can indicate mitochondrial dysfunction or oxygen deficiency.",
                "Waking up between 1–3 AM every night – Linked to liver overload or blood sugar imbalance.",
                "White spots on fingernails – Can signal zinc deficiency or chronic inflammation.",
                "Itchy ears or scalp – Often linked to fungal imbalances or food intolerances.",
                "Cracks at the corner of your mouth – Riboflavin (B2) deficiency or low iron."
            ]
        },
        {
            "title": "8 EVERYDAY HABITS THAT ARE SILENTLY DESTROYING YOUR BODY",
            "content_lines": [
                "Drinking iced water with meals – Slows digestion and nutrient absorption.",
                "Wearing headphones for hours – Heats inner ear and causes brain fatigue.",
                "Keeping receipts in your wallet – BPA exposure and hormone disruption.",
                "Sleeping with bright lights on – Lowers melatonin and accelerates aging.",
                "Using scented candles daily – Inhaling phthalates harms lungs and fertility.",
                "Keeping shoes in the bedroom – Bacteria and toxins weaken immunity.",
                "Using scratched non-stick pans – Toxins cause hormone disruption.",
                "Sleeping next to your phone – EMF exposure and poor sleep."
            ]
        },
        {
            "title": "10 WATER HABITS THAT HARM YOUR ORGANS",
            "content_lines": [
                "Too little water – Kidneys work harder, blood gets thicker.",
                "Too much water fast – Washes minerals, strains your heart.",
                "Drinking before bed – Wakes you up, disrupts kidney rest.",
                "Soda instead of water – Sugar burdens liver and pancreas.",
                "Only coffee or tea – Dehydrates you and stresses kidneys.",
                "Ice-cold water after meals – Slows digestion and irritates the stomach.",
                "No water after sweating – Causes dehydration and thick blood flow.",
                "Drinking water too quickly after intense exercise – Can dilute electrolytes and cause imbalance.",
                "Reusing old plastic bottles – Microplastics and chemicals may leach into water.",
                "Very low daily water intake – Impacts blood pressure, kidneys, and cognition."
            ]
        },
        {
            "title": "SUPERFOODS TO HELP YOU AGE BACKWARD (AND HOW MUCH TO EAT DAILY)",
            "content_lines": [
                "Avocados – One every other day",
                "Blueberries – ½ to 1 cup daily",
                "Chia seeds – 1 tablespoon daily",
                "Sweet potatoes – One every other day",
                "Almonds – 8–10 daily",
                "Green tea – 2 cups daily",
                "Tomatoes – One medium or five cherry tomatoes daily",
                "Dark chocolate (70%+) – 1–2 small squares daily",
                "Walnuts – 5 halves daily",
                "Broccoli – 1 cup daily",
                "Garlic – 1 clove daily",
                "Turmeric – ½ teaspoon with black pepper",
                "Kiwi – 1 daily"
            ]
        },
        {
            "title": "STRANGE BODY SYMPTOMS EXPLAINED",
            "content_lines": [
                "Too much yawning – Low oxygen",
                "Unusual bad breath – Gut problems",
                "Constant ringing ears – High blood pressure",
                "Heavy hair loss – Iron deficiency",
                "Swollen legs – Poor lymphatic flow",
                "Nighttime cramps – Low magnesium",
                "Numb fingers – Vitamin B12 deficiency",
                "Sugar cravings – Chromium deficiency",
                "Frequent headaches – Dehydration",
                "Chilly hands and feet – Poor circulation",
                "Tongue burning – Vitamin B deficiency",
                "Can't smell well – Zinc deficiency",
                "Bleeding gums – Vitamin C deficiency",
                "Always tired – Adrenal fatigue",
                "Feeling dizzy – Low blood sugar",
                "Yellowish eyes – Liver trouble"
            ]
        },
        {
            "title": "HOW TO BE MENTALLY STRONG",
            "content_lines": [
                "Stop expecting from everyone.",
                "Accept that life is unfair.",
                "Don't beg for love or attention.",
                "Keep emotions under control.",
                "Learn to stay calm in chaos.",
                "Stop taking things personally.",
                "Walk away from toxic people.",
                "Focus on solutions, not problems.",
                "Believe in yourself always.",
                "Forgive but don't forget the lesson.",
                "Don't fear being alone; use it to grow.",
                "Control your reactions, not others' actions.",
                "Detach from what you can't control.",
                "Protect your peace above everything."
            ]
        },
        {
            "title": "IMPORTANT YET SIMPLE HEALTH TIPS NO ONE TALKS ABOUT",
            "content_lines": [
                "Don't take medicine with cold or chilled water.",
                "Don't eat heavy meals after 6 pm.",
                "Drink more water in the morning and less at night.",
                "Don't lie down for at least 2 hours after eating.",
                "Answer phone calls from your left ear.",
                "Best sleeping time is between 9:30 pm and 4:30 am.",
                "Don't reheat cooking oils multiple times.",
                "Avoid drinking water immediately after meals; wait 20–30 minutes.",
                "Don't skip sunlight in the morning.",
                "Eat your last meal at least 3 hours before sleeping."
            ]
        },
        {
            "title": "10 FOOD FACTS THAT WILL SHOCK YOU",
            "content_lines": [
                "Two bananas give enough energy for a 90-minute workout.",
                "Apples wake you up better than coffee.",
                "Cucumber before bed helps you wake refreshed.",
                "Three carrots give energy to walk three miles.",
                "Beetroot boosts endurance by up to 16%.",
                "Dark chocolate sharpens focus within 30 minutes.",
                "Almonds have more potassium than bananas.",
                "Ginger reduces muscle pain by up to 25%.",
                "Kiwi before bed improves sleep quality.",
                "Chia seeds help maintain hydration and steady energy."
            ]
        },
        {
            "title": "WHAT IS YOUR BODY TRYING TO TELL YOU",
            "content_lines": [
                "Snoring with choking sounds – Possible sleep apnea.",
                "Floating or foul-smelling stools – Fat malabsorption.",
                "Lightheadedness after standing – Low blood pressure or electrolyte imbalance.",
                "Unexplained mood swings – Hormonal or mental health imbalance.",
                "Hair loss with brittle nails – Thyroid or nutrient deficiency.",
                "Yellowing of skin or eyes – Early liver issues.",
                "Frequent gum bleeding – Vitamin C deficiency or clotting issues."
            ]
        },
        {
            "title": "SIGNS YOU'RE A STRONG PERSON",
            "content_lines": [
                "You keep going even when tired.",
                "You smile through pain.",
                "You forgive but never forget.",
                "You protect people even when hurt.",
                "You stay kind despite betrayal.",
                "You rise every time you fall.",
                "You keep your dignity in silence.",
                "You set boundaries instead of seeking revenge.",
                "You choose growth over validation.",
                "You stay calm when others try to provoke you."
            ]
        },
        {
            "title": "SECRETS DOCTORS WON'T TELL YOU (BUT YOUR BODY CRAVES!)",
            "content_lines": [
                "Drink water before coffee (hydrates your brain first).",
                "Walk barefoot on grass daily (reduces inflammation).",
                "Breathe through your nose only (boosts oxygen and immunity).",
                "Cold shower for 30 seconds (fires up metabolism).",
                "Eat a balanced meal with protein, healthy fats, and fiber within 30 minutes of waking (supports blood sugar and hormones).",
                "Hold your phone at eye level (reduces 'tech neck' pain).",
                "Sleep on your left side (aids digestion and heart health).",
                "Hum or sing daily (strengthens the vagus nerve).",
                "Use turmeric with black pepper (improves absorption significantly)."
            ]
        }
    ],
    "post_examples": [],
    "image_style_description": "Soft, minimal, calming wellness aesthetic. Clean backgrounds with natural textures — light wood, linen, soft greenery. Warm earth tones with gentle lighting. No clutter, no text overlays, no people's faces. Think: morning kitchen counter, sunlit herbs, peaceful nature close-ups.",
    "image_palette_keywords": ["soft green", "warm beige", "natural earth tones", "calming blue", "minimal white", "gentle gold", "sage", "linen", "eucalyptus", "terracotta"],
    "brand_personality": "Trusted wellness companion. We don't lecture — we share what we've learned. Like a knowledgeable friend who always has a new health tip that actually works. Approachable, evidence-informed, never preachy.",
    "brand_focus_areas": ["healthy aging", "natural nutrition", "daily wellness habits", "body awareness", "mental resilience", "longevity", "hormone balance", "gut health"],
    "hashtags": ["#health", "#wellness", "#healthylifestyle", "#nutrition", "#healthtips", "#wellnesstips", "#healthyliving", "#selfcare", "#holistichealth", "#naturalhealth"],
    "follow_section_text": "research-informed content on health, wellness, and longevity",
    "save_section_text": "improving their health naturally and living longer",
    "disclaimer_text": "This content is intended for educational and informational purposes only. It is not a substitute for professional medical advice, diagnosis, or treatment.",
    "cta_options": [
        {"label": "Follow", "text": "Follow for daily health tips that actually work"},
        {"label": "Save", "text": "Save this for when you need it most"},
        {"label": "Share", "text": "Share with someone who needs to see this"},
        {"label": "Comment", "text": "Comment which one surprised you the most"},
        {"label": "Turn On Notifications", "text": "Turn on notifications so you never miss a health tip"}
    ],
}

# Columns that store JSONB
JSONB_COLUMNS = {
    "topic_categories", "topic_keywords", "topic_avoid",
    "content_tone", "tone_avoid", "hook_themes",
    "reel_examples", "post_examples", "image_palette_keywords",
    "brand_focus_areas", "cta_options", "hashtags",
}


def main():
    config_id = str(uuid.uuid4())

    conn = psycopg2.connect(
        "postgresql://postgres.kzsbyzroknbradzyjvrc:S%2FTKe-vzBjys%263K@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
    )
    conn.autocommit = False
    cur = conn.cursor()

    # Build column lists
    columns = ["id", "user_id", "brand_id"] + list(DATA.keys())
    placeholders = ["%s"] * len(columns)

    values = [config_id, USER_ID, BRAND_ID]
    for col in DATA.keys():
        val = DATA[col]
        if col in JSONB_COLUMNS:
            values.append(json.dumps(val))
        else:
            values.append(val)

    # Build SET clause for ON CONFLICT (skip id, user_id, brand_id)
    update_cols = list(DATA.keys())
    set_clause = ", ".join(
        f"{col} = EXCLUDED.{col}" for col in update_cols
    )
    set_clause += ", updated_at = NOW()"

    sql = f"""
        INSERT INTO niche_config ({', '.join(columns)})
        VALUES ({', '.join(placeholders)})
        ON CONFLICT ON CONSTRAINT uq_niche_config_user_brand
        DO UPDATE SET {set_clause}
    """

    print(f"Inserting global niche_config for user {USER_ID}...")
    print(f"  brand_id: {BRAND_ID} (global)")
    print(f"  niche_name: {DATA['niche_name']}")
    print(f"  reel_examples count: {len(DATA['reel_examples'])}")

    cur.execute(sql, values)
    conn.commit()
    print("INSERT/UPDATE complete.")

    # Verify
    cur.execute(
        """
        SELECT id, user_id, brand_id, niche_name,
               jsonb_array_length(reel_examples) as reel_count,
               jsonb_array_length(post_examples) as post_count,
               jsonb_array_length(topic_categories) as cat_count,
               jsonb_array_length(content_tone) as tone_count,
               jsonb_array_length(hashtags) as hashtag_count,
               created_at, updated_at
        FROM niche_config
        WHERE user_id = %s AND brand_id IS NULL
        """,
        (USER_ID,),
    )
    row = cur.fetchone()
    if row:
        print("\n--- Verification ---")
        print(f"  id:               {row[0]}")
        print(f"  user_id:          {row[1]}")
        print(f"  brand_id:         {row[2]}")
        print(f"  niche_name:       {row[3]}")
        print(f"  reel_examples:    {row[4]} items")
        print(f"  post_examples:    {row[5]} items")
        print(f"  topic_categories: {row[6]} items")
        print(f"  content_tone:     {row[7]} items")
        print(f"  hashtags:         {row[8]} items")
        print(f"  created_at:       {row[9]}")
        print(f"  updated_at:       {row[10]}")
        print("\nAll 20 reel examples confirmed." if row[4] == 20 else f"\nWARNING: Expected 20 reel examples, got {row[4]}")
    else:
        print("ERROR: Row not found after insert!")

    cur.close()
    conn.close()
    print("\nDone.")


if __name__ == "__main__":
    main()
