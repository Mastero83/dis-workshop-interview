import type { AnswerValue, Phase, Session } from './types'

const PREFIX = 'dis-workshop-v1'

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
    version: 1,
    questionnaireId,
    klant,
    phase: 'welcome',
    stepIndex: 0,
    answers: {},
    startedAt: now,
    updatedAt: now,
  }
}

export function loadSession(questionnaireId: string, klant: string): Session {
  const key = storageKey(questionnaireId, klant)
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return createSession(questionnaireId, klant)
    const parsed = JSON.parse(raw) as Partial<Session>
    if (parsed.version !== 1 || parsed.questionnaireId !== questionnaireId || !parsed.answers) {
      return createSession(questionnaireId, klant)
    }
    return {
      version: 1,
      questionnaireId,
      klant,
      phase: (parsed.phase as Phase) || 'welcome',
      stepIndex: typeof parsed.stepIndex === 'number' ? parsed.stepIndex : 0,
      answers: parsed.answers as Record<string, AnswerValue>,
      startedAt: parsed.startedAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      remotePushedAt: parsed.remotePushedAt,
    }
  } catch {
    return createSession(questionnaireId, klant)
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

export function hasProgress(session: Session): boolean {
  if (session.phase !== 'welcome' || session.stepIndex > 0) return true
  return Object.values(session.answers).some((value) => {
    if (value == null) return false
    if (typeof value === 'number') return true
    if (Array.isArray(value)) return value.length > 0
    return value.trim().length > 0
  })
}
