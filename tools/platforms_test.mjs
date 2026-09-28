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
