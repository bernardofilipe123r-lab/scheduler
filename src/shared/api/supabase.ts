import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
const appBaseUrl = import.meta.env.VITE_APP_URL || window.location.origin

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export function buildAppUrl(path = '/') {
	const normalizedPath = path.startsWith('/') ? path : `/${path}`
	return new URL(normalizedPath, appBaseUrl).toString()
}
