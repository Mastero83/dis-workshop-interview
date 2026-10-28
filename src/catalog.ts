import raw from './vragenlijst.json'
import type { Catalog, Question, Questionnaire, Section, Step } from './types'

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
    return item as unknown as Questionnaire
  })
  return { questionnaires }
}

export function findQuestionnaire(catalog: Catalog, id: string | null): Questionnaire | null {
  if (!id) return catalog.questionnaires[0] ?? null
  return catalog.questionnaires.find((item) => item.id === id) ?? null
}

export function questionCount(questionnaire: Questionnaire): number {
  return questionnaire.sections.reduce((sum, section) => sum + section.questions.length, 0)
}

export function questionIds(questionnaire: Questionnaire): string[] {
  return questionnaire.sections.flatMap((section) => section.questions.map((question) => question.id))
}

export function buildSteps(questionnaire: Questionnaire): Step[] {
  const steps: Step[] = []
  let number = 0
  questionnaire.sections.forEach((section, sectionIndex) => {
    steps.push({ kind: 'section', sectionIndex })
    section.questions.forEach((_question, questionIndex) => {
      number += 1
      steps.push({ kind: 'question', sectionIndex, questionIndex, number })
    })
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
