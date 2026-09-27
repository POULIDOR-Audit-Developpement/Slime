// Test Node : les variantes de couleur du slime sont des CANVAS (recoloration
// runtime) — les gardes de dessin de sprites.js ne doivent pas les rejeter
// (régression : `!im.complete` rejetait tout canvas car `complete` n'existe
// que sur HTMLImageElement -> slime invisible dès le palier 1).
// Usage : node tools/sprites_test.mjs
import { readFileSync } from 'fs'

const src = ['js/slime-colors.js', 'js/sprites.js']
  .map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n')

// ---------- stubs ----------
let failed = 0
const check = (name, cond) => { if (cond) console.log('ok  ', name); else { failed++; console.log('FAIL', name) } }

// Image qui « se charge » instantanément au src (sync) : complete/width réels.
class ImageStub {
  constructor() { this.complete = false; this.width = 0; this.height = 0; this.naturalWidth = 0; this.naturalHeight = 0 }
  set src(v) {
    this.complete = true
    this.width = this.naturalWidth = 64
    this.height = this.naturalHeight = 32
    if (this.onload) this.onload()
  }
}

// Canvas : PAS de propriété complete (comportement navigateur réel).
const makeCanvas = () => ({
  width: 0, height: 0,
  getContext: () => ({
    imageSmoothingEnabled: false,
    drawImage() {},
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}
  })
})

const store = {}
globalThis.localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: k => { delete store[k] }
}
globalThis.document = { createElement: () => makeCanvas() }
globalThis.Image = ImageStub

// ctx() de l'environnement litecanvas : capture les appels de dessin.
const drawCtx = new Proxy({}, {
  get: (t, k) => { if (!(k in t)) t[k] = () => {}; return t[k] },
  set: (t, k, v) => { t[k] = v; return true }
})
globalThis.ctx = () => drawCtx

// ---------- exécution ----------
const { SlimeColors, Sprites } = new Function(src + '\nreturn { SlimeColors, Sprites }')()

Sprites.load()
check('sprites prêts (chargement synchrone)', Sprites.ready)

const v1 = Sprites.get('idle0_t1')
check('variante t1 générée (canvas sans complete)', !!v1 && v1.width === 64 && v1.complete === undefined)
check('variantes t1..t5 générées (6 paliers)', [1, 2, 3, 4, 5].every(i => !!Sprites.get('idle0_t' + i)))

// LE point de régression : les gardes acceptent les canvas.
check('dessin canvas : draw', Sprites.draw('idle0_t1', 10, 10, 20) === true)
check('dessin canvas : drawImage', Sprites.drawImage('idle0_t1', 0, 0, 10) === true)
check('dessin canvas : drawTL', Sprites.drawTL('idle0_t1', 0, 0, 10) === true)
check('dessin canvas : rotated', Sprites.rotated('idle0_t1', 0.5, 0, 0, 0, 0) === true)
check('dessin canvas : drawSrc', Sprites.drawSrc('idle0_t1', 0, 0, 8, 8, 0, 0, 8, 8) === true)

check('image de base toujours dessinée', Sprites.draw('idle0', 10, 10, 20) === true)
check('clé inconnue toujours refusée', Sprites.draw('inconnu', 0, 0, 10) === false)

// setTiers : purge des anciennes variantes + régénération dessinable.
SlimeColors.save([{ min: 0, hex: '#3ecb3e' }, { min: 10, hex: '#ff0000' }])
Sprites.setTiers(SlimeColors.load())
check('setTiers : anciennes variantes purgées', !Sprites.get('idle0_t5') && !Sprites.get('idle0_t2'))
check('setTiers : nouvelle variante générée et dessinée', !!Sprites.get('idle0_t1') && Sprites.draw('idle0_t1', 0, 0, 10) === true)

