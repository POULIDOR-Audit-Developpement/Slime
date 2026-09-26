// Test sync LAN : démarre server.mjs sur un port éphémère, vérifie l'API,
// puis charge le vrai js/patterns.js dans un sandbox avec fetch branché sur
// ce serveur : adoption, poussée à save(), notification onChange, polling.
// Usage : node tools/lan_sync_test.mjs
import { readFileSync, mkdtempSync, rmSync } from 'fs'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import assert from 'node:assert'

const ROOT = new URL('..', import.meta.url).pathname
const PORT = 8971
const BASE = 'http://127.0.0.1:' + PORT

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---- 1) serveur ----
// Data dir isolé : le test ne doit JAMAIS écrire dans <ROOT>/data/pool.json.
const DATA_DIR = mkdtempSync(path.join(tmpdir(), 'slime-lan-test-'))
const REAL_POOL = path.join(ROOT, 'data', 'pool.json')
const realPoolBefore = readFileSync(REAL_POOL, 'utf8')
const srv = spawn(process.execPath, ['server.mjs', '--port', String(PORT)], {
  cwd: ROOT,
  env: { ...process.env, SLIME_DATA_DIR: DATA_DIR },
  stdio: ['ignore', 'pipe', 'pipe']
})
srv.stderr.on('data', d => process.stderr.write('[serveur] ' + d))
let up = false
for (let i = 0; i < 50 && !up; i++) {
  try { const r = await fetch(BASE + '/api/rev'); if (r.ok) up = true } catch (e) { await sleep(100) }
}
assert.ok(up, 'serveur démarré')
console.log('ok   serveur LAN sur :' + PORT)

try {
  // ---- 2) API brute ----
  let r = await fetch(BASE + '/')
  assert.strictEqual(r.status, 200)
  assert.match(await r.text(), /<title>SLIME<\/title>/)
  r = await fetch(BASE + '/api/rev')
  const rev0 = (await r.json()).rev
  assert.ok(rev0 >= 1)

  const store = {
    format: 'slime-patterns@1',
    patterns: [{
      id: 't1', name: 'test', difficulty: 1, entry: { row: 2 },
      platforms: [{ x: 96, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null }],
      balls: [], decor: []
    }],
    layout: null
  }
  r = await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: store })
  })
  assert.strictEqual(r.status, 200)
  const put = await r.json()
  assert.strictEqual(put.rev, rev0 + 1)

  r = await fetch(BASE + '/api/state')
  const st = await r.json()
  assert.strictEqual(st.rev, rev0 + 1)
  assert.strictEqual(st.state.patterns[0].id, 't1')

  r = await fetch(BASE + '/api/state', { method: 'PUT', body: '{"format":"autre"}' })
  assert.strictEqual(r.status, 400, 'PUT invalide rejeté')

  r = await fetch(BASE + '/editor.html')
  assert.strictEqual(r.status, 200)
  console.log('ok   API statique + rev/state/PUT + rejet format invalide')

  // ---- 3) client Patterns (vrai fichier, fetch branché sur le serveur) ----
  const storeStub = {}
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval: (fn, ms) => { lanPoll = fn; return 1 },
    clearInterval: () => {},
    localStorage: {
      getItem: k => (k in storeStub ? storeStub[k] : null),
      setItem: (k, v) => { storeStub[k] = String(v) },
      removeItem: k => { delete storeStub[k] }
    },
    fetch: (url, opts) => fetch(BASE + url, opts),
    location: { protocol: 'http:', origin: BASE },
    window: null
  }
  sandbox.window = { location: sandbox.location }
  let lanPoll = null
  const ctx = vm.createContext(sandbox)
  const src = ['js/physics.js', 'js/patterns-defaults.js', 'js/patterns.js']
    .map(f => readFileSync(ROOT + f, 'utf8')).join('\n')
  const P = vm.runInContext(src + '\nPatterns', ctx, { filename: 'patterns-bundle.js' })

  await sleep(300) // laisse lanStart faire rev + state + (push) + notify
  const lan = P.lanStatus()
  assert.ok(lan.on, 'client connecté au serveur LAN')
  assert.strictEqual(lan.rev, rev0 + 1)
  assert.deepStrictEqual(P.getPatterns().map(p => p.id), ['t1'], 'état distant adopté')
  assert.strictEqual(P.loadStatus(), 'lan')

  // save() pousse au serveur : rev serveur augmente
  const revBefore = P.lanStatus().rev
  const p2 = JSON.parse(JSON.stringify(store.patterns[0])); p2.id = 't2'; p2.name = 'deux'
  P.setPatternsRaw([store.patterns[0], p2])
  await sleep(250)
  const st2 = await (await fetch(BASE + '/api/state')).json()
  assert.ok(st2.rev > revBefore, 'save() a poussé au serveur')
  assert.strictEqual(st2.state.patterns.length, 2)
  assert.strictEqual(P.lanStatus().rev, st2.rev, 'rev client aligné sur le serveur')

  // localStorage miroir à jour (fallback hors-ligne)
  const mirror = JSON.parse(storeStub['slime_patterns_v1'])
  assert.strictEqual(mirror.patterns.length, 2)

  // changement distant (autre appareil simulé : PUT direct) -> poll + notify
  const events = []
  P.lanOnChange(r => { if (r === 'remote') events.push(r) })
  const storeB = JSON.parse(JSON.stringify(st2.state)); storeB.patterns = storeB.patterns.slice(0, 1)
  await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: storeB })
  })
  assert.ok(lanPoll, 'boucle de polling armée')
  await lanPoll()
  await lanPoll()
  assert.ok(events.includes('remote'), 'onChange(remote) notifié')
  assert.deepStrictEqual(P.getPatterns().map(p => p.id), ['t1'], 'pool distant re-adopté')

  // garde anti-perte : un état distant VIDE (serveur neuf/réinitialisé)
  // n'efface JAMAIS un pool local non vide
  const emptyState = JSON.parse(JSON.stringify(st2.state))
  emptyState.patterns = []
  await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: emptyState })
  })
  await lanPoll()
  assert.deepStrictEqual(P.getPatterns().map(p => p.id), ['t1'], 'pool distant vide : pool local intact')

  // écho de notre propre poussée : PAS de re-pull (pas de boucle)
  P.setPatternsRaw([store.patterns[0], p2])
  const revMine = (await (await fetch(BASE + '/api/rev')).json()).rev
  await lanPoll() // rev === lastPushed -> no-op
  assert.strictEqual(P.getPatterns().length, 2, 'écho ignoré, pool intact')

  console.log('ok   client : adoption, push save(), miroir local, polling, écho')
  console.log('TOUS LES TESTS PASSENT')
} finally {
  srv.kill('SIGKILL')
  // Garde anti-pollution : le vrai pool LAN ne doit pas avoir bougé.
  assert.strictEqual(readFileSync(REAL_POOL, 'utf8'), realPoolBefore, 'data/pool.json intact')
  rmSync(DATA_DIR, { recursive: true, force: true })
}
process.exit(0)
