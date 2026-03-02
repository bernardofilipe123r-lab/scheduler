import { useRef, useState } from 'react'
import { Music, Upload, Trash2, Loader2 } from 'lucide-react'
import { useUserMusic, useUploadMusic, useDeleteMusic, useUpdateMusicWeight } from '@/features/brands/api/use-music'

const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/aac', 'audio/ogg']
const MAX_SIZE_MB = 20

function formatDuration(s: number | null): string {
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function MusicManager() {
  const { data, isLoading } = useUserMusic()
  const uploadMutation = useUploadMusic()
  const deleteMutation = useDeleteMusic()
  const weightMutation = useUpdateMusicWeight()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const tracks = data?.tracks ?? []
  const maxTracks = data?.max ?? 20

  const totalWeight = tracks.reduce((sum, t) => sum + t.weight, 0)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (!ALLOWED_TYPES.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav|aac|ogg)$/i)) {
      setError('Unsupported file type. Use MP3, M4A, WAV, AAC, or OGG.')
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_SIZE_MB} MB.`)
      return
    }

    try {
      await uploadMutation.mutateAsync(file)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Music className="w-5 h-5 text-primary-500" />
        Background Music
      </h3>
      <p className="text-sm text-gray-500 mb-4">
        Upload up to {maxTracks} music tracks. Toby picks a random track (and a random segment of it) for each reel.
        Adjust the weight slider to control how often each track is selected.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {tracks.map((t) => {
            const pct = totalWeight > 0 ? Math.round((t.weight / totalWeight) * 100) : 0
            return (
              <div
                key={t.id}
                className="bg-white border border-gray-200 rounded-lg px-4 py-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Music className="w-4 h-4 text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.filename}</p>
                      <p className="text-xs text-gray-400">{formatDuration(t.duration_seconds)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(t.id)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    title="Delete track"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={t.weight}
                    onChange={(e) =>
                      weightMutation.mutate({ trackId: t.id, weight: Number(e.target.value) })
                    }
                    className="flex-1 h-1.5 accent-primary-500"
                  />
                  <span className="text-xs font-medium text-gray-500 w-10 text-right">
                    {pct}%
                  </span>
                </div>
              </div>
            )
          })}

          {tracks.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              No music tracks yet. Upload one to add background audio to your reels.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.m4a,.wav,.aac,.ogg,audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending || tracks.length >= maxTracks}
        className="mt-4 w-full py-2.5 text-sm font-medium rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {uploadMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            Upload Music ({tracks.length}/{maxTracks})
          </>
        )}
      </button>
    </div>
  )
}
