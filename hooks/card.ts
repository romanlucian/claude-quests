// The shareable cards, your level and your week: each one self-contained
// page that draws the card on a canvas (1200x675, the size X shows whole)
// with a button to save it as a PNG. Pure: the mod writes the page to a file
// and opens it.

import { BADGES, levelOf } from './quests'

export type CardData = {
  xp: number
  rank: string
  done: number // core quests done
  total: number // core quests
  daily: number // daily docs quests done
  tried: number // new features tried
  mastered: number // questions mastered
  streak: number
  badges: readonly string[] // earned badge ids
  date: string
}

/** Your week: what the week card shows. */
export type WeekCardData = {
  week: string // YYYY-Www
  gained: number // XP this week
  level: number
  rank: string
  topics: readonly string[] // docs pages studied this week
  reviews: number
  fixed: number // weak spots fixed
  isBossBeaten: boolean
  streak: number
  mastered: number
  date: string
}

const escape = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)
// A payload safe inside <script>: page titles come from the docs index.
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')

export function cardHtml(data: CardData): string {
  const { level, into, size } = levelOf(data.xp)
  // Earned badges first, the hardest (latest in the list) leading: the row
  // shows as many as fit.
  const badges = BADGES.map((badge, i) => ({ name: badge.name, isEarned: data.badges.includes(badge.id), i }))
    .sort((a, b) => Number(b.isEarned) - Number(a.isEarned) || (a.isEarned ? b.i - a.i : a.i - b.i))
    .map(({ name, isEarned }) => ({ name, isEarned }))
  const payload = scriptJson({
    level,
    into,
    size,
    xp: data.xp,
    rank: data.rank,
    done: data.done,
    total: data.total,
    daily: data.daily,
    tried: data.tried,
    mastered: data.mastered,
    streak: data.streak,
    badges,
    date: data.date,
  })
  return page({
    title: `Claude Code quests: ${data.rank}, level ${level}`,
    label: `Claude Code quests: level ${level}, ${data.done} of ${data.total} quests`,
    file: `claude-code-level-${level}.png`,
    payload,
    draw: `function draw() {
  ctx.fillStyle = BG; ctx.fillRect(0, 0, 1200, 675)
  // A pixel border, a nod to the quest-game look.
  ctx.fillStyle = ACCENT
  for (let x = 0; x < 1200; x += 24) { ctx.fillRect(x, 0, 12, 6); ctx.fillRect(x + 12, 669, 12, 6) }

  ctx.fillStyle = ACCENT; ctx.font = '600 22px "IBM Plex Mono"'; ctx.textBaseline = 'alphabetic'
  ctx.fillText('■ CLAUDE CODE QUESTS · ' + D.rank.toUpperCase(), 72, 96)

  ctx.fillStyle = TEXT; ctx.font = '700 ' + (D.level < 10 ? 132 : D.level < 100 ? 108 : 88) + 'px Silkscreen'
  ctx.fillText('LEVEL ' + D.level, 64, 250)

  // XP bar to the next level.
  round(72, 292, 620, 26, 13); ctx.fillStyle = PANEL; ctx.fill()
  const w = Math.max(26, 620 * D.into / D.size)
  round(72, 292, w, 26, 13); ctx.fillStyle = ACCENT; ctx.fill()
  ctx.fillStyle = DIM; ctx.font = '400 20px "IBM Plex Mono"'
  ctx.fillText(D.xp + ' XP · ' + (D.size - D.into) + ' to level ' + (D.level + 1), 72, 356)

  ctx.fillStyle = TEXT; ctx.font = '600 44px "IBM Plex Mono"'
  ctx.fillText(D.done + ' / ' + D.total + ' quests', 72, 420)
  const extras = []
  if (D.streak > 0) extras.push('🔥 ' + D.streak + '-day streak')
  extras.push(D.daily + ' daily', D.mastered + ' mastered')
  ctx.fillStyle = DIM; ctx.font = '400 22px "IBM Plex Mono"'
  ctx.fillText(extras.join('  ·  '), 72, 462)

  // Badges.
  ctx.font = '600 20px "IBM Plex Mono"'
  let x = 72
  const y = 490
  for (const badge of D.badges) {
    const label = (badge.isEarned ? '★ ' : '☆ ') + badge.name
    const bw = ctx.measureText(label).width + 36
    if (x + bw > 1128) break
    round(x, y, bw, 48, 24)
    ctx.fillStyle = badge.isEarned ? '#3b2e14' : PANEL; ctx.fill()
    ctx.strokeStyle = badge.isEarned ? ACCENT : LINE; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = badge.isEarned ? ACCENT : '#7d7266'
    ctx.fillText(label, x + 18, y + 31)
    x += bw + 14
  }

  ctx.fillStyle = DIM; ctx.font = '400 19px "IBM Plex Mono"'
  ctx.fillText('Learn Claude Code by doing · github.com/romanlucian/claude-quests', 72, 616)
  ctx.textAlign = 'right'; ctx.fillText(D.date, 1128, 616); ctx.textAlign = 'left'

  // A trophy in pixels, top right.
  const px = 14, ox = 900, oy = 110
  const art = [
    '..########..',
    '##########.#',
    '#.########.#',
    '#.########.#',
    '.#.######.#.',
    '...######...',
    '....####....',
    '.....##.....',
    '.....##.....',
    '...######...',
    '..########..',
  ]
  art.forEach((row, j) => [...row].forEach((c, i) => {
    if (c === '#') { ctx.fillStyle = j < 6 ? ACCENT : '#c98f2a'; ctx.fillRect(ox + i * px, oy + j * px, px, px) }
  }))
}

`,
  })
}

