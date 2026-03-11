import { useState } from 'react'
import { X, CheckCircle2, XCircle, Edit3, Save, Star } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { ContentPreview } from './ContentPreview'
import type { PipelineItem } from '../model/types'

interface Props {
  item: PipelineItem
  onClose: () => void
  onApprove: (id: string, caption?: string) => void
  onReject: (id: string) => void
  onEdit: (id: string, caption: string, title: string) => void
}

export function PipelineDetailModal({ item, onClose, onApprove, onReject, onEdit }: Props) {
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(item.title)
  const [editCaption, setEditCaption] = useState(item.caption ?? '')
  const isPending = item.pipeline_status === 'pending'

  const handleSave = () => {
    onEdit(item.job_id, editCaption, editTitle)
    setEditing(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-white/80 hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        {/* Left: Preview */}
        <div className="md:w-2/5 p-4 bg-gray-50 flex items-center justify-center overflow-y-auto">
          <div className="w-full max-w-[240px]">
            <ContentPreview item={item} />
          </div>
        </div>

        {/* Right: Details & Editor */}
        <div className="md:w-3/5 p-6 overflow-y-auto flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 min-w-0">
              {editing ? (
                <input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full text-lg font-bold text-gray-900 border-b border-blue-300 focus:border-blue-500 outline-none bg-transparent pb-0.5"
                />
              ) : (
                <h2 className="text-lg font-bold text-gray-900 line-clamp-2">{item.title}</h2>
              )}

              <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                <span className={clsx(
                  'px-2 py-0.5 rounded-full font-medium',
                  item.pipeline_status === 'pending' && 'bg-amber-100 text-amber-700',
                  item.pipeline_status === 'approved' && 'bg-emerald-100 text-emerald-700',
                  item.pipeline_status === 'rejected' && 'bg-red-100 text-red-700',
                )}>
                  {item.pipeline_status}
                </span>
                {item.quality_score != null && (
                  <span className="flex items-center gap-0.5">
                    <Star className="w-3 h-3" />
                    {item.quality_score}
                  </span>
                )}
                <span>{format(new Date(item.created_at), 'MMM d, yyyy h:mm a')}</span>
              </div>
            </div>
          </div>

          {/* Content lines */}
          {item.content_lines?.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Content</p>
              <div className="text-sm text-gray-700 space-y-1 bg-gray-50 rounded-lg p-3">
                {item.content_lines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* Caption */}
          <div className="mb-4 flex-1">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Caption</p>
              {isPending && !editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                value={editCaption}
                onChange={e => setEditCaption(e.target.value)}
                rows={6}
                className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg p-3 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 resize-none"
              />
            ) : (
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
                {item.caption || 'No caption'}
              </p>
            )}
          </div>

          {/* Meta */}
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-4">
            {item.brands.length > 0 && (
              <div>
                <span className="font-medium text-gray-400">Brands: </span>
                {item.brands.join(', ')}
              </div>
            )}
            {item.platforms.length > 0 && (
              <div>
                <span className="font-medium text-gray-400">Platforms: </span>
                {item.platforms.join(', ')}
              </div>
            )}
            {item.pipeline_batch_id && (
              <div>
                <span className="font-medium text-gray-400">Batch: </span>
                {item.pipeline_batch_id}
              </div>
            )}
          </div>

          {/* Actions */}
          {isPending && (
            <div className="flex gap-2 pt-3 border-t border-gray-100">
              {editing ? (
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save changes
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onApprove(item.job_id, editCaption || undefined)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve & Schedule
                  </button>
                  <button
                    onClick={() => onReject(item.job_id)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors border border-red-200"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
