import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { QuestBankItem, QuestDaily, QuestPractice, QuestProgress } from '../types'
import { cardHtml } from './card'
import {
  badgesOf,
  bankItem,
  bossFor,
  completedBy,
  dayOf,
  docsPages,
  dueToday,
  isAtLeast,
  isTrack,
  levelOf,
  masteredIn,
  newFeatures,
  nextQuest,
  parseQuiz,
  pickDaily,
  quizSystem,
  rankOf,
  schedule,
  streakOn,
  weekOf,
  withStreak,
  xpOf,
  BADGES,
  BOSS_XP,
  CHANGELOG_URL,
  DAILY_XP,
  DOCS_INDEX_URL,
  INTERVALS,
  LEVEL_NAMES,
  NEW_XP,
  QUESTS,
  QUEST_XP,
  REVIEW_XP,
  TRACKS,
  WHATS_NEW_URL,
} from './quests'
import type { DocsPage, Event, Question, Quest, QuestLevel, Track } from './quests'

type Engine = EngineInterface

const PANE = 'quests'
// Read the changelog again after this long, and the docs index.
const NEWS_MAX_AGE_MS = 12 * 60 * 60 * 1000
const DOCS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
// The most of a docs page Claude reads to write the daily quiz.
const PAGE_MAX_CHARS = 40_000
// Reviews a day, at most: enough to remember, few enough to finish.
const REVIEWS_A_DAY = 5
// Mistakes the weekly boss forgives.
const BOSS_MISTAKES = 1

const EMPTY_PROGRESS: QuestProgress = {
  done: [],
  tried: [],
  quizzes: [],
  daily: [],
  streak: 0,
  bestStreak: 0,
  lastDay: '',
  track: '',
  mastered: 0,
  bosses: 0,
  reviews: 0,
  bonus: 0,
}
const EMPTY_DAILY: QuestDaily = {
  day: '',
  status: 'idle',
  path: '',
  title: '',
  url: '',
  track: 'beginner',
  summary: '',
  questions: [],
  step: 0,
  misses: [],
  note: '',
  error: '',
}
const EMPTY_PRACTICE: QuestPractice = {
  day: '',
  reviewed: 0,
  note: '',
  week: '',
  boss: 'idle',
  bossIds: [],
  bossStep: 0,
  bossMistakes: 0,
  bossTriedOn: '',
  bossNote: '',
}
const NO_ITEMS: readonly QuestBankItem[] = []

const progress = atom({ plugin: 'quests', key: 'progress' } as const, EMPTY_PROGRESS)
const news = atom({ plugin: 'quests', key: 'news' } as const, {
  status: 'idle',
  features: [],
  version: '',
  fetchedAt: 0,
  explanations: {},
  explaining: '',
  error: '',
})
const daily = atom({ plugin: 'quests', key: 'daily' } as const, EMPTY_DAILY)
const bank = atom({ plugin: 'quests', key: 'bank' } as const, NO_ITEMS)
const practice = atom({ plugin: 'quests', key: 'practice' } as const, EMPTY_PRACTICE)
const view = atom({ plugin: 'quests', key: 'view' } as const, {
  tab: 'quests',
  focus: '',
  openLevel: 0,
  step: 0,
  note: '',
  skipped: [],
})

async function today($: Engine): Promise<string> {
  return dayOf(await $.clock.now())
}

const trackOf = (p: QuestProgress): Track => (isTrack(p.track) ? p.track : 'beginner')

// ---- Progress ---------------------------------------------------------------

async function loadProgress($: Engine): Promise<void> {
  const saved = (await $.store.get('progress')) as Partial<QuestProgress> | undefined
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
  const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  await update($, progress, () => ({
    done: list(saved?.done),
    tried: list(saved?.tried),
    quizzes: list(saved?.quizzes),
    daily: list(saved?.daily),
    streak: num(saved?.streak),
    bestStreak: Math.max(num(saved?.bestStreak), num(saved?.streak)),
    lastDay: typeof saved?.lastDay === 'string' ? saved.lastDay : '',
    track: isTrack(saved?.track) ? saved.track : ('' as const),
    mastered: num(saved?.mastered),
    bosses: num(saved?.bosses),
    reviews: num(saved?.reviews),
    bonus: num(saved?.bonus),
  }))
  const items = (await $.store.get('bank')) as QuestBankItem[] | undefined
  await update($, bank, () => (Array.isArray(items) ? items : NO_ITEMS))
  const saw = (await $.store.get('practice')) as QuestPractice | undefined
  if (saw !== undefined && typeof saw === 'object') await update($, practice, () => ({ ...EMPTY_PRACTICE, ...saw }))
}

async function saveProgress($: Engine, next: QuestProgress): Promise<void> {
  await update($, progress, () => next)
  await $.store.set('progress', { ...next, done: [...next.done], tried: [...next.tried], quizzes: [...next.quizzes], daily: [...next.daily] })
}

