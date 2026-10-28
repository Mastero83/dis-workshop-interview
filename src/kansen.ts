import mapping from './data/signal-mapping.json' with { type: 'json' }
import spec from './data/kansenkaart-spec.json' with { type: 'json' }
import library from './data/usecases.json' with { type: 'json' }
import type { Question } from './types'

export interface IntensityScale {
  waarde: number
  label: string
}

export interface RankedUseCase {
  id: string
  naam: string
  omschrijving: string
  voorbeeld: string
  score: number
  haalbaarheid: string
  impact: string
  regel: string
  eersteRol: string
  eigenRol: boolean
  signalen: string[]
}

export interface KaartPunt {
  id: string
  naam: string
  x: number
  y: number
  kleur: string
  kwadrant: string
  kwadrantNaam: string
  size: number
  relevant: boolean
  top: boolean
  graag: boolean
  score: number
  haalbaarheid: string
  impact: string
  rol: string
  rolLabel: string
  toelichting: string
}

interface SignalLink {
  usecase: string
  gewicht: number
}

interface SignalDef {
  id: string
  tekst: string
  leidt_naar: SignalLink[]
}

interface UseCaseDef {
  id: string
  naam: string
  omschrijving: string
  rollen: string[]
  voorbeeld_bouw_installatie: string
  haalbaarheid: { niveau: string }
  impact: { niveau: string }
}

interface SpecPunt {
  id: string
  naam: string
  x: number
  y: number
  kleur: string
  kwadrant: string
  haalbaarheid: string
  impact: string
  rol?: string
}

const QUIZ_TO_LIBRARY: Record<string, string> = { finance: 'finance-controller' }

const QUADRANT_NAME: Record<string, string> = {
  'quick-wins': 'Quick wins',
  'strategische-projecten': 'Strategisch',
  opvullers: 'Later',
  'later-niet': 'Heroverwegen',
}

const QUADRANT_SUB: Record<string, string> = {
  'quick-wins': 'Snel te doen, direct effect',
  'strategische-projecten': 'Groot effect, meer voorbereiding',
  opvullers: 'Haalbaar, nu nog niet',
  'later-niet': 'Weinig effect, lastig te doen',
}

export const QUADRANT_ORDER = ['strategische-projecten', 'quick-wins', 'later-niet', 'opvullers'] as const

const SHORT_TEXT: Record<string, string> = {
  'FB-S1': 'Ik beantwoord steeds dezelfde vragen',
  'FB-S6': 'Ik ruim veel stamdata op',
  'FB-S3': 'Tickets missen info en gaan rond',
  'FB-S2': 'Een melding naspelen kost te veel tijd',
  'KU-S1': "Collega's vragen steeds hoe het moet",
  'KU-S4': 'Werkinstructies lopen achter op het werk',
  'KU-S5': "Collega's wijken uit naar Excel",
  'KU-S2': 'Ik schrijf testscripts elke release opnieuw',
  'CAL-S3': 'De werkbegroting wijkt af van mijn calculatie',
  'CAL-S1': 'Ik zoek steeds materiaalprijzen bij',
  'CAL-S2': 'Dezelfde inschattingsfouten komen terug',
  'CAL-S4': 'Bestek doorlezen kost me dagen',
  'WVB-S1': 'Ik zoek de laatste tekeningversie',
  'WVB-S4': 'Werkpakketten gaan incompleet de bouw op',
  'WVB-S5': 'Ik typ materiaallijsten over',
  'WVB-S6': 'De bouwplaats belt over bekende info',
  'PL-S2': 'Ik zie overschrijdingen te laat',
  'PL-S3': 'Meerwerk wordt te laat vastgelegd',
  'PL-S6': 'Ik zoek veel projectinfo bij elkaar',
  'PL-S1': 'Statusrapporten kosten me uren',
  'UITV-S2': 'Ik twijfel of de tekening klopt',
  'UITV-S3': 'Ik bel wanneer materiaal komt',
  'UITV-S1': 'Ik vul avonds nog uren in',
  'UITV-S4': 'Opleverpunten raken zoek',
  'PLAN-S3': 'Werkorders voor monteurs zijn incompleet',
  'PLAN-S5': 'Ik plan zonder dat materiaal er is',
  'PLAN-S1': 'Ziekte kost me een halve ochtend',
  'PLAN-S4': 'Ik bel klanten over gewijzigde afspraken',
  'SC-S5': 'Monteurs moeten terug door missende info',
  'SC-S2': 'Ik zoek bij elke melding het contract',
  'SC-S1': 'Ik typ storingen over in het systeem',
  'SC-S3': 'Werkbonnen komen onvolledig terug',
  'INK-S1': 'Ik leg facturen naast orders',
  'INK-S3': 'Leveranciersoffertes zijn lastig te vergelijken',
  'INK-S4': 'Er wordt besteld zonder budgetcheck',
  'INK-S6': 'Prijzen in orders zijn niet actueel',
  'FIN-S3': 'Termijnen en meerwerk factureren we laat',
  'FIN-S5': 'Rapportages zijn niet vergelijkbaar',
  'FIN-S2': 'Verlieslatende projecten zien we laat',
  'FIN-S6': 'Werkbonnen en facturen komen onvolledig',
}