// tickAnimated : régénération LIMITÉE aux variantes animées réellement
// dessinées (régression perf mobile : l'ancien code refaisait les 15 sprites
// de base à ~10 Hz -> 15-45 ms de pixels par tick = saccades).
SlimeColors.save([{ min: 0, hex: '#3ecb3e' }, { min: 10, type: 'rainbow', speed: 0.3 }])
Sprites.setTiers(SlimeColors.load())
let rc = 0
const origRecolor = SlimeColors.recolor
SlimeColors.recolor = function (...a) { rc++; return origRecolor.apply(this, a) }
Sprites.tickAnimated(1.0)
check('tick sans variante dessinée : 0 recolor', rc === 0)
Sprites.draw('idle0_t1', 0, 0, 10) // la variante animée est affichée en jeu
rc = 0
Sprites.tickAnimated(1.2)
check('tick : seule la variante dessinée est refaite (1 recolor, pas 15)', rc === 1)
rc = 0
Sprites.tickAnimated(1.4)
check('tick sans nouveau dessin : 0 recolor', rc === 0)
check('la variante animée reste dessinable', Sprites.draw('idle0_t1', 0, 0, 10) === true)
SlimeColors.recolor = origRecolor

// ---------- effets spéciaux : pixel-fns ----------
const EF = SlimeColors.EFFECTS
check('isAnimated : rainbow/oui, flat/non', SlimeColors.isAnimated({ type: 'rainbow', speed: 0.2 }) && !SlimeColors.isAnimated({ type: 'flat', hex: '#3ecb3e' }))
check('primary : 1re couleur / constante rainbow', SlimeColors.primary({ type: 'gradient', hexes: ['#ff0000', '#0000ff'] }) === '#ff0000' && SlimeColors.primary({ type: 'rainbow', speed: 0.2 }) === '#e05fbf')

const gt = { type: 'gradient', hexes: ['#000000', '#ffffff'] }
const g0 = EF.gradient.pixel(gt, 0, 0, 0, 0, 0), g1 = EF.gradient.pixel(gt, 0, 1, 0, 71, 0), gm = EF.gradient.pixel(gt, 0, 0.5, 0, 35, 0)
check('gradient : fondu haut->bas monotone', g0[0] === 0 && g1[0] === 255 && Math.abs(gm[0] - 127.5) < 0.01)

const mt = { type: 'multi', hexes: ['#ff0000', '#00ff00', '#0000ff'] }
check('multi : bandes nettes distinctes', EF.multi.pixel(mt, 0.1, 0, 0, 0, 0)[0] === 255 && EF.multi.pixel(mt, 0.5, 0, 0, 0, 0)[1] === 255 && EF.multi.pixel(mt, 0.9, 0, 0, 0, 0)[2] === 255)

const rt = { type: 'rainbow', speed: 0.5 }
check('rainbow : change avec le temps', JSON.stringify(EF.rainbow.pixel(rt, 0.5, 0.5, 40, 30, 0)) !== JSON.stringify(EF.rainbow.pixel(rt, 0.5, 0.5, 40, 30, 0.6)))

const st = { type: 'shine', hex: '#3a7bd5', speed: 0.5 }
const s0 = JSON.stringify(EF.shine.pixel(st, 0.5, 0.5, 40, 30, 0))
check('shine : reflet balaie le corps', [0.3, 0.6, 0.9, 1.2, 1.5, 1.7, 2.0, 2.3, 2.6].some(t => JSON.stringify(EF.shine.pixel(st, 0.5, 0.5, 40, 30, t)) !== s0))
// Visibilité : bande large (nombreux pixels éclairés) et pic très lumineux.
{
  let lit = 0, peak = 0
  for (let k = 0; k <= 20; k++) {
    const c = EF.shine.pixel(st, k / 20, 0.05, k * 4, 3, 0)
    const boost = (c[0] - 58) + (c[1] - 123) + (c[2] - 213)
    if (boost > 30) lit++
    peak = Math.max(peak, boost)
  }
  check('shine : bande large visible (>= 5/21 px le long de la diagonale)', lit >= 5)
  check('shine : pic très lumineux (proche du blanc)', peak > 300)
}

