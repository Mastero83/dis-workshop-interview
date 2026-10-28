import './style.css'
import { buildSteps, findQuestionnaire, findStepIndex, isQuestionActive, loadCatalog, presentQuestion, questionAt, questionIds, rolePhrase } from './catalog'
import { collectResult, intensityScale, kaartPunten, roleLabel, signalsForRole } from './kansen'
import {
  answerHtml,
  asset,
  displayAnswer,
  escapeHtml,
  fileSlug,
  formatSummaryWhen,
  formatWhen,
  isEmpty,
  isExportDoc,
  isKansAnswer,
  isSignalAnswer,
  isValid,
  toExportDoc,
  toPlainText,
  validationMessage,
} from './format'
import { pushRemote, remoteStoreUrl } from './remote'
import { clearSession, createSession, hasProgress, loadSession, saveSession, wipeAppStorage } from './session'
import type {
  AnswerValue,
  ClipSource,
  ContextBlock,
  ExportDoc,
  Media,
  Question,
  Questionnaire,
  Section,
  Session,
  Step,
} from './types'

const SEND =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12h12M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const PLAY =
  '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M9 7.5v9l8-4.5-8-4.5Z" fill="currentColor"/></svg>'
const UP =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const DOWN =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const REFRESH =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 3v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 16H3v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const params = new URLSearchParams(location.search)
const klantParam = (params.get('klant') || '').trim()
const vragenlijstParam = params.get('vragenlijst')
const naarParam = (params.get('naar') || '').trim()
const resetOnLoad = params.get('reset') === '1'
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

let questionnaire: Questionnaire | null = null
let session: Session | null = null
let steps: Step[] = []
let totalQuestions = 0
let catalogError = ''
let suppressSave = false
let restarted = false

try {
  const catalog = loadCatalog()
  questionnaire = findQuestionnaire(catalog, vragenlijstParam)
  if (!questionnaire) catalogError = 'We kennen deze vragenlijst niet. Controleer de link, of open de standaardlijst.'
} catch (error) {
  catalogError = error instanceof Error ? error.message : 'De vragenlijst kon niet worden geladen.'
}

if (resetOnLoad) {
  suppressSave = true
  wipeAppStorage()
  const url = new URL(location.href)
  url.searchParams.delete('reset')
  url.searchParams.delete('beheer')
  location.replace(url.pathname + url.search + url.hash)
} else if (questionnaire) {
  const loaded = loadSession(questionnaire.id, klantParam, new Set(questionIds(questionnaire)))
  session = loaded.session
  restarted = loaded.restarted
  steps = buildSteps(questionnaire, session.answers)
  if (session.phase === 'flow' && session.questionId) {
    const index = findStepIndex(steps, session.questionId, questionnaire)
    if (index >= 0) session.stepIndex = index
    else if (questionById(session.questionId)) {
      const fallback = steps.findIndex((step) => step.kind === 'question')
      session.stepIndex = fallback < 0 ? 0 : fallback
    } else {
      clearSession(session)
      session = createSession(questionnaire.id, klantParam)
      restarted = true
      steps = buildSteps(questionnaire, session.answers)
    }
  }
  normalizeStep()
  totalQuestions = steps.filter((step) => step.kind === 'question').length
}

let atWelcome = !session || session.phase === 'welcome'
let beheer = params.get('beheer') === '1'
let errorText = ''
let modal: 'reset' | 'email' | null = null
let memoryOnly = false
let remoteNote = ''
let imports: { name: string; doc: ExportDoc }[] = []
let picked = new Set<number>()
let adminError = ''
let savedTimer = 0
let freshId = ''
let editingId = ''
let rolesOpen = false
let rolesScroll = 0
let celebrate = false
let lastLive = ''
let signalFor = ''
let signalIndex = 0
let kaartId = ''

const app = document.getElementById('app')!

function syncSteps(): void {
  if (!questionnaire || !session) return
  const currentId = currentQuestion()?.id || null
  steps = buildSteps(questionnaire, session.answers)
  totalQuestions = steps.filter((step) => step.kind === 'question').length
  if (session.phase !== 'flow') return
  if (!currentId) return
  const index = findStepIndex(steps, currentId, questionnaire)
  if (index >= 0) session.stepIndex = index
}

function shown(question: Question): Question {
  if (!questionnaire || !session) return question
  return presentQuestion(question, rolePhrase(questionnaire, session.answers))
}

function stampSession(): void {
  if (!session) return
  session.questionId = session.phase === 'flow' ? currentQuestion()?.id ?? null : null
}

function persist(): void {
  if (!session || suppressSave) return
  stampSession()
  memoryOnly = !saveSession(session)
}

function resetButton(): string {
  return `<button class="reset-btn no-print" type="button" data-action="ask-reset">${REFRESH}<span>Opnieuw beginnen</span></button>`
}

function reloadWelcome(): void {
  suppressSave = true
  wipeAppStorage()
  const url = new URL(location.href)
  url.searchParams.delete('reset')
  url.searchParams.delete('beheer')
  location.replace(url.pathname + url.search + url.hash)
}

function normalizeStep(): void {
  if (!session || session.phase !== 'flow') return
  let index = session.stepIndex
  if (index < 0) index = 0
  while (index < steps.length && steps[index]?.kind !== 'question') index += 1
  if (index >= steps.length) {
    session.phase = 'summary'
    session.stepIndex = Math.max(0, steps.length - 1)
    return
  }
  session.stepIndex = index
}

function render(): void {
  const media = captureMedia()
  const thread = document.getElementById('thread')
  const keepScroll = !freshId && thread ? thread.scrollTop : null
  const pageScroll = thread ? null : window.scrollY
  const sheet = document.querySelector('.role-sheet')
  if (sheet) rolesScroll = sheet.scrollTop
  document.querySelectorAll('body > .role-sheet').forEach((node) => node.remove())
  const arriving = freshId
  app.innerHTML = view()
  restoreMedia(media)
  applyPortraitPosters()
  const nextThread = document.getElementById('thread')
  if (nextThread) {
    if (arriving) {
      const composer = document.querySelector('.composer')
      const tall = composer != null && composer.getBoundingClientRect().height > window.innerHeight * 0.58
      const hosts = nextThread.querySelectorAll('.msg.host')
      const last = hosts[hosts.length - 1]
      if (tall && last) {
        const delta = last.getBoundingClientRect().top - nextThread.getBoundingClientRect().top
        nextThread.scrollTop += delta - 4
      } else nextThread.scrollTop = nextThread.scrollHeight
    } else if (keepScroll != null) nextThread.scrollTop = keepScroll
  } else if (pageScroll) window.scrollTo(0, pageScroll)
  const nextSheet = document.querySelector('.role-sheet.is-open')
  if (nextSheet && window.matchMedia('(max-width: 799px)').matches) document.body.appendChild(nextSheet)
  if (nextSheet && rolesScroll) nextSheet.scrollTop = rolesScroll
  const live = document.getElementById('live')
  const message = announcement()
  if (live && message !== lastLive) {
    live.textContent = message
    lastLive = message
  }
  if (arriving) {
    const question = questionById(arriving)
    if (question?.type === 'text' || question?.type === 'longtext') {
      document.querySelector<HTMLElement>('.composer .field')?.focus()
    }
  }
  freshId = ''
  celebrate = false
}

function announcement(): string {
  if (catalogError || !questionnaire || !session) return catalogError || 'Vragenlijst niet beschikbaar.'
  if (beheer) return 'Beheer. Vergelijk geëxporteerde antwoorden.'
  if (atWelcome || session.phase === 'welcome') return `${questionnaire.title}. Start het gesprek wanneer je wilt.`
  if (session.phase === 'summary') return 'Overzicht van het gesprek.'
  const question = currentQuestion()
  if (!question) return ''
  const step = steps[session.stepIndex]
  const number = step?.kind === 'question' ? step.number : 0
  return `Vraag ${number} van ${totalQuestions}. ${shown(question).title}`
}

function view(): string {
  if (catalogError || !questionnaire || !session) return missingView()
  if (beheer) return adminView()
  if (atWelcome || session.phase === 'welcome') return welcomeView()
  if (session.phase === 'summary') return summaryView()
  return chatView()
}

function logo(variant: 'light' | 'dark'): string {
  const file = variant === 'light' ? 'logos/DIS-Group-logo-wit.png' : 'logos/DIS-Group-logo-donker.png'
  return `<img class="logo" src="${asset(file)}" alt="DIS Group" />`
}

function avatar(): string {
  return `<img class="avatar" src="${asset('media/host-buddy.png')}" alt="" />`
}

function blobs(): string {
  return `<div class="scene" aria-hidden="true"><span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span><span class="blob b4"></span></div>`
}

function privacyLine(): string {
  if (remoteStoreUrl()) {
    return 'Je antwoorden blijven op dit apparaat staan en worden bij het overzicht ook naar de ingestelde opslag gestuurd.'
  }
  return 'Je antwoorden blijven op dit apparaat staan. Er gaat niets naar DIS tot je zelf exporteert of mailt.'
}

