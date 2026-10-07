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
  | { kind: 'settings'; key: 'hooks' | 'allow' | 'statusLine' } // your settings have hooks / allow rules / a status line
  | { kind: 'command'; names: readonly string[] } // you run one of these slash commands

export type Question = { ask: string; options: readonly string[]; answer: number }

export type Quest = {
  id: string
  level: QuestLevel
  title: string
  /** Why it matters, in a sentence. */
  why: string
  /** What to do. */
  how: string
  docs: string
  watch?: Watch | readonly Watch[]
  /** Answering these right completes the quest too. */
  quiz?: readonly Question[]
}

export type QuestLevel = 1 | 2 | 3 | 4 | 5 | 6

export const LEVEL_NAMES = {
  1: 'First steps',
  2: 'Getting faster',
  3: 'Pro moves',
  4: 'Power user',
  5: 'Expert',
  6: 'Master',
} as const
export const QUEST_XP = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60 } as const

/**
 * Tracks: where you start, which docs pages your daily quest comes from and
 * how hard its questions are. Everything stays open whatever you pick.
 */
export type Track = 'beginner' | 'advanced' | 'pro'

export const TRACKS: Record<Track, { name: string; about: string; levels: readonly QuestLevel[]; dailyXp: number; options: number; questions: number }> = {
  beginner: { name: 'Beginner', about: 'New to Claude Code: the basics, one step at a time.', levels: [1, 2], dailyXp: 25, options: 3, questions: 3 },
  advanced: { name: 'Advanced', about: 'You use it every day: settings, subagents, skills, MCP, sessions.', levels: [3, 4], dailyXp: 35, options: 3, questions: 3 },
  pro: { name: 'Pro', about: 'Expert: real scenarios, limits and edge cases, automation and parallel work.', levels: [5, 6], dailyXp: 50, options: 4, questions: 4 },
}

