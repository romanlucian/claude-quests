import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { QuestProgress } from '../types'
import { cardHtml } from './card'
import {
  badgesOf,
  completedBy,
  isAtLeast,
  levelOf,
  newFeatures,
  xpOf,
  BADGES,
  CHANGELOG_URL,
  LEVEL_NAMES,
  NEW_XP,
  QUESTS,
  QUEST_XP,
  WHATS_NEW_URL,
} from './quests'
import type { Event, Quest } from './quests'

type Engine = EngineInterface

const PANE = 'quests'
// Read the changelog again after this long.
const NEWS_MAX_AGE_MS = 12 * 60 * 60 * 1000

const progress = atom({ plugin: 'quests', key: 'progress' } as const, { done: [], tried: [], quizzes: [] })
const news = atom({ plugin: 'quests', key: 'news' } as const, {
  status: 'idle',
  features: [],
  version: '',
  fetchedAt: 0,
  explanations: {},
  explaining: '',
  error: '',
})
const view = atom({ plugin: 'quests', key: 'view' } as const, { tab: 'quests', selected: '', answers: [], note: '' })

// ---- Progress ---------------------------------------------------------------

async function loadProgress($: Engine): Promise<void> {
  const saved = (await $.store.get('progress')) as Partial<QuestProgress> | undefined
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
  await update($, progress, () => ({ done: list(saved?.done), tried: list(saved?.tried), quizzes: list(saved?.quizzes) }))
}

async function saveProgress($: Engine, next: QuestProgress): Promise<void> {
  await update($, progress, () => next)
  await $.store.set('progress', { done: [...next.done], tried: [...next.tried], quizzes: [...next.quizzes] })
}

// Adds XP, then says so, and says a new level or badge out loud too.
async function award($: Engine, change: (current: QuestProgress) => QuestProgress, message: string): Promise<void> {
  const before = await read($, progress)
  const after = change(before)
  if (after === before) return
  await saveProgress($, after)
  const levelBefore = levelOf(xpOf(before)).level
  const levelAfter = levelOf(xpOf(after)).level
  const badgesBefore = badgesOf(before).map(badge => badge.id)
  const newBadges = badgesOf(after).filter(badge => !badgesBefore.includes(badge.id))
  let text = message
  if (levelAfter > levelBefore) text += ` · Level ${levelAfter}!`
  for (const badge of newBadges) text += ` · Badge: ${badge.name} ★`
  $.ui.toast(text)
}

async function complete($: Engine, quest: Quest, how: string): Promise<void> {
  await award(
    $,
    current => (current.done.includes(quest.id) ? current : { ...current, done: [...current.done, quest.id] }),
    `🏆 Quest done${how}: ${quest.title} (+${QUEST_XP[quest.level]} XP)`,
  )
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
      maxTokens: 220,
      system:
        'You explain one line of the Claude Code changelog to a Claude Code user. Two short plain sentences: what it is and why it helps. ' +
        'Then a line starting "Try it:" with one concrete step. No markdown, no headings. If the line is too technical to try, say who it helps instead.',
      prompt: `Claude Code ${feature.version}: ${feature.text}`,
    })
    text = answer.isAnswered ? answer.text.trim() : `Could not explain it now (${answer.reason}).`
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

// ---- Quizzes ------------------------------------------------------------------

async function answer($: Engine, quest: Quest, question: number, option: number): Promise<void> {
  const quiz = quest.quiz ?? []
  const current = await read($, view)
  const answers = [...current.answers]
  answers[question] = option
  const isRight = quiz[question]?.answer === option
  const note = isRight ? 'Right!' : 'Not quite. Read the docs page, then try again.'
  await update($, view, value => ({ ...value, answers, note }))
  if (!quiz.every((q, i) => answers[i] === q.answer)) return
  await update($, view, value => ({ ...value, note: 'All right! Quest done.' }))
  const before = await read($, progress)
  if (!before.quizzes.includes(quest.id)) await saveProgress($, { ...before, quizzes: [...before.quizzes, quest.id] })
  await complete($, quest, ' (quiz)')
}

// ---- The card -----------------------------------------------------------------

