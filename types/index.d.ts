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
  bestStreak: number
  lastDay: string
  /** The track you picked ('' until you pick one). */
  track: 'beginner' | 'advanced' | 'pro' | ''
  /** The most questions mastered at once, weekly bosses beaten, review answers right. */
  mastered: number
  bosses: number
  reviews: number
  /** XP beyond the counted things: the harder tracks' daily extra. */
  bonus?: number
}

/** A question in your memory bank, asked again on a schedule. */
export type QuestBankItem = {
  id: string
  ask: string
  options: readonly string[]
  answer: number
  path: string
  title: string
  url: string
  box: number
  due: string
}

/** Today's reviews and the weekly boss. */
export type QuestPractice = {
  day: string
  reviewed: number
  note: string
  week: string
  boss: 'idle' | 'running' | 'won' | 'lost'
  bossIds: readonly string[]
  bossStep: number
  bossMistakes: number
  bossTriedOn: string
  bossNote: string
}

/** Today's docs quest. */
export type QuestDaily = {
  day: string
  status: 'idle' | 'loading' | 'ready' | 'error' | 'done'
  path: string
  title: string
  url: string
  /** The track the quiz was written for. */
  track: 'beginner' | 'advanced' | 'pro'
  summary: string
  questions: readonly { ask: string; options: readonly string[]; answer: number }[]
  step: number
  /** Questions answered wrong at the first try. */
  misses: readonly number[]
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
  tab: 'quests' | 'new' | 'me'
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
      bank: readonly QuestBankItem[]
      practice: QuestPractice
      view: QuestView
    }
  }
}
