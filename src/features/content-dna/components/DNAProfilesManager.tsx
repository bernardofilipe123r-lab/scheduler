/**
 * DNAProfilesManager — list, create, edit, delete Content DNA profiles + brand assignment.
 *
 * Design goals:
 * - Clean, polished layout with clear visual hierarchy
 * - Brand assign/unassign is instant (optimistic UI)
 * - Brand picker shows ALL brands (not just unassigned) with clear status
 * - DNA editor opens inline without page jump
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Plus, Trash2, Settings2, ChevronDown, FolderHeart, Loader2, X, UserPlus, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  useContentDNAProfiles,
  useCreateContentDNA,
  useDeleteContentDNA,
  useAssignBrandToDNA,
  useUnassignBrandFromDNA,
  getDNAStrength,
} from '@/features/content-dna'
import type { ContentDNAProfile } from '@/features/content-dna'
import { useBrands, type Brand } from '@/features/brands/api/use-brands'
import { getStrengthBarColor, getStrengthPercent } from '@/features/brands/types/niche-config'
import { NicheConfigForm } from '@/features/brands/components/NicheConfigForm'

export function DNAProfilesManager() {
  const { data: dnaData, isLoading } = useContentDNAProfiles()
  const { data: brands } = useBrands()
  const createMutation = useCreateContentDNA()
  const deleteMutation = useDeleteContentDNA()
  const assignMutation = useAssignBrandToDNA()
  const unassignMutation = useUnassignBrandFromDNA()

  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [pickerDnaId, setPickerDnaId] = useState<string | null>(null)
  const [editingDnaId, setEditingDnaId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const profiles = dnaData?.profiles ?? []
  const allBrands = brands ?? []

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast.error('Enter a name for the DNA profile')
      return
    }
    try {
      await createMutation.mutateAsync({ name })
      setNewName('')
      setShowCreate(false)
      toast.success('DNA profile created')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create DNA profile')
    }
  }

  const handleDelete = async (dnaId: string) => {
    try {
      await deleteMutation.mutateAsync(dnaId)
      setConfirmDelete(null)
      if (editingDnaId === dnaId) setEditingDnaId(null)
      toast.success('DNA profile deleted')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete — remove all brands first')
    }
  }

  const handleAssign = async (dnaId: string, brandId: string) => {
    try {
      await assignMutation.mutateAsync({ dnaId, brandId })
      toast.success('Brand moved')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign brand')
    }
  }

  const handleUnassign = async (dnaId: string, brandId: string) => {
    try {
      await unassignMutation.mutateAsync({ dnaId, brandId })
      toast.success('Brand removed')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove brand')
    }
  }

  const unassignedBrands = allBrands.filter((b: Brand) => !b.content_dna_id)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Unassigned brands banner */}
      {unassignedBrands.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <span className="text-amber-600 text-sm font-bold">{unassignedBrands.length}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">
              {unassignedBrands.length === 1 ? '1 brand' : `${unassignedBrands.length} brands`} not assigned to any DNA
            </p>
            <p className="text-xs text-amber-600 truncate">
              {unassignedBrands.map(b => b.display_name).join(', ')}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-600 flex-shrink-0">Use <strong>+ Add Brand</strong> below</p>
        </div>
      )}

      {/* DNA Profile Cards */}
      {profiles.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
          <FolderHeart className="w-14 h-14 mx-auto text-gray-200 mb-4" />
          <p className="text-gray-600 font-medium">No Content DNA profiles yet</p>
          <p className="text-gray-400 text-sm mt-1 max-w-sm mx-auto">
            A Content DNA defines your editorial identity — the niche, tone, and style that shapes every piece of content Toby creates.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-primary-500 text-white rounded-xl hover:bg-primary-600 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Create Your First DNA
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map((dna) => {
            const isEditing = editingDnaId === dna.id
            return (
              <DNAProfileCard
                key={dna.id}
                dna={dna}
                allBrands={allBrands}
                isEditing={isEditing}
                isPicking={pickerDnaId === dna.id}
                isConfirmingDelete={confirmDelete === dna.id}
                onToggleEdit={() => setEditingDnaId(isEditing ? null : dna.id)}
                onTogglePicker={() => setPickerDnaId(pickerDnaId === dna.id ? null : dna.id)}
                onConfirmDelete={() => setConfirmDelete(dna.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                onDelete={() => handleDelete(dna.id)}
                onAssign={(brandId) => handleAssign(dna.id, brandId)}
                onUnassign={(brandId) => handleUnassign(dna.id, brandId)}
                assignPending={assignMutation.isPending}
                unassignPending={unassignMutation.isPending}
              />
            )
          })}
        </div>
      )}

      {/* Create new DNA — collapsible */}
      {profiles.length > 0 && !showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:border-primary-300 hover:text-primary-500 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Create Another DNA Profile
        </button>
      )}

      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">New Content DNA Profile</h3>
            <button onClick={() => { setShowCreate(false); setNewName('') }} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Health & Wellness, Tech Reviews..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newName.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Brand Picker Dropdown ─────────────────────────────────────────── */

