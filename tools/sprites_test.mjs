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

console.log(failed === 0 ? '\nSPRITES OK — les canvas passent les gardes de dessin' : `\n${failed} ÉCHEC(S)`)
process.exit(failed ? 1 : 0)
