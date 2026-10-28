import { isQuestionActive, presentQuestion, rolePhrase } from './catalog'
import type { AnswerValue, ExportDoc, Question, Questionnaire, Session } from './types'

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

export function isEmpty(value: AnswerValue | undefined): boolean {
  if (value == null) return true
  if (typeof value === 'number') return false
  if (Array.isArray(value)) return value.length === 0
  return value.trim() === ''
}

export function optionLabel(question: Question, value: string): string {
  return question.options?.find((option) => option.value === value)?.label ?? value
}

export function isValid(question: Question, value: AnswerValue | undefined): boolean {
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
  return 'Vul een antwoord in om verder te gaan.'
}

export function displayAnswer(question: Question, value: AnswerValue | undefined): string {
  if (isEmpty(value) || value == null) return 'Nog niet ingevuld'
  if (question.type === 'scale' && typeof value === 'number') {
    const max = question.max ?? 5
    return `${value} van ${max}`
  }
  if (Array.isArray(value)) {
    if (question.type === 'roles') {
      return value
        .map((item) => {
          const option = question.options?.find((entry) => entry.value === item)
          if (!option) return item
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
        return `<li>${escapeHtml(option?.label || item)}${figure}</li>`
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
  return {
    version: 1,
    questionnaireId: questionnaire.id,
    questionnaireTitle: questionnaire.title,
    klant: session.klant || stringAnswer(session, 'organisatie'),
    exportedAt: new Date().toISOString(),
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    answers,
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
