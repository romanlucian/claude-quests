/** Quest progress, kept across sessions. */
export type QuestProgress = {
  done: readonly string[]
  /** New features (changelog keys) you tried. */
  tried: readonly string[]
  /** Quests whose quiz you answered right. */
  quizzes: readonly string[]
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
  selected: string
  /** Answers picked in the open quiz, by question. */
  answers: readonly number[]
  note: string
}

declare module 'claude-code' {
  interface PluginState {
    quests: {
      progress: QuestProgress
      news: QuestNews
      view: QuestView
    }
  }
}
