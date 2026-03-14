import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Music, Trash2, RefreshCw, Play, Square, Loader2, AlertCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { apiClient } from '@/shared/api/client'
import type { MusicTrack } from '@/features/brands/api/use-music'

interface AdminMusicTrack extends MusicTrack {
  size_bytes: number
}

function MusicLibraryPanel() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const musicQuery = useQuery<{ tracks: AdminMusicTrack[]; count: number }>({
    queryKey: ['admin-music'],
    queryFn: () => apiClient.get('/api/admin/music'),
    staleTime: 30_000,
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return apiClient.post('/api/admin/music/upload', form, { timeout: 120_000 })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-music'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (trackId: string) =>
      apiClient.delete(`/api/admin/music/${trackId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-music'] })
    },
  })

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(f => uploadMutation.mutate(f))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Music className="w-4 h-4 text-purple-500" />
          Music Library
          {musicQuery.data && (
            <span className="text-xs font-normal text-gray-400">
              ({musicQuery.data.count} tracks)
            </span>
          )}
        </h2>
        <button
          onClick={() => musicQuery.refetch()}
          disabled={musicQuery.isFetching}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded border border-gray-200 bg-white disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', musicQuery.isFetching && 'animate-spin')} />
        </button>
      </div>

      {/* Upload */}
      <div className="mb-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.m4a,.wav,.aac,.ogg"
          multiple
          onChange={e => handleFiles(e.target.files)}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploadMutation.isPending ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
          ) : (
            <><Music className="w-4 h-4" /> Upload MP3 Files</>
          )}
        </button>
      </div>

      {uploadMutation.isError && (
        <div className="mb-4 flex items-center gap-2 text-xs text-red-500 p-2 bg-red-50 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5" />
          Upload failed: {(uploadMutation.error as Error).message}
        </div>
      )}

      {/* Track list */}
      {musicQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading music library…
        </div>
      ) : musicQuery.data?.tracks && musicQuery.data.tracks.length > 0 ? (
        <div className="space-y-1">
          {musicQuery.data.tracks.map(track => {
            const isPlaying = playingId === track.id
            const sizeMb = (track.size_bytes / (1024 * 1024)).toFixed(1)
            return (
              <div
                key={track.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => {
                      if (isPlaying) {
                        audioRef.current?.pause()
                        setPlayingId(null)
                      } else {
                        if (audioRef.current) audioRef.current.pause()
                        const audio = new Audio(track.storage_url)
                        audio.onended = () => setPlayingId(null)
                        audio.onerror = () => setPlayingId(null)
                        audio.play()
                        audioRef.current = audio
                        setPlayingId(track.id)
                      }
                    }}
                    className={clsx(
                      'p-1 rounded-full shrink-0 transition-colors',
                      isPlaying
                        ? 'text-purple-600 bg-purple-100 hover:bg-purple-200'
                        : 'text-gray-400 hover:text-purple-500 hover:bg-purple-50'
                    )}
                    title={isPlaying ? 'Stop' : 'Play'}
                  >
                    {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <span className="text-xs text-gray-700 truncate">{track.filename}</span>
                  <span className="text-[10px] text-gray-400">{sizeMb} MB</span>
                  {track.duration_seconds && (
                    <span className="text-[10px] text-gray-400">
                      {Math.floor(track.duration_seconds / 60)}:{String(Math.floor(track.duration_seconds % 60)).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (isPlaying) {
                      audioRef.current?.pause()
                      setPlayingId(null)
                    }
                    deleteMutation.mutate(track.id)
                  }}
                  disabled={deleteMutation.isPending}
                  className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No music files yet. Upload some MP3 files above.</p>
      )}
    </div>
  )
}


export default MusicLibraryPanel