export const isTrack = (value: unknown): value is Track => value === 'beginner' || value === 'advanced' || value === 'pro'
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
  {
    id: 'context-view',
    level: 4,
    title: 'See what fills the context',
    why: 'The context window holds everything Claude knows in this conversation; seeing it shows what to trim.',
    how: 'Run /context: a colored grid of what is in the context window, with suggestions.',
    docs: `${DOCS}/context-window`,
    watch: { kind: 'command', names: ['context'] },
  },
  {
    id: 'model',
    level: 4,
    title: 'Pick the right model',
    why: 'Bigger models think deeper; smaller ones are faster and cheaper. /model also sets the effort level.',
    how: 'Run /model, look at the choices, and use the left/right arrows for effort.',
    docs: `${DOCS}/model-config`,
    watch: { kind: 'command', names: ['model'] },
  },
  {
    id: 'resume',
    level: 4,
    title: 'Pick up where you left off',
    why: 'Conversations are saved, so you can come back to one tomorrow.',
    how: 'Run /resume to open the session picker, or start with claude --continue for the latest one.',
    docs: `${DOCS}/sessions`,
    watch: { kind: 'command', names: ['resume', 'continue'] },
    quiz: [
      {
        ask: 'Which command continues the most recent conversation in this folder?',
        options: ['claude --continue', 'claude --worktree', 'claude -p'],
        answer: 0,
      },
    ],
  },
  {
    id: 'branch',
    level: 4,
    title: 'Try another direction with /branch',
    why: 'A branch copies the conversation at this point, so you can explore without losing it.',
    how: 'Run /branch, try a different approach; the original conversation stays as it was.',
    docs: `${DOCS}/sessions`,
    watch: { kind: 'command', names: ['branch'] },
  },
  {
    id: 'usage',
    level: 4,
    title: 'Know what it costs',
    why: '/usage shows the session cost, your plan limits and activity.',
    how: 'Run /usage (or its alias /cost).',
    docs: `${DOCS}/costs`,
    watch: { kind: 'command', names: ['usage', 'cost'] },
  },
  {
    id: 'own-agent',
    level: 5,
    title: 'Write your own subagent',
    why: 'A custom subagent is a specialist with its own instructions and tools, reused in every session.',
    how: 'Ask Claude: "Create a subagent in .claude/agents that reviews my changes for accessibility."',
    docs: `${DOCS}/sub-agents`,
    watch: { kind: 'file', path: '.claude/agents' },
  },
  {
    id: 'own-skill',
    level: 5,
    title: 'Write your own skill',
    why: 'A skill packages a workflow you repeat, so you or Claude can run it as /name.',
    how: 'Ask Claude: "Make a skill in .claude/skills for how we write release notes."',
    docs: `${DOCS}/skills`,
    watch: { kind: 'file', path: '.claude/skills' },
  },
  {
    id: 'project-mcp',
    level: 5,
    title: 'Share an MCP server with your team',
    why: 'A server added at project scope goes in .mcp.json, so everyone on the project gets it.',
    how: 'Ask Claude to add an MCP server with project scope, then commit .mcp.json.',
    docs: `${DOCS}/mcp`,
    watch: { kind: 'file', path: '.mcp.json' },
  },
  {
    id: 'statusline',
    level: 5,
    title: 'Make your own status line',
    why: 'A status line keeps what you care about (model, branch, cost) under the prompt.',
    how: 'Run /statusline and describe what you want to see.',
    docs: `${DOCS}/statusline`,
    watch: [
      { kind: 'command', names: ['statusline'] },
      { kind: 'settings', key: 'statusLine' },
    ],
  },
  {
    id: 'plugin',
    level: 5,
    title: 'Install a plugin',
    why: 'Plugins bundle skills, agents, hooks and MCP servers you add in one step.',
    how: 'Run /plugin and browse a marketplace.',
    docs: `${DOCS}/plugins/install`,
    watch: { kind: 'command', names: ['plugin'] },
  },
  {
    id: 'worktree',
    level: 6,
    title: 'Work in parallel with worktrees',
    why: 'Each session in its own worktree edits its own copy of the files, so parallel work never collides.',
    how: 'Start with claude --worktree feature-x, or ask Claude to "work in a worktree".',
    docs: `${DOCS}/worktrees`,
    watch: { kind: 'tool', tools: ['EnterWorktree'] },
    quiz: [
      {
        ask: 'What does claude --worktree feature-auth do?',
        options: [
          'Creates an isolated worktree under .claude/worktrees/ on a new branch and starts Claude there',
          'Deletes the feature-auth branch',
          'Opens a second window on the same files',
        ],
        answer: 0,
      },
      {
        ask: 'What do worktrees need?',
        options: ['A git repository', 'A cloud session', 'Plan mode'],
        answer: 0,
      },
    ],
  },
  {
    id: 'background',
    level: 6,
    title: 'Send work to the background',
    why: 'A background session keeps working while you do something else.',
    how: 'Run /background (or /bg); see your sessions with claude agents.',
    docs: `${DOCS}/agent-view`,
    watch: { kind: 'command', names: ['background', 'bg', 'tasks', 'bashes'] },
  },
  {
    id: 'headless',
    level: 6,
    title: 'Run Claude from a script',
    why: 'claude -p runs one prompt without the interactive screen: for scripts, CI and pipes.',
    how: 'In a terminal: claude -p "Summarize this project" --output-format json',
    docs: `${DOCS}/headless`,
    quiz: [
      {
        ask: 'Which flag runs Claude Code non-interactively?',
        options: ['-p (or --print)', '--worktree', '--continue'],
        answer: 0,
      },
      {
        ask: 'How do you get the answer as JSON, for a script?',
        options: ['--output-format json', '/export', '--verbose'],
        answer: 0,
      },
    ],
  },
  {
    id: 'security',
    level: 6,
    title: 'Review your branch for security issues',
    why: '/security-review checks the changes on your branch for vulnerabilities.',
    how: 'On a branch with changes, run /security-review.',
    docs: `${DOCS}/commands`,
    watch: { kind: 'command', names: ['security-review'] },
  },
  {
    id: 'automate',
    level: 6,
    title: 'Let Claude repeat a task',
    why: '/loop runs a prompt again and again while the session is open; /schedule makes routines that run in the cloud.',
    how: 'Try: /loop 10m check the build and tell me if it fails.',
    docs: `${DOCS}/scheduled-tasks`,
    watch: { kind: 'command', names: ['loop', 'schedule'] },
  },
]

