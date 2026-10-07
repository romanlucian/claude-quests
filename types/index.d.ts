/** Quest progress, kept across sessions. */
export type QuestProgress = {
  done: readonly string[]
  /** New features (changelog keys) you tried. */
  tried: readonly string[]
  /** Quests whose quiz you answered right. */
  quizzes: readonly string[]
  /** Docs pages whose daily quest you did. */
  daily: readonly string[]
  /** Days in a row with XP, the last of them `lastDay` (YYYY-MM-DD). */
  streak: number
  lastDay: string
}

/** Today's docs quest. */
export type QuestDaily = {
  day: string
  status: 'idle' | 'loading' | 'ready' | 'error' | 'done'
  path: string
  title: string
  url: string
  summary: string
  questions: readonly { ask: string; options: readonly string[]; answer: number }[]
  step: number
  note: string
  error: string
}

/** The New tab: features from the changelog. */
export type QuestNews = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  features: readonly { key: string; version: string; text: string }[]
  /** This Claude Code's version, to tell what you can try already. */
  version: string
  fetchedAt: number
  explanations: Readonly<Record<string, string>>
  explaining: string
  error: string
}

/** What the pane shows. */
export type QuestView = {
  tab: 'quests' | 'new' | 'badges'
  /** The quest you picked from a level's list ('' for the next one). */
  focus: string
  /** The level whose quests are listed (0: none). */
  openLevel: number
  /** The question of the open quiz. */
  step: number
  note: string
  /** Quests passed over with "Another one". */
  skipped: readonly string[]
}

declare module 'claude-code' {
  interface PluginState {
    quests: {
      progress: QuestProgress
      news: QuestNews
      daily: QuestDaily
      view: QuestView
    }
  }
}
