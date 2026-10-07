import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cardHtml } from '../hooks/card'
import {
  badgesOf,
  completedBy,
  dayOf,
  docsPages,
  emptyProgress,
  isAtLeast,
  isUserFacing,
  levelOf,
  newFeatures,
  nextQuest,
  parseQuiz,
  pickDaily,
  streakOn,
  withStreak,
  xpOf,
  QUESTS,
} from '../hooks/quests'

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
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview.md): Build agents.
- [Amazon Bedrock](https://code.claude.com/docs/en/amazon-bedrock.md): Use Bedrock.
`

const PAGE = '# Checkpointing\n\nRun /rewind, or press Esc twice when the prompt input is empty, to open the rewind menu.'

const QUIZ = JSON.stringify({
  summary: 'Checkpoints let you undo what Claude changed.',
  questions: [
    { ask: 'How do you open the rewind menu?', options: ['Esc twice', 'Ctrl+Z', 'F5'], answer: 0 },
    { ask: 'Which command also opens it?', options: ['/undo-all', '/rewind', '/back'], answer: 1 },
    { ask: 'Are bash changes tracked?', options: ['Yes', 'No', 'Sometimes'], answer: 1 },
  ],
})

const HOME = '/Users/test'
// Noon on 7 October 2026, local time.
const NOW = new Date(2026, 9, 7, 12).getTime()

describe('the course', () => {
  test('quests have unique ids, a docs link and a way to finish', () => {
    const ids = QUESTS.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(QUESTS.length).toBe(15)
    for (const quest of QUESTS) {
      expect(quest.docs).toStartWith('https://code.claude.com/docs/en/')
      expect(quest.watch !== undefined || quest.quiz !== undefined).toBe(true)
      for (const q of quest.quiz ?? []) expect(q.options[q.answer]).toBeDefined()
    }
  })

  test('events complete the right quests', () => {
    const none = emptyProgress()
    expect(completedBy({ kind: 'prompt', text: 'explain @src/app.ts please' }, none).map(q => q.id)).toEqual(['ask', 'mention'])
    expect(completedBy({ kind: 'prompt', text: 'mail me at a@b.com' }, none).map(q => q.id)).toEqual(['ask'])
    expect(completedBy({ kind: 'tool', tool: 'Grep' }, none).map(q => q.id)).toEqual(['explore'])
    expect(completedBy({ kind: 'tool', tool: 'mcp__linear__list_issues' }, none).map(q => q.id)).toEqual(['mcp'])
    expect(completedBy({ kind: 'tool', tool: 'ExitPlanMode' }, none).map(q => q.id)).toEqual(['plan'])
    expect(completedBy({ kind: 'subagent' }, none).map(q => q.id)).toEqual(['subagent'])
    expect(completedBy({ kind: 'file', path: 'CLAUDE.md' }, none).map(q => q.id)).toEqual(['memory'])
    // Done already: nothing again.
    expect(completedBy({ kind: 'subagent' }, { ...none, done: ['subagent'] })).toEqual([])
  })

  test('the next quest: in order, skipping the ones passed over', () => {
    const none = emptyProgress()
    expect(nextQuest(none)?.id).toBe('ask')
    expect(nextQuest({ ...none, done: ['ask'] })?.id).toBe('mention')
    expect(nextQuest(none, ['ask', 'mention'])?.id).toBe('explore')
    // Every open one skipped: back to the first.
    expect(nextQuest({ ...none, done: QUESTS.slice(1).map(q => q.id) }, ['ask'])?.id).toBe('ask')
    expect(nextQuest({ ...none, done: QUESTS.map(q => q.id) })).toBeUndefined()
  })

  test('XP, levels and badges', () => {
    const level1 = QUESTS.filter(q => q.level === 1).map(q => q.id)
    const progress = { ...emptyProgress(), done: level1, tried: ['a', 'b', 'c'], daily: ['x'] }
    expect(xpOf(progress)).toBe(5 * 10 + 3 * 15 + 25)
    expect(levelOf(95)).toEqual({ level: 2, into: 45, size: 50 })
    expect(badgesOf(progress).map(b => b.id)).toEqual(['first-steps', 'early-adopter'])
    expect(badgesOf({ ...progress, streak: 7 }).map(b => b.id)).toContain('on-fire')
    const all = { ...emptyProgress(), done: QUESTS.map(q => q.id) }
    expect(levelOf(xpOf(all)).level).toBe(7)
  })

  test('streaks: days in a row with XP', () => {
    const p0 = emptyProgress()
    const p1 = withStreak(p0, '2026-10-07')
    expect([p1.streak, p1.lastDay]).toEqual([1, '2026-10-07'])
    expect(withStreak(p1, '2026-10-07')).toBe(p1) // the same day: no change
    const p2 = withStreak(p1, '2026-10-08')
    expect(p2.streak).toBe(2)
    expect(withStreak(p2, '2026-10-10').streak).toBe(1) // a day missed: a new start
    expect(streakOn(p2, '2026-10-09')).toBe(2) // still alive the day after
    expect(streakOn(p2, '2026-10-10')).toBe(0) // gone after a missed day
    expect(withStreak({ ...p0, streak: 3, lastDay: '2026-02-28' }, '2026-03-01').streak).toBe(4) // across a month
    expect(dayOf(NOW)).toBe('2026-10-07')
  })

  test('new features: the user-facing Added lines of the newest versions', () => {
    const features = newFeatures(CHANGELOG)
    expect(features.map(f => [f.version, f.text])).toEqual([
      ['2.1.293', 'Added Claude Haiku 5.5 as the default Haiku model'],
      ['2.1.292', 'Added a /branch command to fork a conversation'],
    ])
    expect(isUserFacing('Added `effort` to the Agent tool')).toBe(true)
    expect(isUserFacing('Added `prompt.autocomplete`, an event a mod hooks to add rows')).toBe(false)
    expect(newFeatures(CHANGELOG, 1)).toHaveLength(1)
    expect([isAtLeast('2.1.293', '2.1.292'), isAtLeast('2.1.292', '2.1.293'), isAtLeast('2.2.0', '2.1.300')]).toEqual([true, false, true])
  })

  test('the daily quest: learning pages from the docs index, one a day, quizzes checked', () => {
    const pages = docsPages(DOCS_INDEX)
    expect(pages.map(p => p.path)).toEqual(['overview', 'checkpointing'])
    expect(pages[1]).toEqual({
      path: 'checkpointing',
      title: 'Checkpointing',
      about: "Track, rewind, and summarize Claude's edits.",
      url: 'https://code.claude.com/docs/en/checkpointing',
    })
    // The same page all day; a page not done yet first.
    const day = pickDaily(pages, [], '2026-10-07')
    expect(pickDaily(pages, [], '2026-10-07')).toEqual(day)
    expect(pickDaily(pages, ['overview'], '2026-10-07')?.path).toBe('checkpointing')
    expect(pickDaily([], [], '2026-10-07')).toBeUndefined()

    const quiz = parseQuiz(`Here you go: ${QUIZ}`)
    expect(quiz?.questions).toHaveLength(3)
    // Shuffled, the right answer still right.
    expect(quiz?.questions.map(q => q.options[q.answer])).toEqual(['Esc twice', '/rewind', 'No'])
    expect(parseQuiz('{"summary": "x", "questions": [{"ask": "q", "options": ["a"], "answer": 0}]}')).toBeUndefined()
    expect(parseQuiz('{"summary": "x", "questions": [{"ask": "q", "options": ["a", "b"], "answer": 2}]}')).toBeUndefined()
    expect(parseQuiz('no json')).toBeUndefined()
  })

  test('the card page carries the numbers', () => {
    const html = cardHtml({ xp: 120, done: 9, total: 15, daily: 2, tried: 1, streak: 4, badges: ['first-steps'], date: '2026-10-07' })
    expect(html).toContain('"level":3')
    expect(html).toContain('"done":9,"total":15,"daily":2,"tried":1,"streak":4')
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

function fakeHost(on: On) {
  const toasts: string[] = []
  const written: { path: string; text: string }[] = []
  const spawned: string[][] = []
  const fetched: string[] = []
  const asked: string[] = []
  mock.env(on, { HOME, TMPDIR: '/tmp/' })
  mock.store(on)
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
    asked.push(system.includes('quiz') ? 'quiz' : 'explain')
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
  test('the next quest, one quiz question at a time, the levels, new features and the card', { timeoutMs: 20000 }, async ($, on) => {
    const host = fakeHost(on)
    await $.session.start(start)
    // The project has a CLAUDE.md and an allow rule: those quests are done at once.
    expect(host.toasts.some(t => t.includes('Give Claude a memory'))).toBe(true)
    expect(host.toasts.some(t => t.includes('Stop answering the same question'))).toBe(true)

    expect((await $.command.run(runQuests())).text).toContain('quests')
    await host.clock.settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Level 2 · 50 XP · 🔥 1-day streak/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Next quest · Ask Claude about your project/ })).toBeDefined()

    // "Another one" moves to the next quest; a level's list picks one.
    await ui.press({ key: 'skip' })
    expect(await ui.find({ type: 'Text', text: /Next quest · Point at a file with @/ })).toBeDefined()
    await ui.press({ key: 'lvl-2' })
    await ui.press({ key: 'q-rewind' })
    expect(await ui.find({ type: 'Text', text: /Quest · Undo with rewind/ })).toBeDefined()

    // The quiz, one question at a time: a wrong answer, then both right.
    expect(await ui.find({ type: 'Text', text: /Or answer 1\/2/ })).toBeDefined()
    await ui.press({ key: 'a-rewind-0-2' })
    expect(await ui.find({ type: 'Text', text: /Not quite/ })).toBeDefined()
    await ui.press({ key: 'a-rewind-0-0' })
    expect(await ui.find({ type: 'Text', text: /Or answer 2\/2/ })).toBeDefined()
    await ui.press({ key: 'a-rewind-1-1' })
    expect(host.toasts.some(t => t.includes('Undo with rewind'))).toBe(true)

    // The New tab: user-facing features only, one explained, one tried.
    await ui.press({ key: 'tab-new' })
    expect(await ui.find({ type: 'Text', text: /Added a \/branch command/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /isDeferred/ })).toBeUndefined()
    // 2.1.293 is newer than this Claude Code (2.1.292): it says to update.
    expect(await ui.find({ type: 'Text', text: /Update Claude Code \(you have 2\.1\.292\)/ })).toBeDefined()
    const explain = (await ui.findAll({ type: 'Button' })).find(b => b.props.label === 'Explain')
    await ui.press({ key: String(explain?.key) })
    expect(await ui.find({ type: 'Text', text: /Try it: run \/model/ })).toBeDefined()
    const branch = (await ui.findAll({ type: 'Button' })).find(b => String(b.props.label).startsWith('I tried it'))
    await ui.press({ key: String(branch?.key) })
    expect(host.toasts.some(t => t.includes('New feature tried'))).toBe(true)

    // Badges show how far each one is.
    await ui.press({ key: 'tab-badges' })
    expect(await ui.find({ type: 'Text', text: /Early Adopter · Tried 3 new features · 1\/3/ })).toBeDefined()

    // The card: written and opened in the browser.
    await ui.press({ key: 'card' })
    expect(host.written[0]?.path).toBe('/tmp/claude-quests-card.html')
    expect(host.written[0]?.text).toContain('"done":3,"total":15')
    expect(host.spawned[0]).toEqual(['open', '/tmp/claude-quests-card.html'])
    await ui.unmount()
  })

  test('the daily docs quest: a page a day, a quiz from it, XP and the streak', { timeoutMs: 20000 }, async ($, on) => {
    const host = fakeHost(on)
    await $.session.start(start)
    await host.clock.settle()
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    const title = await ui.find({ type: 'Text', text: /📅 Daily · / })
    expect(title).toBeDefined()
    // Nothing is asked of Claude until you start it.
    expect(host.asked).toEqual([])

    await ui.press({ key: 'daily-start' })
    expect(host.asked).toEqual(['quiz'])
    expect(host.fetched.some(url => /\/docs\/en\/(overview|checkpointing)\.md$/.test(url))).toBe(true)
    expect(await ui.find({ type: 'Text', text: /Checkpoints let you undo/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1\/3 · How do you open the rewind menu/ })).toBeDefined()
    // The options are shuffled: press by label.
    const pick = async (label: string) => {
      const button = (await ui.findAll({ type: 'Button' })).find(b => String(b.props.label).endsWith(`) ${label}`))
      await ui.press({ key: String(button?.key) })
    }
    await pick('Ctrl+Z')
    expect(await ui.find({ type: 'Text', text: /Not quite/ })).toBeDefined()
    await pick('Esc twice')
    await pick('/rewind')
    await pick('No')
    expect(host.toasts.some(t => t.startsWith('📅 Daily quest done') && t.includes('+25 XP'))).toBe(true)
    expect(await ui.find({ type: 'Text', text: /✓ done/ })).toBeDefined()
    await ui.unmount()
  })

  test('your prompts and Claude\'s tools complete quests by themselves', { timeoutMs: 20000 }, async ($, on) => {
    const host = fakeHost(on)
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('tool.call', () => ({ result: { content: 'found it' }, text: 'found it', isReadOnly: true }) as never)
    await $.session.start(start)
    await $.prompt.submit({ text: 'explain @src/app.ts' } as never)
    await $.tool.call({ tool: 'Grep', input: { pattern: 'login' } } as never)
    const titles = host.toasts.filter(t => t.startsWith('🏆')).join(' | ')
    expect(titles).toContain('Ask Claude about your project')
    expect(titles).toContain('Point at a file with @')
    expect(titles).toContain('Let Claude explore your code')
  })

  test('a tool the permission check refused completes nothing', { timeoutMs: 20000 }, async ($, on) => {
    const host = fakeHost(on)
    on('tool.call', () => ({ deny: 'WebSearch was not allowed' }))
    await $.session.start(start)
    await $.tool.call({ tool: 'WebSearch', input: { query: 'claude code docs' } } as never)
    expect(host.toasts.some(t => t.includes('Let Claude look something up'))).toBe(false)
  })
})