export const EIGEN_PREFIX = 'eigen:'
export const SIGNAL_LIMIT = 4
const AXIS_MIN = 1
const AXIS_MAX = 5
const AXIS_THRESHOLD = 4

const FEASIBILITY: Record<string, number> = { hoog: 3, middel: 2, laag: 1 }

const useCases = library.usecases as UseCaseDef[]
const useCaseById = new Map(useCases.map((item) => [item.id, item]))
const points = spec.punten as SpecPunt[]
const roles = mapping.rollen as Record<string, { rol_label: string; signalen: SignalDef[] }>

export const intensityScale = mapping.intensiteitsschaal as IntensityScale[]
export const quickScale: IntensityScale[] = [
  { waarde: 0, label: 'Nee' },
  { waarde: 1.5, label: 'Soms' },
  { waarde: 3, label: 'Vaak' },
]
export const TOP_COUNT = mapping.score.toon_top
export const MIN_SCORE = mapping.score.minimale_score_om_te_tonen
const roleColors = spec.kleur_per_rol as Record<string, { label: string; kleur: string }>

export function libraryRole(quizRole: string): string {
  return QUIZ_TO_LIBRARY[quizRole] || quizRole
}

export function isEigenRole(value: string): boolean {
  return value.startsWith(EIGEN_PREFIX) && value.slice(EIGEN_PREFIX.length).trim().length > 0
}

export function eigenLabel(value: string): string {
  return isEigenRole(value) ? value.slice(EIGEN_PREFIX.length).trim() : value
}

function weightSum(signal: SignalDef): number {
  return signal.leidt_naar.reduce((sum, link) => sum + link.gewicht, 0)
}

function maxWeight(signal: SignalDef): number {
  return signal.leidt_naar.reduce((max, link) => Math.max(max, link.gewicht), 0)
}

export function signalsForRole(quizRole: string): SignalDef[] {
  const all = roles[libraryRole(quizRole)]?.signalen || []
  return [...all]
    .sort((left, right) => {
      const sum = weightSum(right) - weightSum(left)
      if (sum !== 0) return sum
      const max = maxWeight(right) - maxWeight(left)
      if (max !== 0) return max
      return left.id.localeCompare(right.id)
    })
    .slice(0, SIGNAL_LIMIT)
    .map((signal) => ({ ...signal, tekst: SHORT_TEXT[signal.id] || signal.tekst }))
}

export function roleLabel(quizRole: string): string {
  if (isEigenRole(quizRole)) return eigenLabel(quizRole)
  return roles[libraryRole(quizRole)]?.rol_label || roleColors[libraryRole(quizRole)]?.label || quizRole
}

export function shortLine(text: string, maxWords = 12): string {
  const sentence = text.replace(/\s+/g, ' ').trim().split(/[.!?]/)[0] || ''
  const words = sentence.split(' ').filter(Boolean)
  let cut = (words.length > maxWords ? words.slice(0, maxWords) : words).join(' ')
  if (words.length > maxWords) {
    const comma = cut.lastIndexOf(',')
    const kept = comma > 0 ? cut.slice(0, comma).split(' ').filter(Boolean).length : 0
    if (kept >= 4) cut = cut.slice(0, comma)
  }
  return cut.replace(/\s*\([^)]*$/, '').replace(/[,:;]+$/, '').trim()
}

