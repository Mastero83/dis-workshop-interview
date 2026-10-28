export type Accent = 'blue' | 'green' | 'orange' | 'yellow'

export type QuestionType = 'text' | 'longtext' | 'single' | 'multiple' | 'scale' | 'rank' | 'roles' | 'signals' | 'kansen'

export type RoleTint = 'blue' | 'green' | 'lilac' | 'sand'

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
  /** Kerncijfer op een rollenkaart, bijvoorbeeld 60–70%. */
  figure?: string
  /** Pad naar een Lucide-outline, relatief aan public/. */
  icon?: string
  /** Bronnaam, of het woord Schatting. */
  source?: string
  /** schatting = grijs label, bron = blauw “Bron: …”. */
  sourceKind?: 'schatting' | 'bron'
  tint?: RoleTint
  /** Korte verdieping, alleen als deze rol gekozen is. */
  followUp?: FollowUpDef
  /** Wat AI Services bij deze rol mag voorbereiden. */
  aiHint?: string
}

/** Wanneer een vraag in het gesprek komt. Ontbreekt dit, dan is de vraag er altijd. */
export interface ShowWhen {
  rolesQuestion?: string
  /** Toon alleen als deze rol gekozen is. */
  role?: string
  focusQuestion?: string
  /** Bij meer gekozen rollen telt daarna de focuslijst. */
  focusWhenMoreThan?: number
  /** Toon alleen als er meer rollen gekozen zijn dan dit aantal. */
  selectedMoreThan?: number
}

export interface FollowUpDef {
  id: string
  type: QuestionType
  title: string
  help?: string
  required?: boolean
  aiHint?: string
  options?: Option[]
}

export interface FocusDef {
  id: string
  whenSelectedMoreThan: number
  pick: number
  title: string
  help?: string
}

export interface ClosingDef {
  id: string
  type?: QuestionType
  title: string
  help?: string
  placeholder?: string
  required?: boolean
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
  minSelected?: number
  maxSelected?: number
  /** Chipopties beperken tot de waarden van deze vraag. */
  optionsFrom?: string
  when?: ShowWhen
  /** Vraag om een top te kiezen als er veel rollen zijn. */
  focus?: FocusDef
  /** Slotvraag, achteraan het gesprek. */
  closing?: ClosingDef
  /** Rol waarvan de ik-uitspraken uit de library komen. */
  signalRole?: string
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
  /** Eerste film op het welkomstscherm. Eén plek, zodat de bron te wisselen is. */
  openingVideo?: ClipSource | null
  /** Clips die in de map staan maar nog niet in het gesprek horen. */
  disabledMedia?: ParkedClip[]
  sections: Section[]
}

export interface Catalog {
  questionnaires: Questionnaire[]
}

export interface SignalAnswer {
  kind: 'signals'
  values: Record<string, number>
  note: string
}

export interface KansAnswer {
  kind: 'kansen'
  interest: Record<string, string>
  ideas: string[]
}

export type AnswerValue = string | string[] | number | null | SignalAnswer | KansAnswer

export type Phase = 'welcome' | 'flow' | 'summary'

export interface Session {
  version: 6
  questionnaireId: string
  klant: string
  phase: Phase
  /** Positie in de opgebouwde stappen. Bij hervatten telt `questionId`. */
  stepIndex: number
  /** Vraag die nu aan de beurt is. Ontbreekt die, dan is een oude sessie niet meer te hervatten. */
  questionId: string | null
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
  kansen: { id: string; naam: string; score: number; interest: string; signalen: string[] }[]
  eigen: {
    rollen: string[]
    tijdvreters: { rol: string; tekst: string }[]
    ideeen: string[]
    nogWeten: string
  }
}

export type Step =
  | { kind: 'section'; sectionIndex: number }
  | { kind: 'question'; sectionIndex: number; questionIndex: number; number: number }
