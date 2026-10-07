// The course: quests, their quizzes, badges and levels, and reading new
// features out of the changelog. Plain data and pure functions, no `$`, so
// the tests call them directly.
//
// Every fact here comes from the official docs at code.claude.com/docs; each
// quest links its page. Claude Code changes fast: keep quests short and
// point at the docs for the details.

export const DOCS = 'https://code.claude.com/docs/en'
export const CHANGELOG_URL = 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md'
export const WHATS_NEW_URL = `${DOCS}/whats-new/index`
export const DOCS_INDEX_URL = 'https://code.claude.com/docs/llms.txt'

/** What the mod watches for a quest to complete it by itself. */
export type Watch =
  | { kind: 'prompt'; pattern?: RegExp } // a prompt you send (matching the pattern)
  | { kind: 'tool'; tools?: readonly string[]; prefix?: string } // a tool Claude uses
  | { kind: 'subagent' } // Claude starts a subagent
  | { kind: 'skill' } // a skill runs
  | { kind: 'compact' } // the conversation is compacted
  | { kind: 'file'; path: string } // a file exists in the project
  | { kind: 'settings'; key: 'hooks' | 'allow' } // your settings have hooks / allow rules

export type Question = { ask: string; options: readonly string[]; answer: number }

export type Quest = {
  id: string
  level: 1 | 2 | 3
  title: string
  /** Why it matters, in a sentence. */
  why: string
  /** What to do. */
  how: string
  docs: string
  watch?: Watch
  /** Answering these right completes the quest too. */
  quiz?: readonly Question[]
}

export const LEVEL_NAMES = { 1: 'First steps', 2: 'Getting faster', 3: 'Pro moves' } as const
export const QUEST_XP = { 1: 10, 2: 20, 3: 30 } as const
/** XP for trying a feature from the New tab. */
export const NEW_XP = 15
/** XP for the daily docs quest. */
export const DAILY_XP = 25

