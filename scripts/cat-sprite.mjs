// The cat as a hand-drawn 9x8 sprite: letters are colours, "." is clear.
// The drawing is Lucian Roman's, all rights reserved.
export const COLORS = {
  K: [16, 12, 10],      // outline
  Y: [248, 181, 27],    // fur
  O: [214, 132, 30],    // fur shade, inner ear
  C: [240, 230, 212],   // muzzle, tail tip
  B: [52, 132, 222],    // eyes
  P: [232, 120, 130],   // nose, tongue
  M: [70, 20, 22],      // open mouth
  R: [242, 106, 33],    // shirt
  D: [190, 70, 25],     // shirt shade
  N: [44, 52, 74],      // trousers
  W: [236, 232, 222],   // shoes
  T: [232, 70, 50],     // tail
  S: [255, 255, 255],   // sparkle
}
const BASE = [
  '.Y.....Y.',
  '.YY...YY.',
  '.YYOOYYY.',
  '.YBKYKBY.',
  'CYCCPCCY.',
  'T.YRRRY..',
  'TT.NNN...',
  '..WW.WW..',
]
const edit = (rows, changes) => rows.map((row, y) => {
  const c = changes[y]; if (!c) return row
  return [...row].map((ch, x) => (c[x] !== undefined && c[x] !== ' ' ? c[x] : ch)).join('')
})
// Frames: idle, tail wag, talking (mouth half and wide open), cheering (arms up, sparkles).
export const FRAMES = {
  idle: BASE,
  breathe: edit(BASE, { 4: '.', 5: 'C', 7: 'T' }),
  talk1: edit(BASE, { 4: '    M' }),
  talk2: edit(BASE, { 4: '   MMM' }),
  cheer: edit(BASE, { 0: 'S       S', 4: '   MMM', 5: '  R   R' }),
  cheer2: edit(BASE, { 1: 'S       S', 4: '    M' }),
}
