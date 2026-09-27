// Test HTTP de l'API scores de L'Atelier des bocaux (server.mjs) : soumissions
// signées (HMAC + re-décodage du code), rate-limit IP 1/30 s, modération admin
// (X-Slime-Key), paliers syncés via layout.tiers (PUT /api/state).
// Même harnais que tools/server_test.mjs : createHandler sur port 0, dataDir
// temporaire — jamais le data/ réel. La fenêtre de rate-limit se traverse via
// l'horloge injectée (option `now` de createHandler), sans jamais attendre.
// Usage : node tools/scores_http_test.mjs
import http from 'node:http'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert'
import { createHmac } from 'node:crypto'

import { createHandler } from '../server.mjs'

const ROOT = new URL('..', import.meta.url).pathname
// Data dir isolé : le test ne doit JAMAIS écrire dans <ROOT>/data/.
const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'slime-scores-http-'))
const KEY = 'cle-de-test'
const REAL_POOL = path.join(ROOT, 'data', 'pool.json')
const REAL_SCORES = path.join(ROOT, 'data', 'scores.json')
const realPoolBefore = readFileSync(REAL_POOL, 'utf8')
const realScoresBefore = existsSync(REAL_SCORES) ? readFileSync(REAL_SCORES, 'utf8') : null

// ---- fabrique de codes signés : réimplémentation du format de js/crypto.js
// (b64url("score.elapsed.date") + '.' + hmac-sha256(secret) tronqué à 32 hex) ----
const SECRET = 'S1!m3~Vault#K7-2026'
const b64url = s => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const makeCode = (score, elapsed, date = Date.now()) => {
  const t = Math.max(0, Math.floor(elapsed || 0))
  const body = b64url(score + '.' + t + '.' + date)
  return body + '.' + createHmac('sha256', SECRET).update(body).digest('hex').slice(0, 32)
}

// Horloge injectée : avancer de 30 s se fait en un tick, la fenêtre de
// rate-limit se teste nettement (ancrée sur la dernière RÉUSSITE, pas les refus).
const T0 = 1700000000000
let fakeNow = T0
const tick = ms => (fakeNow += ms)
const scoresOnDisk = () => JSON.parse(readFileSync(path.join(DATA_DIR, 'scores.json'), 'utf8'))

