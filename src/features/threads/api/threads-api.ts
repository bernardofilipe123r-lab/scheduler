import { get, post } from '@/shared/api'

const BASE = '/api/threads'

// ── Types ────────────────────────────────────────────────────────────

export interface ThreadPost {
  text: string
  format_type: string
}

export interface ThreadChain {
  parts: string[]
  topic: string
  format_type: string
}

export interface FormatType {
  id: string
  name: string
  description: string
}

// ── API Functions ────────────────────────────────────────────────────

export const threadsApi = {
  generateSingle: async (data: {
    brand_id: string
    format_type?: string
    topic_hint?: string
  }): Promise<ThreadPost> => {
    const res = await post<{ status: string; post: ThreadPost }>(`${BASE}/generate`, data)
    return res.post
  },

  generateChain: async (data: {
    brand_id: string
    num_parts?: number
    topic_hint?: string
  }): Promise<ThreadChain> => {
    const res = await post<{ status: string; chain: ThreadChain }>(`${BASE}/generate-chain`, data)
    return res.chain
  },

  generateBulk: async (data: {
    brand_id: string
    count?: number
    topic_hints?: string[]
    format_type?: string
  }): Promise<ThreadPost[]> => {
    const res = await post<{ status: string; posts: ThreadPost[]; count: number }>(`${BASE}/generate-bulk`, data)
    return res.posts
  },

  publishSingle: async (data: {
    brand_id: string
    text: string
  }): Promise<{ status: string; post_id: string }> => {
    return post(`${BASE}/publish`, data)
  },

  publishChain: async (data: {
    brand_id: string
    parts: string[]
  }): Promise<{ status: string; post_id: string; post_ids: string[] }> => {
    return post(`${BASE}/publish-chain`, data)
  },

  schedule: async (data: {
    brand_id: string
    text: string
    scheduled_time: string
    is_chain?: boolean
    chain_parts?: string[]
  }): Promise<{ status: string; schedule_id: string; scheduled_for: string }> => {
    return post(`${BASE}/schedule`, data)
  },

  autoSchedule: async (data: {
    brand_id: string
    text: string
    is_chain?: boolean
    chain_parts?: string[]
  }): Promise<{ status: string; schedule_id: string; scheduled_for: string }> => {
    return post(`${BASE}/auto-schedule`, data)
  },

  getFormatTypes: async (): Promise<FormatType[]> => {
    const res = await get<{ format_types: FormatType[] }>(`${BASE}/format-types`)
    return res.format_types
  },
}
