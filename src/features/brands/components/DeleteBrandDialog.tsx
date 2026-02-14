import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/shared/components'
import { useDeleteBrand } from '@/features/brands/api/use-brands'

interface DeleteBrandDialogProps {
  isOpen: boolean
  brandId: string
  brandName: string
  onClose: () => void
  onDeleted: () => void
}

export function DeleteBrandDialog({ isOpen, brandId, brandName, onClose, onDeleted }: DeleteBrandDialogProps) {
  const deleteBrand = useDeleteBrand()
  const [error, setError] = useState<string | null>(null)

  const handleConfirm = async () => {
    setError(null)
    try {
      await deleteBrand.mutateAsync(brandId)
      onDeleted()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete brand'
      setError(message)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Brand" size="sm">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-gray-900 font-medium">
              Are you sure you want to delete <strong>{brandName}</strong>?
            </p>
            <p className="text-sm text-gray-500 mt-1">
              This will deactivate the brand and all its connections. This action can be reversed later.
            </p>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={deleteBrand.isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleteBrand.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {deleteBrand.isPending ? 'Deleting...' : 'Delete Brand'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
