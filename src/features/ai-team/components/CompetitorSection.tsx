import { useState } from 'react'
import {
  useCompetitors,
  useAddCompetitor,
  useRemoveCompetitor,
} from '@/features/ai-team/api/use-ai-team'

export function CompetitorSection() {
  const [handle, setHandle] = useState('')

  const { data: competitors, isLoading } = useCompetitors()
  const addMutation = useAddCompetitor()
  const removeMutation = useRemoveCompetitor()

  const handleAdd = () => {
    if (!handle.trim()) return
    addMutation.mutate(
      { instagram_handle: handle.trim().replace(/^@/, '') },
      { onSuccess: () => setHandle('') },
    )
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      <div className="flex gap-2">
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@instagram_handle"
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={!handle.trim() || addMutation.isPending}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {addMutation.isPending ? 'Adding...' : 'Add'}
        </button>
      </div>

      {/* Error message */}
      {addMutation.isError && (
        <p className="text-red-400 text-xs">
          Failed to add account. It may already exist.
        </p>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : competitors && competitors.length > 0 ? (
        <div className="space-y-2">
          {competitors.map((comp) => (
            <div
              key={comp.id}
              className="flex items-center justify-between bg-gray-800/50 border border-gray-700 rounded-lg px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                  IG
                </div>
                <div>
                  <span className="text-white text-sm font-medium">
                    @{comp.instagram_handle}
                  </span>
                  {comp.brand_id && (
                    <span className="ml-2 text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                      {comp.brand_id}
                    </span>
                  )}
                  <div className="text-xs text-gray-500">
                    {comp.posts_scraped_count > 0
                      ? `${comp.posts_scraped_count} posts scraped`
                      : 'Not yet scraped'}
                    {comp.last_scraped_at && (
                      <>
                        {' · Last: '}
                        {new Date(comp.last_scraped_at).toLocaleDateString()}
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => removeMutation.mutate(comp.id)}
                disabled={removeMutation.isPending}
                className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-500 text-sm text-center py-4 border border-dashed border-gray-700 rounded-lg">
          No competitor accounts added yet
        </div>
      )}
    </div>
  )
}