export const QUESTS: readonly Quest[] = [
  {
    id: 'ask',
    level: 1,
    title: 'Ask Claude about your project',
    why: 'Claude reads your code to answer, so asking is the fastest way into a codebase.',
    how: 'Ask something like: "What does this project do, and where does it start?"',
    docs: `${DOCS}/quickstart`,
    watch: { kind: 'prompt' },
  },
  {
    id: 'mention',
    level: 1,
    title: 'Point at a file with @',
    why: 'An @ mention puts that exact file in front of Claude, so it does not have to search.',
    how: 'Type @ and pick a file in your prompt, for example: "explain @src/app.ts".',
    docs: `${DOCS}/common-workflows`,
    watch: { kind: 'prompt', pattern: /(^|\s)@[\w./~-]/ },
  },
  {
    id: 'explore',
    level: 1,
    title: 'Let Claude explore your code',
    why: 'Claude searches and reads files itself; you do not need to paste code in.',
    how: 'Ask: "Find where we handle login" and watch it search.',
    docs: `${DOCS}/how-claude-code-works`,
    watch: { kind: 'tool', tools: ['Read', 'Grep', 'Glob'] },
  },
  {
    id: 'edit',
    level: 1,
    title: 'Let Claude change a file',
    why: 'Claude edits files directly and shows you each change.',
    how: 'Ask for a small change, like: "Add a comment explaining this function."',
    docs: `${DOCS}/quickstart`,
    watch: { kind: 'tool', tools: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] },
  },
  {
    id: 'run',
    level: 1,
    title: 'Let Claude run a command',
    why: 'Claude can run your tests and builds, read the errors and fix them.',
    how: 'Ask: "Run the tests and fix anything that fails."',
    docs: `${DOCS}/common-workflows`,
    watch: { kind: 'tool', tools: ['Bash', 'PowerShell'] },
  },
  {
    id: 'plan',
    level: 2,
    title: 'Plan before coding',
    why: 'In plan mode Claude explores and proposes a plan, and changes nothing until you approve.',
    how: 'Press Shift+Tab until the status bar says "plan mode on", then describe a bigger change.',
    docs: `${DOCS}/permission-modes`,
    watch: { kind: 'tool', tools: ['ExitPlanMode'] },
  },
  {
    id: 'memory',
    level: 2,
    title: 'Give Claude a memory: CLAUDE.md',
    why: 'CLAUDE.md is read at the start of every session: your commands, style and rules, once.',
    how: 'Run /init in your project, then read and edit the CLAUDE.md it writes.',
    docs: `${DOCS}/memory`,
    watch: { kind: 'file', path: 'CLAUDE.md' },
  },
  {
    id: 'context',
    level: 2,
    title: 'Keep the context fresh',
    why: 'A long conversation fills the context window; summarizing it keeps Claude sharp.',
    how: 'Run /compact in a long session, or answer the two questions.',
    docs: `${DOCS}/context-window`,
    watch: { kind: 'compact' },
    quiz: [
      {
        ask: 'What does /compact do?',
        options: ['Deletes the conversation', 'Summarizes the conversation so far to free up context', 'Makes answers shorter'],
        answer: 1,
      },
      {
        ask: 'And /clear?',
        options: ['Same as /compact', 'Starts a new conversation with empty context', 'Undoes the last change'],
        answer: 1,
      },
    ],
  },
  {
    id: 'rewind',
    level: 2,
    title: 'Undo with rewind',
    why: 'Claude Code saves a checkpoint before each prompt, so a bad change is easy to undo.',
    how: 'Press Esc twice with an empty prompt (or run /rewind) and pick a point to go back to.',
    docs: `${DOCS}/checkpointing`,
    quiz: [
      {
        ask: "You don't like what Claude just changed. What's the quickest way back?",
        options: ['Esc twice (or /rewind), then pick an earlier point', 'Edits are permanent', 'Close the terminal'],
        answer: 0,
      },
      {
        ask: 'Which changes can rewind NOT undo?',
        options: ["Edits made by Claude's file tools", 'Files changed by shell commands (rm, mv…)', 'None: it undoes everything'],
        answer: 1,
      },
    ],
  },
  {
    id: 'web',
    level: 2,
    title: 'Let Claude look something up',
    why: 'Claude can search the web and read docs pages, so its answers can be current.',
    how: 'Ask: "Look up the latest docs for <a library you use> and summarize what changed."',
    docs: `${DOCS}/tools-reference`,
    watch: { kind: 'tool', tools: ['WebSearch', 'WebFetch'] },
  },
  {
    id: 'subagent',
    level: 3,
    title: 'Hand a big job to a subagent',
    why: 'A subagent works in its own context and returns a summary, keeping your conversation clean.',
    how: 'Ask: "Use a subagent to find every place we call the payments API."',
    docs: `${DOCS}/sub-agents`,
    watch: { kind: 'subagent' },
  },
  {
    id: 'skill',
    level: 3,
    title: 'Use a skill',
    why: 'Skills are packaged instructions Claude loads when needed, or you run as /name.',
    how: 'Type / to see the skills you have and run one, or ask Claude to create a skill for a task you repeat.',
    docs: `${DOCS}/skills`,
    watch: { kind: 'skill' },
  },
  {
    id: 'mcp',
    level: 3,
    title: 'Connect a tool with MCP',
    why: 'MCP servers give Claude new tools: your issue tracker, database, design files…',
    how: 'Add an MCP server (see the quickstart), check it with /mcp, then ask Claude to use it.',
    docs: `${DOCS}/mcp-quickstart`,
    watch: { kind: 'tool', prefix: 'mcp__' },
  },
  {
    id: 'hooks',
    level: 3,
    title: 'Automate with a hook',
    why: 'Hooks run your own commands at moments like "after Claude edits a file", every time.',
    how: 'Ask Claude to add a hook that formats files after each edit; view them with /hooks.',
    docs: `${DOCS}/hooks-guide`,
    watch: { kind: 'settings', key: 'hooks' },
    quiz: [
      {
        ask: 'What is a hook in Claude Code?',
        options: ['A plugin store', 'A command that runs automatically at events like after an edit', 'A keyboard shortcut'],
        answer: 1,
      },
    ],
  },
  {
    id: 'permissions',
    level: 3,
    title: 'Stop answering the same question',
    why: 'Allow rules let safe commands run without asking you each time.',
    how: 'Run /permissions and add an allow rule, for example for your test command.',
    docs: `${DOCS}/permissions`,
    watch: { kind: 'settings', key: 'allow' },
    quiz: [
      {
        ask: "Claude keeps asking before running your test command. What's the fix?",
        options: ['Add an allow rule with /permissions', 'Reinstall Claude Code', 'There is none'],
        answer: 0,
      },
    ],
  },
]

