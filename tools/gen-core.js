// SLIME — génération du pool de patterns par défaut.
// Pool pédagogique (spec 2026-09-29) : chaque tier ne tire que sa PALETTE de
// types (cumulative — un tier introduit les siens sans perdre les précédents)
// et ses premiers patterns sont des VITRINES : le nouveau type y apparaît
// isolé, large, sans pics, entouré de basic. La difficulté monte en continu
// dans le tier (gaps/pics croissants avec la progression D). Chaque saut est
// validé par la physique (reachOk : saut visé simple ; les tiers 4-5
// acceptent un saut par section via le double saut — Phys.canReachDouble).
// Utilisable côté Node (tools/gen_defaults.mjs) et côté navigateur (tools/gen_default_pool.html).
// Dépend de js/physics.js.

function generateDefaultPool(opts) {
  opts = opts || {}
  const perTier = opts.perTier || 4
  const seed = opts.seed != null ? opts.seed : 20260921

  // Types NOUVEAUX par tier (l'ordre = courbe de découverte, UNLOCK_T côté
  // patterns.js) et palette cumulative par tier.
  const TIER_NEW = { 1: ['dynamic'], 2: ['crumble', 'phase'], 3: ['sticky', 'turbo'], 4: ['bouncy', 'seesaw'], 5: ['gold'] }
  const paletteOf = tier =>
    ['basic', ...[1, 2, 3, 4, 5].slice(0, tier).flatMap(t => TIER_NEW[t])]

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

  // Gemmes high-risk (spec 2026-09-30) : T3 ~1 pattern/3 (1 gemme), T4 ~1/3
  // (1-2), T5 ~1/2 (1-3). Spots mortels uniquement : au ras des pics, en
  // apex de gap, en hauteur au-dessus d'une plateforme large. Appelée après
  // validation de la chaîne : aucun tirage en amont n'est déplacé.
  function simSpawnGems(A, chain, balls, tier) {
    if (tier < 3) return
    const share = tier === 5 ? 0.5 : 0.34
    if (A.rand() >= share) return
    const nMax = tier === 5 ? 3 : (tier === 4 ? 2 : 1)
    const spots = []
    for (const p of chain) {
      if (p.spike) spots.push({ x: p.x + p.w * 0.5, y: p.y - 16 })
      if (p.type === 'basic' && p.w >= 4 * CELL) spots.push({ x: p.x + p.w * 0.5, y: p.y - 26 })
    }
    for (let j = 1; j < chain.length; j++) {
      const a = chain[j - 1], b = chain[j]
      if (b.x - (a.x + a.w) >= 2 * CELL) spots.push({ x: (a.x + a.w + b.x) / 2, y: Math.min(a.y, b.y) - 24 })
    }
    if (!spots.length) return
    const n = Math.min(A.randi(1, nMax), spots.length)
    const picked = []
    for (let k = 0; k < n; k++) {
      const s = spots.splice(A.randi(0, spots.length - 1), 1)[0]
      if (picked.some(q => Math.abs(q.x - s.x) < 6 * CELL)) continue
      picked.push(s)
      balls.push({ x: s.x, y: clampN(s.y, CEIL + 14, 252), gem: true })
    }
  }

  // --- port de spawnNext (génération par palette de tier) ---
  // opts : { tier, idx, perTier, s, vitrine, showcase } — position dans la
  // courbe (D = progression 0..1 sur tout le pool) et mode vitrine.
  // lastOne : dernière plateforme du pattern (la bascule n'y est jamais
  // tirée — elle propulse, rien ne doit la dépendre).
  function simSpawnNext(A, plats, balls, opts, lastOne) {
    const { tier, idx, perTier, s, vitrine, showcase, budget } = opts
    const D = clampN((tier - 1 + (idx + 1) / perTier) / 5, 0, 1)
    const last = plats[plats.length - 1]
    for (let attempt = 0; attempt < 24; attempt++) {
      let gap = 2 + A.randi(0, Math.round(2 * D))
      if (vitrine) gap = Math.min(gap, 3)
      let dRow = A.randi(-2, 2)
      // Type : vitrine imposée (showcase puis 2 basic), sinon sac pondéré
      // sur la palette du tier (le basic domine).
      let type
      if (vitrine && s === 0) type = showcase
      else if (vitrine && (s === 1 || s === 2)) type = 'basic'
      else {
        const pal = paletteOf(tier)
        const bag = ['basic', 'basic', 'basic', ...pal.filter(t => t !== 'basic')]
        type = bag[A.randi(0, bag.length - 1)]
      }
      // Règles de génération : gold ≤ 1 par pattern ; jamais plus de 2
      // phasantes consécutives ; la bascule n'est jamais la dernière
      // plateforme du pattern (elle propulse, rien ne doit la dépendre).
      if (type === 'gold' && plats.some(p => p.type === 'gold')) type = 'basic'
      if (type === 'phase' && plats.length >= 2 &&
          plats[plats.length - 1].type === 'phase' && plats[plats.length - 2].type === 'phase') type = 'basic'
      if (type === 'seesaw' && lastOne) type = 'basic'
      let cells
      if (type === 'basic') cells = A.randi(2, 5)
      else if (type === 'dynamic' || type === 'sticky') cells = A.randi(2, 3)
      else if (type === 'crumble' || type === 'turbo') cells = A.randi(2, 4)
      else if (type === 'seesaw') cells = A.randi(3, 4)
      else if (type === 'phase') cells = A.randi(2, 3)
      else if (type === 'gold') cells = A.randi(1, 2)
      else cells = 2
      if (vitrine && s === 0) cells = Math.max(3, cells)
      // Début de run tout en douceur : les premières plateformes du tout
      // premier pattern sont du basic large, gaps courts (hors showcase).
      if (tier === 1 && plats.length <= 3 && !(vitrine && s === 0)) {
        gap = Math.min(gap, 2); dRow = clampN(dRow, -1, 1); type = 'basic'; cells = A.randi(3, 4)
      }
      if (dRow === -2 && gap > 2) dRow = -1
      if (last.type === 'sticky') { gap = Math.min(gap, 3); if (dRow < -1) dRow = -1; if (dRow === -1 && gap > 2) gap = 2 }
      if (last.type === 'bouncy' && dRow < -1) dRow = -1
      const row = clampN(last.row + dRow, 0, 4)
      const p = { x: last.x + last.w + gap * CELL, row, y: rowY(row), baseY: rowY(row), w: cells * CELL, type, amp: 0, spd: 0, ph: 0, spike: null }
      if (type === 'dynamic') {
        // T1 : dynamique douce (découverte des cibles qui bougent).
        p.amp = tier === 1 ? 8 + A.rand() * 8 : 16 + A.rand() * 18
        p.spd = tier === 1 ? 1.2 + A.rand() * 0.4 : 1.2 + A.rand() * 0.9
        p.ph = A.rand() * Math.PI * 2
        p.baseY = clampN(p.baseY, CEIL + 24 + p.amp, 248 - p.amp)
        p.y = p.baseY
      }
      if (type === 'basic' && cells >= 4 && !vitrine && A.rand() < 0.10 + 0.30 * D) {
        p.spike = { x1: p.x + p.w * 0.28, x2: p.x + p.w * 0.78 }
      }
      const checkY = type === 'dynamic' ? p.baseY - p.amp * 0.7 : p.y
      const target = { x: p.x, y: checkY, w: p.w }
      if (reachOk(last, target, budget)) {
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

  // --- accessibilité d'un saut (avec double saut pour les hauts tiers) ---
  // Tiers 1-3 : strict — chaque saut doit passer en saut visé simple.
  // Tiers 4-5 : UN saut par section peut exiger le double saut (budget
  // consommé) ; la rattrape de bord n'est jamais requise (précision, pas
  // conception).
  const DJ_TIERS = 4
  const DJ_CFG = { powerMul: 1 }

  function reachOk(a, b, budget) {
    const t = targetOfRaw(b)
    const mul = a.type === 'sticky' ? Phys.phys().stickyMul : 1
    if (a.type === 'bouncy') {
      if (Phys.canReachBounce(a, t)) return true
      if (budget && budget.dj > 0 && Phys.canReachBounceExt(a, t, null, DJ_CFG)) {
        budget.dj--
        return true
      }
      return false
    }
    if (Phys.canReach(a, t, mul, 1)) return true
    if (budget && budget.dj > 0 && Phys.canReachDouble(a, t, mul, 1, null, DJ_CFG)) {
      budget.dj--
      return true
    }
    return false
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
        const budget = { dj: tier >= DJ_TIERS ? 1 : 0 }
        // Vitrines : les premiers patterns du tier présentent ses nouveaux
        // types (un pattern par type, dans l'ordre de la courbe).
        const vitrine = i < TIER_NEW[tier].length
        const showcase = vitrine ? TIER_NEW[tier][i] : null
        for (let s = 0; s < n; s++) {
          simSpawnNext(A, plats, balls, { tier, idx: i, perTier, s, vitrine, showcase, budget }, s === n - 1)
        }
        const chain = plats.slice(1)

        // Revalidation complète de la chaîne (garantie) — même budget DJ que
        // la génération : l'ancre + chaque paire consécutive doit passer.
        let ok = reachOk(anchor, chain[0], budget)
        for (let j = 1; j < chain.length && ok; j++) {
          ok = reachOk(chain[j - 1], chain[j], budget)
        }
        if (!ok) { rejected++; i--; continue }

        // Gemmes high-risk : APRÈS la validation de la chaîne (les tirages
        // de plateformes/billes ci-dessus restent identiques bit à bit).
        simSpawnGems(A, chain, balls, tier)

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
          return { x: Math.round(b.x), row, yOff: Math.round(b.y - rowY(row)), gold: false, gem: !!b.gem }
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
