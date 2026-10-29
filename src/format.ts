import { isQuestionActive, presentQuestion, rolePhrase } from './catalog'
import { collectResult, eigenLabel, intensityLabel, interestLabel, isEigenRole, roleLabel, signalsForRole, useCaseName } from './kansen.ts'
import type { AnswerValue, ExportDoc, KansAnswer, Question, Questionnaire, Session, SignalAnswer } from './types'

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

export function isSignalAnswer(value: unknown): value is SignalAnswer {
  return typeof value === 'object' && value !== null && (value as SignalAnswer).kind === 'signals'
}

export function isKansAnswer(value: unknown): value is KansAnswer {
  return typeof value === 'object' && value !== null && (value as KansAnswer).kind === 'kansen'
}

export function isEmpty(value: AnswerValue | undefined): boolean {
  if (value == null) return true
  if (typeof value === 'number') return false
  if (Array.isArray(value)) return value.length === 0
  if (isSignalAnswer(value)) return Object.keys(value.values).length === 0 && value.note.trim() === ''
  if (isKansAnswer(value)) return false
  if (typeof value === 'string') return value.trim() === ''
  return true
}

export function optionLabel(question: Question, value: string): string {
  return question.options?.find((option) => option.value === value)?.label ?? value
}

export function isValid(
  question: Question,
  value: AnswerValue | undefined,
  answers: Record<string, AnswerValue> = {},
): boolean {
  if (!question.required && isEmpty(value)) return true
  if (question.type === 'rank') {
    const count = Array.isArray(value) ? value.length : 0
    return count >= (question.minRanked ?? 1)
  }
  if (question.type === 'multiple' || question.type === 'roles') {
    if (!Array.isArray(value)) return false
    if (question.minSelected != null && value.length < question.minSelected) return false
    if (question.maxSelected != null && value.length > question.maxSelected) return false
    return value.length > 0
  }
  if (question.type === 'scale') return typeof value === 'number'
  if (question.type === 'signals') {
    if (value == null) return true
    if (!isSignalAnswer(value)) return false
    const signals = signalsForRole(question.signalRole || '')
    return signals.every((signal) => {
      const score = value.values[signal.id]
      return score == null || score === 0 || score === 1.5 || score === 3
    })
  }
  if (question.type === 'kansen') {
    const ranked = collectResult(answers).ranked
    if (ranked.length === 0) return true
    if (!isKansAnswer(value)) return false
    return ranked.every((item) => {
      const choice = value.interest[item.id]
      return choice === 'graag' || choice === 'misschien' || choice === 'niet'
    })
  }
  if (question.type === 'single' || question.type === 'text' || question.type === 'longtext') {
    return typeof value === 'string' && value.trim().length > 0
  }
  return false
}

export function validationMessage(question: Question): string {
  if (question.type === 'rank') {
    const min = question.minRanked ?? 1
    return min === 1 ? 'Zet minimaal één punt op volgorde.' : `Zet minimaal ${min} punten op volgorde.`
  }
  if (question.type === 'multiple') {
    if (question.minSelected && question.maxSelected && question.minSelected === question.maxSelected) {
      return `Kies er ${question.minSelected}.`
    }
    return 'Kies minimaal één optie.'
  }
  if (question.type === 'roles') return 'Kies minimaal één rol.'
  if (question.type === 'scale') return 'Tik een cijfer om verder te gaan.'
  if (question.type === 'single') return 'Kies één antwoord om verder te gaan.'
  if (question.type === 'signals') return 'Tik soms of vaak, of ga verder.'
  if (question.type === 'kansen') return 'Geef per kans aan hoe interessant die is.'
  return 'Vul een antwoord in om verder te gaan.'
}

