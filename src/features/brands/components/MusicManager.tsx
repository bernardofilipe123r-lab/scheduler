import { useRef, useState } from 'react'
import { Music, Upload, Trash2, Loader2 } from 'lucide-react'
import { useUserMusic, useUploadMusic, useDeleteMusic } from '@/features/brands/api/use-music'

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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const tracks = data?.tracks ?? []
  const maxTracks = data?.max ?? 5

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return
    // reset so same file can be re-selected
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
    <div className="bg-gray-50 rounded-xl p-4">
      <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
        <Music className="w-4 h-4" />
        Background Music
      </h4>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <p className="text-sm text-blue-800">
          Upload up to <strong>{maxTracks}</strong> music tracks. A random track (and a random segment of it)
          will be used as background audio for each reel.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {tracks.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2"
            >
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
          ))}

          {tracks.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              No music tracks yet. Upload one to add audio to your reels.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 mt-2">{error}</p>
      )}

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
        className="mt-3 w-full py-2.5 text-sm font-medium rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
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
