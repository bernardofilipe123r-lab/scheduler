"""Test the new V2 content generation architecture."""

from app.core.viral_patterns import get_pattern_selector, PatternSelection
from app.core.prompt_templates import SYSTEM_PROMPT, build_runtime_prompt
from app.core.quality_scorer import get_quality_scorer, QualityScore
from app.services.content_generator_v2 import ContentGenerator

print('✅ All imports successful!')

# Test pattern selection
selector = get_pattern_selector()
selection = selector.select_patterns(topic_hint='sleep optimization')
print(f'✅ Pattern selected: {selection.format_style}, {selection.primary_hook}')

# Test prompt building
prompt = build_runtime_prompt(selection)
print(f'✅ Runtime prompt length: {len(prompt)} chars (target: <2000)')

# Test quality scoring
scorer = get_quality_scorer()
test_content = {
    'title': 'SIGNS YOUR BODY NEEDS MORE SLEEP',
    'content_lines': [
        'Waking up tired — Deep sleep deficit',
        'Afternoon crashes — Circadian disruption',
        'Brain fog — Memory consolidation issues',
        'Mood swings — Hormone imbalance',
        'Slow recovery — Repair cycle incomplete'
    ],
    'format_style': 'CAUSE_EFFECT',
    'topic_category': 'sleep optimization',
    'hook_type': 'curiosity'
}
score = scorer.score(test_content)
print(f'✅ Quality score: {score.total_score}/100')
print(f'   Structure: {score.structure_score}, Familiarity: {score.familiarity_score}')
print(f'   Novelty: {score.novelty_score}, Hook: {score.hook_score}, Plausibility: {score.plausibility_score}')

print('\n🎉 All V2 architecture components working!')
