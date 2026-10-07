// The cat as a hand-drawn 12x12 sprite: letters are colours, "." is clear.
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
  S: [255, 214, 90],    // sparkle
}
const BASE = [
  '..K......K..',
  '.KOK....KOK.',
  '.KYYKKKKYYK.',
  '.KYYOOYYYYK.',
  '.KYBKOYKBYK.',
  '.KCYYPPYYCK.',
  'C.KCCCCCCK..',
  'TK.KRDDRK...',
  'T.YRRRRRRY..',
  'TTKKRRRRKK..',
  '.TTKNNKNNK..',
  '...KWWKWWK..',
]
const edit = (rows, changes) => rows.map((row, y) => {
  const c = changes[y]; if (!c) return row
  return [...row].map((ch, x) => (c[x] !== undefined && c[x] !== ' ' ? c[x] : ch)).join('')
})
// Frames: idle, tail wag, talking (mouth half and wide open), cheering (arms up, sparkles).
export const FRAMES = {
  idle: BASE,
  breathe: edit(BASE, { 6: '.C', 7: 'CK', 8: 'TT', 9: '.T' }),
  talk1: edit(BASE, { 6: '     MM' }),
  talk2: edit(BASE, { 5: '      ', 6: '    KMMK' }),
  cheer: edit(BASE, { 0: 'S         S', 1: '           ', 6: '    KMMK', 7: '  R      R ', 8: '  KRRRRRRK ' }),
  cheer2: edit(BASE, { 0: '.S        S.', 6: '     MM', 7: ' R        R' }),
}
