import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSteps, isQuestionActive, loadCatalog } from '../src/catalog.ts'
import { interpretStored } from '../src/session.ts'

interface FollowFile {
  id: string
  title: string
  options?: unknown[]
}

interface QuestionFile {
  id: string
  type: string
  title: string
  context?: { type?: string; src?: string }
  options?: { value: string; followUp?: FollowFile }[]
  focus?: { id: string; whenSelectedMoreThan: number; pick: number }
  closing?: { id: string; title: string }
}

interface SectionFile {
  title: string
  questions: QuestionFile[]
}

interface DisabledClip {
  id: string
  context?: { src?: string; enabled?: boolean }
}

interface QuestionnaireFile {
  id: string
  estimatedMinutes: number
  intro: string
  disabledMedia?: DisabledClip[]
  sections: SectionFile[]
}

const catalog = JSON.parse(readFileSync(new URL('../src/vragenlijst.json', import.meta.url), 'utf8')) as {
  questionnaires: QuestionnaireFile[]
}
const questionnaire = catalog.questionnaires[0]
const questions = questionnaire.sections.flatMap((section) =>
  section.questions.map((question) => ({ ...question, section: section.title })),
)
const known = new Set(questions.map((question) => question.id))

assert.deepEqual(
  questions.map((question) => question.id),
  ['organisatie', 'rollen', 'urgentie', 'doelen', 'ai-houding'],
  'de rollen moeten de tweede vraag zijn',
)
assert.deepEqual(
  questionnaire.sections.map((section) => section.title),
  ['Over je bedrijf', 'Rollen en tijdvreters', 'Doelen voor de workshop', 'AI Services'],
)
assert.equal(questionnaire.estimatedMinutes, 4)
assert.match(questionnaire.intro, /±3–5 minuten/)
assert.equal(
  questions.some((question) => question.context?.src?.includes('ctx-kettingreactie')),
  false,
)
const parked = questionnaire.disabledMedia?.find((clip) => clip.id === 'kettingreactie')
assert.equal(parked?.context?.src, 'media/ctx-kettingreactie.mp4')
assert.equal(parked?.context?.enabled, false)

const rollen = questions.find((question) => question.id === 'rollen')
assert.ok(rollen)
assert.equal(rollen.type, 'roles')
assert.equal(rollen.title, 'Welke rollen herken je bij jullie, en waar gaat de meeste tijd naartoe?')
assert.equal(rollen.options?.length, 10)
assert.equal(rollen.context?.type, 'video')
assert.equal(rollen.context?.src, 'media/ctx-rollen-tijdvreters.mp4')
assert.equal(rollen.focus?.id, 'rollen-focus')
assert.equal(rollen.focus?.whenSelectedMoreThan, 3)
assert.equal(rollen.focus?.pick, 3)
assert.equal(rollen.closing?.id, 'slot')
assert.match(rollen.closing?.title || '', /\{top\}/)
for (const option of rollen.options || []) {
  assert.ok(option.followUp, `${option.value} mist een vervolgvraag`)
  assert.equal(option.followUp?.id, `fu-${option.value}`)
  assert.ok((option.followUp?.options?.length || 0) >= 3, `${option.value} mist chips`)
}
assert.equal(questions.some((question) => question.id === 'sector' || question.id === 'pijnpunten'), false)

const qid = questionnaire.id

function legacy(stepIndex: number, phase = 'flow'): string {
  return JSON.stringify({
    version: 1,
    questionnaireId: qid,
    klant: '',
    phase,
    stepIndex,
    answers: { sector: 'bouw', pijnpunten: ['wacht'], organisatie: 'Test' },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  })
}

for (const step of [0, 6, 8, 11, 13]) {
  const decision = interpretStored(legacy(step), qid, '', known)
  assert.equal(decision.restarted, true, `versie 1 op stap ${step} moet opnieuw beginnen`)
  assert.equal(decision.discard, true)
  assert.equal(decision.session.phase, 'welcome')
  assert.equal(decision.session.version, 4)
  assert.equal(decision.session.questionId, null)
  assert.deepEqual(decision.session.answers, {})
}

const finished = interpretStored(legacy(13, 'summary'), qid, '', known)
assert.equal(finished.restarted, true, 'een afgeronde sessie van voor de rollenfix begint opnieuw')

