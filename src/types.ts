export type Accent = 'blue' | 'green' | 'orange' | 'yellow'

export type QuestionType = 'text' | 'longtext' | 'single' | 'multiple' | 'scale' | 'rank'

export interface Media {
  type: 'video' | 'image'
  src: string
  poster?: string
  alt?: string
  caption?: string
}

/** Bron voor een filmpje. Paden zijn relatief aan public/. */
export interface ClipSource {
  src: string
  poster?: string
  /** Staand bestand, ongeveer 4:5. Ontbreekt het, dan geldt src. */
  srcPortrait?: string
  posterPortrait?: string
  /** 9:16, alleen voor volledig scherm op een telefoon. */
  srcFullscreen?: string
  posterFullscreen?: string
  /** WebVTT, Nederlands. */
  captions?: string
}

export interface ContextBlock {
  type: 'video' | 'explainer'
  src?: string
  poster?: string
  srcPortrait?: string
  posterPortrait?: string
  captions?: string
  title?: string
  body?: string
  /** false = in de config, niet tonen. */
  enabled?: boolean
}

export interface ParkedClip {
  id: string
  reason: string
  context: ContextBlock
}

export interface Option {
  value: string
  label: string
  hint?: string
}

export interface Question {
  id: string
  type: QuestionType
  title: string
  help?: string
  required?: boolean
  placeholder?: string
  /** Vul bij een lege sessie de klantnaam uit de URL in. */
  prefill?: 'klant'
  autocomplete?: string
  options?: Option[]
  min?: number
  max?: number
  minLabel?: string
  maxLabel?: string
  /** Minimaal aantal regels dat de gebruiker op volgorde zet. */
  minRanked?: number
  media?: Media | null
  /** Bericht van de host vóór de vraag: filmpje of korte uitleg. */
  context?: ContextBlock | null
}

export interface Section {
  id: string
  title: string
  kicker?: string
  intro: string
  image?: string
  imagePosition?: string
  accent: Accent
  /** Optionele video of afbeelding bij dit onderdeel. */
  media?: Media | null
  questions: Question[]
}

export interface Questionnaire {
  id: string
  title: string
  kicker: string
  intro: string
  heroImage: string
  heroPosition?: string
  estimatedMinutes: number
  consultantEmail?: string
  /** Video op het welkomstscherm. Blijft als reserve als introVideo ontbreekt. */
  video?: Media | null
  /** Kort introfilmpje op het welkomstscherm. */
  introVideo?: ClipSource | null
  /** Clips die in de map staan maar nog niet in het gesprek horen. */
  disabledMedia?: ParkedClip[]
  sections: Section[]
}

export interface Catalog {
  questionnaires: Questionnaire[]
}

export type AnswerValue = string | string[] | number | null

export type Phase = 'welcome' | 'flow' | 'summary'

export interface Session {
  version: 1
  questionnaireId: string
  klant: string
  phase: Phase
  stepIndex: number
  answers: Record<string, AnswerValue>
  startedAt: string
  updatedAt: string
  remotePushedAt?: string
}

export interface ExportAnswer {
  id: string
  sectionId: string
  section: string
  question: string
  type: QuestionType
  value: AnswerValue
  display: string
}

export interface ExportDoc {
  version: 1
  questionnaireId: string
  questionnaireTitle: string
  klant: string
  exportedAt: string
  startedAt: string
  updatedAt: string
  answers: ExportAnswer[]
}

export type Step =
  | { kind: 'section'; sectionIndex: number }
  | { kind: 'question'; sectionIndex: number; questionIndex: number; number: number }