export function displayAnswer(question: Question, value: AnswerValue | undefined): string {
  if (isEmpty(value) || value == null) return 'Nog niet ingevuld'
  if (question.type === 'scale' && typeof value === 'number') {
    const max = question.max ?? 5
    return `${value} van ${max}`
  }
  if (isSignalAnswer(value)) {
    const lines = signalsForRole(question.signalRole || '')
      .map((signal) => {
        const score = value.values[signal.id]
        if (score == null || score <= 0) return ''
        return `${intensityLabel(score)}: ${signal.tekst}`
      })
      .filter(Boolean)
    if (value.note.trim()) lines.push(value.note.trim())
    return lines.join('\n') || 'Niets herkend'
  }
  if (isKansAnswer(value)) {
    const lines = Object.entries(value.interest).map(
      ([id, choice]) => `${useCaseName(id)} (${id}) — ${interestLabel(choice)}`,
    )
    for (const idea of value.ideas) lines.push(`Eigen idee: ${idea}`)
    return lines.join('\n') || 'Nog geen keuze'
  }
  if (Array.isArray(value)) {
    if (question.type === 'roles') {
      return value
        .map((item) => {
          const option = question.options?.find((entry) => entry.value === item)
          if (!option) return isEigenRole(item) ? eigenLabel(item) : roleLabel(item)
          return option.figure ? `${option.label} (${option.figure})` : option.label
        })
        .join(', ')
    }
    const labels = value.map((item) => optionLabel(question, item))
    if (question.type === 'rank') return labels.map((label, index) => `${index + 1}. ${label}`).join('\n')
    return labels.join(', ')
  }
  if (question.type === 'single' && typeof value === 'string') return optionLabel(question, value)
  return String(value)
}

export function answerHtml(question: Question, value: AnswerValue | undefined): string {
  if (isEmpty(value) || value == null) return '<span class="muted">Nog niet ingevuld</span>'
  if (question.type === 'rank' && Array.isArray(value)) {
    const items = value.map((item) => `<li>${escapeHtml(optionLabel(question, item))}</li>`).join('')
    return `<ol class="answer-list">${items}</ol>`
  }
  if ((question.type === 'multiple' || question.type === 'roles') && Array.isArray(value)) {
    const items = value
      .map((item) => {
        const option = question.options?.find((entry) => entry.value === item)
        const figure = question.type === 'roles' && option?.figure ? ` <small>${escapeHtml(option.figure)}</small>` : ''
        return `<li>${escapeHtml(option?.label || (isEigenRole(item) ? eigenLabel(item) : item))}${figure}</li>`
      })
      .join('')
    return `<ul class="answer-chips">${items}</ul>`
  }
  return `<p class="answer-text">${escapeHtml(displayAnswer(question, value))}</p>`
}

export function toExportDoc(questionnaire: Questionnaire, session: Session): ExportDoc {
  const phrase = rolePhrase(questionnaire, session.answers)
  const answers = questionnaire.sections.flatMap((section) =>
    section.questions.flatMap((question) => {
      if (!isQuestionActive(question, session.answers)) return []
      const view = presentQuestion(question, phrase)
      return [
        {
          id: question.id,
          sectionId: section.id,
          section: section.title,
          question: view.title,
          type: question.type,
          value: session.answers[question.id] ?? null,
          display: displayAnswer(view, session.answers[question.id]),
        },
      ]
    }),
  )
  const result = collectResult(session.answers)
  return {
    version: 1,
    questionnaireId: questionnaire.id,
    questionnaireTitle: questionnaire.title,
    klant: session.klant || stringAnswer(session, 'organisatie'),
    exportedAt: new Date().toISOString(),
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    invultijd_seconden: session.invultijdSeconden,
    answers,
    kansen: result.ranked.map((item) => ({
      id: item.id,
      naam: item.naam,
      score: Math.round(item.score * 10) / 10,
      interest: result.interest[item.id] || '',
      signalen: item.signalen,
    })),
    eigen: {
      rollen: result.eigen.rollen.map((item) => item.label),
      tijdvreters: result.eigen.tijdvreters.map((item) => ({ rol: item.label, tekst: item.tekst })),
      ideeen: result.eigen.ideeen,
      nogWeten: result.eigen.nogWeten,
    },
  }
}