function beheerHref(): string {
  const url = new URL(location.href)
  url.searchParams.set('beheer', '1')
  return escapeHtml(url.pathname + url.search)
}

function homeHref(): string {
  const url = new URL(location.href)
  url.searchParams.delete('beheer')
  return escapeHtml(url.pathname + url.search)
}

function introClip(source: Questionnaire): ClipSource | null {
  if (source.openingVideo?.src) return source.openingVideo
  if (source.introVideo?.src) return source.introVideo
  if (source.video?.type === 'video' && source.video.src) return { src: source.video.src, poster: source.video.poster }
  return null
}

function posterAttrs(clip: { poster?: string; posterPortrait?: string }): string {
  const poster = clip.poster ? ` poster="${escapeHtml(asset(clip.poster))}"` : ''
  const portrait = clip.posterPortrait ? ` data-poster-portrait="${escapeHtml(asset(clip.posterPortrait))}"` : ''
  return poster + portrait
}

function sourceTags(clip: ClipSource): string {
  const portrait = clip.srcPortrait
    ? `<source media="(max-width: 799px)" src="${escapeHtml(asset(clip.srcPortrait))}" type="video/mp4" />`
    : ''
  const captions = clip.captions
    ? `<track kind="subtitles" src="${escapeHtml(asset(clip.captions))}" srclang="nl" label="Nederlands" default />`
    : ''
  return `${portrait}<source src="${escapeHtml(asset(clip.src))}" type="video/mp4" />${captions}`
}

function currentQuestion(): Question | null {
  if (!questionnaire || !session) return null
  const step = steps[session.stepIndex]
  if (!step || step.kind !== 'question') return null
  return questionAt(questionnaire, step.sectionIndex, step.questionIndex)
}

function questionById(id: string): Question | null {
  if (!questionnaire) return null
  for (const section of questionnaire.sections) {
    const found = section.questions.find((item) => item.id === id)
    if (found) return found
  }
  return null
}

function composerQuestion(): Question | null {
  if (editingId) return questionById(editingId)
  return currentQuestion()
}

function progressState(): { pct: number; minutes: string; label: string; answered: number } {
  if (!questionnaire || !session) return { pct: 0, minutes: '', label: '', answered: 0 }
  let answered = 0
  for (const section of questionnaire.sections) {
    for (const question of section.questions) {
      const value = session.answers[question.id]
      if (!isEmpty(value) && isValid(question, value, session.answers)) answered += 1
    }
  }
  const pct = totalQuestions === 0 ? 0 : Math.round((answered / totalQuestions) * 100)
  const ratioLeft = totalQuestions === 0 ? 1 : 1 - answered / totalQuestions
  const left = questionnaire.estimatedMinutes * ratioLeft
  const minutes = answered >= totalQuestions ? 'Klaar' : left < 0.75 ? '± 1 min' : `± ${Math.max(1, Math.ceil(left))} min`
  const step = steps[session.stepIndex]
  const number = step?.kind === 'question' ? step.number : Math.min(totalQuestions, answered + 1)
  return { pct, minutes, label: `Vraag ${number} van ${totalQuestions}`, answered }
}

function ring(pct: number): string {
  return `<svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
    <circle class="ring-bg" cx="18" cy="18" r="15" pathLength="100" />
    <circle class="ring-fg" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="${pct} 100" />
  </svg>`
}

function missingView(): string {
  const url = new URL(location.href)
  url.searchParams.delete('vragenlijst')
  return `${blobs()}<main class="panel">
    <header class="topbar">${logo('dark')}</header>
    <div class="panel-body">
      <h1 id="screen-title" tabindex="-1">Deze lijst bestaat niet</h1>
      <p>${escapeHtml(catalogError)}</p>
      <p><a class="btn btn-primary" href="${escapeHtml(url.pathname + url.search)}">Naar de standaardvragen</a></p>
    </div>
  </main>`
}

function welcomeView(): string {
  if (!questionnaire || !session) return ''
  const progress = hasProgress(session)
  const resumeLabel = session.phase === 'summary' ? 'Bekijk je overzicht' : 'Ga verder waar je was'
  const clip = introClip(questionnaire)
  const klant = klantParam
    ? `<p class="klant-pill"><span>Klant</span> ${escapeHtml(klantParam)}</p>`
    : ''
  const fullscreen = clip?.srcFullscreen
    ? ` data-fullscreen-src="${escapeHtml(asset(clip.srcFullscreen))}"`
    : ''
  const video = clip
    ? `<figure class="intro-slot${clip.srcPortrait ? ' has-portrait' : ''}" data-intro>
        <video controls playsinline preload="none"${posterAttrs(clip)}${fullscreen}>
          ${sourceTags(clip)}
          Je browser kan deze video niet afspelen.
        </video>
        <button class="clip-full intro-full" type="button" data-action="fullscreen" aria-label="Volledig scherm">${FULL}</button>
        <figcaption>Introductie</figcaption>
      </figure>`
    : ''
  return `${blobs()}<main class="welcome">
    <section class="welcome-card">
      <header class="welcome-bar">
        ${logo('dark')}
        <p class="welcome-title">Workshop</p>
        <div class="bar-tools">${klant}${resetButton()}</div>
      </header>
      <div class="welcome-grid">
        <div class="welcome-copy">
          <p class="kicker"><img class="avatar avatar-lg" src="${asset('media/host-buddy.png')}" alt="" /> ${escapeHtml(questionnaire.kicker)}</p>
          <h1 id="screen-title" tabindex="-1">De vragen voor de workshop</h1>
          <p class="lede">${escapeHtml(questionnaire.intro)}</p>
          ${restarted ? '<p class="reset-note">Het gesprek is bijgewerkt, we beginnen opnieuw.</p>' : ''}
          <div class="actions">
            ${
              progress
                ? `<button class="btn btn-yellow" type="button" data-action="resume">${resumeLabel}</button>
                   <button class="btn btn-ghost-dark" type="button" data-action="ask-reset">Opnieuw beginnen</button>`
                : `<button class="btn btn-yellow" type="button" data-action="start">Start het gesprek</button>`
            }
          </div>
          <p class="privacy">${escapeHtml(privacyLine())}${memoryOnly ? ' Deze browser bewaart ze niet blijvend — exporteer aan het eind.' : ''}</p>
        </div>
        ${video}
      </div>
      <footer class="welcome-foot">
        <span>DIS Group · Workshopvoorbereiding</span>
        <a href="${beheerHref()}">Antwoorden vergelijken</a>
      </footer>
    </section>
  </main>`
}

function chatView(): string {
  if (!questionnaire || !session) return ''
  const state = progressState()
  const open = composerQuestion()
  return `${blobs()}<main class="chat-app">
    <section class="chat-panel">
      <header class="chat-bar">
        <button class="logo-btn" type="button" data-action="home" aria-label="Naar het begin">${logo('dark')}</button>
        <p class="chat-title">Workshop</p>
        <div class="progress-cluster">
          ${ring(state.pct)}
          <div>
            <strong>${escapeHtml(state.minutes)}</strong>
            <span>${escapeHtml(state.label)}</span>
          </div>
        </div>
        <div class="chat-tools">
          <span class="saved" id="saved" hidden><i></i>Opgeslagen</span>
          ${resetButton()}
        </div>
      </header>
      <div class="meter" aria-hidden="true"><span style="width:${state.pct}%"></span></div>
      <div class="thread" id="thread" role="log" aria-relevant="additions">${transcript()}</div>
      ${composerHtml(open)}
    </section>
  </main>`
}

function transcript(): string {
  if (!questionnaire || !session) return ''
  const limit = session.stepIndex
  let html = ''
  let lastSection = -1
  steps.forEach((step, index) => {
    if (index > limit || step.kind !== 'question') return
    const section = questionnaire!.sections[step.sectionIndex]
    const question = section.questions[step.questionIndex]
    const fresh = freshId === question.id && !reduceMotion
    if (step.sectionIndex !== lastSection) {
      lastSection = step.sectionIndex
      html += chapterHtml(section, step.sectionIndex, fresh)
    }
    html += turnHtml(question, index, fresh)
  })
  return html
}

function chapterHtml(section: Section, index: number, fresh: boolean): string {
  return `<article class="chapter tint-${section.accent}${fresh ? ' is-fresh' : ''}">
    <span class="chapter-icon" aria-hidden="true">${sectionIcon(section.id)}</span>
    <div>
      <p>Hoofdstuk ${index + 1}</p>
      <h2>${escapeHtml(section.title)}</h2>
      ${section.intro ? `<p class="chapter-intro">${escapeHtml(section.intro)}</p>` : ''}
    </div>
  </article>`
}