export type Badge = { id: string; name: string; why: string }

const QUIZZED = 7 // quests with a quiz: checked by a test

/** Badges, from a first day to half a year: each has a goal and a count. */
export const BADGES: readonly (Badge & { goal: number; count: (p: Progress) => number })[] = [
  { id: 'first-steps', name: 'First Steps', why: 'Every First steps quest', goal: 5, count: p => doneIn(p, 1) },
  { id: 'speedrunner', name: 'Speedrunner', why: 'Every Getting faster quest', goal: 5, count: p => doneIn(p, 2) },
  { id: 'pro', name: 'Pro', why: 'Every Pro moves quest', goal: 5, count: p => doneIn(p, 3) },
  { id: 'power-user', name: 'Power User', why: 'Every Power user quest', goal: 5, count: p => doneIn(p, 4) },
  { id: 'expert', name: 'Expert', why: 'Every Expert quest', goal: 5, count: p => doneIn(p, 5) },
  { id: 'grandmaster', name: 'Grandmaster', why: 'Every Master quest', goal: 5, count: p => doneIn(p, 6) },
  { id: 'scholar', name: 'Scholar', why: 'Every quest quiz answered right', goal: QUIZZED, count: p => p.quizzes.length },
  { id: 'early-adopter', name: 'Early Adopter', why: 'Tried 3 new features', goal: 3, count: p => p.tried.length },
  { id: 'reader', name: 'Reader', why: '5 daily docs quests', goal: 5, count: p => p.daily.length },
  { id: 'bookworm', name: 'Bookworm', why: '50 daily docs quests', goal: 50, count: p => p.daily.length },
  { id: 'on-fire', name: 'On Fire', why: 'A 7-day streak', goal: 7, count: p => p.bestStreak },
  { id: 'unstoppable', name: 'Unstoppable', why: 'A 30-day streak', goal: 30, count: p => p.bestStreak },
  { id: 'sharp-memory', name: 'Sharp Memory', why: '10 questions mastered', goal: 10, count: p => p.mastered },
  { id: 'elephant', name: 'Elephant', why: '100 questions mastered', goal: 100, count: p => p.mastered },
  { id: 'boss-slayer', name: 'Boss Slayer', why: 'Beat a weekly boss', goal: 1, count: p => p.bosses },
  { id: 'boss-hunter', name: 'Boss Hunter', why: 'Beat 10 weekly bosses', goal: 10, count: p => p.bosses },
  { id: 'comeback', name: 'Comeback', why: 'Fixed 3 weak spots', goal: 3, count: p => p.fixed ?? 0 },
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
  bestStreak: number
  lastDay: string
  /** '' until you pick one. */
  track: Track | ''
  /** Questions in your memory bank at box MASTERED_BOX or above. */
  mastered: number
  /** Weekly bosses beaten, and review answers right. */
  bosses: number
  reviews: number
  /** XP beyond the counted things: the harder tracks' daily extra, weak-spot practice. */
  bonus?: number
  /** Weak spots fixed: pages you kept missing, then practised well. */
  fixed?: number
  /** This week so far, for the week card. */
  week?: WeekLog
}

/** What you did this ISO week: the XP you had when it began, the pages you studied, reviews right. */
export type WeekLog = { id: string; xpStart: number; topics: readonly string[]; reviews: number; fixed: number }

/** This week's log: the one kept, or a fresh one when the week changed. */
export function weekLog(progress: Progress, day: string): WeekLog {
  const id = weekOf(day)
  return progress.week?.id === id ? progress.week : { id, xpStart: xpOf(progress), topics: [], reviews: 0, fixed: 0 }
}

