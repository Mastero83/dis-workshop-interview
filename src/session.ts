import type { AnswerValue, Phase, Session } from './types'

/** Zelfde prefix als eerdere versies, zodat een oude sessie herkend en gewist kan worden. */
const PREFIX = 'dis-workshop-v1'
const APP_PREFIX = 'dis-workshop'

export interface StoredDecision {
  session: Session
  /** Oude of onbruikbare sessie is vervangen door een leeg welkomstscherm. */
  restarted: boolean
  /** De opgeslagen sleutel hoort weg. */
  discard: boolean
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLocaleLowerCase('nl')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'algemeen'
}

export function storageKey(questionnaireId: string, klant: string): string {
  return `${PREFIX}:${questionnaireId}:${slugify(klant)}`
}

export function createSession(questionnaireId: string, klant: string): Session {
  const now = new Date().toISOString()
  return {
    version: 4,
    questionnaireId,
    klant,
    phase: 'welcome',
    stepIndex: 0,
    questionId: null,
    answers: {},
    startedAt: now,
    updatedAt: now,
  }
}

function isAnswerRecord(value: unknown): value is Record<string, AnswerValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPhase(value: unknown): value is Phase {
  return value === 'welcome' || value === 'flow' || value === 'summary'
}

/**
 * Beslist of een opgeslagen sessie nog bij deze vragenlijst hoort.
 * Versie 1 bewaarde alleen een stapnummer. Versie 2 en 3 hervatten op vraag-id,
 * maar zonder de vervolgvragen per rol. Versie 4 is dat gesprek.
 * Alles daaronder begint opnieuw.
 */
export function interpretStored(
  raw: string | null,
  questionnaireId: string,
  klant: string,
  knownQuestionIds: ReadonlySet<string>,
): StoredDecision {
  const fresh = () => createSession(questionnaireId, klant)
  if (!raw) return { session: fresh(), restarted: false, discard: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { session: fresh(), restarted: false, discard: true }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { session: fresh(), restarted: false, discard: true }
  }
  const data = parsed as Record<string, unknown>
  const reset = (): StoredDecision => ({ session: fresh(), restarted: true, discard: true })
  if (data.questionnaireId !== questionnaireId || !isAnswerRecord(data.answers)) return reset()
  if (data.version !== 4 || !isPhase(data.phase)) return reset()
  const questionId = typeof data.questionId === 'string' && data.questionId ? data.questionId : null
  if (data.phase === 'flow' && (!questionId || !knownQuestionIds.has(questionId))) return reset()
  return {
    session: {
      version: 4,
      questionnaireId,
      klant,
      phase: data.phase,
      stepIndex: typeof data.stepIndex === 'number' ? data.stepIndex : 0,
      questionId: data.phase === 'flow' ? questionId : null,
      answers: data.answers,
      startedAt: typeof data.startedAt === 'string' ? data.startedAt : new Date().toISOString(),
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
      remotePushedAt: typeof data.remotePushedAt === 'string' ? data.remotePushedAt : undefined,
    },
    restarted: false,
    discard: false,
  }
}

export function loadSession(
  questionnaireId: string,
  klant: string,
  knownQuestionIds: ReadonlySet<string>,
): StoredDecision {
  const key = storageKey(questionnaireId, klant)
  try {
    const decision = interpretStored(localStorage.getItem(key), questionnaireId, klant, knownQuestionIds)
    if (decision.discard) localStorage.removeItem(key)
    return decision
  } catch {
    return { session: createSession(questionnaireId, klant), restarted: false, discard: false }
  }
}

export function saveSession(session: Session): boolean {
  try {
    session.updatedAt = new Date().toISOString()
    localStorage.setItem(storageKey(session.questionnaireId, session.klant), JSON.stringify(session))
    return true
  } catch {
    return false
  }
}

export function clearSession(session: Session): void {
  try {
    localStorage.removeItem(storageKey(session.questionnaireId, session.klant))
  } catch {
    /* privémodus kan localStorage blokkeren */
  }
}

/** Wist elke sleutel van deze app, inclusief oudere schema's en andere klanten. */
export function wipeAppStorage(): void {
  try {
    const keys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key && key.startsWith(APP_PREFIX)) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    /* privémodus kan localStorage blokkeren */
  }
  try {
    sessionStorage.clear()
  } catch {
    /* privémodus kan sessionStorage blokkeren */
  }
}

export function hasProgress(session: Session): boolean {
  if (session.phase !== 'welcome' || session.stepIndex > 0) return true
  return Object.values(session.answers).some((value) => {
    if (value == null) return false
    if (typeof value === 'number') return true
    if (Array.isArray(value)) return value.length > 0
    return value.trim().length > 0
  })
}