const server = http.createServer()
try {
  const handler = await createHandler({ dataDir: DATA_DIR, writeKey: KEY, now: () => fakeNow })
  server.on('request', handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const BASE = 'http://127.0.0.1:' + server.address().port
  const post = (p, body, headers = {}) => fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })
  console.log('ok   serveur de test sur :' + server.address().port + ' (dataDir temporaire, horloge injectée)')

  // ---- admin sans clé : 401 avant toute autre considération ----
  let r = await fetch(BASE + '/api/admin/pending')
  assert.strictEqual(r.status, 401, 'GET /api/admin/pending sans clé -> 401')
  r = await fetch(BASE + '/api/admin/pending', { headers: { 'X-Slime-Key': 'faux' } })
  assert.strictEqual(r.status, 401, 'GET /api/admin/pending clé erronée -> 401')
  r = await post('/api/admin/validate', { id: 1 })
  assert.strictEqual(r.status, 401, 'POST /api/admin/validate sans clé -> 401')
  r = await post('/api/admin/delete', { id: 1 })
  assert.strictEqual(r.status, 401, 'POST /api/admin/delete sans clé -> 401')
  console.log('ok   /api/admin/* sans X-Slime-Key (ou clé erronée) -> 401')

  // ---- classement vierge : paliers par défaut (6), tout fermé ----
  let v = await (await fetch(BASE + '/api/scores')).json()
  assert.strictEqual(v.golden.length, 0, 'store vide : golden []')
  assert.strictEqual(v.tiers.length, 6, 'sans layout.tiers poussé : 6 paliers par défaut')
  assert.ok(v.tiers.every(t => t.open === false), 'store vide : tout fermé')
  let p = await (await fetch(BASE + '/api/admin/pending', { headers: { 'X-Slime-Key': KEY } })).json()
  assert.deepStrictEqual(p, { pending: [] })
  console.log('ok   GET /api/scores vierge (6 paliers défaut) + GET /api/admin/pending vide')

  // ---- 400 : payload/code invalides — AUCUN ne consomme le quota ----
  const good = { v: 1, name: 'Émile', score: 250, playtime: 300, times: [[0, 10], [2, 95]] }
  r = await post('/api/scores', good)
  assert.strictEqual(r.status, 400, 'POST sans code -> 400')
  assert.ok((await r.json()).error, '400 -> {error}')
  r = await post('/api/scores', { ...good, code: makeCode(250, 300).slice(0, -2) + 'zz' })
  assert.strictEqual(r.status, 400, 'POST signature forgée -> 400')
  r = await post('/api/scores', { ...good, code: makeCode(240, 300) })
  assert.strictEqual(r.status, 400, 'POST code signé pour un autre score -> 400')
  r = await post('/api/scores', { ...good, code: makeCode(250, 310) })
  assert.strictEqual(r.status, 400, 'POST code elapsed incohérent (10 s > ±2 s) -> 400')
  r = await post('/api/scores', { ...good, score: 999999, playtime: 30000, code: makeCode(999999, 30000) })
  assert.strictEqual(r.status, 400, 'POST score 999999 -> 400')
  r = await post('/api/scores', '{pas du json')
  assert.strictEqual(r.status, 400, 'POST JSON invalide -> 400')
  console.log('ok   POST invalide (sans code, sig forgée, code incohérent, 999999, JSON) -> 400')

  // ---- soumission valide : 200 {ok,accepted} + persistance immédiate ----
  // elapsed du code = playtime + 2 s : borne exacte de la tolérance ±2 s.
  r = await post('/api/scores', { ...good, code: makeCode(250, 302) })
  assert.strictEqual(r.status, 200, 'POST valide -> 200')
  assert.deepStrictEqual(await r.json(), { ok: true, accepted: true }, '200 {ok:true, accepted:true}')
  let disk = scoresOnDisk()
  assert.strictEqual(disk.entries.length, 1, 'acceptée -> saveScores (1 entrée sur disque)')
  assert.strictEqual(disk.entries[0].name, 'Émile')
  assert.strictEqual(disk.entries[0].approved, false)
  console.log('ok   POST valide -> 200 {ok:true,accepted:true}, scores.json écrit (tolérance ±2 s incluse)')

  // ---- palier fermé : invisible publiquement, listé en modération ----
  v = await (await fetch(BASE + '/api/scores')).json()
  assert.strictEqual(v.tiers[2].open, false, 'aucun pilier : palier 2 fermé')
  assert.strictEqual(v.golden.length, 0, 'pending absent du golden')
  assert.ok(!JSON.stringify(v).includes('Émile'), 'aucune trace publique du pending')
  p = await (await fetch(BASE + '/api/admin/pending', { headers: { 'X-Slime-Key': KEY } })).json()
  assert.strictEqual(p.pending.length, 1)
  assert.deepStrictEqual(
    p.pending[0],
    { id: 1, name: 'Émile', score: 250, tier: 2, times: [[0, 10], [2, 95]], createdAt: T0 },
    'pending : {id,name,score,tier,times,createdAt}'
  )
  console.log('ok   GET /api/scores : pending invisible ; GET /api/admin/pending le liste')

  // ---- rate-limit 1/IP/30 s : 429 immédiat, refus sans décalage de fenêtre ----
  const bob = { v: 1, name: 'Bob', score: 260, playtime: 300, times: [[2, 80]], code: makeCode(260, 300) }
  r = await post('/api/scores', bob)
  assert.strictEqual(r.status, 429, '2e soumission immédiate même IP -> 429')
  assert.ok((await r.json()).error, '429 -> {error}')
  tick(10000)
  r = await post('/api/scores', bob)
  assert.strictEqual(r.status, 429, '+10 s -> toujours 429')
  tick(10000)
  r = await post('/api/scores', '{invalide')
  assert.strictEqual(r.status, 429, 'POST invalide dans la fenêtre -> 429 quand même (gate AVANT le parse)')
  tick(9000) // T0+29 s : dernier refus
  r = await post('/api/scores', bob)
  assert.strictEqual(r.status, 429, '+29 s -> toujours 429')
  tick(1001) // T0+30001 : fenêtre ancrée sur la dernière RÉUSSITE passée
  r = await post('/api/scores', bob)
  assert.strictEqual(r.status, 200, 'T0+30,001 s : accepté — les 429 n\'ont pas décalé la fenêtre')
  assert.strictEqual((await r.json()).accepted, true)
  console.log('ok   rate-limit : 429 immédiat, gate avant parse, refus non consommés, fenêtre close à +30 s')

  // ---- meilleur-par-nom : 200 {accepted:false}, l'existant est intact ----
  tick(31001)
  r = await post('/api/scores', { v: 1, name: 'émile'.normalize('NFD'), score: 200, playtime: 300, times: [], code: makeCode(200, 300) })
  assert.strictEqual(r.status, 200, 'soumission valide mais score inférieur -> 200')
  assert.deepStrictEqual(await r.json(), { ok: true, accepted: false }, '200 {ok:true, accepted:false} (ignorée)')
  disk = scoresOnDisk()
  assert.strictEqual(disk.entries.length, 2, 'pas de nouvelle entrée')
  assert.strictEqual(disk.entries.find(e => e.name === 'Émile').score, 250, 'meilleur score conservé')
  console.log('ok   meilleur-par-nom : accepted:false, entrée existante intacte')

  // ---- validation admin : le palier s'ouvre, le nom devient public ----
  r = await post('/api/admin/validate', { id: 1 }, { 'X-Slime-Key': KEY })
  assert.strictEqual(r.status, 200)
  assert.deepStrictEqual(await r.json(), { ok: true }, 'validate -> {ok:true}')
  disk = scoresOnDisk()
  assert.strictEqual(disk.entries.find(e => e.id === 1).approved, true, 'approbation persistée (saveScores)')
  v = await (await fetch(BASE + '/api/scores')).json()
  assert.strictEqual(v.tiers[2].open, true, 'pilier approuvé : paliers 0..2 ouverts')
  assert.deepStrictEqual(v.tiers[2].top.map(x => x.name), ['Bob', 'Émile'], 'top du palier : temps croissant (80 < 95)')
  assert.deepStrictEqual(v.golden.map(g => g.name), ['Bob', 'Émile'], 'golden : score décroissant')
  assert.ok(
    v.golden.every(g => !('score' in g)) && v.tiers[2].top.every(t => !('score' in t)),
    'aucun score dans la vue publique'
  )
  p = await (await fetch(BASE + '/api/admin/pending', { headers: { 'X-Slime-Key': KEY } })).json()
  assert.deepStrictEqual(p, { pending: [] }, 'plus rien à modérer (Bob couvert par le palier ouvert)')
  console.log('ok   validate : palier ouvert, Émile/Bob publics avec leurs temps, plus de pending')

  // ---- PUT /api/state avec layout.tiers custom : paliers recalculés ----
  const CUSTOM = [{ min: 0 }, { min: 100 }, { min: 200 }, { min: 400 }, { min: 900 }]
  r = await fetch(BASE + '/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Slime-Key': KEY },
    body: JSON.stringify({ state: { format: 'slime-patterns@1', patterns: [], layout: { tiers: CUSTOM } } })
  })
  assert.strictEqual(r.status, 200, 'PUT /api/state avec layout.tiers -> 200')
  const st = await (await fetch(BASE + '/api/state')).json()
  assert.deepStrictEqual(st.state.layout.tiers, CUSTOM, 'GET /api/state retourne layout.tiers tel quel')
  // score 350 : tier 3 avec les paliers par défaut (fermé -> invisible), tier 2
  // avec les custom (ouvert -> visible) — la vue DOIT suivre la config poussée.
  tick(31001)
  r = await post('/api/scores', { v: 1, name: 'Caro', score: 350, playtime: 300, times: [[3, 120]], code: makeCode(350, 300) })
  assert.strictEqual(r.status, 200, 'POST Caro après changement de config -> 200')
  assert.strictEqual((await r.json()).accepted, true)
  v = await (await fetch(BASE + '/api/scores')).json()
  assert.strictEqual(v.tiers.length, 5, 'vue publique : 5 paliers (config custom)')
  const caro = v.golden.find(g => g.name === 'Caro')
  assert.ok(caro && caro.tier === 2, 'tier recalculé selon les paliers custom (350 -> 2, visible)')
  assert.strictEqual(v.tiers[2].total, 3, 'Caro compte au total du palier 2 (sans temps de palier 2)')
  p = await (await fetch(BASE + '/api/admin/pending', { headers: { 'X-Slime-Key': KEY } })).json()
  assert.deepStrictEqual(p, { pending: [] }, 'palier custom ouvert : Caro non pending')
  console.log('ok   layout.tiers syncé : GET tel quel + tier des entrées recalculé (350 -> palier 2 custom)')

  // ---- delete du dernier pilier : nom retiré du public, palier refermé ----
  r = await post('/api/admin/delete', { id: 1 }, { 'X-Slime-Key': KEY })
  assert.strictEqual(r.status, 200)
  assert.deepStrictEqual(await r.json(), { ok: true }, 'delete -> {ok:true}')
  disk = scoresOnDisk()
  assert.strictEqual(disk.entries.length, 2, 'suppression persistée (saveScores)')
  assert.ok(!disk.entries.some(e => e.id === 1), 'Émile supprimé')
  v = await (await fetch(BASE + '/api/scores')).json()
  assert.ok(!JSON.stringify(v).includes('Émile'), 'Émile disparu du GET public')
  assert.strictEqual(v.golden.length, 0, 'plus de pilier : golden vide')
  assert.ok(v.tiers.every(t => t.open === false), 'les validés dérivés (Bob, Caro) retombent invisibles')
  p = await (await fetch(BASE + '/api/admin/pending', { headers: { 'X-Slime-Key': KEY } })).json()
  assert.deepStrictEqual(p.pending.map(x => x.name), ['Caro', 'Bob'], 'pending trié palier puis score décroissant')
  assert.deepStrictEqual(Object.keys(p.pending[0]), ['id', 'name', 'score', 'tier', 'times', 'createdAt'])
  console.log('ok   delete du dernier pilier : nom retiré du public, paliers refermés, Bob/Caro pending')

  // ---- cas admin restants : id inconnu / absent ----
  r = await post('/api/admin/validate', { id: 999 }, { 'X-Slime-Key': KEY })
  assert.strictEqual(r.status, 404, 'validate id inconnu -> 404')
  r = await post('/api/admin/delete', { id: 999 }, { 'X-Slime-Key': KEY })
  assert.strictEqual(r.status, 404, 'delete id inconnu -> 404')
  r = await post('/api/admin/validate', {}, { 'X-Slime-Key': KEY })
  assert.strictEqual(r.status, 400, 'validate sans id -> 400')
  console.log('ok   validate/delete : 404 id inconnu, 400 sans id')

  console.log('TOUS LES TESTS PASSENT')
} finally {
  server.close()
  server.closeAllConnections()
  // Garde anti-pollution : le vrai data/ ne doit pas avoir bougé.
  assert.strictEqual(readFileSync(REAL_POOL, 'utf8'), realPoolBefore, 'data/pool.json intact')
  if (realScoresBefore !== null) {
    assert.strictEqual(readFileSync(REAL_SCORES, 'utf8'), realScoresBefore, 'data/scores.json intact')
  } else {
    assert.ok(!existsSync(REAL_SCORES), 'data/scores.json toujours absent')
  }
  rmSync(DATA_DIR, { recursive: true, force: true })
}
