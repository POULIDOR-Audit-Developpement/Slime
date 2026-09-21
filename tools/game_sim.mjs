// Test runtime Node : exécute game.js avec un stub litecanvas et simule une
// partie réelle (charge/saut/atterrissage, coyote time, jump buffer, phys).
// Usage : node tools/game_sim.mjs
import { readFileSync } from 'fs'

const files = [
  'js/crypto.js',
  'js/music.js',
  'js/physics.js',
  'js/sprites.js',
  'js/patterns-defaults.js',
  'js/patterns.js',
  'js/game.js'
]
const src = files.map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')

// ---------- stubs litecanvas / DOM ----------
const W = 960, H = 540
const noop = () => {}
const ctxStub = () => {
  const c = {}
  return new Proxy(c, {
    get: (t, k) => {
      if (k === 'canvas') return { width: W, height: H }
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
  document: { documentElement: {}, body: { appendChild: noop, removeChild: noop }, createElement: () => ({ style: {}, focus: noop, select: noop }) },
  Image: class { set src(v) {} }
}

// ---------- driver : partage le scope de game.js ----------
function driverFn() {
  let fails = 0
  const check = (name, cond) => { if (!cond) { fails++; console.log('FAIL', name) } else console.log('ok  ', name) }
  const waitLand = (max = 600) => { let f = 0; while (!slime.grounded && state === 'playing' && f++ < max) update(1 / 60); return f }
  const waitAir = (max = 600) => { let f = 0; while (slime.grounded && f++ < max) update(1 / 60); return f }

  init()
  startGame()

  // --- état initial : physique par défaut (slime réduit 14) ---
  check('état playing', state === 'playing')
  check('slime.r = 14 (défaut réduit)', slime.r === 14)

  // --- 1) saut chargé vers la droite ---
  tap(400, 100, 1)
  check('charge démarrée', charge.on === true)
  for (let i = 0; i < 20; i++) update(1 / 60)
  check('charge en cours', charge.on === true && charge.t > 0.3)
  const vyBefore = slime.vy
  untap(400, 100, 1)
  check('saut déclenché (vy < 0)', !slime.grounded && slime.vy < 0 && vyBefore !== slime.vy)
  const f1 = waitLand()
  check('atterrissage', slime.grounded && f1 > 10)

  // --- 2) coyote time : quitter le bord puis charger vite ---
  for (let i = 0; i < 5; i++) update(1 / 60) // quelques frames au sol : coyote rafraîchi
  slime.x = slime.groundPlat.x + slime.groundPlat.w + 12
  update(1 / 60)
  check('en l\'air après le bord', !slime.grounded)
  tap(300, 120, 2)
  check('coyote : la charge démarre en l\'air', charge.on === true)
  untap(300, 120, 2)
  check('coyote : saut déclenché', !slime.grounded)
  waitLand()

  // reset propre : plateforme de départ, slime centré
  const drop2px = () => {
    const p = platforms[0]
    slime.x = p.x + p.w / 2
    slime.y = p.y - slime.r - 2
    slime.vy = 0
    slime.vx = 0
    slime.coyote = 0 // sinon le coyote prendrait l'appui avant le buffer
    slime.grounded = false
    slime.groundPlat = null
    runStarted = true
    update(1 / 60) // une frame officiellement en l'air
  }

  // --- 3) jump buffer relâché avant l'atterrissage -> saut faible immédiat ---
  // NB : tap() prend des pixels canvas (960x540) ; ÷2 = coordonnées virtuelles.
  startGame()
  drop2px()
  tap(400, 500, 3) // visée virtuelle (200,250) bas-gauche : retombe sur la plateforme
  check('buffer armé en l\'air (pas de charge)', !charge.on && slime.buffer > 0)
  untap(400, 500, 3)
  check('buffer marqué relâché', slime.bufferRel === true)
  let landed = false, instantJump = false
  const _dj = doJump
  doJump = function () { instantJump = true; return _dj() }
  let fl = 0
  while (fl++ < 10) { update(1 / 60); if (slime.grounded) { landed = true; break } }
  doJump = _dj
  check('atterrissage atteint', landed)
  check('buffer consommé : saut immédiat', landed && instantJump)
  waitLand()
  check('revient au sol après le saut bufferisé', slime.grounded)

  // --- 4) jump buffer maintenu -> la charge démarre à l'atterrissage ---
  startGame()
  drop2px()
  tap(400, 500, 4)
  waitLand()
  check('buffer tenu : charge auto au sol', charge.on === true && slime.grounded)
  untap(400, 500, 4)
  waitLand()

  // --- 5) physique live : layout -> setPhys -> comportement du jeu ---
  startGame()
  Patterns.setLayout({ phys: { slimeR: 8, grav: 1000, vmax: 500 } })
  applyLayout()
  runStarted = true
  update(1 / 60)
  check('slime.r suit le layout', slime.r === 8)
  tap(430, 90, 5)
  for (let i = 0; i < 40; i++) update(1 / 60) // charge pleine (0.66 s > chargeT)
  untap(430, 90, 5)
  const sp = Math.hypot(slime.vx, slime.vy)
  check('vmax du layout appliquée au saut', Math.abs(sp - 500) < 1.5)
  waitLand()
  Patterns.setLayout(null)
  applyLayout()
  startGame()

  // --- 6) soak : 1200 frames simulées (~20 s), multivies, aucun crash ---
  // Le bot vise (560,100) écran = (280,50) virtuel : petits arcs up-forward.
  // Aveugle, il meurt parfois (trous/pics) : on relance une vie via startGame.
  let jumps = 0, lives = 0, frames = 0
  const _dj2 = doJump
  doJump = function () { jumps++; return _dj2() }
  while (frames++ < 1200) {
    update(1 / 60)
    if (state !== 'playing') { lives++; startGame(); continue }
    if (slime.grounded && !charge.on) {
      tap(560, 100, 9)
    } else if (charge.on && charge.t > 0.5) {
      untap(560, 100, 9)
    }
  }
  doJump = _dj2
  check('soak 1200 frames sans exception (sauts : ' + jumps + ', vies : ' + lives + ')', jumps > 5)

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
