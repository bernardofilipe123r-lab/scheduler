import {
  Lightbulb,
  Repeat2,
  TrendingUp,
  Flame,
  LineChart,
  Target,
  FlaskConical,
  Brain,
  Zap,
  Activity,
} from 'lucide-react'

export const STRATEGY_META: Record<string, { label: string; icon: typeof Lightbulb; color: string; bg: string; desc: string }> = {
  // Toby strategies
  explore: {
    label: 'Explore',
    icon: Lightbulb,
    color: 'text-blue-600',
    bg: 'bg-blue-50 border-blue-200',
    desc: 'New topic or unique angle',
  },
  iterate: {
    label: 'Iterate',
    icon: Repeat2,
    color: 'text-amber-600',
    bg: 'bg-amber-50 border-amber-200',
    desc: 'Better version of underperformer',
  },
  double_down: {
    label: 'Double Down',
    icon: TrendingUp,
    color: 'text-green-600',
    bg: 'bg-green-50 border-green-200',
    desc: 'Variation of top performer',
  },
  trending: {
    label: 'Trending',
    icon: Flame,
    color: 'text-red-500',
    bg: 'bg-red-50 border-red-200',
    desc: 'Adapted from external viral content',
  },
  // Lexi strategies
  analyze: {
    label: 'Analyze',
    icon: LineChart,
    color: 'text-violet-600',
    bg: 'bg-violet-50 border-violet-200',
    desc: 'Pattern-matched from top performers',
  },
  refine: {
    label: 'Refine',
    icon: Target,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50 border-cyan-200',
    desc: 'A/B test improving one variable',
  },
  systematic: {
    label: 'Systematic',
    icon: FlaskConical,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50 border-indigo-200',
    desc: 'Structured content experiment',
  },
  compound: {
    label: 'Compound',
    icon: TrendingUp,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 border-emerald-200',
    desc: 'Extending a winning series',
  },
}

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-600',
}

export const AGENT_GRADIENTS = [
  'from-amber-500 to-orange-500',
  'from-violet-500 to-purple-500',
  'from-cyan-500 to-blue-500',
  'from-emerald-500 to-teal-500',
  'from-rose-500 to-pink-500',
  'from-indigo-500 to-sky-500',
  'from-lime-500 to-green-500',
  'from-fuchsia-500 to-purple-500',
]

export const AGENT_COLORS = [
  { color: 'text-amber-600', bg: 'bg-amber-50 border-amber-300', pill: 'bg-amber-500' },
  { color: 'text-violet-600', bg: 'bg-violet-50 border-violet-300', pill: 'bg-violet-500' },
  { color: 'text-cyan-600', bg: 'bg-cyan-50 border-cyan-300', pill: 'bg-cyan-500' },
  { color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-300', pill: 'bg-emerald-500' },
  { color: 'text-rose-600', bg: 'bg-rose-50 border-rose-300', pill: 'bg-rose-500' },
  { color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-300', pill: 'bg-indigo-500' },
  { color: 'text-lime-600', bg: 'bg-lime-50 border-lime-300', pill: 'bg-lime-500' },
  { color: 'text-fuchsia-600', bg: 'bg-fuchsia-50 border-fuchsia-300', pill: 'bg-fuchsia-500' },
]

export const AGENT_ICONS = [Brain, LineChart, Zap, Target, Flame, FlaskConical, Lightbulb, Activity]

export function getAgentMeta(agentId: string, index?: number) {
  // Stable color assignment: known agents get fixed indices, rest hash by name
  const KNOWN_ORDER: Record<string, number> = { toby: 0, lexi: 1 }
  const i = index ?? KNOWN_ORDER[agentId] ??
    (agentId.split('').reduce((h, c) => h + c.charCodeAt(0), 0) % AGENT_GRADIENTS.length)
  const idx = i % AGENT_GRADIENTS.length
  const name = agentId.charAt(0).toUpperCase() + agentId.slice(1)
  return {
    label: name,
    ...AGENT_COLORS[idx],
    icon: AGENT_ICONS[idx],
    gradient: AGENT_GRADIENTS[idx],
    role: '',
  }
}
