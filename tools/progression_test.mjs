// Progression test Node : courbe de découverte — table UNLOCK_T, garde
// universelle (typeUnlockOk), fallback anti-pool-vide, bypass pinned.
import { readFileSync } from 'fs'

const src = [
  'js/physics.js',
  'js/patterns-defaults.js',
  'js/patterns.js'
].map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')

const storeStub = {}
global.localStorage = {
  getItem: k => storeStub[k] ?? null,
  setItem: (k, v) => { storeStub[k] = String(v) },
  removeItem: k => { delete storeStub[k] }
}
global.window = { location: { search: '' } }

const api = new Function(src + '\nreturn { Patterns, Phys, rowY, CELL }')()
const { Patterns, rowY, CELL } = api

let fails = 0
const check = (name, cond) => { if (!cond) { fails++; console.log('FAIL', name) } }

Patterns.load()

// --- 1) table UNLOCK_T (valeurs exactes de la spec) ---
const U = Patterns.UNLOCK_T
check('table UNLOCK_T présente', !!U && typeof U === 'object')
check('table UNLOCK_T', U.basic === 0 && U.dynamic === 0 && U.crumble === 90 && U.phase === 120 &&
  U.sticky === 210 && U.turbo === 240 && U.bouncy === 330 && U.seesaw === 360 && U.gold === 420)

// --- 2) alias legacy ghost -> phase ---
const legacy = { platforms: [{ type: 'ghost' }] }
check('ghost traité comme phase (120 s)', Patterns.typeUnlockOk(legacy, 119) === false && Patterns.typeUnlockOk(legacy, 120) === true)

// --- 2b) pool pédagogique : 6/tier, palettes cumulatives, vitrines ---
const TIER_NEW = { 1: ['dynamic'], 2: ['crumble', 'phase'], 3: ['sticky', 'turbo'], 4: ['bouncy', 'seesaw'], 5: ['gold'] }
const paletteOf = d => ['basic', ...[1, 2, 3, 4, 5].flatMap(t => TIER_NEW[t]).slice(0, [0, 1, 3, 5, 7, 8][d])]
const pool = Patterns.defaults()
check('30 patterns (6/tier)', pool.length === 30 && [1, 2, 3, 4, 5].every(d => pool.filter(p => p.difficulty === d).length === 6))
check('palettes par tier', pool.every(p => p.platforms.every(q => paletteOf(p.difficulty).includes(q.type === 'ghost' ? 'phase' : q.type))))
// vitrines : pour chaque tier d et chaque j < TIER_NEW[d].length, le pattern gen-t{d}-{j+1} :
//  contient le type, cellules >= 3, aucun spike, gaps <= 3 cells, 2 basic parmi les 3 premières
for (const d of [1, 2, 3, 4, 5]) for (let j = 0; j < TIER_NEW[d].length; j++) {
  const v = pool.find(p => p.id === 'gen-t' + d + '-' + (j + 1))
  const type = TIER_NEW[d][j]
  check('vitrine T' + d + ' ' + type, !!v && v.platforms.some(q => q.type === type && q.cells >= 3)
    && v.platforms.every(q => !q.spike)
    && v.platforms.slice(0, 3).filter(q => q.type === 'basic').length === 2
    && v.platforms.every((q, k, a) => k === 0 || (q.x - (a[k - 1].x + a[k - 1].cells * 32)) / 32 <= 3))
}
check('dynamic T1 doux (amp <= 16, spd <= 1.6)', pool.filter(p => p.difficulty === 1).flatMap(p => p.platforms).filter(q => q.type === 'dynamic').every(q => q.amp <= 16 && q.spd <= 1.6))

// --- 2c) poids par fenêtres de tier + anti-répétition profondeur 5 ---
const poolW = pool
check('weightOf exposé', typeof Patterns.weightOf === 'function')
const t1p = poolW.find(p => p.difficulty === 1)
const t3p = poolW.find(p => p.id === 'gen-t3-1') // vitrine sticky, sans turbo
const t4p = poolW.find(p => p.difficulty === 4 && Patterns.typeUnlockOk(p, 540))
const t5p = poolW.find(p => p.difficulty === 5)
// Cap 9 min = le plus dur : T5 domine T4 domine T1
check('cap 540 s : T5 > T4 > T1',
  Patterns.weightOf(t5p, 540) > Patterns.weightOf(t4p, 540) &&
  Patterns.weightOf(t4p, 540) > Patterns.weightOf(t1p, 540))