function turnHtml(question: Question, index: number, fresh: boolean): string {
  if (!session) return ''
  question = shown(question)
  const value = session.answers[question.id]
  const showUser = index < session.stepIndex
  const typing = fresh
    ? `<div class="msg host typing-row" aria-hidden="true">${avatar()}<div class="bubble typing"><i></i><i></i><i></i></div></div>`
    : ''
  const context = question.context ? contextHtml(question.context, fresh, true) : ''
  const askDelay = question.context ? 'reveal-2' : 'reveal-1'
  const image = question.media?.type === 'image' ? imageHtml(question.media) : ''
  const ask = `<div class="msg host ${fresh ? askDelay : ''}${question.context ? '' : ' is-lead'}">
    ${question.context ? '<span class="avatar-spacer"></span>' : avatar()}
    <div class="stack">
      ${question.context ? '' : '<span class="who">DIS</span>'}
      <div class="bubble host">
        <p>${escapeHtml(question.title)}</p>
        ${question.help ? `<p class="help">${escapeHtml(question.help)}</p>` : ''}
        ${image}
      </div>
    </div>
  </div>`
  const user = showUser ? userBubble(question, value) : ''
  return `${typing}${context}${ask}${user}`
}

const FULL =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'

function contextHtml(context: ContextBlock, fresh: boolean, lead = false): string {
  if (context.enabled === false) return ''
  const reveal = fresh ? 'reveal-1' : ''
  const leadClass = lead ? ' is-lead' : ''
  if (context.type === 'video' && context.src) {
    const title = context.title || 'Video'
    return `<div class="msg host ${reveal}${leadClass}">
      ${avatar()}
      <div class="stack">
        <span class="who">DIS</span>
        <figure class="bubble clip-card">
          <div class="clip" data-clip>
            <video playsinline muted preload="none"${posterAttrs(context)}>
              ${sourceTags({ ...context, src: context.src })}
            </video>
            <button class="clip-play" type="button" data-action="play-clip" aria-label="Speel af: ${escapeHtml(title)}">${PLAY}</button>
            <button class="clip-full" type="button" data-action="fullscreen" aria-label="Volledig scherm: ${escapeHtml(title)}">${FULL}</button>
            <button class="clip-sound" type="button" data-action="unmute" hidden>Geluid aan</button>
          </div>
          <figcaption>
            ${context.title ? `<strong>${escapeHtml(context.title)}</strong>` : ''}
            ${context.body ? `<p>${escapeHtml(context.body)}</p>` : ''}
          </figcaption>
        </figure>
      </div>
    </div>`
  }
  return `<div class="msg host ${reveal}${leadClass}">
    ${avatar()}
    <div class="stack">
      <span class="who">DIS</span>
      <div class="bubble explainer">
        <span class="explainer-icon" aria-hidden="true">${explainerIcon()}</span>
        <div>
          ${context.title ? `<strong>${escapeHtml(context.title)}</strong>` : ''}
          ${context.body ? `<p>${escapeHtml(context.body)}</p>` : ''}
        </div>
      </div>
    </div>
  </div>`
}

function imageHtml(media: Media): string {
  return `<figure class="inline-photo">
    <img src="${escapeHtml(asset(media.src))}" alt="${escapeHtml(media.alt || '')}" />
    ${media.caption ? `<figcaption>${escapeHtml(media.caption)}</figcaption>` : ''}
  </figure>`
}

function userBubble(question: Question, value: AnswerValue | undefined): string {
  const text = isEmpty(value) ? 'Overgeslagen' : displayAnswer(question, value)
  const editing = editingId === question.id ? ' is-editing' : ''
  const body =
    question.type === 'roles' && !isEmpty(value)
      ? roleChips(question, asList(value))
      : `<span class="bubble-text">${escapeHtml(text)}</span>`
  return `<div class="msg user">
    <button class="bubble user${editing}" type="button" data-action="edit" data-qid="${escapeHtml(question.id)}" aria-label="Wijzig antwoord: ${escapeHtml(text)}">
      ${body}
      <span class="edit-hint">Wijzigen</span>
    </button>
  </div>`
}

function roleChips(question: Question, values: string[]): string {
  const chips = values
    .map((item) => {
      const label = question.options?.find((option) => option.value === item)?.label || item
      return `<span class="role-chip">${escapeHtml(label)}</span>`
    })
    .join('')
  return `<span class="role-chips">${chips}</span>`
}

function composerHtml(question: Question | null): string {
  if (!question) {
    return `<div class="composer">
      <button class="btn btn-yellow" type="button" data-action="finish">Naar het overzicht</button>
    </div>`
  }
  const editing = editingId
    ? `<p class="edit-banner">Je past een eerder antwoord aan. <button type="button" data-action="cancel-edit">Annuleer</button></p>`
    : ''
  const error = errorText ? `<p class="form-error" role="alert">${escapeHtml(errorText)}</p>` : ''
  const skip = question.required
    ? ''
    : `<button class="linkish skip" type="button" data-action="skip" data-qid="${escapeHtml(question.id)}">Sla deze vraag over</button>`
  return `<form class="composer" data-composer>
    ${editing}
    ${error}
    ${controlHtml(question)}
    <div class="composer-footer">${skip}</div>
  </form>`
}

function controlHtml(question: Question): string {
  if (!session) return ''
  const value = session.answers[question.id]
  question = shown(question)
  if (question.type === 'text' || question.type === 'longtext') return textComposer(question)
  if (question.type === 'signals') return signalsComposer(question)
  if (question.type === 'kansen') return kansenComposer(question)
  if (question.type === 'single' || question.type === 'multiple') return chipComposer(question, value)
  if (question.type === 'roles') return rolesComposer(question, value)
  if (question.type === 'scale') return scaleComposer(question, value)
  return rankComposer(question, value)
}

function signalState(question: Question): Record<string, number> {
  const value = session?.answers[question.id]
  return isSignalAnswer(value) ? { ...value.values } : {}
}

function signalsComposer(question: Question): string {
  const signals = signalsForRole(question.signalRole || '')
  if (signalFor !== question.id) {
    signalFor = question.id
    const values = signalState(question)
    const gap = signals.findIndex((signal) => values[signal.id] == null)
    signalIndex = gap < 0 ? 0 : gap
  }
  if (signalIndex >= signals.length) signalIndex = Math.max(0, signals.length - 1)
  const current = signals[signalIndex]
  const values = signalState(question)
  const done = signals.every((signal) => values[signal.id] != null)
  if (!current) return ''
  const chips = intensityScale
    .map((item) => {
      const on = values[current.id] === item.waarde
      return `<button class="signal-choice${on ? ' is-on' : ''}" type="button" data-action="signal-score" data-qid="${escapeHtml(question.id)}" data-signal="${escapeHtml(current.id)}" data-value="${item.waarde}">${escapeHtml(item.label)}</button>`
    })
    .join('')
  return `<div class="signal-card">
    <p class="signal-count">Uitspraak ${signalIndex + 1} van ${signals.length}</p>
    <p class="signal-text">${escapeHtml(current.tekst)}</p>
    <div class="signal-scale">${chips}</div>
    <div class="signal-nav">
      <button class="btn btn-line" type="button" data-action="signal-prev" ${signalIndex === 0 ? 'disabled' : ''}>Vorige</button>
      <button class="btn btn-line" type="button" data-action="signal-next" ${signalIndex >= signals.length - 1 ? 'disabled' : ''}>Volgende</button>
    </div>
  </div>
  <button class="btn btn-primary send-wide" type="submit" data-action="send" ${done ? '' : 'disabled'}>Verder</button>`
}

function kansenComposer(question: Question): string {
  if (!session) return ''
  const result = collectResult(session.answers)
  const stored = kansFieldsFromSession(question.id)
  if (result.ranked.length === 0) {
    return `<p class="kans-empty">Op basis van de uitspraken komt er nog geen kans boven de drempel.</p>
      <textarea class="field" data-kind="kans-note" data-qid="${escapeHtml(question.id)}" rows="3" placeholder="Wat zou het grootste verschil maken?">${escapeHtml(stored.note)}</textarea>
      <button class="btn btn-primary send-wide" type="submit" data-action="send">Verder</button>`
  }
  const cards = result.ranked
    .map((item) => {
      const choice = stored.interest[item.id] || ''
      const buttons = [
        ['graag', 'Graag in de workshop'],
        ['misschien', 'Misschien'],
        ['niet', 'Niet nu'],
      ]
        .map(
          ([value, label]) =>
            `<button class="signal-choice${choice === value ? ' is-on' : ''}" type="button" data-action="kans-interest" data-qid="${escapeHtml(question.id)}" data-uc="${escapeHtml(item.id)}" data-value="${value}">${label}</button>`,
        )
        .join('')
      return `<article class="kans-card">
        <h3>${escapeHtml(item.naam)}</h3>
        <p>${escapeHtml(item.omschrijving)}</p>
        <p class="kans-example">${escapeHtml(item.voorbeeld)}</p>
        <p class="mens">Laatste akkoord ligt altijd bij een mens.</p>
        <div class="signal-scale">${buttons}</div>
      </article>`
    })
    .join('')
  const ready = isValid(question, session.answers[question.id], session.answers)
  return `${cards}
    <label class="kans-note">Wat zou het grootste verschil maken? <span>Optioneel</span>
      <textarea class="field" data-kind="kans-note" data-qid="${escapeHtml(question.id)}" rows="3" placeholder="Bijv. minder zoeken tussen documenten en de bouwplaats">${escapeHtml(stored.note)}</textarea>
    </label>
    <button class="btn btn-primary send-wide" type="submit" data-action="send" ${ready ? '' : 'disabled'}>Verder</button>`
}

