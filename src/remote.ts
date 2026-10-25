import type { ExportDoc } from './types'

export function remoteStoreUrl(): string {
  return (import.meta.env.VITE_REMOTE_STORE_URL || '').trim()
}

/**
 * Optionele remote opslag. Standaard uit: zonder VITE_REMOTE_STORE_URL
 * gebeurt er niets en blijven antwoorden in localStorage.
 * Het endpoint ontvangt de export-JSON via POST. Geen authenticatie.
 */
export async function pushRemote(doc: ExportDoc): Promise<'skipped' | 'ok' | 'error'> {
  const url = remoteStoreUrl()
  if (!url) return 'skipped'
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(doc),
    })
    return response.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