const previousSchema = interpretStored(
  JSON.stringify({
    version: 2,
    questionnaireId: qid,
    phase: 'flow',
    stepIndex: 5,
    questionId: 'rollen',
    answers: { organisatie: 'Test', projectverloop: 'Kort.', rollen: ['planner'] },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  qid,
  '',
  known,
)
assert.equal(previousSchema.restarted, true, 'schemaversie 2 hoort bij het gesprek mét projectverloop')
assert.equal(previousSchema.session.phase, 'welcome')
assert.deepEqual(previousSchema.session.answers, {})

const previousSummary = interpretStored(
  JSON.stringify({
    version: 2,
    questionnaireId: qid,
    phase: 'summary',
    stepIndex: 10,
    questionId: null,
    answers: { organisatie: 'Test', projectverloop: 'Kort.' },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  qid,
  '',
  known,
)
assert.equal(previousSummary.restarted, true, 'een afgeronde sessie van schema 2 begint opnieuw')

const schema3 = interpretStored(
  JSON.stringify({
    version: 3,
    questionnaireId: qid,
    phase: 'flow',
    stepIndex: 5,
    questionId: 'rollen',
    answers: { organisatie: 'Test', rollen: ['planner'] },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  qid,
  '',
  known,
)
assert.equal(schema3.restarted, true, 'schemaversie 3 hoort bij het gesprek zonder vervolgvragen')

const resumed = interpretStored(
  JSON.stringify({
    version: 4,
    questionnaireId: qid,
    phase: 'flow',
    stepIndex: 11,
    questionId: 'rollen',
    answers: { organisatie: 'Test', rollen: ['planner'] },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  qid,
  '',
  known,
)
assert.equal(resumed.restarted, false)
assert.equal(resumed.discard, false)
assert.equal(resumed.session.questionId, 'rollen')
assert.equal(resumed.session.phase, 'flow')
assert.deepEqual(resumed.session.answers.rollen, ['planner'])

const droppedQuestion = interpretStored(
  JSON.stringify({
    version: 4,
    questionnaireId: qid,
    phase: 'flow',
    stepIndex: 3,
    questionId: 'projectverloop',
    answers: { projectverloop: 'Kort.' },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  qid,
  '',
  known,
)
assert.equal(droppedQuestion.restarted, true, 'projectverloop mag het gesprek niet meer openen')

const removed = interpretStored(
  JSON.stringify({
    version: 2,
    questionnaireId: qid,
    phase: 'flow',
    stepIndex: 4,
    questionId: 'sector',
    answers: { sector: 'bouw' },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  qid,
  '',
  known,
)
assert.equal(removed.restarted, true, 'een verdwenen vraag-id mag het gesprek niet voorbij de rollen zetten')

const withoutId = interpretStored(
  JSON.stringify({
    version: 2,
    questionnaireId: qid,
    phase: 'flow',
    stepIndex: 8,
    answers: { organisatie: 'Test' },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  qid,
  '',
  known,
)
assert.equal(withoutId.restarted, true)

const fresh = interpretStored(null, qid, 'Van Gelder', known)
assert.equal(fresh.restarted, false)
assert.equal(fresh.discard, false)
assert.equal(fresh.session.phase, 'welcome')
assert.equal(fresh.session.klant, 'Van Gelder')

const broken = interpretStored('{', qid, '', known)
assert.equal(broken.restarted, false)
assert.equal(broken.discard, true)

const expanded = loadCatalog().questionnaires[0]
const expandedIds = expanded.sections.flatMap((section) => section.questions.map((question) => question.id))
assert.ok(expandedIds.includes('rollen-focus'))
assert.ok(expandedIds.includes('slot'))
assert.equal(expandedIds.filter((id) => id.startsWith('fu-')).length, 10)

const twoRoles = { rollen: ['inkoper', 'planner'] }
const twoActive = expanded.sections
  .flatMap((section) => section.questions)
  .filter((question) => isQuestionActive(question, twoRoles))
  .map((question) => question.id)
assert.deepEqual(twoActive, ['organisatie', 'rollen', 'fu-planner', 'fu-inkoper', 'urgentie', 'doelen', 'ai-houding', 'slot'])

const manyRoles = { rollen: ['planner', 'inkoper', 'finance', 'uitvoerder'] }
const beforeFocus = expanded.sections
  .flatMap((section) => section.questions)
  .filter((question) => isQuestionActive(question, manyRoles))
  .map((question) => question.id)
assert.ok(beforeFocus.includes('rollen-focus'))
assert.equal(beforeFocus.some((id) => id.startsWith('fu-')), false)

const focused = { ...manyRoles, 'rollen-focus': ['uitvoerder', 'planner', 'finance'] }
const afterFocus = expanded.sections
  .flatMap((section) => section.questions)
  .filter((question) => isQuestionActive(question, focused))
  .map((question) => question.id)
assert.deepEqual(
  afterFocus.filter((id) => id.startsWith('fu-')),
  ['fu-uitvoerder', 'fu-planner', 'fu-finance'],
)
assert.equal(buildSteps(expanded, focused).filter((step) => step.kind === 'question').length, 10)

console.log(`resume-check ok (${questions.map((question) => question.id).join(' → ')} + vervolgvragen)`)