export function mapAxis(value: number): number {
  const inset = 8
  const half = 50
  if (value < AXIS_THRESHOLD) {
    const span = (value - AXIS_MIN) / (AXIS_THRESHOLD - AXIS_MIN)
    return inset + span * (half - inset * 2)
  }
  const span = (value - AXIS_THRESHOLD) / (AXIS_MAX - AXIS_THRESHOLD)
  return half + inset + span * (half - inset * 2)
}

export function quadrantSubtitle(id: string): string {
  return QUADRANT_SUB[id] || ''
}

export function signalQuestions(
  options: { value: string; label: string }[],
  focus: { id: string; whenSelectedMoreThan: number } | undefined,
): Question[] {
  return options
    .filter((option) => signalsForRole(option.value).length > 0)
    .map((option) => ({
      id: `sig-${option.value}`,
      type: 'signals' as const,
      title: `${option.label}: herken je dit?`,
      help: 'Tik soms of vaak.',
      required: true,
      signalRole: option.value,
      when: {
        role: option.value,
        rolesQuestion: 'rollen',
        focusQuestion: focus?.id,
        focusWhenMoreThan: focus?.whenSelectedMoreThan ?? 3,
      },
    }))
}

export function kansenQuestion(): Question {
  return {
    id: 'kansen',
    type: 'kansen',
    title: 'Welke kansen bespreken we?',
    help: 'Tik per kans. Een eigen idee mag.',
    required: true,
  }
}

export function closingQuestion(): Question {
  return {
    id: 'nog-weten',
    type: 'longtext',
    title: 'Wat moeten we nog weten?',
    help: 'Optioneel.',
    placeholder: 'Bijv. wie erbij moet zijn',
    required: false,
  }
}

export function customSignalQuestion(
  value: string,
  focus: { id: string; whenSelectedMoreThan: number } | undefined,
): Question {
  return {
    id: `sig-${value}`,
    type: 'signals',
    title: `${eigenLabel(value)}: nog een tijdvreter?`,
    help: 'Optioneel.',
    placeholder: 'bijv. uren invoeren op vrijdag',
    required: false,
    signalRole: value,
    when: {
      role: value,
      rolesQuestion: 'rollen',
      focusQuestion: focus?.id,
      focusWhenMoreThan: focus?.whenSelectedMoreThan ?? 3,
    },
  }
}

export function activeQuizRoles(selected: string[], focus: string[] | undefined, limit = 3): string[] {
  if (selected.length > limit && focus && focus.length > 0) {
    return focus.filter((id) => selected.includes(id))
  }
  return selected
}

function feasibilityRank(level: string): number {
  return FEASIBILITY[level] ?? 0
}

export function rankUseCases(
  chosenQuizRoles: string[],
  answersByQuizRole: Record<string, Record<string, number>>,
): RankedUseCase[] {
  const chosenLibrary = new Set(chosenQuizRoles.map(libraryRole))
  const totals = new Map<string, { score: number; signalen: string[] }>()
  for (const quizRole of chosenQuizRoles) {
    const values = answersByQuizRole[quizRole] || {}
    for (const signal of signalsForRole(quizRole)) {
      const intensity = values[signal.id] ?? 0
      if (intensity <= 0) continue
      for (const link of signal.leidt_naar) {
        const bucket = totals.get(link.usecase) || { score: 0, signalen: [] }
        bucket.score += link.gewicht * intensity
        if (!bucket.signalen.includes(signal.id)) bucket.signalen.push(signal.id)
        totals.set(link.usecase, bucket)
      }
    }
  }
  const ranked = [...totals.entries()]
    .map(([id, bucket]) => {
      const useCase = useCaseById.get(id)
      if (!useCase) return null
      const eersteRol = useCase.rollen[0] || ''
      return {
        id,
        naam: useCase.naam,
        omschrijving: useCase.omschrijving,
        voorbeeld: useCase.voorbeeld_bouw_installatie,
        regel: shortLine(useCase.omschrijving),
        score: bucket.score,
        haalbaarheid: useCase.haalbaarheid.niveau,
        impact: useCase.impact.niveau,
        eersteRol,
        eigenRol: chosenLibrary.has(eersteRol),
        signalen: bucket.signalen,
      }
    })
    .filter((item): item is RankedUseCase => item != null && item.score >= MIN_SCORE)
  ranked.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    if (left.eigenRol !== right.eigenRol) return left.eigenRol ? -1 : 1
    const feasibility = feasibilityRank(right.haalbaarheid) - feasibilityRank(left.haalbaarheid)
    if (feasibility !== 0) return feasibility
    return left.id.localeCompare(right.id)
  })
  return ranked.slice(0, TOP_COUNT)
}

