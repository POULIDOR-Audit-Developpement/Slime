// SLIME — serveur LAN : fichiers statiques + API de synchronisation du pool.
// Zéro dépendance : node server.mjs [--port 8471]
//
// SLIME_DATA_DIR=<chemin> : place data/pool.json ailleurs (tests, multi-instances).
//
// Exportable pour les tests : createHandler({ dataDir, writeKey }) renvoie le
// handler HTTP (sans écouter) — voir tools/server_test.mjs.
//
// API :
//   GET  /api/rev    -> { rev }
//   GET  /api/state  -> { rev, state }           (state = { format, patterns, layout } | null)
//   PUT  /api/state  -> { baseRev?, state } -> { ok, rev } (format slime-patterns@1
//        requis ; baseRev fourni != rev courante -> 409, rien n'est écrit)
//
// Le pool partagé vit dans data/pool.json (écriture atomique tmp+rename).
// Les scores de l'atelier vivent dans data/scores.json (même pattern) ; tout le
// classement est calculé par le module `Scores` ci-dessous, PUR (aucune I/O).

import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.SLIME_DATA_DIR
  ? path.resolve(process.env.SLIME_DATA_DIR)
  : path.join(ROOT, 'data')
const POOL_FILE = path.join(DATA_DIR, 'pool.json')
const SCORES_FILE = path.join(DATA_DIR, 'scores.json')
const FORMAT = 'slime-patterns@1'

let argPort = 8471
const ai = process.argv.indexOf('--port')
if (ai > 0 && process.argv[ai + 1]) argPort = parseInt(process.argv[ai + 1], 10) || argPort
const PORT = process.env.PORT ? (parseInt(process.env.PORT, 10) || argPort) : argPort
// Cle d'ecriture du pool (mot de passe de l'editeur). SLIME_KEY pour changer.
const WRITE_KEY = process.env.SLIME_KEY || 'slime'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.py': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
}

// ---------------------------------------------------------------------------
// L'Atelier des bocaux — cœur de classement (module PUR, aucune I/O).
//
// Le serveur est autoritaire : le palier d'une entrée est recalculé depuis son
// score et la config des paliers, jamais pris au mot du client.
//
// Modèle d'ouverture (dérivé, jamais stocké — recalculé à chaque opération) :
//   - `entry.approved` (pilier) n'est posé QUE par l'admin (approve) ; l'ingest
//     d'un palier déjà ouvert donne un statut `ok` SANS pilier.
//   - maxOpen = palier max des piliers (-1 si aucun) → paliers 0..maxOpen ouverts.
//   - « a atteint le palier T » = tier(entrée) >= T ; une entrée est visible
//     (= statut `ok`) ssi elle est pilier ou son palier <= maxOpen.
//   - `entry.status` n'est qu'un reflet rapproché à chaque mutation (pratique
//     pour l'admin/le JSON) : les décisions redérivent toujours, jamais lues.
// ---------------------------------------------------------------------------

export const RATE_MAX = 45      // pts/s plausibles (score <= playtime * RATE_MAX + RATE_MARGE)
export const RATE_MARGE = 60    // marge de départ (billes dorées, résiduel de caméra)
export const MAX_SCORE = 100000 // borne absolue du score
export const PAGE = 10          // joueurs par page du livre / par liste top
export const JAR = 8            // slots de slime par bocal (le client dérive « +N »)

function newStore() {
  return { seq: 0, entries: [] }
}

