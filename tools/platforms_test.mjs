// Test Node : fondations « plateformes fun » — constantes physiques,
// phaseSolid et rebond paramétrable (js/physics.js). Complète smoke_test.mjs
// sans charger le runtime du jeu (même harness : concaténation + new Function).
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

// Les checks vivent DANS le scope concaténé : les constantes globales de
// physics.js n'existent pas forcément encore (TDD) — typeof les épingle sans
// ReferenceError tant qu'elles sont absentes.
function driverFn() {
  let fails = 0
  const check = (name, cond) => { if (!cond) { fails++; console.log('FAIL', name) } }

  Patterns.load()

  // --- 1) constantes du plan (valeurs exactes) ---
  check('STICKY_MUL 1.15', typeof STICKY_MUL !== 'undefined' && STICKY_MUL === 1.15)
  check('CRUMBLE_T 0.8', typeof CRUMBLE_T !== 'undefined' && CRUMBLE_T === 0.8)
  check('PHASE_CYCLE 2.0', typeof PHASE_CYCLE !== 'undefined' && PHASE_CYCLE === 2.0)
  check('PHASE_SOLID 0.6', typeof PHASE_SOLID !== 'undefined' && PHASE_SOLID === 0.6)
  check('TURBO_MUL 1.5', typeof TURBO_MUL !== 'undefined' && TURBO_MUL === 1.5)
  check('TURBO_MIN 180', typeof TURBO_MIN !== 'undefined' && TURBO_MIN === 180)
  check('GOLD_AIRJUMP_T 10', typeof GOLD_AIRJUMP_T !== 'undefined' && GOLD_AIRJUMP_T === 10)
  check('BASCULE_VX 200', typeof BASCULE_VX !== 'undefined' && BASCULE_VX === 200)
  check('BASCULE_VY_MUL 0.9', typeof BASCULE_VY_MUL !== 'undefined' && BASCULE_VY_MUL === 0.9)
  check('COMBO_STEP 1.12', typeof COMBO_STEP !== 'undefined' && COMBO_STEP === 1.12)
  check('COMBO_MAX 1.5', typeof COMBO_MAX !== 'undefined' && COMBO_MAX === 1.5)
  check('RHYTHM_MUL 1.15', typeof RHYTHM_MUL !== 'undefined' && RHYTHM_MUL === 1.15)

  // --- 2) phaseSolid : cycle solide/traversable ---
  check('phaseSolid existe', typeof Phys.phaseSolid === 'function')
  check('phase solide en début de cycle', !!Phys.phaseSolid && Phys.phaseSolid({ phase0: 0 }, 0) === true)
  check('phase solide à 1.0 s', !!Phys.phaseSolid && Phys.phaseSolid({ phase0: 0 }, 1.0) === true)
  check('phase traversable à 1.4 s', !!Phys.phaseSolid && Phys.phaseSolid({ phase0: 0 }, 1.4) === false)
  check('phase boucle sur 2 cycles', !!Phys.phaseSolid && Phys.phaseSolid({ phase0: 0.5 }, 1.2) === true)
  check('phaseSolid tolère phase0 absent', !!Phys.phaseSolid && Phys.phaseSolid({}, 0) === true)

  // --- 3) normPhys : le défaut stickyMul ne doit pas être écrasé par la borne ---
  const np = Phys.normalize(null)
  check('normPhys garde stickyMul 1.15', np.stickyMul === 1.15)

  // --- 4) canReachBounce : surcharges vx/vy (ruling : l'appel à 6 arguments
  // fonctionne) — la surcharge est réellement consommée : la cible ci-dessous
  // est atteinte à (200,-360) mais manquée avec les défauts (140,-400).
  const cbA = { x: 0, y: rowY(2), w: 4 * CELL }
  const cbT = { x: 10 * CELL, y: rowY(2), w: 3 * CELL }
  let cb6 = false
  try { cb6 = typeof Phys.canReachBounce(cbA, cbT, [], null, 200, -360) === 'boolean' } catch (e) {}
  check('canReachBounce : appel 6 args vx/vy', cb6)
  check('canReachBounce : surcharge vx/vy utilisée', Phys.canReachBounce(cbA, cbT, [], null, 200, -360) === true)
  check('canReachBounce : défauts sans surcharge', Phys.canReachBounce(cbA, cbT, [], null) === false)

  // --- 5) alias ghost -> phase (compat anciens patterns/exports) ---
  // Géométrie : les x des patterns sont relatifs à l'ancrage (dx = 0 + 4*CELL).
  // La cible seesaw est posée à portée du saut visé depuis la plateforme
  // fantôme (inst x = 448, zone atteignable 294..526) — à la même position
  // qu'elle, aucun des 14 combos ne repasse dessus (et { dj: 0 } interdit le
  // saut double).
  const patGhost = { id: 't-alias', name: 'alias', difficulty: 1, entry: { row: 2 },
    platforms: [{ x: 3 * CELL, row: 2, cells: 3, type: 'ghost', yOff: 0, amp: 0, spd: 0, spike: null }], balls: [], decor: [] }
  check('validatePattern accepte ghost (alias)', Patterns.validatePattern(patGhost).length === 0)
  const anchor = { x: 0, row: 2, y: rowY(2), w: 4 * CELL, type: 'basic' }
  const instG = Patterns.instantiate(patGhost, anchor)
  check('instantiate normalise ghost -> phase', instG.platforms[0].type === 'phase')
  check('phase0 toujours défini', typeof instG.platforms[0].phase0 === 'number')

  // --- 6) seesaw validé comme famille rebond ---
  const patSeesaw = { id: 't-seesaw', name: 'seesaw', difficulty: 3, entry: { row: 2 },
    platforms: [{ x: 10 * CELL, row: 2, cells: 3, type: 'seesaw', yOff: 0, amp: 0, spd: 0, spike: null }], balls: [], decor: [] }
  check('validatePattern accepte seesaw', Patterns.validatePattern(patSeesaw).length === 0)
  const instS = Patterns.instantiate(patSeesaw, anchor)
  const r = Patterns.jumpOk(instG.platforms[0], instS.platforms[0], [], { dj: 0 })
  check('jumpOk depuis phase vers seesaw (source famille basique)', r.ok)
  // Source seesaw = famille rebond à vitesse bascule (BASCULE_VX, -BOUNCE_VY
  // × BASCULE_VY_MUL) : la cible (inst x = 736) est atteinte à (200,-360) mais
  // manquée avec le rebond orange par défaut (140,-400) — le via épingle la
  // branche bounce, pas un saut visé.
  const patLoin = { id: 't-bascule', name: 'bascule', difficulty: 3, entry: { row: 2 },
    platforms: [{ x: 19 * CELL, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null }], balls: [], decor: [] }
  const instL = Patterns.instantiate(patLoin, anchor)
  const rb = Patterns.jumpOk(instS.platforms[0], instL.platforms[0], [], { dj: 0 })
  check('jumpOk depuis seesaw (famille rebond, vitesse bascule)', rb.ok && rb.via === 'bounce')

  // --- 7) catalogue : 9 types, champ hérité dynLife toujours toléré ---
  check('TYPES a 9 types', Patterns.TYPES.length === 9 && Patterns.TYPES.indexOf('turbo') >= 0 && Patterns.TYPES.indexOf('gold') >= 0 && Patterns.TYPES.indexOf('seesaw') >= 0)
  check('layout normalisé : dynLife hérité borné (4)', Patterns.getLayout().plat.dynLife === 4)

  console.log(fails === 0 ? '\nPLATFORMS OK — tous les checks passent' : '\n' + fails + ' ÉCHEC(S)')
  if (fails > 0) throw new Error('platforms_test failed')
}

const fn = new Function(src + '\n;(' + driverFn.toString() + ')()')
try {
  fn()
} catch (e) {
  console.error('EXCEPTION :', e.message)
  process.exit(1)
}
