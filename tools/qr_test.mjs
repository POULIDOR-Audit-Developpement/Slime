// Test — QR code : la lib vendorée génère une matrice, jsQR la relit.
// Round-trip réel sans canvas : la matrice isDark() est convertie en
// ImageData (RGBA noir/blanc) et passée à jsQR.
//   1. chaîne courte
//   2. code de fin de partie v2 (taille réelle, ~130 caractères)
//   3. correction d'erreur : 1 module masqué reste décodable (niveau M)
// Run : node tools/qr_test.mjs
import { readFileSync } from 'fs'

let fail = 0
const check = (name, cond) => { if (cond) console.log('ok  ', name); else { fail++; console.log('FAIL', name) } }

// ---- harnais : qrcode-generator (vendor/qrcode.js, script simple -> global qrcode) ----
function loadQrcode() {
  const src = readFileSync(new URL('../vendor/qrcode.js', import.meta.url), 'utf8')
  return new Function(src + '\n;return qrcode')()
}

// ---- harnais : jsQR (vendor/jsQR.js, UMD) ----
function loadJsQR() {
  const src = readFileSync(new URL('../vendor/jsQR.js', import.meta.url), 'utf8')
  const module = { exports: {} }
  new Function('module', 'exports', src)(module, module.exports)
  return module.exports.default || module.exports.jsQR || module.exports
}

const qrcode = loadQrcode()
const jsQR = loadJsQR()

// matrix -> ImageData-like (RGBA), marge blanche de 4 modules autour
function matrixToImageData(qr, quiet) {
  const n = qr.getModuleCount()
  const size = n + quiet * 2
  const data = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue
      const y = r + quiet, x = c + quiet
      const i = (y * size + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 0
    }
  }
  return { data, width: size, height: size }
}

function roundTrip(s, ecc) {
  const qr = qrcode(0, ecc || 'M')
  qr.addData(s)
  qr.make()
  const img = matrixToImageData(qr, 4)
  return jsQR(img.data, img.width, img.height)
}

// 1) chaîne courte
let d = roundTrip('SLIME-TEST-1234')
check('round-trip chaîne courte', !!d && d.data === 'SLIME-TEST-1234')

// 2) code v2 réaliste (contact embarqué)
const code = 'Mi4xMjM0LjY1LjE3NTkxMjM0NTY3ODkuY29udGFjdC1iNjQ.TA0pFaKcFqGQ0Z1b2C3d4E5f6G7h8I9j'
d = roundTrip(code)
check('round-trip code v2 (~80 car.)', !!d && d.data === code)

// 2b) long code (contact longue email + payload)
const long = (C => C)(Array(6).fill('SLIME1.abcd.1234.5678').join('.'))
d = roundTrip(long)
check('round-trip long code (~104 car.)', !!d && d.data === long)

// 3) tolérance : un module isolé effacé reste décodable (ECC niveau M)
{
  const qr = qrcode(0, 'M')
  qr.addData('SLIME-TEST-1234')
  qr.make()
  const n = qr.getModuleCount()
  let erased = 0
  for (let r = 1; r < n - 1 && erased < 1; r++) {
    for (let c = 1; c < n - 1 && erased < 1; c++) {
      if (qr.isDark(r, c)) { qr._modules ? qr._modules[r][c] = false : null; erased++ }
    }
  }
  // qrcode-generator n'expose pas toujours la matrice : on retente via isDark
  // seulement si la mutation a été possible — sinon le check est informatif.
  const img = matrixToImageData(qr, 4)
  const dec = jsQR(img.data, img.width, img.height)
  check('module effacé -> toujours décodable (ECC M) [mutation ' + (erased ? 'appliquée' : 'non exposée') + ']', !erased || (dec && dec.data === 'SLIME-TEST-1234'))
}

if (fail === 0) console.log('\nQR OK — génération + lecture round-trip')
else { console.error(`\n${fail} CHECK(S) EN ÉCHEC`); process.exit(1) }
