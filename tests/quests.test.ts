import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cardHtml } from '../hooks/card'
import {
  addDays,
  badgesOf,
  bankItem,
  bossFor,
  completedBy,
  dayOf,
  docsPages,
  dueToday,
  emptyProgress,
  isAtLeast,
  isUserFacing,
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
  trackOfPage,
  weekOf,
  withStreak,
  xpOf,
  BADGES,
  QUESTS,
} from '../hooks/quests'
import type { BankItem } from '../hooks/quests'

const CHANGELOG = `# Changelog

## 2.1.293

- Added Claude Haiku 5.5 as the default Haiku model
- Added \`agentType\` to the \`subagentStatusLine\` payload
- Added \`isDeferred\` to \`$.tool.register\` for mods
- Added \`CLAUDE_CODE_RETRY_BASE_DELAY_MS\` environment variable
- Fixed a memory leak in HTTP MCP connections

## 2.1.292

- Fixed the footer's agents count
- Added a /branch command to fork a conversation
`

const DOCS_INDEX = `# Claude Code Docs

- [Overview](https://code.claude.com/docs/en/overview.md): Claude Code is an agentic coding tool.
- [Checkpointing](https://code.claude.com/docs/en/checkpointing.md): Track, rewind, and summarize Claude's edits.
- [Hooks guide](https://code.claude.com/docs/en/hooks-guide.md): Run shell commands automatically.
- [Worktrees](https://code.claude.com/docs/en/worktrees.md): Run parallel sessions.
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview.md): Build agents.
- [Agent SDK hosting](https://code.claude.com/docs/en/agent-sdk/hosting.md): Host agents.
- [Amazon Bedrock](https://code.claude.com/docs/en/amazon-bedrock.md): Use Bedrock.
`

const PAGE = '# A page\n\nRun /rewind, or press Esc twice when the prompt input is empty, to open the rewind menu.'

const QUIZ = JSON.stringify({
  summary: 'Checkpoints let you undo what Claude changed.',
  questions: [
    { ask: 'How do you open the rewind menu?', options: ['Esc twice', 'Ctrl+Z', 'F5'], answer: 0 },
    { ask: 'Which command also opens it?', options: ['/undo-all', '/rewind', '/back'], answer: 1 },
    { ask: 'Are bash changes tracked?', options: ['Yes', 'No', 'Sometimes'], answer: 1 },
  ],
})

const HOME = '/Users/test'
// Noon on Wednesday 7 October 2026, local time.
const NOW = new Date(2026, 9, 7, 12).getTime()
const DAY = '2026-10-07'

const item = (n: number, path: string, box = 0, due = DAY): BankItem => ({
  id: `${path}:${n}`,
  ask: `Question ${n}?`,
  options: ['right', 'wrong', 'also wrong'],
  answer: 0,
  path,
  title: path,
  url: `https://code.claude.com/docs/en/${path}`,
  box,
  due,
})