/** XP for practising a weak spot, once a day. */
export const DRILL_XP = 20

export const emptyProgress = (): Progress => ({
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
})

/** XP for a review answered right, and for beating the weekly boss. */
export const REVIEW_XP = 5
export const BOSS_XP = 100

export function xpOf(progress: Progress): number {
  let xp = 0
  for (const quest of QUESTS) if (progress.done.includes(quest.id)) xp += QUEST_XP[quest.level]
  // Daily quests counted at the Beginner rate; the extra of harder tracks is in `bonus`.
  return xp + progress.tried.length * NEW_XP + progress.daily.length * DAILY_XP + progress.reviews * REVIEW_XP + progress.bosses * BOSS_XP + (progress.bonus ?? 0)
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
  const streak = progress.lastDay === addDays(today, -1) ? progress.streak + 1 : 1
  return { ...progress, streak, bestStreak: Math.max(progress.bestStreak, streak), lastDay: today }
}

/** The day `n` days after `day` (YYYY-MM-DD). */
export function addDays(day: string, n: number): string {
  return dayOf(new Date(`${day}T12:00:00`).getTime() + n * 24 * 60 * 60 * 1000)
}

/** The ISO week of a day, as YYYY-Www: the weekly boss's key. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T12:00:00`)
  const thursday = new Date(d.getTime() + (3 - ((d.getDay() + 6) % 7)) * 24 * 60 * 60 * 1000)
  const yearStart = new Date(thursday.getFullYear(), 0, 1, 12)
  const week = 1 + Math.floor((thursday.getTime() - yearStart.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`
}

/** The streak as it stands today: 0 once a day was missed. */
export function streakOn(progress: Progress, today: string): number {
  if (progress.lastDay === '') return 0
  return progress.lastDay === today || progress.lastDay === addDays(today, -1) ? progress.streak : 0
}

/**
 * The quest to suggest: the first not done in your track's levels, then the
 * rest in course order; passed-over ones last.
 */
export function nextQuest(progress: Progress, skipped: readonly string[] = []): Quest | undefined {
  const levels: readonly QuestLevel[] = isTrack(progress.track) ? TRACKS[progress.track].levels : [1, 2]
  const open = QUESTS.filter(q => !progress.done.includes(q.id))
  const ordered = [...open.filter(q => levels.includes(q.level)), ...open.filter(q => !levels.includes(q.level))]
  return ordered.find(q => !skipped.includes(q.id)) ?? ordered[0]
}

/**
 * Levels from XP, each a little longer than the one before: level L needs
 * 50·L XP to reach L+1, so the first levels come in a day and level 20 in
 * months.
 */
export function levelOf(xp: number): { level: number; into: number; size: number } {
  const level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / 25)) / 2))
  const start = 25 * level * (level - 1)
  return { level, into: xp - start, size: 50 * level }
}

/** Your title by level. */
export function rankOf(level: number): string {
  return level >= 35 ? 'Legend' : level >= 20 ? 'Master' : level >= 10 ? 'Expert' : level >= 5 ? 'Builder' : 'Apprentice'
}

function doneIn(progress: Progress, level: QuestLevel): number {
  return QUESTS.filter(q => q.level === level && progress.done.includes(q.id)).length
}

export function badgesOf(progress: Progress): Badge[] {
  return BADGES.filter(badge => badge.count(progress) >= badge.goal)
}

/** Whether something that happened completes a quest's watch. */
export function matches(watch: Watch | readonly Watch[] | undefined, event: Event): boolean {
  if (watch === undefined) return false
  if (Array.isArray(watch)) return (watch as readonly Watch[]).some(w => matches(w, event))
  return matchesOne(watch as Watch, event)
}