export function hitCounts(intensities: Record<string, number>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const group of Object.values(roles)) {
    for (const signal of group.signalen) {
      if ((intensities[signal.id] ?? 0) <= 0) continue
      for (const link of signal.leidt_naar) {
        counts.set(link.usecase, (counts.get(link.usecase) || 0) + 1)
      }
    }
  }
  return counts
}

export function kaartPunten(
  intensities: Record<string, number>,
  topIds: string[],
  interest: Record<string, string>,
  scores: Record<string, number> = {},
): KaartPunt[] {
  const hits = hitCounts(intensities)
  return points.map((point) => {
    const hit = hits.get(point.id) || 0
    const top = topIds.includes(point.id)
    const graag = interest[point.id] === 'graag'
    const size = Math.min(28, 8 + 4 * hit + (graag || top ? 6 : 0))
    return {
      id: point.id,
      naam: point.naam,
      x: point.x,
      y: point.y,
      kleur: point.kleur,
      kwadrant: point.kwadrant,
      kwadrantNaam: QUADRANT_NAME[point.kwadrant] || point.kwadrant,
      size,
      relevant: hit > 0 || top,
      top,
      graag,
      score: scores[point.id] || 0,
      haalbaarheid: point.haalbaarheid,
      impact: point.impact,
      rol: point.rol || '',
      rolLabel: roleColors[point.rol || '']?.label || point.rol || '',
      toelichting: shortLine(useCaseById.get(point.id)?.omschrijving || point.naam),
    }
  })
}

export function useCaseName(id: string): string {
  return useCaseById.get(id)?.naam || id
}

export function intensityLabel(value: number): string {
  return quickScale.find((item) => item.waarde === value)?.label || String(value)
}

export interface PlacedDot {
  id: string
  naam: string
  kleur: string
  ink: string
  left: number
  bottom: number
  size: number
  top: boolean
  graag: boolean
  nummer: number | null
  kwadrantNaam: string
  toelichting: string
  rolLabel: string
}