const kt = { type: 'star', hex: '#2b5876' }
check('star : déterministe', JSON.stringify(EF.star.pixel(kt, 0, 0, 40, 30, 0)) === JSON.stringify(EF.star.pixel(kt, 0, 0, 40, 30, 0)))
let starMoves = false
for (let px = 0; px < 105 && !starMoves; px += 3) for (let py = 0; py < 105 && !starMoves; py += 3) {
  const a = JSON.stringify(EF.star.pixel(kt, 0, 0, px, py, 0))
  for (let t = 0.2; t <= 3 && !starMoves; t += 0.25) if (JSON.stringify(EF.star.pixel(kt, 0, 0, px, py, t)) !== a) starMoves = true
}
check('star : scintillement détecté', starMoves)
// Visibilité : densité d'étoiles — au meilleur instant, beaucoup de pixels
// diffèrent de la base sur une zone 48x48 (~36 cellules, ~45 % occupées).
{
  let best = 0
  for (let t = 0; t <= 2; t += 0.1) {
    let n = 0
    for (let px = 0; px < 48; px++) for (let py = 0; py < 48; py++) {
      const c = EF.star.pixel(kt, 0, 0, px, py, t)
      if (c[0] !== 43 || c[1] !== 88 || c[2] !== 118) n++
    }
    best = Math.max(best, n)
  }
  check('star : densité visible (>= 60 px differents au pic)', best >= 60)
}

// ---------- sanitize / normalize par entrée ----------
check('upgrade legacy {min,hex} -> flat', (() => {
  const n = SlimeColors.normalize([{ min: 0, hex: '#3ecb3e' }, { min: 50, hex: '#ABCDEF' }])
  return n.length === 2 && n[1].type === 'flat' && n[1].hex === '#abcdef'
})())
check('type inconnu supprimé', SlimeColors.normalize([{ min: 0, type: 'flat', hex: '#3ecb3e' }, { min: 10, type: 'holographique' }]).length === 1)
check('hexes < 2 supprimé', SlimeColors.normalize([{ min: 0, type: 'flat', hex: '#3ecb3e' }, { min: 10, type: 'gradient', hexes: ['#ff0000'] }]).length === 1)
check('hexes > MAX tronqué', SlimeColors.normalize([{ min: 0, type: 'flat', hex: '#3ecb3e' }, { min: 10, type: 'multi', hexes: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff'] }])[1].hexes.length === SlimeColors.MAX_STOPS)
check('speed clampée / NaN -> défaut', (() => {
  const n = SlimeColors.normalize([{ min: 0, type: 'flat', hex: '#3ecb3e' }, { min: 10, type: 'rainbow', speed: 7 }, { min: 20, type: 'shine', hex: '#3a7bd5' }])
  return n[1].speed === 1 && n[2].speed === 0.3
})())
check('normalize null si pas un tableau', SlimeColors.normalize('oops') === null)

// ---------- tickAnimated : régénération + throttle ----------
SlimeColors.save([
  { min: 0, type: 'flat', hex: '#3ecb3e' },
  { min: 10, type: 'rainbow', speed: 0.3 },
  { min: 20, type: 'flat', hex: '#ff0000' }
])
Sprites.setTiers(SlimeColors.load())
const beforeTick = Sprites.get('idle0_t1')
check('tickAnimated : variante animée présente', !!beforeTick)
Sprites.draw('idle0_t1', 0, 0, 10) // affichée -> éligible au rafraîchissement
Sprites.tickAnimated(1.0)
const afterTick = Sprites.get('idle0_t1')
check('tickAnimated : canvas régénéré (référence neuve)', !!afterTick && afterTick !== beforeTick)
Sprites.tickAnimated(1.05)
check('tickAnimated : throttle < 100 ms', Sprites.get('idle0_t1') === afterTick)
Sprites.draw('idle0_t1', 0, 0, 10)
Sprites.tickAnimated(1.5)
check('tickAnimated : nouveau tick après 100 ms', Sprites.get('idle0_t1') !== afterTick)

SlimeColors.save([{ min: 0, type: 'flat', hex: '#3ecb3e' }, { min: 10, type: 'flat', hex: '#00ff00' }])
Sprites.setTiers(SlimeColors.load())
const frozen = Sprites.get('idle0_t1')
Sprites.tickAnimated(5.0)
Sprites.tickAnimated(6.0)
check('sans anim : variantes stables (coût nul)', Sprites.get('idle0_t1') === frozen)

console.log(failed === 0 ? '\nSPRITES OK — les canvas passent les gardes de dessin' : `\n${failed} ÉCHEC(S)`)
process.exit(failed ? 1 : 0)