function matchesOne(watch: Watch, event: Event): boolean {
  if (watch.kind !== event.kind) return false
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
    case 'command':
      return event.kind === 'command' && watch.names.includes(event.name)
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
  | { kind: 'settings'; key: 'hooks' | 'allow' | 'statusLine' }
  | { kind: 'command'; name: string }

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

export type DocsPage = { path: string; title: string; about: string; url: string; track: Track }

// Pages for operators, admins and the like, not for learning to use Claude Code.
const NOT_FOR_LEARNING =
  /^(agent-sdk\/(?!overview|quickstart|agent-loop)|whats-new\/|changelog|admin|setup|managed-|server-managed|claude-apps-gateway|llm-gateway|gateways|self-hosted|amazon-bedrock|google-vertex|microsoft-foundry|claude-platform-on-aws|third-party|network-config|corporate-launcher|hipaa|zero-data|legal|data-usage|analytics|monitoring-usage|communications-kit|champion-kit|troubleshoot|errors|feature-availability|authentication|plugins\/(org|host-marketplace|marketplace-reference|manifest-reference|cli-reference|measure|cli-hints|relevance|loading|troubleshooting)|plugin-evals|plugins\/mods\/(?!overview|create)|env-vars|settings-reference|settings-example|glossary|tools-reference|channels-reference|cli-reference)/

const BEGINNER_PAGES =
  /^(overview|quickstart|how-claude-code-works|features-overview|common-workflows|best-practices|memory|context-window|interactive-mode|checkpointing|commands|permission-modes|costs|model-config|sessions|prompt-library|vs-code|jetbrains|desktop|desktop-quickstart|web-quickstart|mobile|terminal-config|keybindings|output-styles|fast-mode|voice-dictation|accessibility|fullscreen|claude-directory|platforms)$/

const PRO_PAGES =
  /^(headless|github-actions|github-actions-cloud-providers|gitlab-ci-cd|agents|agent-teams|agent-view|workflows|cross-session-messaging|goal|channels|deep-links|devcontainer|sandboxing|sandbox-environments|security|security-guidance|claude-security|routines|scheduled-tasks|desktop-scheduled-tasks|large-codebases|prompt-caching|worktrees|remote-control|code-review|ultrareview|computer-use|auto-mode-config|claude-code-on-the-web|cloud-environments|plugins\/(create|components|publish|dependencies|create-marketplace)|plugins\/mods\/(overview|create)|agent-sdk\/.*)$/

/** Which track a docs page belongs to. */
export function trackOfPage(path: string): Track {
  return BEGINNER_PAGES.test(path) ? 'beginner' : PRO_PAGES.test(path) ? 'pro' : 'advanced'
}

/** The docs pages worth a daily quest, from the docs index (llms.txt). */
export function docsPages(index: string): DocsPage[] {
  const pages: DocsPage[] = []
  const line = /^- \[([^\]]+)\]\((https:\/\/code\.claude\.com\/docs\/en\/([a-z0-9/-]+))\.md\):?\s*(.*)$/
  for (const raw of index.split('\n')) {
    const match = line.exec(raw.trim())
    if (match === null) continue
    const [, title = '', url = '', path = '', about = ''] = match
    if (NOT_FOR_LEARNING.test(path)) continue
    pages.push({ path, title, about, url, track: trackOfPage(path) })
  }
  return pages
}

/**
 * Today's page: the same all day, from your track, one not done yet when
 * there is one (then from any track, then any page again).
 */
export function pickDaily(pages: readonly DocsPage[], done: readonly string[], day: string, track: Track = 'beginner'): DocsPage | undefined {
  const open = pages.filter(page => !done.includes(page.path))
  const mine = open.filter(page => page.track === track)
  const pool = mine.length > 0 ? mine : open.length > 0 ? open : pages
  if (pool.length === 0) return undefined
  return pool[Number.parseInt(hash(day), 36) % pool.length]
}

export type DailyQuiz = { summary: string; questions: Question[] }