function inkFor(hex: string): string {
  const raw = hex.replace('#', '')
  if (raw.length !== 6) return '#001a3f'
  const value = Number.parseInt(raw, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
  return luminance > 0.64 ? '#001a3f' : '#ffffff'
}

function clampHalf(value: number, origin: number): number {
  if (origin < 50) return Math.min(46, Math.max(8, value))
  return Math.min(92, Math.max(54, value))
}

export function placeBubbles(punten: KaartPunt[], rankedIds: string[]): PlacedDot[] {
  const draft = punten
    .filter((point) => point.relevant)
    .map((point) => {
      const left = mapAxis(point.x)
      const bottom = mapAxis(point.y)
      const rank = rankedIds.indexOf(point.id)
      return {
        id: point.id,
        naam: point.naam,
        kleur: point.kleur,
        ink: inkFor(point.kleur),
        left,
        bottom,
        originLeft: left,
        originBottom: bottom,
        size: point.size,
        radius: Math.max(3.2, ((point.size / 2) / 320) * 100),
        top: point.top,
        graag: point.graag,
        nummer: point.top && rank >= 0 ? rank + 1 : null,
        kwadrantNaam: point.kwadrantNaam,
        toelichting: point.toelichting,
        rolLabel: point.rolLabel,
      }
    })
  for (let pass = 0; pass < 60; pass += 1) {
    let moved = false
    for (let i = 0; i < draft.length; i += 1) {
      for (let j = i + 1; j < draft.length; j += 1) {
        const leftDot = draft[i]
        const rightDot = draft[j]
        let dx = rightDot.left - leftDot.left
        let dy = rightDot.bottom - leftDot.bottom
        let distance = Math.hypot(dx, dy)
        const min = leftDot.radius + rightDot.radius + 1.2
        if (distance >= min) continue
        if (distance < 0.01) {
          dx = (i + j) % 2 === 0 ? 0.5 : -0.4
          dy = (i + j) % 3 === 0 ? 0.45 : -0.35
          distance = Math.hypot(dx, dy)
        }
        const push = (min - distance) / 2
        leftDot.left = clampHalf(leftDot.left - (dx / distance) * push, leftDot.originLeft)
        leftDot.bottom = clampHalf(leftDot.bottom - (dy / distance) * push, leftDot.originBottom)
        rightDot.left = clampHalf(rightDot.left + (dx / distance) * push, rightDot.originLeft)
        rightDot.bottom = clampHalf(rightDot.bottom + (dy / distance) * push, rightDot.originBottom)
        moved = true
      }
    }
    if (!moved) break
  }
  return draft.map((dot) => ({
    id: dot.id,
    naam: dot.naam,
    kleur: dot.kleur,
    ink: dot.ink,
    left: dot.left,
    bottom: dot.bottom,
    size: dot.size,
    top: dot.top,
    graag: dot.graag,
    nummer: dot.nummer,
    kwadrantNaam: dot.kwadrantNaam,
    toelichting: dot.toelichting,
    rolLabel: dot.rolLabel,
  }))
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function signalValues(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const record = value as { kind?: string; values?: Record<string, number> }
  if (record.kind !== 'signals' || !record.values) return {}
  return record.values
}

export function signalNote(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ''
  const record = value as { kind?: string; note?: string }
  return record.kind === 'signals' ? (record.note || '').trim() : ''
}

export function kansFields(value: unknown): { interest: Record<string, string>; ideas: string[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { interest: {}, ideas: [] }
  const record = value as { kind?: string; interest?: Record<string, string>; ideas?: string[] }
  if (record.kind !== 'kansen') return { interest: {}, ideas: [] }
  const ideas = Array.isArray(record.ideas) ? record.ideas.filter((item) => typeof item === 'string' && item.trim()) : []
  return { interest: record.interest || {}, ideas }
}

export interface EigenInvoer {
  rollen: { id: string; label: string }[]
  tijdvreters: { rol: string; label: string; tekst: string }[]
  ideeen: string[]
  nogWeten: string
}

export function collectResult(answers: Record<string, unknown>): {
  roles: string[]
  ranked: RankedUseCase[]
  intensities: Record<string, number>
  interest: Record<string, string>
  ideas: string[]
  eigen: EigenInvoer
} {
  const selected = stringList(answers.rollen)
  const focus = stringList(answers['rollen-focus'])
  const active = activeQuizRoles(selected, focus)
  const byRole: Record<string, Record<string, number>> = {}
  const intensities: Record<string, number> = {}
  const tijdvreters: EigenInvoer['tijdvreters'] = []
  for (const role of active) {
    const stored = answers[`sig-${role}`]
    const values = signalValues(stored)
    byRole[role] = values
    Object.assign(intensities, values)
    const note = signalNote(stored)
    if (note) tijdvreters.push({ rol: role, label: roleLabel(role), tekst: note })
  }
  const kans = kansFields(answers.kansen)
  const nog = answers['nog-weten']
  return {
    roles: active,
    ranked: rankUseCases(active, byRole),
    intensities,
    interest: kans.interest,
    ideas: kans.ideas,
    eigen: {
      rollen: selected.filter(isEigenRole).map((id) => ({ id, label: eigenLabel(id) })),
      tijdvreters,
      ideeen: kans.ideas,
      nogWeten: typeof nog === 'string' ? nog.trim() : '',
    },
  }
}

export function interestLabel(value: string): string {
  if (value === 'graag') return 'Graag in de workshop'
  if (value === 'misschien') return 'Misschien'
  if (value === 'niet') return 'Niet nu'
  return value
}
