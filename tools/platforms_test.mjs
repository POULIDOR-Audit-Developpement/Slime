// Test Node : « plateformes fun » — fondations (Lot 0 : constantes physiques,
// phaseSolid, rebond paramétrable, alias ghost->phase, seesaw) + mécaniques
// runtime de js/game.js (Lot 1). Le fichier charge la MÊME liste que
// game_sim.mjs (stubs litecanvas/DOM identiques) : les checks game.js partagent
// le scope du code (driver évalué DANS la Function, cf. driverFn de game_sim).
// `sfx` est un stub enregistreur (sfxCalls) : les checks de sons comparent les
// appels réels du runtime (nom de constante zzfx + pitch + volume).
import { readFileSync } from 'fs'

const src = [
  'js/crypto.js',
  'js/music.js',
  'js/physics.js',
  'js/slime-colors.js',
  'js/sprites.js',
  'js/patterns-defaults.js',
  'js/patterns.js',
  'js/i18n.js',
  'js/game.js'
].map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')

const sfxLog = []

// ---------- stubs litecanvas / DOM (identiques à game_sim.mjs) ----------
const W = 960, H = 540
const noop = () => {}
const ctxStub = () => {
  const c = {}
  const grad = { addColorStop: noop }
  return new Proxy(c, {
    get: (t, k) => {
      if (k === 'canvas') return { width: W, height: H }
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad
      return (t[k] ||= (...a) => undefined)
    },
    set: (t, k, v) => { t[k] = v; return true }
  })
}
const litecanvasStubs = {
  litecanvas: noop,
  W, H, T: 0,
  paint: noop,
  ctx: ctxStub,
  cls: noop, rectfill: noop, rect: noop, circfill: noop, circ: noop,
  line: noop, shape: noop, fill: noop, text: noop,
  textalign: noop, textsize: noop, alpha: noop, push: noop, pop: noop,
  pal: noop,
  sfx: (n, p, v) => { sfxLog.push([n, p, v]) },
  sfxCalls: sfxLog,
  volume: noop,
  rand: (a, b) => a + Math.random() * (b - a),
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  lerp: (a, b, t) => a + (b - a) * t,
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  iskeypressed: () => false,
  localStorage: (() => { const s = {}; return {
    getItem: k => s[k] ?? null, setItem: (k, v) => { s[k] = String(v) }, removeItem: k => { delete s[k] }
  } })(),
  window: { location: { search: '' }, innerHeight: 540, innerWidth: 960, addEventListener: noop },
  navigator: { userAgent: 'node' },
  document: { documentElement: {}, body: { appendChild: noop, removeChild: noop }, createElement: () => ({ style: {}, focus: noop, select: noop }) },
  // Image stub : src posé -> onload en microtâche (permet à Sprites.ready de
  // passer true après un await, pour tester le chemin « sprites » de drawPlat ;
  // pas de width : les tuiles restent invisibles, seuls les appels comptent).
  Image: class { set src(v) { if (this.onload) queueMicrotask(this.onload) } }
}

