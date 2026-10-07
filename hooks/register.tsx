import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { QuestDaily, QuestProgress } from '../types'
import { cardHtml } from './card'
import {
  badgesOf,
  completedBy,
  dayOf,
  docsPages,
  isAtLeast,
  levelOf,
  newFeatures,
  nextQuest,
  parseQuiz,
  pickDaily,
  streakOn,
  withStreak,
  xpOf,
  BADGES,
  CHANGELOG_URL,
  DAILY_XP,
  DOCS_INDEX_URL,
  LEVEL_NAMES,
  NEW_XP,
  QUESTS,
  QUEST_XP,
  QUIZ_SYSTEM,
  WHATS_NEW_URL,
} from './quests'
import type { DocsPage, Event, Question, Quest } from './quests'

type Engine = EngineInterface

const PANE = 'quests'
// Read the changelog again after this long, and the docs index.
const NEWS_MAX_AGE_MS = 12 * 60 * 60 * 1000
const DOCS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
// The most of a docs page Claude reads to write the daily quiz.
const PAGE_MAX_CHARS = 40_000

const EMPTY_PROGRESS: QuestProgress = { done: [], tried: [], quizzes: [], daily: [], streak: 0, lastDay: '' }
const EMPTY_DAILY: QuestDaily = { day: '', status: 'idle', path: '', title: '', url: '', summary: '', questions: [], step: 0, note: '', error: '' }

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

// ---- Progress ---------------------------------------------------------------

async function loadProgress($: Engine): Promise<void> {
  const saved = (await $.store.get('progress')) as Partial<QuestProgress> | undefined
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
  await update($, progress, () => ({
    done: list(saved?.done),
    tried: list(saved?.tried),
    quizzes: list(saved?.quizzes),
    daily: list(saved?.daily),
    streak: typeof saved?.streak === 'number' ? saved.streak : 0,
    lastDay: typeof saved?.lastDay === 'string' ? saved.lastDay : '',
  }))
}

async function saveProgress($: Engine, next: QuestProgress): Promise<void> {
  await update($, progress, () => next)
  await $.store.set('progress', { ...next, done: [...next.done], tried: [...next.tried], quizzes: [...next.quizzes], daily: [...next.daily] })
}

// Adds XP (a day with XP keeps the streak going), then says so, and says a
// new level, badge or streak day out loud too.
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
  if (levelAfter > levelBefore) text += ` · Level ${levelAfter}!`
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

// What the project and the settings show: a CLAUDE.md, hooks, allow rules.
async function lookAround($: Engine): Promise<void> {
  try {
    if (await $.fs.exists('CLAUDE.md')) await saw($, { kind: 'file', path: 'CLAUDE.md' })
    const settings = (await $.settings.read()) as { hooks?: unknown; permissions?: { allow?: unknown } }
    if (settings.hooks !== undefined && settings.hooks !== null && Object.keys(settings.hooks).length > 0) {
      await saw($, { kind: 'settings', key: 'hooks' })
    }
    if (Array.isArray(settings.permissions?.allow) && settings.permissions.allow.length > 0) {
      await saw($, { kind: 'settings', key: 'allow' })
    }
  } catch {
    // Nothing to see.
  }
}

