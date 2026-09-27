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
//        requis ; baseRev fourni != rev courante -> 409, rien n'est écrit ;
//        state.layout.tiers optionnel, stocké/retourné tel quel — c'est la
//        config des paliers de l'atelier poussée par l'onglet COULEURS)
//   GET  /api/scores -> classement public de l'atelier (noms/temps, AUCUN score)
//   POST /api/scores {v:1,name,score,playtime,times,code} -> 200 {ok,accepted}
//        | 400 {error} (payload ou code signé invalide/incohérent)
//        | 429 {error} (1 soumission valide par IP par fenêtre de 30 s)
//   GET  /api/admin/pending  (X-Slime-Key) -> {pending:[{id,name,score,tier,times,createdAt}]}
//   POST /api/admin/validate {id} (X-Slime-Key) -> {ok:true} | 404
//   POST /api/admin/delete   {id} (X-Slime-Key) -> {ok:true} | 404
//
// Le pool partagé vit dans data/pool.json (écriture atomique tmp+rename).
// Les scores de l'atelier vivent dans data/scores.json (même pattern) ; tout le
// classement est calculé par le module `Scores` ci-dessous, PUR (aucune I/O).

import http from 'node:http'
import { createHmac } from 'node:crypto'
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

// Secret des codes de score : copie LITTÉRALE du SECRET de js/crypto.js — le
// client signe ses codes avec, le serveur vérifie (jamais transmis sur le fil).
const SCORE_SECRET = 'S1!m3~Vault#K7-2026'
// Anti-spam des soumissions : 1 POST valide par IP par fenêtre glissante de
// 30 s. Les 400 (payload invalide) et les 429 (refus) ne consomment JAMAIS le
// quota — un refus ne décale pas non plus la fenêtre.
const RATE_WINDOW = 30000

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

// Paliers par défaut : copie de SlimeColors.DEFAULTS (js/slime-colors.js).
// Utilisés tant qu'aucun layout.tiers exploitable n'a été poussé via
// PUT /api/state — seuls les champs `min` servent au classement serveur.
const DEFAULT_TIERS = [
  { min: 0, type: 'flat', hex: '#3ecb3e' },
  { min: 100, type: 'flat', hex: '#35d0c5' },
  { min: 200, type: 'flat', hex: '#4a5ed7' },
  { min: 350, type: 'flat', hex: '#a04fd8' },
  { min: 500, type: 'flat', hex: '#ef5fa7' },
  { min: 750, type: 'flat', hex: '#ffd23f' }
]

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

