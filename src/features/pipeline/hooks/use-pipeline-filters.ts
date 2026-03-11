import { useState, useCallback } from 'react'
import type { PipelineFilters } from '../model/types'

const DEFAULT_FILTERS: PipelineFilters = {
  status: 'pending',
  brand: null,
  content_type: 'all',
  batch_id: null,
}

export function usePipelineFilters() {
  const [filters, setFilters] = useState<PipelineFilters>(DEFAULT_FILTERS)

  const setStatus = useCallback((status: PipelineFilters['status']) => {
    setFilters(prev => ({ ...prev, status }))
  }, [])

  const setBrand = useCallback((brand: string | null) => {
    setFilters(prev => ({ ...prev, brand }))
  }, [])

  const setContentType = useCallback((content_type: PipelineFilters['content_type']) => {
    setFilters(prev => ({ ...prev, content_type }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
  }, [])

  return { filters, setStatus, setBrand, setContentType, resetFilters }
}
