# quests — learn Claude Code by doing

A Claude Code mod that turns learning Claude Code into a game. Type `/quests`
and a pane opens with short missions. You don't read a tutorial: you do the
thing in your real project, and the quest completes by itself.

![A progress card: level 7, 17 of 23 quests, badges](docs/card-example.png)

## Install

In Claude Code:

```
/plugin marketplace add romanlucian/claude-quests
/plugin install quests@quests
```

Then type `/quests`.

## What's inside

**15 quests in 3 levels**, each linked to its page in the
[official docs](https://code.claude.com/docs):

| Level | Quests |
| --- | --- |
| First steps (10 XP) | Ask about your project · Point at a file with @ · Let Claude explore · Let Claude change a file · Let Claude run a command |
| Getting faster (20 XP) | Plan mode · CLAUDE.md memory · Keep the context fresh · Undo with rewind · Look something up on the web |
| Pro moves (30 XP) | Subagents · Skills · MCP · Hooks · Permissions |

Most quests **complete automatically**: the mod watches what happens in your
session (the prompt you send, the tools Claude uses, a subagent starting, a
`CLAUDE.md` in your project, hooks and allow rules in your settings). A few
have a **2-question quiz** instead. Every quest also has "I did it".

**⭐ New**: features from the official
[changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md),
read once or twice a day. Each one has an **Explain** button (Claude Haiku, on
your own account, explains the line in plain words and says how to try it)
and **I tried it** (+15 XP). Features newer than your Claude Code say to
update first. A link goes to the official *This week in Claude Code* page.

**Levels and badges**: 50 XP a level. Badges: First Steps, Speedrunner, Pro,
Scholar (every quiz) and Early Adopter (3 new features tried).

**Share card**: the *Share card* button (or `/quests card`) opens your card in
the browser; *Download PNG* saves it, ready for X.

## Good to know

- Progress is kept on your computer (the mod's own store), across sessions.
- *Explain* is the only thing that uses your Claude usage: one small Haiku
  call per line you choose to explain, kept so it never asks twice.
- The mod reads only the public changelog from GitHub; nothing about you is
  sent anywhere.
- Claude Code changes fast. The quests are short and link the docs, which
  are always the source of truth.

## How it works

- `hooks/quests.ts` — the course: quests, quizzes, badges, levels, and
  reading new features from the changelog. Plain data, tested on its own.
- `hooks/register.tsx` — the mod: the `/quests` command, the hooks that
  watch the session, the pane.
- `hooks/card.ts` — the shareable card, drawn on a canvas.

Run the tests with `claude plugin test`.

## License

MIT © 2026 Lucian Roman. Not affiliated with Anthropic.
