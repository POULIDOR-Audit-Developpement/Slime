// SLIME — génération du pool de patterns par défaut.
// Port fidèle de l'ancien générateur procédural de game.js, découpé en sections
// autonomes (une ancre + N plateformes), validées par la physique (Phys.canReach).
// Utilisable côté Node (tools/gen_defaults.mjs) et côté navigateur (tools/gen_default_pool.html).
// Dépend de js/physics.js.

function generateDefaultPool(opts) {
  opts = opts || {}
  const perTier = opts.perTier || 4
  const seed = opts.seed != null ? opts.seed : 20260921

  // Temps simulé par difficulté : reprend les paliers du générateur d'origine
  // (D = elapsed/75, déblocages crumble/ghost à 12 s, bouncy à 25 s, pics à 20 s).
  const TIER_T = [14, 26, 45, 62, 90]

  const clampN = (v, a, b) => Math.max(a, Math.min(b, v))

  function rngFactory(seedV) {
    let a = seedV >>> 0
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function api(seedV) {
    const r = rngFactory(seedV)
    return { rand: r, randi: (x, y) => x + Math.floor(r() * (y - x + 1)) }
  }

  // --- port de spawnBalls (game.js d'origine) ---
  function simSpawnBalls(A, a, b, gapCells, balls) {
    if (A.rand() < 0.62) {
      const gx = a.x + a.w + gapCells * CELL / 2
      const top = Math.min(a.y, b.y)
      for (let i = -1; i <= 1; i++) {
        const by = clampN(top - 30 - (i === 0 ? 12 : 0), CEIL + 14, 252)
        balls.push({ x: gx + i * 13, y: by, o: A.rand() < 0.3 })
      }
    } else if (b.w >= 3 * CELL && A.rand() < 0.45) {
      for (let i = 0; i < 3; i++) balls.push({ x: b.x + b.w / 2 + (i - 1) * 14, y: b.y - 12, o: A.rand() < 0.3 })
    }
  }

  // --- port de spawnNext (game.js d'origine, sans branches ni billes dorées) ---
  function simSpawnNext(A, plats, balls, simElapsed) {
    const last = plats[plats.length - 1]
    const D = Math.min(simElapsed / 75, 1)
    for (let attempt = 0; attempt < 24; attempt++) {
      let gap = 2 + A.randi(0, Math.round(2 * D))
      let dRow = A.randi(-2, 2)
      const roll = A.rand()
      let type
      if (roll < 0.38) type = 'basic'
      else if (roll < 0.51) type = 'dynamic'
      else if (roll < 0.62) type = simElapsed > 12 ? 'crumble' : 'basic'
      else if (roll < 0.72) type = 'sticky'
      else if (roll < 0.82) type = simElapsed > 12 ? 'ghost' : 'basic'
      else if (roll < 0.92) type = simElapsed > 25 ? 'bouncy' : 'basic'
      else type = 'basic'
      let cells
      if (type === 'basic') cells = A.randi(2, 5)
      else if (type === 'dynamic' || type === 'sticky' || type === 'ghost') cells = A.randi(2, 3)
      else if (type === 'crumble') cells = A.randi(2, 4)
      else cells = 2
      if (simElapsed < 10) { gap = Math.min(gap, 2); dRow = clampN(dRow, -1, 1); type = 'basic'; cells = A.randi(3, 4) }
      if (dRow === -2 && gap > 2) dRow = -1
      if (last.type === 'sticky') { gap = Math.min(gap, 3); if (dRow < -1) dRow = -1; if (dRow === -1 && gap > 2) gap = 2 }
      if (last.type === 'bouncy' && dRow < -1) dRow = -1
      const row = clampN(last.row + dRow, 0, 4)
      const p = { x: last.x + last.w + gap * CELL, row, y: rowY(row), baseY: rowY(row), w: cells * CELL, type, amp: 0, spd: 0, ph: 0, spike: null }
      if (type === 'dynamic') {
        p.amp = 16 + A.rand() * 18
        p.spd = 1.2 + A.rand() * 0.9
        p.ph = A.rand() * Math.PI * 2
        p.baseY = clampN(p.baseY, CEIL + 24 + p.amp, 248 - p.amp)
        p.y = p.baseY
      }
      if (type === 'basic' && cells >= 4 && simElapsed > 20 && A.rand() < 0.3) {
        p.spike = { x1: p.x + p.w * 0.28, x2: p.x + p.w * 0.78 }
      }
      const checkY = type === 'dynamic' ? p.baseY - p.amp * 0.7 : p.y
      const target = { x: p.x, y: checkY, w: p.w }
      const ok = last.type === 'bouncy'
        ? Phys.canReachBounce(last, target)
        : Phys.canReach(last, target, last.type === 'sticky' ? STICKY_MUL : 1, 1)
      if (ok) {
        plats.push(p)
        simSpawnBalls(A, last, p, gap, balls)
        return p
      }
    }
    const p = { x: last.x + last.w + 2 * CELL, row: last.row, y: rowY(last.row), baseY: rowY(last.row), w: 3 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0, spike: null }
    plats.push(p)
    simSpawnBalls(A, last, p, 2, balls)
    return p
  }

  function targetOfRaw(p) {
    return { x: p.x, y: p.type === 'dynamic' ? p.baseY - p.amp * 0.7 : p.y, w: p.w }
  }

  // Génère perTier sections par difficulté. Retourne { patterns, rejected }.
  function build() {
    const patterns = []
    let rejected = 0
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < perTier; i++) {
        if (rejected > 200) break
        const A = api(seed + tier * 7919 + i * 104729 + rejected * 31)
        const entryRowV = A.randi(0, 4)
        // Ancre virtuelle : bord droit à x=0 (origine des coords du pattern).
        const anchor = { x: -4 * CELL, row: entryRowV, y: rowY(entryRowV), baseY: rowY(entryRowV), w: 4 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0, spike: null }
        const plats = [anchor]
        const balls = []
        const n = A.randi(7, 11)
        for (let s = 0; s < n; s++) simSpawnNext(A, plats, balls, TIER_T[tier - 1])
        const chain = plats.slice(1)

        // Revalidation complète de la chaîne (garantie).
        let ok = true
        for (let j = 1; j < chain.length && ok; j++) {
          const a = chain[j - 1], b = chain[j]
          ok = a.type === 'bouncy'
            ? Phys.canReachBounce(a, targetOfRaw(b))
            : Phys.canReach(a, targetOfRaw(b), a.type === 'sticky' ? STICKY_MUL : 1, 1)
        }
        const entryOk = Phys.canReach(anchor, targetOfRaw(chain[0]), 1, 1)
        if (!ok || !entryOk) { rejected++; i--; continue }

        const platforms = chain.map(p => {
          const q = {
            x: Math.round(p.x), row: p.row, cells: Math.round(p.w / CELL),
            type: p.type, yOff: 0, amp: Math.round(p.amp || 0),
            spd: Math.round((p.spd || 0) * 100) / 100, spike: null
          }
          if (p.type === 'dynamic') q.yOff = Math.round(p.baseY - rowY(p.row))
          if (p.spike) q.spike = {
            a: Math.round((p.spike.x1 - p.x) / p.w * 100) / 100,
            b: Math.round((p.spike.x2 - p.x) / p.w * 100) / 100
          }
          return q
        })
        const ballsRel = balls.map(b => {
          const row = clampN(Math.round((b.y - ROW0) / RS), 0, 4)
          return { x: Math.round(b.x), row, yOff: Math.round(b.y - rowY(row)), gold: false }
        })
        let width = CELL
        for (const q of platforms) width = Math.max(width, q.x + q.cells * CELL)
        patterns.push({
          id: 'gen-t' + tier + '-' + (i + 1),
          name: 'T' + tier + ' · ' + (i + 1),
          difficulty: tier,
          entry: { row: entryRowV },
          platforms,
          balls: ballsRel,
          decor: [],
          width: width + CELL
        })
      }
    }
    return { patterns, rejected }
  }

  return build()
}

if (typeof module !== 'undefined' && module.exports) module.exports = { generateDefaultPool }