// Normalisation VALIDATION du pseudo : trim + NFC + espaces réduits, 1-12
// caractères, charset lettres (accents compris) / chiffres / espaces / -_. '
// — casse PRÉSERVÉE (c'est le nom affiché) ; '' si invalide.
function normalizeName(raw) {
  if (typeof raw !== 'string') return ''
  const s = raw.normalize('NFC').trim().replace(/\s+/g, ' ')
  if (s.length < 1 || s.length > 12) return ''
  return /^[\p{L}\p{N} _.'-]+$/u.test(s) ? s : ''
}

// Clé de dédoublonnage meilleur-par-nom : le normalizeName résultat mis en
// minuscules — 'Émile', 'émile' et 'ÉMILE' désignent le même joueur.
function nameKey(name) {
  return normalizeName(name).toLowerCase()
}

// times = [[tierIdx, sec], ...] : paires exactes, tierIdx entiers >= 0 strictement
// croissants, sec entiers >= 0 croissants (deux paliers peuvent tomber dans la
// même seconde après arrondi client) et chacun <= playtime.
function validTimes(times, playtime) {
  if (!Array.isArray(times)) return false
  let prevTier = -1
  let prevSec = -1
  for (const pair of times) {
    if (!Array.isArray(pair) || pair.length !== 2) return false
    const t = pair[0], s = pair[1]
    if (!Number.isInteger(t) || t <= prevTier) return false
    if (!Number.isInteger(s) || s < 0 || s < prevSec || s > playtime) return false
    prevTier = t
    prevSec = s
  }
  return true
}

// Garde-fous d'une soumission. `now` est réservé (contrôles temporels futurs).
function validateSubmission(body, now) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'corps invalide' }
  const name = normalizeName(body.name)
  if (!name) return { ok: false, error: 'nom invalide' }
  if (!Number.isInteger(body.score) || body.score < 0 || body.score > MAX_SCORE) return { ok: false, error: 'score invalide' }
  if (!Number.isInteger(body.playtime) || body.playtime < 1) return { ok: false, error: 'playtime invalide' }
  if (body.score > body.playtime * RATE_MAX + RATE_MARGE) return { ok: false, error: 'score implausible' }
  if (!validTimes(body.times, body.playtime)) return { ok: false, error: 'times invalides' }
  return {
    ok: true,
    sub: { name, score: body.score, playtime: body.playtime, times: body.times.map(p => [p[0], p[1]]) }
  }
}

// Mêmes sémantiques que SlimeColors.tierIndex : plus haut palier dont le seuil
// est atteint (score >= tiers[i].min), 0 par défaut.
function tierIndex(tiers, score) {
  let idx = 0
  for (let i = 0; i < tiers.length; i++) if (score >= tiers[i].min) idx = i
  return idx
}

// Palier d'une entrée pour la config courante (recalculé ; champ stocké en
// secours seulement si le score manquait — fichier corrompu).
function tierOf(entry, tiers) {
  return Number.isFinite(entry.score) ? tierIndex(tiers, entry.score) : (entry.tier | 0)
}

// Plus haut palier couvert par un pilier approuvé (-1 si aucun) : les paliers
// 0..maxOpen sont ouverts. C'est la SEULE source de vérité de l'ouverture.
function maxOpenTier(store, tiers) {
  let m = -1
  for (const e of store.entries) if (e.approved && tierOf(e, tiers) > m) m = tierOf(e, tiers)
  return m
}

// Statut dérivé : pilier approuvé, ou palier déjà ouvert à l'instant de l'appel.
function statusOf(entry, tiers, maxOpen) {
  return entry.approved || tierOf(entry, tiers) <= maxOpen ? 'ok' : 'pending'
}

// Rapproche les champs stockés (tier, status) de la vérité dérivée, après
// chaque mutation : un pilier remplacé/supprimé referme des paliers et fait
// retomber les validés dérivés en pending.
function reconcile(store, tiers) {
  const m = maxOpenTier(store, tiers)
  for (const e of store.entries) {
    e.tier = tierOf(e, tiers)
    e.status = statusOf(e, tiers, m)
  }
  return m
}

// Ingestion d'une soumission validée : palier recalculé serveur, meilleur-par-nom
// (clé nameKey insensible à la casse) — la nouvelle entrée remplace l'ancienne
// seulement si son score est STRICTEMENT supérieur, sinon la soumission est
// ignorée. Le nom stocké est celui du normalizeName (casse préservée).
function ingest(store, sub, code, tiers, now) {
  if (!sub || typeof sub !== 'object') return { accepted: false, replaced: false, entry: null }
  const name = normalizeName(sub.name)
  const key = nameKey(name)
  if (!key || !Number.isInteger(sub.score)) return { accepted: false, replaced: false, entry: null }
  const prev = store.entries.find(e => nameKey(e.name) === key)
  if (prev && !(sub.score > prev.score)) return { accepted: false, replaced: false, entry: prev }
  if (prev) store.entries.splice(store.entries.indexOf(prev), 1)
  const entry = {
    id: ++store.seq,
    name,
    score: sub.score,
    tier: tierIndex(tiers, sub.score),
    times: (Array.isArray(sub.times) ? sub.times : []).map(p => [p[0], p[1]]),
    code: typeof code === 'string' ? code : '',
    approved: false,
    status: 'pending',
    createdAt: Number.isFinite(+now) ? +now : 0
  }
  store.entries.push(entry)
  reconcile(store, tiers) // le pilier remplacé peut refermer des paliers
  return { accepted: true, replaced: !!prev, entry }
}