describe('the course', () => {
  test('30 quests in 6 levels, each with a docs link and a way to finish', () => {
    const ids = QUESTS.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(QUESTS.length).toBe(30)
    for (const level of [1, 2, 3, 4, 5, 6]) expect(QUESTS.filter(q => q.level === level)).toHaveLength(5)
    for (const quest of QUESTS) {
      expect(quest.docs).toStartWith('https://code.claude.com/docs/en/')
      expect(quest.watch !== undefined || quest.quiz !== undefined).toBe(true)
      for (const q of quest.quiz ?? []) expect(q.options[q.answer]).toBeDefined()
    }
    // The Scholar badge's goal is the number of quests with a quiz.
    expect(BADGES.find(b => b.id === 'scholar')?.goal).toBe(QUESTS.filter(q => q.quiz !== undefined).length)
  })

  test('events complete the right quests, slash commands included', () => {
    const none = emptyProgress()
    const ids = (e: Parameters<typeof completedBy>[0]) => completedBy(e, none).map(q => q.id)
    expect(ids({ kind: 'prompt', text: 'explain @src/app.ts please' })).toEqual(['ask', 'mention'])
    expect(ids({ kind: 'prompt', text: 'mail me at a@b.com' })).toEqual(['ask'])
    expect(ids({ kind: 'tool', tool: 'Grep' })).toEqual(['explore'])
    expect(ids({ kind: 'tool', tool: 'mcp__linear__list_issues' })).toEqual(['mcp'])
    expect(ids({ kind: 'tool', tool: 'EnterWorktree' })).toEqual(['worktree'])
    expect(ids({ kind: 'command', name: 'model' })).toEqual(['model'])
    expect(ids({ kind: 'command', name: 'cost' })).toEqual(['usage'])
    expect(ids({ kind: 'command', name: 'bg' })).toEqual(['background'])
    expect(ids({ kind: 'command', name: 'security-review' })).toEqual(['security'])
    expect(ids({ kind: 'settings', key: 'statusLine' })).toEqual(['statusline'])
    expect(ids({ kind: 'file', path: '.claude/agents' })).toEqual(['own-agent'])
    expect(ids({ kind: 'command', name: 'help' })).toEqual([])
    expect(completedBy({ kind: 'subagent' }, { ...none, done: ['subagent'] })).toEqual([])
  })

  test('the next quest follows your track, then the rest, passed-over ones last', () => {
    const none = emptyProgress()
    expect(nextQuest(none)?.id).toBe('ask')
    expect(nextQuest({ ...none, track: 'advanced' })?.id).toBe('subagent')
    expect(nextQuest({ ...none, track: 'pro' })?.id).toBe('own-agent')
    expect(nextQuest(none, ['ask', 'mention'])?.id).toBe('explore')
    expect(nextQuest({ ...none, done: QUESTS.map(q => q.id) })).toBeUndefined()
  })

  test('levels get longer, with ranks; XP from everything', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, size: 50 })
    expect(levelOf(50)).toEqual({ level: 2, into: 0, size: 100 })
    expect(levelOf(149).level).toBe(2)
    expect(levelOf(150).level).toBe(3)
    expect(levelOf(9500).level).toBe(20)
    expect([1, 5, 10, 20, 35].map(rankOf)).toEqual(['Apprentice', 'Builder', 'Expert', 'Master', 'Legend'])
    const p = { ...emptyProgress(), done: ['ask', 'plan'], tried: ['a'], daily: ['x'], reviews: 4, bosses: 1, bonus: 10 }
    expect(xpOf(p)).toBe(10 + 20 + 15 + 25 + 4 * 5 + 100 + 10)
    const level1 = QUESTS.filter(q => q.level === 1).map(q => q.id)
    expect(badgesOf({ ...emptyProgress(), done: level1, tried: ['a', 'b', 'c'] }).map(b => b.id)).toEqual(['first-steps', 'early-adopter'])
    expect(badgesOf({ ...emptyProgress(), bestStreak: 30, mastered: 12, bosses: 1 }).map(b => b.id)).toEqual([
      'on-fire',
      'unstoppable',
      'sharp-memory',
      'boss-slayer',
    ])
  })

  test('streaks: days in a row with XP, and the best one kept', () => {
    const p1 = withStreak(emptyProgress(), DAY)
    expect([p1.streak, p1.bestStreak, p1.lastDay]).toEqual([1, 1, DAY])
    expect(withStreak(p1, DAY)).toBe(p1)
    const p2 = withStreak(p1, '2026-10-08')
    expect([p2.streak, p2.bestStreak]).toEqual([2, 2])
    const p3 = withStreak(p2, '2026-10-10')
    expect([p3.streak, p3.bestStreak]).toEqual([1, 2])
    expect(streakOn(p2, '2026-10-09')).toBe(2)
    expect(streakOn(p2, '2026-10-10')).toBe(0)
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(dayOf(NOW)).toBe(DAY)
    expect([weekOf('2026-10-05'), weekOf('2026-10-11'), weekOf('2026-10-12')]).toEqual(['2026-W41', '2026-W41', '2026-W42'])
  })

  test('spaced review: right answers push a question out, a miss brings it back tomorrow', () => {
    const fresh = bankItem({ ask: 'Q?', options: ['a', 'b'], answer: 0 }, { path: 'p', title: 'P', url: 'u' }, true, DAY)
    expect([fresh.box, fresh.due]).toEqual([1, addDays(DAY, 3)])
    const missed = bankItem({ ask: 'Q?', options: ['a', 'b'], answer: 0 }, { path: 'p', title: 'P', url: 'u' }, false, DAY)
    expect([missed.box, missed.due]).toEqual([0, addDays(DAY, 1)])
    let it = fresh
    const days: number[] = []
    for (let i = 0; i < 6; i++) {
      it = schedule(it, true, DAY)
      days.push(Math.round((new Date(`${it.due}T12:00`).getTime() - new Date(`${DAY}T12:00`).getTime()) / 864e5))
    }
    expect(days).toEqual([7, 14, 30, 60, 120, 120])
    expect(schedule(it, false, DAY).box).toBe(0)
    const bank = [item(1, 'a', 0, '2026-10-01'), item(2, 'b', 4, '2026-10-20'), item(3, 'c', 2, DAY), item(4, 'd', 5, '2026-11-01')]
    expect(dueToday(bank, DAY).map(i => i.id)).toEqual(['a:1', 'c:3'])
    expect(dueToday(bank, DAY, 1)).toHaveLength(1)
    expect(masteredIn(bank)).toBe(2)
  })

  test('the weekly boss: 5 questions from different pages, the same all week', () => {
    expect(bossFor([item(1, 'a'), item(2, 'b')], '2026-W41')).toBeUndefined()
    const bank = ['a', 'b', 'c', 'd'].flatMap((path, i) => [item(i * 3, path), item(i * 3 + 1, path), item(i * 3 + 2, path)])
    const boss = bossFor(bank, '2026-W41')
    expect(boss).toHaveLength(5)
    expect(new Set(boss?.slice(0, 4).map(i => i.path)).size).toBe(4)
    expect(bossFor(bank, '2026-W41')).toEqual(boss)
  })

  test('new features: the user-facing Added lines of the newest versions', () => {
    expect(newFeatures(CHANGELOG).map(f => [f.version, f.text])).toEqual([
      ['2.1.293', 'Added Claude Haiku 5.5 as the default Haiku model'],
      ['2.1.292', 'Added a /branch command to fork a conversation'],
    ])
    expect(isUserFacing('Added `effort` to the Agent tool')).toBe(true)
    expect(isUserFacing("Added `agentId` to a mod's `tool.check` hook")).toBe(false)
    expect([isAtLeast('2.1.293', '2.1.292'), isAtLeast('2.1.292', '2.1.293'), isAtLeast('2.2.0', '2.1.300')]).toEqual([true, false, true])
  })

  test('docs pages by track, one a day from yours, quizzes checked and shuffled', () => {
    const pages = docsPages(DOCS_INDEX)
    expect(pages.map(p => [p.path, p.track])).toEqual([
      ['overview', 'beginner'],
      ['checkpointing', 'beginner'],
      ['hooks-guide', 'advanced'],
      ['worktrees', 'pro'],
      ['agent-sdk/overview', 'pro'],
    ])
    expect(trackOfPage('settings')).toBe('advanced')
    expect(pickDaily(pages, [], DAY, 'pro')?.track).toBe('pro')
    expect(pickDaily(pages, [], DAY, 'advanced')?.path).toBe('hooks-guide')
    // Your track's pages all done: another track's.
    expect(pickDaily(pages, ['hooks-guide'], DAY, 'advanced')).toBeDefined()
    expect(pickDaily(pages, [], DAY, 'beginner')).toEqual(pickDaily(pages, [], DAY, 'beginner'))

    expect(quizSystem('beginner')).toContain('exactly 3 questions')
    expect(quizSystem('pro')).toContain('exactly 4 questions')
    expect(quizSystem('pro')).toContain('scenario')
    const quiz = parseQuiz(`Here you go: ${QUIZ}`)
    expect(quiz?.questions.map(q => q.options[q.answer])).toEqual(['Esc twice', '/rewind', 'No'])
    expect(parseQuiz('{"summary": "x", "questions": [{"ask": "q", "options": ["a"], "answer": 0}]}')).toBeUndefined()
    expect(parseQuiz('no json')).toBeUndefined()
  })

  test('the card page carries the numbers', () => {
    const html = cardHtml({ xp: 1200, rank: 'Builder', done: 9, total: 30, daily: 2, tried: 1, mastered: 7, streak: 4, badges: ['first-steps'], date: DAY })
    expect(html).toContain('"level":7')
    expect(html).toContain('"rank":"Builder"')
    expect(html).toContain('"mastered":7')
    expect(html).toContain('Download PNG')
  })
})