export type Badge = { id: string; name: string; why: string }

export const BADGES: readonly Badge[] = [
  { id: 'first-steps', name: 'First Steps', why: 'Every level 1 quest' },
  { id: 'speedrunner', name: 'Speedrunner', why: 'Every level 2 quest' },
  { id: 'pro', name: 'Pro', why: 'Every level 3 quest' },
  { id: 'scholar', name: 'Scholar', why: 'Every quiz answered right' },
  { id: 'early-adopter', name: 'Early Adopter', why: 'Tried 3 new features' },
  { id: 'reader', name: 'Reader', why: '5 daily docs quests' },
  { id: 'on-fire', name: 'On Fire', why: 'A 7-day streak' },
]

/**
 * Progress as it is kept: quest ids done, new features tried, quizzes
 * passed, daily docs pages done, and the streak: days in a row with XP,
 * the last of them `lastDay` (YYYY-MM-DD, local time).
 */
export type Progress = {
  done: readonly string[]
  tried: readonly string[]
  quizzes: readonly string[]
  daily: readonly string[]
  streak: number
  lastDay: string
}

export const emptyProgress = (): Progress => ({ done: [], tried: [], quizzes: [], daily: [], streak: 0, lastDay: '' })

export function xpOf(progress: Progress): number {
  let xp = 0
  for (const quest of QUESTS) if (progress.done.includes(quest.id)) xp += QUEST_XP[quest.level]
  return xp + progress.tried.length * NEW_XP + progress.daily.length * DAILY_XP
}

