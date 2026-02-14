import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Eye,
  Info,
  MessageSquare,
} from 'lucide-react'
import type { Proposal } from '@/features/maestro/types'
import { STRATEGY_META, STATUS_COLORS, getAgentMeta } from '@/features/maestro/constants'
import { timeAgo } from '@/features/maestro/utils'

interface ProposalCardProps {
  proposal: Proposal
  expanded: boolean
  onToggle: () => void
  onAccept: () => void
  onReject: () => void
  accepting: boolean
  rejecting: boolean
  showRejectInput: boolean
  rejectNotes: string
  onRejectNotesChange: (v: string) => void
  onCancelReject: () => void
}

export function ProposalCard({
  proposal: p, expanded, onToggle, onAccept, onReject,
  accepting, rejecting, showRejectInput, rejectNotes, onRejectNotesChange, onCancelReject,
}: ProposalCardProps) {
  const strategy = STRATEGY_META[p.strategy] || STRATEGY_META.explore
  const StrategyIcon = strategy.icon
  const agentMeta = getAgentMeta(p.agent_name)

  return (
    <div className={`bg-white rounded-xl border ${p.status === 'pending' ? 'border-gray-200 shadow-sm' : 'border-gray-100'} overflow-hidden transition-shadow hover:shadow-md`}>
      {/* Header row */}
      <div className="flex items-center gap-3 p-4 cursor-pointer" onClick={onToggle}>
        {/* Agent badge */}
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded border ${agentMeta.bg} ${agentMeta.color}`}>
          {agentMeta.label.charAt(0)}
        </span>

        {/* Strategy badge */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${strategy.bg} ${strategy.color}`}>
          <StrategyIcon className="w-3.5 h-3.5" />
          {strategy.label}
        </div>

        {/* Content type badge */}
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${p.content_type === 'post' ? 'bg-blue-50 text-blue-600 border border-blue-200' : 'bg-purple-50 text-purple-600 border border-purple-200'}`}>
          {p.content_type === 'post' ? '📄 Post' : '🎬 Reel'}
        </span>

        {/* Brand badge */}
        {p.brand && (
          <span className="px-2 py-0.5 text-xs font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            @the{p.brand}
          </span>
        )}

        {/* Variant badge */}
        {p.variant && (
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${p.variant === 'dark' ? 'bg-gray-800 text-gray-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
            {p.variant}
          </span>
        )}

        {/* Title */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{p.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{p.proposal_id} · {timeAgo(p.created_at)}</p>
        </div>

        {/* Status */}
        <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[p.status]}`}>
          {p.status}
        </span>

        {/* Quality */}
        {p.quality_score != null && (
          <span className={`text-xs font-mono ${p.quality_score >= 80 ? 'text-green-600' : p.quality_score >= 60 ? 'text-yellow-600' : 'text-red-500'}`}>
            Q{Math.round(p.quality_score)}
          </span>
        )}

        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/50">
          {/* Reasoning */}
          <div>
            <div className={`flex items-center gap-1.5 text-xs font-medium mb-1 ${agentMeta.color}`}>
              <Info className="w-3.5 h-3.5" />
              Why {agentMeta.label} chose this
            </div>
            <p className="text-sm text-gray-700 leading-relaxed bg-white rounded-lg p-3 border border-gray-100">
              {p.reasoning}
            </p>
          </div>

          {/* Reel content lines */}
          {p.content_lines && p.content_lines.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Content Lines</div>
              <ul className="space-y-1">
                {p.content_lines.map((line, i) => (
                  <li key={i} className="text-sm text-gray-700 bg-white rounded px-3 py-1.5 border border-gray-100">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Post slides */}
          {p.slide_texts && p.slide_texts.length > 0 && (
            <div>
              <div className="text-xs font-medium text-blue-600 mb-1">📄 Carousel Slides</div>
              <div className="space-y-2">
                {p.slide_texts.map((text, i) => (
                  <div key={i} className="bg-white rounded-lg p-3 border border-blue-100">
                    <div className="text-xs font-semibold text-blue-500 mb-1">Slide {i + 2}</div>
                    <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Image prompt */}
          {p.image_prompt && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Image Prompt</div>
              <p className="text-sm text-gray-600 italic bg-white rounded-lg p-3 border border-gray-100">
                {p.image_prompt}
              </p>
            </div>
          )}

          {/* Caption */}
          {p.caption && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-1">Caption</div>
              <p className="text-sm text-gray-600 bg-white rounded-lg p-3 border border-gray-100 whitespace-pre-wrap">
                {p.brand
                  ? p.caption.replace(/@brandhandle/gi, `@the${p.brand}`)
                  : p.caption.replace(/@brandhandle/gi, '@yourbrand')}
              </p>
            </div>
          )}

          {/* Source context */}
          {p.source_title && (
            <div className="flex items-start gap-2 bg-white rounded-lg p-3 border border-gray-100">
              <div>
                <div className="text-xs font-medium text-gray-500">
                  {p.source_type === 'own_content' ? 'Based on our content' :
                   p.source_type === 'competitor' ? `From @${p.source_account}` :
                   'From trending'}
                </div>
                <p className="text-sm text-gray-700 mt-0.5">{p.source_title}</p>
                {p.source_performance_score != null && (
                  <span className="text-xs text-gray-400">Score: {Math.round(p.source_performance_score)}</span>
                )}
              </div>
            </div>
          )}

          {/* Topic */}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {p.topic_bucket && (
              <span className="px-2 py-0.5 bg-gray-100 rounded text-gray-500">{p.topic_bucket}</span>
            )}
          </div>

          {/* Actions for pending */}
          {p.status === 'pending' && (
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <button
                onClick={(e) => { e.stopPropagation(); onAccept() }}
                disabled={accepting}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {accepting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Accept — Create for all brands
              </button>

              {showRejectInput ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    placeholder="Reason (optional)..."
                    value={rejectNotes}
                    onChange={(e) => onRejectNotesChange(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onReject() }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300"
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); onReject() }}
                    disabled={rejecting}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    {rejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reject'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onCancelReject() }}
                    className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onReject() }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Reject
                </button>
              )}
            </div>
          )}

          {p.status === 'accepted' && p.accepted_job_id && (
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <a
                href={`/jobs/${p.accepted_job_id}`}
                onClick={(e) => { e.stopPropagation() }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <Eye className="w-4 h-4" />
                View Job {p.accepted_job_id}
              </a>
              <span className="text-xs text-gray-400">Accepted {p.reviewed_at ? timeAgo(p.reviewed_at) : ''}</span>
            </div>
          )}

          {p.status === 'rejected' && p.reviewed_at && (
            <div className="space-y-1 pt-1">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <MessageSquare className="w-3.5 h-3.5" />
                Rejected {timeAgo(p.reviewed_at)}
              </div>
              {p.reviewer_notes && (
                <div className="text-xs text-red-500 italic pl-5">
                  &ldquo;{p.reviewer_notes}&rdquo;
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
