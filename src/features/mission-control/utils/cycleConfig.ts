import {
  Sparkles, Send, Heart, Eye, Target,
  FlaskConical, Dna, Stethoscope, Zap, Clock,
} from 'lucide-react'

// ═══════════════════════════════════════════════════════════════
// Cycle display configuration — icons, colors, labels
// ═══════════════════════════════════════════════════════════════

export const CYCLE_CONFIG: Record<string, {
  label: string
  icon: typeof Clock
  colorClass: string
  dotColor: string
  bgClass: string
}> = {
  daily_burst:  { label: 'Daily Burst',   icon: Sparkles,     colorClass: 'text-amber-400',   dotColor: 'bg-amber-400',   bgClass: 'bg-amber-500/10' },
  check:        { label: 'Auto-Publish',   icon: Send,         colorClass: 'text-blue-400',    dotColor: 'bg-blue-400',    bgClass: 'bg-blue-500/10' },
  healing:      { label: 'Healing',        icon: Heart,        colorClass: 'text-pink-400',    dotColor: 'bg-pink-400',    bgClass: 'bg-pink-500/10' },
  observe:      { label: 'Observe',        icon: Eye,          colorClass: 'text-cyan-400',    dotColor: 'bg-cyan-400',    bgClass: 'bg-cyan-500/10' },
  scout:        { label: 'Scout',          icon: Target,       colorClass: 'text-emerald-400', dotColor: 'bg-emerald-400', bgClass: 'bg-emerald-500/10' },
  feedback:     { label: 'Feedback',       icon: FlaskConical, colorClass: 'text-purple-400',  dotColor: 'bg-purple-400',  bgClass: 'bg-purple-500/10' },
  evolution:    { label: 'Evolution',      icon: Dna,          colorClass: 'text-indigo-400',  dotColor: 'bg-indigo-400',  bgClass: 'bg-indigo-500/10' },
  diagnostics:  { label: 'Diagnostics',    icon: Stethoscope,  colorClass: 'text-gray-400',    dotColor: 'bg-gray-400',    bgClass: 'bg-gray-500/10' },
  bootstrap:    { label: 'Bootstrap',      icon: Zap,          colorClass: 'text-orange-400',  dotColor: 'bg-orange-400',  bgClass: 'bg-orange-500/10' },
}

export const CYCLE_ORDER = [
  'daily_burst', 'check', 'healing', 'bootstrap',
  'observe', 'scout', 'feedback', 'diagnostics', 'evolution',
]

/** Returns display config for a cycle key, with auto-generated fallback for unknown cycles */
export function getCycleConfig(key: string) {
  return CYCLE_CONFIG[key] || {
    label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    icon: Clock,
    colorClass: 'text-gray-400',
    dotColor: 'bg-gray-400',
    bgClass: 'bg-gray-500/10',
  }
}

// ═══════════════════════════════════════════════════════════════
// Detailed operation descriptions — used in educational modals
// ═══════════════════════════════════════════════════════════════

