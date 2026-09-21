// Smoke test Node : charge physics + patterns et simule une partie complète.
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
const { Patterns, Phys, rowY, CELL } = api

let fails = 0
const check = (name, cond) => { if (!cond) { fails++; console.log('FAIL', name) } }

Patterns.load()

// 1. Pool par défaut présent et valide
const defs = Patterns.defaults()
check('pool par défaut >= 20 sections', defs.length >= 20)
check('default pool valide', defs.every(p => Patterns.validatePattern(p).length === 0))
check('chaînage interne valide', defs.every(p => Patterns.validatePatternJumps(p).ok))

// 2. Simulation de partie : 400 sections sur 0 -> 200 s
let last = { x: 16, row: 2, y: rowY(2), w: 5 * CELL }
let elapsed = 0, nSec = 0, safetyCount = 0
const t0 = Date.now()
for (let i = 0; i < 400; i++) {
  elapsed = i * 0.5
  const sec = Patterns.spawnSection(last, elapsed)
  for (const p of sec.platforms) {
    check('plateforme dans l\'écran vertical', p.y >= 0 && p.y <= 270)
    if (p.safety) safetyCount++
    last = p
  }
  nSec++
}
check('400 sections générées', nSec === 400)
check('aucune plateforme de sécurité (pool sain)', safetyCount === 0)
console.log('   temps sim :', Date.now() - t0, 'ms')

// 3. Import/export roundtrip
const code = Patterns.exportCode()
const res = Patterns.importData(code)
check('export/import code roundtrip', res.ok && res.data.patterns.length === 0)
const patCode = Patterns.patternToCode(defs[0])
const res2 = Patterns.importData(patCode)
check('export/import pattern unique', res2.ok && res2.data.patterns.length === 1 && res2.data.patterns[0].id === defs[0].id)

// 4. Import corrompu rejeté
check('code corrompu rejeté', Patterns.importData('SLIME1.!!!').ok === false)
check('json invalide rejeté', Patterns.importData('{oops').ok === false)
check('format inconnu rejeté', Patterns.importData('{"format":"x","patterns":[]}').ok === false)

// 5. Pattern invalide rejeté (row hors grille)
const bad = JSON.parse(JSON.stringify(defs[0])); bad.platforms[0].row = 9
check('pattern invalide détecté', Patterns.validatePattern(bad).length > 0)

// 6. Layout par défaut + applyLayout via Phys
check('layout par défaut', Patterns.getLayout().walls.ceil === 28)

// 7. Pin mode test
Patterns.pin(defs[3])
const sec = Patterns.spawnSection(last, 0)
check('pin : section instanciée', sec.platforms.length > 0)
Patterns.pin(null)

// 8. Murs verticaux
// 8a. colonne dont le sommet est un palier légitime -> chaîne valide
const murTop = {
  id: 't-mur-top', name: 'mur top', difficulty: 3, entry: { row: 2 },
  platforms: [
    { x: 96, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null },
    { x: 384, row: 1, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null }
  ],
  walls: [{ x: 288, cells: 1, row: 1, kind: 'ground', spiked: true }],
  balls: [], decor: []
}
check('mur-top : schéma valide', Patterns.validatePattern(murTop).length === 0)
const vt = Patterns.validatePatternJumps(murTop)
check('mur-top : chaîne valide (saut sur le sommet)', vt.ok)
check('mur-top : 3 nœuds (2 plat + sommet)', vt.jumps.length === 3)

// 8b. mur infranchissable -> chaîne invalide
const murBloque = {
  id: 't-mur-ko', name: 'mur bloquant', difficulty: 4, entry: { row: 2 },
  platforms: [
    { x: 96, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null },
    { x: 384, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null }
  ],
  walls: [{ x: 224, cells: 2, row: 0, kind: 'ground', spiked: true }],
  balls: [], decor: []
}
check('mur-bloquant : détecté impossible', Patterns.validatePatternJumps(murBloque).ok === false)

// 8c. stalactite bloquant un passage bas -> invalide
const murCeil = {
  id: 't-mur-ceil', name: 'stalactite bloquante', difficulty: 4, entry: { row: 2 },
  platforms: [
    { x: 96, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null },
    { x: 320, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null }
  ],
  walls: [{ x: 224, cells: 1, row: 2, kind: 'ceil', spiked: false }],
  balls: [], decor: []
}
check('stalactite : détectée impossible', Patterns.validatePatternJumps(murCeil).ok === false)

// 8d. instanciation : le sommet devient une plateforme wallTop, les murs sortent
{
  const anchor = { x: -128, row: 2, y: rowY(2), baseY: rowY(2), w: 128, type: 'basic', amp: 0, spd: 0, ph: 0 }
  const inst = Patterns.instantiate(murTop, anchor)
  check('instantiate : murs géolocalisés', inst.walls.length === 1 && inst.walls[0].y1 === rowY(1) && inst.walls[0].y2 === 270)
  const top = inst.platforms.find(p => p.wallTop)
  check('instantiate : sommet wallTop présent', !!top && top.y === rowY(1) && top.w === 32)
}

// 8e. rétro-compatibilité : pattern sans champ walls
const sansMurs = JSON.parse(JSON.stringify(defs[0]))
check('rétro-compat sans walls', Patterns.validatePattern(sansMurs).length === 0)

console.log(fails === 0 ? '\nTOUS LES TESTS PASSENT' : `\n${fails} ÉCHEC(S)`)
process.exit(fails === 0 ? 0 : 1)
