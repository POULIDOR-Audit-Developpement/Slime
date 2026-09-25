// SLIME — catalogue de patterns, pool pondéré par difficulté, layout de vue,
// stockage local et portabilité (export/import fichier + code).
// Dépend de js/physics.js. Chargé par le jeu, l'éditeur et les outils.

const Patterns = (() => {
  const FORMAT = 'slime-patterns@1'
  const STORE_KEY = 'slime_patterns_v1'
  const BAK_KEY = 'slime_patterns_v1_bak'
  const TYPES = ['basic', 'sticky', 'dynamic', 'crumble', 'ghost', 'bouncy']

  // Pool embarqué par défaut (généré + validé par tools/gen_defaults.mjs).
  const DEFAULT_POOL_JSON = (typeof SLIME_DEFAULT_POOL === 'string' && SLIME_DEFAULT_POOL) || '[]'
  const DEFAULT_PLAT = { crumbleT: CRUMBLE_T, dynLife: 4, spdMul: 1 }
  // Pouvoirs (onglet POWER) et vue du jeu (onglet VUE) : valeurs par défaut.
  const POWERS_DEF = {
    doubleJump: { enabled: true, cooldown: 4, charges: 1, powerMul: 1 },
    slowmo: { enabled: true, scale: 0.35, duration: 0.6 },
    ledge: { enabled: true, hangT: 1, window: 8 }
  }
  const VIEW_DEF = { zoom: 1, showTrajectory: true, shake: true }

  // Nombre borné : non numérique -> défaut ; 0 est une valeur valide
  // (contrairement à un `|| def` qui écraserait un 0 légitime).
  const numBound = (v, def, lo, hi) => {
    v = +v
    if (!isFinite(v)) v = def
    return clampN(v, lo, hi)
  }

  // Complète et borne un layout en place (compat anciens saves/exports sans
  // `plat`, `phys`, `powers` ni `view`). Conserve l'identité des objets
  // walls/plat/phys/powers/view : l'éditeur mute ces références à travers
  // ses sliders. Le plafond (murs de damage du haut) n'existe plus : toute
  // valeur `ceil` présente dans d'anciens saves est ignorée/supprimée.
  function normalizeLayout(l) {
    const out = l && typeof l === 'object' ? l : {}
    const w = out.walls && typeof out.walls === 'object' ? out.walls : {}
    const p = out.plat && typeof out.plat === 'object' ? out.plat : {}
    delete w.ceil
    w.left = clampN(+w.left || TIP_L, 4, 60)
    w.right = clampN(+w.right || SPIKE_W, 4, 60)
    out.walls = w
    p.crumbleT = clampN(+p.crumbleT || DEFAULT_PLAT.crumbleT, 0.2, 2)
    p.dynLife = clampN(+p.dynLife || DEFAULT_PLAT.dynLife, 1, 10)
    p.spdMul = clampN(+p.spdMul || DEFAULT_PLAT.spdMul, 0.5, 2)
    out.plat = p
    out.phys = Phys.normalize(out.phys)
    // Pouvoirs : double saut + slow-mo + ledge catch (bornés, identité conservée).
    const pw = out.powers && typeof out.powers === 'object' ? out.powers : {}
    const dj = pw.doubleJump && typeof pw.doubleJump === 'object' ? pw.doubleJump : {}
    const sm = pw.slowmo && typeof pw.slowmo === 'object' ? pw.slowmo : {}
    const lg = pw.ledge && typeof pw.ledge === 'object' ? pw.ledge : {}
    const djd = POWERS_DEF.doubleJump, smd = POWERS_DEF.slowmo, lgd = POWERS_DEF.ledge
    dj.enabled = dj.enabled !== false
    dj.cooldown = numBound(dj.cooldown, djd.cooldown, 0, 15)
    dj.charges = Math.round(numBound(dj.charges, djd.charges, 1, 3))
    dj.powerMul = numBound(dj.powerMul, djd.powerMul, 0.5, 1.5)
    sm.enabled = sm.enabled !== false
    sm.scale = numBound(sm.scale, smd.scale, 0.15, 0.8)
    sm.duration = numBound(sm.duration, smd.duration, 0.2, 2)
    lg.enabled = lg.enabled !== false
    lg.hangT = numBound(lg.hangT, lgd.hangT, 0.3, 3)
    lg.window = Math.round(numBound(lg.window, lgd.window, 4, 16))
    out.powers = { doubleJump: dj, slowmo: sm, ledge: lg }
    // Vue : zoom global du jeu (1 = cadrage 480x270), options d'affichage.
    const v = out.view && typeof out.view === 'object' ? out.view : {}
    v.zoom = numBound(v.zoom, VIEW_DEF.zoom, 1, 4)
    v.showTrajectory = v.showTrajectory !== false
    v.shake = v.shake !== false
    out.view = v
    if (!Array.isArray(out.decor)) out.decor = []
    return out
  }

  let store = null      // ce que l'utilisateur édite : { patterns: [...], layout }
  let layout = null
  let lastId = null     // anti-répétition immédiate
  let pinned = null     // pattern épinglé (mode test ?pattern=)

  const clampN = (v, a, b) => Math.max(a, Math.min(b, v))

  function uid() {
    return 'p' + Date.now().toString(36) + ((Math.random() * 46656) | 0).toString(36)
  }

  function emptyPattern(name) {
    return {
      id: uid(), name: name || 'Nouveau pattern', difficulty: 1, entry: { row: 2 },
      platforms: [{ x: 3 * CELL, row: 2, cells: 3, type: 'basic', yOff: 0, amp: 0, spd: 0, spike: null }],
      balls: [], decor: []
    }
  }

  // ---------- validation schéma ----------
  function validatePattern(p) {
    const errs = []
    if (!p || typeof p !== 'object') return ['objet invalide']
    if (!Array.isArray(p.platforms) || p.platforms.length === 0) errs.push('aucune plateforme')
    else if (p.platforms.length > 40) errs.push('trop de plateformes (40 max)')
    for (let i = 0; i < (p.platforms || []).length; i++) {
      const q = p.platforms[i]
      const tag = 'plat' + (i + 1)
      if (typeof q.x !== 'number' || q.x < 0) errs.push(tag + ':x')
      if (!Number.isInteger(q.row) || q.row < 0 || q.row > 4) errs.push(tag + ':ligne')
      if (!Number.isInteger(q.cells) || q.cells < 1 || q.cells > 12) errs.push(tag + ':largeur')
      if (TYPES.indexOf(q.type) < 0) errs.push(tag + ':type')
      if (q.spike && !(typeof q.spike.a === 'number' && typeof q.spike.b === 'number' && q.spike.a >= 0 && q.spike.a < q.spike.b && q.spike.b <= 1)) errs.push(tag + ':pics')
      if (q.type === 'dynamic' && (!(q.amp >= 0) || !(q.spd >= 0))) errs.push(tag + ':oscillation')
      // Overrides optionnels par plateforme (sinon réglage global du layout)
      if (q.crumbleT != null && !(+q.crumbleT > 0)) errs.push(tag + ':casse')
      if (q.dynLife != null && !(+q.dynLife > 0)) errs.push(tag + ':vie')
    }
    for (let i = 0; i < (p.balls || []).length; i++) {
      if (typeof p.balls[i].x !== 'number') errs.push('bille' + (i + 1) + ':x')
    }
    for (let i = 0; i < (p.walls || []).length; i++) {
      const wl = p.walls[i]
      const tag = 'mur' + (i + 1)
      if (typeof wl.x !== 'number' || wl.x < 0) errs.push(tag + ':x')
      if (!Number.isInteger(wl.cells) || wl.cells < 1 || wl.cells > 3) errs.push(tag + ':largeur')
      if (!Number.isInteger(wl.row) || wl.row < 0 || wl.row > 4) errs.push(tag + ':ligne')
      if (wl.kind !== 'ground' && wl.kind !== 'ceil') errs.push(tag + ':type')
    }
    const d = p.difficulty | 0
    if (d < 1 || d > 5) errs.push('difficulté 1-5')
    return errs
  }

  function patternWidth(p) {
    let w = CELL
    for (const q of p.platforms || []) w = Math.max(w, (q.x || 0) + (q.cells || 1) * CELL)
    for (const wl of p.walls || []) w = Math.max(w, (wl.x || 0) + (wl.cells || 1) * CELL)
    return w + CELL
  }

  function entryRow(p) {
    const r = p.entry && p.entry.row != null ? p.entry.row : (p.platforms[0] ? p.platforms[0].row : 2)
    return clampN(r | 0, 0, 4)
  }

  // ---------- instanciation (coords relatives -> monde) ----------
  // Origine d'un pattern : bord droit de la plateforme d'ancrage (celle d'avant),
  // ligne d'entrée = entry.row. Le décalage vertical aligne l'entrée sur le monde.
  function instantiate(pat, last) {
    const delta = last.row - entryRow(pat)
    const dx = last.x + last.w
    const platforms = [], balls = [], decor = [], walls = []
    for (const q of pat.platforms) {
      const row = clampN((q.row | 0) + delta, 0, 4)
      const inst = {
        x: dx + q.x, row, y: rowY(row), baseY: rowY(row),
        w: q.cells * CELL, type: q.type,
        amp: q.amp || 0, spd: q.spd || 0, ph: Math.random() * Math.PI * 2, spike: null,
        crumbleT: q.crumbleT != null ? +q.crumbleT : undefined,
        dynLife: q.dynLife != null ? +q.dynLife : undefined
      }
      if (inst.type === 'dynamic') {
        inst.baseY = clampN(rowY(row) + (q.yOff || 0), CEIL + 24 + inst.amp, 246 - inst.amp)
        inst.y = inst.baseY
      }
      if (q.spike) inst.spike = { x1: inst.x + q.spike.a * inst.w, x2: inst.x + q.spike.b * inst.w }
      platforms.push(inst)
    }
    // Murs verticaux. Le sommet d'une colonne devient une vraie plateforme
    // (wallTop) injectée dans la chaîne triée par x : atterrissable en jeu,
    // validée comme un saut optionnel par validateInstance.
    for (const wl of pat.walls || []) {
      const row = clampN((wl.row | 0) + delta, 0, 4)
      const inst = {
        x: dx + wl.x, w: wl.cells * CELL, kind: wl.kind, spiked: !!wl.spiked, row,
        y1: wl.kind === 'ground' ? rowY(row) : 0,
        y2: wl.kind === 'ground' ? VH : rowY(row)
      }
      walls.push(inst)
      if (inst.kind === 'ground') {
        platforms.push({
          x: inst.x, row, y: rowY(row), baseY: rowY(row), w: inst.w,
          type: 'basic', amp: 0, spd: 0, ph: 0, spike: null, wallTop: true
        })
      }
    }
    platforms.sort((a, b) => a.x - b.x)
    for (const b of pat.balls || []) {
      const row = clampN((b.row | 0) + delta, 0, 4)
      balls.push({
        x: dx + b.x, y: clampN(rowY(row) + (b.yOff || 0), CEIL + 12, VH - 8),
        o: Math.random() < 0.3, taken: false, gold: !!b.gold, life: !!b.life
      })
    }
    for (const d of pat.decor || []) {
      decor.push({ sprite: d.sprite, x: dx + d.x, y: d.y, w: d.w || 60 })
    }
    return { platforms, balls, decor, walls }
  }

  function targetOf(p) {
    return { x: p.x, y: p.type === 'dynamic' ? p.baseY - p.amp * 0.7 : p.y, w: p.w }
  }

  function jumpOk(a, b, walls) {
    if (!a || !b) return false
    return a.type === 'bouncy'
      ? Phys.canReachBounce(a, targetOf(b), walls)
      : Phys.canReach(a, targetOf(b), a.type === 'sticky' ? Phys.phys().stickyMul : 1, 1, walls)
  }

  // Valide le chaînage ancrage -> 1re plateforme puis chaque paire consécutive.
  // Les sommets de colonnes (wallTop) sont des sauts OPTIONNELS : s'ils sont
  // atteignables ils deviennent le nouveau point de départ, sinon on tente le
  // saut direct par-dessus (le corps du mur bloque de toute façon la simu).
  function validateInstance(last, inst) {
    const walls = inst.walls || []
    let prev = last
    for (const p of inst.platforms) {
      const ok = jumpOk(prev, p, walls)
      if (!ok && p.wallTop) continue
      if (!ok) return false
      prev = p
    }
    return true
  }

  // Valide un pattern "sur papier" : chaque saut interne, depuis une ancre virtuelle.
  // Même sémantique que validateInstance (sommets de colonnes optionnels).
  function validatePatternJumps(p) {
    const anchorRow = entryRow(p)
    const anchor = { x: -4 * CELL, row: anchorRow, y: rowY(anchorRow), baseY: rowY(anchorRow), w: 4 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0 }
    const inst = instantiate(p, anchor)
    const walls = inst.walls || []
    let prev = anchor
    let allOk = true
    const results = []
    for (let i = 0; i < inst.platforms.length; i++) {
      const cur = inst.platforms[i]
      const ok = jumpOk(prev, cur, walls)
      const res = ok || !!cur.wallTop
      results.push(res)
      if (!res) allOk = false
      if (ok) prev = cur
    }
    return { ok: allOk, jumps: results, errors: allOk ? [] : validatePattern(p) }
  }

  // ---------- pool pondéré ----------
  // Poids par difficulté (1..5) : début de partie -> fin de partie (120 s).
  const W0 = [100, 26, 6, 0, 0]
  const W1 = [2, 12, 30, 55, 80]

  function currentPool() {
    if (pinned) return [pinned]
    const user = store && store.patterns
    return user && user.length ? user : defaults()
  }

  function weights(pool, elapsed) {
    const t = Math.min(elapsed / 120, 1)
    return pool.map(p => {
      const d = clampN((p.difficulty | 0) - 1, 0, 4)
      let w = W0[d] + (W1[d] - W0[d]) * t
      if (!pinned && p.id === lastId) w *= 0.12
      return Math.max(w, 0)
    })
  }

  function safety(last) {
    return {
      platforms: [{
        x: last.x + last.w + 2 * CELL, row: last.row, y: rowY(last.row), baseY: rowY(last.row),
        w: 3 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0, spike: null, safety: true
      }],
      balls: [], decor: []
    }
  }

  // Point d'entrée du jeu : renvoie { platforms, balls, decor } à ajouter.
  function spawnSection(last, elapsed) {
    const pool = currentPool()
    if (!pool.length) return safety(last)
    const ws = weights(pool, elapsed)
    const total = ws.reduce((a, b) => a + b, 0)
    if (total <= 0) return safety(last)
    for (let attempt = 0; attempt < 12; attempt++) {
      let r = Math.random() * total, pick = null
      for (let i = 0; i < pool.length; i++) {
        r -= ws[i]
        if (r <= 0) { pick = pool[i]; break }
      }
      if (!pick) pick = pool[pool.length - 1]
      const inst = instantiate(pick, last)
      if (validateInstance(last, inst)) {
        lastId = pick.id
        return inst
      }
    }
    return safety(last)
  }

  // ---------- stockage ----------
  function defaults() {
    try {
      const arr = JSON.parse(DEFAULT_POOL_JSON)
      return Array.isArray(arr) ? arr : []
    } catch (e) { return [] }
  }

  // Chargement du store. Si la clé principale est illisible (corruption,
  // écriture partielle…), on tente la sauvegarde de secours (`_bak`, une
  // version en arrière) avant de retomber sur les défauts. Le statut est
  // exposé via loadStatus() : 'vide' | 'ok' | 'recupere' | 'invalide' | 'corrompu'.
  let loadStatusVar = 'vide'
  function readStore(key) {
    // 'ok' : store chargé dans `store` ; sinon renvoie le diagnostic.
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return 'vide'
      const d = JSON.parse(raw)
      if (!d || d.format !== FORMAT || !Array.isArray(d.patterns)) return 'invalide'
      store = {
        format: FORMAT,
        patterns: d.patterns.filter(p => validatePattern(p).length === 0),
        layout: d.layout || null
      }
      return 'ok'
    } catch (e) { return 'corrompu' }
  }
  function load() {
    store = { patterns: [], layout: null }
    let st = readStore(STORE_KEY)
    if (st === 'corrompu' || st === 'invalide') {
      const st2 = readStore(BAK_KEY)
      if (st2 === 'ok') {
        st = 'recupere'
        writeMain() // auto-réparation de la clé principale (le backup reste intact)
      }
    }
    loadStatusVar = st
    layout = normalizeLayout(store.layout)
    return store
  }

  function writeMain() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ format: FORMAT, patterns: store.patterns, layout }))
    } catch (e) {}
  }
  function save() {
    // Conserve la version précédente comme secours avant d'écraser.
    try {
      const prev = localStorage.getItem(STORE_KEY)
      if (prev) localStorage.setItem(BAK_KEY, prev)
    } catch (e) {}
    writeMain()
    if (lan.on) lanPush() // partage au serveur LAN (fire & forget)
  }
  function loadStatus() { return loadStatusVar }

  // ---------- sync LAN (serveur optionnel server.mjs) ----------
  // Même origine http(s) + server.mjs lancé : le pool est partagé entre tous
  // les appareils du LAN. Adoption de l'état distant au démarrage (ou poussée
  // du pool local si le serveur est vide), poussée à chaque save(), polling
  // léger de /api/rev pour les changements venus d'ailleurs. Sans serveur :
  // localStorage seul, exactement comme avant.
  const LAN_POLL_MS = 2000
  const lan = { on: false, rev: 0, lastPushed: 0, err: null, timer: null }
  const lanListeners = []

  function lanLocation() {
    try {
      const loc = (typeof window !== 'undefined' && window.location) ||
        (typeof location !== 'undefined' ? location : null)
      return loc && (loc.protocol === 'http:' || loc.protocol === 'https:') ? loc : null
    } catch (e) { return null }
  }
  function lanUsable() {
    return typeof fetch === 'function' && !!lanLocation()
  }
  function lanOnChange(cb) { if (typeof cb === 'function') lanListeners.push(cb) }
  function lanNotify(reason) { for (const cb of lanListeners) { try { cb(reason || 'remote') } catch (e) {} } }
  function lanStatus() { return { on: lan.on, rev: lan.rev, err: lan.err } }

  function validRemoteState(s) {
    return !!(s && s.format === FORMAT && Array.isArray(s.patterns))
  }

  // Remplace le store local par l'état partagé (miroir localStorage conservé
  // pour continuer à fonctionner si le serveur disparaît). Un pattern en
  // cours d'édition n'est jamais filtré : aucune perte possible en sync.
  function adoptRemote(state) {
    store = { format: FORMAT, patterns: state.patterns, layout: state.layout || null }
    layout = normalizeLayout(store.layout)
    loadStatusVar = 'lan'
    writeMain()
  }

  async function lanApi(pathname, opts) {
    const res = await fetch(pathname, opts)
    if (!res.ok) throw new Error('HTTP ' + res.status)
    return res.json()
  }

  // Récupère l'état complet ; true si un état valide a été adopté.
  async function lanPull() {
    const d = await lanApi('/api/state')
    lan.rev = d.rev
    if (validRemoteState(d.state)) { adoptRemote(d.state); return true }
    return false
  }

  async function lanPush() {
    try {
      const d = await lanApi('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: { format: FORMAT, patterns: store.patterns, layout } })
      })
      lan.rev = d.rev
      lan.lastPushed = d.rev
      lan.err = null
    } catch (e) { lan.err = String((e && e.message) || e) }
  }

  async function lanPollTick() {
    if (!lan.on) return
    try {
      const d = await lanApi('/api/rev')
      lan.err = null
      if (d.rev !== lan.rev && d.rev !== lan.lastPushed) {
        await lanPull()
        lanNotify()
      } else {
        lan.rev = d.rev // notre propre poussée : simple rattrapage du compteur
      }
    } catch (e) { lan.err = String((e && e.message) || e) }
  }

  async function lanStart() {
    if (!lanUsable()) return
    let had = false
    try {
      const d = await lanApi('/api/rev')
      lan.on = true
      lan.rev = d.rev
      had = await lanPull()
    } catch (e) { return } // pas de serveur : localStorage seul
    // Serveur encore vide et pool local non vide : on partage ce qui existe.
    if (!had && store.patterns.length) await lanPush()
    lan.timer = setInterval(lanPollTick, LAN_POLL_MS)
    if (lan.timer && typeof lan.timer.unref === 'function') lan.timer.unref()
    lanNotify('start') // met à jour les UI (éditeur) avec l'état LAN initial
  }

  // ---------- fin sync LAN ----------

  function getPatterns() { return store.patterns }
  function getLayout() { return layout }
  function setPatterns(list) {
    store.patterns = (list || []).filter(p => validatePattern(p).length === 0)
    save()
  }
  // Éditeur : sauvegarde sans filtrage (un pattern en cours d'édition peut être
  // temporairement invalide — il est signalé mais jamais perdu).
  function setPatternsRaw(list) {
    store.patterns = list || []
    save()
  }
  function setLayout(l) { layout = normalizeLayout(l); save() }
  function usingDefaults() { return store.patterns.length === 0 }
  function installDefaults() {
    const defs = defaults()
    if (!defs.length) return 0
    store.patterns = JSON.parse(JSON.stringify(defs))
    save()
    return defs.length
  }
  function resetUser() { store.patterns = []; save() }
  function pin(p) { pinned = p || null }
  function getPinned() { return pinned }

  // ---------- export / import (portabilité) ----------
  function pack(o) {
    return 'SLIME1.' + btoa(unescape(encodeURIComponent(JSON.stringify(o))))
  }
  function unpack(s) {
    return decodeURIComponent(escape(atob(s)))
  }

  function exportAll() {
    return JSON.stringify({ format: FORMAT, patterns: store.patterns, layout }, null, 2)
  }
  function exportCode() {
    return pack({ format: FORMAT, patterns: store.patterns, layout })
  }
  function patternToCode(p) {
    return pack({ format: FORMAT, patterns: [p], layout: null })
  }

  // Accepte : code SLIME1.* ou JSON brut. Retourne { ok, data, errors }.
  function importData(text) {
    text = String(text || '').trim()
    if (!text) return { ok: false, error: 'vide' }
    let data
    if (text.indexOf('SLIME1.') === 0) {
      try { data = JSON.parse(unpack(text.slice(7))) }
      catch (e) { return { ok: false, error: 'code illisible' } }
    } else {
      try { data = JSON.parse(text) }
      catch (e) { return { ok: false, error: 'JSON invalide' } }
    }
    if (!data || data.format !== FORMAT || !Array.isArray(data.patterns)) return { ok: false, error: 'format inconnu' }
    const errors = []
    data.patterns = data.patterns.filter(p => {
      const errs = validatePattern(p)
      if (errs.length) errors.push((p && p.name || '?') + ' : ' + errs.join(', '))
      return errs.length === 0
    })
    return { ok: true, data, errors }
  }

  function applyImport(res, mode) {
    // mode: 'replace' | 'merge'
    if (!res || !res.ok) return 0
    if (mode === 'merge') {
      const byId = {}
      for (const p of store.patterns) byId[p.id] = true
      let n = 0
      for (const p of res.data.patterns) {
        if (!byId[p.id]) { store.patterns.push(p); n++ }
      }
      save()
      return n
    }
    store.patterns = res.data.patterns
    if (res.data.layout) layout = normalizeLayout(res.data.layout)
    save()
    return store.patterns.length
  }

  // Connexion au serveur LAN si présent (no-op sinon, jamais bloquante).
  try { lanStart().catch(() => {}) } catch (e) {}

  return {
    FORMAT, TYPES,
    load, save, loadStatus,
    getPatterns, setPatterns, setPatternsRaw, getLayout, setLayout,
    usingDefaults, installDefaults, resetUser,
    defaults, validatePattern, validatePatternJumps,
    patternWidth, entryRow, emptyPattern, uid,
    instantiate, jumpOk, targetOf,
    spawnSection, pin, getPinned,
    exportAll, exportCode, patternToCode, importData, applyImport,
    lanStatus, lanOnChange
  }
})()
