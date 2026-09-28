// Test T6 — L'Atelier des bocaux, côté client (js/scores.js) :
//   TierTimes : suivi PUR des temps d'obtention de palier ([[tierIdx, sec], …]).
//   Scores    : submit() fire-and-forget (POST /api/scores, timeout AbortController,
//               n'échoue JAMAIS — fetch stubbé, aucune dépendance DOM/réseau).
// Harnais `new Function` (style player_test.mjs) : fetch/setTimeout passés en
// paramètres pour stubber le réseau sans toucher aux globals Node.
// Run : node tools/tiertime_test.mjs
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const check = (label, ok) => { ok ? pass++ : fail++; console.log((ok ? 'ok  ' : 'FAIL') + ' ' + label) }
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---- harnais : charge js/scores.js avec un fetch factice en paramètre ----
function loadScores(fetchStub) {
  const src = readFileSync(new URL('../js/scores.js', import.meta.url), 'utf8')
  const sandbox = new Function(
    'fetch', 'setTimeout', 'clearTimeout', 'window',
    'return (() => {' + src + '; return { TierTimes, Scores } })()'
  )
  return sandbox(fetchStub, setTimeout, clearTimeout, undefined)
}

// ---- 1. TierTimes : cas du brief ----
{
  const { TierTimes } = loadScores(() => Promise.resolve({ ok: true }))
  check('reset() -> []', deepEq(TierTimes.reset(), []))
  check('track([], 0, 10) -> [[0,10]]', deepEq(TierTimes.track([], 0, 10), [[0, 10]]))
  check('track([[0,10]], 0, 20) -> inchangé', deepEq(TierTimes.track([[0, 10]], 0, 20), [[0, 10]]))
  check('track([[0,10]], 2, 95) -> [[0,10],[2,95]]', deepEq(TierTimes.track([[0, 10]], 2, 95), [[0, 10], [2, 95]]))
}

// ---- 2. TierTimes : pureté + bornes ----
{
  const { TierTimes } = loadScores(() => Promise.resolve({ ok: true }))
  const a = [[0, 10]]
  const b = TierTimes.track(a, 2, 95)
  check('pure : entrée non mutée quand un palier est ajouté', deepEq(a, [[0, 10]]) && b !== a)
  check('même palier -> même tableau renvoyé (pas de copie inutile)', TierTimes.track(a, 0, 20) === a)
  check('palier inférieur au dernier suivi -> ignoré', deepEq(TierTimes.track([[0, 10], [2, 95]], 1, 100), [[0, 10], [2, 95]]))
  check('arrondi : 10.4 s -> 10', deepEq(TierTimes.track([], 0, 10.4), [[0, 10]]))
  check('arrondi : 10.6 s -> 11', deepEq(TierTimes.track([], 0, 10.6), [[0, 11]]))
  check('tierIdx non entier -> ignoré', deepEq(TierTimes.track([], 1.5, 10), []))
  check('tierIdx négatif -> ignoré', deepEq(TierTimes.track([], -1, 10), []))
  check('times non tableau -> traité comme vide', deepEq(TierTimes.track(null, 0, 10), [[0, 10]]))
  check('paires = nombres (JSON propre pour le serveur)', TierTimes.track([], 0, 10)[0].every(Number.isFinite))
  check('reset() : tableau neuf à chaque appel', TierTimes.reset() !== TierTimes.reset())
}

// ---- 3. Scores.submit : requête au bon format ----
{
  const calls = []
  const fetchStub = (url, opts) => { calls.push({ url, opts }); return Promise.resolve({ ok: true, status: 200 }) }
  const { Scores } = loadScores(fetchStub)
  const payload = { v: 1, name: 'Émile', score: 42, playtime: 57, times: [[0, 0], [1, 31]], code: 'AB12' }
  const p = Scores.submit(payload)
  check('submit renvoie une promesse', p instanceof Promise)
  const r = await p
  check('fetch appelé une fois sur /api/scores', calls.length === 1 && calls[0].url === '/api/scores')
  check('method POST', calls[0].opts.method === 'POST')
  check('Content-Type: application/json', calls[0].opts.headers['Content-Type'] === 'application/json')
  check('body = JSON exact du payload', JSON.parse(calls[0].opts.body) && deepEq(JSON.parse(calls[0].opts.body), payload))
  check('réponse 200 propagée', r === calls[0] || (r && r.status === 200))
}

// ---- 4. Scores.submit : n'échoue JAMAIS ----
{
  // fetch qui rejette (réseau coupé) -> submit résout quand même, sans lever
  {
    const { Scores } = loadScores(() => Promise.reject(new Error('network down')))
    let threw = false
    try { await Scores.submit({ v: 1, name: 'X', score: 1, playtime: 1, times: [], code: 'C' }) } catch (e) { threw = true }
    check('fetch qui rejette -> submit résout (silencieux)', !threw)
  }
  // réponse d'erreur HTTP (400/429) -> ignorée, submit résout
  {
    const { Scores } = loadScores(() => Promise.resolve({ ok: false, status: 429 }))
    let threw = false
    try { await Scores.submit({ v: 1, name: 'X', score: 1, playtime: 1, times: [], code: 'C' }) } catch (e) { threw = true }
    check('HTTP 429 -> submit résout (statut ignoré)', !threw)
  }
  // fetch absent (harnais sans réseau) -> no-op propre
  {
    const { Scores } = loadScores(undefined)
    let threw = false
    try { await Scores.submit({ v: 1, name: 'X', score: 1, playtime: 1, times: [], code: 'C' }) } catch (e) { threw = true }
    check('fetch absent -> submit résout sans rien faire', !threw)
  }
  // payload non sérialisable (cycle) -> pas de fetch, pas d'exception
  {
    let called = 0
    const cyc = { v: 1 }; cyc.self = cyc
    const { Scores } = loadScores(() => { called++; return Promise.resolve({ ok: true }) })
    let threw = false
    try { await Scores.submit(cyc) } catch (e) { threw = true }
    check('payload non sérialisable -> silencieux, fetch pas appelé', !threw && called === 0)
  }
}

// ---- 5. Scores.submit : timeout via AbortController ----
{
  const calls = []
  // fetch qui ne répond jamais : seul l'abort du signal le déclenche
  const fetchStub = (url, opts) => new Promise((res, rej) => {
    calls.push({ url, opts })
    if (opts && opts.signal) opts.signal.addEventListener('abort', () => rej(new Error('aborted')))
  })
  const { Scores } = loadScores(fetchStub)
  const t0 = Date.now()
  let threw = false
  try { await Scores.submit({ v: 1, name: 'X', score: 1, playtime: 1, times: [], code: 'C' }, 25) } catch (e) { threw = true }
  const dt = Date.now() - t0
  check('timeout : signal passé à fetch', !!calls[0].opts.signal)
  check('timeout : abort déclenché après le délai', calls[0].opts.signal.aborted === true && dt >= 20)
  check('timeout : submit résout malgré tout', !threw)
}

// ---- 6. hors navigateur : le module se charge sans exception (pas de window) ----
{
  let threw = false
  try { loadScores(() => Promise.resolve({ ok: true })) } catch (e) { threw = true; console.log('   ', e.message) }
  check('chargement sans window/fetch réels : ok', !threw)
}

console.log(fail === 0 ? '\nTIERTIME OK — tous les checks passent' : `\n${fail} CHECK(S) EN ÉCHEC`)
process.exit(fail === 0 ? 0 : 1)