const PANE = {
  plugin: 'quests',
  component: 'Pane',
  requestId: 'quests',
  props: {
    title: 'Quests',
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const start = { cwd: '/work', surface: 'terminal', isInteractive: true } as const

function fakeHost(on: On, store: Record<string, unknown> = {}) {
  const toasts: string[] = []
  const written: { path: string; text: string }[] = []
  const spawned: string[][] = []
  const fetched: string[] = []
  const asked: string[] = []
  mock.env(on, { HOME, TMPDIR: '/tmp/' })
  mock.store(on, store)
  const clock = mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('http.fetch', ($, e) => {
    fetched.push(e.url)
    const text = e.url.endsWith('llms.txt') ? DOCS_INDEX : e.url.endsWith('.md') && e.url.includes('/docs/') ? PAGE : CHANGELOG
    return { value: { status: 200, ok: true, headers: {}, text } }
  })
  on('session.version', () => ({ value: { version: '2.1.292' } }))
  on('fs.exists', ($, e) => ({ value: e.path.endsWith('/CLAUDE.md') }))
  on('settings.read', () => ({ value: { permissions: { allow: ['Bash(npm test)'] } } }))
  on('fs.write', ($, e) => {
    written.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('process.spawn', async function* ($, e) {
    spawned.push([...e.argv])
    yield* []
    return { value: { code: 0, signal: null } }
  })
  on('model.complete', ($, e) => {
    const system = typeof e.system === 'string' ? e.system : ''
    asked.push(system.includes('quiz') ? `quiz:${system.includes('exactly 4') ? 4 : 3}` : 'explain')
    const text = system.includes('quiz') ? QUIZ : 'It is a faster model. Try it: run /model.'
    return { value: { isAnswered: true as const, text, usage: {} as never } }
  })
  on('turn.complete', () => ({ text: 'done' }))
  return { toasts, written, spawned, fetched, asked, clock }
}

const runQuests = (args = '') => ({
  command: 'quests',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: true, columns: 120 },
})

describe('the mod', () => {
  test('choose a track, the next quest, a quiz one question at a time, new features, the card', { timeoutMs: 20000 }, async ($, on) => {
    const host = fakeHost(on)
    await $.session.start(start)
    // The project has a CLAUDE.md and an allow rule: those quests are done at once.
    expect(host.toasts.some(t => t.includes('Give Claude a memory'))).toBe(true)
    expect(host.toasts.some(t => t.includes('Stop answering the same question'))).toBe(true)

    expect((await $.command.run(runQuests())).text).toContain('Apprentice · Level 2')
    await host.clock.settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Apprentice · Level 2 · 50 XP · 🔥 1-day streak/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Choose your track' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Next quest · Ask Claude about your project/ })).toBeDefined()

    // Advanced: the next quest moves to its levels, and the chooser goes away.
    await ui.press({ key: 'track-advanced' })
    expect(await ui.find({ type: 'Text', text: 'Choose your track' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Next quest · Hand a big job to a subagent/ })).toBeDefined()
    await ui.press({ key: 'skip' })
    expect(await ui.find({ type: 'Text', text: /Next quest · Use a skill/ })).toBeDefined()

    // A level's list picks a quest; its quiz goes one question at a time.
    await ui.press({ key: 'lvl-2' })
    await ui.press({ key: 'q-rewind' })
    expect(await ui.find({ type: 'Text', text: /Or answer 1\/2/ })).toBeDefined()
    await ui.press({ key: 'a-rewind-0-2' })
    expect(await ui.find({ type: 'Text', text: /Not quite/ })).toBeDefined()
    await ui.press({ key: 'a-rewind-0-0' })
    await ui.press({ key: 'a-rewind-1-1' })
    expect(host.toasts.some(t => t.includes('Undo with rewind'))).toBe(true)

    // The New tab: user-facing features only, one explained, one tried.
    await ui.press({ key: 'tab-new' })
    expect(await ui.find({ type: 'Text', text: /Added a \/branch command/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /isDeferred/ })).toBeUndefined()
    const explain = (await ui.findAll({ type: 'Button' })).find(b => b.props.label === 'Explain')
    await ui.press({ key: String(explain?.key) })
    expect(await ui.find({ type: 'Text', text: /Try it: run \/model/ })).toBeDefined()
    const branch = (await ui.findAll({ type: 'Button' })).find(b => String(b.props.label).startsWith('I tried it'))
    await ui.press({ key: String(branch?.key) })
    expect(host.toasts.some(t => t.includes('New feature tried'))).toBe(true)

    // Me: the track, the memory, badges with counts.
    await ui.press({ key: 'tab-me' })
    expect(await ui.find({ type: 'Text', text: 'Track: Advanced' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Early Adopter · Tried 3 new features · 1\/3/ })).toBeDefined()

    await ui.press({ key: 'card' })
    expect(host.written[0]?.text).toContain('"rank":"Apprentice"')
    expect(host.spawned[0]).toEqual(['open', '/tmp/claude-quests-card.html'])
    await ui.unmount()
  })

  test('the daily quest at your track\'s level fills your memory bank, and a miss comes back as a review', { timeoutMs: 20000 }, async ($, on) => {
    const host = fakeHost(on, { progress: { ...emptyProgress(), track: 'pro' } })
    await $.session.start(start)
    await host.clock.settle()
    await $.command.run(runQuests())
    await host.clock.settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /📅 Daily · (Worktrees|Agent SDK overview) · Pro · \+50 XP/ })).toBeDefined()
    expect(host.asked).toEqual([])

    await ui.press({ key: 'daily-start' })
    expect(host.asked).toEqual(['quiz:4'])
    const pick = async (label: string) => {
      const button = (await ui.findAll({ type: 'Button' })).find(b => String(b.props.label).endsWith(`) ${label}`))
      await ui.press({ key: String(button?.key) })
    }
    await pick('Ctrl+Z') // a miss on the first question
    await pick('Esc twice')
    await pick('/rewind')
    await pick('No')
    expect(host.toasts.some(t => t.startsWith('📅 Daily quest done') && t.includes('+50 XP') && t.includes('3 questions saved'))).toBe(true)

    // Tomorrow, the missed question is due.
    await host.clock.advance(24 * 60 * 60 * 1000)
    await $.command.run(runQuests())
    await host.clock.settle()
    expect(await ui.find({ type: 'Text', text: /🔁 Review · 1 left today/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /How do you open the rewind menu\?/ })).toBeDefined()
    await pick('Esc twice')
    expect(host.toasts.some(t => t.startsWith('🔁 Remembered'))).toBe(true)
    expect(await ui.find({ type: 'Text', text: /Back in 3 days/ })).toBeDefined()
    await ui.unmount()
  })

  test('the weekly boss: 5 questions, one mistake allowed', { timeoutMs: 20000 }, async ($, on) => {
    const later = '2026-12-01'
    const bank = ['a', 'b', 'c', 'd'].flatMap((path, i) => [item(i * 3, path, 3, later), item(i * 3 + 1, path, 3, later), item(i * 3 + 2, path, 3, later)])
    const host = fakeHost(on, { bank, progress: { ...emptyProgress(), track: 'advanced' } })
    await $.session.start(start)
    await $.command.run(runQuests())
    await host.clock.settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /⚔️ Weekly boss · 5 questions, 1 mistake allowed/ })).toBeDefined()
    await ui.press({ key: 'boss-start' })
    const answerWith = async (label: string) => {
      const buttons = (await ui.findAll({ type: 'Button' })).filter(b => String(b.props.key).startsWith('b-'))
      const button = buttons.find(b => String(b.props.label).endsWith(`) ${label}`))
      await ui.press({ key: String(button?.key) })
    }
    await answerWith('wrong')
    expect(await ui.find({ type: 'Text', text: /One more mistake and it wins/ })).toBeDefined()
    for (let i = 0; i < 4; i++) await answerWith('right')
    expect(host.toasts.some(t => t.startsWith('⚔️ Weekly boss beaten') && t.includes('Badge: Boss Slayer'))).toBe(true)
    expect(await ui.find({ type: 'Text', text: /Weekly boss · beaten ✓/ })).toBeDefined()
    await ui.unmount()
  })

  test('slash commands, prompts and Claude\'s tools complete quests by themselves', { timeoutMs: 20000 }, async ($, on) => {
    const host = fakeHost(on)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('tool.call', () => ({ result: { content: 'found it' }, text: 'found it', isReadOnly: true }) as never)
    on('command.run', () => ({ text: 'ok' }))
    await $.session.start(start)
    await $.prompt.submit({ text: 'explain @src/app.ts' } as never)
    await $.tool.call({ tool: 'Grep', input: { pattern: 'login' } } as never)
    await $.command.run({ command: 'model', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } })
    const titles = host.toasts.filter(t => t.startsWith('🏆')).join(' | ')
    expect(titles).toContain('Ask Claude about your project')
    expect(titles).toContain('Point at a file with @')
    expect(titles).toContain('Let Claude explore your code')
    expect(titles).toContain('Pick the right model')
  })

  test('a tool the permission check refused completes nothing', { timeoutMs: 20000 }, async ($, on) => {
    const host = fakeHost(on)
    on('tool.call', () => ({ deny: 'WebSearch was not allowed' }))
    await $.session.start(start)
    await $.tool.call({ tool: 'WebSearch', input: { query: 'claude code docs' } } as never)
    expect(host.toasts.some(t => t.includes('Let Claude look something up'))).toBe(false)
  })
})