// Vérifie un code de score (format js/crypto.js) contre la soumission POSTée :
// HMAC du body, puis re-décodage b64url -> payload "score.elapsed.date". Le
// score décodé doit être IDENTIQUE au score annoncé, et l'elapsed cohérent avec
// le playtime déclaré (tolérance ±2 s — horloge du client seule source pour
// les deux, mais un code rejoué d'une autre partie ne doit pas passer).
// Renvoie null si tout concorde, sinon le message d'erreur (-> 400).
function verifyScoreCode(code, score, playtime) {
  if (typeof code !== 'string') return 'code invalide'
  const idx = code.lastIndexOf('.')
  if (idx < 1) return 'code invalide'
  const body = code.slice(0, idx)
  const sig = code.slice(idx + 1).trim()
  const want = createHmac('sha256', SCORE_SECRET).update(body).digest('hex').slice(0, 32)
  if (sig !== want) return 'code invalide'
  let payload = ''
  try {
    payload = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch (e) { return 'code invalide' }
  const m = payload.match(/^(\d+)\.(\d+)\.\d+$/) // score.elapsed.date, tous entiers
  if (!m) return 'code invalide'
  if (parseInt(m[1], 10) !== score) return 'code incoherent'
  if (Math.abs(parseInt(m[2], 10) - playtime) > 2) return 'code incoherent'
  return null
}


// Handler HTTP exportable : toute la logique (API + statique) passe par là.
// pool / loadPool / savePool sont des closures — chaque createHandler a son
// propre pool dans son dataDir, sans état partagé au niveau du module.
// `now` (optionnel, tests uniquement) : horloge injectée — rate-limit et
// createdAt suivent cette horloge au lieu de Date.now.
// Résout le pool avant de renvoyer le handler ; ne démarre aucune écoute.
export async function createHandler({ dataDir, writeKey, now }) {
  dataDir = path.resolve(dataDir)
  const poolFile = path.join(dataDir, 'pool.json')
  const scoresFile = path.join(dataDir, 'scores.json')
  const nowMs = typeof now === 'function' ? now : Date.now
  let pool = null // { rev, state }
  let scores = null // { seq, entries } — store du module Scores (atelier)
  // Rate-limit des soumissions : IP -> timestamps des POST VALIDES uniquement.
  const rateHits = new Map()

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

  // Config des paliers courante : layout.tiers poussé par l'éditeur (PUT
  // /api/state) s'il est exploitable, sinon les paliers par défaut du jeu.
  // Assainie + triée par min croissant (mêmes sémantiques que le client).
  function currentTiers() {
    const raw = pool && pool.state && pool.state.layout && pool.state.layout.tiers
    if (Array.isArray(raw) && raw.length) {
      const clean = raw
        .filter(t => t && typeof t === 'object' && Number.isFinite(+t.min))
        .map(t => ({ min: Math.max(0, Math.floor(+t.min)) }))
        .sort((a, b) => a.min - b.min)
      if (clean.length) return clean
    }
    return DEFAULT_TIERS
  }

  // File de modération : entrées non-effectivement-visibles (pas pilier ET
  // palier > maxOpen), TOUJOURS redérivées de la config courante — jamais lues
  // depuis le statut stocké, qui ignore un changement de layout.tiers.
  // Liste plate triée palier croissant puis score décroissant.
  function pendingList() {
    const tiers = currentTiers()
    const t = e => (Number.isFinite(e.score) ? Scores.tierIndex(tiers, e.score) : (e.tier | 0))
    let maxOpen = -1
    for (const e of scores.entries) if (e.approved && t(e) > maxOpen) maxOpen = t(e)
    return scores.entries
      .filter(e => !e.approved && t(e) > maxOpen)
      .map(e => ({ e, tier: t(e) }))
      .sort((a, b) => a.tier - b.tier || b.e.score - a.e.score || a.e.id - b.e.id)
      .map(x => ({ id: x.e.id, name: x.e.name, score: x.e.score, tier: x.tier, times: x.e.times, createdAt: x.e.createdAt }))
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
      // ---- L'Atelier des bocaux : classement public + modération ----
      if (u.pathname === '/api/scores') {
        if (req.method === 'GET') return send(res, 200, Scores.publicView(scores, currentTiers()))
        if (req.method === 'POST') {
          // Rate-limit AVANT tout parse/validation : une IP qui vient de
          // soumettre est refusée d'office. Seul un POST valide consomme le
          // quota (plus bas) — un 400 n'écrit pas de timestamp, un 429 non
          // plus : la fenêtre reste ancrée sur la dernière soumission valide.
          const ip = req.socket.remoteAddress || '?'
          const t = nowMs()
          const hits = (rateHits.get(ip) || []).filter(x => t - x < RATE_WINDOW)
          if (hits.length >= 1) return send(res, 429, { error: 'trop de soumissions, reessaie dans un instant' })
          let body
          try { body = JSON.parse(await readBody(req)) } catch (e) { return send(res, 400, { error: 'JSON invalide' }) }
          const v = Scores.validateSubmission(body, t)
          if (!v.ok) return send(res, 400, { error: v.error })
          const err = verifyScoreCode(body && body.code, v.sub.score, v.sub.playtime)
          if (err) return send(res, 400, { error: err })
          const r = Scores.ingest(scores, v.sub, typeof body.code === 'string' ? body.code : '', currentTiers(), t)
          rateHits.set(ip, hits.concat(t)) // soumission valide : consomme le quota
          if (r.accepted) await saveScores() // mutation réussie -> persistance
          return send(res, 200, { ok: true, accepted: r.accepted })
        }
      }
      if (u.pathname.startsWith('/api/admin/')) {
        // Modération réservée à la même clé que l'éditeur (X-Slime-Key).
        if ((req.headers['x-slime-key'] || '') !== writeKey) {
          return send(res, 401, { error: 'cle requise' })
        }
        if (u.pathname === '/api/admin/pending' && req.method === 'GET') {
          return send(res, 200, { pending: pendingList() })
        }
        if ((u.pathname === '/api/admin/validate' || u.pathname === '/api/admin/delete') && req.method === 'POST') {
          let body
          try { body = JSON.parse(await readBody(req)) } catch (e) { return send(res, 400, { error: 'JSON invalide' }) }
          if (!body || !Number.isInteger(body.id)) return send(res, 400, { error: 'id invalide' })
          const done = u.pathname === '/api/admin/validate'
            ? Scores.approve(scores, body.id, currentTiers())
            : Scores.remove(scores, body.id, currentTiers())
          if (!done) return send(res, 404, { error: 'entree inconnue' })
          await saveScores() // mutation réussie -> persistance
          return send(res, 200, { ok: true })
        }
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