function kansFieldsFromSession(id: string): { interest: Record<string, string>; note: string } {
  const value = session?.answers[id]
  if (!isKansAnswer(value)) return { interest: {}, note: '' }
  return { interest: value.interest, note: value.note }
}

function textComposer(question: Question): string {
  const current = textValue(question)
  const max = question.type === 'longtext' ? 4000 : 240
  const auto = question.autocomplete ? ` autocomplete="${escapeHtml(question.autocomplete)}"` : ''
  const field =
    question.type === 'longtext'
      ? `<textarea class="field" data-kind="text" data-qid="${escapeHtml(question.id)}" maxlength="${max}" rows="3" placeholder="${escapeHtml(question.placeholder || '')}"${auto}>${escapeHtml(current)}</textarea>`
      : `<input class="field" type="text" data-kind="text" data-qid="${escapeHtml(question.id)}" maxlength="${max}" value="${escapeHtml(current)}" placeholder="${escapeHtml(question.placeholder || 'Schrijf je antwoord')}"${auto} />`
  return `<div class="composer-row">${field}<button class="send" type="submit" data-action="send" aria-label="Verstuur">${SEND}</button></div>`
}

function chipComposer(question: Question, value: AnswerValue | undefined): string {
  const allowed = question.optionsFrom && session ? new Set(asList(session.answers[question.optionsFrom])) : null
  const options = (question.options || []).filter((option) => !allowed || allowed.has(option.value))
  const selected = question.type === 'multiple' ? asList(value) : typeof value === 'string' ? [value] : []
  const role = question.type === 'single' ? 'radiogroup' : 'group'
  const itemRole = question.type === 'single' ? 'radio' : 'checkbox'
  const action = question.type === 'single' ? 'single' : 'multiple'
  const chips = options
    .map((option) => {
      const on = selected.includes(option.value)
      return `<button class="reply${on ? ' is-on' : ''}" type="button" role="${itemRole}" aria-checked="${on}" data-action="${action}" data-qid="${escapeHtml(question.id)}" data-value="${escapeHtml(option.value)}">
        <span>${escapeHtml(option.label)}</span>
        ${option.hint ? `<small>${escapeHtml(option.hint)}</small>` : ''}
      </button>`
    })
    .join('')
  const minimum = question.minSelected ?? (question.required === false ? 0 : 1)
  const ready =
    selected.length >= minimum && (question.maxSelected == null || selected.length <= question.maxSelected)
  const countLabel = question.maxSelected ? `${selected.length} van ${question.maxSelected}` : selected.length ? String(selected.length) : ''
  const send =
    question.type === 'multiple'
      ? `<button class="btn btn-primary send-wide" type="submit" data-action="send" ${ready ? '' : 'disabled'}>Bevestig${countLabel ? ` · ${countLabel}` : ''}</button>`
      : ''
  return `<div class="chips-reply" role="${role}" aria-label="${escapeHtml(question.title)}">${chips}</div>${send}`
}

const CHECK =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function rolesComposer(question: Question, value: AnswerValue | undefined): string {
  const selected = asList(value)
  const count = selected.length
  const ready = count > 0 || question.required === false
  const confirm = `<button class="btn btn-primary send-wide" type="button" data-action="confirm-roles" ${ready ? '' : 'disabled'}>Bevestig selectie${count ? ` · ${count}` : ''}</button>`
  const cards = (question.options || [])
    .map((option) => {
      const on = selected.includes(option.value)
      const source =
        option.sourceKind === 'bron'
          ? `<span class="role-source is-bron">Bron: ${escapeHtml(option.source || '')}</span>`
          : `<span class="role-source">Schatting</span>`
      const icon = option.icon
        ? `<img src="${escapeHtml(asset(option.icon))}" alt="" width="22" height="22" />`
        : ''
      return `<button class="role-card wash-${option.tint || 'blue'}${on ? ' is-on' : ''}" type="button" role="checkbox" aria-checked="${on}" data-action="role-toggle" data-qid="${escapeHtml(question.id)}" data-value="${escapeHtml(option.value)}">
        <span class="role-check">${CHECK}</span>
        <span class="role-icon">${icon}</span>
        <span class="role-name">${escapeHtml(option.label)}</span>
        <span class="role-figure">${escapeHtml(option.figure || '')}</span>
        <span class="role-hint">${escapeHtml(option.hint || '')}</span>
        ${source}
      </button>`
    })
    .join('')
  const preview = count ? roleChips(question, selected) : '<p class="role-empty">Nog geen rol gekozen</p>'
  const error = errorText ? `<p class="form-error" role="alert">${escapeHtml(errorText)}</p>` : ''
  return `<div class="role-picker">
    <div class="role-launch">
      <button class="btn btn-yellow" type="button" data-action="open-roles">Bekijk de tien rollen</button>
      ${preview}
      ${confirm}
    </div>
    <div class="role-sheet${rolesOpen ? ' is-open' : ''}" ${rolesOpen ? 'role="dialog" aria-modal="true"' : ''} aria-labelledby="role-sheet-title">
      <header class="role-sheet-bar">
        <div>
          <p class="kicker">Rollen en tijdvreters</p>
          <h2 id="role-sheet-title">Waar gaat de tijd naartoe?</h2>
        </div>
        <button class="icon-btn role-close" type="button" data-action="close-roles" aria-label="Sluit de kaarten">×</button>
      </header>
      <div class="role-grid" role="group" aria-label="${escapeHtml(question.title)}">${cards}</div>
      <p class="role-note">Schatting is een indicatieve bandbreedte. Die toetsen we in de workshop.</p>
      ${error}
      <div class="role-sheet-foot">${confirm}</div>
    </div>
  </div>`
}

function scaleComposer(question: Question, value: AnswerValue | undefined): string {
  const min = question.min ?? 1
  const max = question.max ?? 5
  const chosen = typeof value === 'number' ? value : null
  const stops = []
  for (let n = min; n <= max; n += 1) {
    stops.push(
      `<button class="scale-stop" type="button" role="radio" aria-checked="${chosen === n}" data-action="scale" data-qid="${escapeHtml(question.id)}" data-value="${n}">${n}</button>`,
    )
  }
  return `<div class="rich-card">
    <div class="scale-readout" id="scale-readout">${chosen ?? '–'}</div>
    <input class="slider" type="range" data-kind="scale" data-qid="${escapeHtml(question.id)}" min="${min}" max="${max}" step="1" value="${chosen ?? min}" ${chosen == null ? 'data-unset="1"' : ''} aria-label="${escapeHtml(question.title)}" />
    <div class="scale-stops" role="radiogroup" aria-label="${escapeHtml(question.title)}">${stops.join('')}</div>
    <div class="scale-labels"><span>${escapeHtml(question.minLabel || String(min))}</span><span>${escapeHtml(question.maxLabel || String(max))}</span></div>
    <button class="btn btn-primary send-wide" type="submit" data-action="send" ${chosen == null ? 'disabled' : ''}>Verstuur</button>
  </div>`
}

function rankComposer(question: Question, value: AnswerValue | undefined): string {
  const selected = asList(value)
  const options = question.options || []
  const ranked = selected
    .map((item) => options.find((option) => option.value === item))
    .filter((option): option is NonNullable<typeof option> => Boolean(option))
  const rest = options.filter((option) => !selected.includes(option.value))
  const row = (itemValue: string, label: string, index: number | null) => {
    const on = index !== null
    const upDisabled = !on || index === 0
    const downDisabled = !on || index === ranked.length - 1
    return `<div class="rank-row${on ? ' is-on' : ''}">
      <button class="rank-toggle" type="button" data-action="rank-toggle" data-qid="${escapeHtml(question.id)}" data-value="${escapeHtml(itemValue)}" aria-pressed="${on}">
        <span class="rank-num">${on ? index + 1 : ''}</span>
        <span>${escapeHtml(label)}</span>
      </button>
      <div class="rank-arrows">
        <button class="icon-btn" type="button" data-action="rank-up" data-qid="${escapeHtml(question.id)}" data-value="${escapeHtml(itemValue)}" aria-label="Hoger: ${escapeHtml(label)}" ${upDisabled ? 'disabled' : ''}>${UP}</button>
        <button class="icon-btn" type="button" data-action="rank-down" data-qid="${escapeHtml(question.id)}" data-value="${escapeHtml(itemValue)}" aria-label="Lager: ${escapeHtml(label)}" ${downDisabled ? 'disabled' : ''}>${DOWN}</button>
      </div>
    </div>`
  }
  const min = question.minRanked ?? 1
  const ready = selected.length >= min
  return `<div class="rich-card rank-card">
    <p class="rank-label">${ranked.length ? 'Jouw volgorde' : 'Tik om te rangschikken'}</p>
    ${ranked.map((option, index) => row(option.value, option.label, index)).join('')}
    ${rest.length && ranked.length ? '<p class="rank-label">Nog niet gezet</p>' : ''}
    ${rest.map((option) => row(option.value, option.label, null)).join('')}
    <button class="btn btn-primary send-wide" type="submit" data-action="send" ${ready ? '' : 'disabled'}>Verstuur</button>
  </div>`
}

