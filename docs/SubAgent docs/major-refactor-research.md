# Major Refactor Research — Comprehensive Codebase Analysis

> Generated: 2026-02-18
> Files analyzed: 9 primary files + cross-reference searches

---

## Table of Contents

1. [File: NicheConfigForm.tsx](#1-nicheconfigformtsx)
2. [File: ContentExamplesSection.tsx](#2-contentexamplessectiontsx)
3. [File: niche-config.ts (TypeScript types)](#3-niche-configts)
4. [File: use-niche-config.ts (React Query hooks)](#4-use-niche-confights)
5. [File: niche_config.py (SQLAlchemy model)](#5-niche_configpy-model)
6. [File: niche_config_routes.py (API routes)](#6-niche_config_routespy)
7. [File: niche_config_service.py (Service layer)](#7-niche_config_servicepy)
8. [File: prompt_templates.py (Prompt templates)](#8-prompt_templatespy)
9. [File: prompt_context.py (PromptContext class)](#9-prompt_contextpy)
10. [Cross-Reference: image_style_description](#10-cross-reference-image_style_description)
11. [Cross-Reference: image_palette_keywords](#11-cross-reference-image_palette_keywords)
12. [Cross-Reference: cta_options](#12-cross-reference-cta_options)
13. [Cross-Reference: reel_examples & post_examples](#13-cross-reference-reel_examples--post_examples)
14. [Image Generation: Thumbnails vs Content Images](#14-image-generation-thumbnails-vs-content-images)
15. [Dimensions: Reels vs Posts](#15-dimensions-reels-vs-posts)
16. [Supporting Files: cta.py, constants.py, image_generator.py](#16-supporting-files)
17. [Key Findings Summary](#17-key-findings-summary)

---

## 1. NicheConfigForm.tsx

**Path:** `src/features/brands/components/NicheConfigForm.tsx`

```tsx
// Line 1
import { useState, useEffect } from 'react'
// Line 2
import { Save, Loader2, Dna, ChevronDown, ChevronRight, Info, Sparkles, Film, LayoutGrid } from 'lucide-react'
// Line 3
import toast from 'react-hot-toast'
// Line 4
import { useNicheConfig, useUpdateNicheConfig, useAiUnderstanding } from '../api/use-niche-config'
// Line 5
import { ConfigStrengthMeter } from './ConfigStrengthMeter'
// Line 6
import { ContentExamplesSection } from './ContentExamplesSection'
// Line 7
import { TagInput } from './TagInput'
// Line 8
import { ChipSelect } from './ChipSelect'
// Line 9
import type { NicheConfig } from '../types/niche-config'
// Line 10
import { PostCanvas, DEFAULT_GENERAL_SETTINGS } from '@/shared/components/PostCanvas'
// Line 11
import { CarouselTextSlide } from '@/shared/components/CarouselTextSlide'
// Line 12
// Line 13
const TONE_OPTIONS = [
// Line 14
  'calm', 'authoritative', 'educational', 'empowering', 'casual',
// Line 15
  'energetic', 'scientific', 'friendly', 'confident', 'direct',
// Line 16
  'warm', 'inspirational', 'professional', 'conversational',
// Line 17
]
// Line 18
// Line 19
const TONE_AVOID_OPTIONS = [
// Line 20
  'clinical', 'salesy', 'aggressive', 'academic', 'poetic',
// Line 21
  'overly creative', 'robotic', 'preachy', 'condescending',
// Line 22
]
// Line 23
// Line 24
const NICHE_SUGGESTIONS = [
// Line 25
  'Health & Wellness',
// Line 26
  'Personal Finance',
// Line 27
  'Technology & AI',
// Line 28
  'Fitness & Training',
// Line 29
  'Cooking & Nutrition',
// Line 30
  'Parenting & Family',
// Line 31
  'Mental Health',
// Line 32
  'Business & Entrepreneurship',
// Line 33
  'Education & Learning',
// Line 34
  'Beauty & Skincare',
// Line 35
]
// Line 36
// Line 37
const DEFAULT_CONFIG: NicheConfig = {
// Line 38
  niche_name: '',
// Line 39
  niche_description: '',
// Line 40
  target_audience: '',
// Line 41
  audience_description: '',
// Line 42
  content_tone: [],
// Line 43
  tone_avoid: [],
// Line 44
  topic_categories: [],
// Line 45
  topic_keywords: [],
// Line 46
  topic_avoid: [],
// Line 47
  content_philosophy: '',
// Line 48
  hook_themes: [],
// Line 49
  reel_examples: [],
// Line 50
  post_examples: [],
// Line 51
  image_style_description: '',
// Line 52
  image_palette_keywords: [],
// Line 53
  brand_personality: null,
// Line 54
  brand_focus_areas: [],
// Line 55
  parent_brand_name: '',
// Line 56
  cta_options: [],
// Line 57
  hashtags: [],
// Line 58
  follow_section_text: '',
// Line 59
  save_section_text: '',
// Line 60
  disclaimer_text: '',
// Line 61
}
// Line 62
// Line 63
interface CollapsibleSectionProps {
// Line 64
  title: string
// Line 65
  icon: string
// Line 66
  hint: string
// Line 67
  defaultOpen?: boolean
// Line 68
  children: React.ReactNode
// Line 69
}
// Line 70
// Line 71
function CollapsibleSection({ title, icon, hint, defaultOpen = false, children }: CollapsibleSectionProps) {
// Line 72
  const [open, setOpen] = useState(defaultOpen)
// Line 73
// Line 74
  return (
// Line 75
    <div className="border border-gray-200 rounded-lg overflow-hidden">
// Line 76
      <button
// Line 77
        type="button"
// Line 78
        onClick={() => setOpen(!open)}
// Line 79
        className="w-full flex items-center justify-between px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
// Line 80
      >
// Line 81
        <div className="flex items-center gap-2">
// Line 82
          <span>{icon}</span>
// Line 83
          <span className="font-medium text-gray-900">{title}</span>
// Line 84
        </div>
// Line 85
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
// Line 86
      </button>
// Line 87
      {open && (
// Line 88
        <div className="px-5 pb-5 pt-1 border-t border-gray-100">
// Line 89
          <div className="flex items-start gap-1.5 mb-4 text-xs text-gray-400">
// Line 90
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
// Line 91
            <span>{hint}</span>
// Line 92
          </div>
// Line 93
          {children}
// Line 94
        </div>
// Line 95
      )}
// Line 96
    </div>
// Line 97
  )
// Line 98
}
// Line 99
// Line 100
export function NicheConfigForm({ brandId }: { brandId?: string }) {
// Line 101
  const { data, isLoading } = useNicheConfig(brandId)
// Line 102
  const updateMutation = useUpdateNicheConfig()
// Line 103
  const aiMutation = useAiUnderstanding()
// Line 104
// Line 105
  const [values, setValues] = useState<NicheConfig>(DEFAULT_CONFIG)
// Line 106
  const [dirty, setDirty] = useState(false)
// Line 107
  const [aiResult, setAiResult] = useState<{
// Line 108
    understanding: string
// Line 109
    example_reel: { title: string; content_lines: string[] } | null
// Line 110
    example_post: { title: string; slides: string[] } | null
// Line 111
  } | null>(null)
// Line 112
// Line 113
  useEffect(() => {
// Line 114
    if (data) {
// Line 115
      setValues({ ...DEFAULT_CONFIG, ...data })
// Line 116
      setDirty(false)
// Line 117
    }
// Line 118
  }, [data])
// Line 119
// Line 120
  const update = <K extends keyof NicheConfig>(key: K, value: NicheConfig[K]) => {
// Line 121
    setValues((prev) => ({ ...prev, [key]: value }))
// Line 122
    setDirty(true)
// Line 123
  }
// Line 124
// Line 125
  const handleSave = async () => {
// Line 126
    try {
// Line 127
      await updateMutation.mutateAsync({ ...values, brand_id: brandId ?? null })
// Line 128
      toast.success('Content DNA saved')
// Line 129
      setDirty(false)
// Line 130
    } catch {
// Line 131
      toast.error('Failed to save')
// Line 132
    }
// Line 133
  }
// Line 134
// Line 135
  const handleAiUnderstanding = async () => {
// Line 136
    try {
// Line 137
      const result = await aiMutation.mutateAsync(brandId)
// Line 138
      setAiResult(result)
// Line 139
    } catch {
// Line 140
      toast.error('Failed to generate AI understanding')
// Line 141
    }
// Line 142
  }
// Line 143
// Line 144
  if (isLoading) {
// Line 145
    return (
// Line 146
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-center justify-center h-40">
// Line 147
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
// Line 148
      </div>
// Line 149
    )
// Line 150
  }
// Line 151
// Line 152
  return (
// Line 153
    <div className="space-y-4">
// Line 154
      {/* Header */}
// Line 155
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
// Line 156
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
// Line 157
          <div>
// Line 158
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
// Line 159
              <Dna className="w-5 h-5 text-primary-500" />
// Line 160
              Content DNA
// Line 161
            </h2>
// Line 162
            <p className="text-sm text-gray-500 mt-1">
// Line 163
              Define what your AI-generated content is about. These settings control every reel, post, and visual.
// Line 164
            </p>
// Line 165
          </div>
// Line 166
          <button
// Line 167
            onClick={handleSave}
// Line 168
            disabled={!dirty || updateMutation.isPending}
// Line 169
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
// Line 170
          >
// Line 171
            {updateMutation.isPending ? (
// Line 172
              <Loader2 className="w-4 h-4 animate-spin" />
// Line 173
            ) : (
// Line 174
              <Save className="w-4 h-4" />
// Line 175
            )}
// Line 176
            Save
// Line 177
          </button>
// Line 178
        </div>
// Line 179
// Line 180
        <div className="px-6 py-4">
// Line 181
          <ConfigStrengthMeter config={values} />
// Line 182
        </div>
// Line 183
      </div>
// Line 184
// Line 185
      {/* Sections */}
// Line 186
      <CollapsibleSection
// Line 187
        title="Niche & Audience"
// Line 188
        icon="📍"
// Line 189
        hint="These define your content's core identity — who you're creating for and what your brand is about."
// Line 190
        defaultOpen
// Line 191
      >
// Line 192-234: Niche & Audience fields: niche_name, niche_description, target_audience, audience_description, parent_brand_name
// Line 235
      </CollapsibleSection>
// Line 236
// Line 237
      <CollapsibleSection title="Topics & Categories" icon="📂" hint="What subjects your reels and posts cover.">
// Line 238-263: topic_categories, topic_keywords, topic_avoid TagInputs
// Line 264
      </CollapsibleSection>
// Line 265
// Line 266
      <CollapsibleSection title="Tone & Style" icon="🎨" hint="The voice and personality of your content.">
// Line 267-299: content_tone ChipSelect, tone_avoid ChipSelect, content_philosophy textarea
// Line 300
      </CollapsibleSection>
// Line 301
// Line 302
      <CollapsibleSection title="Content Examples" icon="📝" hint="The AI learns directly from your examples.">
// Line 303
        <ContentExamplesSection
// Line 304
          reelExamples={values.reel_examples}
// Line 305
          postExamples={values.post_examples}
// Line 306
          onReelExamplesChange={(v) => update('reel_examples', v)}
// Line 307
          onPostExamplesChange={(v) => update('post_examples', v)}
// Line 308
        />
// Line 309
      </CollapsibleSection>
// Line 310
// Line 311
      <CollapsibleSection title="Visual Style" icon="🖼️" hint="Controls AI-generated background images.">
// Line 312-353: image_style_description textarea, image_palette_keywords TagInput
// Line 354
      </CollapsibleSection>
// Line 355
// Line 356
      <CollapsibleSection title="CTAs & Hashtags" icon="💬" hint="Calls-to-action and hashtags.">
// Line 357-406: hashtags TagInput, follow_section_text, save_section_text, disclaimer_text textareas
// Line 407
      </CollapsibleSection>
// Line 408
// Line 409-477: AI Understanding section with PostCanvas and CarouselTextSlide previews
// Line 478
    </div>
// Line 479
  )
// Line 480
}
```

**Key observations:**
- Form has 7 collapsible sections: Niche & Audience, Topics & Categories, Tone & Style, Content Examples, Visual Style, CTAs & Hashtags
- `cta_options` is in DEFAULT_CONFIG (line 56) but **NO UI section exists for it** — it's never rendered in the form
- AI Understanding section uses `PostCanvas` (1080×1350 at 0.2 scale) and `CarouselTextSlide` for previews
- All values stored locally and saved via PUT to `/api/v2/brands/niche-config`

---

## 2. ContentExamplesSection.tsx

**Path:** `src/features/brands/components/ContentExamplesSection.tsx`

```tsx
// Line 1
import { useState } from 'react'
// Line 2
import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react'
// Line 3
import type { ReelExample, PostExample } from '../types/niche-config'
// Line 4
// Line 5
interface ContentExamplesSectionProps {
// Line 6
  reelExamples: ReelExample[]
// Line 7
  postExamples: PostExample[]
// Line 8
  onReelExamplesChange: (examples: ReelExample[]) => void
// Line 9
  onPostExamplesChange: (examples: PostExample[]) => void
// Line 10
}
// Line 11
// Line 12-98: ReelExampleCard component
//   - Expandable card with title input + numbered content_lines (max 15 lines)
//   - Title placeholder: "SIGNS YOUR BODY IS BEGGING FOR MAGNESIUM"
//   - Line editing: add/remove individual lines
// Line 99
// Line 100-162: PostExampleCard component
//   - Expandable card with title input + numbered slides (max 15 slides)
//   - Title placeholder: "WHY COLLAGEN SUPPLEMENTS MIGHT NOT BE ENOUGH"
//   - Slide editing: textarea per slide (3 rows), add/remove
// Line 163
// Line 164-248: ContentExamplesSection export
//   - Shows empty state when no examples
//   - Reel Examples section: "X of 20" counter, limit 20
//   - Post Examples section: "X of 20" counter, limit 20
//   - Note: "CTA is automatically added as the final line — don't include it here"
```

**Key observations:**
- ReelExample: `{ title, content_lines[] }` — max 15 lines, max 20 examples
- PostExample: `{ title, slides[] }` — max 15 slides, max 20 examples
- No metadata fields (no topic, no format_style, no tags)
- CTA note tells user not to include CTA in examples

---

## 3. niche-config.ts

**Path:** `src/features/brands/types/niche-config.ts`

```ts
// Line 1
export interface ReelExample {
// Line 2
  title: string
// Line 3
  content_lines: string[]
// Line 4
}
// Line 5
// Line 6
export interface PostExample {
// Line 7
  title: string
// Line 8
  slides: string[]
// Line 9
}
// Line 10
// Line 11
export interface CtaOption {
// Line 12
  label: string
// Line 13
  text: string
// Line 14
}
// Line 15
// Line 16
export interface NicheConfig {
// Line 17
  id?: string | null
// Line 18
  brand_id?: string | null
// Line 19
// Line 20
  // Core Identity
// Line 21
  niche_name: string
// Line 22
  niche_description: string
// Line 23
  target_audience: string
// Line 24
  audience_description: string
// Line 25
  content_tone: string[]
// Line 26
  tone_avoid: string[]
// Line 27
// Line 28
  // Topics
// Line 29
  topic_categories: string[]
// Line 30
  topic_keywords: string[]
// Line 31
  topic_avoid: string[]
// Line 32
// Line 33
  // Content Philosophy
// Line 34
  content_philosophy: string
// Line 35
  hook_themes: string[]
// Line 36
// Line 37
  // Examples
// Line 38
  reel_examples: ReelExample[]
// Line 39
  post_examples: PostExample[]
// Line 40
// Line 41
  // Visual
// Line 42
  image_style_description: string
// Line 43
  image_palette_keywords: string[]
// Line 44
// Line 45
  // Brand Identity
// Line 46
  brand_personality: string | null
// Line 47
  brand_focus_areas: string[]
// Line 48
  parent_brand_name: string
// Line 49
// Line 50
  // CTAs
// Line 51
  cta_options: CtaOption[]
// Line 52
  hashtags: string[]
// Line 53
  follow_section_text: string
// Line 54
  save_section_text: string
// Line 55
  disclaimer_text: string
// Line 56
}
// Line 57
// Line 58
export type ConfigStrength = 'basic' | 'good' | 'excellent'
// Line 59
// Line 60
export function getConfigStrength(config: NicheConfig): ConfigStrength {
// Line 61
  let score = 0
// Line 62
  if (config.niche_name && config.niche_name !== 'Health & Wellness') score++
// Line 63
  if (config.niche_description) score++
// Line 64
  if (config.target_audience) score++
// Line 65
  if (config.audience_description) score++
// Line 66
  if (config.content_tone.length > 0) score++
// Line 67
  if (config.topic_categories.length > 0) score++
// Line 68
  if (config.content_philosophy) score++
// Line 69
  if (config.image_style_description) score++
// Line 70
// Line 71
  const totalExamples = config.reel_examples.length + config.post_examples.length
// Line 72
// Line 73
  if (score <= 2 && totalExamples < 3) return 'basic'
// Line 74
  if (score >= 6 && totalExamples >= 5) return 'excellent'
// Line 75
  return 'good'
// Line 76
}
// Line 77-96: getStrengthLabel, getStrengthColor, getStrengthBarColor, getStrengthPercent utility functions
```

**Key observations:**
- `CtaOption` has `{ label, text }` — but there's no UI for editing these in the form!
- `ConfigStrength` scoring: counts 8 fields + example count. Threshold: ≤2 fields + <3 examples = basic, ≥6 + ≥5 = excellent
- Still has hardcoded `'Health & Wellness'` check on line 62

---

## 4. use-niche-config.ts

**Path:** `src/features/brands/api/use-niche-config.ts`

```ts
// Line 1
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
// Line 2
import { apiClient } from '@/shared/api/client'
// Line 3
import type { NicheConfig } from '../types/niche-config'
// Line 4
// Line 5
const NICHE_CONFIG_KEY = ['niche-config'] as const
// Line 6
// Line 7
async function fetchNicheConfig(brandId?: string): Promise<NicheConfig> {
// Line 8
  const url = brandId
// Line 9
    ? `/api/v2/brands/niche-config?brand_id=${encodeURIComponent(brandId)}`
// Line 10
    : '/api/v2/brands/niche-config'
// Line 11
  return apiClient.get<NicheConfig>(url)
// Line 12
}
// Line 13
// Line 14
async function updateNicheConfig(data: Partial<NicheConfig> & { brand_id?: string | null }): Promise<NicheConfig> {
// Line 15
  return apiClient.put<NicheConfig>('/api/v2/brands/niche-config', data)
// Line 16
}
// Line 17
// Line 18
export function useNicheConfig(brandId?: string) {
// Line 19
  return useQuery({
// Line 20
    queryKey: [...NICHE_CONFIG_KEY, brandId ?? 'global'],
// Line 21
    queryFn: () => fetchNicheConfig(brandId),
// Line 22
    staleTime: 5 * 60 * 1000,
// Line 23
  })
// Line 24
}
// Line 25
// Line 26
export function useUpdateNicheConfig() {
// Line 27
  const queryClient = useQueryClient()
// Line 28
  return useMutation({
// Line 29
    mutationFn: updateNicheConfig,
// Line 30
    onSuccess: () => {
// Line 31
      queryClient.invalidateQueries({ queryKey: NICHE_CONFIG_KEY })
// Line 32
    },
// Line 33
  })
// Line 34
}
// Line 35
// Line 36-55: useAiUnderstanding mutation hook — POST to /api/v2/brands/niche-config/ai-understanding
```

**Key observations:**
- GET with optional `brand_id` query param
- PUT sends full config (Partial)
- 5-minute stale time
- AI Understanding is a mutation (POST), not a query

---

## 5. niche_config.py (Model)

**Path:** `app/models/niche_config.py`

```python
# Line 1
"""NicheConfig model — stores niche configuration per user/brand."""
# Line 2
# Line 3
from datetime import datetime
# Line 4
from sqlalchemy import Column, String, Text, DateTime, UniqueConstraint, ForeignKey
# Line 5
from sqlalchemy.dialects.postgresql import JSONB
# Line 6
from app.models.base import Base
# Line 7
import uuid
# Line 8
# Line 9
# Line 10
class NicheConfig(Base):
# Line 11
    __tablename__ = "niche_config"
# Line 12
# Line 13
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
# Line 14
    user_id = Column(String(100), nullable=False)
# Line 15
# Line 16
    # NULL brand_id = global config; non-NULL = per-brand override
# Line 17
    brand_id = Column(String(50), ForeignKey("brands.id", ondelete="CASCADE"), nullable=True)
# Line 18
# Line 19
    # Core Identity
# Line 20
    niche_name = Column(String(100), nullable=False, default="")
# Line 21
    niche_description = Column(Text, default="")
# Line 22
    target_audience = Column(String(255), default="")
# Line 23
    audience_description = Column(Text, default="")
# Line 24
    content_tone = Column(JSONB, default=[])
# Line 25
    tone_avoid = Column(JSONB, default=[])
# Line 26
# Line 27
    # Topic Configuration
# Line 28
    topic_categories = Column(JSONB, default=[])
# Line 29
    topic_keywords = Column(JSONB, default=[])
# Line 30
    topic_avoid = Column(JSONB, default=[])
# Line 31
# Line 32
    # Content Philosophy
# Line 33
    content_philosophy = Column(Text, default="")
# Line 34
    hook_themes = Column(JSONB, default=[])
# Line 35
# Line 36
    # User Examples (few-shot prompting)
# Line 37
    reel_examples = Column(JSONB, default=[])
# Line 38
    post_examples = Column(JSONB, default=[])
# Line 39
# Line 40
    # Visual Configuration
# Line 41
    image_style_description = Column(Text, default="")
# Line 42
    image_palette_keywords = Column(JSONB, default=[])
# Line 43
# Line 44
    # Brand Personality
# Line 45
    brand_personality = Column(Text, nullable=True)
# Line 46
    brand_focus_areas = Column(JSONB, default=[])
# Line 47
    parent_brand_name = Column(String(100), default="")
# Line 48
# Line 49
    # CTA Configuration
# Line 50
    cta_options = Column(JSONB, default=[])
# Line 51
    hashtags = Column(JSONB, default=[])
# Line 52
# Line 53
    # Caption sections
# Line 54
    follow_section_text = Column(Text, default="")
# Line 55
    save_section_text = Column(Text, default="")
# Line 56
    disclaimer_text = Column(Text, default="")
# Line 57
# Line 58
    # Timestamps
# Line 59
    created_at = Column(DateTime, default=datetime.utcnow)
# Line 60
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
# Line 61
# Line 62
    __table_args__ = (
# Line 63
        UniqueConstraint("user_id", "brand_id", name="uq_niche_config_user_brand"),
# Line 64
    )
```

**Key observations:**
- All defaults are empty strings/empty arrays — no hardcoded niche content
- Unique constraint on (user_id, brand_id)
- NULL brand_id = global config
- All JSONB columns default to `[]`

---

## 6. niche_config_routes.py

**Path:** `app/api/niche_config_routes.py`

```python
# Line 1
"""API routes for niche configuration (Content DNA)."""
# Line 2-12: imports
# Line 13
router = APIRouter(prefix="/niche-config", tags=["niche-config"])
# Line 14
# Line 15-22: EXAMPLE_LIMITS constants (max 20 reel/post examples, 15 lines/slides, 200 title length, 500 line length)
# Line 23
# Line 24-56: NicheConfigUpdate Pydantic schema — all fields Optional
# Line 57
# Line 58-95: validate_reel_examples() and validate_post_examples() — sanitize & enforce limits
# Line 96
# Line 97-131: _cfg_to_dict() — converts SQLAlchemy row to JSON dict (all JSONB fields get `or []` fallback)
# Line 132
# Line 133-179: GET "" — get_niche_config()
#   - If DB record exists: return _cfg_to_dict()
#   - If no record: returns defaults from PromptContext() — THIS IS THE FALLBACK PATH
# Line 180
# Line 181-216: PUT "" — update_niche_config()
#   - Validates examples if provided
#   - Upserts: finds existing or creates new
#   - Updates non-None fields via model_dump(exclude_unset=True)
#   - Invalidates cache via service.invalidate_cache()
# Line 217
# Line 218-311: POST "/ai-understanding" — get_ai_understanding()
#   - Builds config_summary from ctx fields
#   - Calls DeepSeek API with prompt to generate understanding + example_reel + example_post
#   - Returns JSON parsed response
```

**Key observations:**
- GET fallback uses `PromptContext()` directly — which now has **all empty defaults**
- PUT validation: reel_examples max 20, each max 15 content_lines, 200 char title, 500 char line
- AI understanding uses DeepSeek (not the same model as content generation)
- DeepSeek prompt on lines 275-293 asks for: 2-3 paragraph understanding, one reel example, one carousel post example

---

## 7. niche_config_service.py

**Path:** `app/services/content/niche_config_service.py`

```python
# Line 1-8: Docstring explaining strategy: load global → load per-brand → merge → return PromptContext → cache 5min
# Line 9
from typing import Optional
# Line 10
from datetime import datetime, timedelta
# Line 11
from app.core.prompt_context import PromptContext
# Line 12
# Line 13
class NicheConfigService:
# Line 14
    _cache: dict = {}
# Line 15
    _cache_ttl = timedelta(minutes=5)
# Line 16
    _cache_timestamps: dict = {}
# Line 17
# Line 18-27: get_context() — check cache, load if expired, return PromptContext
# Line 28
# Line 29-34: invalidate_cache() — clear specific brand/user or all
# Line 35
# Line 36-68: _load_and_merge() — queries DB for global+brand NicheConfig, applies to PromptContext
# Line 69
# Line 70-110: _apply_config() — field_map dict mapping all 22 DB fields to PromptContext attributes
#   Field map includes: niche_name, niche_description, target_audience, audience_description,
#   content_tone, tone_avoid, topic_categories, topic_keywords, topic_avoid,
#   content_philosophy, hook_themes, reel_examples, post_examples,
#   image_style_description, image_palette_keywords, brand_personality, brand_focus_areas,
#   parent_brand_name, cta_options, hashtags, follow_section_text, save_section_text, disclaimer_text
# Line 111
# Line 112-118: Singleton pattern — get_niche_config_service()
```

**Key observations:**
- Merge strategy: global first, brand-specific overrides non-NULL fields
- Cache is class-level (shared across instances) with 5-min TTL
- All 22 content fields are mapped 1:1 between DB model and PromptContext
- Cache key format: `"{user_id}:{brand_id or 'global'}"`

---

## 8. prompt_templates.py

**Path:** `app/core/prompt_templates.py`

```python
# Line 1-11: Module docstring — Layer 2 generator logic
# Line 12-18: Imports from viral_patterns and prompt_context
# Line 19
# Line 20-33: get_content_prompts() — loads 'reels_prompt', 'posts_prompt', 'brand_description' from app_settings DB table
# Line 34
# Line 35-71: build_system_prompt(ctx) — uses ctx.niche_name, ctx.topic_framing, ctx.hook_themes, ctx.tone_string, ctx.tone_avoid_string, ctx.content_philosophy
#   SYSTEM_PROMPT = build_system_prompt() ← backward-compat default with empty PromptContext
# Line 72
# Line 73-131: build_runtime_prompt(selection, ctx) — per-request reel generation prompt
#   - Uses selection.topic, selection.format_style, selection.primary_hook, selection.point_count
#   - Injects ctx.reel_examples via format_reel_examples() if ctx.has_reel_examples
#   - Appends brand_description and reels_prompt from DB
#   - JSON output: title, content_lines, image_prompt, format_style, topic_category, hook_type
# Line 132
# Line 133-159: build_runtime_prompt_with_history() — adds avoidance of recent titles/topics
# Line 160
# Line 161-200: build_correction_prompt() — regeneration when quality score is low
# Line 201
# Line 202-242: build_style_anchor() — ghost example for format style (structural, not content)
# Line 243
# Line 244-270: build_prompt_with_example() — style anchor or full example injection (rare)
# Line 271
# Line 272-283: IMAGE_PROMPT_SUFFIX, IMAGE_PROMPT_GUIDELINES constants
# Line 284
# Line 285-303: POST_QUALITY_SUFFIX — image quality string for posts
# Line 304
# Line 305-312: REEL_BASE_STYLE — base visual style for reel backgrounds
# Line 313
# Line 314-349: build_image_prompt_system(ctx) — uses ctx.niche_name, ctx.image_style_description
#   IMAGE_PROMPT_SYSTEM = build_image_prompt_system() ← backward-compat default
# Line 350
# Line 351-356: FALLBACK_PROMPTS, get_brand_palettes() — legacy, loads from DB
# Line 357
# Line 358-371: IMAGE_MODELS dict:
#   - posts: ZImageTurbo_INT8, 1088x1360, 8 steps
#   - reels: Flux1schnell, 1152x1920, 4 steps
# Line 372
# Line 373-376: CAROUSEL_SLIDE_EXAMPLES = [] ← empty, user examples used instead
# Line 377
# Line 378-555: build_post_content_prompt(count, history_context, topic_hint, ctx) — THE main post generation prompt
#   Key references to ctx:
#   - ctx.niche_name (line ~388)
#   - ctx.parent_brand_name (line ~388)
#   - ctx.target_audience (line ~388)
#   - ctx.audience_description (line ~390)
#   - ctx.topic_categories (lines ~403-405)
#   - ctx.content_philosophy (not directly in this prompt, but via examples)
#   - ctx.image_style_description (line ~517)
#   - ctx.disclaimer_text (line ~499)
#   - ctx.post_examples via format_post_examples() (line ~383-386)
#   - Injects brand_description and posts_prompt from app_settings DB (lines ~536-544)
# Line 556
# Line 557-565: get_post_content_prompt_for_display() — transparency page display
```

**Key observations:**
- `image_style_description` is used in:
  - `build_image_prompt_system()` (line 349): "Requirements: - {ctx.image_style_description}"
  - `build_post_content_prompt()` (line 517): "IMAGE PROMPT REQUIREMENTS: - {ctx.image_style_description}"
- `image_palette_keywords` is **NOT USED** in any prompt template — it exists in the data model but is never injected into prompts
- `cta_options` is **NOT USED** in prompt_templates.py — CTAs are handled by `cta.py` and `generator.py` separately
- `REEL_BASE_STYLE` (lines 305-312) is a hardcoded visual style that doesn't reference PromptContext
- `POST_QUALITY_SUFFIX` (lines 285-303) is hardcoded and doesn't reference PromptContext
- Two separate image models: posts (ZImageTurbo_INT8, 1088x1360) vs reels (Flux1schnell, 1152x1920)

---

## 9. prompt_context.py

**Path:** `app/core/prompt_context.py`

```python
# Line 1-9: Module docstring — PromptContext aggregated config, format rules NOT stored here
# Line 10
from dataclasses import dataclass, field
# Line 11
from typing import List, Optional
# Line 12
# Line 13
@dataclass
# Line 14
class PromptContext:
# Line 15
    # Core Identity
# Line 16
    niche_name: str = ""
# Line 17
    niche_description: str = ""
# Line 18
    target_audience: str = ""
# Line 19
    audience_description: str = ""
# Line 20
    content_tone: List[str] = field(default_factory=list)
# Line 21
    tone_avoid: List[str] = field(default_factory=list)
# Line 22
# Line 23
    # Topic Configuration
# Line 24
    topic_categories: List[str] = field(default_factory=list)
# Line 25
    topic_keywords: List[str] = field(default_factory=list)
# Line 26
    topic_avoid: List[str] = field(default_factory=list)
# Line 27
# Line 28
    # Content Philosophy
# Line 29
    content_philosophy: str = ""
# Line 30
    hook_themes: List[str] = field(default_factory=list)
# Line 31
# Line 32
    # User Examples
# Line 33
    reel_examples: List[dict] = field(default_factory=list)
# Line 34
    post_examples: List[dict] = field(default_factory=list)
# Line 35
# Line 36
    # Visual Style
# Line 37
    image_style_description: str = ""
# Line 38
    image_palette_keywords: List[str] = field(default_factory=list)
# Line 39
# Line 40
    # Brand Personality
# Line 41
    brand_personality: Optional[str] = None
# Line 42
    brand_focus_areas: List[str] = field(default_factory=list)
# Line 43
    parent_brand_name: str = ""
# Line 44
# Line 45
    # CTA/Caption
# Line 46
    cta_options: List[dict] = field(default_factory=list)
# Line 47
    hashtags: List[str] = field(default_factory=list)
# Line 48
    follow_section_text: str = ""
# Line 49
    save_section_text: str = ""
# Line 50
    disclaimer_text: str = ""
# Line 51
# Line 52
    # Derived properties
# Line 53
    @property
# Line 54
    def tone_string(self) -> str: return ", ".join(self.content_tone)
// Line 55-60: tone_avoid_string, topic_framing (first 6 keywords), hashtag_string
// Line 61-67: has_reel_examples, has_post_examples, example_count properties
# Line 68
# Line 69-91: format_reel_examples(examples) — formats as few-shot prompt injection
# Line 92-113: format_post_examples(examples) — formats as few-shot prompt injection for posts
```

**Key observations:**
- All defaults are empty — `PromptContext()` produces a completely blank context
- Computed properties: `tone_string`, `tone_avoid_string`, `topic_framing`, `hashtag_string`
- `has_reel_examples` / `has_post_examples` — boolean checks for conditional injection
- `format_reel_examples()` builds a "study these examples" instruction block
- `format_post_examples()` builds similar block for carousel posts

---

## 10. Cross-Reference: `image_style_description`

### All references in source code (excluding docs/):

| File | Line(s) | Usage |
|------|---------|-------|
| `app/core/prompt_context.py` | 43 | Field definition (`str = ""`) |
| `app/models/niche_config.py` | 41 | DB column (`Text, default=""`) |
| `app/services/content/niche_config_service.py` | 96 | Field mapping in `_apply_config()` |
| `app/api/niche_config_routes.py` | 46 | Pydantic schema field |
| `app/api/niche_config_routes.py` | 120 | `_cfg_to_dict()` serialization |
| `app/api/niche_config_routes.py` | 172 | GET fallback from PromptContext |
| `app/api/niche_config_routes.py` | 264-265 | AI understanding config_summary |
| `app/core/prompt_templates.py` | 349 | `build_image_prompt_system()`: "- {ctx.image_style_description}" |
| `app/core/prompt_templates.py` | 517 | `build_post_content_prompt()`: image prompt requirements |
| `src/features/brands/types/niche-config.ts` | 42 | TypeScript interface field |
| `src/features/brands/types/niche-config.ts` | 70 | Config strength scoring |
| `src/features/brands/components/NicheConfigForm.tsx` | 51 | DEFAULT_CONFIG |
| `src/features/brands/components/NicheConfigForm.tsx` | 339-340 | Form textarea binding |
| `scripts/create_niche_config_table.py` | 27 | DB table creation SQL |
| `scripts/populate_niche_config.py` | 340 | Seed data |
| `scripts/verify_niche_config.py` | 14, 31 | Verification query |

**Observation:** `image_style_description` is used in image prompt system AND post content prompt, but NOT in reel content generation prompts (only image generation).

### Where it's NOT used (but probably should be):
- `REEL_BASE_STYLE` constant (line 305-312 in prompt_templates.py) — hardcoded visual style
- `POST_QUALITY_SUFFIX` (line 285-303) — hardcoded quality description
- `AIBackgroundGenerator.generate_background()` — doesn't receive PromptContext

---

## 11. Cross-Reference: `image_palette_keywords`

### All references in source code (excluding docs/):

| File | Line(s) | Usage |
|------|---------|-------|
| `app/core/prompt_context.py` | 44 | Field definition (`List[str] = []`) |
| `app/models/niche_config.py` | 42 | DB column (`JSONB, default=[]`) |
| `app/services/content/niche_config_service.py` | 97 | Field mapping |
| `app/api/niche_config_routes.py` | 47, 121, 173 | Schema, serialization, fallback |
| `src/features/brands/types/niche-config.ts` | 43 | TypeScript field |
| `src/features/brands/components/NicheConfigForm.tsx` | 52, 349-350 | DEFAULT_CONFIG, TagInput binding |

**CRITICAL FINDING:** `image_palette_keywords` is **NEVER USED in any prompt template or image generation code**. It exists in the data model, DB, API, and frontend form, but is never injected into any AI prompt. It's a dead field.

---

## 12. Cross-Reference: `cta_options`

### Source code references (excluding docs/):

| File | Line(s) | Usage |
|------|---------|-------|
| `app/core/prompt_context.py` | 52 | Field definition (`List[dict] = []`) |
| `app/core/cta.py` | 14 | Global `CTA_OPTIONS = {}` (empty default) |
| `app/core/cta.py` | 17-28 | `get_cta_options(ctx)`: prefers `ctx.cta_options`, falls back to empty `CTA_OPTIONS` |
| `app/core/cta.py` | 31-46 | `get_cta_line(cta_type)`: random CTA line from `CTA_OPTIONS` (**never uses ctx!**) |
| `app/models/niche_config.py` | 50 | DB column (`JSONB, default=[]`) |
| `app/services/content/niche_config_service.py` | 101 | Field mapping |
| `app/api/niche_config_routes.py` | 51, 125, 177 | Schema, serialization, fallback |
| `app/services/media/caption_generator.py` | 32 | `CTA_OPTIONS = {}` (empty) |
| `app/services/media/caption_generator.py` | 189-197 | Uses `ctx.cta_options` if available, else hardcoded |
| `app/services/content/generator.py` | 116 | `CTA_OPTIONS = {` (hardcoded in class) |
| `app/services/content/generator.py` | 510, 519 | Used in CTA selection logic |
| `src/features/brands/types/niche-config.ts` | 11-14, 51 | `CtaOption` interface, NicheConfig field |
| `src/features/brands/components/NicheConfigForm.tsx` | 56 | DEFAULT_CONFIG (empty array) |

**CRITICAL FINDINGS:**
1. `cta_options` has **NO UI FORM** — it's in the TypeScript type and DEFAULT_CONFIG but there's no form field to edit it
2. `generator.py` has its own hardcoded `CTA_OPTIONS` dict (line 116) that ignores the NicheConfig
3. `cta.py`'s `get_cta_line()` function uses the global `CTA_OPTIONS = {}` and **never receives ctx**
4. `caption_generator.py` does use `ctx.cta_options` (line 191) but falls back to its own empty dict
5. Net result: CTAs are effectively dead in the current system — no hardcoded values AND no UI to configure them

---

## 13. Cross-Reference: `reel_examples` & `post_examples`

### Used in prompt injection:

| File | Context |
|------|---------|
| `app/core/prompt_context.py` | `format_reel_examples()` — builds few-shot prompt for reels |
| `app/core/prompt_context.py` | `format_post_examples()` — builds few-shot prompt for posts |
| `app/core/prompt_templates.py:build_runtime_prompt()` | Injects reel examples before generation instructions if `ctx.has_reel_examples` |
| `app/core/prompt_templates.py:build_post_content_prompt()` | Uses `format_post_examples(ctx.post_examples)` if available, else empty `CAROUSEL_SLIDE_EXAMPLES` |

### Data flow:
```
Frontend (ContentExamplesSection) → PUT /niche-config → DB (JSONB) →
NicheConfigService → PromptContext.reel_examples/post_examples →
format_reel_examples() / format_post_examples() → injected into prompts
```

---

## 14. Image Generation: Thumbnails vs Content Images

### Reel Images (app/services/media/image_generator.py)

The `ImageGenerator` class generates THREE types of images for reels:

| Method | Output | Dimensions | Description |
|--------|--------|-----------|-------------|
| `generate_thumbnail()` | Reel thumbnail | 1080×1920 | Title card: background + centered title text + brand name |
| `generate_reel_image()` | Full reel image | 1080×1920 | Background + title bars + numbered content lines + CTA |
| `generate_youtube_thumbnail()` | YouTube thumb | 1080×1920 (JPEG) | Clean AI image only, no text overlay, <2MB |

**Reel thumbnail generation flow:**
1. Light mode: solid `#f4f4f4` background
2. Dark mode: AI-generated background via `AIBackgroundGenerator` + 55% dark overlay
3. Title centered vertically (auto-fit 75-98px font, prefer 3 lines, max 4 lines)
4. Brand name below title

**Reel image generation flow:**
1. Light mode: solid `#f4f4f4` background
2. Dark mode: AI background + 85% dark overlay (more opaque than thumbnail for readability)
3. Title at y=280 with colored background bars (stepped effect)
4. Content lines with `**bold**` markdown support, auto-wrapping, auto-font-scaling
5. Sequential numbering on ALL lines (including CTA)
6. Brand name at bottom

**AI Background Generation** (`ai_background.py`):
- Uses deAPI with `Flux1schnell` model
- Always generates at reel dimensions: REEL_WIDTH×REEL_HEIGHT (1080×1920), rounded to 128px multiples → 1152×1920
- Global FIFO semaphore for rate limiting
- Retry with exponential backoff for 429s

### Post Images

Post images use a **completely different pipeline**:
- Frontend: `PostCanvas.tsx` (Konva.js) renders 1080×1350 cover slides
- Backend: `ZImageTurbo_INT8` model generates AI backgrounds at 1088×1360 (rounded from 1080×1350)
- Post content/text slides: `CarouselTextSlide.tsx` renders text-only slides at 1080×1350

**Key difference:** Reel images are generated by Pillow (Python backend), post images are rendered by Konva (React frontend) + AI backgrounds generated separately.

---

## 15. Dimensions: Reels vs Posts

### Defined in `app/core/constants.py`:

```python
# Reels (9:16 portrait)
REEL_WIDTH = 1080
REEL_HEIGHT = 1920

# Posts (4:5 portrait)
POST_WIDTH = 1080
POST_HEIGHT = 1350
```

### AI Image Generation Dimensions (from `prompt_templates.py` IMAGE_MODELS):

| Content Type | Model | AI Generation Size | Final Render Size | Aspect Ratio |
|-------------|-------|-------------------|------------------|--------------|
| Reels | Flux1schnell | 1152×1920 (128px-rounded) | 1080×1920 | 9:16 |
| Posts | ZImageTurbo_INT8 | 1088×1360 (128px-rounded) | 1080×1350 | 4:5 |

### Frontend Canvas Dimensions:

| Component | Width | Height | Use |
|-----------|-------|--------|-----|
| `PostCanvas.tsx` | 1080 | 1350 | Post cover slide |
| `CarouselTextSlide.tsx` | 1080 | 1350 | Post text slides |
| AI Understanding preview | 1080×1350 × 0.2 scale = 216×270 | Preview thumbnails |

### Reel Video Settings (from constants.py):
- Duration: 7 seconds
- Codec: H.264 (libx264)
- Pixel format: yuv420p

---

## 16. Supporting Files

### app/core/cta.py (full content)

```python
# Line 1-7: Docstring
# Line 8-9: imports
# Line 10-11: from app.core.prompt_context import PromptContext
# Line 12
# Line 13-14: CTA_OPTIONS: Dict = {} ← EMPTY by default
# Line 15
# Line 16-28: get_cta_options(ctx) — converts ctx.cta_options list to dict format
# Line 29
# Line 30-46: get_cta_line(cta_type) — picks random variation from CTA_OPTIONS
#             NOTE: Never receives ctx, always uses global empty CTA_OPTIONS
# Line 47
# Line 48-53: get_available_cta_types() — returns descriptions from CTA_OPTIONS
```

### app/core/constants.py (full content)

```python
# Image dimensions
REEL_WIDTH = 1080          # Line 5
REEL_HEIGHT = 1920         # Line 6
POST_WIDTH = 1080          # Line 9
POST_HEIGHT = 1350         # Line 10

# Video settings
VIDEO_DURATION = 7         # Line 13
VIDEO_CODEC = "libx264"    # Line 14

# Text rendering limits
MAX_TITLE_LENGTH = 90      # Line 19
MIN_TITLE_LENGTH = 55      # Line 20
MAX_LINE_LENGTH = 80       # Line 21
MAX_CONTENT_LINES = 10     # Line 22

# Fonts
FONT_BOLD = "Poppins-Bold.ttf"                           # Line 28
FONT_CONTENT_REGULAR = "Inter/static/Inter_24pt-Regular.ttf"  # Line 29
FONT_CONTENT_MEDIUM = "Inter/static/Inter_24pt-Medium.ttf"    # Line 30
USE_BOLD_CONTENT = True                                    # Line 34

# Font sizes
TITLE_FONT_SIZE = 80       # Line 37
CONTENT_FONT_SIZE = 44     # Line 38
BRAND_FONT_SIZE = 40       # Line 39

# Spacing
SIDE_MARGIN = 80           # Line 42
H_PADDING = 20             # Line 43
TITLE_SIDE_PADDING = 90    # Line 44
CONTENT_SIDE_PADDING = 108 # Line 45
TITLE_CONTENT_SPACING = 70 # Line 46
BOTTOM_MARGIN = 280        # Line 47
BAR_HEIGHT = 100           # Line 48
BAR_GAP = 0                # Line 49
VERTICAL_CORRECTION = -3   # Line 50
LINE_SPACING = 20          # Line 51
CONTENT_LINE_SPACING = 1.5 # Line 52
```

---

## 17. Key Findings Summary

### Dead/Unused Fields

1. **`image_palette_keywords`** — Stored in DB, shown in UI, but **NEVER injected into any prompt**. Completely unused in the generation pipeline.

2. **`cta_options`** — Has TypeScript type (`CtaOption`) and DB column, but:
   - **No UI form field** to edit it
   - `get_cta_line()` in `cta.py` never receives PromptContext
   - `generator.py` has its own hardcoded CTA_OPTIONS
   - Net effect: CTAs are broken/dead in the system

3. **`hook_themes`** — In the data model but `build_system_prompt()` uses `ctx.hook_themes` which defaults to `[]`, meaning it renders as empty in the system prompt.

### Architecture Gaps

4. **Post vs Reel image generation is split across two completely different systems:**
   - Reels: Python Pillow (backend) — `ImageGenerator` class
   - Posts: React Konva (frontend) — `PostCanvas.tsx` + `CarouselTextSlide.tsx`

5. **AI Background generation always uses reel dimensions** — `AIBackgroundGenerator` hardcodes `REEL_WIDTH`/`REEL_HEIGHT`. Post backgrounds use a different model+dimensions but through a different path.

6. **`REEL_BASE_STYLE` and `POST_QUALITY_SUFFIX`** are hardcoded visual style constants that don't use `ctx.image_style_description`.

### Data Flow Summary

```
Frontend NicheConfigForm
    ↓ PUT /api/v2/brands/niche-config
niche_config_routes.py (validate + upsert)
    ↓ writes to
niche_config table (PostgreSQL/Supabase)
    ↓ read by
NicheConfigService._load_and_merge()
    ↓ returns
PromptContext dataclass
    ↓ passed to
prompt_templates.py (build_system_prompt, build_runtime_prompt, build_post_content_prompt)
    ↓ generates
AI content via DeepSeek API
```

### Fields with Full Pipeline Coverage (DB → API → Service → PromptContext → Prompt)
- `niche_name`, `niche_description`, `target_audience`, `audience_description`
- `content_tone`, `tone_avoid`
- `topic_categories`, `topic_keywords`
- `content_philosophy`
- `reel_examples`, `post_examples` (via format functions)
- `image_style_description` (in image prompt + post prompt)
- `parent_brand_name`, `disclaimer_text`

### Fields Missing from Prompt Injection
- `image_palette_keywords` — NEVER used in prompts
- `cta_options` — broken pipeline
- `hook_themes` — in system prompt but defaults empty
- `topic_avoid` — in PromptContext but not referenced in any prompt template
- `brand_personality` — in PromptContext but not referenced in any prompt template
- `brand_focus_areas` — in PromptContext but not referenced in any prompt template
- `follow_section_text` — only used in caption_generator.py
- `save_section_text` — only used in caption_generator.py