// Writes the card page and opens it in the browser.
async function shareCard($: Engine): Promise<string> {
  const current = await read($, progress)
  const { features } = await read($, news)
  const date = new Date(await $.clock.now()).toISOString().slice(0, 10)
  const html = cardHtml({
    xp: xpOf(current),
    done: current.done.length + current.tried.length,
    total: QUESTS.length + Math.max(features.length, current.tried.length),
    badges: badgesOf(current).map(badge => badge.id),
    date,
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

async function select($: Engine, id: string): Promise<void> {
  await update($, view, value => ({ ...value, selected: value.selected === id ? '' : id, answers: [], note: '' }))
}

async function markDone($: Engine, quest: Quest): Promise<void> {
  await complete($, quest, ' (marked)')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quests',
      description: 'Learn Claude Code by doing: quests, badges and levels',
      argumentHint: '[card | new]',
    })
    await loadProgress($)
    await loadNews($)
    await lookAround($)
    void refreshNews($, false)
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
    await saw($, { kind: 'tool', tool: String(e.tool) })
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
    const xp = xpOf(current)
    const { level, into, size } = levelOf(xp)
    const earned = badgesOf(current).map(badge => badge.id)
    const width = 20
    const filled = Math.round((into / size) * width)
    const bar = `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
    const newCount = latest.features.filter(f => !current.tried.includes(f.key)).length

    const tabs = (
      <Box gap={1} flexWrap="wrap">
        <Button key="tab-quests" label={shown.tab === 'quests' ? '▸ Quests' : 'Quests'} onPress={() => void update($, view, v => ({ ...v, tab: 'quests' as const }))} />
        <Button key="tab-new" label={`${shown.tab === 'new' ? '▸ ' : ''}⭐ New${newCount > 0 ? ` (${newCount})` : ''}`} onPress={() => void update($, view, v => ({ ...v, tab: 'new' as const }))} />
        <Button key="tab-badges" label={shown.tab === 'badges' ? '▸ Badges' : 'Badges'} onPress={() => void update($, view, v => ({ ...v, tab: 'badges' as const }))} />
        <Button key="card" label="Share card" onPress={() => void shareCard($)} />
      </Box>
    )

    let body
    if (shown.tab === 'quests') {
      const selected = QUESTS.find(q => q.id === shown.selected)
      body = (
        <Box flexDirection="column">
          {([1, 2, 3] as const).map(lvl => (
            <Box key={`level-${lvl}`} flexDirection="column">
              <Text bold color="warning">
                {`${LEVEL_NAMES[lvl]} · ${QUEST_XP[lvl]} XP each`}
              </Text>
              {QUESTS.filter(q => q.level === lvl).map(quest => {
                const isDone = current.done.includes(quest.id)
                return (
                  <Box key={`row-${quest.id}`} flexDirection="column">
                    <Button
                      key={`q-${quest.id}`}
                      label={`${isDone ? '✓' : '○'} ${quest.title}${quest.quiz !== undefined && !isDone ? ' · quiz' : ''}`}
                      onPress={() => void select($, quest.id)}
                    />
                    {selected?.id === quest.id && (
                      <Box flexDirection="column" paddingLeft={2}>
                        <Text>{quest.why}</Text>
                        <Text color="success">{`Do it: ${quest.how}`}</Text>
                        <Link href={quest.docs} label={`Learn more: ${quest.docs.replace('https://', '')}`} />
                        {!isDone && quest.watch !== undefined && <Text dimColor>Done automatically when the mod sees it happen.</Text>}
                        {!isDone &&
                          quest.quiz?.map((question, i) => (
                            <Box key={`quiz-${quest.id}-${i}`} flexDirection="column">
                              <Text bold>{question.ask}</Text>
                              <Box gap={1} flexWrap="wrap">
                                {question.options.map((option, o) => (
                                  <Button
                                    key={`a-${quest.id}-${i}-${o}`}
                                    label={`${shown.answers[i] === o ? (o === question.answer ? '✓ ' : '✗ ') : ''}${option}`}
                                    onPress={() => void answer($, quest, i, o)}
                                  />
                                ))}
                              </Box>
                            </Box>
                          ))}
                        {shown.note !== '' && <Text color="warning">{shown.note}</Text>}
                        {!isDone && <Button key={`done-${quest.id}`} label="I did it" onPress={() => void markDone($, quest)} />}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Box>
          ))}
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
        <Box flexDirection="column">
          {BADGES.map(badge => (
            <Text key={`b-${badge.id}`} color={earned.includes(badge.id) ? 'warning' : undefined} dimColor={!earned.includes(badge.id)}>
              {`${earned.includes(badge.id) ? '★' : '☆'} ${badge.name}: ${badge.why}`}
            </Text>
          ))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>{`Level ${level} · ${xp} XP · ${current.done.length}/${QUESTS.length} quests · ${earned.length} badges`}</Text>
          <Text color="warning">{`${bar} ${size - into} XP to level ${level + 1}`}</Text>
        </Box>
        {tabs}
        {body}
      </Box>
    )
  })
}
