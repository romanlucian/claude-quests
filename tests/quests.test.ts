import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cardHtml } from '../hooks/card'
import { badgesOf, completedBy, emptyProgress, isAtLeast, levelOf, newFeatures, xpOf, QUESTS } from '../hooks/quests'

const CHANGELOG = `# Changelog

## 2.1.293

- Added Claude Haiku 5.5 as the default Haiku model
- Added \`agentType\` to the \`subagentStatusLine\` payload
- Fixed a memory leak in HTTP MCP connections

## 2.1.292

- Fixed the footer's agents count
- Added a /branch command to fork a conversation
`

const HOME = '/Users/test'

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

  test('XP, levels and badges', () => {
    const level1 = QUESTS.filter(q => q.level === 1).map(q => q.id)
    const progress = { done: level1, tried: ['a', 'b', 'c'], quizzes: [] }
    expect(xpOf(progress)).toBe(5 * 10 + 3 * 15)
    expect(levelOf(95)).toEqual({ level: 2, into: 45, size: 50 })
    expect(badgesOf(progress).map(b => b.id)).toEqual(['first-steps', 'early-adopter'])
    const all = { done: QUESTS.map(q => q.id), tried: [], quizzes: [] }
    expect(levelOf(xpOf(all)).level).toBe(7)
  })

  test('new features: the Added lines of the newest versions', () => {
    const features = newFeatures(CHANGELOG)
    expect(features.map(f => [f.version, f.text])).toEqual([
      ['2.1.293', 'Added Claude Haiku 5.5 as the default Haiku model'],
      ['2.1.293', 'Added `agentType` to the `subagentStatusLine` payload'],
      ['2.1.292', 'Added a /branch command to fork a conversation'],
    ])
    expect(new Set(features.map(f => f.key)).size).toBe(3)
    expect(newFeatures(CHANGELOG, 1)).toHaveLength(1)
    expect([isAtLeast('2.1.293', '2.1.292'), isAtLeast('2.1.292', '2.1.293'), isAtLeast('2.2.0', '2.1.300')]).toEqual([true, false, true])
  })

  test('the card page carries the numbers', () => {
    const html = cardHtml({ xp: 120, done: 9, total: 23, badges: ['first-steps'], date: '2026-10-07' })
    expect(html).toContain('"level":3')
    expect(html).toContain('"done":9,"total":23')
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
  mock.env(on, { HOME, TMPDIR: '/tmp/' })
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 7) })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: CHANGELOG } }))
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
  on('model.complete', () => ({
    value: { isAnswered: true as const, text: 'It is a faster model. Try it: run /model.', usage: {} as never },
  }))
  on('turn.complete', () => ({ text: 'done' }))
  return { toasts, written, spawned }
}

describe('the mod', () => {
  test('completes quests from the session, explains new features, quizzes and shares a card', { timeoutMs: 20000 }, async ($, on) => {
    const host = fakeHost(on)
    await $.session.start(start)
    // The project has a CLAUDE.md and an allow rule: those quests are done at once.
    expect(host.toasts.some(t => t.includes('Give Claude a memory'))).toBe(true)
    expect(host.toasts.some(t => t.includes('Stop answering the same question'))).toBe(true)

    const answer = await $.command.run({ command: 'quests', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 120 } })
    expect(answer.text).toContain('quests')

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /Level 2 · 50 XP · 2\/15 quests/ })).toBeDefined()

    // A quiz: one wrong answer, then both right.
    await ui.press({ key: 'q-rewind' })
    expect(await ui.find({ type: 'Text', text: /Esc twice/ })).toBeDefined()
    await ui.press({ key: 'a-rewind-0-2' })
    expect(await ui.find({ type: 'Text', text: /Not quite/ })).toBeDefined()
    await ui.press({ key: 'a-rewind-0-0' })
    await ui.press({ key: 'a-rewind-1-1' })
    expect(host.toasts.some(t => t.includes('Undo with rewind'))).toBe(true)

    // The New tab: features from the changelog, one explained, one tried.
    await ui.press({ key: 'tab-new' })
    expect(await ui.find({ type: 'Text', text: /Added a \/branch command/ })).toBeDefined()
    const branch = (await ui.findAll({ type: 'Button' })).find(b => String(b.props.label).startsWith('I tried it'))
    expect(branch).toBeDefined()
    // 2.1.293 is newer than this Claude Code (2.1.292): those say to update.
    expect(await ui.find({ type: 'Text', text: /Update Claude Code \(you have 2\.1\.292\)/ })).toBeDefined()
    const explain = (await ui.findAll({ type: 'Button' })).find(b => b.props.label === 'Explain')
    await ui.press({ key: String(explain?.key) })
    expect(await ui.find({ type: 'Text', text: /Try it: run \/model/ })).toBeDefined()
    await ui.press({ key: String(branch?.key) })
    expect(host.toasts.some(t => t.includes('New feature tried'))).toBe(true)

    // The card: written and opened in the browser.
    await ui.press({ key: 'card' })
    expect(host.written[0]?.path).toBe('/tmp/claude-quests-card.html')
    expect(host.written[0]?.text).toContain('"done":4')
    expect(host.spawned[0]).toEqual(['open', '/tmp/claude-quests-card.html'])
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
})
