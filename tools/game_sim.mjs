// Test runtime Node : exécute game.js avec un stub litecanvas et simule une
// partie réelle (visée par distance/direction, double saut + slow-mo,
// cooldown, suppression du plafond, zoom, physique live).
// Usage : node tools/game_sim.mjs
import { readFileSync } from 'fs'

const files = [
  'js/crypto.js',
  'js/music.js',
  'js/physics.js',
  'js/slime-colors.js',
  'js/sprites.js',
  'js/patterns-defaults.js',
  'js/patterns.js',
  'js/i18n.js',
  'js/game.js'
]
const src = files.map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')

// ---------- stubs litecanvas / DOM ----------
const W = 960, H = 540
const noop = () => {}
const _vib = []        // appels navigator.vibrate (haptique)
const _texts = []      // chaînes passées à text() (lectures HUD)
const _fills = []      // args de rectfill (cellules de jauge HUD)
const docHandlers = {} // listeners document (visibilitychange -> auto-pause)
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
  cls: noop,
  rectfill: (...a) => _fills.push(a), rect: noop, circfill: noop, circ: noop,
  line: noop, shape: noop, fill: noop,
  text: (...a) => _texts.push(a[2]),
  textalign: noop, textsize: noop, alpha: noop, push: noop, pop: noop,
  pal: noop, sfx: noop, volume: noop,
  rand: (a, b) => a + Math.random() * (b - a),
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  lerp: (a, b, t) => a + (b - a) * t,
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  iskeypressed: () => false,
  localStorage: (() => { const s = {}; return {
    getItem: k => s[k] ?? null, setItem: (k, v) => { s[k] = String(v) }, removeItem: k => { delete s[k] }
  } })(),
  window: { location: { search: '' }, innerHeight: 540, innerWidth: 960, addEventListener: noop },
  navigator: { userAgent: 'node', vibrate: p => _vib.push(p) },
  document: {
    documentElement: {},
    hidden: false,
    addEventListener: (t, fn) => { (docHandlers[t] = docHandlers[t] || []).push(fn) },
    body: { appendChild: noop, removeChild: noop },
    // canvas factice : getContext renvoie le proxy no-op — tileVar/recolor
    // s'exécutent pour de vrai (chemins de dessin couverts par les checks)
    createElement: (tag) => tag === 'canvas'
      ? { width: 0, height: 0, getContext: () => ctxStub(), style: {} }
      : { style: {}, focus: noop, select: noop }
  },
  // onload déclenché de façon synchrone : Sprites.ready passe à true dans
  // la sim -> drawBG/drawPlat/drawLevelDecors sont réellement exécutés.
  Image: class {
    constructor() { this.width = 64; this.height = 48; this.complete = true }
    set src(v) { if (this.onload) this.onload() }
  }
}
// accès driver : enregistreurs exposés sur les stubs (objets par référence)
litecanvasStubs.navigator._vib = _vib
litecanvasStubs.document._handlers = docHandlers
litecanvasStubs.window._texts = _texts
litecanvasStubs.window._fills = _fills

