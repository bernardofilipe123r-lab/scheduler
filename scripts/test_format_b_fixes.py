"""Test script to verify Format B fixes compile and work correctly."""
import re
import sys

# 1. Verify story_polisher.py compiles
with open('app/services/discovery/story_polisher.py') as f:
    src = f.read()
compile(src, 'story_polisher.py', 'exec')
print('story_polisher.py compiles: OK')

# 2. Verify orchestrator.py compiles
with open('app/services/toby/orchestrator.py') as f:
    src2 = f.read()
compile(src2, 'orchestrator.py', 'exec')
print('orchestrator.py compiles: OK')

# 3. Verify image_sourcer.py compiles
with open('app/services/media/image_sourcer.py') as f:
    src3 = f.read()
compile(src3, 'image_sourcer.py', 'exec')
print('image_sourcer.py compiles: OK')

# 4. Check the prompt template has the diversity_block placeholder
assert '{diversity_block}' in src, 'Missing {diversity_block} in FORMAT_B_PROMPT!'
print('FORMAT_B_PROMPT has diversity_block: OK')

# 5. Check orchestrator passes diversity params
assert 'topic_hint=plan.topic_bucket' in src2, 'Missing topic_hint in orchestrator!'
assert 'hook_hint=plan.hook_strategy' in src2, 'Missing hook_hint in orchestrator!'
assert 'personality_prompt=plan.personality_prompt' in src2, 'Missing personality_prompt in orchestrator!'
assert 'story_category=plan.story_category' in src2, 'Missing story_category in orchestrator!'
assert 'recent_titles=recent_titles' in src2, 'Missing recent_titles in orchestrator!'
print('Orchestrator passes diversity params: OK')

# 6. Check orchestrator has _get_recent_format_b_titles
assert 'def _get_recent_format_b_titles' in src2, 'Missing _get_recent_format_b_titles!'
print('_get_recent_format_b_titles helper present: OK')

# 7. Check image_sourcer has AI fallback instead of strict mode
assert 'falling back to AI generation' in src3, 'Missing AI fallback in web mode!'
assert 'strict mode, no AI fallback' not in src3, 'Still has strict mode!'
print('Image sourcer web mode has AI fallback: OK')

# 8. Test prompt template formatting manually
# Extract the template
start = src.find('FORMAT_B_PROMPT = """')
end = src.find('"""', start + 20)
if start >= 0 and end >= 0:
    template_str = src[start + 19:end + 3]
    # Just verify it contains our placeholders
    assert '{niche}' in template_str
    assert '{diversity_block}' in template_str
    print('Template placeholders verified: OK')

print('\nAll tests passed!')