function textValue(question: Question): string {
  if (!session) return ''
  const value = session.answers[question.id]
  if (typeof value === 'string') return value
  if (value == null && question.prefill === 'klant') return session.klant
  return ''
}

function asList(value: AnswerValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function chosenRoleLabels(): string[] {
  if (!session) return []
  return collectResult(session.answers).roles.map((role) => roleLabel(role))
}

function summaryView(): string {
  if (!questionnaire || !session) return ''
  const doc = toExportDoc(questionnaire, session)
  const answered = doc.answers.filter((item) => item.display !== 'Nog niet ingevuld').length
  const blocks = questionnaire.sections
    .map((section, index) => {
      const items = section.questions
        .filter((question) => isQuestionActive(question, session!.answers))
        .map((question) => {
          const view = shown(question)
          return `<div class="qa">
            <div class="qa-top">
              <h3>${escapeHtml(view.title)}</h3>
              <button class="linkish no-print" type="button" data-action="edit" data-qid="${escapeHtml(question.id)}">Wijzig</button>
            </div>
            ${answerHtml(view, session!.answers[question.id])}
          </div>`
        })
        .join('')
      if (!items) return ''
      return `<section class="section-card">
        <h2 class="tint-${section.accent}">Hoofdstuk ${index + 1} · ${escapeHtml(section.title)}</h2>
        ${items}
      </section>`
    })
    .join('')
  const pieces = celebrate && !reduceMotion ? confetti() : ''
  const when = formatSummaryWhen(doc.exportedAt)
  const complete = doc.answers.length > 0 && answered === doc.answers.length
  const progressMark = complete
    ? `<span class="sum-tick">${CHECK}</span>`
    : ring(doc.answers.length === 0 ? 0 : Math.round((answered / doc.answers.length) * 100))
  const roles = chosenRoleLabels()
  const roleChips = roles.length
    ? `<ul class="sum-roles">${roles.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul>`
    : ''
  return `${blobs()}${pieces}<article class="summary">
    <div class="sum-frame">
      <header class="sum-hero">
        <div class="sum-toolbar">
          ${logo('dark')}
          <div class="sum-actions">
            <button class="reset-btn sum-action-extra no-print" type="button" data-action="download">Download JSON</button>
            <button class="reset-btn sum-action-extra no-print" type="button" data-action="print">Afdrukken</button>
            ${resetButton()}
          </div>
        </div>
        <p class="sum-eyebrow">Dit nemen we mee</p>
        <h1 id="screen-title" tabindex="-1">Jullie kansenkaart</h1>
        ${roleChips}
        <p class="sum-meta">
          <span class="sum-progress${complete ? ' is-done' : ''}">${progressMark}<span>${answered} van ${doc.answers.length} vragen</span></span>
          <span>${escapeHtml(when.date)}</span>
          ${when.time ? `<span>${escapeHtml(when.time)}</span>` : ''}
        </p>
      </header>
      <div class="sum-rule" aria-hidden="true"></div>
      ${kaartHtml()}
      <div class="sum-body">
        <p class="note" id="remote-note">${escapeHtml(remoteNote || privacyLine())}</p>
        ${blocks}
        <div class="sum-links no-print">
          <button class="linkish" type="button" data-action="back">Terug naar het gesprek</button>
          <a class="text-link" href="${beheerHref()}">Antwoorden vergelijken</a>
        </div>
      </div>
      <div class="export-bar no-print">
        <button class="btn btn-primary" type="button" data-action="download">Download JSON</button>
        <button class="btn btn-line" type="button" data-action="print">Afdrukken / PDF</button>
        <button class="btn btn-line" type="button" data-action="copy">Kopieer tekst</button>
        <button class="btn btn-line" type="button" data-action="mail">Mail de samenvatting</button>
      </div>
    </div>
  </article>`
}

function confetti(): string {
  const bits = Array.from({ length: 18 }, (_, index) => `<i style="--i:${index}"></i>`).join('')
  return `<div class="confetti" aria-hidden="true">${bits}</div>`
}

function adminView(): string {
  const localBtn =
    session && questionnaire && hasProgress(session)
      ? `<button class="btn btn-line" type="button" data-action="download">Exporteer de sessie op dit apparaat</button>`
      : ''
  const cards = imports
    .map((item, index) => {
      const on = picked.has(index)
      const who = item.doc.klant || 'Zonder klantnaam'
      return `<article class="file-card${on ? ' is-picked' : ''}">
        <label>
          <input type="checkbox" data-action="pick" data-index="${index}" ${on ? 'checked' : ''} />
          <span>
            <strong>${escapeHtml(who)}</strong>
            <span>${escapeHtml(item.name)} · ${escapeHtml(formatWhen(item.doc.exportedAt))} · ${item.doc.answers.length} antwoorden</span>
          </span>
        </label>
        <button class="linkish" type="button" data-action="drop-file" data-index="${index}">Weg</button>
      </article>`
    })
    .join('')
  return `<main class="admin">
    <header class="admin-bar">
      <a class="logo-btn" href="${homeHref()}" aria-label="Terug naar de vragenlijst">${logo('dark')}</a>
      <a class="text-link" href="${homeHref()}">Terug</a>
    </header>
    <div class="admin-main">
      <p class="kicker">Voor consultants</p>
      <h1 id="screen-title" tabindex="-1">Antwoorden naast elkaar</h1>
      <p class="help">Sleep geëxporteerde JSON-bestanden hierheen. Vink er twee aan om ze te vergelijken. Niets wordt geüpload.</p>
      <div class="drop" data-drop>
        <p><strong>Zet de bestanden hier neer</strong></p>
        <p>of kies een bestand op dit apparaat.</p>
        <p><label class="btn btn-primary" style="display:inline-flex">Kies JSON<input class="sr-only" type="file" accept="application/json,.json" multiple data-action="file-input" /></label></p>
      </div>
      ${adminError ? `<p class="form-error" role="alert">${escapeHtml(adminError)}</p>` : ''}
      <div class="file-list">${cards}</div>
      <div class="actions" style="margin-top:16px">${localBtn}</div>
      ${compareTable()}
    </div>
  </main>`
}

function compareTable(): string {
  const chosen = [...picked].map((index) => imports[index]).filter(Boolean)
  if (chosen.length === 0) return ''
  if (chosen.length === 1) {
    const doc = chosen[0].doc
    const rows = doc.answers
      .map(
        (answer) =>
          `<tr><td>${escapeHtml(answer.section)}</td><td>${escapeHtml(answer.question)}</td><td>${escapeHtml(answer.display)}</td></tr>`,
      )
      .join('')
    return `<div class="table-wrap"><table>
      <thead><tr><th>Onderdeel</th><th>Vraag</th><th>${escapeHtml(doc.klant || 'Antwoord')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`
  }
  const [left, right] = chosen
  const ids = [...new Set([...left.doc.answers.map((item) => item.id), ...right.doc.answers.map((item) => item.id)])]
  const rows = ids
    .map((id) => {
      const a = left.doc.answers.find((item) => item.id === id)
      const b = right.doc.answers.find((item) => item.id === id)
      const diff = (a?.display || '') !== (b?.display || '')
      return `<tr class="${diff ? 'diff' : ''}"><td>${escapeHtml(a?.question || b?.question || id)}</td><td>${escapeHtml(a?.display || '—')}</td><td>${escapeHtml(b?.display || '—')}</td></tr>`
    })
    .join('')
  return `<div class="table-wrap"><table>
    <thead><tr><th>Vraag</th><th>${escapeHtml(left.doc.klant || left.name)}</th><th>${escapeHtml(right.doc.klant || right.name)}</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`
}

function sectionIcon(id: string): string {
  const svg = (path: string) =>
    `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
  if (id === 'verloop') return svg('<path d="M4 7h16M4 12h10M4 17h13"/><path d="M15 10l3 2-3 2"/>')
  if (id === 'pijn') return svg('<path d="M12 4 3 19h18L12 4Z"/><path d="M12 10v4M12 16.5v.5"/>')
  if (id === 'rollen') return svg('<circle cx="9" cy="9" r="3"/><circle cx="16" cy="10" r="2.2"/><path d="M3.5 19c.8-2.6 2.8-4 5.5-4s4.7 1.4 5.5 4M14 15c1.6 0 3 .7 3.8 2.2"/>')
  if (id === 'doelen') return svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/>')
  if (id === 'wie') return svg('<circle cx="9" cy="9" r="3"/><circle cx="16" cy="10" r="2.2"/><path d="M3.5 19c.8-2.6 2.8-4 5.5-4s4.7 1.4 5.5 4M14 15c1.6 0 3 .7 3.8 2.2"/>')
  if (id === 'ai') return svg('<path d="M12 3l1.4 4.2L18 8.5l-3.4 2.6L16 16l-4-2.4L8 16l1.4-4.9L6 8.5l4.6-1.3L12 3Z"/>')
  return svg('<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-6h6v6"/>')
}

function explainerIcon(): string {
  return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>'
}

function syncText(): void {
  if (!session) return
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-kind="text"]').forEach((field) => {
    const id = field.dataset.qid
    if (!id) return
    session!.answers[id] = field.value
  })
  document.querySelectorAll<HTMLTextAreaElement>('[data-kind="kans-note"]').forEach((field) => {
    const id = field.dataset.qid
    if (!id) return
    const current = session!.answers[id]
    const interest = isKansAnswer(current) ? current.interest : {}
    session!.answers[id] = { kind: 'kansen', interest, note: field.value }
  })
}

function kaartHtml(): string {
  if (!session) return ''
  const result = collectResult(session.answers)
  const scores: Record<string, number> = {}
  for (const item of result.ranked) scores[item.id] = item.score
  const points = kaartPunten(
    result.intensities,
    result.ranked.map((item) => item.id),
    result.interest,
    scores,
  )
  const dots = points
    .map((point) => {
      const left = ((point.x - 1) / 4) * 100
      const bottom = ((point.y - 1) / 4) * 100
      const cls = `kaart-dot${point.relevant ? '' : ' is-dim'}${point.top ? ' is-top' : ''}${kaartId === point.id ? ' is-on' : ''}`
      return `<button class="${cls}" type="button" data-action="kaart" data-id="${escapeHtml(point.id)}" style="left:${left.toFixed(2)}%;bottom:${bottom.toFixed(2)}%;--size:${point.size}px;--kleur:${point.kleur}" aria-label="${escapeHtml(point.naam)}"><i></i></button>`
    })
    .join('')
  const selected = points.find((point) => point.id === kaartId)
  const detail = selected
    ? `<div class="kaart-detail"><strong>${escapeHtml(selected.naam)}</strong><p>${escapeHtml(selected.kwadrantNaam)} · impact ${escapeHtml(selected.impact)} · haalbaarheid ${escapeHtml(selected.haalbaarheid)}</p></div>`
    : `<p class="kaart-hint">Tik een stip voor de naam.</p>`
  const list = result.ranked
    .map(
      (item) => `<li>
        <strong>${escapeHtml(item.naam)}</strong>
        <span>${escapeHtml(item.id)} · score ${item.score.toFixed(1).replace('.', ',')} · ${escapeHtml(interestText(result.interest[item.id] || ''))}</span>
        <p>${escapeHtml(item.voorbeeld)}</p>
        <p class="mens">Laatste akkoord ligt altijd bij een mens.</p>
      </li>`,
    )
    .join('')
  return `<section class="kaart-wrap">
    <div class="kaart">
      <span class="kaart-q q-tl">Strategisch</span>
      <span class="kaart-q q-tr">Quick wins</span>
      <span class="kaart-q q-bl">Niet doen</span>
      <span class="kaart-q q-br">Later</span>
      <span class="kaart-threshold x" aria-hidden="true"></span>
      <span class="kaart-threshold y" aria-hidden="true"></span>
      ${dots}
    </div>
    <p class="kaart-axes"><span>Haalbaarheid</span><span>Impact</span></p>
    ${detail}
    ${list ? `<ol class="kaart-list">${list}</ol>` : '<p class="muted kaart-none">Er kwam geen kans boven de drempel.</p>'}
  </section>`
}

function interestText(value: string): string {
  if (value === 'graag') return 'graag in de workshop'
  if (value === 'misschien') return 'misschien'
  if (value === 'niet') return 'niet nu'
  return 'geen keuze'
}

function flashSaved(): void {
  const el = document.getElementById('saved')
  if (!el) return
  el.hidden = false
  window.clearTimeout(savedTimer)
  savedTimer = window.setTimeout(() => {
    el.hidden = true
  }, 1400)
}

function goStart(): void {
  if (!session) return
  errorText = ''
  editingId = ''
  rolesOpen = false
  atWelcome = false
  session.phase = 'flow'
  const index = steps.findIndex((step) => step.kind === 'question')
  session.stepIndex = index < 0 ? 0 : index
  const question = currentQuestion()
  freshId = question?.id || ''
  persist()
  render()
}

function goResume(): void {
  if (!session) return
  errorText = ''
  atWelcome = false
  if (session.phase === 'welcome') {
    session.phase = 'flow'
    const index = steps.findIndex((step) => step.kind === 'question')
    session.stepIndex = index < 0 ? 0 : index
  }
  normalizeStep()
  const question = currentQuestion()
  freshId = session.phase === 'flow' && question ? question.id : ''
  persist()
  render()
}

function finish(): void {
  if (!session) return
  syncText()
  session.phase = 'summary'
  celebrate = true
  editingId = ''
  rolesOpen = false
  freshId = ''
  persist()
  render()
  void maybePush()
}

function advance(): void {
  if (!session) return
  syncSteps()
  let index = session.stepIndex + 1
  while (index < steps.length && steps[index]?.kind !== 'question') index += 1
  if (index >= steps.length) {
    finish()
    return
  }
  session.phase = 'flow'
  session.stepIndex = index
  const question = currentQuestion()
  freshId = question?.id || ''
  editingId = ''
  rolesOpen = false
  errorText = ''
  persist()
  render()
}

function commitComposer(): void {
  if (!session) return
  const question = composerQuestion()
  syncText()
  if (!question) {
    finish()
    return
  }
  const value = session.answers[question.id]
  if (!isValid(question, value, session.answers)) {
    errorText = validationMessage(question)
    freshId = ''
    render()
    return
  }
  errorText = ''
  if (editingId) {
    editingId = ''
    freshId = ''
    persist()
    render()
    return
  }
  advance()
}

function goBack(): void {
  if (!session) return
  syncText()
  errorText = ''
  atWelcome = false
  session.phase = 'flow'
  normalizeStep()
  if (steps[session.stepIndex]?.kind !== 'question') {
    const last = [...steps].reverse().findIndex((step) => step.kind === 'question')
    session.stepIndex = last < 0 ? 0 : steps.length - 1 - last
  }
  editingId = ''
  persist()
  render()
}

function goHome(): void {
  if (!session) return
  syncText()
  errorText = ''
  editingId = ''
  rolesOpen = false
  atWelcome = true
  persist()
  render()
}

function editQuestion(id: string): void {
  if (!session || !questionnaire) return
  const index = findStepIndex(steps, id, questionnaire)
  if (index < 0) return
  atWelcome = false
  if (session.phase === 'summary' || session.stepIndex < index) session.stepIndex = index
  session.phase = 'flow'
  editingId = id
  rolesOpen = questionById(id)?.type === 'roles'
  errorText = ''
  freshId = ''
  persist()
  render()
  window.setTimeout(() => {
    document.querySelector('.composer')?.scrollIntoView({ block: 'nearest' })
  }, 30)
}

async function maybePush(): Promise<void> {
  if (!session || !questionnaire || session.remotePushedAt || !remoteStoreUrl()) return
  const result = await pushRemote(toExportDoc(questionnaire, session))
  if (result === 'ok') {
    session.remotePushedAt = new Date().toISOString()
    persist()
    remoteNote = 'Ook doorgestuurd naar de ingestelde opslag.'
  } else if (result === 'error') {
    remoteNote = 'Lokaal opgeslagen. Doorsturen naar de externe opslag lukte niet. Exporteer de JSON om niets kwijt te raken.'
  }
  const note = document.getElementById('remote-note')
  if (note && remoteNote) note.textContent = remoteNote
}

function download(): void {
  if (!session || !questionnaire) return
  syncText()
  const doc = toExportDoc(questionnaire, session)
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const day = new Date().toISOString().slice(0, 10)
  link.href = url
  link.download = `dis-workshop-${fileSlug(doc.klant || 'klant')}-${day}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function copySummary(): Promise<void> {
  if (!session || !questionnaire) return
  syncText()
  const text = toPlainText(toExportDoc(questionnaire, session))
  const button = document.querySelector<HTMLButtonElement>('[data-action="copy"]')
  try {
    await navigator.clipboard.writeText(text)
    if (button) button.textContent = 'Gekopieerd'
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
    if (button) button.textContent = 'Gekopieerd'
  }
  window.setTimeout(() => {
    if (button) button.textContent = 'Kopieer tekst'
  }, 1800)
}

function mailTo(address: string): void {
  if (!session || !questionnaire) return
  const email = address.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    openModal('email')
    const input = document.getElementById('mail-to')
    const error = document.getElementById('mail-error')
    if (error) {
      error.hidden = false
      error.textContent = 'Vul een geldig e-mailadres in.'
    }
    if (input instanceof HTMLInputElement) input.focus()
    return
  }
  const doc = toExportDoc(questionnaire, session)
  let body = toPlainText(doc)
  if (body.length > 1400) {
    body =
      body.slice(0, 1100) +
      '\n…\n\nDit is een verkorte versie. Download de JSON en voeg die toe aan de mail voor het volledige overzicht.'
  }
  const href = `mailto:${email}?subject=${encodeURIComponent(`Workshopvoorbereiding ${doc.klant}`.trim())}&body=${encodeURIComponent(body)}`
  closeModal()
  location.href = href
}

function openModal(kind: 'reset' | 'email'): void {
  modal = kind
  paintModal()
}

function closeModal(): void {
  modal = null
  document.getElementById('modal-root')?.remove()
}

function paintModal(): void {
  document.getElementById('modal-root')?.remove()
  if (!modal) return
  const root = document.createElement('div')
  root.id = 'modal-root'
  root.innerHTML = modalHtml()
  document.body.appendChild(root)
  const field = document.getElementById('mail-to')
  if (field instanceof HTMLInputElement) field.focus()
}

function modalHtml(): string {
  if (modal === 'reset') {
    return `<div class="modal-back">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">Opnieuw beginnen?</h2>
        <p>Weet je het zeker? Je antwoorden worden gewist.</p>
        <div class="actions">
          <button class="btn btn-ghost-dark" type="button" data-action="close-modal">Annuleren</button>
          <button class="btn btn-primary" type="button" data-action="confirm-reset">Wis en begin opnieuw</button>
        </div>
      </div>
    </div>`
  }
  if (modal === 'email') {
    const preset = naarParam || questionnaire?.consultantEmail || ''
    return `<div class="modal-back">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">Naar welk adres mailen we?</h2>
        <p>Je mailprogramma opent met een samenvatting. Voeg de JSON toe als de tekst wordt afgekapt.</p>
        <input class="field" id="mail-to" type="email" inputmode="email" placeholder="workshop@bedrijf.nl" value="${escapeHtml(preset)}" />
        <p class="form-error" id="mail-error" hidden></p>
        <div class="actions">
          <button class="btn btn-ghost-dark" type="button" data-action="close-modal">Annuleren</button>
          <button class="btn btn-primary" type="button" data-action="send-mail">Open de mail</button>
        </div>
      </div>
    </div>`
  }
  return ''
}

function resetSession(): void {
  closeModal()
  reloadWelcome()
}

function setSignalScore(id: string, signalId: string, score: number): void {
  if (!session || Number.isNaN(score)) return
  const question = questionById(id)
  if (!question) return
  const signals = signalsForRole(question.signalRole || '')
  const values = { ...signalState(question), [signalId]: score }
  const index = signals.findIndex((signal) => signal.id === signalId)
  const nextGap = signals.findIndex((signal, itemIndex) => itemIndex > index && values[signal.id] == null)
  signalFor = id
  signalIndex = nextGap >= 0 ? nextGap : Math.min(signals.length - 1, Math.max(0, index + 1))
  setAnswer(id, { kind: 'signals', values })
}

function nudgeSignal(delta: number): void {
  const question = composerQuestion()
  if (!question || question.type !== 'signals') return
  const signals = signalsForRole(question.signalRole || '')
  if (!signals.length) return
  signalFor = question.id
  signalIndex = Math.max(0, Math.min(signals.length - 1, signalIndex + delta))
  freshId = ''
  render()
}

function setKansInterest(id: string, useCaseId: string, choice: string): void {
  if (!session) return
  const field = document.querySelector<HTMLTextAreaElement>('[data-kind="kans-note"]')
  const current = kansFieldsFromSession(id)
  setAnswer(id, {
    kind: 'kansen',
    interest: { ...current.interest, [useCaseId]: choice },
    note: field?.value ?? current.note,
  })
}

function selectKaart(id: string): void {
  kaartId = kaartId === id ? '' : id
  freshId = ''
  render()
}

function setAnswer(id: string, value: AnswerValue): void {
  if (!session) return
  session.answers[id] = value
  errorText = ''
  syncSteps()
  persist()
  freshId = ''
  render()
  flashSaved()
}

function toggleList(id: string, value: string): void {
  if (!session) return
  const question = questionById(id)
  const current = asList(session.answers[id])
  const index = current.indexOf(value)
  if (index >= 0) current.splice(index, 1)
  else {
    if (question?.maxSelected && current.length >= question.maxSelected) {
      errorText = validationMessage(question)
      freshId = ''
      render()
      return
    }
    current.push(value)
  }
  setAnswer(id, current)
}

function moveRank(id: string, value: string, direction: -1 | 1): void {
  if (!session) return
  const current = asList(session.answers[id])
  const index = current.indexOf(value)
  const next = index + direction
  if (index < 0 || next < 0 || next >= current.length) return
  const [item] = current.splice(index, 1)
  current.splice(next, 0, item)
  setAnswer(id, current)
}

function chooseSingle(id: string, value: string): void {
  if (!session) return
  session.answers[id] = value
  errorText = ''
  persist()
  flashSaved()
  if (editingId === id) {
    editingId = ''
    freshId = ''
    render()
    return
  }
  const question = currentQuestion()
  if (question?.id === id) {
    advance()
    return
  }
  freshId = ''
  render()
}

function chooseScale(id: string, value: number, sendNow: boolean): void {
  if (!session) return
  session.answers[id] = value
  errorText = ''
  persist()
  flashSaved()
  if (sendNow && editingId === id) {
    editingId = ''
    freshId = ''
    render()
    return
  }
  if (sendNow && currentQuestion()?.id === id && !editingId) {
    advance()
    return
  }
  freshId = ''
  render()
}

function playClip(button: HTMLElement): void {
  const frame = button.closest('[data-clip]')
  const video = frame?.querySelector('video')
  if (!(video instanceof HTMLVideoElement)) return
  video.muted = true
  void video.play()
  showCaptions(video)
  button.hidden = true
  const sound = frame?.querySelector<HTMLElement>('[data-action="unmute"]')
  if (sound) sound.hidden = false
}

function fullscreenClip(button: HTMLElement): void {
  const frame = button.closest('[data-clip], [data-intro]')
  const video = frame?.querySelector('video')
  if (!(video instanceof HTMLVideoElement) || !(frame instanceof HTMLElement)) return
  const alt = video.dataset.fullscreenSrc
  const narrow = window.matchMedia('(max-width: 799px)').matches
  if (alt && narrow && video.dataset.swapped !== '1') {
    video.dataset.swapped = '1'
    video.src = alt
    const restore = () => {
      if (document.fullscreenElement) return
      video.removeAttribute('src')
      delete video.dataset.swapped
      video.load()
      document.removeEventListener('fullscreenchange', restore)
      video.removeEventListener('webkitendfullscreen', restore)
    }
    document.addEventListener('fullscreenchange', restore)
    video.addEventListener('webkitendfullscreen', restore)
  }
  const play = frame.querySelector<HTMLElement>('[data-action="play-clip"]')
  if (play) play.hidden = true
  if (frame.hasAttribute('data-clip')) video.muted = true
  void video.play()
  showCaptions(video)
  const extended = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
  if (typeof extended.webkitEnterFullscreen === 'function' && /iP(hone|ad|od)/.test(navigator.userAgent)) {
    extended.webkitEnterFullscreen()
    return
  }
  const target = frame.hasAttribute('data-clip') ? frame : video
  if (target.requestFullscreen) void target.requestFullscreen()
  else if (typeof extended.webkitEnterFullscreen === 'function') extended.webkitEnterFullscreen()
}

function unmuteClip(button: HTMLElement): void {
  const video = button.closest('[data-clip]')?.querySelector('video')
  if (!(video instanceof HTMLVideoElement)) return
  video.muted = false
  video.volume = 1
  button.hidden = true
}

function showCaptions(video: HTMLVideoElement): void {
  for (const track of video.textTracks) track.mode = 'showing'
}

function applyPortraitPosters(): void {
  if (!window.matchMedia('(max-width: 799px)').matches) return
  document.querySelectorAll<HTMLVideoElement>('video[data-poster-portrait]').forEach((video) => {
    if (video.dataset.posterPortrait) video.poster = video.dataset.posterPortrait
  })
}

function captureMedia(): { src: string; time: number; paused: boolean; muted: boolean }[] {
  return [...document.querySelectorAll('video')].map((video) => ({
    src: video.querySelector('source')?.getAttribute('src') || video.currentSrc,
    time: video.currentTime,
    paused: video.paused,
    muted: video.muted,
  }))
}

function restoreMedia(saved: { src: string; time: number; paused: boolean; muted: boolean }[]): void {
  if (saved.length === 0) return
  document.querySelectorAll('video').forEach((video) => {
    const src = video.querySelector('source:not([media])')?.getAttribute('src') || video.currentSrc
    const item = saved.find((entry) => entry.src && src && (entry.src === src || src.endsWith(entry.src) || entry.src.endsWith(src)))
    if (!item || item.time < 0.05) return
    const resume = () => {
      if (Math.abs(video.currentTime - item.time) > 0.4) {
        try {
          video.currentTime = item.time
        } catch {
          /* metadata nog niet binnen */
        }
      }
      video.muted = item.muted
      if (!item.paused) {
        void video.play()
        const play = video.parentElement?.querySelector<HTMLElement>('[data-action="play-clip"]')
        const sound = video.parentElement?.querySelector<HTMLElement>('[data-action="unmute"]')
        if (play) play.hidden = true
        if (sound) sound.hidden = !item.muted
      }
    }
    if (video.readyState >= 1) resume()
    else video.addEventListener('loadedmetadata', resume, { once: true })
  })
}

async function ingestFiles(files: FileList | File[]): Promise<void> {
  adminError = ''
  const list = [...files]
  for (const file of list) {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isExportDoc(parsed)) {
        adminError = `${file.name} is geen DIS-export. Download de JSON vanuit het overzicht.`
        continue
      }
      imports.push({ name: file.name, doc: parsed })
    } catch {
      adminError = `${file.name} kon niet worden gelezen.`
    }
  }
  render()
}

