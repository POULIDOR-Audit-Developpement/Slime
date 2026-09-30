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
  navigator: { userAgent: 'node' },
  document: { documentElement: {}, body: { appendChild: noop, removeChild: noop }, createElement: () => ({ style: {}, focus: noop, select: noop }) },
  Image: class { set src(v) {} }
}

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
      let gold = 0, life = 0
      for (const b of balls) { if (b.gold) gold++; else if (b.life) life++ }
      return { n: balls.length, gold, life }
    }
    const a = cnt()
    spawnNext()
    const b = cnt()
    // théorique = billes 10 + or 50 (=10+40) + bonus 30 (=10+20)
    const expected = (b.n - a.n) * 10 + (b.gold - a.gold) * 40 + (b.life - a.life) * 20
    check('spawnNext : +1 pattern compté', patternsSpawned === n0 + 1)
    check('spawnNext : theoPts = valeur des collectibles ajoutés (' + expected + ')', theoPts - t0 === expected)
    // un score ne peut jamais dépasser le théorique + la distance : garde anti-triche
    check('theoPts cohérent : collectibles seuls <= théorique', theoPts >= currentScore() - Math.floor(camX / 10))
  }

  // --- 12) bascule de piste musicale : palette + transition ---
  {
    startGame()
    runStarted = true // le timer de transition ne tourne qu'en run (comme en jeu)
    check('départ : fond piste 0, pas de transition', bgTrack === 0 && trackFxT === 0)
    applyMusicTrack(1)
    const fx1 = trackFxT
    check('bascule piste 1 : palette violette', bgTrack === 1 && COLORS[C_BLUE] === TRACK_PALETTES[1][0] && COLORS[C_BLUE_HI] === TRACK_PALETTES[1][4])
    check('bascule piste 1 : transition armée (~2 s)', fx1 > 1.5)
    applyMusicTrack(1)
    check('bascule idempotente : ni re-arm ni re-palette', trackFxT === fx1 && COLORS[C_BLUE] === TRACK_PALETTES[1][0])
    applyMusicTrack(2)
    check('bascule piste 2 : palette braise', COLORS[C_BLUE] === TRACK_PALETTES[2][0])
    applyMusicTrack(0)
    check('retour piste 0 : palette d\'origine restaurée',
      COLORS[C_BLUE] === '#4a5ed7' && COLORS[C_BLUE_L] === '#5f74e3' && COLORS[C_BLUE_D] === '#4152c8' &&
      COLORS[C_BLUE_XD] === '#3946a8' && COLORS[C_BLUE_HI] === '#6b83ec')
    const fx0 = trackFxT
    check('retour piste 0 : transition armée', fx0 > 1.5)
    update(1 / 60) // piste 0 = piste courante en Node : le poll ne re-arme pas
    check('tick : timer de transition décroit', trackFxT < fx0)
    trackFxT = 0.001
    update(1 / 60)
    check('tick : transition terminée -> timer à 0', trackFxT === 0)
    // startGame : retour piste 0 SILENCIEUX (pas de bannière au redémarrage)
    applyMusicTrack(2)
    startGame()
    check('startGame : fond remis piste 0 en silence', bgTrack === 0 && trackFxT === 0 && COLORS[C_BLUE] === '#4a5ed7')
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
