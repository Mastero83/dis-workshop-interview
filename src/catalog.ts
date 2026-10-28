import raw from './vragenlijst.json' with { type: 'json' }
import { closingQuestion, kansenQuestion, signalQuestions } from './kansen.ts'
import type { AnswerValue, Catalog, Question, Questionnaire, Section, Step } from './types'

export interface RolePhrase {
  top: string
  rollen: string
  tijdvreter: string
  aiHint: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function loadCatalog(): Catalog {
  assert(isRecord(raw) && Array.isArray(raw.questionnaires), 'vragenlijst.json mist questionnaires')
  const questionnaires = raw.questionnaires.map((item, index) => {
    assert(isRecord(item), `Vragenlijst ${index} is ongeldig`)
    assert(typeof item.id === 'string' && item.id, `Vragenlijst ${index} mist id`)
    assert(typeof item.title === 'string', `${item.id} mist title`)
    assert(Array.isArray(item.sections) && item.sections.length > 0, `${item.id} mist sections`)
    const ids = new Set<string>()
    for (const section of item.sections as Section[]) {
      assert(section && typeof section.id === 'string', `${item.id} heeft een onderdeel zonder id`)
      assert(Array.isArray(section.questions), `${section.id} mist vragen`)
      for (const question of section.questions) {
        assert(question && typeof question.id === 'string', `${section.id} heeft een vraag zonder id`)
        assert(!ids.has(question.id), `Dubbele vraag-id: ${question.id}`)
        ids.add(question.id)
        if (question.type === 'single' || question.type === 'multiple' || question.type === 'rank' || question.type === 'roles') {
          assert(Array.isArray(question.options) && question.options.length > 0, `${question.id} mist options`)
        }
        if (question.type === 'roles') {
          for (const option of question.options || []) {
            assert(option.figure && option.icon && option.source && option.hint, `${question.id} / ${option.value} mist kaartgegevens`)
          }
        }
        if (question.context) {
          assert(
            question.context.type === 'video' || question.context.type === 'explainer',
            `${question.id} heeft een onbekend context-type`,
          )
          if (question.context.type === 'video') {
            assert(typeof question.context.src === 'string' && question.context.src, `${question.id} mist context.src`)
          }
        }
      }
    }
    expandBranching(item as unknown as Questionnaire)
    return item as unknown as Questionnaire
  })
  for (const questionnaire of questionnaires) {
    const ids = new Set<string>()
    for (const section of questionnaire.sections) {
      for (const question of section.questions) {
        assert(!ids.has(question.id), `Dubbele vraag-id: ${question.id}`)
        ids.add(question.id)
      }
    }
  }
  return { questionnaires }
}

function expandBranching(questionnaire: Questionnaire): void {
  const closing: Question[] = []
  for (const section of questionnaire.sections) {
    const extra: Question[] = []
    for (const question of section.questions) {
      if (question.type !== 'roles' || !question.options) continue
      const focus = question.focus
      if (focus) {
        extra.push({
          id: focus.id,
          type: 'multiple',
          title: focus.title,
          help: focus.help,
          required: true,
          minSelected: focus.pick,
          maxSelected: focus.pick,
          optionsFrom: question.id,
          options: question.options.map((option) => ({ value: option.value, label: option.label })),
          when: { rolesQuestion: question.id, selectedMoreThan: focus.whenSelectedMoreThan },
        })
      }
      extra.push(...signalQuestions(question.options, focus))
      extra.push(kansenQuestion())
      if (question.closing) {
        closing.push({
          id: question.closing.id,
          type: question.closing.type || 'longtext',
          title: question.closing.title,
          help: question.closing.help,
          placeholder: question.closing.placeholder,
          required: question.closing.required === true,
        })
      }
    }
    const rolesIndex = section.questions.findIndex((question) => question.type === 'roles')
    if (rolesIndex >= 0 && extra.length) {
      section.questions.splice(rolesIndex + 1, 0, ...extra)
      section.questions.push(closingQuestion())
    }
  }
  if (closing.length) {
    const last = questionnaire.sections[questionnaire.sections.length - 1]
    last.questions.push(...closing)
  }
}

export function findQuestionnaire(catalog: Catalog, id: string | null): Questionnaire | null {
  if (!id) return catalog.questionnaires[0] ?? null
  return catalog.questionnaires.find((item) => item.id === id) ?? null
}

export function questionCount(questionnaire: Questionnaire, answers: Record<string, AnswerValue> = {}): number {
  return questionnaire.sections.reduce(
    (sum, section) => sum + section.questions.filter((question) => isQuestionActive(question, answers)).length,
    0,
  )
}

export function listValues(value: AnswerValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function isQuestionActive(question: Question, answers: Record<string, AnswerValue>): boolean {
  const when = question.when
  if (!when) return true
  const roles = listValues(answers[when.rolesQuestion || 'rollen'])
  if (when.selectedMoreThan != null) return roles.length > when.selectedMoreThan
  if (!when.role) return true
  if (!roles.includes(when.role)) return false
  const limit = when.focusWhenMoreThan ?? 3
  if (roles.length <= limit) return true
  if (!when.focusQuestion) return true
  const focus = listValues(answers[when.focusQuestion])
  if (focus.length === 0) return false
  return focus.includes(when.role)
}

export function findRolesQuestion(questionnaire: Questionnaire): Question | null {
  for (const section of questionnaire.sections) {
    const found = section.questions.find((question) => question.type === 'roles')
    if (found) return found
  }
  return null
}

export function rolePhrase(questionnaire: Questionnaire, answers: Record<string, AnswerValue>): RolePhrase {
  const rolesQuestion = findRolesQuestion(questionnaire)
  const options = rolesQuestion?.options || []
  const selected = listValues(answers[rolesQuestion?.id || 'rollen'])
  const limit = rolesQuestion?.focus?.whenSelectedMoreThan ?? 3
  const focus = rolesQuestion?.focus ? listValues(answers[rolesQuestion.focus.id]) : []
  const ids = selected.length > limit && focus.length ? focus.filter((id) => selected.includes(id)) : selected
  const labels = ids.map((id) => options.find((option) => option.value === id)?.label || id)
  const topOption = options.find((option) => option.value === ids[0])
  return {
    top: topOption?.label || 'de grootste tijdvreter',
    rollen: labels.length ? labels.join(', ') : 'de gekozen rollen',
    tijdvreter: topOption?.hint || 'de tijdvreter',
    aiHint: topOption?.aiHint || 'voorbereiden',
  }
}

export function fillTemplate(text: string | undefined, phrase: RolePhrase): string {
  if (!text) return ''
  return text
    .replaceAll('{top}', phrase.top)
    .replaceAll('{rollen}', phrase.rollen)
    .replaceAll('{tijdvreter}', phrase.tijdvreter)
    .replaceAll('{aiHint}', phrase.aiHint)
}

export function presentQuestion(question: Question, phrase: RolePhrase): Question {
  return {
    ...question,
    title: fillTemplate(question.title, phrase),
    help: question.help ? fillTemplate(question.help, phrase) : question.help,
    placeholder: question.placeholder ? fillTemplate(question.placeholder, phrase) : question.placeholder,
    options: question.options?.map((option) => ({
      ...option,
      label: fillTemplate(option.label, phrase),
      hint: option.hint ? fillTemplate(option.hint, phrase) : option.hint,
    })),
  }
}

export function questionIds(questionnaire: Questionnaire): string[] {
  return questionnaire.sections.flatMap((section) => section.questions.map((question) => question.id))
}

export function buildSteps(questionnaire: Questionnaire, answers: Record<string, AnswerValue> = {}): Step[] {
  const steps: Step[] = []
  let number = 0
  questionnaire.sections.forEach((section, sectionIndex) => {
    const active = section.questions
      .map((question, questionIndex) => ({ question, questionIndex }))
      .filter(({ question }) => isQuestionActive(question, answers))
    if (active.length === 0) return
    steps.push({ kind: 'section', sectionIndex })
    for (const item of active) {
      number += 1
      steps.push({ kind: 'question', sectionIndex, questionIndex: item.questionIndex, number })
    }
  })
  return steps
}

export function questionAt(questionnaire: Questionnaire, sectionIndex: number, questionIndex: number): Question {
  const question = questionnaire.sections[sectionIndex]?.questions[questionIndex]
  if (!question) throw new Error('Vraag niet gevonden')
  return question
}

export function findStepIndex(steps: Step[], questionId: string, questionnaire: Questionnaire): number {
  return steps.findIndex((step) => {
    if (step.kind !== 'question') return false
    return questionnaire.sections[step.sectionIndex]?.questions[step.questionIndex]?.id === questionId
  })
}
