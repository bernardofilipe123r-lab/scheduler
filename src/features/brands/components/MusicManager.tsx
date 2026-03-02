import { useRef, useState, useCallback, useEffect } from 'react'
import { Music, Upload, Trash2, Loader2, Play, Pause, Volume2, Save, AlertTriangle } from 'lucide-react'
import { useUserMusic, useUploadMusic, useDeleteMusic, useSaveMusicWeights } from '@/features/brands/api/use-music'
import { Modal } from '@/shared/components/Modal'

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
  const saveMutation = useSaveMusicWeights()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null)
  const [playbackProgress, setPlaybackProgress] = useState(0)

  // Local weight state for deferred save — initialized lazily from server
  const [localWeights, setLocalWeights] = useState<Record<string, number> | null>(null)
  const [showUnsavedModal, setShowUnsavedModal] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null)

  const tracks = data?.tracks ?? []
  const maxTracks = data?.max ?? 20

  // Sync local weights from server (only when no local edits exist)
  useEffect(() => {
    const serverTracks = data?.tracks
    if (serverTracks && serverTracks.length > 0 && localWeights === null) {
      const w: Record<string, number> = {}
      serverTracks.forEach(t => { w[t.id] = t.weight })
      setLocalWeights(w)
    }
  }, [data?.tracks, localWeights])

  // Derive unsaved state by comparing local weights to server weights
  const hasUnsavedChanges = (() => {
    if (!localWeights || !data?.tracks) return false
    return data.tracks.some(t => (localWeights[t.id] ?? t.weight) !== t.weight)
  })()

  // Browser beforeunload warning
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsavedChanges])

  const getWeight = (trackId: string, fallback: number) =>
    localWeights?.[trackId] ?? fallback

  const totalWeight = tracks.reduce((sum, t) => sum + getWeight(t.id, t.weight), 0)

  const handleWeightChange = (trackId: string, weight: number) => {
    setLocalWeights(prev => ({ ...prev, [trackId]: weight }))
  }

  const handleSave = async () => {
    if (!localWeights) return
    const updates = tracks
      .filter(t => (localWeights[t.id] ?? t.weight) !== t.weight)
      .map(t => ({ trackId: t.id, weight: localWeights[t.id] ?? t.weight }))
    if (updates.length === 0) return
    try {
      await saveMutation.mutateAsync(updates)
      // Reset local weights so next server sync picks up
      setLocalWeights(null)
    } catch {
      setError('Failed to save weights')
    }
  }

  const handleDiscard = () => {
    // Reset to server values
    setLocalWeights(null)
    if (pendingNavigation) {
      pendingNavigation()
      setPendingNavigation(null)
    }
    setShowUnsavedModal(false)
  }

  const handleSaveAndClose = async () => {
    await handleSave()
    if (pendingNavigation) {
      pendingNavigation()
      setPendingNavigation(null)
    }
    setShowUnsavedModal(false)
  }

  // Expose the unsaved check for parent tab navigation
  useEffect(() => {
    const handler = (e: CustomEvent<{ navigate: () => void }>) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        setPendingNavigation(() => e.detail.navigate)
        setShowUnsavedModal(true)
      }
    }
    window.addEventListener('music-tab-leave' as never, handler as EventListener)
    return () => window.removeEventListener('music-tab-leave' as never, handler as EventListener)
  }, [hasUnsavedChanges])

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

    setUploadProgress(0)
    try {
      await uploadMutation.mutateAsync({
        file,
        onProgress: (pct) => setUploadProgress(pct),
      })
      setUploadProgress(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed')
      setUploadProgress(null)
    }
  }

  const togglePlay = useCallback((trackId: string, url: string) => {
    if (playingTrackId === trackId) {
      audioRef.current?.pause()
      setPlayingTrackId(null)
      setPlaybackProgress(0)
      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
    }

    const audio = new Audio(url)
    audio.addEventListener('ended', () => {
      setPlayingTrackId(null)
      setPlaybackProgress(0)
    })
    audio.addEventListener('timeupdate', () => {
      if (audio.duration > 0) {
        setPlaybackProgress(Math.round((audio.currentTime / audio.duration) * 100))
      }
    })
    audio.play()
    audioRef.current = audio
    setPlayingTrackId(trackId)
    setPlaybackProgress(0)
  }, [playingTrackId])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
    }
  }, [])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-primary-50 rounded-lg">
          <Volume2 className="w-5 h-5 text-primary-500" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Background Music</h3>
          <p className="text-sm text-gray-500">
            Upload up to {maxTracks} tracks. Toby picks a weighted-random track for each reel.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Track list */}
          <div className="space-y-2 mt-4">
            {tracks.map((t) => {
              const weight = getWeight(t.id, t.weight)
              const pct = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0
              const isPlaying = playingTrackId === t.id
              const isModified = weight !== t.weight

              return (
                <div
                  key={t.id}
                  className={`group bg-white border rounded-xl px-4 py-3 transition-all hover:shadow-sm ${
                    isModified ? 'border-amber-300 bg-amber-50/30' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Play button */}
                    <button
                      onClick={() => togglePlay(t.id, t.storage_url)}
                      className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                        isPlaying
                          ? 'bg-primary-500 text-white shadow-md shadow-primary-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-primary-50 hover:text-primary-500'
                      }`}
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>

                    {/* Track info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {t.filename}
                        </p>
                        <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
                          {formatDuration(t.duration_seconds)}
                        </span>
                      </div>

                      {/* Playback progress bar */}
                      {isPlaying && (
                        <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-primary-500 h-full rounded-full transition-[width] duration-200 ease-linear"
                            style={{ width: `${playbackProgress}%` }}
                          />
                        </div>
                      )}

                      {/* Weight slider (hide during playback for cleaner look) */}
                      {!isPlaying && (
                        <div className="flex items-center gap-3 mt-1.5">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={weight}
                            onChange={(e) => handleWeightChange(t.id, Number(e.target.value))}
                            className="flex-1 h-1.5 accent-primary-500 cursor-pointer"
                          />
                          <span className={`text-xs font-semibold tabular-nums w-10 text-right ${
                            pct >= 50 ? 'text-primary-600' : 'text-gray-500'
                          }`}>
                            {pct}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      onClick={() => {
                        if (playingTrackId === t.id) {
                          audioRef.current?.pause()
                          setPlayingTrackId(null)
                        }
                        deleteMutation.mutate(t.id)
                      }}
                      disabled={deleteMutation.isPending}
                      className="shrink-0 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete track"
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}

            {tracks.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                <Music className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500">No music tracks yet</p>
                <p className="text-xs text-gray-400 mt-1">Upload a track to add background audio to your reels</p>
              </div>
            )}
          </div>

          {/* Save button */}
          {hasUnsavedChanges && (
            <div className="flex items-center justify-between mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">You have unsaved weight changes</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscard}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Error */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Upload area */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.m4a,.wav,.aac,.ogg,audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {uploadProgress !== null ? (
        <div className="mt-4 p-4 border border-primary-200 bg-primary-50/50 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-primary-500 animate-spin" />
              <span className="text-sm font-medium text-primary-700">
                {uploadProgress < 100 ? 'Uploading...' : 'Processing audio...'}
              </span>
            </div>
            <span className="text-sm font-semibold tabular-nums text-primary-600">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-primary-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          {uploadProgress >= 100 && (
            <p className="text-xs text-primary-500 mt-1.5">Analyzing duration and saving track...</p>
          )}
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending || tracks.length >= maxTracks}
          className="mt-4 w-full py-3 text-sm font-medium rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Upload className="w-4 h-4" />
          Upload Music ({tracks.length}/{maxTracks})
        </button>
      )}

      {/* Unsaved changes modal */}
      <Modal isOpen={showUnsavedModal} onClose={() => setShowUnsavedModal(false)} title="Unsaved Changes" size="sm">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-gray-700 mb-1">
            You have unsaved weight changes.
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Would you like to save them before leaving?
          </p>
          <div className="flex gap-3 w-full">
            <button
              onClick={handleDiscard}
              className="flex-1 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSaveAndClose}
              disabled={saveMutation.isPending}
              className="flex-1 py-2.5 text-sm font-medium text-white bg-primary-500 rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