// ---- Quizzes, one question at a time ------------------------------------------

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
  if (saved?.pages !== undefined && saved.pages.length > 0 && now - (saved.fetchedAt ?? 0) < DOCS_MAX_AGE_MS) return saved.pages
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
      await update($, daily, () => ({ ...saved, status: saved.status === 'loading' ? ('idle' as const) : saved.status }))
      return
    }
    const page = pickDaily(await loadPages($), (await read($, progress)).daily, day)
    if (page === undefined) return
    const fresh: QuestDaily = { ...EMPTY_DAILY, day, path: page.path, title: page.title, url: page.url }
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
      maxTokens: 700,
      system: QUIZ_SYSTEM,
      prompt: `Page: ${current.title}\n\n${page.text.slice(0, PAGE_MAX_CHARS)}`,
    })
    if (!reply.isAnswered) throw new Error(`Claude could not write the quiz (${reply.reason})`)
    const quiz = parseQuiz(reply.text)
    if (quiz === undefined) throw new Error('the quiz came back in a shape I cannot read')
    const ready: QuestDaily = { ...current, status: 'ready', summary: quiz.summary, questions: quiz.questions, step: 0, note: '' }
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
    await update($, daily, value => ({ ...value, note: 'Not quite. The page has it: open it and try again.' }))
    return
  }
  if (current.step + 1 < current.questions.length) {
    await update($, daily, value => ({ ...value, step: value.step + 1, note: 'Right!' }))
    return
  }
  const done: QuestDaily = { ...current, status: 'done', note: '' }
  await update($, daily, () => done)
  await $.store.set('daily', done)
  await award(
    $,
    p => (p.daily.includes(current.path) ? p : { ...p, daily: [...p.daily, current.path] }),
    `📅 Daily quest done: ${current.title} (+${DAILY_XP} XP)`,
  )
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
  const html = cardHtml({
    xp: xpOf(current),
    done: current.done.length,
    total: QUESTS.length,
    daily: current.daily.length,
    tried: current.tried.length,
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quests',
      description: 'Learn Claude Code by doing: quests, a daily docs quest, badges and levels',
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
    const current = await read($, progress)
    const { level } = levelOf(xpOf(current))
    return { text: `Level ${level} · ${current.done.length}/${QUESTS.length} quests. The Quests pane is open.` }
  })

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
    const day = dayOf(await $.clock.now())
    const xp = xpOf(current)
    const { level, into, size } = levelOf(xp)
    const streak = streakOn(current, day)
    const earned = badgesOf(current).map(badge => badge.id)
    const width = 20
    const filled = Math.round((into / size) * width)
    const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
    const newCount = latest.features.filter(f => !current.tried.includes(f.key)).length

    const options = (key: string, question: Question, onPick: (option: number) => void) => (
      <Box flexDirection="column">
        <Text bold>{question.ask}</Text>
        <Box flexDirection="column">
          {question.options.map((option, o) => (
            <Button key={`${key}-${o}`} label={`${'abc'[o] ?? o}) ${option}`} onPress={() => onPick(o)} />
          ))}
        </Box>
      </Box>
    )

    const tabs = (
      <Box gap={1} flexWrap="wrap">
        <Button key="tab-quests" label={shown.tab === 'quests' ? '▸ Quests' : 'Quests'} onPress={() => void update($, view, v => ({ ...v, tab: 'quests' as const }))} />
        <Button key="tab-new" label={`${shown.tab === 'new' ? '▸ ' : ''}New${newCount > 0 ? ` (${newCount})` : ''}`} onPress={() => void update($, view, v => ({ ...v, tab: 'new' as const }))} />
        <Button key="tab-badges" label={shown.tab === 'badges' ? '▸ Badges' : 'Badges'} onPress={() => void update($, view, v => ({ ...v, tab: 'badges' as const }))} />
        <Button key="card" label="Share card" onPress={() => void shareCard($)} />
      </Box>
    )

    let body
    if (shown.tab === 'quests') {
      const quest = shownQuest(shown.focus, shown.skipped, current)
      const question = quest?.quiz?.[shown.step]
      const dailyQuestion = todays.questions[todays.step]
      const isDailyDone = todays.status === 'done' || current.daily.includes(todays.path)
      body = (
        <Box flexDirection="column" gap={1}>
          {todays.path !== '' && (
            <Box key="daily" flexDirection="column" borderStyle="round" paddingX={1}>
              <Text bold color="warning">{`📅 Daily · ${todays.title}${isDailyDone ? ' · ✓ done' : ` · +${DAILY_XP} XP`}`}</Text>
              {todays.summary !== '' && <Text>{todays.summary}</Text>}
              <Link href={todays.url} label="Read the page (official docs)" />
              {!isDailyDone && todays.status === 'idle' && (
                <Button key="daily-start" label="Start today's quiz (3 questions)" onPress={() => void startDaily($)} />
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
              {isDailyDone && <Text dimColor>A new page tomorrow. Keep your streak going!</Text>}
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
            <Text color="success">Every quest done! New ones come with the daily quest and the New tab.</Text>
          )}

          <Box key="levels" flexDirection="column">
            {([1, 2, 3] as const).map(lvl => {
              const quests = QUESTS.filter(q => q.level === lvl)
              const count = quests.filter(q => current.done.includes(q.id)).length
              const isOpen = shown.openLevel === lvl
              return (
                <Box key={`level-${lvl}`} flexDirection="column">
                  <Button
                    key={`lvl-${lvl}`}
                    label={`${count === quests.length ? '✓' : isOpen ? '▾' : '▸'} ${LEVEL_NAMES[lvl]} · ${count}/${quests.length}`}
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
      const counts: Record<string, string> = {
        'first-steps': `${QUESTS.filter(q => q.level === 1 && current.done.includes(q.id)).length}/5`,
        speedrunner: `${QUESTS.filter(q => q.level === 2 && current.done.includes(q.id)).length}/5`,
        pro: `${QUESTS.filter(q => q.level === 3 && current.done.includes(q.id)).length}/5`,
        scholar: `${current.quizzes.length}/${QUESTS.filter(q => q.quiz !== undefined).length}`,
        'early-adopter': `${Math.min(current.tried.length, 3)}/3`,
        reader: `${Math.min(current.daily.length, 5)}/5`,
        'on-fire': `${Math.min(current.streak, 7)}/7`,
      }
      body = (
        <Box flexDirection="column">
          {BADGES.map(badge => (
            <Text key={`b-${badge.id}`} color={earned.includes(badge.id) ? 'warning' : undefined} dimColor={!earned.includes(badge.id)}>
              {`${earned.includes(badge.id) ? '★' : '☆'} ${badge.name} · ${badge.why} · ${counts[badge.id] ?? ''}`}
            </Text>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>{`Level ${level} · ${xp} XP${streak > 0 ? ` · 🔥 ${streak}-day streak` : ''} · ${earned.length} badges`}</Text>
          <Text color="warning">{`${bar} ${size - into} XP to level ${level + 1}`}</Text>
        </Box>
        {tabs}
        {body}
      </Box>
    )
  })
}