async function saveBank($: Engine, items: readonly QuestBankItem[]): Promise<void> {
  await update($, bank, () => items)
  await $.store.set('bank', items.map(item => ({ ...item, options: [...item.options] })))
  // Mastered counts the most you ever held at once, so a slip never takes a badge away.
  const mastered = masteredIn(items)
  const current = await read($, progress)
  if (mastered > current.mastered) await saveProgress($, { ...current, mastered })
}

async function setPractice($: Engine, change: (p: QuestPractice) => QuestPractice): Promise<void> {
  const next = await update($, practice, change)
  await $.store.set('practice', { ...next, bossIds: [...next.bossIds] })
}

// Adds XP (a day with XP keeps the streak going), then says so, and says a
// new level, rank, badge or streak day out loud too.
async function award($: Engine, change: (current: QuestProgress) => QuestProgress, message: string): Promise<void> {
  const before = await read($, progress)
  const changed = change(before)
  if (changed === before) return
  const after = withStreak(changed, await today($))
  await saveProgress($, after)
  const levelBefore = levelOf(xpOf(before)).level
  const levelAfter = levelOf(xpOf(after)).level
  const badgesBefore = badgesOf(before).map(badge => badge.id)
  const newBadges = badgesOf(after).filter(badge => !badgesBefore.includes(badge.id))
  let text = message
  if (levelAfter > levelBefore) {
    text += ` · Level ${levelAfter}!`
    if (rankOf(levelAfter) !== rankOf(levelBefore)) text += ` You are now: ${rankOf(levelAfter)}`
  }
  if (after.streak > 1 && after.lastDay !== before.lastDay) text += ` · 🔥 ${after.streak}-day streak`
  for (const badge of newBadges) text += ` · Badge: ${badge.name} ★`
  $.ui.toast(text)
  $.ui.log(`quests: ${text}`, { to: 'debug' })
}

async function complete($: Engine, quest: Quest, how: string): Promise<void> {
  await award(
    $,
    current => (current.done.includes(quest.id) ? current : { ...current, done: [...current.done, quest.id] }),
    `🏆 Quest done${how}: ${quest.title} (+${QUEST_XP[quest.level]} XP)`,
  )
  await update($, view, value => (value.focus === quest.id ? { ...value, focus: '', step: 0, note: '' } : value))
}

// Something happened in the session: complete the quests it fulfils.
async function saw($: Engine, event: Event): Promise<void> {
  try {
    const current = await read($, progress)
    for (const quest of completedBy(event, current)) await complete($, quest, '')
  } catch {
    // Watching must never get in the way of the session.
  }
}

// What the project and the settings show: CLAUDE.md, your own agents and
// skills, a shared .mcp.json, hooks, allow rules, a status line.
async function lookAround($: Engine): Promise<void> {
  try {
    for (const path of ['CLAUDE.md', '.claude/agents', '.claude/skills', '.mcp.json']) {
      if (await $.fs.exists(path)) await saw($, { kind: 'file', path })
    }
    const settings = (await $.settings.read()) as { hooks?: unknown; permissions?: { allow?: unknown }; statusLine?: unknown }
    if (settings.hooks !== undefined && settings.hooks !== null && Object.keys(settings.hooks).length > 0) {
      await saw($, { kind: 'settings', key: 'hooks' })
    }
    if (Array.isArray(settings.permissions?.allow) && settings.permissions.allow.length > 0) {
      await saw($, { kind: 'settings', key: 'allow' })
    }
    if (settings.statusLine !== undefined && settings.statusLine !== null) await saw($, { kind: 'settings', key: 'statusLine' })
  } catch {
    // Nothing to see.
  }
}

async function chooseTrack($: Engine, track: Track): Promise<void> {
  const current = await read($, progress)
  await saveProgress($, { ...current, track })
  await update($, view, value => ({ ...value, focus: '', step: 0, note: '', skipped: [] }))
  // Today's page follows the new track, unless today's quiz has started.
  const todays = await read($, daily)
  if (todays.status === 'idle' || todays.status === 'error') {
    await $.store.delete('daily')
    await prepareDaily($)
  }
}

// ---- Quest quizzes, one question at a time ------------------------------------

async function answerQuest($: Engine, quest: Quest, option: number): Promise<void> {
  const { step } = await read($, view)
  const question = quest.quiz?.[step]
  if (question === undefined) return
  if (option !== question.answer) {
    await update($, view, value => ({ ...value, note: 'Not quite. The docs page has the answer: try again.' }))
    return
  }
  if (step + 1 < (quest.quiz?.length ?? 0)) {
    await update($, view, value => ({ ...value, step: step + 1, note: 'Right!' }))
    return
  }
  const before = await read($, progress)
  if (!before.quizzes.includes(quest.id)) await saveProgress($, { ...before, quizzes: [...before.quizzes, quest.id] })
  await complete($, quest, ' (quiz)')
}