/** The local day of a time, as YYYY-MM-DD. */
export function dayOf(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The streak after earning XP on `today`: one more day in a row, or a new start. */
export function withStreak(progress: Progress, today: string): Progress {
  if (progress.lastDay === today) return progress
  const yesterday = dayOf(new Date(`${today}T12:00:00`).getTime() - 24 * 60 * 60 * 1000)
  const streak = progress.lastDay === yesterday ? progress.streak + 1 : 1
  return { ...progress, streak, lastDay: today }
}

/** The streak as it stands today: 0 once a day was missed. */
export function streakOn(progress: Progress, today: string): number {
  if (progress.lastDay === '') return 0
  const yesterday = dayOf(new Date(`${today}T12:00:00`).getTime() - 24 * 60 * 60 * 1000)
  return progress.lastDay === today || progress.lastDay === yesterday ? progress.streak : 0
}

/** The quest to suggest: the first not done, in course order. */
export function nextQuest(progress: Progress, skipped: readonly string[] = []): Quest | undefined {
  const open = QUESTS.filter(q => !progress.done.includes(q.id))
  return open.find(q => !skipped.includes(q.id)) ?? open[0]
}

/** Level from XP: 50 XP a level, starting at 1. */
export function levelOf(xp: number): { level: number; into: number; size: number } {
  const size = 50
  return { level: Math.floor(xp / size) + 1, into: xp % size, size }
}

export function badgesOf(progress: Progress): Badge[] {
  const all = (level: number) => QUESTS.filter(q => q.level === level).every(q => progress.done.includes(q.id))
  const quizzed = QUESTS.filter(q => q.quiz !== undefined).every(q => progress.quizzes.includes(q.id))
  const earned: Record<string, boolean> = {
    'first-steps': all(1),
    speedrunner: all(2),
    pro: all(3),
    scholar: quizzed,
    'early-adopter': progress.tried.length >= 3,
    reader: progress.daily.length >= 5,
    'on-fire': progress.streak >= 7,
  }
  return BADGES.filter(badge => earned[badge.id])
}

/** Whether something that happened completes a quest's watch. */
export function matches(watch: Watch | undefined, event: Event): boolean {
  if (watch === undefined || watch.kind !== event.kind) return false
  switch (watch.kind) {
    case 'prompt':
      return event.kind === 'prompt' && (watch.pattern === undefined || watch.pattern.test(event.text))
    case 'tool':
      return (
        event.kind === 'tool' &&
        ((watch.tools?.includes(event.tool) ?? false) || (watch.prefix !== undefined && event.tool.startsWith(watch.prefix)))
      )
    case 'file':
      return event.kind === 'file' && event.path === watch.path
    case 'settings':
      return event.kind === 'settings' && event.key === watch.key
    default:
      return true
  }
}

/** Something the mod saw happen in the session. */
export type Event =
  | { kind: 'prompt'; text: string }
  | { kind: 'tool'; tool: string }
  | { kind: 'subagent' }
  | { kind: 'skill' }
  | { kind: 'compact' }
  | { kind: 'file'; path: string }
  | { kind: 'settings'; key: 'hooks' | 'allow' }

/** The quests an event completes that are not done yet. */
export function completedBy(event: Event, progress: Progress): Quest[] {
  return QUESTS.filter(quest => !progress.done.includes(quest.id) && matches(quest.watch, event))
}

// ---- New features, from the changelog --------------------------------------

export type NewFeature = { key: string; version: string; text: string }

/**
 * Whether a changelog line is something a Claude Code user tries, not an
 * API for mod, SDK or script authors or a knob for operators.
 */
export function isUserFacing(text: string): boolean {
  return !(
    /\$\.[a-z]/.test(text) || // the mods API
    /\bmods?\b|\bmod's\b|\bplugin hooks?\b|\btypings\b|\bSDK\b|\bpayload\b|\bschema\b|\bgateway\b|managed settings/i.test(text) ||
    /\b[A-Z][A-Z0-9]*_[A-Z0-9_]{3,}\b/.test(text) || // an environment variable
    /\b(event|events) (a|that) (mod|plugin)/i.test(text)
  )
}

/**
 * The "Added" lines of the newest versions in the changelog (bug fixes and
 * the like left out): the features to try. `limit` features at most.
 */
export function newFeatures(changelog: string, limit = 8): NewFeature[] {
  const features: NewFeature[] = []
  let version = ''
  for (const line of changelog.split('\n')) {
    const heading = /^##\s+v?(\d+\.\d+\.\d+)/.exec(line)
    if (heading !== null) {
      version = heading[1] ?? ''
      continue
    }
    const item = /^[-*]\s+(Added|New:?)\s+(.+)$/.exec(line.trim())
    if (version === '' || item === null) continue
    const text = `${item[1] === 'Added' ? 'Added' : 'New'} ${item[2] ?? ''}`.trim()
    if (!isUserFacing(text)) continue
    features.push({ key: `${version}:${hash(text)}`, version, text })
    if (features.length >= limit) break
  }
  return features
}

/** Whether version `a` is at least `b` (x.y.z). */
export function isAtLeast(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y
  }
  return true
}

function hash(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36)
}

// ---- The daily docs quest -----------------------------------------------------

export type DocsPage = { path: string; title: string; about: string; url: string }