export const OPERATION_DETAILS: Record<string, {
  title: string
  subtitle: string
  purpose: string
  steps: string[]
  frequency: string
  duration: string
}> = {
  daily_burst: {
    title: 'Daily Burst',
    subtitle: 'Main content generation pipeline',
    purpose: 'Generates fresh content proposals for all your brands. Each AI agent creates reels and posts tailored to their brand\'s audience and strategy.',
    steps: [
      'Each agent analyzes brand intelligence and trending topics',
      'Agents generate content proposals using their assigned strategies',
      'Examiner quality-gates each proposal (score threshold: 6.0/10)',
      'Accepted proposals enter the content generation pipeline',
      'Media assets are created (thumbnails, videos, carousel slides)',
      'Completed content is automatically scheduled to optimal time slots',
    ],
    frequency: 'Daily at 12:00 PM Lisbon time',
    duration: '5–15 minutes depending on brand count',
  },
  check: {
    title: 'Auto-Publish',
    subtitle: 'Automated content publishing',
    purpose: 'Scans for scheduled content that is due for publishing and pushes it to the designated platforms (Instagram, Facebook, YouTube).',
    steps: [
      'Query scheduled content where publish time has arrived',
      'Lock content records to prevent duplicate publishes',
      'Upload media to social platform APIs',
      'Update publish status and record results per platform',
    ],
    frequency: 'Every 10 minutes',
    duration: '1–3 minutes per batch',
  },
  healing: {
    title: 'Healing',
    subtitle: 'System self-repair and maintenance',
    purpose: 'Automatically detects and fixes issues: stuck jobs, orphaned records, and ensures every brand has an assigned AI agent.',
    steps: [
      'Scan for generation jobs stuck in processing state',
      'Reset stuck jobs and retry or mark as failed',
      'Verify every active brand has an assigned agent',
      'Auto-provision new agents for unassigned brands',
      'Clean up temporary files and expired data',
    ],
    frequency: 'Every 15 minutes',
    duration: 'Under 1 minute',
  },
  observe: {
    title: 'Observe',
    subtitle: 'Performance metrics collection',
    purpose: 'Fetches engagement metrics from social platforms for all published content. This data feeds the feedback and evolution systems.',
    steps: [
      'Connect to social platform APIs for each brand',
      'Fetch views, likes, comments, shares for recent posts',
      'Update analytics database with fresh metrics',
      'Calculate performance trends and engagement rates',
      'Flag high and low performers for agent feedback',
    ],
    frequency: 'Every 3 hours',
    duration: '2–5 minutes',
  },
  scout: {
    title: 'Scout',
    subtitle: 'Trend discovery and competitive intelligence',
    purpose: 'Monitors trending hashtags and competitor content to identify viral patterns. Agents with the "trending" strategy use this intelligence for their next proposal cycle.',
    steps: [
      'Analyze trending hashtags in the health/wellness niche',
      'Monitor competitor accounts for high-performing content',
      'Identify viral content patterns and formats',
      'Update trend intelligence database',
      'Distribute findings to agents for next proposal cycle',
    ],
    frequency: 'Every 4 hours',
    duration: '2–4 minutes',
  },
  feedback: {
    title: 'Feedback',
    subtitle: 'Agent DNA mutation based on performance',
    purpose: 'Analyzes each agent\'s content performance and applies strategic mutations — adjusting strategy weights and temperature to improve results over time.',
    steps: [
      'Trace published content back to originating agents',
      'Calculate performance metrics per agent and strategy',
      'Compare strategy effectiveness (best vs worst performers)',
      'Apply weight shifts to strategies (max \u00b15% per cycle)',
      'Adjust agent temperature based on survival score',
      'Record mutations in agent learning history',
    ],
    frequency: 'Every 6 hours',
    duration: '1–3 minutes',
  },
  evolution: {
    title: 'Evolution',
    subtitle: 'Weekly natural selection',
    purpose: 'The evolutionary pressure system. Top-performing agents thrive and archive their DNA. Bottom performers may be retired and replaced with new agents inheriting successful traits.',
    steps: [
      'Calculate survival score for each agent (views, engagement rate, consistency)',
      'Top 40%: DNA archived to Gene Pool, marked as thriving',
      'Middle 40%: Surviving, no changes applied',
      'Bottom 20%: Eligible for retirement if survival < 30 for 2 consecutive cycles',
      'Retired agents replaced — 80% inherit from gene pool, 20% random',
      'Maintain minimum active agent count',
    ],
    frequency: 'Weekly, Sunday at 2:00 AM',
    duration: '5–15 minutes',
  },
  diagnostics: {
    title: 'Diagnostics',
    subtitle: 'System health monitoring',
    purpose: 'Comprehensive health check of all system components. Verifies API connectivity, database health, and resource availability.',
    steps: [
      'Test connectivity to all external APIs',
      'Verify database connection and query performance',
      'Check disk space and media storage',
      'Validate scheduled content pipeline integrity',
      'Generate system health report',
    ],
    frequency: 'Every 4 hours',
    duration: 'Under 1 minute',
  },
  bootstrap: {
    title: 'Bootstrap',
    subtitle: 'Cold-start intelligence gathering',
    purpose: 'Initial research phase. Gathers baseline knowledge about the wellness niche, target audience, and content patterns. Automatically disables once the system reaches maturity.',
    steps: [
      'Research core wellness and health topics',
      'Analyze target audience preferences',
      'Collect competitor content examples',
      'Identify initial viral patterns and formats',
      'Build baseline strategy intelligence',
    ],
    frequency: 'Every 20 minutes (auto-disables when mature)',
    duration: '2–5 minutes',
  },
}

// ═══════════════════════════════════════════════════════════════
// Keywords for detecting which cycle is active from log messages
// ═══════════════════════════════════════════════════════════════

export const CYCLE_KEYWORDS: Record<string, string[]> = {
  daily_burst: ['daily burst', 'burst for user', 'smart burst', 'manual burst', 'generating proposals', 'examiner', 'auto-accepting', 'planning strategies'],
  check:       ['auto-publish', 'publishing scheduled', 'publish_now', 'pending publications'],
  healing:     ['healing', 'stuck job', 'agent health', 'ensuring agents'],
  observe:     ['observe', 'fetching metrics', 'analytics refresh', 'engagement data'],
  scout:       ['scout', 'trending', 'competitor', 'viral pattern'],
  feedback:    ['feedback', 'mutation', 'strategy weight shift', 'temperature adjust', 'dna mutation'],
  evolution:   ['evolution', 'natural selection', 'survival score', 'gene pool', 'agent retired'],
  diagnostics: ['diagnostic', 'system health', 'health check'],
  bootstrap:   ['bootstrap', 'cold-start', 'cold start', 'initial research'],
}