document.addEventListener('click', (event) => {
  const target = event.target
  if (!(target instanceof Element)) return
  if (target.classList.contains('modal-back')) {
    closeModal()
    return
  }
  if (target instanceof HTMLVideoElement && target.closest('[data-clip]')) {
    target.muted = !target.muted
    const sound = target.parentElement?.querySelector<HTMLElement>('[data-action="unmute"]')
    if (sound) sound.hidden = !target.muted
    return
  }
  const el = target.closest<HTMLElement>('[data-action]')
  if (!el) return
  const action = el.dataset.action
  if (action === 'start') goStart()
  else if (action === 'resume') goResume()
  else if (action === 'finish') finish()
  else if (action === 'send') {
    event.preventDefault()
    commitComposer()
  }
  else if (action === 'back') goBack()
  else if (action === 'home') goHome()
  else if (action === 'ask-reset') openModal('reset')
  else if (action === 'confirm-reset') resetSession()
  else if (action === 'close-modal') closeModal()
  else if (action === 'cancel-edit') {
    editingId = ''
    errorText = ''
    render()
  } else if (action === 'edit' && el.dataset.qid) editQuestion(el.dataset.qid)
  else if (action === 'single' && el.dataset.qid && el.dataset.value) chooseSingle(el.dataset.qid, el.dataset.value)
  else if (action === 'multiple' && el.dataset.qid && el.dataset.value) toggleList(el.dataset.qid, el.dataset.value)
  else if (action === 'role-toggle' && el.dataset.qid && el.dataset.value) toggleList(el.dataset.qid, el.dataset.value)
  else if (action === 'open-roles') {
    rolesOpen = true
    render()
  } else if (action === 'close-roles') {
    rolesOpen = false
    render()
  } else if (action === 'confirm-roles') {
    const question = composerQuestion()
    const value = session?.answers[question?.id || '']
    if (question && !isValid(question, value, session?.answers || {})) rolesOpen = true
    else rolesOpen = false
    commitComposer()
  }
  else if (action === 'scale' && el.dataset.qid) chooseScale(el.dataset.qid, Number(el.dataset.value), false)
  else if (action === 'rank-toggle' && el.dataset.qid && el.dataset.value) toggleList(el.dataset.qid, el.dataset.value)
  else if (action === 'rank-up' && el.dataset.qid && el.dataset.value) moveRank(el.dataset.qid, el.dataset.value, -1)
  else if (action === 'rank-down' && el.dataset.qid && el.dataset.value) moveRank(el.dataset.qid, el.dataset.value, 1)
  else if (action === 'signal-score' && el.dataset.qid && el.dataset.signal) {
    setSignalScore(el.dataset.qid, el.dataset.signal, Number(el.dataset.value))
  } else if (action === 'signal-prev') nudgeSignal(-1)
  else if (action === 'signal-next') nudgeSignal(1)
  else if (action === 'kans-interest' && el.dataset.qid && el.dataset.uc && el.dataset.value) {
    setKansInterest(el.dataset.qid, el.dataset.uc, el.dataset.value)
  } else if (action === 'kaart' && el.dataset.id) selectKaart(el.dataset.id)
  else if (action === 'skip' && el.dataset.qid) {
    if (session) session.answers[el.dataset.qid] = null
    errorText = ''
    if (editingId === el.dataset.qid) {
      editingId = ''
      persist()
      render()
    } else advance()
  }   else if (action === 'play-clip') playClip(el)
  else if (action === 'unmute') unmuteClip(el)
  else if (action === 'fullscreen') fullscreenClip(el)
  else if (action === 'download') download()
  else if (action === 'print') window.print()
  else if (action === 'copy') void copySummary()
  else if (action === 'mail') {
    const preset = naarParam || questionnaire?.consultantEmail || ''
    if (preset) mailTo(preset)
    else openModal('email')
  } else if (action === 'send-mail') {
    const input = document.getElementById('mail-to')
    if (input instanceof HTMLInputElement) mailTo(input.value)
  } else if (action === 'pick') {
    const index = Number(el.dataset.index)
    if (picked.has(index)) picked.delete(index)
    else if (picked.size < 2) picked.add(index)
    else adminError = 'Vink eerst een bestand uit. Je vergelijkt er twee tegelijk.'
    render()
  } else if (action === 'drop-file') {
    const index = Number(el.dataset.index)
    imports = imports.filter((_, itemIndex) => itemIndex !== index)
    picked = new Set([...picked].filter((item) => item !== index).map((item) => (item > index ? item - 1 : item)))
    render()
  }
})