// Validation admin : pose le pilier ; tous les pendings dont le palier devient
// couvert par le nouveau palier ouvert passent `ok` (via reconcile).
function approve(store, id, tiers) {
  const e = store.entries.find(x => x.id === id)
  if (!e) return false
  e.approved = true
  reconcile(store, tiers)
  return true
}

// Suppression admin : si c'était le dernier pilier de son palier, il se
// referme et les validés dérivés retombent `pending` (via reconcile).
function remove(store, id, tiers) {
  const i = store.entries.findIndex(x => x.id === id)
  if (i < 0) return false
  store.entries.splice(i, 1)
  reconcile(store, tiers)
  return true
}

// Temps d'obtention du palier tierIdx pour une entrée (null si son times ne
// le contient pas — cas remplacement/changement de config).
function timeAt(entry, tierIdx) {
  const pair = (entry.times || []).find(p => p[0] === tierIdx)
  return pair ? pair[1] : null
}

// Vue publique : noms + temps, JAMAIS de score. Un objet par palier de la
// config, même fermé. top = 10 par temps du palier croissant (égalité ->
// createdAt croissant) ; total = entrées visibles ayant ATTEINT le palier
// (tier >= palier), même sans temps enregistré pour lui.
function publicView(store, tiers) {
  const m = maxOpenTier(store, tiers)
  const vis = store.entries.filter(e => e.approved || tierOf(e, tiers) <= m)
  const golden = vis
    .slice()
    .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt || a.id - b.id)
    .slice(0, PAGE)
    .map(e => ({ id: e.id, name: e.name, tier: tierOf(e, tiers) }))
  const list = tiers.map((cfg, i) => {
    if (i > m) return { index: i, open: false, total: 0, top: [] }
    const reached = vis.filter(e => tierOf(e, tiers) >= i)
    const top = reached
      .map(e => ({ e, time: timeAt(e, i) }))
      .filter(x => x.time !== null)
      .sort((a, b) => a.time - b.time || a.e.createdAt - b.e.createdAt || a.e.id - b.e.id)
      .slice(0, PAGE)
      .map(x => ({ id: x.e.id, name: x.e.name, time: x.time }))
    return { index: i, open: true, total: reached.length, top }
  })
  return { golden, tiers: list }
}

export const Scores = {
  RATE_MAX, RATE_MARGE, MAX_SCORE, PAGE, JAR,
  newStore, normalizeName, nameKey, validateSubmission, tierIndex,
  ingest, approve, remove, publicView
}


