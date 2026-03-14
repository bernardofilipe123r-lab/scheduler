import { useState, useCallback } from 'react'
import type { PipelineFilters } from '../model/types'

const DEFAULT_PAGE_SIZE = 50

const DEFAULT_FILTERS: PipelineFilters = {
  status: 'generating',
  brand: null,
  content_type: 'all',
  batch_id: null,
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
}

export function usePipelineFilters() {
  const [filters, setFilters] = useState<PipelineFilters>(DEFAULT_FILTERS)

  const setStatus = useCallback((status: PipelineFilters['status']) => {
    setFilters(prev => ({ ...prev, status, page: 1 }))
  }, [])

  const setBrand = useCallback((brand: string | null) => {
    setFilters(prev => ({ ...prev, brand, page: 1 }))
  }, [])

  const setContentType = useCallback((content_type: PipelineFilters['content_type']) => {
    setFilters(prev => ({ ...prev, content_type, page: 1 }))
  }, [])

  const setPage = useCallback((page: number) => {
    setFilters(prev => ({ ...prev, page }))
  }, [])

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
  }, [])

  return { filters, setStatus, setBrand, setContentType, setPage, resetFilters }
}
