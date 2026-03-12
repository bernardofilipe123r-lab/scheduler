/**
 * DNAProfilesManager — list, create, edit, delete Content DNA profiles + brand assignment.
 */
import { useState } from 'react'
import { Plus, Trash2, Edit3, Users, ChevronRight, FolderHeart, Loader2, X } from 'lucide-react'
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
import { getStrengthColor, getStrengthBarColor, getStrengthPercent } from '@/features/brands/types/niche-config'
import { NicheConfigForm } from '@/features/brands/components/NicheConfigForm'

export function DNAProfilesManager() {
  const { data: dnaData, isLoading } = useContentDNAProfiles()
  const { data: brands } = useBrands()
  const createMutation = useCreateContentDNA()
  const deleteMutation = useDeleteContentDNA()
  const assignMutation = useAssignBrandToDNA()
  const unassignMutation = useUnassignBrandFromDNA()

  const [newName, setNewName] = useState('')
  const [assigningDna, setAssigningDna] = useState<string | null>(null)
  const [editingDnaId, setEditingDnaId] = useState<string | null>(null)

  const profiles = dnaData?.profiles ?? []

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) {
      toast.error('Enter a name for the DNA profile')
      return
    }
    try {
      await createMutation.mutateAsync({ name })
      setNewName('')
      toast.success('DNA profile created')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create DNA profile')
    }
  }

  const handleDelete = async (dnaId: string) => {
    try {
      await deleteMutation.mutateAsync(dnaId)
      toast.success('DNA profile deleted')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete — reassign brands first')
    }
  }

  const handleAssign = async (dnaId: string, brandId: string) => {
    try {
      await assignMutation.mutateAsync({ dnaId, brandId })
      setAssigningDna(null)
      toast.success('Brand assigned to DNA profile')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to assign brand')
    }
  }

  const handleUnassign = async (dnaId: string, brandId: string) => {
    try {
      await unassignMutation.mutateAsync({ dnaId, brandId })
      toast.success('Brand removed from DNA profile')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove brand')
    }
  }

  // Brands not yet assigned to any DNA
  const unassignedBrands = (brands ?? []).filter(
    (b: Brand) => !b.content_dna_id
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Create new DNA profile */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Create a new Content DNA profile</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Health & Wellness, Tech Reviews..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-500"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm disabled:opacity-50"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create
          </button>
        </div>
      </div>

      {/* Unassigned brands warning */}
      {unassignedBrands.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-700 font-medium">
            {unassignedBrands.length} brand{unassignedBrands.length > 1 ? 's' : ''} not assigned to any DNA profile:
          </p>
          <ul className="mt-1 text-sm text-amber-600">
            {unassignedBrands.map((b: Brand) => (
              <li key={b.id}>• {b.display_name}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-500">
            Assign them to a DNA profile below so Toby can learn and generate content for them.
          </p>
        </div>
      )}

      {/* DNA profiles list */}
      {profiles.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-xl">
          <FolderHeart className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">No Content DNA profiles yet. Create one above.</p>
          <p className="text-gray-400 text-xs mt-1">
            A DNA profile defines your editorial identity — niche, tone, topics, examples.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {profiles.map((dna) => (
            <DNAProfileCard
              key={dna.id}
              dna={dna}
              brands={brands ?? []}
              onDelete={handleDelete}
              onAssign={handleAssign}
              onUnassign={handleUnassign}
              assigningDna={assigningDna}
              setAssigningDna={setAssigningDna}
              editingDnaId={editingDnaId}
              setEditingDnaId={setEditingDnaId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DNAProfileCard({
  dna,
  brands,
  onDelete,
  onAssign,
  onUnassign,
  assigningDna,
  setAssigningDna,
  editingDnaId,
  setEditingDnaId,
}: {
  dna: ContentDNAProfile
  brands: Brand[]
  onDelete: (id: string) => void
  onAssign: (dnaId: string, brandId: string) => void
  onUnassign: (dnaId: string, brandId: string) => void
  assigningDna: string | null
  setAssigningDna: (id: string | null) => void
  editingDnaId: string | null
  setEditingDnaId: (id: string | null) => void
}) {
  const strength = getDNAStrength(dna)
  const strengthPct = getStrengthPercent(strength)
  const strengthColor = getStrengthBarColor(strength)
  const strengthTextColor = getStrengthColor(strength)

  const assignedBrands = brands.filter((b) => b.content_dna_id === dna.id)
  const unassignedBrands = brands.filter((b) => !b.content_dna_id)
  const isEditing = editingDnaId === dna.id

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-gray-900 truncate">{dna.niche_name || dna.name}</h3>
            <span className={`text-xs font-medium ${strengthTextColor}`}>
              {strength}
            </span>
          </div>
          {dna.niche_name && dna.name !== dna.niche_name && (
            <p className="text-sm text-gray-500 mt-0.5">{dna.name}</p>
          )}

          {/* Strength bar */}
          <div className="mt-2 w-40 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${strengthColor} rounded-full transition-all`} style={{ width: `${strengthPct}%` }} />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <button
            onClick={() => setEditingDnaId(isEditing ? null : dna.id)}
            className={`p-2 rounded-lg transition-colors ${
              isEditing
                ? 'text-primary-600 bg-primary-50 hover:bg-primary-100'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title={isEditing ? 'Close editor' : 'Edit DNA settings'}
          >
            {isEditing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
          </button>
          <button
            onClick={() => onDelete(dna.id)}
            className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
            title="Delete DNA profile"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Assigned brands */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Users className="w-3.5 h-3.5" />
            {assignedBrands.length} brand{assignedBrands.length !== 1 ? 's' : ''} assigned
          </div>
          {unassignedBrands.length > 0 && (
            <button
              onClick={() => setAssigningDna(assigningDna === dna.id ? null : dna.id)}
              className="text-xs text-primary-500 hover:text-primary-600 font-medium"
            >
              {assigningDna === dna.id ? 'Cancel' : '+ Assign Brand'}
            </button>
          )}
        </div>

        {assignedBrands.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {assignedBrands.map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-medium group"
              >
                {b.display_name}
                <button
                  onClick={() => onUnassign(dna.id, b.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-primary-400 hover:text-red-500"
                  title={`Remove ${b.display_name} from this DNA`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Brand assignment picker */}
        {assigningDna === dna.id && unassignedBrands.length > 0 && (
          <div className="mt-3 border border-gray-200 rounded-lg divide-y divide-gray-100">
            {unassignedBrands.map((b) => (
              <button
                key={b.id}
                onClick={() => onAssign(dna.id, b.id)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {b.display_name}
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inline DNA editor */}
      {isEditing && (
        <div className="mt-5 pt-5 border-t border-gray-200">
          <NicheConfigForm dnaId={dna.id} />
        </div>
      )}
    </div>
  )
}