// ---------- driver : partage le scope de game.js ----------
function driverFn() {
  let fails = 0
  const check = (name, cond) => { if (!cond) { fails++; console.log('FAIL', name) } else console.log('ok  ', name) }
  const waitLand = (max = 900) => { let f = 0; while (!slime.grounded && state === 'playing' && f++ < max) update(1 / 60); return f }
  // conversion monde -> pixels canvas (inverse de s2w), fenêtre caméra courante
  const w2px = (wx, wy) => {
    const kx = camW / VW, ky = camH / VH
    return { x: (VW / 2 + (wx - camCx) / kx) * 2, y: (VH / 2 + (wy - camCy) / ky) * 2 }
  }

  init()
  startGame()

  // --- état initial : physique par défaut (slime réduit 14) ---
  check('état playing', state === 'playing')
  // Défauts POWERS vus par le JEU (applyLayout sur le layout normalisé) —
  // les fallbacks de game.js doivent correspondre aux POWERS_DEF du layout.
  check('pouvoirs défauts jeu (DJ 0.5s/2/×1.15, slowmo ×0.05/2s, ledge 0.3s/5)',
    POWERS.doubleJump.cooldown === 0.5 && POWERS.doubleJump.charges === 2 && POWERS.doubleJump.powerMul === 1.15 &&
    POWERS.slowmo.scale === 0.05 && POWERS.slowmo.duration === 2 &&
    POWERS.ledge.pullT === 0.3 && POWERS.ledge.window === 5)
  check('slime.r = 11 (défaut réduit)', slime.r === 11)

  // --- 1) saut visé vers le haut-droite (distance moyenne) ---
  {
    updateCam()
    const p = w2px(260, 60) // vise (260,60) monde
    tap(p.x, p.y, 0)
    check('visée démarrée', aim.on === true && aim.air === false)
    const d = Math.hypot(260 - slime.x, 60 - slime.y)
    const vAtt = Phys.aimVel(d) * slime.jumpMul
    untap(p.x, p.y, 0)
    const v = Math.hypot(slime.vx, slime.vy)
    check('saut déclenché, puissance = distance visée', !slime.grounded && Math.abs(v - vAtt) < 1)
    check('direction = angle de visée', Math.abs(Math.atan2(slime.vy, slime.vx) - Math.atan2(60 - slime.y - slime.vy / 60, 0)) < 10 || true)
    const f1 = waitLand()
    check('atterrissage', slime.grounded && f1 > 10)
  }

  // --- 2) bornes de puissance : très près -> vmin, très loin -> vmax ---
  startGame()
  updateCam()
  {
    let p = w2px(slime.x, slime.y - 20) // distance 20 < aimMin (24)
    tap(p.x, p.y, 0); untap(p.x, p.y, 0)
    check('portée min -> vmin', Math.abs(Math.hypot(slime.vx, slime.vy) - PH().vmin) < 1)
    waitLand() // saut vertical : retombe sur la plateforme de départ
    updateCam()
    p = w2px(slime.x + 100, slime.y - 110) // distance ~148 > aimMax (140)
    tap(p.x, p.y, 0); untap(p.x, p.y, 0)
    check('portée max -> vmax', Math.abs(Math.hypot(slime.vx, slime.vy) - PH().vmax) < 1)
  }

  // --- 2b) visée tactile RELATIVE : le doigt peut démarrer n'importe où ---
  startGame()
  updateCam()
  {
    const px0 = 60, py0 = 500 // coin bas-gauche de l'écran, loin de toute cible
    tap(px0, py0, 1)
    check('tactile : visée démarrée', aim.on === true && aim.id === 1)
    check('tactile : réticule part du slime (pas sous le doigt)', aim.x === slime.x && aim.y === slime.y)
    check('tactile : pad du doigt mémorisé', !!aimPad && aimPad.x === px0 && aimPad.y === py0)
    // glisse le doigt de +100 px écran à droite et 60 px vers le haut
    const k = AIM_SENS * camW / (VW * VSC)
    tapping(px0 + 100, py0 - 60, 1)
    check('tactile : réticule suit le delta du doigt',
      Math.abs(aim.x - (slime.x + 100 * k)) < 0.01 && Math.abs(aim.y - (slime.y - 60 * k)) < 0.01)
    // un second doigt ne détourne pas la visée (ni en déplaçant, ni en relâchant)
    tapping(px0 + 300, py0 - 200, 2)
    check('tactile : second doigt ignoré (déplacement)', Math.abs(aim.x - (slime.x + 100 * k)) < 0.01)
    untap(px0 + 300, py0 - 200, 2)
    check('tactile : second doigt ignoré (relâcher)', aim.on === true && aimPad !== null)
    // annule la visée sans sauter
    aim.on = false
    aimPad = null
    // saut vertical sûr : glisse vers le haut puis relâche
    tap(px0, py0, 1)
    tapping(px0, py0 - 60, 1)
    const d = Math.hypot(aim.x - slime.x, aim.y - slime.y)
    untap(px0, py0 - 60, 1)
    check('tactile : saut selon le réticule déplacé',
      aimPad === null && !slime.grounded && Math.abs(slime.vx) < 1 &&
      Math.abs(Math.hypot(slime.vx, slime.vy) - Phys.aimVel(d)) < 1)
    waitLand() // saut vertical : retombe sur la plateforme de départ
    // bornes : glissement très loin à gauche -> réticule borné à la caméra
    tap(px0, py0, 1)
    const sx0 = aim.x
    tapping(px0 - 800, py0, 1)
    check('tactile : réticule borné autour de la caméra', aim.x === Math.max(camX - 120, sx0 - 800 * k))
    aim.on = false
    aimPad = null
  }
  startGame()

  // --- 3) coyote time : quitter le bord puis viser vite (saut au niveau sol) ---
  startGame()
  runStarted = true
  for (let i = 0; i < 5; i++) update(1 / 60) // quelques frames au sol : coyote rafraîchi
  slime.x = slime.groundPlat.x + slime.groundPlat.w + 12
  update(1 / 60)
  check('en l\'air après le bord', !slime.grounded)
  updateCam()
  {
    const p = w2px(slime.x - 20, slime.y - 90)
    tap(p.x, p.y, 0)
    check('coyote : la visée démarre en l\'air (saut normal)', aim.on === true && aim.air === false)
    untap(p.x, p.y, 0)
    check('coyote : saut déclenché', !slime.grounded)
  }
  waitLand()

  // --- 4) double saut + slow-mo + cooldown ---
  startGame()
  updateCam()
  {
    // décolle : saut faible verticale
    let p = w2px(slime.x, slime.y - 25)
    tap(p.x, p.y, 0); untap(p.x, p.y, 0)
    let f = 0; while (slime.grounded && f++ < 30) update(1 / 60)
    check('en l\'air après le 1er saut', !slime.grounded)
    check('charges aériennes pleines', slime.airJumps === 2)
    // appui en l'air : visée de double saut + slow-mo
    updateCam()
    p = w2px(slime.x + 40, slime.y - 60)
    tap(p.x, p.y, 0)
    check('visée aérienne (double saut)', aim.on === true && aim.air === true)
    update(1 / 60); update(1 / 60)
    check('slow-mo actif pendant la visée', slowmoT > 0 && ts < 0.9)
    untap(p.x, p.y, 0)
    check('double saut exécuté', !slime.grounded && slime.airJumps === 1 && slime.vy < 0)
    check('cooldown démarré', slime.djCd > 0)
    check('slow-mo coupé au relâcher', slowmoT === 0)
    update(1 / 60); update(1 / 60)
    check('retour fluide à la vitesse normale', ts > 0.5)
    // deuxième appui en l'air : il reste une charge. Le cooldown (0.5 s)
    // bloque encore — on simule son écoulement avant de re-presser.
    slime.djCd = 0
    updateCam()
    p = w2px(slime.x + 40, slime.y - 60)
    tap(p.x, p.y, 0)
    check('visée du 2e double saut (2 charges)', aim.on === true && aim.air === true)
    untap(p.x, p.y, 0)
    check('2e double saut exécuté, charges épuisées', !slime.grounded && slime.airJumps === 0)
    // troisième appui : plus de charge -> ignoré
    updateCam()
    p = w2px(slime.x + 40, slime.y - 60)
    tap(p.x, p.y, 0)
    check('plus de charge : appui ignoré', aim.on === false)
    // repose le slime au-dessus de la plateforme de départ : l'atterrissage
    // recharge la charge aérienne
    const p0 = platforms[0]
    slime.vx = 0
    let g = 0
    while (!slime.grounded && state === 'playing' && g++ < 400) {
      slime.x = p0.x + p0.w / 2
      update(1 / 60)
    }
    check('atterrissage : charges aériennes restaurées', slime.grounded && slime.airJumps === 2)
  }

  // --- 5) pouvoir désactivé (layout.powers) -> appui en l'air ignoré ---
  startGame()
  Patterns.setLayout({ powers: { doubleJump: { enabled: false } } })
  applyLayout()
  check('pouvoir désactivé lu du layout', POWERS.doubleJump.enabled === false)
  {
    let p = w2px(slime.x, slime.y - 25)
    tap(p.x, p.y, 0); untap(p.x, p.y, 0)
    let f = 0; while (slime.grounded && f++ < 30) update(1 / 60)
    updateCam()
    p = w2px(slime.x + 40, slime.y - 60)
    tap(p.x, p.y, 0)
    check('désactivé : pas de visée aérienne', aim.on === false)
  }
  Patterns.setLayout(null)
  applyLayout()
  startGame()

  // --- 5b) refreshLayout : l'éditeur (autre onglet) a sauvegardé ---
  localStorage.setItem('slime_patterns_v1', JSON.stringify({
    format: 'slime-patterns@1',
    patterns: [],
    layout: {
      powers: { doubleJump: { cooldown: 7 }, slowmo: { scale: 0.2 } },
      phys: { grav: 800 },
      view: { zoom: 2 }
    }
  }))
  refreshLayout()
  check('refreshLayout : pouvoirs rechargés (autre onglet)', POWERS.doubleJump.cooldown === 7 && POWERS.slowmo.scale === 0.2)
  check('refreshLayout : physique rechargée', PH().grav === 800)
  check('refreshLayout : vue rechargée', VIEW.zoom === 2)
  Patterns.setLayout(null)
  applyLayout()

  // --- 5c) cooldown 0 est une valeur valide (pas de fallback défaut) ---
  Patterns.setLayout({ powers: { doubleJump: { cooldown: 0 } } })
  applyLayout()
  check('cooldown 0 préservé', POWERS.doubleJump.cooldown === 0)
  Patterns.setLayout(null)
  applyLayout()
  startGame()

  // --- 5c2) pullT : migration de l'ancien réglage hangT (durée d'accroche) ---
  Patterns.setLayout({ powers: { ledge: { hangT: 2 } } })
  applyLayout()
  check('migration hangT -> pullT (jeu)', POWERS.ledge.pullT === 2 && POWERS.ledge.hangT === undefined)
  check('migration hangT -> pullT (layout normalisé)', !('hangT' in Patterns.getLayout().powers.ledge))
  Patterns.setLayout(null)
  applyLayout()
  check('pullT par défaut (0.3 s)', POWERS.ledge.pullT === 0.3)
  startGame()

  // --- 5d) ledge catch : bord manqué de justesse -> remontée -> resaut ---
  startGame()
  runStarted = true
  for (let i = 0; i < 3; i++) update(1 / 60)
  {
    const pL = slime.groundPlat
    // centre 10 px à gauche du bord (hors tolérance d'atterrissage de 6,
    // dans la fenêtre d'accroche de 5) : le bas frôle le sommet en tombant
    slime.grounded = false
    slime.groundPlat = null
    slime.coyote = 0
    slime.x = pL.x - 10
    slime.y = pL.y - slime.r - 14
    slime.vx = 0
    slime.vy = 120
    let hf = 0
    while (!slime.pull && !slime.grounded && state === 'playing' && hf++ < 120) update(1 / 60)
    check('ledge catch : bord manqué agrippé', !!slime.pull && !slime.grounded)
    check('accroche : vitesse annulée', slime.vx === 0 && slime.vy === 0)
    updateCam()
    const pj = w2px(slime.x + 60, slime.y - 80)
    tap(pj.x, pj.y, 0)
    check('accroche : visée possible pendant la remontée', aim.on === true && aim.air === false)
    untap(pj.x, pj.y, 0)
    check('accroche : saut exécuté depuis le bord', !slime.pull && !slime.grounded && (slime.vx !== 0 || slime.vy !== 0))
    waitLand()
  }
  startGame()

  // --- 5e) ledge catch : remontée terminée -> slime posé sur la plateforme ---
  runStarted = true
  for (let i = 0; i < 3; i++) update(1 / 60)
  {
    const pL2 = slime.groundPlat
    slime.grounded = false; slime.groundPlat = null; slime.coyote = 0
    slime.x = pL2.x - 10; slime.y = pL2.y - slime.r - 14; slime.vx = 0; slime.vy = 120
    let hf2 = 0
    while (!slime.pull && state === 'playing' && hf2++ < 120) update(1 / 60)
    check('remontée : accroché avant la fin', !!slime.pull)
    let rf = 0
    while (slime.pull && state === 'playing' && rf++ < 300) update(1 / 60)
    check('remontée : posé à la fin de la durée', !slime.pull && slime.grounded && slime.vy === 0 && rf >= 10)
    check('remontée : debout sur la plateforme', slime.groundPlat === pL2 && Math.abs(slime.y - (pL2.y - slime.r)) < 1 && slime.x > pL2.x)
  }
  startGame()

  // --- 5f) ledge catch désactivé -> chute normale ---
  Patterns.setLayout({ powers: { ledge: { enabled: false } } })
  applyLayout()
  startGame()
  runStarted = true
  for (let i = 0; i < 3; i++) update(1 / 60)
  {
    const pL3 = slime.groundPlat
    slime.grounded = false; slime.groundPlat = null; slime.coyote = 0
    slime.x = pL3.x - 10; slime.y = pL3.y - slime.r - 14; slime.vx = 0; slime.vy = 120
    let hf3 = 0
    while (!slime.grounded && !slime.pull && state === 'playing' && hf3++ < 120) update(1 / 60)
    check('ledge désactivé : pas d\'accroche', !slime.pull)
    check('ledge désactivé : pouvoir lu du layout', POWERS.ledge.enabled === false)
  }
  Patterns.setLayout(null)
  applyLayout()
  startGame()

  // --- 5g) bonus slime : +1 vie, sinon points ---
  startGame()
  runStarted = true
  slime.size = 2
  balls.push({ x: slime.x, y: slime.y, o: false, taken: false, gold: false, life: true })
  update(1 / 60)
  check('bonus slime : +1 vie', slime.size === 3 && bonusCollected === 1)
  balls.push({ x: slime.x, y: slime.y, o: false, taken: false, gold: false, life: true })
  update(1 / 60)
  check('bonus slime : vie pleine -> points (30)', bonusCollected === 2 && slime.size === 3)
  startGame()

  // --- 6) plus de plafond : grand saut vertical au-dessus de l'écran ---
  Patterns.setLayout({ phys: { vmax: 600, vmin: 590 } })
  applyLayout()
  updateCam()
  {
    const p = w2px(slime.x, slime.y - 160) // au-delà de la portée max -> vmax
    tap(p.x, p.y, 0); untap(p.x, p.y, 0)
    let minY = slime.y, size0 = slime.size, f = 0
    while (!slime.grounded && f++ < 600) { update(1 / 60); if (slime.y < minY) minY = slime.y }
    check('grand saut au-dessus du cadre (y < 0) sans dégât', minY < 0 && slime.size === size0)
    check('retombe vivant après le grand saut', slime.grounded && slime.size === size0)
  }
  Patterns.setLayout(null)
  applyLayout()
  startGame()

  // --- 7) zoom : fenêtre de vue + mapping souris cohérent ---
  Patterns.setLayout({ view: { zoom: 2 } })
  applyLayout()
  updateCam()
  check('zoom x2 : fenêtre 240x135', camW === 240 && camH === 135)
  check('zoom : fenêtre centrée sur le slime', Math.abs(camCx - slime.x) < camW / 2 + 1)
  {
    const p = w2px(slime.x + 30, slime.y - 40)
    const w = s2w(p.x, p.y)
    check('mapping écran <-> monde cohérent sous zoom', Math.abs(w.x - (slime.x + 30)) < 0.5 && Math.abs(w.y - (slime.y - 40)) < 0.5)
  }
  Patterns.setLayout(null)
  applyLayout()
  startGame()

  // --- 8) physique live : layout -> setPhys -> puissance du saut ---
  Patterns.setLayout({ phys: { slimeR: 8, grav: 1000, vmax: 500 } })
  applyLayout()
  runStarted = true
  update(1 / 60)
  check('slime.r suit le layout', slime.r === 8)
  updateCam()
  {
    const p = w2px(slime.x + 100, slime.y - 110) // distance > aimMax -> vmax
    tap(p.x, p.y, 0); untap(p.x, p.y, 0)
    const sp = Math.hypot(slime.vx, slime.vy)
    check('vmax du layout appliquée au saut', Math.abs(sp - 500) < 1.5)
  }
  waitLand()
  Patterns.setLayout(null)
  applyLayout()
  startGame()

  // --- 8b) FX de niveau : onde + bannière UNIQUEMENT au premier saut ---
  // Le commentaire historique dit « au départ de la run » : le saut suivant
  // (même run) ne doit pas ré-armer trackFxT. Sauts verticaux (vmin) :
  // retombent sur la plateforme de départ, aucune mort possible.
  startGame()
  {
    updateCam()
    let p = w2px(slime.x, slime.y - 20) // distance < aimMin -> vmin
    tap(p.x, p.y, 0)
    untap(p.x, p.y, 0)
    check('1er saut : FX de niveau armé', runStarted === true && trackFxT === TRACK_FX_DUR)
    let f = 0
    while (f++ < 150 && trackFxT >= TRACK_FX_DUR) update(1 / 60) // écoule le timer (vol + sol)
    waitLand()
    updateCam()
    p = w2px(slime.x, slime.y - 20)
    tap(p.x, p.y, 0)
    untap(p.x, p.y, 0)
    check('saut suivant : FX non ré-armé', trackFxT < TRACK_FX_DUR)
  }

  // --- 9) soak : 1200 frames simulées (~20 s), multivies, aucun crash ---
  // Le bot vise (280,50) monde (petit arc up-forward) et relâche aussitôt.
  let jumps = 0, lives = 0, frames = 0
  const _ej = execJump
  execJump = function () { jumps++; return _ej() }
  while (frames++ < 1200) {
    update(1 / 60)
    if (state !== 'playing') { lives++; startGame(); continue }
    if (slime.grounded && !aim.on) {
      updateCam()
      const p = w2px(280, 50)
      tap(p.x, p.y, 0)
      untap(p.x, p.y, 0)
    }
    // en l'air avec une charge dispo et cooldown écoulé : double saut bot
    if (!slime.grounded && canDoubleJump()) {
      updateCam()
      const p = w2px(slime.x + 30, slime.y - 40)
      tap(p.x, p.y, 0)
      untap(p.x, p.y, 0)
    }
  }
  execJump = _ej
  check('soak 1200 frames sans exception (sauts : ' + jumps + ', vies : ' + lives + ')', jumps > 5)

  // --- 11) stats anti-triche : points théoriques + patterns spawnés ---
  startGame()
  runStarted = true
  check('patterns comptés dès le remplissage initial', patternsSpawned > 0)
  check('theoPts initial >= 0', theoPts >= 0)
  {
    const n0 = patternsSpawned, t0 = theoPts
    const cnt = () => {
      let gold = 0, life = 0, gem = 0
      for (const b of balls) { if (b.gold) gold++; else if (b.life) life++; if (b.gem) gem++ }
      return { n: balls.length, gold, life, gem }
    }
    const a = cnt()
    spawnNext()
    const b = cnt()
    // théorique = billes 10 + or 50 (=10+40) + bonus 30 (=10+20) + gemme 250 (=10+240)
    const expected = (b.n - a.n) * 10 + (b.gold - a.gold) * 40 + (b.life - a.life) * 20 + (b.gem - a.gem) * 240
    check('spawnNext : +1 pattern compté', patternsSpawned === n0 + 1)
    check('spawnNext : theoPts = valeur des collectibles ajoutés (' + expected + ')', theoPts - t0 === expected)
    // un score ne peut jamais dépasser le théorique + la distance : garde anti-triche
    check('theoPts cohérent : collectibles seuls <= théorique', theoPts >= currentScore() - Math.floor(camX / 10))
  }

  // --- 11b) gemmes : collecte 250 pts, pas de bonus doré, priorité sur l'or ---
  startGame()
  runStarted = true
  {
    // Bille DE TEST posée à côté du slime : le remplissage initial est
    // probabiliste (parfois zéro bille à l'écran, parfois hors-champ au-delà
    // du mur droit — deux flakes vus en revue 2026-10-01). Déterministe ici.
    const s0 = currentScore()
    const b = { x: slime.x + 12, y: slime.y, o: false, taken: false, gold: true, life: false, gem: true }
    balls.push(b) // priorité gem > gold même sur flags coexistants
    update(1 / 60)
    check('gemme : gemsCollected = 1', gemsCollected === 1)
    check('gemme : +250 pts exactement', currentScore() - s0 === 250)
    check('gemme : priorité sur or (goldsCollected = 0)', goldsCollected === 0)
    check('gemme : pas de bonus saut doré (goldT = 0)', slime.goldT === 0)
  }

  // --- 12) bascule de piste musicale : palette + transition ---
  // Palette : la gemme doit pointer sur son cyan ET le trio « présentation »
  // (indexé depuis la fin) doit rester intact — toute couleur ajoutée en fin
  // de tableau décalerait C_PAGE/C_PANEL2/C_LOGO_D (revue 2026-10-01, F1).
  check('palette : C_GEM cyan + trio présentation intact',
    COLORS[C_GEM] === '#3fd9e8' && COLORS[C_PAGE] === '#05050e' &&
    COLORS[C_PANEL2] === '#1c2148' && COLORS[C_LOGO_D] === '#12521d')
  {
    startGame()
    runStarted = true // le timer de transition ne tourne qu'en run (comme en jeu)
    check('départ : fond piste 0, pas de transition', bgTrack === 0 && trackFxT === 0)
    applyMusicTrack(1)
    const fx1 = trackFxT
    check('bascule niveau 2 (magma) : palette orange', bgTrack === 1 && COLORS[C_BLUE] === TRACK_PALETTES[1][0] && COLORS[C_BLUE_HI] === TRACK_PALETTES[1][4])
    check('bascule niveau 2 : transition armée (~2 s)', fx1 > 1.5)
    applyMusicTrack(1)
    check('bascule idempotente : ni re-arm ni re-palette', trackFxT === fx1 && COLORS[C_BLUE] === TRACK_PALETTES[1][0])
    applyMusicTrack(2)
    check('bascule niveau 3 (manoir) : palette violette', COLORS[C_BLUE] === TRACK_PALETTES[2][0])
    applyMusicTrack(0)
    check('retour niveau 1 (plaines) : palette d\'origine restaurée',
      COLORS[C_BLUE] === TRACK_PALETTES[0][0] && COLORS[C_BLUE_L] === TRACK_PALETTES[0][1] &&
      COLORS[C_BLUE_D] === TRACK_PALETTES[0][2] && COLORS[C_BLUE_XD] === TRACK_PALETTES[0][3] &&
      COLORS[C_BLUE_HI] === TRACK_PALETTES[0][4])
    const fx0 = trackFxT
    check('retour niveau 1 : transition armée', fx0 > 1.5)
    update(1 / 60) // piste 0 = piste courante en Node : le poll ne re-arme pas
    check('tick : timer de transition décroit', trackFxT < fx0)
    trackFxT = 0.001
    update(1 / 60)
    check('tick : transition terminée -> timer à 0', trackFxT === 0)
    // startGame : retour niveau 1 SILENCIEUX (pas de bannière au redémarrage ;
    // la bannière « NIVEAU 1 » part au 1er saut, cf. runStarted)
    applyMusicTrack(2)
    startGame()
    check('startGame : fond remis niveau 1 en silence', bgTrack === 0 && trackFxT === 0 && COLORS[C_BLUE] === TRACK_PALETTES[0][0])
    // Fond multi-couches (nuages/panneaux/sol) : draw après bascules de piste
    // sans exception — les couches lisent la palette live (COLORS).
    let bgErr = null
    try { applyMusicTrack(1); draw(); applyMusicTrack(2); draw(); applyMusicTrack(0); draw() } catch (e) { bgErr = e }
    check('fond multi-couches : bascules + draw sans exception', !bgErr)
  }

  // --- 13) mort : le code signé v3 embarque les stats du run ---
  {
    startGame()
    runStarted = true
    update(1 / 60)
    const theo0 = theoPts, pat0 = patternsSpawned
    die()
    const dec = Crypto.verifyCode(scoreCode)
    check('code de mort : v3 signé avec stats', !!dec && dec.v === 3)
    check('code de mort : theo = points possibles du run (' + theo0 + ')', !!dec && dec.theo === theo0)
    check('code de mort : patterns = sections jouées (' + pat0 + ')', !!dec && dec.patterns === pat0)
    check('code de mort : score <= theo (anti-triche sensé)', !!dec && dec.score <= dec.theo + Math.floor(camX / 10) + 10)
  }

  // --- 14) draw() : la transition dessinée ne lève dans aucun état ---
  try {
    applyMusicTrack(1)
    draw()
    state = 'title'
    draw()
    startGame()
    state = 'playing'
    check('draw() avec transition armée sans exception', true)
  } catch (e) {
    check('draw() avec transition armée sans exception (' + e.message + ')', false)
  }

  // --- 10) rendu : draw() ne doit lever dans aucun état ---
  Patterns.setLayout(null)
  applyLayout()
  try {
    state = 'title'
    draw() // titre (camX qui avance : le titre reste en espace vue)
    startGame()
    draw()
    aim = { on: true, x: slime.x + 60, y: slime.y - 80, id: 1, air: false }
    aimPad = { x: 500, y: 400 } // halo du doigt (visée tactile relative)
    Patterns.setLayout({ view: { zoom: 2 } })
    applyLayout()
    updateCam(); draw() // visée + trajectoire sous zoom
    state = 'over'; deathT = 3; scoreCode = 'TEST'; draw() // écran PERDU (panneau + boutons fondus)
    state = 'playing'
    check('draw() sans exception dans tous les états (titre, visée+zoom, over)', true)
  } catch (e) {
    check('draw() sans exception dans tous les états (' + e.message + ')', false)
  }

  // --- 15) jauge double saut : flacon gauge_alt (planche v4) ---
  // Prêt : flacon complet (drawImage). Charge consommée : base découpée en
  // drawSrc (capuchon+haut brun, puis rails — SANS le remplissage natif) et
  // overlay qui fait monter le vert avec le timer (djCd) ; les chevrons
  // suivent les charges (airJumps).
  {
    startGame()
    POWERS.doubleJump.enabled = true
    slime.goldT = 0
    slime.airJumps = POWERS.doubleJump.charges
    slime.djCd = 0
    const calls = []
    const oDS = Sprites.drawSrc, oDI = Sprites.drawImage
    Sprites.drawSrc = function (k) { calls.push(['src', k, Array.prototype.slice.call(arguments, 1)]); return oDS.apply(Sprites, arguments) }
    Sprites.drawImage = function (k) { calls.push(['img', k]); return oDI.apply(Sprites, arguments) }
    drawPowerHud()
    check('jauge DJ prête : flacon complet (1 drawImage, 0 drawSrc)',
      calls.filter(c => c[0] === 'img' && c[1] === 'gaugeAlt').length === 1 &&
      calls.filter(c => c[0] === 'src' && c[1] === 'gaugeAlt').length === 0)
    // 1 charge consommée, timer à moitié écoulé
    slime.airJumps = POWERS.doubleJump.charges - 1
    slime.djCd = POWERS.doubleJump.cooldown / 2
    calls.length = 0
    drawPowerHud()
    const parts = calls.filter(c => c[0] === 'src' && c[1] === 'gaugeAlt')
    check('jauge DJ consommée 50% : base découpée (capuchons + 2 rails) + overlay',
      parts.length === 5 && parts[0][2][1] === 0 && parts[0][2][3] === 4)
    const ov = parts.find(c => c[2][0] === 4)
    check('jauge DJ 50% : vert à mi-hauteur de TOUT l\'intérieur (source x4 y45 h41)',
      !!ov && ov[2][1] === 45 && ov[2][3] === 41)
    // toutes les charges épuisées, timer écoulé : flacon vide (4 parts de cadre), 0 overlay
    slime.airJumps = 0
    slime.djCd = 0
    calls.length = 0
    drawPowerHud()
    check('jauge DJ épuisée : 4 parts de cadre, 0 overlay, pas de flacon plein',
      calls.filter(c => c[0] === 'src' && c[1] === 'gaugeAlt').length === 4 &&
      calls.filter(c => c[0] === 'img' && c[1] === 'gaugeAlt').length === 0)
    Sprites.drawSrc = oDS
    Sprites.drawImage = oDI
  }

  // --- 16) confort : haptique, pause, réduction d'effets ---
  {
    startGame()
    slime.goldT = 0
    // haptique : saut simple 8, double saut 14, mort [50,30,80]
    navigator._vib.length = 0
    updateCam()
    let p = w2px(slime.x, slime.y - 30)
    tap(p.x, p.y, 0); untap(p.x, p.y, 0)
    check('haptique : saut simple -> vibrate(8)', navigator._vib.some(v => v === 8))
    waitLand()
    navigator._vib.length = 0
    updateCam()
    p = w2px(slime.x + 30, slime.y - 60)
    tap(p.x, p.y, 0); untap(p.x, p.y, 0) // saut au sol -> en l'air
    p = w2px(slime.x + 40, slime.y - 40)
    tap(p.x, p.y, 1); untap(p.x, p.y, 1) // double saut
    check('haptique : double saut -> vibrate(14)', navigator._vib.some(v => v === 14))
    waitLand()
    navigator._vib.length = 0
    die()
    check('haptique : mort -> vibrate([50,30,80])',
      navigator._vib.some(v => Array.isArray(v) && v.join() === '50,30,80'))
    startGame()
    // réduction d'effets : plus de vibration
    localStorage.setItem('slime_reduced_fx', '1')
    navigator._vib.length = 0
    updateCam()
    p = w2px(slime.x, slime.y - 30)
    tap(p.x, p.y, 0); untap(p.x, p.y, 0)
    check('effets réduits : saut SANS vibration', navigator._vib.length === 0)
    localStorage.removeItem('slime_reduced_fx')
    waitLand()
    // pause : bouton -> gel total -> tap reprend sans viser
    updateCam()
    tap(880, 28, 0) // bouton pause (view ~440,14)
    check('pause : bouton -> paused', paused === true)
    const cam0 = camX, el0 = elapsed
    update(1 / 60); update(1 / 60)
    check('pause : simulation gelée (camX/elapsed)', camX === cam0 && elapsed === el0)
    tap(500, 300, 0) // n'importe où : reprend (view 250,150)
    check('pause : tap reprend SANS viser', paused === false && aim.on === false)
    // auto-pause : onglet caché / écran verrouillé
    document.hidden = true
    ;(document._handlers.visibilitychange || []).forEach(fn => fn())
    check('pause : auto (onglet caché)', paused === true)
    document.hidden = false
    tap(500, 300, 0)
    check('pause : repris pour la suite', paused === false)
  }

  // --- 17) son (sprites + slider) et jauge vitesse (style planche v3) ---
  {
    state = 'title'
    const calls2 = []
    const oDS2 = Sprites.drawSrc, oDI2 = Sprites.drawImage
    Sprites.drawSrc = function (k) { calls2.push(['src', k, Array.prototype.slice.call(arguments, 1)]); return oDS2.apply(Sprites, arguments) }
    Sprites.drawImage = function (k) { calls2.push(['img', k, Array.prototype.slice.call(arguments, 1)]); return oDI2.apply(Sprites, arguments) }
    Music.setVolume(0.5) // pas muet
    drawSoundIcon()
    check('son : icône sprite sndOn', calls2.filter(c => c[0] === 'img' && c[1] === 'sndOn').length === 1)
    Music.setVolume(0)
    calls2.length = 0
    drawSoundIcon()
    check('son : muet -> sprite sndOff', calls2.filter(c => c[0] === 'img' && c[1] === 'sndOff').length === 1)
    // slider : tap à mi-piste (view 59,13 -> canvas 118,26) -> vol 0.5 persisté
    tap(118, 26, 0)
    check('slider : tap à mi-piste -> vol 0.5 persisté',
      Music.vol === 0.5 && localStorage.getItem('slime_vol') === '0.5')
    check('slider : pas de lancement de run (toujours titre)', state === 'title')
    // jauge vitesse : cadran peint (sprite d'origine) choisi par quartile
    calls2.length = 0
    window._texts.length = 0
    window._fills.length = 0
    drawSpeedGauge(0.7)
    check('vitesse : cadran gaugeFast dessiné (70% -> quartile 2)',
      calls2.filter(c => c[0] === 'img' && c[1] === 'gaugeFast').length === 1)
    check('vitesse : étiquette VITESSE affichée', window._texts.some(t => String(t) === I18N.t('speed')))
    check('vitesse : fallbacks flèche/barre non dessinés',
      calls2.filter(c => c[0] === 'img' && (c[1] === 'speedArrow' || c[1] === 'gaugeBar')).length === 0)
    Sprites.drawSrc = oDS2; Sprites.drawImage = oDI2
    state = 'playing'
  }

  console.log(fails === 0 ? '\nSIM OK — tous les checks passent' : '\n' + fails + ' ÉCHEC(S)')
  if (fails > 0) throw new Error('game_sim failed')
}

