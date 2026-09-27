// Test d'export du serveur : createHandler({ dataDir, writeKey }) doit donner
// un handler HTTP montable sur un serveur de test (port 0, dataDir temporaire),
// sans démarrer le CLI ni toucher au data/ réel.
// Usage : node tools/server_test.mjs
import http from 'node:http'
import { promises as fs } from 'node:fs'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert'

import { createHandler } from '../server.mjs'

const ROOT = new URL('..', import.meta.url).pathname
// Data dir isolé : le test ne doit JAMAIS écrire dans <ROOT>/data/pool.json.
const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'slime-server-test-'))
const KEY = 'cle-de-test'
const REAL_POOL = path.join(ROOT, 'data', 'pool.json')
const realPoolBefore = readFileSync(REAL_POOL, 'utf8')

const server = http.createServer()
try {
  const handler = await createHandler({ dataDir: DATA_DIR, writeKey: KEY })
  server.on('request', handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const BASE = 'http://127.0.0.1:' + server.address().port
  console.log('ok   serveur de test sur :' + server.address().port + ' (dataDir temporaire)')

  // ---- GET /api/rev : pool vierge -> rev 1 ----
  let r = await fetch(BASE + '/api/rev')
  assert.strictEqual(r.status, 200)
  const rev0 = (await r.json()).rev
  assert.strictEqual(typeof rev0, 'number')
  assert.strictEqual(rev0, 1, 'dataDir vierge : rev initiale 1')
  console.log('ok   GET /api/rev -> 200 {rev:number}')

  // ---- GET /api/state : état null tant que rien n'a été poussé ----
  r = await fetch(BASE + '/api/state')
  assert.strictEqual(r.status, 200)
  assert.deepStrictEqual(await r.json(), { rev: 1, state: null }, 'dataDir vierge : state null')
  console.log('ok   GET /api/state -> 200 {rev, state:null}')

  // ---- PUT sans clé : refusé avant même de lire le corps ----
  r = await fetch(BASE + '/api/state', {
    method: 'PUT',
    body: JSON.stringify({ state: { format: 'slime-patterns@1', patterns: [] } })
  })
  assert.strictEqual(r.status, 401, 'PUT sans X-Slime-Key -> 401')
  console.log('ok   PUT sans X-Slime-Key -> 401')

  // ---- PUT avec clé : écrit et incrémente la rev (1 -> 2) ----
  r = await fetch(BASE + '/api/state', {
    method: 'PUT',
    headers: { 'X-Slime-Key': KEY },
    body: JSON.stringify({ state: { format: 'slime-patterns@1', patterns: [] } })
  })
  assert.strictEqual(r.status, 200)
  assert.deepStrictEqual(await r.json(), { ok: true, rev: 2 }, 'première poussée : rev 2')
  // Le pool a bien été écrit dans le dataDir temporaire (pas ailleurs).
  const saved = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'pool.json'), 'utf8'))
  assert.strictEqual(saved.rev, 2)
  assert.deepStrictEqual(saved.state, { format: 'slime-patterns@1', patterns: [], layout: null })
  console.log('ok   PUT avec clé -> 200 {ok:true,rev:2}, pool.json écrit dans le dataDir temporaire')

  // ---- Concurrence optimiste : baseRev périmé -> 409, rien n'est écrit ----
  r = await fetch(BASE + '/api/state', {
    method: 'PUT',
    headers: { 'X-Slime-Key': KEY },
    body: JSON.stringify({ baseRev: 1, state: { format: 'slime-patterns@1', patterns: [] } })
  })
  assert.strictEqual(r.status, 409, 'PUT baseRev périmé -> 409')
  assert.strictEqual((await r.json()).rev, 2, '409 renvoie la rev courante')
  assert.strictEqual((await (await fetch(BASE + '/api/rev')).json()).rev, 2, '409 : rev inchangée')
  console.log('ok   PUT baseRev périmé -> 409, rien n\'est écrit')

  console.log('TOUS LES TESTS PASSENT')
} finally {
  server.close()
  server.closeAllConnections()
  // Garde anti-pollution : le vrai pool LAN ne doit pas avoir bougé.
  assert.strictEqual(readFileSync(REAL_POOL, 'utf8'), realPoolBefore, 'data/pool.json intact')
  rmSync(DATA_DIR, { recursive: true, force: true })
}