/** A question with its options in a fixed, mixed order. */
export function shuffled(question: Question): Question {
  const right = question.options[question.answer] as string
  const options = [...question.options].sort((a, b) => hash(question.ask + a).localeCompare(hash(question.ask + b)))
  return { ask: question.ask, options, answer: options.indexOf(right) }
}

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
      if (options.length < 2 || options.length > 5 || options.length !== q.options.length || q.answer < 0 || q.answer >= options.length) return undefined
      // Claude tends to put the right answer first: shuffle, the same way each time.
      questions.push(shuffled({ ask: q.ask, options, answer: q.answer }))
    }
    if (questions.length === 0) return undefined
    return { summary: data.summary, questions: questions.slice(0, 4) }
  } catch {
    return undefined
  }
}

/**
 * How Claude is asked to write a quiz, from the pages' own text only, at your
 * track's level: on one page, on two (Pro: how features combine), or new
 * questions on a weak spot.
 */
export function quizSystem(track: Track, kind: 'one' | 'two' | 'weak' = 'one'): string {
  const { questions, options } = TRACKS[track]
  const extra =
    kind === 'two'
      ? 'You get two pages. At least one question must need both: how the two features work together, as the pages state it. '
      : kind === 'weak'
        ? 'The reader keeps getting this page wrong: ask about its most important practical points, from new angles, never repeating the questions listed after the page. '
        : ''
  const level =
    track === 'beginner'
      ? 'The reader is new to Claude Code: ask what a feature is for, when to use it, and the basic command or key.'
      : track === 'advanced'
        ? 'The reader uses Claude Code every day: ask about specific commands, flags, settings and how features behave.'
        : 'The reader is an expert: ask scenario questions ("You want X: what do you do?"), limits, edge cases and how features combine, ' +
          'as the page states them. Wrong options must be plausible.'
  return (
    'You write a short quiz about one page of the official Claude Code docs. ' +
    `${level} ` +
    extra +
    'Use only facts stated in the page text you are given; never add facts from elsewhere. ' +
    'Answer with JSON only: {"summary": "<one plain sentence, at most 30 words: what the page teaches and why it helps>", ' +
    `"questions": [{"ask": "<question>", "options": [<${options} short options>], "answer": <index of the right option>}]} ` +
    `with exactly ${questions} questions about practical things a user does, each with ${options} options, exactly one right. ` +
    'Keep the options about the same length and style, so the right one never stands out. No markdown, no backticks.'
  )
}

// ---- Your memory bank: spaced review ------------------------------------------

/**
 * A question you answered, kept to ask again: right answers push it further
 * away (box up), a wrong one brings it back tomorrow (box 0).
 */
export type BankItem = {
  id: string
  ask: string
  options: readonly string[]
  answer: number
  path: string
  title: string
  url: string
  box: number
  due: string
  /** Times answered wrong: what makes a weak spot. */
  misses?: number
}

/** Days until the next review, by box: wrong (box 0) tomorrow, then 3, 7, 14, 30, 60 and 120 days. */
export const INTERVALS = [1, 3, 7, 14, 30, 60, 120] as const
/** From this box on, a question counts as mastered (a 30-day interval). */
export const MASTERED_BOX = 4

export function bankItem(question: Question, page: { path: string; title: string; url: string }, isRight: boolean, today: string): BankItem {
  return schedule(
    { id: `${page.path}:${hash(question.ask)}`, ...question, ...page, box: 0, due: today, misses: 0 },
    isRight,
    today,
  )
}

/** The item after an answer today. */
export function schedule(item: BankItem, isRight: boolean, today: string): BankItem {
  const box = isRight ? Math.min(item.box + 1, INTERVALS.length - 1) : 0
  return { ...item, box, due: addDays(today, INTERVALS[box] ?? 1), misses: (item.misses ?? 0) + (isRight ? 0 : 1) }
}

/** The questions due today, oldest first, at most `max`. */
export function dueToday(bank: readonly BankItem[], today: string, max = 5): BankItem[] {
  return bank
    .filter(item => item.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.box - b.box)
    .slice(0, max)
}

