// The shareable progress card: one self-contained page that draws the card
// on a canvas (1200x675, the size X shows whole) with a button to save it as
// a PNG. Pure: the mod writes the page to a file and opens it.

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

const escape = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

export function cardHtml(data: CardData): string {
  const { level, into, size } = levelOf(data.xp)
  // Earned badges first, the hardest (latest in the list) leading: the row
  // shows as many as fit.
  const badges = BADGES.map((badge, i) => ({ name: badge.name, isEarned: data.badges.includes(badge.id), i }))
    .sort((a, b) => Number(b.isEarned) - Number(a.isEarned) || (a.isEarned ? b.i - a.i : a.i - b.i))
    .map(({ name, isEarned }) => ({ name, isEarned }))
  const payload = JSON.stringify({
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
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude Code quests: ${escape(data.rank)}, level ${level}</title>
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
  <canvas id="card" width="1200" height="675" role="img" aria-label="${escape(`Claude Code quests: level ${level}, ${data.done} of ${data.total} quests`)}"></canvas>
  <button id="save" type="button">Download PNG</button>
  <p>Post it on X with #ClaudeCode</p>
</main>
<script>
const D = ${payload}
const canvas = document.getElementById('card')
const ctx = canvas.getContext('2d')
const BG = '#14110e', PANEL = '#1f1a15', LINE = '#3a3026', TEXT = '#f6efe4', DIM = '#b9ad9c', ACCENT = '#f2b544'

function round(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath()
}
function draw() {
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

document.fonts.ready.then(draw)
draw()
document.getElementById('save').addEventListener('click', () => {
  const link = document.createElement('a')
  link.download = 'claude-code-level-' + D.level + '.png'
  link.href = canvas.toDataURL('image/png')
  link.click()
})
</script>
</body>
</html>`
}
