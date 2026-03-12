import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  isOpen: boolean
  action: 'approve' | 'reject'
  count: number
  onConfirm: () => void
  onCancel: () => void
}

export function BulkActionModal({ isOpen, action, count, onConfirm, onCancel }: Props) {
  if (!isOpen) return null

  const isApprove = action === 'approve'

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative z-10 bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6"
          >
            <div className="flex flex-col items-center text-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${isApprove ? 'bg-amber-50' : 'bg-red-50'}`}>
                <AlertTriangle className={`w-6 h-6 ${isApprove ? 'text-amber-500' : 'text-red-500'}`} />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {isApprove ? 'Approve' : 'Reject'} {count} items?
              </h3>

              <p className="text-sm text-gray-500 mb-5 leading-relaxed">
                {isApprove
                  ? 'This will schedule all selected content for publishing. AI-generated content can contain mistakes — please review videos before bulk approving.'
                  : 'This will permanently reject all selected content. Rejected items won\'t be scheduled or published.'}
              </p>

              <div className="flex gap-3 w-full">
                <button
                  onClick={onCancel}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white rounded-xl transition-colors ${
                    isApprove
                      ? 'bg-emerald-500 hover:bg-emerald-600'
                      : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  {isApprove ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {isApprove ? 'Approve All' : 'Reject All'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