// ---- The daily docs quest -----------------------------------------------------

// The pages worth a daily quest, from the docs index, read again weekly.
async function loadPages($: Engine): Promise<DocsPage[]> {
  const now = await $.clock.now()
  const saved = (await $.store.get('docs')) as { fetchedAt?: number; pages?: DocsPage[] } | undefined
  const isFresh = saved?.pages !== undefined && saved.pages.length > 0 && saved.pages[0]?.track !== undefined
  if (isFresh && now - (saved.fetchedAt ?? 0) < DOCS_MAX_AGE_MS) return saved.pages ?? []
  const answer = await $.http.fetch(DOCS_INDEX_URL)
  if (!answer.ok) throw new Error(`the docs index answered ${answer.status}`)
  const pages = docsPages(answer.text)
  await $.store.set('docs', { fetchedAt: now, pages })
  return pages
}

// Today's page, chosen without asking Claude anything (that waits for Start).
async function prepareDaily($: Engine): Promise<void> {
  try {
    const day = await today($)
    const saved = (await $.store.get('daily')) as QuestDaily | undefined
    if (saved?.day === day) {
      await update($, daily, () => ({ ...EMPTY_DAILY, ...saved, status: saved.status === 'loading' ? ('idle' as const) : saved.status }))
      return
    }
    const current = await read($, progress)
    const track = trackOf(current)
    const page = pickDaily(await loadPages($), current.daily, day, track)
    if (page === undefined) return
    const fresh: QuestDaily = { ...EMPTY_DAILY, day, path: page.path, title: page.title, url: page.url, track }
    await update($, daily, () => fresh)
    await $.store.set('daily', fresh)
  } catch {
    // No docs today: the box stays away.
  }
}

// Reads today's page and asks Claude (Haiku, on your account) for a quiz on it.
async function startDaily($: Engine): Promise<void> {
  const current = await read($, daily)
  if (current.path === '' || current.status === 'loading') return
  await update($, daily, value => ({ ...value, status: 'loading' as const, error: '' }))
  try {
    const page = await $.http.fetch(`${current.url}.md`)
    if (!page.ok) throw new Error(`the docs page answered ${page.status}`)
    const reply = await $.model.complete({
      model: 'haiku',
      maxTokens: 900,
      system: quizSystem(current.track),
      prompt: `Page: ${current.title}\n\n${page.text.slice(0, PAGE_MAX_CHARS)}`,
    })
    if (!reply.isAnswered) throw new Error(`Claude could not write the quiz (${reply.reason})`)
    const quiz = parseQuiz(reply.text)
    if (quiz === undefined) throw new Error('the quiz came back in a shape I cannot read')
    const ready: QuestDaily = { ...current, status: 'ready', summary: quiz.summary, questions: quiz.questions, step: 0, misses: [], note: '' }
    await update($, daily, () => ready)
    await $.store.set('daily', ready)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, daily, value => ({ ...value, status: 'error' as const, error: message }))
  }
}

async function answerDaily($: Engine, option: number): Promise<void> {
  const current = await read($, daily)
  const question = current.questions[current.step]
  if (current.status !== 'ready' || question === undefined) return
  if (option !== question.answer) {
    const misses = current.misses.includes(current.step) ? current.misses : [...current.misses, current.step]
    await update($, daily, value => ({ ...value, misses, note: 'Not quite. The page has it: open it and try again.' }))
    return
  }
  if (current.step + 1 < current.questions.length) {
    await update($, daily, value => ({ ...value, step: value.step + 1, note: 'Right!' }))
    return
  }
  const done: QuestDaily = { ...current, status: 'done', note: '' }
  await update($, daily, () => done)
  await $.store.set('daily', done)
  // Every question goes to your memory bank: a miss comes back tomorrow.
  const day = await today($)
  const items = await read($, bank)
  const page = { path: current.path, title: current.title, url: current.url }
  const added = current.questions.map((q, i) => bankItem(q, page, !current.misses.includes(i), day))
  await saveBank($, [...items.filter(item => !added.some(a => a.id === item.id)), ...added])
  const xp = TRACKS[current.track].dailyXp
  await award(
    $,
    p => (p.daily.includes(current.path) ? p : { ...p, daily: [...p.daily, current.path], bonus: (p.bonus ?? 0) + xp - DAILY_XP }),
    `📅 Daily quest done: ${current.title} (+${xp} XP) · ${added.length} questions saved for review`,
  )
}

// ---- Review and the weekly boss -------------------------------------------------