// Pages for operators, admins and SDK builders, not for learning to use Claude Code.
const NOT_FOR_LEARNING =
  /^(agent-sdk\/|whats-new\/|changelog|admin|setup|managed-|server-managed|claude-apps-gateway|llm-gateway|gateways|self-hosted|amazon-bedrock|google-vertex|microsoft-foundry|claude-platform-on-aws|third-party|network-config|corporate-launcher|hipaa|zero-data|legal|data-usage|analytics|monitoring-usage|communications-kit|champion-kit|troubleshoot|errors|feature-availability|authentication|plugins\/(org|host-marketplace|marketplace-reference|manifest-reference|cli-reference|measure|cli-hints|relevance)|plugin-evals|plugins\/mods\/|env-vars|settings-reference|settings-example|glossary|tools-reference|channels-reference)/

/** The docs pages worth a daily quest, from the docs index (llms.txt). */
export function docsPages(index: string): DocsPage[] {
  const pages: DocsPage[] = []
  const line = /^- \[([^\]]+)\]\((https:\/\/code\.claude\.com\/docs\/en\/([a-z0-9/-]+))\.md\):?\s*(.*)$/
  for (const raw of index.split('\n')) {
    const match = line.exec(raw.trim())
    if (match === null) continue
    const [, title = '', url = '', path = '', about = ''] = match
    if (NOT_FOR_LEARNING.test(path)) continue
    pages.push({ path, title, about, url })
  }
  return pages
}

/** Today's page: the same all day, one not done yet when there is one. */
export function pickDaily(pages: readonly DocsPage[], done: readonly string[], day: string): DocsPage | undefined {
  const open = pages.filter(page => !done.includes(page.path))
  const pool = open.length > 0 ? open : pages
  if (pool.length === 0) return undefined
  return pool[Number.parseInt(hash(day), 36) % pool.length]
}

export type DailyQuiz = { summary: string; questions: Question[] }

/** The quiz Claude wrote for a page, checked: 3 questions of 3 options each. */
export function parseQuiz(text: string): DailyQuiz | undefined {
  const json = /\{[\s\S]*\}/.exec(text)?.[0]
  if (json === undefined) return undefined
  try {
    const data = JSON.parse(json) as { summary?: unknown; questions?: unknown }
    if (typeof data.summary !== 'string' || !Array.isArray(data.questions)) return undefined
    const questions: Question[] = []
    for (const q of data.questions as { ask?: unknown; options?: unknown; answer?: unknown }[]) {
      if (typeof q.ask !== 'string' || !Array.isArray(q.options) || typeof q.answer !== 'number') return undefined
      const options = q.options.filter((o): o is string => typeof o === 'string')
      if (options.length < 2 || options.length !== q.options.length || q.answer < 0 || q.answer >= options.length) return undefined
      // Claude tends to put the right answer first: shuffle, the same way each time.
      const right = options[q.answer] as string
      const shuffled = [...options].sort((a, b) => hash(q.ask + a).localeCompare(hash(q.ask + b)))
      questions.push({ ask: q.ask, options: shuffled, answer: shuffled.indexOf(right) })
    }
    if (questions.length === 0) return undefined
    return { summary: data.summary, questions: questions.slice(0, 3) }
  } catch {
    return undefined
  }
}

/** How Claude is asked to write the daily quiz, from the page's own text only. */
export const QUIZ_SYSTEM =
  'You write a short quiz about one page of the official Claude Code docs, for a Claude Code user. ' +
  'Use only facts stated in the page text you are given; never add facts from elsewhere. ' +
  'Answer with JSON only: {"summary": "<one plain sentence, at most 30 words: what the page teaches and why it helps>", ' +
  '"questions": [{"ask": "<question>", "options": ["<a>", "<b>", "<c>"], "answer": <index of the right option>}]} ' +
  'with exactly 3 questions about practical things a user does (commands, keys, settings, when to use it), ' +
  'each with 3 short options, exactly one right. No markdown, no backticks.'
