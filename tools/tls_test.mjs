// Test — HTTPS du serveur LAN : ensureTlsCert (server.mjs) génère un
// certificat auto-signé pour activer la caméra du scanner QR (decode.html)
// hors localhost. Contrats :
//   1. génération -> server.crt + server.key dans le dir demandé, PEM valides
//   2. SAN : localhost + 127.0.0.1 + les IP LAN passées (le téléphone visite
//      https://<IP>:8472 — le cert doit couvrir cette IP)
//   3. réutilisation : un 2e appel ne régénère PAS (mtime inchangé)
//   4. openssl absent (binaire injecté inexistant) -> null, jamais un crash
// Run : node tools/tls_test.mjs
import { execFileSync } from 'node:child_process'
import { mkdtempSync, existsSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert'

import { ensureTlsCert } from '../server.mjs'

let fail = 0
const check = (name, cond) => { if (cond) console.log('ok  ', name); else { fail++; console.log('FAIL', name) } }

const dir = mkdtempSync(path.join(tmpdir(), 'slime-tls-'))
try {
  // 1) génération
  const ips = ['127.0.0.1', '192.168.1.50']
  const r = ensureTlsCert({ dir, ips })
  check('retourne { cert, key }', !!r && !!r.cert && !!r.key)
  check('server.crt + server.key créés', existsSync(r.cert) && existsSync(r.key))
  const pemC = statSync(r.cert), pemK = statSync(r.key)
  check('fichiers non vides', pemC.size > 100 && pemK.size > 100)

  // 2) PEM valides + SAN : le cert est lisible et couvre localhost + les IP
  const txt = execFileSync('openssl', ['x509', '-in', r.cert, '-noout', '-text'], { encoding: 'utf8' })
  check('certificat X509 lisible', txt.includes('Certificate'))
  check('SAN : DNS:localhost', txt.includes('DNS:localhost'))
  check('SAN : IP 127.0.0.1', txt.includes('IP Address:127.0.0.1'))
  check('SAN : IP LAN 192.168.1.50', txt.includes('IP Address:192.168.1.50'))
  check('clé privée PEM valide', execFileSync('openssl', ['pkey', '-in', r.key, '-noout'], { stdio: 'pipe', encoding: 'utf8' }) === '')

  // 3) réutilisation : 2e appel -> mêmes fichiers, non régénérés
  const before = statSync(r.cert).mtimeMs
  const r2 = ensureTlsCert({ dir, ips })
  check('2e appel : mêmes chemins', r2.cert === r.cert && r2.key === r.key)
  check('2e appel : pas de régénération (mtime stable)', statSync(r.cert).mtimeMs === before)

  // 4) openssl absent -> null (jamais de crash)
  const dir2 = mkdtempSync(path.join(tmpdir(), 'slime-tls-'))
  const r3 = ensureTlsCert({ dir: dir2, ips, opensslBin: 'openssl-inexistant-pour-test' })
  check('openssl absent -> null', r3 === null && !existsSync(path.join(dir2, 'server.crt')))

  if (fail === 0) console.log('\nTLS OK — tous les checks passent')
  else { console.error(`\n${fail} CHECK(S) EN ÉCHEC`); process.exit(1) }
} finally {
  rmSync(dir, { recursive: true, force: true })
}