async function practiceToday($: Engine): Promise<QuestPractice> {
  const day = await today($)
  const current = await read($, practice)
  if (current.day === day) return current
  const week = weekOf(day)
  const fresh =
    current.week === week
      ? { ...current, day, reviewed: 0, note: '', bossNote: current.boss === 'lost' ? '' : current.bossNote }
      : { ...EMPTY_PRACTICE, day, week }
  await setPractice($, () => fresh)
  return fresh
}

async function answerReview($: Engine, option: number): Promise<void> {
  const day = await today($)
  const state = await practiceToday($)
  const items = await read($, bank)
  const item = dueToday(items, day, REVIEWS_A_DAY - state.reviewed)[0]
  if (item === undefined) return
  const isRight = option === item.answer
  await saveBank($, items.map(i => (i.id === item.id ? schedule(i, true === isRight, day) : i)))
  const next = schedule(item, isRight, day)
  await setPractice($, p => ({
    ...p,
    reviewed: p.reviewed + 1,
    note: isRight ? `Right! Back in ${INTERVALS[next.box]} days.` : `The answer: ${item.options[item.answer]}. It comes back tomorrow.`,
  }))
  if (isRight) await award($, p => ({ ...p, reviews: p.reviews + 1 }), `🔁 Remembered (+${REVIEW_XP} XP)`)
}

async function startBoss($: Engine): Promise<void> {
  const day = await today($)
  const state = await practiceToday($)
  const questions = bossFor(await read($, bank), state.week)
  if (questions === undefined || state.boss === 'won' || state.boss === 'running' || state.bossTriedOn === day) return
  await setPractice($, p => ({ ...p, boss: 'running' as const, bossIds: questions.map(q => q.id), bossStep: 0, bossMistakes: 0, bossNote: '' }))
}

async function answerBoss($: Engine, option: number): Promise<void> {
  const day = await today($)
  const state = await practiceToday($)
  const items = await read($, bank)
  const item = items.find(i => i.id === state.bossIds[state.bossStep])
  if (state.boss !== 'running' || item === undefined) return
  const isRight = option === item.answer
  await saveBank($, items.map(i => (i.id === item.id ? schedule(i, isRight, day) : i)))
  const mistakes = state.bossMistakes + (isRight ? 0 : 1)
  if (mistakes > BOSS_MISTAKES) {
    await setPractice($, p => ({ ...p, boss: 'lost' as const, bossMistakes: mistakes, bossTriedOn: day, bossNote: `The answer: ${item.options[item.answer]}. Two mistakes: the boss wins today. Try again tomorrow.` }))
    return
  }
  if (state.bossStep + 1 < state.bossIds.length) {
    await setPractice($, p => ({ ...p, bossStep: p.bossStep + 1, bossMistakes: mistakes, bossNote: isRight ? 'Hit!' : `Ouch. The answer: ${item.options[item.answer]}. One more mistake and it wins.` }))
    return
  }
  await setPractice($, p => ({ ...p, boss: 'won' as const, bossMistakes: mistakes, bossTriedOn: day, bossNote: '' }))
  await award($, p => ({ ...p, bosses: p.bosses + 1 }), `⚔️ Weekly boss beaten! (+${BOSS_XP} XP)`)
}

// ---- The New tab: the changelog -----------------------------------------------

async function refreshNews($: Engine, isForced: boolean): Promise<void> {
  try {
    await fetchNews($, isForced)
  } catch {
    // The session ended meanwhile: nothing to show.
  }
}

async function fetchNews($: Engine, isForced: boolean): Promise<void> {
  const current = await read($, news)
  const now = await $.clock.now()
  if (current.status === 'loading') return
  if (!isForced && current.status === 'ready' && now - current.fetchedAt < NEWS_MAX_AGE_MS) return
  await update($, news, value => ({ ...value, status: 'loading' as const, error: '' }))
  try {
    const answer = await $.http.fetch(CHANGELOG_URL)
    if (!answer.ok) throw new Error(`the changelog answered ${answer.status}`)
    const features = newFeatures(answer.text)
    const { version } = await $.session.version()
    await update($, news, value => ({ ...value, status: 'ready' as const, features, version, fetchedAt: now }))
    await $.store.set('news', { features, version, fetchedAt: now, explanations: { ...current.explanations } })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, news, value => ({ ...value, status: 'error' as const, error: message }))
  }
}

async function loadNews($: Engine): Promise<void> {
  const saved = (await $.store.get('news')) as
    | { features?: unknown; version?: unknown; fetchedAt?: unknown; explanations?: unknown }
    | undefined
  if (saved === undefined || !Array.isArray(saved.features)) return
  await update($, news, value => ({
    ...value,
    status: 'ready' as const,
    features: saved.features as { key: string; version: string; text: string }[],
    version: typeof saved.version === 'string' ? saved.version : '',
    fetchedAt: typeof saved.fetchedAt === 'number' ? saved.fetchedAt : 0,
    explanations: (saved.explanations ?? {}) as Record<string, string>,
  }))
}