// Les checks vivent DANS le scope concaténé : accès direct aux internals de
// game.js (land, execJump, updSlime, slime, platforms, gameT, ...).
// Async : la partie sprite de T7 attend un tour de microtâches (onload des
// Image stubs -> Sprites.ready true) ; tout le reste reste synchrone.
async function driverFn() {
  let fails = 0
  const check = (name, cond) => { if (!cond) { fails++; console.log('FAIL', name) } }
  // Une section = un lot de mécaniques ; une exception n'interrompt pas la suite.
  const section = (name, fn) => {
    const before = fails
    try { fn() } catch (e) { fails++; console.log('FAIL', name + ' (exception : ' + e.message + ')') }
    if (fails === before) console.log('ok  ', name)
  }
  // Partie neuve + boucle lancée (sinon update() gèle tout avant le 1er saut).
  // Caméra ralentie (20 px/s) : un slime posé reste dans le cadre [camX+25,
  // camX+455] même sur les boucles longues (gold 10 s) ; monde tronqué à la
  // plateforme de départ : chaque section ajoute ses propres plateformes.
  const fresh = (phys) => {
    Patterns.setLayout({ phys: Object.assign({ camBase: 20, camMax: 20 }, phys || {}) })
    applyLayout()
    startGame()
    runStarted = true
    platforms = platforms.slice(0, 1)
    wallsArr.length = 0
    balls.length = 0
    decors.length = 0
  }

  Patterns.load()

  // --- 1) constantes du plan (valeurs exactes) ---
  check('STICKY_MUL 0.8', typeof STICKY_MUL !== 'undefined' && STICKY_MUL === 0.8)
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
  check('normPhys garde stickyMul défaut 0.8', np.stickyMul === 0.8)

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
  const patLoin = { id: 't-bascule', name: 'bascule', difficulty: 3, entry: { row: 2 },
    platforms: [{ x: 19 * CELL, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null }], balls: [], decor: [] }
  const instL = Patterns.instantiate(patLoin, anchor)
  const rb = Patterns.jumpOk(instS.platforms[0], instL.platforms[0], [], { dj: 0 })
  check('jumpOk depuis seesaw (famille rebond, vitesse bascule)', rb.ok && rb.via === 'bounce')

  // --- 7) catalogue : 9 types, champ hérité dynLife toujours toléré ---
  check('TYPES a 9 types', Patterns.TYPES.length === 9 && Patterns.TYPES.indexOf('turbo') >= 0 && Patterns.TYPES.indexOf('gold') >= 0 && Patterns.TYPES.indexOf('seesaw') >= 0)
  check('layout normalisé : dynLife hérité borné (4)', Patterns.getLayout().plat.dynLife === 4)

  // --- 8) T9 : pool régénéré — les 4 nouveaux types + règles de génération ---
  // Tourne sur le pool chargé du disque (js/patterns-defaults.js) : les checks
  // épinglent la SORTIE de tools/gen_defaults.mjs, pas l'ancien pool.
  section('T9 : pool régénéré (nouveaux types, gold rare, phase <=2 consécutives)', () => {
    // Le pool régénéré contient au moins 1 pattern avec chaque nouveau type
    const pool = Patterns.defaults()
    for (const t of ['phase', 'turbo', 'gold', 'seesaw']) check('pool contient ' + t, pool.some(p => p.platforms.some(q => q.type === t)))
    check('gold rare (<= 4 % des plateformes)', (() => { const all = pool.flatMap(p => p.platforms); return all.filter(q => q.type === 'gold').length / all.length <= 0.04 })())
    check('phase jamais > 2 consécutives dans un pattern', pool.every(p => { let c = 0; for (const q of p.platforms) { c = q.type === 'phase' ? c + 1 : 0; if (c > 2) return false } return true }))
    check('gold max 1 par pattern', pool.every(p => p.platforms.filter(q => q.type === 'gold').length <= 1))
  })

  // ================= Lot 1 : mécaniques runtime (js/game.js) =================
  init()

  // --- T3 : champs slime du lot ---
  section('T3 : init slime (bounceCombo, goldT, turboT)', () => {
    fresh()
    check('slime.bounceCombo/goldT/turboT initialisés à 0', slime.bounceCombo === 0 && slime.goldT === 0 && slime.turboT === 0)
  })

  section('T3 : fin du timer dynamique (PLAT sans dynLife)', () => {
    check('PLAT n\'a plus de dynLife', !('dynLife' in PLAT))
  })

  // --- T3 : bouncy — combo croissant, cap, reset ---
  section('T3 : bouncy combo croissant, cap, reset', () => {
    fresh()
    const pb = { x: 0, y: 100, baseY: 100, w: 3 * CELL, type: 'bouncy', amp: 0, spd: 0, ph: 0, spike: null }
    slime.bounceCombo = 0
    land(pb)
    check('bouncy 1er land : vy -400', slime.vy === -400)
    land(pb)
    check('bouncy 2e land consécutif : vy -448', Math.abs(slime.vy + 448) < 0.001)
    land(pb); land(pb)
    check('bouncy 4e land : vy -400×1.12³ (encore sous le cap)', Math.abs(slime.vy + 400 * Math.pow(COMBO_STEP, 3)) < 0.001)
    land(pb)
    // 1.12^4 ≈ 1.5735 > COMBO_MAX : le cap ×1.5 s'applique dès le 5e rebond.
    check('bouncy 5e land : cap ×1.5 -> -600', slime.vy === -600)
    for (let i = 0; i < 5; i++) land(pb)
    check('bouncy 10e land : toujours -600 (cap)', slime.vy === -600)
    const pbasic = { x: 0, y: 100, baseY: 100, w: 3 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0, spike: null }
    land(pbasic)
    check('land sur basic : bounceCombo remis à 0', slime.bounceCombo === 0)
  })

  // --- T3 : sticky ---
  section('T3 : sticky jumpMul', () => {
    fresh()
    const ps = { x: 0, y: 100, baseY: 100, w: 3 * CELL, type: 'sticky', amp: 0, spd: 0, ph: 0, spike: null }
    land(ps)
    check('sticky : land -> jumpMul défaut 0.8', slime.jumpMul === PH().stickyMul && PH().stickyMul === 0.8)
  })

  // --- T3 : crumble télégraphé puis cassé ---
  section('T3 : crumble télégraphé (crackWarn) puis cassé', () => {
    fresh()
    const pc = { x: 340, y: rowY(2), baseY: rowY(2), w: 3 * CELL, type: 'crumble', amp: 0, spd: 0, ph: 0, spike: null }
    platforms.push(pc)
    slime.x = pc.x + pc.w / 2
    slime.y = pc.y - slime.r
    slime.vx = 0
    slime.vy = -100
    land(pc)
    check('crumble : crackT défini au posé', typeof pc.crackT === 'number' && pc.crackT > 0)
    let f = 0
    while (!pc.crackWarn && f++ < 60) update(1 / 60) // ~0.4 s (CRUMBLE_T/2)
    check('crumble ~0.4 s : crackWarn true, pas encore morte', pc.crackWarn === true && !pc.dead)
    check('crumble : craquement audible', sfxCalls.some(c => c[0] === SFX_CRACK))
    sfxCalls.length = 0
    f = 0
    while (!pc.dead && f++ < 60) update(1 / 60) // ~0.8 s au total
    check('crumble 0.8 s : cassée', pc.dead === true)
  })

  // --- T3 : dynamic — plus de timer ---
  section('T3 : dynamic sans timer (vivante après 6 s)', () => {
    fresh()
    const pd = { x: 340, y: rowY(1), baseY: rowY(1), w: 3 * CELL, type: 'dynamic', amp: 10, spd: 1, ph: 0, spike: null }
    platforms.push(pd)
    slime.x = pd.x + pd.w / 2
    slime.y = pd.y - slime.r
    slime.vx = 0
    slime.vy = -50
    land(pd)
    check('dynamic : aucun timerSet/timer posé au land', pd.timerSet === undefined && pd.timer === undefined)
    for (let f = 0; f < 6 * 60; f++) update(1 / 60)
    check('dynamic : vivante après 6 s de jeu', !pd.dead && slime.grounded)
  })

  // --- T3 : rythme des dynamiques (boost à la montée) ---
  section('T3 : execJump boosté sur dynamic montante (×1.15)', () => {
    // Visée verticale à distance aimMax -> puissance vmax déterministe.
    const viser = () => { aim = { on: true, x: slime.x, y: slime.y - PH().aimMax, id: -1, air: false } }
    fresh()
    const pd = platforms[0]
    // Montante à l'écran à gameT=0 : cos(π) < 0 (repère y-vers-le-bas,
    // d(y)/dt ∝ cos(θ) < 0 → y diminue → la plateforme monte).
    pd.type = 'dynamic'; pd.amp = 20; pd.spd = 1; pd.ph = Math.PI; pd.baseY = pd.y
    // Sanity : la fixture « montante » MONTE bien à l'écran (y diminue).
    const y0 = pd.y
    pd.y = pd.baseY + Math.sin((gameT + 0.1) * pd.spd * PLAT.spdMul + pd.ph) * pd.amp
    check('fixture montante : y diminue (monte à l\'écran)', pd.y < y0)
    pd.y = pd.baseY
    slime.grounded = true; slime.groundPlat = pd; slime.jumpMul = 1
    gameT = 0
    viser(); execJump()
    const vyMontante = slime.vy
    fresh()
    slime.grounded = true; slime.groundPlat = platforms[0]; slime.jumpMul = 1
    gameT = 0
    viser(); execJump()
    const vyBasic = slime.vy
    check('dynamic montante (cos<0) : vy ×RHYTHM_MUL vs basic', Math.abs(vyMontante / (vyBasic * RHYTHM_MUL) - 1) < 0.001)
    fresh()
    const pd2 = platforms[0]
    // Descendante à l'écran : cos(0) > 0 (d(y)/dt > 0 → y augmente).
    pd2.type = 'dynamic'; pd2.amp = 20; pd2.spd = 1; pd2.ph = 0; pd2.baseY = pd2.y
    slime.grounded = true; slime.groundPlat = pd2; slime.jumpMul = 1
    gameT = 0
    viser(); execJump()
    check('dynamic descendante (cos>0) : vy ×1', Math.abs(slime.vy / vyBasic - 1) < 0.001)
  })

  // --- T3 : SFX d'atterrissage par type ---
  section('T3 : SFX d\'atterrissage par type', () => {
    fresh()
    const pitches = { basic: 0, sticky: 1, dynamic: -1, crumble: 2, phase: 3, turbo: 4, gold: 5, seesaw: 6 }
    for (const t of Object.keys(pitches)) {
      sfxCalls.length = 0
      land({ x: 0, y: 100, baseY: 100, w: CELL, type: t, amp: 0, spd: 0, ph: 0, spike: null })
      const last = sfxCalls[sfxCalls.length - 1]
      check('sfx land ' + t + ' -> pitch ' + pitches[t], !!last && last[0] === SFX_LAND && last[1] === pitches[t])
    }
  })

  // --- T3 : juice universel d'impact (shake + poussière) ---
  section('T3 : juice universel d\'impact (shake + poussière)', () => {
    // fallMax 900 : sinon la vitesse de chute est plafonnée à 520 (< 600).
    const chute = () => {
      const pt = platforms[0]
      slime.grounded = false; slime.groundPlat = null; slime.coyote = 0; slime.pull = null
      slime.x = pt.x + pt.w / 2
      slime.y = pt.y - slime.r - 350 // chute ~350 px -> impact ≈ 660 px/s
      slime.vx = 0; slime.vy = 0
      shakeT = 0
      let f = 0
      while (!slime.grounded && f++ < 90) update(1 / 60)
    }
    fresh({ fallMax: 900 })
    const n0 = particles.length
    chute()
    check('impact rapide : shake (VIEW.shake actif)', VIEW.shake !== false && shakeT > 0)
    check('impact rapide : poussière', particles.length > n0)
    fresh({ fallMax: 900 })
    VIEW.shake = false
    chute()
    check('option shake coupée : pas de shake', VIEW.shake === false && shakeT === 0)
    VIEW.shake = true
    Patterns.setLayout(null)
    applyLayout()
  })

  // ================= T4 : phasante (collision cyclique) =================

  section('T4 : phasante — posé à t=0.2, décroche à t=1.4 (sans killPlat)', () => {
    fresh()
    const pPh = { x: 400, y: rowY(2), baseY: rowY(2), w: 3 * CELL, type: 'phase', amp: 0, spd: 0, ph: 0, spike: null, phase0: 0 }
    platforms.push(pPh)
    gameT = 0.2 // phase0=0 : solide sur [0, 1.2) du cycle
    slime.x = pPh.x + 40
    slime.y = pPh.y - slime.r
    slime.vx = 0
    slime.vy = -50
    land(pPh)
    check('phase t=0.2 : posé', slime.grounded && slime.groundPlat === pPh)
    let f = 0
    while (gameT < 1.4 && f++ < 200) update(1 / 60)
    check('phase t=1.4 : décroche et tombe, plateforme intacte', !slime.grounded && slime.groundPlat === null && !pPh.dead)
  })

  section('T4 : phasante — collision selon la fenêtre', () => {
    fresh()
    const pPh = { x: 400, y: rowY(2), baseY: rowY(2), w: 3 * CELL, type: 'phase', amp: 0, spd: 0, ph: 0, spike: null, phase0: 0 }
    platforms.push(pPh)
    // traversable (t=1.4) : le slime en chute LE TRAVERSE, aucun land
    gameT = 1.4
    slime.grounded = false; slime.groundPlat = null; slime.pull = null; slime.coyote = 0; slime.noCatchT = 0.5
    slime.x = pPh.x + 40
    slime.y = pPh.y - slime.r - 1
    slime.vx = 0; slime.vy = 120
    update(1 / 60)
    check('traversable t=1.4 : aucune collision', !slime.grounded && slime.groundPlat !== pPh)
    // solide (t=0.2) : même position -> land
    gameT = 0.2
    slime.grounded = false; slime.groundPlat = null; slime.coyote = 0; slime.noCatchT = 0.5
    slime.y = pPh.y - slime.r - 1
    slime.vy = 120
    update(1 / 60)
    check('solide t=0.2 : atterrit', slime.grounded && slime.groundPlat === pPh)
  })

  section('T4 : phasante — tryLedgeCatch ignore le traversable', () => {
    fresh()
    const pPh = { x: 400, y: rowY(2), baseY: rowY(2), w: 3 * CELL, type: 'phase', amp: 0, spd: 0, ph: 0, spike: null, phase0: 0 }
    platforms.push(pPh)
    slime.noCatchT = 0; slime.pull = null; slime.coyote = 0; slime.vx = 0; slime.vy = 120
    slime.grounded = false; slime.groundPlat = null
    gameT = 1.4
    slime.x = pPh.x - 10
    slime.y = pPh.y - slime.r - 14
    let f = 0
    while (!slime.pull && !slime.grounded && f++ < 30) update(1 / 60) // reste dans le traversable (< 2.0)
    check('traversable : pas d\'accroche de bord', !slime.pull && !slime.grounded)
    // contrôle positif : la même accroche réussit quand la phasante est solide
    gameT = 0.2
    slime.grounded = false; slime.groundPlat = null; slime.pull = null; slime.coyote = 0; slime.noCatchT = 0
    slime.x = pPh.x - 10
    slime.y = pPh.y - slime.r - 14
    slime.vx = 0; slime.vy = 120
    f = 0
    while (!slime.pull && !slime.grounded && f++ < 60) update(1 / 60)
    check('solide : accroche de bord (contrôle positif)', !!slime.pull)
    slime.pull = null
    try { state = 'playing'; draw() } catch (e) { check('draw() avec phasante (' + e.message + ')', false) }
  })

  // ================= T5 : turbo et dorée =================

  section('T5 : turbo — execJump amplifie vx (borné)', () => {
    // Visée horizontale à l'aimMax (90 px) -> aimVel = vmax (380) -> turbo ×1.5 = 570.
    fresh()
    const pTb = { x: 100, y: rowY(2), baseY: rowY(2), w: 3 * CELL, type: 'turbo', amp: 0, spd: 0, ph: 0, spike: null }
    platforms.push(pTb)
    slime.grounded = true; slime.groundPlat = pTb; slime.jumpMul = 1
    slime.x = pTb.x + 40; slime.y = pTb.y - slime.r; slime.vx = 0; slime.vy = 0
    aim = { on: true, x: slime.x + 90, y: slime.y, id: -1, air: false }
    execJump()
    check('turbo : vx 380 -> 570 (×TURBO_MUL)', Math.abs(slime.vx - 380 * TURBO_MUL) < 0.001 && slime.turboT === 0.6)
    // vmin = 100 (layout) : visée courte -> vx 100 -> plancher TURBO_MIN.
    fresh({ vmin: 100 })
    const pTb2 = { x: 100, y: rowY(2), baseY: rowY(2), w: 3 * CELL, type: 'turbo', amp: 0, spd: 0, ph: 0, spike: null }
    platforms.push(pTb2)
    slime.grounded = true; slime.groundPlat = pTb2; slime.jumpMul = 1
    slime.x = pTb2.x + 40; slime.y = pTb2.y - slime.r; slime.vx = 0; slime.vy = 0
    aim = { on: true, x: slime.x + 10, y: slime.y, id: -1, air: false } // < aimMin -> vmin
    execJump()
    check('turbo : vx 100 -> 180 (plancher TURBO_MIN)', Math.abs(slime.vx - TURBO_MIN) < 0.001)
    check('couleurs turbo/dorée définies', typeof C_TURBO_TOP === 'number' && typeof C_TURBO_SIDE === 'number' && typeof C_GOLD_TOP === 'number' && typeof C_GOLD_SIDE === 'number' && typeof C_GOLD_L === 'number')
  })

  section('T5 : turbo — quitter le bord lance le slime', () => {
    // Plateforme en haut à droite du cadre : la sortie de bord (x > bord+10)
    // reste loin des murs de damage et au-dessus de toute autre plateforme.
    const pTw = { x: 200, y: rowY(0), baseY: rowY(0), w: 3 * CELL, type: 'turbo', amp: 0, spd: 0, ph: 0, spike: null }
    // dragAir 1 : sans cela, une frame de traînée aérienne dégrade vx (le check
    // exact 570/180 serait frotté à ~0.99 par le dragAir par défaut 0.6).
    // noCatchT laissé à 0 : le walk-off doit LUI-MÊME fermer la fenêtre
    // d'accroche (ruling) — sinon le ledge catch du propre bord rattrape le
    // slime à la 1re frame (à l'arrêt : vx 180 -> x fin de frame = bord+14,
    // pile dans la fenêtre 6+8) et annule le lancement.
    fresh({ dragAir: 1 })
    platforms.push(pTw)
    slime.grounded = true; slime.groundPlat = pTw
    slime.x = pTw.x + pTw.w + 11 // déjà hors du bord (+10 de tolérance)
    slime.y = pTw.y - slime.r
    slime.vx = 500; slime.vy = 0; slime.face = 1; slime.noCatchT = 0
    update(1 / 60)
    check('walk-off rapide : vx 500 -> 570 (cap vmax×TURBO_MUL)', Math.abs(slime.vx - 570) < 0.001 && !slime.grounded && slime.turboT === 0.6)
    check('walk-off turbo : fenêtre d\'accroche fermée (noCatchT > 0)', slime.noCatchT > 0)
    fresh({ dragAir: 1 })
    platforms.push(pTw)
    slime.grounded = true; slime.groundPlat = pTw
    slime.x = pTw.x + pTw.w + 11
    slime.y = pTw.y - slime.r
    slime.vx = 0; slime.vy = 0; slime.face = 1; slime.noCatchT = 0
    update(1 / 60)
    check('walk-off à l\'arrêt : lancement >= 180 selon la face, pas de ré-accroche', slime.vx >= TURBO_MIN && slime.face === 1 && slime.turboT > 0 && slime.noCatchT > 0)
    // turboT s'épuise (décompte simple)
    slime.turboT = 0.6
    slime.grounded = true; slime.groundPlat = platforms[0]
    slime.x = platforms[0].x + 80; slime.y = platforms[0].y - slime.r; slime.vx = 0; slime.vy = 0
    for (let f = 0; f < 40; f++) update(1 / 60)
    check('turboT s\'épuise', slime.turboT <= 0)
  })

  section('T5 : dorée — +1 saut aérien pendant 10 s', () => {
    fresh()
    const pGold = { x: 340, y: rowY(2), baseY: rowY(2), w: 3 * CELL, type: 'gold', amp: 0, spd: 0, ph: 0, spike: null }
    platforms.push(pGold)
    slime.x = pGold.x + 40
    slime.y = pGold.y - slime.r
    slime.vx = 0; slime.vy = -100
    land(pGold)
    check('gold : goldT = GOLD_AIRJUMP_T au posé', slime.goldT === GOLD_AIRJUMP_T)
    check('gold : airJumps = charges + 1 dès le posé', slime.airJumps === POWERS.doubleJump.charges + 1)
    // le saut aérien bonus est consommable
    slime.grounded = false; slime.groundPlat = null; slime.coyote = 0
    aim = { on: true, x: slime.x + 30, y: slime.y - 40, id: -1, air: true }
    execJump()
    check('gold : le double saut consomme la charge bonus', slime.airJumps === POWERS.doubleJump.charges && slime.djCd > 0)
    // atterrissage sur basic pendant goldT : recharge charges+1
    const pb = { x: 0, y: 100, baseY: 100, w: CELL, type: 'basic', amp: 0, spd: 0, ph: 0, spike: null }
    land(pb)
    check('gold actif : land sur basic recharge charges+1', slime.airJumps === POWERS.doubleJump.charges + 1)
    // expiration : goldT -> 0 (airJumps rabotés aux charges) puis land basic = charges
    slime.grounded = true; slime.groundPlat = pGold
    slime.x = pGold.x + 40; slime.y = pGold.y - slime.r; slime.vx = 0; slime.vy = 0
    let f = 0
    while (slime.goldT > 0 && f++ < 700) update(1 / 60)
    check('gold : goldT expire après 10 s', slime.goldT === 0 && f > 500)
    land(pb)
    check('gold expiré : land sur basic recharge charges', slime.airJumps === POWERS.doubleJump.charges)
  })

  // ================= T6 : bascule =================

  section('T6 : bascule — tilt au posé, lancement opposé', () => {
    fresh()
    const pSw = { x: 100, y: rowY(2), baseY: rowY(2), w: 4 * CELL, type: 'seesaw', amp: 0, spd: 0, ph: 0, spike: null }
    platforms.push(pSw)
    slime.x = pSw.x + 20 // côté gauche (centre = x + 64)
    slime.y = pSw.y - slime.r
    slime.vx = 0; slime.vy = -100
    land(pSw)
    check('land à gauche -> tilt -1', pSw.tilt === -1)
    check('seesaw : jumpMul neutre (pas la branche sticky)', slime.jumpMul === 1)
    slime.x = pSw.x + pSw.w - 20 // côté droit
    land(pSw)
    check('land à droite -> tilt +1', pSw.tilt === 1)
    // lancement opposé à l'inclinaison (visée posée mais IGNORÉE)
    slime.x = pSw.x + 20
    land(pSw) // tilt -1
    const ch = POWERS.doubleJump.charges
    check('charges pleines avant le lancement', slime.airJumps === ch && slime.djCd === 0)
    aim = { on: true, x: slime.x + 200, y: slime.y - 80, id: -1, air: false }
    execJump()
    check('lancement : vx = +BASCULE_VX (tilt -1 -> vers la droite)', slime.vx === BASCULE_VX)
    check('lancement : vy = -bounceVy × BASCULE_VY_MUL', Math.abs(slime.vy + PH().bounceVy * BASCULE_VY_MUL) < 0.001)
    check('lancement : tilt remis à 0', pSw.tilt === 0)
    check('lancement : ni charge aérienne ni cooldown consommés', slime.airJumps === ch && slime.djCd === 0)
    check('lancement : visée fermée, slime décollé', !slime.grounded && slime.groundPlat === null && aim.on === false)
    check('lancement : face vers le sens du départ', slime.face === 1)
  })

  section('T6 : bascule — visée aérienne = double saut, jamais bascule', () => {
    fresh()
    const pSw2 = { x: 100, y: rowY(2), baseY: rowY(2), w: 4 * CELL, type: 'seesaw', amp: 0, spd: 0, ph: 0, spike: null }
    platforms.push(pSw2)
    // en l'air au-dessus de la bascule (artifice : groundPlat encore branché)
    slime.grounded = false; slime.groundPlat = pSw2; slime.pull = null; slime.coyote = 0
    slime.airJumps = POWERS.doubleJump.charges; slime.djCd = 0
    pSw2.tilt = -1
    aim = { on: true, x: slime.x + 30, y: slime.y - 40, id: -1, air: true }
    execJump()
    check('en l\'air : double saut standard (charge + cooldown)', slime.airJumps === POWERS.doubleJump.charges - 1 && slime.djCd > 0)
    check('en l\'air : vy visé (pas le lancement fixe -360)', Math.abs(slime.vy + PH().bounceVy * BASCULE_VY_MUL) > 50)
    check('en l\'air : tilt intact', pSw2.tilt === -1)
  })

  section('T6 : bascule — rendu pivot sans exception', () => {
    fresh()
    const pSw3 = { x: 100, y: rowY(2), baseY: rowY(2), w: 4 * CELL, type: 'seesaw', amp: 0, spd: 0, ph: 0, spike: null }
    platforms.push(pSw3)
    pSw3.tilt = -1
    try { state = 'playing'; draw() } catch (e) { check('draw() avec bascule inclinée (' + e.message + ')', false) }
  })

  // ================= T7 : rendu des 9 types (drawPlat + overlays) =================

  // Dessine les 9 types avec la fixture du plan ; retourne le nb de types
  // dessinés SANS exception (les échecs sont loggés un par un).
  const draw9 = () => {
    let n = 0
    for (const t of Patterns.TYPES) {
      try { drawPlat({ x: 100, y: 100, w: 96, type: t, tilt: 0, phase0: 0, spike: null, crackT: 0 }); n++ }
      catch (e) { console.log('  exception ' + t + ' : ' + e.message) }
    }
    return n
  }

  section('T7 : drawPlat — 9 types sans crash (chemin fallback)', () => {
    fresh()
    check('harnais : sprites pas chargés (chemin fallback)', Sprites.ready === false)
    check('fallback : 9 types dessinés sans exception', draw9() === 9)
  })

  // Chemin « sprites » : onload des Image stubs -> Sprites.ready. Les tuiles
  // elles-mêmes restent invisibles (pas de width) ; on pinne le rendu via les
  // clés demandées à Sprites.drawImage et les primitives (push = rotation
  // litecanvas, shape/fill = chevrons, rect = contour).
  await Promise.resolve()
  section('T7 : drawPlat — 9 types sans crash (chemin sprites)', () => {
    check('harnais : sprites chargés', Sprites.ready === true)
    check('sprites : 9 types dessinés sans exception', draw9() === 9)
  })

  section('T7 : overlays sprites — clés de tuiles + chevrons/contour/rotation', () => {
    fresh()
    const keys = []
    const origDI = Sprites.drawImage
    Sprites.drawImage = (k, x, y, w, h) => { keys.push(k); return origDI(k, x, y, w, h) }
    const origPush = push, origShape = shape, origFill = fill, origRect = rect
    let rots = [], shapes = 0, fills = 0, rects = 0
    push = (x, y, r, sx, sy) => { rots.push(r) }
    shape = (...a) => { shapes++; origShape(...a) }
    fill = (...a) => { fills++; origFill(...a) }
    rect = (...a) => { rects++; origRect(...a) }
    try {
      // Turbo : chevrons » blancs (2 triangles par tuile, ici 3 tuiles).
      drawPlat({ x: 100, y: 100, w: 96, type: 'turbo', tilt: 0, phase0: 0, spike: null, crackT: 0 })
      check('turbo : tuile tileTurbo demandée', keys.indexOf('tileTurbo') >= 0)
      check('turbo : chevrons dessinés (>= 2 triangles)', shapes >= 2 && fills >= 2)
      // Dorée : contour pulsé (rect) + tuile tileGold.
      rects = 0
      drawPlat({ x: 100, y: 100, w: 96, type: 'gold', tilt: 0, phase0: 0, spike: null, crackT: 0 })
      check('gold : tuile tileGold demandée', keys.indexOf('tileGold') >= 0)
      check('gold : contour doré dessiné', rects >= 1)
      // Bascule : rotation (push angle = tilt × 0.17) + tuile tileSeesaw.
      rots = []
      drawPlat({ x: 100, y: 100, w: 96, type: 'seesaw', tilt: -1, phase0: 0, spike: null, crackT: 0 })
      check('seesaw : tuile tileSeesaw demandée', keys.indexOf('tileSeesaw') >= 0)
      check('seesaw : rotation appliquée (angle -0.17)', rots.some(a => Math.abs(a + 0.17) < 0.001))
    } finally {
      Sprites.drawImage = origDI
      push = origPush; shape = origShape; fill = origFill; rect = origRect
    }
  })

  section('T7 : turbo — lignes de vitesse derrière le slime', () => {
    fresh()
    const rects0 = []
    const origRectfill = rectfill
    rectfill = (x, y, w, h, c) => { rects0.push([x, y, w, h, c]) }
    try {
      slime.grounded = false; slime.pull = null
      slime.x = 200; slime.y = 200; slime.vx = 300; slime.turboT = 0.6
      drawSlime()
      check('turbo : lignes de vitesse dessinées (3 traits blancs)', rects0.filter(r => r[4] === C_WHITE).length >= 3)
      // derrière le slime = opposé à vx (vx > 0 -> traits à gauche du slime)
      check('turbo : traits DERRIÈRE le slime (vx > 0 -> à gauche)', rects0.filter(r => r[4] === C_WHITE).every(r => r[0] + r[2] <= slime.x))
      // turboT épuisé : plus aucun trait
      rects0.length = 0
      slime.turboT = 0
      drawSlime()
      check('turbo inactif : aucune ligne de vitesse', rects0.filter(r => r[4] === C_WHITE).length === 0)
    } finally {
      rectfill = origRectfill
    }
  })

  console.log(fails === 0 ? '\nPLATFORMS OK — tous les checks passent' : '\n' + fails + ' ÉCHEC(S)')
  if (fails > 0) throw new Error('platforms_test failed')
}

const fn = new Function(
  ...Object.keys(litecanvasStubs),
  src + '\n;(' + driverFn.toString() + ')()'
)
try {
  await fn(...Object.values(litecanvasStubs))
} catch (e) {
  console.error('EXCEPTION :', e.message)
  process.exit(1)
}