export function weekCardHtml(data: WeekCardData): string {
  const weekNumber = Number(data.week.split('-W')[1] ?? 0)
  const payload = scriptJson({ ...data, weekNumber })
  return page({
    title: `Claude Code quests: my week ${weekNumber}`,
    label: `Claude Code quests, week ${weekNumber}: ${data.gained} XP, ${data.topics.length} topics studied`,
    file: `claude-code-week-${weekNumber}.png`,
    payload,
    draw: `function draw() {
  ctx.fillStyle = BG; ctx.fillRect(0, 0, 1200, 675)
  ctx.fillStyle = ACCENT
  for (let x = 0; x < 1200; x += 24) { ctx.fillRect(x, 0, 12, 6); ctx.fillRect(x + 12, 669, 12, 6) }

  ctx.fillStyle = ACCENT; ctx.font = '600 22px "IBM Plex Mono"'; ctx.textBaseline = 'alphabetic'
  ctx.fillText('■ CLAUDE CODE QUESTS · MY WEEK ' + D.weekNumber, 72, 96)

  ctx.fillStyle = TEXT; ctx.font = '700 120px Silkscreen'
  ctx.fillText('+' + D.gained + ' XP', 64, 232)
  ctx.fillStyle = DIM; ctx.font = '400 22px "IBM Plex Mono"'
  ctx.fillText(D.rank + ' · Level ' + D.level + (D.streak > 0 ? '  ·  🔥 ' + D.streak + '-day streak' : ''), 72, 280)

  // What I learned: the pages studied, as many as fit.
  ctx.fillStyle = ACCENT; ctx.font = '600 20px "IBM Plex Mono"'
  ctx.fillText('WHAT I LEARNED', 72, 348)
  ctx.fillStyle = TEXT; ctx.font = '600 28px "IBM Plex Mono"'
  const topics = D.topics.length > 0 ? D.topics : ['Practice and review']
  const shown = topics.slice(0, 4)
  shown.forEach((topic, i) => {
    let text = '▸ ' + topic
    while (ctx.measureText(text).width > 640 && text.length > 4) text = text.slice(0, -2) + '…'
    ctx.fillText(text, 72, 392 + i * 44)
  })
  if (topics.length > 4) { ctx.fillStyle = DIM; ctx.font = '400 20px "IBM Plex Mono"'; ctx.fillText('+ ' + (topics.length - 4) + ' more', 72, 392 + 4 * 44) }

  // The numbers, as pills down the right.
  const stats = [
    [String(D.reviews), 'reviews right'],
    [String(D.mastered), 'questions mastered'],
    [D.isBossBeaten ? '⚔️ ✓' : '⚔️ –', D.isBossBeaten ? 'weekly boss beaten' : 'weekly boss'],
  ]
  if (D.fixed > 0) stats.push([String(D.fixed), D.fixed === 1 ? 'weak spot fixed' : 'weak spots fixed'])
  stats.forEach(([value, label], i) => {
    const y = 316 + i * 64
    round(780, y, 348, 52, 14); ctx.fillStyle = PANEL; ctx.fill(); ctx.strokeStyle = LINE; ctx.lineWidth = 2; ctx.stroke()
    ctx.fillStyle = ACCENT; ctx.font = '700 26px "IBM Plex Mono"'; ctx.fillText(value, 802, y + 35)
    ctx.fillStyle = DIM; ctx.font = '400 20px "IBM Plex Mono"'; ctx.fillText(label, 802 + Math.max(84, ctx.measureText(value).width + 40), y + 34)
  })

  ctx.fillStyle = DIM; ctx.font = '400 19px "IBM Plex Mono"'
  ctx.fillText('Learn Claude Code by doing · github.com/romanlucian/claude-quests', 72, 616)
  ctx.textAlign = 'right'; ctx.fillText(D.date, 1128, 616); ctx.textAlign = 'left'
}
`,
  })
}

function page(card: { title: string; label: string; file: string; payload: string; draw: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(card.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root { color-scheme: dark; }
  html, body { margin: 0; background: #0d0c0b; color: #f6efe4; font: 15px/1.5 'IBM Plex Mono', ui-monospace, monospace; }
  main { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 24px 16px; }
  canvas { width: min(1200px, 100%); height: auto; border-radius: 12px; box-shadow: 0 20px 60px #000a; }
  button { font: inherit; font-weight: 600; background: #f2b544; color: #1a1408; border: 0; border-radius: 8px; padding: 12px 20px; cursor: pointer; min-height: 44px; }
  button:hover { background: #ffc85e; }
  p { margin: 0; color: #b9ad9c; }
</style>
</head>
<body>
<main>
  <canvas id="card" width="1200" height="675" role="img" aria-label="${escape(card.label)}"></canvas>
  <button id="save" type="button">Download PNG</button>
  <p>Post it on X with #ClaudeCode</p>
</main>
<script>
const D = ${card.payload}
const canvas = document.getElementById('card')
const ctx = canvas.getContext('2d')
const BG = '#14110e', PANEL = '#1f1a15', LINE = '#3a3026', TEXT = '#f6efe4', DIM = '#b9ad9c', ACCENT = '#f2b544'

function round(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
${card.draw}
document.fonts.ready.then(draw)
draw()
document.getElementById('save').addEventListener('click', () => {
  const link = document.createElement('a')
  link.download = ${JSON.stringify(card.file)}
  link.href = canvas.toDataURL('image/png')
  link.click()
})
</script>
</body>
</html>`
}
