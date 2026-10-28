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
}

const QUIZ_TO_LIBRARY: Record<string, string> = { finance: 'finance-controller' }

const QUADRANT_NAME: Record<string, string> = {
  'quick-wins': 'Quick wins',
  'strategische-projecten': 'Strategisch',
  opvullers: 'Later',
  'later-niet': 'Niet doen',
}

const FEASIBILITY: Record<string, number> = { hoog: 3, middel: 2, laag: 1 }

const useCases = library.usecases as UseCaseDef[]
const useCaseById = new Map(useCases.map((item) => [item.id, item]))
const points = spec.punten as SpecPunt[]
const roles = mapping.rollen as Record<string, { rol_label: string; signalen: SignalDef[] }>

export const intensityScale = mapping.intensiteitsschaal as IntensityScale[]
export const TOP_COUNT = mapping.score.toon_top
export const MIN_SCORE = mapping.score.minimale_score_om_te_tonen

export function libraryRole(quizRole: string): string {
  return QUIZ_TO_LIBRARY[quizRole] || quizRole
}

export function signalsForRole(quizRole: string): SignalDef[] {
  return roles[libraryRole(quizRole)]?.signalen || []
}

export function roleLabel(quizRole: string): string {
  return roles[libraryRole(quizRole)]?.rol_label || quizRole
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
      help: 'Tik per uitspraak hoe vaak dit speelt.',
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
    title: 'Dit zijn de drie kansen die het meest bij jullie passen',
    help: 'Geef per kans aan of je die in de workshop wilt bespreken. Een zin over het grootste verschil mag, maar hoeft niet.',
    required: true,
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
    }
  })
}

export function useCaseName(id: string): string {
  return useCaseById.get(id)?.naam || id
}

export function intensityLabel(value: number): string {
  return intensityScale.find((item) => item.waarde === value)?.label || String(value)
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

export function kansFields(value: unknown): { interest: Record<string, string>; note: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { interest: {}, note: '' }
  const record = value as { kind?: string; interest?: Record<string, string>; note?: string }
  if (record.kind !== 'kansen') return { interest: {}, note: '' }
  return { interest: record.interest || {}, note: record.note || '' }
}

export function collectResult(answers: Record<string, unknown>): {
  roles: string[]
  ranked: RankedUseCase[]
  intensities: Record<string, number>
  interest: Record<string, string>
  note: string
} {
  const roles = activeQuizRoles(stringList(answers.rollen), stringList(answers['rollen-focus']))
  const byRole: Record<string, Record<string, number>> = {}
  const intensities: Record<string, number> = {}
  for (const role of roles) {
    const values = signalValues(answers[`sig-${role}`])
    byRole[role] = values
    Object.assign(intensities, values)
  }
  const kans = kansFields(answers.kansen)
  return {
    roles,
    ranked: rankUseCases(roles, byRole),
    intensities,
    interest: kans.interest,
    note: kans.note,
  }
}

export function interestLabel(value: string): string {
  if (value === 'graag') return 'Graag in de workshop'
  if (value === 'misschien') return 'Misschien'
  if (value === 'niet') return 'Niet nu'
  return value
}