function stringAnswer(session: Session, id: string): string {
  const value = session.answers[id]
  return typeof value === 'string' ? value.trim() : ''
}

export function toPlainText(doc: ExportDoc): string {
  const lines: string[] = [
    'DIS Group — Workshopvoorbereiding',
    doc.klant ? `Klant: ${doc.klant}` : 'Klant: niet ingevuld',
    `Geëxporteerd: ${formatWhen(doc.exportedAt)}`,
    '',
  ]
  let section = ''
  for (const answer of doc.answers) {
    if (answer.section !== section) {
      section = answer.section
      lines.push(section)
      lines.push(''.padEnd(section.length, '–'))
    }
    lines.push(answer.question)
    lines.push(answer.display)
    lines.push('')
  }
  if (doc.kansen.length) {
    lines.push('Kansen')
    lines.push('------')
    for (const kans of doc.kansen) {
      const choice = kans.interest ? interestLabel(kans.interest) : 'geen keuze'
      lines.push(`${kans.naam} (${kans.id}) — score ${String(kans.score).replace('.', ',')} — ${choice}`)
    }
    lines.push('')
  }
  const eigen = doc.eigen
  if (eigen && (eigen.rollen.length || eigen.tijdvreters.length || eigen.ideeen.length || eigen.nogWeten)) {
    lines.push('Eigen invoer')
    lines.push('------------')
    for (const rol of eigen.rollen) lines.push(`Eigen rol: ${rol}`)
    for (const item of eigen.tijdvreters) lines.push(`${item.rol}: ${item.tekst}`)
    for (const idee of eigen.ideeen) lines.push(`Eigen idee: ${idee}`)
    if (eigen.nogWeten) lines.push(eigen.nogWeten)
    lines.push('')
  }
  lines.push('Antwoorden zijn door de klant zelf ingevuld ter voorbereiding op de workshop.')
  return lines.join('\n')
}

export function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date)
}

export function formatSummaryWhen(iso: string): { date: string; time: string } {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { date: iso, time: '' }
  return {
    date: new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date),
    time: new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(date),
  }
}

/** Seconden vanaf `startedAt` tot nu. Ongeldige start telt als 0. */
export function invultijdSeconds(startedAt: string, now = Date.now()): number {
  const start = Date.parse(startedAt)
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.round((now - start) / 1000))
}

/** B1-zin voor de bedankpopup. Onder een minuut geen los getal. */
export function invultijdLine(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  if (safe < 60) return 'Je was er minder dan een minuut mee bezig.'
  const minutesTotal = Math.floor(safe / 60)
  if (minutesTotal < 60) {
    return minutesTotal === 1 ? 'Je was er 1 minuut mee bezig.' : `Je was er ${minutesTotal} minuten mee bezig.`
  }
  const hours = Math.floor(minutesTotal / 60)
  const rest = minutesTotal % 60
  const hour = hours === 1 ? '1 uur' : `${hours} uur`
  if (rest === 0) return `Je was er ${hour} mee bezig.`
  const minute = rest === 1 ? '1 minuut' : `${rest} minuten`
  return `Je was er ${hour} en ${minute} mee bezig.`
}

export function fileSlug(value: string): string {
  return (
    value
      .trim()
      .toLocaleLowerCase('nl')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'antwoorden'
  )
}

export function isExportDoc(value: unknown): value is ExportDoc {
  if (typeof value !== 'object' || value === null) return false
  const doc = value as Partial<ExportDoc>
  return doc.version === 1 && Array.isArray(doc.answers) && typeof doc.questionnaireTitle === 'string'
}

export function asset(path: string | undefined | null): string {
  if (!path) return ''
  if (/^(https?:|data:|blob:)/i.test(path)) return path
  const base = import.meta.env.BASE_URL
  return base + path.replace(/^\//, '')
}