export const masteredIn = (bank: readonly BankItem[]): number => bank.filter(item => item.box >= MASTERED_BOX).length

/** The weekly boss: 5 questions from different pages of your bank, the same all week; undefined while the bank is too small. */
export function bossFor(bank: readonly BankItem[], week: string): BankItem[] | undefined {
  const pages = new Set(bank.map(item => item.path))
  if (bank.length < 8 || pages.size < 3) return undefined
  const sorted = [...bank].sort((a, b) => hash(week + a.id).localeCompare(hash(week + b.id)))
  const picked: BankItem[] = []
  const used = new Set<string>()
  for (const item of sorted) {
    if (picked.length >= 5) break
    if (used.has(item.path) && used.size < pages.size) continue
    picked.push(item)
    used.add(item.path)
  }
  for (const item of sorted) if (picked.length < 5 && !picked.includes(item)) picked.push(item)
  return picked
}

// ---- Weak spots ------------------------------------------------------------------

export type WeakSpot = { path: string; title: string; url: string; misses: number }

/** Pages you missed 2 questions or more on, the most missed first. */
export function weakSpots(bank: readonly BankItem[]): WeakSpot[] {
  const pages = new Map<string, WeakSpot>()
  for (const item of bank) {
    const spot = pages.get(item.path) ?? { path: item.path, title: item.title, url: item.url, misses: 0 }
    pages.set(item.path, { ...spot, misses: spot.misses + (item.misses ?? 0) })
  }
  return [...pages.values()].filter(spot => spot.misses >= 2).sort((a, b) => b.misses - a.misses || a.title.localeCompare(b.title))
}

/** A page practised with at most one miss is fixed: its misses are forgiven. */
export function forgive(bank: readonly BankItem[], path: string): BankItem[] {
  return bank.map(item => (item.path === path ? { ...item, misses: 0 } : item))
}

// ---- Pro: two pages a day ----------------------------------------------------------

/** A page you studied before to pair with today's, the same all day; none on the first day. */
export function pickPartner(pages: readonly DocsPage[], done: readonly string[], day: string, today: string): DocsPage | undefined {
  const pool = pages.filter(page => done.includes(page.path) && page.path !== today)
  if (pool.length === 0) return undefined
  return pool[Number.parseInt(hash(`${day}+`), 36) % pool.length]
}

// ---- The placement test ------------------------------------------------------------

/** "Not sure" is always an option and never right: guessing would place you too high. */
export const NOT_SURE = 'Not sure'

/** Six questions, two per track, from the official docs. */
export const PLACEMENT: readonly Question[] = [
  {
    ask: 'You want Claude to propose a plan and change nothing until you approve it. What do you use?',
    options: ['Plan mode (Shift+Tab)', '/compact', 'claude -p'],
    answer: 0,
  },
  {
    ask: 'Where do you write the rules Claude reads at the start of every session?',
    options: ['CLAUDE.md', '.gitignore', 'package.json'],
    answer: 0,
  },
  {
    ask: "Where does a project's own subagent live?",
    options: ['.claude/agents/', '.claude/hooks/', '.git/agents/'],
    answer: 0,
  },
  {
    ask: 'Which file shares project-scoped MCP servers with your team?',
    options: ['.mcp.json', 'CLAUDE.md', '.claude/settings.local.json'],
    answer: 0,
  },
  {
    ask: 'Which hook event can block a tool call before it runs?',
    options: ['PreToolUse', 'PostToolUse', 'SessionEnd'],
    answer: 0,
  },
  {
    ask: 'Two sessions must edit the same repository at once without colliding. What do you use?',
    options: ['claude --worktree <name>', 'claude --continue', '/branch'],
    answer: 0,
  },
].map(q => {
  const mixed = shuffled(q)
  return { ...mixed, options: [...mixed.options, NOT_SURE] }
})

/** The track for a placement score out of 6. */
export function placementTrack(right: number): Track {
  return right >= 5 ? 'pro' : right >= 3 ? 'advanced' : 'beginner'
}