// Handler HTTP exportable : toute la logique (API + statique) passe par là.
// pool / loadPool / savePool sont des closures — chaque createHandler a son
// propre pool dans son dataDir, sans état partagé au niveau du module.
// Résout le pool avant de renvoyer le handler ; ne démarre aucune écoute.
export async function createHandler({ dataDir, writeKey }) {
  dataDir = path.resolve(dataDir)
  const poolFile = path.join(dataDir, 'pool.json')
  const scoresFile = path.join(dataDir, 'scores.json')
  let pool = null // { rev, state }
  let scores = null // { seq, entries } — store du module Scores (atelier)

  async function loadPool() {
    try {
      pool = JSON.parse(await fs.readFile(poolFile, 'utf8'))
      if (!pool || typeof pool.rev !== 'number') throw new Error('format')
    } catch (e) {
      pool = { rev: 1, state: null }
      await savePool()
    }
  }

  // Écriture atomique : un crash ne laisse jamais un pool.json à moitié écrit.
  async function savePool() {
    await fs.mkdir(dataDir, { recursive: true })
    const tmp = poolFile + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(pool))
    await fs.rename(tmp, poolFile)
  }

  // Scores de l'atelier : chargés au démarrage, fichier absent/corrompu ->
  // store vierge. Les mutations (routes de l'atelier) appellent Scores.* puis
  // saveScores() — le module pur ne fait aucune I/O, le handler décide.
  async function loadScores() {
    try {
      const raw = JSON.parse(await fs.readFile(scoresFile, 'utf8'))
      if (!raw || typeof raw.seq !== 'number' || !Array.isArray(raw.entries)) throw new Error('format')
      raw.entries = raw.entries.filter(e => e && typeof e === 'object' && Number.isInteger(e.id) && Number.isInteger(e.score))
      scores = raw
    } catch (e) {
      scores = Scores.newStore()
      await saveScores()
    }
  }

  // Écriture atomique, même pattern que savePool.
  async function saveScores() {
    await fs.mkdir(dataDir, { recursive: true })
    const tmp = scoresFile + '.tmp'
    await fs.writeFile(tmp, JSON.stringify(scores))
    await fs.rename(tmp, scoresFile)
  }

  await loadPool()
  await loadScores()

  const handler = async (req, res) => {
    let u
    try { u = new URL(req.url, 'http://localhost') } catch (e) { return send(res, 400, { error: 'URL invalide' }) }
    try {
      if (u.pathname === '/api/rev' && req.method === 'GET') return send(res, 200, { rev: pool.rev })
      if (u.pathname === '/api/state' && req.method === 'GET') return send(res, 200, { rev: pool.rev, state: pool.state })
      if (u.pathname === '/api/state' && req.method === 'PUT') {
        // Écriture réservée aux éditeurs déverrouillés (en-tête X-Slime-Key).
        if ((req.headers['x-slime-key'] || '') !== writeKey) {
          return send(res, 401, { error: 'cle requise' })
        }
        let body
        try { body = JSON.parse(await readBody(req)) } catch (e) { return send(res, 400, { error: 'JSON invalide' }) }
        const state = body && typeof body === 'object' && body.state ? body.state : body
        if (!state || state.format !== FORMAT || !Array.isArray(state.patterns)) {
          return send(res, 400, { error: 'format attendu : ' + FORMAT })
        }
        // Concurrence optimiste : une poussée basée sur une révision périmée est
        // refusée sans rien écrire — le client recharge l'état et fusionne.
        // baseRev absent : dernier écrit gagne (compat anciens clients/outils).
        const baseRev = body && typeof body === 'object' && Number.isFinite(body.baseRev) ? body.baseRev : null
        if (baseRev !== null && baseRev !== pool.rev) {
          return send(res, 409, { error: 'revision perimee', rev: pool.rev })
        }
        pool.rev++
        pool.state = { format: state.format, patterns: state.patterns, layout: state.layout || null }
        await savePool()
        console.log('[pool] rev ' + pool.rev + ' — ' + state.patterns.length + ' patterns (' + req.socket.remoteAddress + ')')
        return send(res, 200, { ok: true, rev: pool.rev })
      }
      if (u.pathname.startsWith('/api/')) return send(res, 404, { error: 'endpoint inconnu' })
      serveStatic(req, res, u.pathname)
    } catch (e) {
      send(res, 500, { error: String((e && e.message) || e) })
    }
  }
  // Introspection : le CLI affiche la rev chargée au démarrage.
  handler.pool = pool
  handler.scores = scores
  return handler
}

function send(res, code, body, type) {
  const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  res.writeHead(code, {
    'Content-Type': type || 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(buf)
  })
  res.end(buf)
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let n = 0
    const chunks = []
    req.on('data', c => {
      n += c.length
      if (n > limit) { reject(new Error('corps trop volumineux')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function serveStatic(req, res, pathname) {
  let p
  try { p = decodeURIComponent(pathname) } catch (e) { return send(res, 400, 'URL invalide', 'text/plain; charset=utf-8') }
  if (p.endsWith('/')) p += 'index.html'
  const file = path.normalize(path.join(ROOT, p))
  if (!file.startsWith(ROOT)) return send(res, 403, 'interdit', 'text/plain; charset=utf-8')
  fs.readFile(file)
    .then(buf => {
      const ext = path.extname(file).toLowerCase()
      send(res, 200, buf, MIME[ext] || 'application/octet-stream')
    })
    .catch(() => send(res, 404, 'introuvable', 'text/plain; charset=utf-8'))
}

// Lancé directement (node server.mjs) : charge le pool puis écoute.
// Importé par un test : aucun effet de bord (pas d'écoute, pas d'écriture).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  createHandler({ dataDir: DATA_DIR, writeKey: WRITE_KEY }).then(handler => {
    const server = http.createServer(handler)
    server.listen(PORT, '0.0.0.0', () => {
      console.log('SLIME — http://0.0.0.0:' + PORT + '/  (jeu) et /editor.html (éditeur)')
      console.log('Pool partagé : ' + POOL_FILE + ' (rev ' + handler.pool.rev + ')')
      console.log('Atelier des bocaux : ' + SCORES_FILE + ' (' + handler.scores.entries.length + ' entrées)')
    })
  })
}
