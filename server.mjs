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

import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.SLIME_DATA_DIR
  ? path.resolve(process.env.SLIME_DATA_DIR)
  : path.join(ROOT, 'data')
const POOL_FILE = path.join(DATA_DIR, 'pool.json')
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

// Handler HTTP exportable : toute la logique (API + statique) passe par là.
// pool / loadPool / savePool sont des closures — chaque createHandler a son
// propre pool dans son dataDir, sans état partagé au niveau du module.
// Résout le pool avant de renvoyer le handler ; ne démarre aucune écoute.
export async function createHandler({ dataDir, writeKey }) {
  dataDir = path.resolve(dataDir)
  const poolFile = path.join(dataDir, 'pool.json')
  let pool = null // { rev, state }

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

  await loadPool()

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
    })
  })
}
