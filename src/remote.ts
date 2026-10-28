import type { ExportDoc } from './types'

/** Publieke waarden. Een build kan ze overschrijven met VITE_SUPABASE_URL en VITE_SUPABASE_KEY. */
const DEFAULT_URL = 'https://tidrsquchrbaapsnspkp.supabase.co'
const DEFAULT_KEY = 'sb_publishable_goTutgXdlwSfvnUti_TtlA_D2_lEm5b'

export function supabaseUrl(): string {
  const raw = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL).trim()
  return raw.replace(/\/+$/, '')
}

export function supabaseKey(): string {
  return (import.meta.env.VITE_SUPABASE_KEY || DEFAULT_KEY).trim()
}

export interface WorkshopRow {
  klant: string
  sessie_id: string
  schema_versie: number
  payload: ExportDoc
}

export type PushResult =
  | { ok: true; status: number }
  | { ok: false; status: number; network: boolean }

/**
 * Eén rij in public.workshop_antwoorden.
 * RLS laat anon alleen insert toe, dus Prefer: return=minimal (geen return=representation).
 */
export async function insertAntwoorden(row: WorkshopRow): Promise<PushResult> {
  const key = supabaseKey()
  try {
    const response = await fetch(`${supabaseUrl()}/rest/v1/workshop_antwoorden`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    })
    if (response.status >= 200 && response.status < 300) return { ok: true, status: response.status }
    return { ok: false, status: response.status, network: false }
  } catch {
    return { ok: false, status: 0, network: true }
  }
}
