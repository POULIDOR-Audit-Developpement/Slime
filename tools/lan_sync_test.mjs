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
  assert.match(await r.text(), /endless runner pixel-art/, '/ = page de présentation')
  r = await fetch(BASE + '/play.html')
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
  assert.strictEqual(r.status, 401, 'PUT sans clé refusé')
  r = await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Slime-Key': 'slime' },
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
  assert.strictEqual(r.status, 401, 'PUT invalide sans clé -> 401 d\'abord')
  r = await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Slime-Key': 'slime' },
    body: '{"format":"autre"}'
  })
  assert.strictEqual(r.status, 400)

  r = await fetch(BASE + '/editor.html')
  assert.strictEqual(r.status, 200)
  console.log('ok   API statique + rev/state/PUT + rejet format invalide')

  // ---- 3) client Patterns (vrai fichier, fetch branché sur le serveur) ----
  const storeStub = { slime_key: 'slime' } // éditeur déverrouillé : la clé part avec chaque push
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

  // changement distant (autre appareil simulé : PUT direct) -> poll + notify.
  // Fusion par id : le pattern distant modifié s'installe, t2 créé localement
  // (absent du distant) est CONSERVÉ au lieu d'être écrasé.
  const events = []
  P.lanOnChange(r => events.push(r))
  const storeB = JSON.parse(JSON.stringify(st2.state))
  storeB.patterns = [JSON.parse(JSON.stringify(store.patterns[0]))] // t1 seul
  storeB.patterns[0].name = 'un-cote-B'
  await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Slime-Key': 'slime' },
    body: JSON.stringify({ state: storeB })
  })
  assert.ok(lanPoll, 'boucle de polling armée')
  await lanPoll()
  await lanPoll()
  assert.ok(events.includes('remote'), 'onChange(remote) notifié')
  assert.deepStrictEqual(P.getPatterns().map(p => p.id), ['t2', 't1'], 'fusion : distant + création locale conservée (tri difficulté puis nom)')
  assert.strictEqual(P.getPatterns().find(p => p.id === 't1').name, 'un-cote-B', 'même id -> version distante')

  // garde anti-perte : un état distant VIDE (serveur neuf/réinitialisé)
  // n'efface JAMAIS un pool local non vide
  const emptyState = JSON.parse(JSON.stringify(storeB))
  emptyState.patterns = []
  await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Slime-Key': 'slime' },
    body: JSON.stringify({ state: emptyState })
  })
  await lanPoll()
  assert.deepStrictEqual(P.getPatterns().map(p => p.id), ['t2', 't1'], 'pool distant vide : pool local intact')

  // écho de notre propre poussée : PAS de re-pull (pas de boucle)
  P.setPatternsRaw([store.patterns[0], p2])
  const revMine = (await (await fetch(BASE + '/api/rev')).json()).rev
  await lanPoll() // rev === lastPushed -> no-op
  assert.strictEqual(P.getPatterns().length, 2, 'écho ignoré, pool intact')

  console.log('ok   client : adoption, push save(), miroir local, polling, écho')

  // ---- 4) concurrence optimiste : le serveur refuse les poussées périmées ----
  let revNow = (await (await fetch(BASE + '/api/rev')).json()).rev
  r = await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Slime-Key': 'slime' },
    body: JSON.stringify({ baseRev: revNow - 1, state: store })
  })
  assert.strictEqual(r.status, 409, 'PUT baseRev périmé -> 409')
  assert.strictEqual((await r.json()).rev, revNow, '409 renvoie la rev courante')
  assert.strictEqual((await (await fetch(BASE + '/api/rev')).json()).rev, revNow, '409 n\'incrémente pas la rev')
  assert.strictEqual((await (await fetch(BASE + '/api/state')).json()).state.patterns.length, 2, '409 : état inchangé')
  r = await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Slime-Key': 'slime' },
    body: JSON.stringify({ baseRev: revNow, state: store })
  })
  assert.strictEqual(r.status, 200, 'PUT baseRev à jour accepté')
  console.log('ok   409 sur baseRev périmé, accepté sur baseRev à jour')

  // ---- 5) conflit côté client : 409 -> pull + fusion, jamais d'écrasement ----
  // Autre appareil (PUT direct, sans baseRev) : t1 renommé côté serveur.
  const storeC = JSON.parse(JSON.stringify(store))
  storeC.patterns[0].name = 'un-cote-B'
  await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Slime-Key': 'slime' },
    body: JSON.stringify({ state: storeC })
  })
  // Session locale devenue périmée : renomme t1 et crée t3, puis save().
  // PUT refusé (baseRev périmée) -> fusion : t1 = version serveur (l'autre
  // appareil a poussé en dernier), t3 créé localement conservé et repoussé.
  const t1m = JSON.parse(JSON.stringify(store.patterns[0])); t1m.name = 'un-cote-client'
  const t3 = JSON.parse(JSON.stringify(store.patterns[0])); t3.id = 't3'; t3.name = 'trois'
  const evc = []
  P.lanOnChange(rr => { if (rr === 'conflict') evc.push(rr) })
  P.setPatternsRaw([t1m, t3])
  await sleep(600)
  const stc = await (await fetch(BASE + '/api/state')).json()
  assert.deepStrictEqual(stc.state.patterns.map(p => p.id), ['t3', 't1'], 'fusion poussée : distant + création locale (tri canonique)')
  assert.strictEqual(stc.state.patterns.find(p => p.id === 't1').name, 'un-cote-B', 'même id -> version serveur')
  assert.deepStrictEqual(P.getPatterns().map(p => p.id), ['t3', 't1'], 'client aligné sur la fusion')
  assert.strictEqual(P.getPatterns().find(p => p.id === 't1').name, 'un-cote-B')
  assert.strictEqual(P.lanStatus().rev, stc.rev, 'rev client = serveur après fusion')
  assert.ok(evc.length >= 1, 'onChange(conflict) notifié')
  const mirC = JSON.parse(storeStub['slime_patterns_v1'])
  assert.deepStrictEqual(mirC.patterns.map(p => p.id), ['t3', 't1'], 'miroir local = fusion')
  console.log('ok   conflit client : 409 -> pull + fusion, création locale repoussée')

  // ---- 6) poolTag : le remplacement s'impose, la fusion reprend ensuite ----
  // a) PUT avec poolTag -> servi tel quel ; PUT sans poolTag -> tag préservé.
  const S1 = { format: 'slime-patterns@1', patterns: [JSON.parse(JSON.stringify(store.patterns[0]))], layout: null, poolTag: 'tag-a' }
  await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Slime-Key': 'slime' },
    body: JSON.stringify({ state: S1 })
  })
  let stT = await (await fetch(BASE + '/api/state')).json()
  assert.strictEqual(stT.state.poolTag, 'tag-a', 'PUT avec poolTag -> servi tel quel')
  await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Slime-Key': 'slime' },
    body: JSON.stringify({ state: { format: S1.format, patterns: S1.patterns, layout: null } })
  })
  stT = await (await fetch(BASE + '/api/state')).json()
  assert.strictEqual(stT.state.poolTag, 'tag-a', 'PUT sans poolTag -> tag préservé')

  // b) appareil resté hors ligne (pool local 'local-only', sans tag) : au
  // premier pull le remplacement s'applique — local-only abandonné, tag
  // mémorisé, rien du local repoussé.
  const store2 = { slime_key: 'slime' }
  const localOnly = JSON.parse(JSON.stringify(store.patterns[0])); localOnly.id = 'local-only'; localOnly.name = 'local'
  store2['slime_patterns_v1'] = JSON.stringify({ format: 'slime-patterns@1', patterns: [localOnly], layout: null })
  let lanPoll2 = null
  const sandbox2 = {
    console,
    setTimeout, clearTimeout,
    setInterval: (fn, ms) => { lanPoll2 = fn; return 2 },
    clearInterval: () => {},
    localStorage: {
      getItem: k => (k in store2 ? store2[k] : null),
      setItem: (k, v) => { store2[k] = String(v) },
      removeItem: k => { delete store2[k] }
    },
    fetch: (url, opts) => fetch(BASE + url, opts),
    location: { protocol: 'http:', origin: BASE },
    window: null
  }
  sandbox2.window = { location: sandbox2.location }
  const P2 = vm.runInContext(src + '\nPatterns', vm.createContext(sandbox2), { filename: 'patterns-bundle-2.js' })
  await sleep(300)
  assert.deepStrictEqual(P2.getPatterns().map(p => p.id), ['t1'], 'remplacement : pool = distant seul (local-only abandonné)')
  assert.strictEqual(store2['slime_pool_tag'], 'tag-a', 'tag mémorisé localement')
  stT = await (await fetch(BASE + '/api/state')).json()
  assert.strictEqual(stT.state.patterns.length, 1, 'rien du local remplacé n\'est repoussé')

  // c) même tag ensuite : la création locale survit au pull (fusion union).
  const t9 = JSON.parse(JSON.stringify(S1.patterns[0])); t9.id = 't9'; t9.name = 'neuf'
  P2.setPatternsRaw([S1.patterns[0], t9])
  await sleep(300)
  stT = await (await fetch(BASE + '/api/state')).json()
  assert.deepStrictEqual(stT.state.patterns.map(p => p.id).sort(), ['t1', 't9'], 'création locale poussée')
  // autre appareil : PUT direct (même tag), t9 absent du distant
  await fetch(BASE + '/api/state', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Slime-Key': 'slime' },
    body: JSON.stringify({ state: { format: S1.format, patterns: S1.patterns, layout: null, poolTag: 'tag-a' } })
  })
  await lanPoll2()
  assert.deepStrictEqual(P2.getPatterns().map(p => p.id).sort(), ['t1', 't9'], 'même tag : fusion union, création locale conservée')
  console.log('ok   poolTag : remplacement imposé au premier pull, fusion ensuite')

  console.log('TOUS LES TESTS PASSENT')
} finally {
  srv.kill('SIGKILL')
  // Garde anti-pollution : le vrai pool LAN ne doit pas avoir bougé.
  assert.strictEqual(readFileSync(REAL_POOL, 'utf8'), realPoolBefore, 'data/pool.json intact')
  rmSync(DATA_DIR, { recursive: true, force: true })
}
process.exit(0)
