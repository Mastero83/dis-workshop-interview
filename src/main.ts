import './style.css'
import { buildSteps, findQuestionnaire, findStepIndex, loadCatalog, questionAt, questionCount } from './catalog'
import {
  answerHtml,
  asset,
  escapeHtml,
  fileSlug,
  formatWhen,
  isExportDoc,
  isValid,
  toExportDoc,
  toPlainText,
  validationMessage,
} from './format'
import { pushRemote, remoteStoreUrl } from './remote'
import { clearSession, createSession, hasProgress, loadSession, saveSession } from './session'
import type { Accent, AnswerValue, ExportDoc, Media, Question, Questionnaire, Session, Step } from './types'

const TINTS: Accent[] = ['blue', 'green', 'orange', 'yellow']
const CHECK =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const UP =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const DOWN =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 10l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'

const params = new URLSearchParams(location.search)
const klantParam = (params.get('klant') || '').trim()
const vragenlijstParam = params.get('vragenlijst')
const naarParam = (params.get('naar') || '').trim()

let questionnaire: Questionnaire | null = null
let session: Session | null = null
let steps: Step[] = []
let totalQuestions = 0
let catalogError = ''

try {
  const catalog = loadCatalog()
  questionnaire = findQuestionnaire(catalog, vragenlijstParam)
  if (!questionnaire) catalogError = 'We kennen deze vragenlijst niet. Controleer de link, of open de standaardlijst.'
} catch (error) {
  catalogError = error instanceof Error ? error.message : 'De vragenlijst kon niet worden geladen.'
}

if (questionnaire) {
  session = loadSession(questionnaire.id, klantParam)
  steps = buildSteps(questionnaire)
  totalQuestions = questionCount(questionnaire)
  if (session.stepIndex < 0 || session.stepIndex >= steps.length) {
    session.stepIndex = 0
    session.phase = 'welcome'
  }
}

let atWelcome = !session || session.phase === 'welcome'
let beheer = params.get('beheer') === '1'
let anim: 'next' | 'prev' | 'none' = 'none'
let errorText = ''
let modal: 'reset' | 'email' | null = null
let memoryOnly = false
let remoteNote = ''
let imports: { name: string; doc: ExportDoc }[] = []
let picked = new Set<number>()
let adminError = ''
let savedTimer = 0

const app = document.getElementById('app')!

function persist(): void {
  if (!session) return
  memoryOnly = !saveSession(session)
}

function render(): void {
  const previous = document.querySelector('.stage')
  const keepScroll = anim === 'none' && previous instanceof HTMLElement ? previous.scrollTop : 0
  app.innerHTML = view()
  const live = document.getElementById('live')
  if (live) live.textContent = announcement()
  if (anim !== 'none') {
    window.scrollTo(0, 0)
    const title = document.getElementById('screen-title')
    if (title instanceof HTMLElement) title.focus()
  } else if (keepScroll) {
    const stage = document.querySelector('.stage')
    if (stage instanceof HTMLElement) stage.scrollTop = keepScroll
  }
  anim = 'none'
}

function announcement(): string {
  if (catalogError || !questionnaire || !session) return catalogError || 'Vragenlijst niet beschikbaar.'
  if (beheer) return 'Beheer. Vergelijk geëxporteerde antwoorden.'
  if (atWelcome || session.phase === 'welcome') {
    return `${questionnaire.title}. ${klantParam ? `Voor ${klantParam}. ` : ''}Start de vragen wanneer je wilt.`
  }
  if (session.phase === 'summary') return 'Overzicht van je antwoorden.'
  const step = steps[session.stepIndex]
  if (!step) return ''
  if (step.kind === 'section') {
    const section = questionnaire.sections[step.sectionIndex]
    return `Onderdeel ${step.sectionIndex + 1} van ${questionnaire.sections.length}. ${section.title}`
  }
  const question = questionAt(questionnaire, step.sectionIndex, step.questionIndex)
  return `Vraag ${step.number} van ${totalQuestions}. ${question.title}`
}