function BrandPicker({
  dnaId,
  allBrands,
  onAssign,
  onClose,
  isPending,
}: {
  dnaId: string
  allBrands: Brand[]
  onAssign: (brandId: string) => void
  onClose: () => void
  isPending: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const unassigned = allBrands.filter(b => !b.content_dna_id)
  const otherDna = allBrands.filter(b => b.content_dna_id && b.content_dna_id !== dnaId)
  const alreadyHere = allBrands.filter(b => b.content_dna_id === dnaId)

  if (unassigned.length === 0 && otherDna.length === 0) {
    return (
      <div ref={ref} className="absolute right-0 top-full mt-2 z-50 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-4">
        <p className="text-sm text-gray-500 text-center">All brands already assigned here</p>
      </div>
    )
  }

  return (
    <div ref={ref} className="absolute right-0 top-full mt-2 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
      <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Brand to this DNA</p>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {unassigned.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-gray-50/50">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Unassigned</p>
            </div>
            {unassigned.map(b => (
              <button
                key={b.id}
                onClick={() => onAssign(b.id)}
                disabled={isPending}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700 transition-colors disabled:opacity-50"
              >
                <span className="font-medium">{b.display_name}</span>
                <Plus className="w-3.5 h-3.5 text-gray-300" />
              </button>
            ))}
          </div>
        )}
        {otherDna.length > 0 && (
          <div>
            <div className="px-3 py-1.5 bg-gray-50/50 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Move from another DNA</p>
            </div>
            {otherDna.map(b => (
              <button
                key={b.id}
                onClick={() => onAssign(b.id)}
                disabled={isPending}
                className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 hover:bg-amber-50 hover:text-amber-700 transition-colors disabled:opacity-50"
              >
                <span>{b.display_name}</span>
                <span className="text-[10px] text-gray-400">move here →</span>
              </button>
            ))}
          </div>
        )}
        {alreadyHere.length > 0 && unassigned.length === 0 && otherDna.length === 0 && (
          <div className="px-3 py-3 text-center text-sm text-gray-400">
            All brands already assigned here
          </div>
        )}
      </div>
    </div>
  )
}

/* ── DNA Profile Card ──────────────────────────────────────────────── */

function DNAProfileCard({
  dna,
  allBrands,
  isEditing,
  isPicking,
  isConfirmingDelete,
  onToggleEdit,
  onTogglePicker,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
  onAssign,
  onUnassign,
  assignPending,
  unassignPending,
}: {
  dna: ContentDNAProfile
  allBrands: Brand[]
  isEditing: boolean
  isPicking: boolean
  isConfirmingDelete: boolean
  onToggleEdit: () => void
  onTogglePicker: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
  onAssign: (brandId: string) => void
  onUnassign: (brandId: string) => void
  assignPending: boolean
  unassignPending: boolean
}) {
  const strength = getDNAStrength(dna)
  const strengthPct = getStrengthPercent(strength)
  const strengthColor = getStrengthBarColor(strength)

  const assignedBrands = allBrands.filter((b) => b.content_dna_id === dna.id)
  const displayName = dna.niche_name || dna.name

  const stableOnClose = useCallback(() => {
    // Only call onTogglePicker if the picker is currently open
    if (isPicking) onTogglePicker()
  }, [isPicking, onTogglePicker])

  return (
    <div className={`bg-white border rounded-2xl transition-all ${
      isEditing ? 'border-primary-200 shadow-md ring-1 ring-primary-100' : 'border-gray-200 hover:shadow-sm'
    }`}>
      {/* Card header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Title + strength badge */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-lg font-semibold text-gray-900 truncate">{displayName}</h3>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                strength === 'basic' ? 'bg-red-100 text-red-600' :
                strength === 'good' ? 'bg-amber-100 text-amber-600' :
                'bg-emerald-100 text-emerald-600'
              }`}>
                {strength}
              </span>
            </div>

            {/* Strength bar */}
            <div className="mt-2.5 flex items-center gap-2">
              <div className="w-32 h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${strengthColor} rounded-full transition-all duration-500`} style={{ width: `${strengthPct}%` }} />
              </div>
              <span className="text-[10px] text-gray-400">{strengthPct}%</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onToggleEdit}
              className={`p-2 rounded-lg transition-colors text-sm ${
                isEditing
                  ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
              title={isEditing ? 'Close editor' : 'Edit Content DNA'}
            >
              {isEditing ? <X className="w-4 h-4" /> : <Settings2 className="w-4 h-4" />}
            </button>
            {isConfirmingDelete ? (
              <div className="flex items-center gap-1 ml-1">
                <button
                  onClick={onDelete}
                  className="px-2.5 py-1.5 text-xs font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={onCancelDelete}
                  className="px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={onConfirmDelete}
                className="p-2 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                title="Delete DNA profile"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Brand chips section */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {assignedBrands.map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium group hover:bg-gray-200 transition-colors"
              >
                {b.display_name}
                <button
                  onClick={() => onUnassign(b.id)}
                  disabled={unassignPending}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-100 transition-colors disabled:opacity-50"
                  title={`Remove ${b.display_name}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}

            {/* Add brand button */}
            <div className="relative">
              <button
                onClick={onTogglePicker}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  isPicking
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-white border border-dashed border-gray-300 text-gray-400 hover:border-primary-300 hover:text-primary-500'
                }`}
              >
                <UserPlus className="w-3 h-3" />
                Add Brand
                <ChevronDown className={`w-3 h-3 transition-transform ${isPicking ? 'rotate-180' : ''}`} />
              </button>

              {isPicking && (
                <BrandPicker
                  dnaId={dna.id}
                  allBrands={allBrands}
                  onAssign={onAssign}
                  onClose={stableOnClose}
                  isPending={assignPending}
                />
              )}
            </div>

            {assignedBrands.length === 0 && (
              <span className="text-xs text-gray-400 italic ml-1">No brands assigned</span>
            )}
          </div>
        </div>
      </div>

      {/* Inline DNA editor */}
      {isEditing && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4">
          <NicheConfigForm dnaId={dna.id} />
        </div>
      )}
    </div>
  )
}