// Tier actif à 240 s = T3 : sa vitrine pèse plus qu'un pattern T1
check('fenêtre 240 s : T3 actif > T1', Patterns.weightOf(t3p, 240) > Patterns.weightOf(t1p, 240))
// Facteurs exacts : base × 2.2 (actif), × 0.3 (deux tiers derrière)
const baseT3_240 = 30 * (240 / 540)
const baseT1_240 = 120 - 118 * (240 / 540)
check('facteur tier actif ×2.2', Math.abs(Patterns.weightOf(t3p, 240) - baseT3_240 * 2.2) < 1e-6)
check('facteur ancien ×0.3', Math.abs(Patterns.weightOf(t1p, 240) - baseT1_240 * 0.3) < 1e-6)
// Anti-répétition : après un tirage, le pattern tiré est pénalisé (×0.1),
// le précédent l'est encore (×0.2) — les ping-pong A,B,A,B s'effondrent.
const sigMap = {}
for (const p of poolW) sigMap[p.platforms.map(q => (q.type === 'ghost' ? 'phase' : q.type) + q.cells).join('-')] = p
const beforeW = {}
for (const p of poolW) beforeW[p.id] = Patterns.weightOf(p, 200)
let last2 = { x: 16, row: 2, y: rowY(2), w: 5 * CELL }
const drawnPats = []
for (let i = 0; i < 12 && drawnPats.length < 2; i++) {
  const sec = Patterns.spawnSection(last2, 200)
  const sig = sec.platforms.map(p => p.type + Math.round(p.w / 32)).join('-')
  const pat = sigMap[sig]
  if (pat && pat.id !== (drawnPats[0] && drawnPats[0].id)) drawnPats.push(pat)
  last2 = sec.platforms[sec.platforms.length - 1] || last2
}
check('2 patterns distincts tirés', drawnPats.length === 2)
check('dernier tiré pénalisé (×0.1)', Patterns.weightOf(drawnPats[1], 200) <= beforeW[drawnPats[1].id] * 0.1 + 1e-9)
check('précédent tiré pénalisé (×0.2)', Patterns.weightOf(drawnPats[0], 200) <= beforeW[drawnPats[0].id] * 0.2 + 1e-9)

// --- 2d) transposition verticale à l'instanciation (T1 n'est plus tout en bas) ---
const t1v = pool.find(p => p.difficulty === 1)
const anchorV = { x: -4 * 32, row: 2, y: rowY(2), baseY: rowY(2), w: 4 * 32, type: 'basic', amp: 0, spd: 0, ph: 0 }
let baseLevels = new Set(), relSpan = null
for (let i = 0; i < 30; i++) {
  const inst = Patterns.instantiate(t1v, { x: 0, row: 2, y: rowY(2), w: 4 * 32 })
  const rows = inst.platforms.map(p => p.row)
  const mn = Math.min(...rows), mx = Math.max(...rows)
  baseLevels.add(mn)
  if (relSpan === null) relSpan = mx - mn
  check('transposition : lignes dans 0-4', mn >= 0 && mx <= 4)
  check('transposition : géométrie relative intacte', mx - mn === relSpan)
}
check('transposition : le niveau de base varie (>= 2 niveaux vus)', baseLevels.size >= 2)

// --- 3) ensemble éligible jamais vide sur la run (pool par défaut) ---
let vide = -1
for (let s = 0; s < 540 && vide < 0; s++) {
  if (!Patterns.defaults().some(p => Patterns.typeUnlockOk(p, s))) vide = s
}
check('ensemble éligible non vide sur 0-539 s', vide < 0)

// --- 4) simulation : aucune plateforme d'un type verrouillé ---
let last = { x: 16, row: 2, y: rowY(2), w: 5 * CELL }
const lateTypes = {}
let safetyCount = 0
for (let i = 0; i < 400; i++) {
  const el = i * 1.35
  const sec = Patterns.spawnSection(last, el)
  for (const p of sec.platforms) {
    if (p.safety) safetyCount++
    if ((U[p.type] || 0) > el) lateTypes[p.type] = Math.round(el)
  }
  last = sec.platforms[sec.platforms.length - 1] || last
}
check('aucun type verrouillé tiré avant son UNLOCK_T', Object.keys(lateTypes).length === 0)
check('pool sain : aucune plateforme de sécurité', safetyCount === 0)

// --- 5) fallback anti-pool-vide : pool 100 % exotique joué dès 0 s ---
const exotic = { id: 'x1', name: 'X', difficulty: 1, entry: { row: 2 }, platforms: [{ x: 64, row: 2, cells: 3, type: 'bouncy', yOff: 0, amp: 0, spd: 0, spike: null }], balls: [], decor: [] }
Patterns.setPatterns([JSON.parse(JSON.stringify(exotic))])
const secX = Patterns.spawnSection(last, 0)
check('pool exotique : fallback sans safety', secX.platforms.length === 1 && secX.platforms[0].type === 'bouncy' && !secX.platforms[0].safety)
Patterns.resetUser()

// --- 6) pinned bypass : pattern épinglé joué tel quel, garde coupée ---
Patterns.pin(JSON.parse(JSON.stringify(exotic)))
const secP = Patterns.spawnSection(last, 0)
check('pinned bypass la garde', secP.platforms.some(p => p.type === 'bouncy') && !secP.platforms[0].safety)
Patterns.pin(null)

console.log(fails === 0 ? '\nPROGRESSION OK — tous les checks passent' : `\n${fails} ÉCHEC(S)`)
process.exit(fails === 0 ? 0 : 1)
