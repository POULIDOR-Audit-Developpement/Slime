// Test runtime Node : machine d'état du plein écran vidéo iOS (astuce
// captureStream -> <video> webkitEnterFullscreen, seul plein écran possible
// sur iPhone en Safari). Comportement visé :
//   - sortie INVOLONTAIRE (swipe down / « Done » du lecteur système) pendant
//     une run -> pause + retour plein écran au prochain toucher (le lecteur
//     système d'iOS ferme sur un geste que la page ne peut pas bloquer) ;
//   - sortie VOLONTAIRE (icône coin haut droit) -> ni pause ni retour ;
//   - hors run (titre) -> pas de pause.
// Usage : node tools/fs_test.mjs
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

// ---------- stubs litecanvas / DOM (repris de game_sim) ----------
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
const _texts = [] // chaînes passées à text() (lecture du panneau ?fsdbg)
// <video> factice façon iPhone : webkitEnter/ExitFullscreen basculent
// webkitDisplayingFullscreen et déclenchent les événements écoutés par
// fsVideoState ; _enterCount compte les re-plein-écrans (reprise au toucher).
const video = {
  style: {}, muted: false, playsInline: false,
  videoWidth: W, videoHeight: H,
  webkitDisplayingFullscreen: false,
  _enterCount: 0, _ev: {},
  setAttribute: noop,
  addEventListener(t, fn) { (this._ev[t] = this._ev[t] || []).push(fn) },
  removeEventListener(t, fn) {
    const l = this._ev[t]
    if (l) this._ev[t] = l.filter(f => f !== fn)
  },
  fire(t) { for (const fn of this._ev[t] || []) fn() },
  play() { return { catch: noop } },
  getBoundingClientRect() { return { left: 0, top: 0, width: W, height: H } },
  webkitEnterFullscreen() {
    this.webkitDisplayingFullscreen = true
    this._enterCount++
    this.fire('webkitbeginfullscreen')
  },
  webkitExitFullscreen() {
    this.webkitDisplayingFullscreen = false
    this.fire('webkitendfullscreen')
  }
}
const mainCanvas = {
  width: W, height: H,
  getContext: () => ctxStub(),
  captureStream: () => ({ getTracks: () => [] })
}
const litecanvasStubs = {
  litecanvas: noop,
  W, H, T: 0,
  paint: noop,
  ctx: ctxStub,
  cls: noop,
  rectfill: noop, rect: noop, circfill: noop, circ: noop,
  line: noop, shape: noop, fill: noop,
  text: (...a) => _texts.push(a[2]), textalign: noop, textsize: noop, alpha: noop, push: noop, pop: noop,
  pal: noop, sfx: noop, volume: noop,
  rand: (a, b) => a + Math.random() * (b - a),
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  lerp: (a, b, t) => a + (b - a) * t,
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  iskeypressed: () => false,
  localStorage: (() => { const s = {}; return {
    getItem: k => s[k] ?? null, setItem: (k, v) => { s[k] = String(v) }, removeItem: k => { delete s[k] }
  } })(),
  window: { location: { search: '' }, innerHeight: H, innerWidth: W, addEventListener: noop, removeEventListener: noop },
  navigator: { userAgent: 'iPhone' },
  canvas: () => mainCanvas,
  HTMLVideoElement: { prototype: { webkitEnterFullscreen: noop } },
  document: {
    documentElement: {}, // pas d'API Fullscreen native -> bascule sur l'astuce vidéo
    hidden: false,
    addEventListener: noop,
    body: { appendChild: noop, removeChild: noop },
    createElement: tag => tag === 'video'
      ? video
      : { width: 0, height: 0, getContext: () => ctxStub(), style: {} }
  },
  Image: class {
    constructor() { this.width = 64; this.height = 48; this.complete = true }
    set src(v) { if (this.onload) this.onload() }
  }
}
litecanvasStubs.document._video = video // accès driver (paramètre document)
litecanvasStubs.window._texts = _texts // accès driver (paramètre window)

// ---------- driver : partage le scope de game.js ----------
function driverFn() {
  let fails = 0
  const check = (name, cond) => { if (!cond) { fails++; console.log('FAIL', name) } else console.log('ok  ', name) }
  const vid = document._video // <video> factice créée par fsEnterVideo
  // vue -> pixels canvas (VSC/VOX/VOY posés par calcView ; 480x270 -> x2 ici)
  const v2p = (vx, vy) => { calcView(); return [vx * VSC + VOX, vy * VSC + VOY] }
  const tapView = (vx, vy) => { const p = v2p(vx, vy); tap(p[0], p[1], 0) }
  const fsIcon = () => tapView(VW - 17, 10)   // zone icône plein écran (vx > VW-34, vy < 26)
  const pauseBtn = () => tapView(VW - 46, 10) // zone bouton pause [VW-56..VW-36]

  init()
  startGame()

  // Panneau ?fsdbg : doit s'exécuter sans erreur et afficher l'état du retour
  // plein écran (ligne ajoutée avec la fonctionnalité).
  diagFsDbg = true
  drawFsDbg()
  check('?fsdbg : panneau dessiné sans erreur', window._texts.some(s => String(s).startsWith('videoOn=')))
  diagFsDbg = false

  check('pré-requis : astuce vidéo disponible, hors standalone', fsCanEnter() === true && !fsStandalone())

  // 1) Entrée plein écran via l'icône (comportement existant)
  fsIcon()
  check('entrée plein écran vidéo (icône)', fsVideoOn === true && vid._enterCount === 1)

  // 2) Sortie INVOLONTAIRE (swipe down du lecteur iOS) -> pause
  vid.webkitExitFullscreen() // sans passer par fsExit : pas de flag volontaire
  check('sortie involontaire en run : pause activée', fsVideoOn === false && paused === true && state === 'playing')

  // 3) Reprise : un tap quelconque -> retour plein écran DANS le geste + reprise
  tapView(VW / 2, VH / 2)
  check('reprise au toucher : pause levée', paused === false)
  check('reprise au toucher : plein écran revenu', vid._enterCount === 2 && fsVideoOn === true)

  // 4) Sortie VOLONTAIRE (icône) : ni pause ni retour automatique
  fsIcon()
  check('sortie volontaire : ni pause ni plein écran', paused === false && fsVideoOn === false && vid._enterCount === 2)

  // 5) Sortie involontaire HORS RUN (titre) : pas de pause
  fsIcon() // re-entre en plein écran
  state = 'title'
  vid.webkitExitFullscreen()
  check('sortie involontaire au titre : pas de pause', paused === false && fsVideoOn === false)

  // 6) Reprise via le BOUTON pause : consomme aussi le retour plein écran
  startGame()
  fsIcon() // plein écran
  vid.webkitExitFullscreen() // involontaire -> pause
  check('préparation : pause après sortie involontaire', paused === true)
  pauseBtn()
  check('reprise bouton pause : plein écran revenu', paused === false && vid._enterCount === 5 && fsVideoOn === true)

  console.log(fails === 0 ? '\nFS OK — tous les checks passent' : '\n' + fails + ' ÉCHEC(S)')
  if (fails > 0) throw new Error('fs_test failed')
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
