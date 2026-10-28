import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSteps, isQuestionActive, loadCatalog } from '../src/catalog.ts'
import { collectResult, kaartPunten, mapAxis, placeBubbles, signalsForRole } from '../src/kansen.ts'
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
  help?: string
  context?: { type?: string; src?: string; body?: string }
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
  openingVideo?: { src?: string; poster?: string }
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

assert.deepEqual(questions.map((question) => question.id), ['rollen', 'urgentie'])
assert.equal(questions.some((question) => question.id === 'organisatie'), false)
assert.deepEqual(questionnaire.sections.map((section) => section.title), ['Tijd- en kwaliteitsvreters'])
assert.equal(questionnaire.estimatedMinutes, 3)
assert.match(questionnaire.intro, /±2–3 minuten/)
assert.equal(questionnaire.openingVideo?.src, 'media/dis-group-ai-v13.mp4')
assert.equal(questionnaire.openingVideo?.poster, 'media/dis-group-ai-v13-poster.jpg')
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
assert.equal(rollen.title, 'Bij welke rollen zie je tijdsdruk, kwaliteitsverlies of kansen voor AI?')
assert.equal(rollen.help, 'Tik alle rollen aan die je herkent.')
assert.equal(rollen.context?.body, 'Kies de rollen waar je dat ziet.')
assert.equal(rollen.options?.length, 10)
assert.equal(rollen.context?.type, 'video')
assert.equal(rollen.context?.src, 'media/ctx-rollen-tijdvreters.mp4')
assert.equal(rollen.focus?.id, 'rollen-focus')
assert.equal(rollen.focus?.whenSelectedMoreThan, 3)
assert.equal(rollen.focus?.pick, 3)
assert.equal(rollen.closing, undefined)
for (const option of rollen.options || []) {
  assert.equal(option.followUp, undefined, `${option.value} hoort geen vervolgvraag meer te hebben`)
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
  assert.equal(decision.session.version, 6)
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

const schema4 = interpretStored(
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
assert.equal(schema4.restarted, true, 'schemaversie 4 hoort bij het gesprek met vervolgvragen')
assert.equal(schema4.session.phase, 'welcome')
assert.deepEqual(schema4.session.answers, {})

const schema5 = interpretStored(
  JSON.stringify({
    version: 5,
    questionnaireId: qid,
    phase: 'flow',
    stepIndex: 2,
    questionId: 'rollen',
    answers: { rollen: ['planner'] },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  qid,
  '',
  known,
)
assert.equal(schema5.restarted, true, 'schemaversie 5 hoort bij de langere uitspraken')
assert.equal(schema5.session.phase, 'welcome')
assert.deepEqual(schema5.session.answers, {})

const resumed = interpretStored(
  JSON.stringify({
    version: 6,
    questionnaireId: qid,
    phase: 'flow',
    stepIndex: 2,
    questionId: 'rollen',
    answers: { rollen: ['planner'] },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  qid,
  '',
  known,
)
assert.equal(resumed.restarted, false)
assert.equal(resumed.discard, false)
assert.equal(resumed.session.version, 6)
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
assert.equal(fresh.session.version, 6)
assert.equal(fresh.session.klant, 'Van Gelder')

const broken = interpretStored('{', qid, '', known)
assert.equal(broken.restarted, false)
assert.equal(broken.discard, true)

const expanded = loadCatalog().questionnaires[0]
const expandedIds = expanded.sections.flatMap((section) => section.questions.map((question) => question.id))
assert.ok(expandedIds.includes('rollen-focus'))
assert.ok(expandedIds.includes('kansen'))
assert.ok(expandedIds.includes('nog-weten'))
assert.equal(expandedIds.includes('slot'), false)
assert.equal(expandedIds.filter((id) => id.startsWith('fu-')).length, 0)
assert.equal(expandedIds.filter((id) => id.startsWith('sig-')).length, 10)

const twoRoles = { rollen: ['inkoper', 'planner'] }
const twoActive = expanded.sections
  .flatMap((section) => section.questions)
  .filter((question) => isQuestionActive(question, twoRoles))
  .map((question) => question.id)
assert.deepEqual(twoActive, ['rollen', 'sig-planner', 'sig-inkoper', 'kansen', 'urgentie', 'nog-weten'])

const manyRoles = { rollen: ['planner', 'inkoper', 'finance', 'uitvoerder'] }
const beforeFocus = expanded.sections
  .flatMap((section) => section.questions)
  .filter((question) => isQuestionActive(question, manyRoles))
  .map((question) => question.id)
assert.ok(beforeFocus.includes('rollen-focus'))
assert.equal(beforeFocus.some((id) => id.startsWith('sig-')), false)

const focused = { ...manyRoles, 'rollen-focus': ['uitvoerder', 'planner', 'finance'] }
const afterFocus = expanded.sections
  .flatMap((section) => section.questions)
  .filter((question) => isQuestionActive(question, focused))
  .map((question) => question.id)
assert.deepEqual(
  afterFocus.filter((id) => id.startsWith('sig-')),
  ['sig-uitvoerder', 'sig-planner', 'sig-finance'],
)
assert.equal(buildSteps(expanded, focused).filter((step) => step.kind === 'question').length, 8)

const scored = collectResult({
  rollen: ['functioneel-beheerder'],
  'sig-functioneel-beheerder': {
    kind: 'signals',
    values: { 'FB-S1': 3, 'FB-S2': 3, 'FB-S3': 0, 'FB-S4': 0, 'FB-S5': 0, 'FB-S6': 0 },
  },
})
assert.ok(scored.ranked.length >= 2)
assert.equal(scored.ranked[0]?.id, 'UC-FB-01')
assert.equal(scored.ranked[0]?.score, 3)
assert.equal(scored.ranked.find((item) => item.id === 'UC-FB-02')?.score, 3)
assert.equal(Math.round((scored.ranked.find((item) => item.id === 'UC-KU-01')?.score || 0) * 10) / 10, 1.8)
assert.ok(
  scored.ranked.findIndex((item) => item.id === 'UC-FB-01') <
    scored.ranked.findIndex((item) => item.id === 'UC-FB-02'),
)

const zeros = collectResult({
  rollen: ['functioneel-beheerder'],
  'sig-functioneel-beheerder': {
    kind: 'signals',
    values: { 'FB-S1': 0, 'FB-S2': 0, 'FB-S3': 0, 'FB-S4': 0, 'FB-S5': 0, 'FB-S6': 0 },
  },
})
assert.equal(zeros.ranked.length, 0)

const shown = signalsForRole('functioneel-beheerder')
assert.deepEqual(
  shown.map((signal) => signal.id),
  ['FB-S1', 'FB-S6', 'FB-S3', 'FB-S2'],
)
for (const role of [
  'functioneel-beheerder',
  'key-user',
  'calculator',
  'werkvoorbereider',
  'projectleider',
  'uitvoerder',
  'planner',
  'servicecoordinator',
  'inkoper',
  'finance-controller',
]) {
  const signals = signalsForRole(role)
  assert.equal(signals.length, 4, role)
  for (const signal of signals) {
    assert.ok(signal.tekst.split(/\s+/).filter(Boolean).length <= 8, signal.id)
  }
}

assert.ok(mapAxis(1) < 50)
assert.ok(mapAxis(3) < 50)
assert.ok(mapAxis(4) >= 50)
assert.ok(mapAxis(5) > mapAxis(4))

const mild = collectResult({
  rollen: ['functioneel-beheerder'],
  'sig-functioneel-beheerder': { kind: 'signals', values: { 'FB-S1': 1.5 }, note: '' },
})
assert.equal(mild.ranked.find((item) => item.id === 'UC-FB-01')?.score, 1.5)
assert.equal(mild.ranked.find((item) => item.id === 'UC-KU-01'), undefined)

const sample = kaartPunten({ 'FB-S1': 3 }, ['UC-FB-01'], { 'UC-FB-01': 'graag' }).filter((point) => point.relevant)
assert.ok(sample.length >= 2)
const twins = sample.slice(0, 2).map((point) => ({ ...point, x: sample[0].x, y: sample[0].y, relevant: true }))
const placed = placeBubbles(twins, ['UC-FB-01'])
const gap = Math.hypot(placed[0].left - placed[1].left, placed[0].bottom - placed[1].bottom)
assert.ok(gap > 1)
const origin = mapAxis(sample[0].x)
const sameHalf = (value: number) => (origin < 50 ? value < 50 : value > 50)
assert.equal(sameHalf(placed[0].left), true)
assert.equal(sameHalf(placed[1].left), true)

const eigen = interpretStored(
  JSON.stringify({
    version: 6,
    questionnaireId: qid,
    phase: 'flow',
    stepIndex: 3,
    questionId: 'sig-eigen:Monteur',
    answers: { rollen: ['eigen:Monteur'] },
    startedAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  }),
  qid,
  '',
  known,
)
assert.equal(eigen.restarted, false)
assert.equal(eigen.session.questionId, 'sig-eigen:Monteur')

console.log(`resume-check ok (${questions.map((question) => question.id).join(' → ')} + uitspraken)`)