// Asks Claude (Haiku, on your account) to explain one changelog line.
async function explain($: Engine, key: string): Promise<void> {
  const current = await read($, news)
  const feature = current.features.find(f => f.key === key)
  if (feature === undefined || current.explaining !== '') return
  await update($, news, value => ({ ...value, explaining: key }))
  let text: string
  try {
    const answer = await $.model.complete({
      model: 'haiku',
      maxTokens: 160,
      system:
        'You explain one line of the Claude Code changelog to a Claude Code user, in at most 40 words. ' +
        'One plain sentence: what it is and why it helps. Then a line starting "Try it:" with one concrete step. ' +
        'No markdown, no backticks, no headings. If it is not something a user tries (an API for mod or script authors), say who it helps instead of "Try it:".',
      prompt: `Claude Code ${feature.version}: ${feature.text}`,
    })
    text = answer.isAnswered ? answer.text.replace(/`/g, '').trim() : `Could not explain it now (${answer.reason}).`
  } catch (error) {
    text = `Could not explain it now (${error instanceof Error ? error.message : String(error)}).`
  }
  const explanations = { ...current.explanations, [key]: text }
  await update($, news, value => ({ ...value, explaining: '', explanations }))
  const saved = (await $.store.get('news')) as Record<string, unknown> | undefined
  if (saved !== undefined) await $.store.set('news', { ...saved, explanations })
}

async function tried($: Engine, key: string): Promise<void> {
  await award(
    $,
    current => (current.tried.includes(key) ? current : { ...current, tried: [...current.tried, key] }),
    `⭐ New feature tried (+${NEW_XP} XP)`,
  )
}

// ---- The card -----------------------------------------------------------------

// Writes the card page and opens it in the browser.
async function shareCard($: Engine): Promise<string> {
  const current = await read($, progress)
  const day = await today($)
  const xp = xpOf(current)
  const html = cardHtml({
    xp,
    rank: rankOf(levelOf(xp).level),
    done: current.done.length,
    total: QUESTS.length,
    daily: current.daily.length,
    tried: current.tried.length,
    mastered: current.mastered,
    streak: streakOn(current, day),
    badges: badgesOf(current).map(badge => badge.id),
    date: day,
  })
  const home = (await $.env.get('HOME')) ?? ''
  const isWindows = (await $.env.get('OS')) === 'Windows_NT'
  const tmp = (await $.env.get('TMPDIR')) ?? (await $.env.get('TEMP')) ?? '/tmp'
  const path = `${tmp.replace(/[\\/]$/, '')}/claude-quests-card.html`
  await $.fs.write(path, html)
  const argv = isWindows ? ['cmd', '/c', 'start', '', path] : home.startsWith('/Users/') ? ['open', path] : ['xdg-open', path]
  void drain($.process.spawn({ argv }))
  return path
}

async function drain(stream: AsyncIterable<unknown>): Promise<void> {
  try {
    for await (const chunk of stream) void chunk
  } catch {
    // No browser to open: the path is in the answer.
  }
}

async function openPane($: Engine): Promise<void> {
  await $.ui.open({ id: PANE, title: 'Quests' })
}

// The quest shown in the box: the one you picked, else the next not done.
function shownQuest(focus: string, skipped: readonly string[], current: QuestProgress): Quest | undefined {
  const picked = QUESTS.find(q => q.id === focus && !current.done.includes(q.id))
  return picked ?? nextQuest(current, skipped)
}

const LEVELS: readonly QuestLevel[] = [1, 2, 3, 4, 5, 6]

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quests',
      description: 'Learn Claude Code by doing: quests, daily docs quizzes, reviews, a weekly boss, badges and ranks',
      argumentHint: '[card | new]',
    })
    await loadProgress($)
    await loadNews($)
    await lookAround($)
    void refreshNews($, false)
    void prepareDaily($)
    return next(e)
  })

  on('command.run', { command: 'quests' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'card') {
      const path = await shareCard($)
      return { text: `Your progress card is open in the browser (${path}). Press Download PNG to save it.` }
    }
    await openPane($)
    if (args === 'new') await update($, view, value => ({ ...value, tab: 'new' as const }))
    void refreshNews($, false)
    void prepareDaily($)
    await practiceToday($)
    const current = await read($, progress)
    const { level } = levelOf(xpOf(current))
    return { text: `${rankOf(level)} · Level ${level} · ${current.done.length}/${QUESTS.length} quests. The Quests pane is open.` }
  })

  // The slash commands you run complete quests: /model, /branch, /background…
  on('command.run', async ($, e, next) => {
    const result = await next(e)
    if (e.command !== 'quests') await saw($, { kind: 'command', name: e.command.replace(/^\//, '') })
    return result
  }).catch(($, e, next) => next(e))

  // What you and Claude do completes quests.
  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    if (!e.text.trimStart().startsWith('/')) await saw($, { kind: 'prompt', text: e.text })
    return result
  }).catch(($, e, next) => next(e))
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    // Only a tool that ran counts: not one the permission check refused.
    if (result.deny === undefined) await saw($, { kind: 'tool', tool: String(e.tool) })
    return result
  }).catch(($, e, next) => next(e))
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    await saw($, { kind: 'subagent' })
    return result
  }).catch(($, e, next) => next(e))
  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    await saw($, { kind: 'skill' })
    return result
  }).catch(($, e, next) => next(e))
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    await saw($, { kind: 'compact' })
    return result
  }).catch(($, e, next) => next(e))
  // After a turn, /init may have written a CLAUDE.md, or Claude added a hook.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) await lookAround($)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const current = await read($, progress)
    const shown = await read($, view)
    const latest = await read($, news)
    const todays = await read($, daily)
    const items = await read($, bank)
    const practised = await read($, practice)
    const day = dayOf(await $.clock.now())
    const xp = xpOf(current)
    const { level, into, size } = levelOf(xp)
    const rank = rankOf(level)
    const streak = streakOn(current, day)
    const earned = badgesOf(current).map(badge => badge.id)
    const width = 20
    const filled = Math.round((into / size) * width)
    const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
    const newCount = latest.features.filter(f => !current.tried.includes(f.key)).length
    const reviewedToday = practised.day === day ? practised.reviewed : 0
    const due = dueToday(items, day, Math.max(0, REVIEWS_A_DAY - reviewedToday))
    const allDue = dueToday(items, day, Number.MAX_SAFE_INTEGER).length
    const week = weekOf(day)
    const bossQuestions = bossFor(items, week)
    const bossState = practised.week === week ? practised : { ...practised, boss: 'idle' as const, bossTriedOn: '' }

    const options = (key: string, question: Question, onPick: (option: number) => void) => (
      <Box flexDirection="column">
        <Text bold>{question.ask}</Text>
        <Box flexDirection="column">
          {question.options.map((option, o) => (
            <Button key={`${key}-${o}`} label={`${'abcde'[o] ?? o}) ${option}`} onPress={() => onPick(o)} />
          ))}
        </Box>
      </Box>
    )

    const tabs = (
      <Box gap={1} flexWrap="wrap">
        <Button key="tab-quests" label={shown.tab === 'quests' ? '▸ Quests' : 'Quests'} onPress={() => void update($, view, v => ({ ...v, tab: 'quests' as const }))} />
        <Button key="tab-new" label={`${shown.tab === 'new' ? '▸ ' : ''}New${newCount > 0 ? ` (${newCount})` : ''}`} onPress={() => void update($, view, v => ({ ...v, tab: 'new' as const }))} />
        <Button key="tab-me" label={shown.tab === 'me' ? '▸ Me' : 'Me'} onPress={() => void update($, view, v => ({ ...v, tab: 'me' as const }))} />
        <Button key="card" label="Share card" onPress={() => void shareCard($)} />
      </Box>
    )

    const trackButtons = (
      <Box gap={1} flexWrap="wrap">
        {(Object.keys(TRACKS) as Track[]).map(track => (
          <Button
            key={`track-${track}`}
            label={`${current.track === track ? '● ' : ''}${TRACKS[track].name}`}
            onPress={() => void chooseTrack($, track)}
          />
        ))}
      </Box>
    )

    let body
    if (shown.tab === 'quests') {
      const quest = shownQuest(shown.focus, shown.skipped, current)
      const question = quest?.quiz?.[shown.step]
      const dailyQuestion = todays.questions[todays.step]
      const isDailyDone = todays.status === 'done' || current.daily.includes(todays.path)
      const review = due[0]
      const bossItem = items.find(i => i.id === bossState.bossIds[bossState.bossStep])
      body = (
        <Box flexDirection="column" gap={1}>
          {current.track === '' && (
            <Box key="choose" flexDirection="column" borderStyle="round" paddingX={1}>
              <Text bold color="warning">Choose your track</Text>
              {(Object.keys(TRACKS) as Track[]).map(track => (
                <Text key={`about-${track}`}>{`${TRACKS[track].name}: ${TRACKS[track].about}`}</Text>
              ))}
              {trackButtons}
              <Text dimColor>Your track sets where you start and how hard the daily questions are. Change it any time under Me.</Text>
            </Box>
          )}

          {todays.path !== '' && (
            <Box key="daily" flexDirection="column" borderStyle="round" paddingX={1}>
              <Text bold color="warning">
                {`📅 Daily · ${todays.title}${isDailyDone ? ' · ✓ done' : ` · ${TRACKS[todays.track].name} · +${TRACKS[todays.track].dailyXp} XP`}`}
              </Text>
              {todays.summary !== '' && <Text>{todays.summary}</Text>}
              <Link href={todays.url} label="Read the page (official docs)" />
              {!isDailyDone && todays.status === 'idle' && (
                <Button
                  key="daily-start"
                  label={`Start today's quiz (${TRACKS[todays.track].questions} questions)`}
                  onPress={() => void startDaily($)}
                />
              )}
              {todays.status === 'loading' && <Text dimColor>Claude is reading the page and writing your quiz…</Text>}
              {todays.status === 'error' && (
                <Box flexDirection="column">
                  <Text color="warning">{`Could not make the quiz: ${todays.error}`}</Text>
                  <Button key="daily-retry" label="Try again" onPress={() => void startDaily($)} />
                </Box>
              )}
              {todays.status === 'ready' &&
                dailyQuestion !== undefined &&
                options(`d-${todays.step}`, { ...dailyQuestion, ask: `${todays.step + 1}/${todays.questions.length} · ${dailyQuestion.ask}` }, o => void answerDaily($, o))}
              {todays.note !== '' && <Text color="warning">{todays.note}</Text>}
              {isDailyDone && <Text dimColor>Saved to your memory bank. A new page tomorrow.</Text>}
            </Box>
          )}

          {(review !== undefined || practised.note !== '') && practised.day === day && (
            <Box key="review" flexDirection="column" borderStyle="round" paddingX={1}>
              <Text bold color="warning">{`🔁 Review · ${due.length} left today · +${REVIEW_XP} XP each`}</Text>
              {review !== undefined &&
                options(`r-${review.id}`, { ask: `${review.ask}  (from: ${review.title})`, options: review.options, answer: review.answer }, o => void answerReview($, o))}
              {practised.note !== '' && <Text color="warning">{practised.note}</Text>}
              {review === undefined && <Text dimColor>Done for today. Spaced review keeps it in your memory for months.</Text>}
            </Box>
          )}
          {review !== undefined && practised.day !== day && (
            <Box key="review-start" flexDirection="column" borderStyle="round" paddingX={1}>
              <Text bold color="warning">{`🔁 Review · ${due.length} due today`}</Text>
              <Button key="review-go" label="Start review" onPress={() => void practiceToday($)} />
            </Box>
          )}

          {bossQuestions !== undefined && (
            <Box key="boss" flexDirection="column" borderStyle="round" paddingX={1}>
              <Text bold color="warning">{`⚔️ Weekly boss · ${bossState.boss === 'won' ? 'beaten ✓' : `5 questions, 1 mistake allowed · +${BOSS_XP} XP`}`}</Text>
              {bossState.boss !== 'running' && bossState.boss !== 'won' && bossState.bossTriedOn !== day && (
                <Button key="boss-start" label="Fight" onPress={() => void startBoss($)} />
              )}
              {bossState.boss === 'running' &&
                bossItem !== undefined &&
                options(`b-${bossState.bossStep}`, { ask: `${bossState.bossStep + 1}/5 · ${bossItem.ask}`, options: bossItem.options, answer: bossItem.answer }, o => void answerBoss($, o))}
              {bossState.bossNote !== '' && <Text color="warning">{bossState.bossNote}</Text>}
              {bossState.boss === 'won' && <Text dimColor>A new boss next week.</Text>}
            </Box>
          )}

          {quest !== undefined ? (
            <Box key="next" flexDirection="column" borderStyle="round" paddingX={1}>
              <Text bold color="warning">{`▶ ${shown.focus === quest.id ? 'Quest' : 'Next quest'} · ${quest.title} · +${QUEST_XP[quest.level]} XP`}</Text>
              <Text>{quest.why}</Text>
              <Text color="success">{`Do it: ${quest.how}`}</Text>
              <Link href={quest.docs} label="Learn more (official docs)" />
              {question !== undefined &&
                options(`a-${quest.id}-${shown.step}`, { ...question, ask: `Or answer ${shown.step + 1}/${quest.quiz?.length ?? 0}: ${question.ask}` }, o => void answerQuest($, quest, o))}
              {question === undefined && quest.watch !== undefined && <Text dimColor>It completes by itself when you do it.</Text>}
              {shown.note !== '' && <Text color="warning">{shown.note}</Text>}
              <Box gap={1}>
                <Button key="mark" label="I did it" onPress={() => void complete($, quest, ' (marked)')} />
                <Button
                  key="skip"
                  label="Another one"
                  onPress={() => void update($, view, v => ({ ...v, focus: '', step: 0, note: '', skipped: [...v.skipped.filter(id => id !== quest.id), quest.id] }))}
                />
              </Box>
            </Box>
          ) : (
            <Text color="success">Every quest done! The daily quest, reviews and the weekly boss keep going.</Text>
          )}

          <Box key="levels" flexDirection="column">
            {LEVELS.map(lvl => {
              const quests = QUESTS.filter(q => q.level === lvl)
              const count = quests.filter(q => current.done.includes(q.id)).length
              const isOpen = shown.openLevel === lvl
              return (
                <Box key={`level-${lvl}`} flexDirection="column">
                  <Button
                    key={`lvl-${lvl}`}
                    label={`${count === quests.length ? '✓' : isOpen ? '▾' : '▸'} ${LEVEL_NAMES[lvl]} · ${count}/${quests.length} · ${QUEST_XP[lvl]} XP each`}
                    onPress={() => void update($, view, v => ({ ...v, openLevel: v.openLevel === lvl ? 0 : lvl }))}
                  />
                  {isOpen &&
                    quests.map(q => (
                      <Box key={`row-${q.id}`} paddingLeft={2}>
                        <Button
                          key={`q-${q.id}`}
                          label={`${current.done.includes(q.id) ? '✓' : '○'} ${q.title}`}
                          onPress={() => void update($, view, v => ({ ...v, focus: q.id, step: 0, note: '' }))}
                        />
                      </Box>
                    ))}
                </Box>
              )
            })}
          </Box>
        </Box>
      )
    } else if (shown.tab === 'new') {
      body = (
        <Box flexDirection="column">
          <Text dimColor>New in Claude Code, from the official changelog. Try one for +{NEW_XP} XP.</Text>
          {latest.status === 'loading' && <Text dimColor>Reading the changelog…</Text>}
          {latest.status === 'error' && <Text color="warning">{`Could not read the changelog: ${latest.error}`}</Text>}
          {latest.features.map(feature => {
            const isTried = current.tried.includes(feature.key)
            const canTry = latest.version === '' || isAtLeast(latest.version, feature.version)
            const explanation = latest.explanations[feature.key]
            return (
              <Box key={`f-${feature.key}`} flexDirection="column" marginTop={1}>
                <Text>
                  <Text bold color="warning">{`v${feature.version} `}</Text>
                  {feature.text}
                </Text>
                {explanation !== undefined && <Text color="success">{explanation}</Text>}
                <Box gap={1} flexWrap="wrap">
                  {explanation === undefined && (
                    <Button
                      key={`x-${feature.key}`}
                      label={latest.explaining === feature.key ? 'Explaining…' : 'Explain'}
                      onPress={() => void explain($, feature.key)}
                    />
                  )}
                  {canTry && !isTried && <Button key={`t-${feature.key}`} label={`I tried it +${NEW_XP}`} onPress={() => void tried($, feature.key)} />}
                  {isTried && <Text color="success">✓ tried</Text>}
                  {!canTry && <Text dimColor>{`Update Claude Code (you have ${latest.version}) to try it.`}</Text>}
                </Box>
              </Box>
            )
          })}
          <Box gap={1} marginTop={1} flexWrap="wrap">
            <Button key="refresh" label="Check for new" onPress={() => void refreshNews($, true)} />
            <Link href={WHATS_NEW_URL} label="This week in Claude Code (official)" />
          </Box>
          <Text dimColor>Explain asks Claude Haiku on your account to explain a line; check the docs for the details.</Text>
        </Box>
      )
    } else {
      body = (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text bold>{`Track: ${isTrack(current.track) ? TRACKS[current.track].name : 'not chosen'}`}</Text>
            {trackButtons}
          </Box>
          <Box flexDirection="column">
            <Text bold>Your memory</Text>
            <Text>{`${items.length} questions in your bank · ${masteredIn(items)} mastered now (best: ${current.mastered}) · ${allDue} due today`}</Text>
            <Text>{`${current.daily.length} daily quests · ${current.reviews} reviews right · ${current.bosses} weekly bosses beaten · best streak ${current.bestStreak} days`}</Text>
            <Text dimColor>A question you get right comes back after 3, 7, 14, 30, 60 and 120 days; at 30 it counts as mastered. A miss comes back tomorrow.</Text>
          </Box>
          <Box flexDirection="column">
            <Text bold>{`Badges · ${earned.length}/${BADGES.length}`}</Text>
            {BADGES.map(badge => {
              const isEarned = earned.includes(badge.id)
              return (
                <Text key={`b-${badge.id}`} color={isEarned ? 'warning' : undefined} dimColor={!isEarned}>
                  {`${isEarned ? '★' : '☆'} ${badge.name} · ${badge.why} · ${Math.min(badge.count(current), badge.goal)}/${badge.goal}`}
                </Text>
              )
            })}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>{`${rank} · Level ${level} · ${xp} XP${streak > 0 ? ` · 🔥 ${streak}-day streak` : ''} · ${earned.length} badges`}</Text>
          <Text color="warning">{`${bar} ${size - into} XP to level ${level + 1}`}</Text>
        </Box>
        {tabs}
        {body}
      </Box>
    )
  })
}