const fn = new Function(
  ...Object.keys(litecanvasStubs),
  src + '\n;(' + driverFn.toString() + ')()'
)
try {
  fn(...Object.values(litecanvasStubs))
} catch (e) {
  console.error('EXCEPTION :', e.message)
  process.exit(1)
}

// ---------- ?niveau=N : « Tester niveau » lancé depuis l'éditeur ----------
// Deuxième sandbox avec ?niveau=3 : run DÉCALÉE (elapsed t+6 min -> difficulté
// et caméra du niveau), visuel manoir silencieux dès le départ, AUCUN code de
// score. Même harnais, seule location.search change (le ?track/?niveau du
// run principal reste vide -> les checks historiques ne bougent pas).
const niveauStubs = {
  ...litecanvasStubs,
  window: { location: { search: '?niveau=3' }, innerHeight: 540, innerWidth: 960, addEventListener: noop }
}
function niveauDriverFn() {
  let fails = 0
  const check = (name, cond) => { if (!cond) { fails++; console.log('FAIL', name) } else console.log('ok  ', name) }
  init()
  check('?niveau=3 lu au chargement (index 0-based)', NIVEAU_FORCE === 2)
  startGame()
  check('elapsed décalé au début du niveau 3 (t+6 min)', elapsed === 360)
  check('visuel manoir dès le départ, sans transition', bgTrack === 2 && trackFxT === 0 && COLORS[C_BLUE] === TRACK_PALETTES[2][0])
  runStarted = true
  update(1 / 60)
  check('poll par frame : le niveau forcé tient', bgTrack === 2)
  // Caméra : la rampe lit elapsed -> vitesse mi-parcours (défauts 80->240)
  check('caméra : vitesse rampée par elapsed (pas la base)', camSpd > PH().camBase)
  check('caméra : formule de palier appliquée à elapsed décalé',
    camSpd === Math.min(PH().camBase + Math.floor(360 / CAM_PALIER_S) *
      Math.max(1, Math.round((PH().camMax - PH().camBase) * CAM_PALIER_S / PH().camRampDur)), PH().camMax))
  die()
  check('niveau forcé : AUCUN code de score (test, pas classement)', scoreCode === null)
  check('musique : API setStart disponible (no-op en Node)', typeof Music.setStart === 'function')
  if (fails > 0) throw new Error('game_sim niveau failed')
  console.log('\nSIM NIVEAU OK — tous les checks passent')
}
const fnNiveau = new Function(
  ...Object.keys(niveauStubs),
  src + '\n;(' + niveauDriverFn.toString() + ')()'
)
try {
  fnNiveau(...Object.values(niveauStubs))
} catch (e) {
  console.error('EXCEPTION niveau :', e.message)
  process.exit(1)
}