document.addEventListener('submit', (event) => {
  const form = event.target
  if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-composer')) return
  event.preventDefault()
  commitComposer()
})

document.addEventListener('input', (event) => {
  const field = event.target
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) || !session) return
  if (field.dataset.kind === 'text' && field.dataset.qid) {
    session.answers[field.dataset.qid] = field.value
    persist()
    flashSaved()
    return
  }
  if (field.dataset.kind === 'scale' && field.dataset.qid && field instanceof HTMLInputElement) {
    const value = Number(field.value)
    field.dataset.unset = ''
    session.answers[field.dataset.qid] = value
    persist()
    const readout = document.getElementById('scale-readout')
    if (readout) readout.textContent = String(value)
    document.querySelectorAll<HTMLButtonElement>('.scale-stop').forEach((button) => {
      button.setAttribute('aria-checked', button.dataset.value === String(value) ? 'true' : 'false')
    })
    const send = document.querySelector<HTMLButtonElement>('.composer [data-action="send"]')
    if (send) send.disabled = false
    flashSaved()
  }
})

document.addEventListener('change', (event) => {
  const field = event.target
  if (!(field instanceof HTMLInputElement) || field.dataset.action !== 'file-input' || !field.files) return
  void ingestFiles(field.files)
  field.value = ''
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && rolesOpen) {
    rolesOpen = false
    render()
    return
  }
  if (event.key === 'Escape' && modal) {
    closeModal()
    return
  }
  if (event.key === 'Enter' && modal === 'email' && event.target instanceof HTMLInputElement) {
    event.preventDefault()
    mailTo(event.target.value)
    return
  }
})

document.addEventListener('dragover', (event) => {
  const zone = event.target instanceof Element ? event.target.closest('[data-drop]') : null
  if (!zone) return
  event.preventDefault()
  zone.classList.add('is-over')
})
document.addEventListener('dragleave', (event) => {
  const zone = event.target instanceof Element ? event.target.closest('[data-drop]') : null
  zone?.classList.remove('is-over')
})
document.addEventListener('drop', (event) => {
  const zone = event.target instanceof Element ? event.target.closest('[data-drop]') : null
  if (!zone) return
  event.preventDefault()
  zone.classList.remove('is-over')
  if (event.dataTransfer?.files?.length) void ingestFiles(event.dataTransfer.files)
})

window.addEventListener('pagehide', () => {
  if (suppressSave || !session) return
  syncText()
  stampSession()
  saveSession(session)
})

if (!resetOnLoad) render()