function view(): string {
  if (catalogError || !questionnaire || !session) return missingView()
  if (beheer) return adminView()
  if (atWelcome || session.phase === 'welcome') return welcomeView()
  if (session.phase === 'summary') return summaryView()
  return flowView()
}

function photoVars(image?: string, position?: string): string {
  if (!image) return ''
  const url = asset(image).replace(/'/g, '')
  const pos = (position || 'center').replace(/'/g, '')
  return `--photo: url('${url}'); --photo-pos: ${pos}`
}

function logo(variant: 'light' | 'dark', className = ''): string {
  const file = variant === 'light' ? 'logos/DIS-Group-logo-wit.png' : 'logos/DIS-Group-logo-donker.png'
  const alt = 'DIS Group'
  return `<img class="logo ${className}" src="${asset(file)}" alt="${alt}" />`
}

function mediaBlock(media: Media | null | undefined, tone: 'light' | 'dark'): string {
  if (!media) return ''
  const caption = media.caption ? `<figcaption class="caption">${escapeHtml(media.caption)}</figcaption>` : ''
  if (media.type === 'video') {
    const poster = media.poster ? ` poster="${escapeHtml(asset(media.poster))}"` : ''
    return `<figure class="${tone === 'light' ? 'video-card' : 'q-media'}">
      <video controls playsinline preload="metadata"${poster}>
        <source src="${escapeHtml(asset(media.src))}" type="video/mp4" />
        Je browser kan deze video niet afspelen.
      </video>
      ${caption}
    </figure>`
  }
  return `<figure class="q-media">
    <img src="${escapeHtml(asset(media.src))}" alt="${escapeHtml(media.alt || media.caption || '')}" />
    ${caption}
  </figure>`
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

function missingView(): string {
  const url = new URL(location.href)
  url.searchParams.delete('vragenlijst')
  return `<main class="shell">
    <header class="topbar">${logo('dark')}</header>
    <div class="stage"><div class="sheet">
      <h1 id="screen-title" tabindex="-1">Deze lijst bestaat niet</h1>
      <p class="help">${escapeHtml(catalogError)}</p>
      <p class="actions"><a class="btn btn-primary" href="${escapeHtml(url.pathname + url.search)}">Naar de standaardvragen</a></p>
    </div></div>
  </main>`
}

function welcomeView(): string {
  if (!questionnaire || !session) return ''
  const progress = hasProgress(session)
  const resumeLabel = session.phase === 'summary' ? 'Bekijk je overzicht' : 'Ga verder waar je was'
  const klant = klantParam
    ? `<p class="klant-pill" title="${escapeHtml(klantParam)}"><span>Klant</span>${escapeHtml(klantParam)}</p>`
    : ''
  return `<main class="hero" style="${photoVars(questionnaire.heroImage, questionnaire.heroPosition)}">
    <header class="hero-bar">
      ${logo('light')}
      ${klant}
    </header>
    <div class="hero-main">
      <div class="hero-copy anim-${anim === 'none' ? 'none' : anim}">
        <p class="kicker">${escapeHtml(questionnaire.kicker)}</p>
        <h1 id="screen-title" tabindex="-1">De workshop begint bij jullie</h1>
        <p class="lede">${escapeHtml(questionnaire.intro)}</p>
      </div>
      ${mediaBlock(questionnaire.video, 'light')}
      <div class="hero-actions">
        <div class="chips">
          <span class="chip"><i></i>± ${questionnaire.estimatedMinutes} minuten</span>
          <span class="chip"><i></i>${totalQuestions} vragen</span>
          <span class="chip"><i></i>Lokaal bewaard</span>
        </div>
        <div class="actions">
          ${
            progress
              ? `<button class="btn btn-yellow" type="button" data-action="resume">${resumeLabel}</button>
                 <button class="btn btn-ghost" type="button" data-action="ask-reset">Opnieuw beginnen</button>`
              : `<button class="btn btn-yellow" type="button" data-action="start">Start de vragen</button>`
          }
        </div>
        <p class="privacy">${escapeHtml(privacyLine())}${memoryOnly ? ' Deze browser bewaart ze niet blijvend — exporteer aan het eind.' : ''}</p>
      </div>
    </div>
    <img class="hero-mark" alt="" src="${asset('logos/beeldmerk-lijnen-kleur.png')}" />
    <footer class="hero-foot">
      <span>DIS Group · ERP-partner voor bouw en installatie</span>
      <a href="${beheerHref()}">Antwoorden vergelijken</a>
    </footer>
  </main>`
}

function flowView(): string {
  if (!session) return ''
  const step = steps[session.stepIndex]
  if (!step) return summaryView()
  if (step.kind === 'section') return sectionView(step.sectionIndex)
  return questionView(step)
}

function sectionView(sectionIndex: number): string {
  if (!questionnaire || !session) return ''
  const section = questionnaire.sections[sectionIndex]
  const ratio = Math.round(progressRatio() * 100)
  return `<main class="hero" style="${photoVars(section.image, section.imagePosition)}">
    <header class="hero-bar">
      <button class="logo-btn" type="button" data-action="home" aria-label="Naar het begin">${logo('light')}</button>
      <span class="saved" id="saved" hidden><i></i>Opgeslagen</span>
    </header>
    <div class="progress-wrap" style="position:relative;z-index:2">
      <div class="progress-meta">
        <span>Onderdeel ${sectionIndex + 1} van ${questionnaire.sections.length}</span>
        <strong>${ratio}%</strong>
      </div>
      <div class="track" aria-hidden="true"><span style="width:${ratio}%"></span></div>
    </div>
    <div class="hero-main anim-${anim === 'none' ? 'none' : anim}">
      <div class="hero-copy">
        <p class="kicker">${escapeHtml(section.kicker || 'Onderdeel')}</p>
        <h1 id="screen-title" tabindex="-1">${escapeHtml(section.title)}</h1>
        <p class="lede">${escapeHtml(section.intro)}</p>
      </div>
      ${mediaBlock(section.media, 'light')}
    </div>
    <img class="hero-mark" alt="" src="${asset('logos/beeldmerk-lijnen-kleur.png')}" />
    ${errorSlot()}
    <div class="dock">
      <div class="dock-inner">
        <button class="btn btn-ghost" type="button" data-action="back">${sectionIndex === 0 ? 'Naar start' : 'Terug'}</button>
        <button class="btn btn-yellow" type="button" data-action="next">Ga verder</button>
      </div>
    </div>
  </main>`
}

function questionView(step: Extract<Step, { kind: 'question' }>): string {
  if (!questionnaire || !session) return ''
  const section = questionnaire.sections[step.sectionIndex]
  const question = questionAt(questionnaire, step.sectionIndex, step.questionIndex)
  const ratio = Math.round((step.number / totalQuestions) * 100)
  const last = step.number === totalQuestions
  return `<main class="shell">
    <header class="topbar">
      <button class="logo-btn" type="button" data-action="home" aria-label="Naar het begin">${logo('dark')}</button>
      <span class="saved" id="saved" hidden><i></i>Opgeslagen</span>
    </header>
    <div class="progress-wrap">
      <div class="progress-meta">
        <span>${escapeHtml(section.title)}</span>
        <strong>Vraag ${step.number} van ${totalQuestions}</strong>
      </div>
      <div class="track" role="progressbar" aria-valuemin="1" aria-valuemax="${totalQuestions}" aria-valuenow="${step.number}" aria-label="Voortgang">
        <span style="width:${ratio}%"></span>
      </div>
    </div>
    <div class="stage">
      <div class="sheet anim-${anim === 'none' ? 'none' : anim}">
        <p class="pill tint-${section.accent}">${escapeHtml(section.kicker || section.title)}</p>
        <h1 class="q-title" id="screen-title" tabindex="-1">${escapeHtml(question.title)}</h1>
        ${question.help ? `<p class="help">${escapeHtml(question.help)}</p>` : ''}
        ${step.number === 1 ? '<p class="hint-swipe">Veeg naar links, of gebruik de knoppen onderaan.</p>' : ''}
        ${question.media ? mediaBlock(question.media, 'dark') : ''}
        ${answerControl(question)}
      </div>
    </div>
    <img class="watermark" alt="" src="${asset('logos/beeldmerk-lijnen-donkerblauw.png')}" />
    ${errorSlot()}
    <div class="dock">
      <div class="dock-inner">
        <button class="btn btn-ghost-dark" type="button" data-action="back">Vorige</button>
        <button class="btn btn-primary" type="button" data-action="next">${last ? 'Naar het overzicht' : 'Volgende'}</button>
      </div>
    </div>
  </main>`
}

function errorSlot(): string {
  if (!errorText) return ''
  return `<p class="form-error shake" id="form-error" role="alert">${escapeHtml(errorText)}</p>`
}

function answerControl(question: Question): string {
  if (!session) return ''
  const value = session.answers[question.id]
  if (question.type === 'text' || question.type === 'longtext') {
    const current = textValue(question)
    const max = question.type === 'longtext' ? 4000 : 240
    const auto = question.autocomplete ? ` autocomplete="${escapeHtml(question.autocomplete)}"` : ''
    if (question.type === 'longtext') {
      return `<textarea class="field" data-kind="text" data-qid="${escapeHtml(question.id)}" maxlength="${max}" placeholder="${escapeHtml(question.placeholder || '')}"${auto}>${escapeHtml(current)}</textarea>
        <p class="counter" id="counter-${escapeHtml(question.id)}">${current.length} / ${max}</p>`
    }
    return `<input class="field" type="text" data-kind="text" data-qid="${escapeHtml(question.id)}" maxlength="${max}" value="${escapeHtml(current)}" placeholder="${escapeHtml(question.placeholder || '')}"${auto} />`
  }
  if (question.type === 'single' || question.type === 'multiple') {
    const selected = question.type === 'multiple' ? asList(value) : typeof value === 'string' ? [value] : []
    const role = question.type === 'single' ? 'radiogroup' : 'group'
    const itemRole = question.type === 'single' ? 'radio' : 'checkbox'
    const action = question.type === 'single' ? 'single' : 'multiple'
    const cards = question.type === 'single' ? 'cards' : 'multi'
    const options = (question.options || [])
      .map((option, index) => {
        const on = selected.includes(option.value)
        const tint = TINTS[index % TINTS.length]
        return `<button class="choice tint-${tint}" type="button" role="${itemRole}" aria-checked="${on}" data-action="${action}" data-qid="${escapeHtml(question.id)}" data-value="${escapeHtml(option.value)}">
          <span class="choice-copy">
            <span class="choice-label">${escapeHtml(option.label)}</span>
            ${option.hint ? `<span class="choice-hint">${escapeHtml(option.hint)}</span>` : ''}
          </span>
          <span class="choice-mark">${CHECK}</span>
        </button>`
      })
      .join('')
    const count =
      question.type === 'multiple'
        ? `<p class="picked-count">${selected.length === 0 ? 'Nog niets gekozen' : `${selected.length} gekozen`}</p>`
        : ''
    return `<div class="choices ${cards}" role="${role}" aria-labelledby="screen-title">${options}</div>${count}`
  }
  if (question.type === 'scale') {
    const min = question.min ?? 1
    const max = question.max ?? 5
    const current = typeof value === 'number' ? value : null
    const buttons = []
    for (let n = min; n <= max; n += 1) {
      buttons.push(
        `<button type="button" role="radio" aria-checked="${current === n}" data-action="scale" data-qid="${escapeHtml(question.id)}" data-value="${n}" aria-label="${n} van ${max}">${n}</button>`,
      )
    }
    return `<div class="scale" role="radiogroup" aria-labelledby="screen-title">${buttons.join('')}</div>
      <div class="scale-labels"><span>${escapeHtml(question.minLabel || String(min))}</span><span>${escapeHtml(question.maxLabel || String(max))}</span></div>`
  }
  return rankControl(question)
}

function rankControl(question: Question): string {
  if (!session) return ''
  const selected = asList(session.answers[question.id])
  const options = question.options || []
  const ranked = selected
    .map((value) => options.find((option) => option.value === value))
    .filter((option): option is NonNullable<typeof option> => Boolean(option))
  const rest = options.filter((option) => !selected.includes(option.value))
  const row = (value: string, label: string, index: number | null) => {
    const on = index !== null
    const upDisabled = !on || index === 0
    const downDisabled = !on || index === ranked.length - 1
    return `<div class="rank-row${on ? ' is-on' : ''}">
      <button class="rank-toggle" type="button" data-action="rank-toggle" data-qid="${escapeHtml(question.id)}" data-value="${escapeHtml(value)}" aria-pressed="${on}">
        <span class="rank-num">${on ? index + 1 : ''}</span>
        <span>${escapeHtml(label)}</span>
      </button>
      <div class="rank-arrows">
        <button class="icon-btn" type="button" data-action="rank-up" data-qid="${escapeHtml(question.id)}" data-value="${escapeHtml(value)}" aria-label="Hoger: ${escapeHtml(label)}" ${upDisabled ? 'disabled' : ''}>${UP}</button>
        <button class="icon-btn" type="button" data-action="rank-down" data-qid="${escapeHtml(question.id)}" data-value="${escapeHtml(value)}" aria-label="Lager: ${escapeHtml(label)}" ${downDisabled ? 'disabled' : ''}>${DOWN}</button>
      </div>
    </div>`
  }
  const rankedHtml = ranked.map((option, index) => row(option.value, option.label, index)).join('')
  const restHtml = rest.map((option) => row(option.value, option.label, null)).join('')
  return `<div class="rank-block">
    ${ranked.length ? `<p class="rank-label">Jouw volgorde</p>${rankedHtml}` : ''}
    ${rest.length ? `<p class="rank-label">${ranked.length ? 'Nog niet gezet' : 'Tik om te rangschikken'}</p>${restHtml}` : ''}
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

function progressRatio(): number {
  if (!session || !questionnaire || totalQuestions === 0) return 0
  const step = steps[session.stepIndex]
  if (!step) return 0
  if (step.kind === 'question') return step.number / totalQuestions
  let done = 0
  for (let i = 0; i < step.sectionIndex; i += 1) done += questionnaire.sections[i].questions.length
  return done / totalQuestions
}

function summaryView(): string {
  if (!questionnaire || !session) return ''
  const doc = toExportDoc(questionnaire, session)
  const answered = doc.answers.filter((item) => item.display !== 'Nog niet ingevuld').length
  const name = typeof session.answers.naam === 'string' ? session.answers.naam.trim() : ''
  const blocks = questionnaire.sections
    .map((section) => {
      const items = section.questions
        .map((question) => {
          return `<div class="qa">
            <div class="qa-top">
              <h3>${escapeHtml(question.title)}</h3>
              <button class="linkish no-print" type="button" data-action="edit" data-qid="${escapeHtml(question.id)}">Wijzig</button>
            </div>
            ${answerHtml(question, session!.answers[question.id])}
          </div>`
        })
        .join('')
      return `<section class="section-card">
        <h2 class="tint-${section.accent}">${escapeHtml(section.title)}</h2>
        ${items}
      </section>`
    })
    .join('')
  return `<article class="summary">
    <header class="sum-hero" style="${photoVars(questionnaire.heroImage, questionnaire.heroPosition)}">
      <div class="only-screen">${logo('light', 'logo-light')}</div>
      <div class="only-print">${logo('dark')}</div>
      <p class="kicker">Klaar om mee te nemen</p>
      <h1 id="screen-title" tabindex="-1">Dit nemen we mee</h1>
      <p class="sum-meta">${escapeHtml(doc.klant || 'Klant nog niet ingevuld')}${name ? ` · ${escapeHtml(name)}` : ''}<br />
        ${answered} van ${totalQuestions} vragen ingevuld · ${escapeHtml(formatWhen(doc.exportedAt))}</p>
    </header>
    <div class="sum-body">
      <p class="note" id="remote-note">${escapeHtml(remoteNote || privacyLine())}</p>
      ${blocks}
      <div class="sum-links no-print">
        <button class="linkish" type="button" data-action="back">Terug naar de laatste vraag</button>
        <button class="linkish" type="button" data-action="ask-reset">Opnieuw beginnen</button>
        <a class="text-link" href="${beheerHref()}">Antwoorden vergelijken</a>
      </div>
    </div>
    <div class="export-bar no-print">
      <button class="btn btn-primary" type="button" data-action="download">Download JSON</button>
      <button class="btn btn-line" type="button" data-action="print">Afdrukken / PDF</button>
      <button class="btn btn-line" type="button" data-action="copy">Kopieer tekst</button>
      <button class="btn btn-line" type="button" data-action="mail">Mail naar ons</button>
    </div>
  </article>`
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
      <p class="kicker" style="color:var(--das-blue)">Voor consultants</p>
      <h1 id="screen-title" tabindex="-1">Antwoorden naast elkaar</h1>
      <p class="help">Sleep geëxporteerde JSON-bestanden hierheen. Vink er twee aan om ze te vergelijken. Niets wordt geüpload.</p>
      <div class="drop" data-drop>
        <p><strong>Zet de bestanden hier neer</strong></p>
        <p>of kies ze op je telefoon of laptop.</p>
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
  const ids = [...new Set([...left.doc.answers.map((a) => a.id), ...right.doc.answers.map((a) => a.id)])]
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

function syncText(): void {
  if (!session) return
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-kind="text"]').forEach((field) => {
    const id = field.dataset.qid
    if (!id) return
    session!.answers[id] = field.value
  })
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
  atWelcome = false
  session.phase = 'flow'
  session.stepIndex = 0
  persist()
  anim = 'next'
  render()
}

function goResume(): void {
  if (!session) return
  errorText = ''
  atWelcome = false
  if (session.phase === 'welcome') session.phase = 'flow'
  persist()
  anim = 'next'
  render()
}

function goNext(): void {
  if (!session || !questionnaire) return
  syncText()
  const step = steps[session.stepIndex]
  if (session.phase === 'flow' && step?.kind === 'question') {
    const question = questionAt(questionnaire, step.sectionIndex, step.questionIndex)
    const value = session.answers[question.id]
    if (!isValid(question, value)) {
      errorText = validationMessage(question)
      anim = 'none'
      render()
      return
    }
  }
  errorText = ''
  atWelcome = false
  if (session.phase === 'flow' && session.stepIndex >= steps.length - 1) {
    session.phase = 'summary'
    persist()
    anim = 'next'
    render()
    void maybePush()
    return
  }
  session.phase = 'flow'
  session.stepIndex += 1
  persist()
  anim = 'next'
  render()
}

function goBack(): void {
  if (!session) return
  syncText()
  errorText = ''
  if (session.phase === 'summary') {
    atWelcome = false
    session.phase = 'flow'
    session.stepIndex = Math.max(0, steps.length - 1)
  } else if (session.stepIndex <= 0 || session.phase === 'welcome') {
    atWelcome = true
    session.phase = 'welcome'
  } else {
    atWelcome = false
    session.stepIndex -= 1
    session.phase = 'flow'
  }
  persist()
  anim = 'prev'
  render()
}

function goHome(): void {
  if (!session) return
  syncText()
  errorText = ''
  atWelcome = true
  persist()
  anim = 'prev'
  render()
}

function editQuestion(id: string): void {
  if (!session || !questionnaire) return
  const index = findStepIndex(steps, id, questionnaire)
  if (index < 0) return
  atWelcome = false
  session.phase = 'flow'
  session.stepIndex = index
  errorText = ''
  anim = 'next'
  persist()
  render()
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
    if (error) error.textContent = 'Vul een geldig e-mailadres in.'
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
        <p>De antwoorden op dit apparaat voor ${klantParam ? escapeHtml(klantParam) : 'deze sessie'} worden gewist. Een gedownloade JSON blijft gewoon staan.</p>
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
        <input class="field" id="mail-to" type="email" inputmode="email" placeholder="naam@disgroup.nl" value="${escapeHtml(preset)}" />
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
  if (!session || !questionnaire) return
  clearSession(session)
  session = createSession(questionnaire.id, klantParam)
  remoteNote = ''
  errorText = ''
  atWelcome = true
  closeModal()
  anim = 'none'
  render()
}

function setAnswer(id: string, value: AnswerValue): void {
  if (!session) return
  session.answers[id] = value
  errorText = ''
  persist()
  anim = 'none'
  render()
  flashSaved()
}

function toggleList(id: string, value: string): void {
  if (!session) return
  const current = asList(session.answers[id])
  const index = current.indexOf(value)
  if (index >= 0) current.splice(index, 1)
  else current.push(value)
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
  const el = target.closest<HTMLElement>('[data-action]')
  if (!el) return
  const action = el.dataset.action
  if (action === 'start') goStart()
  else if (action === 'resume') goResume()
  else if (action === 'next') goNext()
  else if (action === 'back') goBack()
  else if (action === 'home') goHome()
  else if (action === 'ask-reset') openModal('reset')
  else if (action === 'confirm-reset') resetSession()
  else if (action === 'close-modal') closeModal()
  else if (action === 'edit' && el.dataset.qid) editQuestion(el.dataset.qid)
  else if (action === 'single' && el.dataset.qid && el.dataset.value) setAnswer(el.dataset.qid, el.dataset.value)
  else if (action === 'multiple' && el.dataset.qid && el.dataset.value) toggleList(el.dataset.qid, el.dataset.value)
  else if (action === 'scale' && el.dataset.qid) setAnswer(el.dataset.qid, Number(el.dataset.value))
  else if (action === 'rank-toggle' && el.dataset.qid && el.dataset.value) toggleList(el.dataset.qid, el.dataset.value)
  else if (action === 'rank-up' && el.dataset.qid && el.dataset.value) moveRank(el.dataset.qid, el.dataset.value, -1)
  else if (action === 'rank-down' && el.dataset.qid && el.dataset.value) moveRank(el.dataset.qid, el.dataset.value, 1)
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
    else {
      adminError = 'Vink eerst een bestand uit. Je vergelijkt er twee tegelijk.'
    }
    render()
  } else if (action === 'drop-file') {
    const index = Number(el.dataset.index)
    imports = imports.filter((_, itemIndex) => itemIndex !== index)
    picked = new Set([...picked].filter((item) => item !== index).map((item) => (item > index ? item - 1 : item)))
    render()
  }
})

document.addEventListener('input', (event) => {
  const field = event.target
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return
  if (field.dataset.kind !== 'text' || !field.dataset.qid || !session) return
  session.answers[field.dataset.qid] = field.value
  persist()
  flashSaved()
  const counter = document.getElementById(`counter-${field.dataset.qid}`)
  if (counter && field instanceof HTMLTextAreaElement) counter.textContent = `${field.value.length} / ${field.maxLength}`
})

document.addEventListener('change', (event) => {
  const field = event.target
  if (!(field instanceof HTMLInputElement) || field.dataset.action !== 'file-input' || !field.files) return
  void ingestFiles(field.files)
  field.value = ''
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal) {
    closeModal()
    return
  }
  if (event.key === 'Enter' && modal === 'email' && event.target instanceof HTMLInputElement) {
    event.preventDefault()
    mailTo(event.target.value)
    return
  }
  const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
  if (typing && event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.dataset.kind === 'text') {
    event.preventDefault()
    goNext()
    return
  }
  if (typing || modal || beheer || atWelcome || !session || session.phase === 'welcome' || session.phase === 'summary') return
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    goNext()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    goBack()
  }
})

let swipeX = 0
let swipeY = 0
let swipeOn = false
document.addEventListener(
  'touchstart',
  (event) => {
    if (modal || beheer || atWelcome || !session || session.phase === 'welcome' || session.phase === 'summary') return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('input, textarea, button, a, video, .rank-row')) return
    const touch = event.changedTouches[0]
    if (!touch || touch.clientX < 28) return
    swipeX = touch.clientX
    swipeY = touch.clientY
    swipeOn = true
  },
  { passive: true },
)
document.addEventListener(
  'touchend',
  (event) => {
    if (!swipeOn) return
    swipeOn = false
    const touch = event.changedTouches[0]
    if (!touch) return
    const dx = touch.clientX - swipeX
    const dy = touch.clientY - swipeY
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.25) return
    if (dx < 0) goNext()
    else goBack()
  },
  { passive: true },
)

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
  syncText()
  if (session) saveSession(session)
})

render()
