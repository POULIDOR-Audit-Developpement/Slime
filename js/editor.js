// SLIME — éditeur de patterns et de vue principale.
// Onglet PATTERNS : placement de plateformes/pics/billes/décor sur la grille,
// validation en direct des sauts (même physique que le jeu), playtest.
// Onglet VUE : hitboxes des murs (plafond/gauche/droite) + assets décoratifs.
// Tout est sauvegardé en localStorage (même clé que le jeu) et portable
// via export .json ou code compact. Dépend de physics.js, sprites.js, patterns.js.

const Ed = (() => {
  // ---------- palette (mêmes couleurs que le jeu) ----------
  const COL = {
    bg: '#4a5ed7', bgD: '#4152c8', frame: '#131735', panel: '#1c2148',
    black: '#0a0a12', white: '#f4f4f4', dim: '#8a8ab0',
    basic: '#3ecb3e', basicD: '#1f7a1f',
    sticky: '#a06c33', stickyD: '#7d5222',
    dynamic: '#38b6e8', dynamicD: '#1c7fb0',
    crumble: '#9aa0ac', crumbleD: '#6b7280',
    ghost: '#d8e8f4', ghostD: '#a8bccb',
    bouncy: '#cc6d1a', bouncyD: '#8f4a0f',
    spike: '#e23b3b', spikeD: '#8f1f1f',
    ball: '#ffd83d', gold: '#ffd700', ok: '#3ecb3e', ko: '#e23b3b', sel: '#ffd83d'
  }
  const TIER_COLORS = ['#3ecb3e', '#a5f0a5', '#ffd83d', '#ff9d2e', '#e23b3b']
  const TYPE_LABEL = {
    basic: 'Basique', sticky: 'Collante', dynamic: 'Dynamique',
    crumble: 'Cassable', ghost: 'Éphémère', bouncy: 'Rebondissante'
  }
  const DECOR_SPRITES = ['bgBig', 'bgPanel1', 'bgPanel2', 'bgPanel3', 'bgPanel4',
    'tileGreen', 'tileBlue', 'tileGray', 'tileGhost', 'tileOrange',
    'sticky', 'dynStrip', 'voidBand', 'hudHead', 'big', 'mid', 'small', 'splat']

  // ---------- état ----------
  let mode = 'patterns'            // 'patterns' | 'layout'
  let patterns = []                // référence vivante vers le store
  let selId = null                 // id du pattern sélectionné
  let selKind = null               // 'plat' | 'ball' | 'decor' | 'anchor'
  let selIdx = -1
  let tool = 'select'              // select | plat | ball | gold | decor | wall | erase
  let platType = 'basic'
  let platCells = 3
  let wallKind = 'ground'
  let wallCells = 1
  let decorSprite = 'bgPanel1'
  let camX = -6 * CELL, zoom = 1
  let drag = null
  let mouse = { x: 0, y: 0, wx: 0, wy: 0, inside: false }
  let flashT = 0

  let cv, ctx, listEl, propsEl, toolbarEl, coordsEl, statusEl, storeInfoEl
  let fileInput

  function selPattern() { return patterns.find(p => p.id === selId) || null }

  // ---------- utilitaires ----------
  function flash(msg, ko) {
    statusEl.textContent = msg
    statusEl.className = ko ? 'ko' : 'ok'
    flashT = 2.2
  }
  function snapCell(v) { return Math.max(CELL, Math.round(v / CELL) * CELL) }
  function clampN(v, a, b) { return Math.max(a, Math.min(b, v)) }

  function persist() {
    Patterns.setPatternsRaw(patterns)
    refreshList()
    if (flashT <= 0) flash('Sauvegardé')
  }

  // ---------- transformations d'écran ----------
  function scale() { return (cv.clientHeight / VH) * zoom }
  function w2sX(wx) { return (wx - camX) * scale() }
  function w2sY(wy) { return wy * scale() }
  function s2wX(sx) { return camX + sx / scale() }
  function s2wY(sy) { return sy / scale() }

  let fitLayout = { s: 1, ox: 0, oy: 0 }
  function layoutTransform() {
    const s = Math.min(cv.clientWidth / VW, cv.clientHeight / VH)
    fitLayout = { s, ox: (cv.clientWidth - VW * s) / 2, oy: (cv.clientHeight - VH * s) / 2 }
    return fitLayout
  }
  function l2sX(wx) { return fitLayout.ox + wx * fitLayout.s }
  function l2sY(wy) { return fitLayout.oy + wy * fitLayout.s }
  function s2lX(sx) { return (sx - fitLayout.ox) / fitLayout.s }
  function s2lY(sy) { return (sy - fitLayout.oy) / fitLayout.s }

  // ---------- géométrie d'un pattern ----------
  function platRight(p) { return p.x + p.cells * CELL }
  function platY(p) { return rowY(p.row) }
  function entryAnchor(pat) {
    const r = Patterns.entryRow(pat)
    return { row: r, y: rowY(r), x0: -4 * CELL, x1: 0 }
  }

  function hitTest(wx, wy, pat) {
    if (!pat) return null
    for (let i = pat.balls.length - 1; i >= 0; i--) {
      const b = pat.balls[i]
      if (Math.abs(wx - b.x) < 10 && Math.abs(wy - (rowY(b.row) + b.yOff)) < 10) return { kind: 'ball', idx: i }
    }
    if (pat.walls) for (let i = pat.walls.length - 1; i >= 0; i--) {
      const g = wallGeom(pat.walls[i])
      if (wx >= g.x - 11 && wx <= g.x + g.w + 11 && wy >= g.y1 - 6 && wy <= g.y2) return { kind: 'wall', idx: i }
    }
    for (let i = pat.platforms.length - 1; i >= 0; i--) {
      const p = pat.platforms[i]
      if (wx >= p.x && wx <= platRight(p) && wy >= platY(p) - 8 && wy <= platY(p) + 30) return { kind: 'plat', idx: i }
    }
    for (let i = pat.decor.length - 1; i >= 0; i--) {
      const d = pat.decor[i]
      const h = decorH(d)
      if (wx >= d.x && wx <= d.x + d.w && wy >= d.y && wy <= d.y + h) return { kind: 'decor', idx: i }
    }
    const a = entryAnchor(pat)
    if (wx >= a.x0 && wx <= a.x1 && wy >= a.y - 10 && wy <= a.y + 30) return { kind: 'anchor', idx: -1 }
    return null
  }

  function decorH(d) {
    const im = Sprites.get(d.sprite)
    if (im && im.width) return d.w * (im.height / im.width)
    return d.w * 0.66
  }

  // ---------- dessin ----------
  function drawTileAt(c, x, y, top, side) {
    c.fillStyle = COL.black
    c.fillRect(x - 1, y - 1, CELL + 2, CELL + 2)
    c.fillStyle = side
    c.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
    c.fillStyle = top
    c.fillRect(x + 1, y + 1, CELL - 2, 14)
    c.fillStyle = COL.white
    c.fillRect(x + 5, y + 4, 9, 4)
  }

  function drawPlatEditor(c, p, selected) {
    const y = platY(p), w = p.cells * CELL
    c.save()
    if (p.type === 'ghost') c.globalAlpha = 0.55
    if (p.type === 'sticky') {
      c.fillStyle = COL.black; c.fillRect(p.x - 1, y - 1, w + 2, 30)
      c.fillStyle = COL.stickyD; c.fillRect(p.x + 1, y + 1, w - 2, 26)
      c.fillStyle = COL.sticky; c.fillRect(p.x + 1, y + 1, w - 2, 12)
      for (let dx = 12; dx < w - 10; dx += 18) {
        c.fillStyle = COL.stickyD
        c.fillRect(p.x + dx, y + 24, 6, 9)
      }
    } else if (p.type === 'dynamic') {
      c.fillStyle = COL.black; c.fillRect(p.x - 1, y - 1, w + 2, 18)
      c.fillStyle = COL.dynamicD; c.fillRect(p.x + 1, y + 1, w - 2, 14)
      c.fillStyle = COL.dynamic; c.fillRect(p.x + 1, y + 1, w - 2, 7)
      c.fillStyle = COL.white
      for (let dx = 8; dx < w - 8; dx += 22) c.fillRect(p.x + dx, y + 5, 5, 5)
    } else {
      const tops = { basic: COL.basic, crumble: COL.crumble, ghost: COL.ghost, bouncy: COL.bouncy }
      const sides = { basic: COL.basicD, crumble: COL.crumbleD, ghost: COL.ghostD, bouncy: COL.bouncyD }
      for (let i = 0; i < p.cells; i++) {
        drawTileAt(c, p.x + i * CELL, y, tops[p.type] || COL.basic, sides[p.type] || COL.basicD)
        if (p.type === 'crumble') {
          c.fillStyle = '#3f4652'
          c.fillRect(p.x + i * CELL + 9, y + 6, 2, 9)
          c.fillRect(p.x + i * CELL + 20, y + 11, 2, 6)
        }
        if (p.type === 'bouncy') {
          c.fillStyle = COL.white
          c.beginPath()
          c.moveTo(p.x + i * CELL + 7, y + 14); c.lineTo(p.x + i * CELL + 13, y + 7); c.lineTo(p.x + i * CELL + 19, y + 14)
          c.moveTo(p.x + i * CELL + 15, y + 14); c.lineTo(p.x + i * CELL + 21, y + 7); c.lineTo(p.x + i * CELL + 27, y + 14)
          c.fill()
        }
      }
    }
    if (p.type === 'ghost') c.globalAlpha = 1
    if (p.spike) {
      const x1 = p.x + p.spike.a * w, x2 = p.x + p.spike.b * w
      for (let sx = x1; sx + 8 <= x2 + 0.1; sx += 8) {
        c.fillStyle = COL.spikeD
        c.beginPath(); c.moveTo(sx, y + 1); c.lineTo(sx + 4, y - 10); c.lineTo(sx + 8, y + 1); c.fill()
        c.fillStyle = COL.spike
        c.beginPath(); c.moveTo(sx + 1, y + 1); c.lineTo(sx + 4, y - 7); c.lineTo(sx + 7, y + 1); c.fill()
      }
    }
    if (p.type === 'dynamic') {
      c.strokeStyle = COL.dynamicD; c.setLineDash([3, 3]); c.lineWidth = 1
      c.strokeRect(p.x + 2, y - p.amp + 16, w - 4, p.amp * 2)
      c.setLineDash([])
    }
    if (selected) {
      c.strokeStyle = COL.sel; c.lineWidth = 2
      c.strokeRect(p.x - 3, y - 13, w + 6, 48)
    }
    c.restore()
  }

  function drawBallEditor(c, b, selected) {
    const y = rowY(b.row) + b.yOff
    c.save()
    if (b.gold) {
      c.globalAlpha = 0.35
      c.fillStyle = COL.gold
      c.beginPath(); c.arc(b.x, y, 11, 0, 7); c.fill()
      c.globalAlpha = 1
      c.strokeStyle = COL.black; c.lineWidth = 2
      c.beginPath(); c.arc(b.x, y, 8, 0, 7); c.stroke()
      c.fillStyle = COL.gold
      c.beginPath(); c.arc(b.x, y, 6.5, 0, 7); c.fill()
    } else {
      c.strokeStyle = COL.black; c.lineWidth = 2
      c.beginPath(); c.arc(b.x, y, 5.5, 0, 7); c.stroke()
      c.fillStyle = COL.ball
      c.beginPath(); c.arc(b.x, y, 4, 0, 7); c.fill()
    }
    c.fillStyle = COL.white
    c.beginPath(); c.arc(b.x - 1.5, y - 1.5, 1.4, 0, 7); c.fill()
    if (selected) {
      c.strokeStyle = COL.sel; c.lineWidth = 1.5
      c.beginPath(); c.arc(b.x, y, 13, 0, 7); c.stroke()
    }
    c.restore()
  }

  function wallGeom(wl) {
    const wc = Phys.walls().ceil
    return wl.kind === 'ground'
      ? { x: wl.x, w: wl.cells * CELL, y1: rowY(wl.row), y2: VH }
      : { x: wl.x, w: wl.cells * CELL, y1: wc, y2: rowY(wl.row) }
  }

  function drawWallEditor(c, wl, selected) {
    const g = wallGeom(wl)
    const h = g.y2 - g.y1
    if (h <= 0) return
    c.save()
    // corps : colonne de tuiles grises (distinctes des plateformes vertes)
    c.fillStyle = COL.black
    c.fillRect(g.x - 1, g.y1 - 1, g.w + 2, h + 2)
    c.fillStyle = COL.crumbleD
    c.fillRect(g.x + 2, g.y1 + 2, g.w - 4, h - 4)
    c.fillStyle = COL.crumble
    c.fillRect(g.x + 2, g.y1 + 2, g.w - 4, Math.min(14, h - 4))
    // arêtes de tuiles
    c.fillStyle = 'rgba(10,10,18,.35)'
    for (let ty = g.y1 + CELL; ty < g.y2 - 4; ty += CELL) c.fillRect(g.x + 2, ty, g.w - 4, 2)
    // câp clair à la pointe (sommet atterrissable pour une colonne)
    const capY = wl.kind === 'ground' ? g.y1 + 2 : g.y2 - 6
    c.fillStyle = COL.white
    c.fillRect(g.x + 3, capY, g.w - 6, 3)
    // piques latérales
    if (wl.spiked) {
      for (let sy = g.y1 + 6; sy + 8 <= g.y2 - 2; sy += 8) {
        c.fillStyle = COL.spikeD
        c.beginPath(); c.moveTo(g.x, sy); c.lineTo(g.x - 9, sy + 4); c.lineTo(g.x, sy + 8); c.fill()
        c.beginPath(); c.moveTo(g.x + g.w, sy); c.lineTo(g.x + g.w + 9, sy + 4); c.lineTo(g.x + g.w, sy + 8); c.fill()
        c.fillStyle = COL.spike
        c.beginPath(); c.moveTo(g.x, sy + 1); c.lineTo(g.x - 7, sy + 4); c.lineTo(g.x, sy + 7); c.fill()
        c.beginPath(); c.moveTo(g.x + g.w, sy + 1); c.lineTo(g.x + g.w + 7, sy + 4); c.lineTo(g.x + g.w, sy + 7); c.fill()
      }
    }
    if (selected) {
      c.strokeStyle = COL.sel; c.lineWidth = 2
      c.strokeRect(g.x - 11, g.y1 - 3, g.w + 22, h + 6)
    }
    c.restore()
  }

  function drawDecorEditor(c, d, selected, toSX, toSY, s) {
    const im = Sprites.get(d.sprite)
    const h = decorH(d)
    const x = toSX(d.x), y = toSY(d.y), w = d.w * s, hh = h * s
    if (im && im.width && im.complete) {
      c.save(); c.imageSmoothingEnabled = false
      c.drawImage(im, x, y, w, hh)
      c.restore()
    } else {
      c.strokeStyle = COL.dim; c.setLineDash([4, 3])
      c.strokeRect(x, y, w, hh)
      c.setLineDash([])
    }
    if (selected) {
      c.strokeStyle = COL.sel; c.lineWidth = 2
      c.strokeRect(x - 2, y - 2, w + 4, hh + 4)
    }
  }

  function drawGridPatterns(c, pat) {
    const s = scale()
    const cw = cv.clientWidth, ch = cv.clientHeight
    // fond
    c.fillStyle = '#10142e'; c.fillRect(0, 0, cw, ch)
    // lignes de lignes (rows)
    c.font = '10px monospace'
    for (let r = 0; r < 5; r++) {
      const y = w2sY(rowY(r))
      c.strokeStyle = '#232348'; c.lineWidth = 1
      c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(cw, y + 0.5); c.stroke()
      c.fillStyle = '#565a8a'
      c.fillText('r' + r, 6, y - 4)
    }
    // grille verticale + règle
    const w0 = Math.floor(s2wX(0) / CELL) * CELL
    const w1 = s2wX(cw)
    for (let x = w0; x <= w1; x += CELL) {
      const sx = w2sX(x)
      const major = ((x / CELL) % 4 + 40) % 4 === 0
      c.strokeStyle = major ? '#2e2e5e' : '#1b2044'
      c.beginPath(); c.moveTo(sx + 0.5, 0); c.lineTo(sx + 0.5, ch); c.stroke()
      if (major) {
        c.fillStyle = '#565a8a'
        c.fillText(String(x), sx + 3, ch - 6)
      }
    }
    // plafond + zone interdite
    const ch2 = w2sY(Math.max(8, WALL_DEFAULT() - 12))
    c.fillStyle = '#1b2044'; c.fillRect(0, 0, cw, ch2)
    c.fillStyle = '#565a8a'; c.fillRect(0, ch2 - 2, cw, 2)
    // sol
    const fy = w2sY(254)
    c.fillStyle = '#1b2044'; c.fillRect(0, fy, cw, ch - fy)
    if (!pat) return
    // ancre d'entrée
    const a = entryAnchor(pat)
    const ax = w2sX(a.x0), aw = (a.x1 - a.x0) * s, ay = w2sY(a.y)
    c.save()
    c.strokeStyle = COL.ok; c.setLineDash([6, 4]); c.lineWidth = 2
    c.strokeRect(ax, ay, aw, 26)
    c.setLineDash([])
    c.fillStyle = COL.ok
    c.font = 'bold 11px monospace'
    c.fillText('ENTRÉE r' + a.row, ax + 4, ay - 6)
    // petit slime fantôme
    c.fillStyle = 'rgba(62,203,62,.5)'
    c.beginPath(); c.arc(ax + aw - 18, ay - 12, 12, Math.PI, 0)
    c.lineTo(ax + aw - 6, ay); c.lineTo(ax + aw - 30, ay); c.fill()
    c.restore()
  }

  function WALL_DEFAULT() { return Patterns.getLayout().walls.ceil }

  function drawValidation(c, pat) {
    const v = Patterns.validatePatternJumps(pat)
    const inst = Patterns.instantiate(pat, anchorOf(pat))
    let prev = null
    for (let i = 0; i < inst.platforms.length; i++) {
      const cur = inst.platforms[i]
      if (prev) {
        const ok = v.jumps[i - 1]
        const mx = w2sX((prev.x + prev.w + cur.x) / 2)
        const my = w2sY((prev.y + cur.y) / 2) - 16
        c.beginPath(); c.arc(mx, my, 8, 0, 7)
        c.fillStyle = ok ? '#123c12' : '#3c1212'; c.fill()
        c.strokeStyle = ok ? COL.ok : COL.ko; c.lineWidth = 2; c.stroke()
        c.strokeStyle = ok ? COL.ok : COL.ko; c.lineWidth = 2
        c.beginPath()
        if (ok) { c.moveTo(mx - 4, my); c.lineTo(mx - 1, my + 3); c.lineTo(mx + 4, my - 3) }
        else { c.moveTo(mx - 3, my - 3); c.lineTo(mx + 3, my + 3); c.moveTo(mx + 3, my - 3); c.lineTo(mx - 3, my + 3) }
        c.stroke()
      }
      prev = cur
    }
    return v
  }

  function anchorOf(pat) {
    const r = Patterns.entryRow(pat)
    return { x: -4 * CELL, row: r, y: rowY(r), baseY: rowY(r), w: 4 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0 }
  }

  function drawPatterns() {
    const pat = selPattern()
    drawGridPatterns(ctx, pat)
    if (!pat) return
    // --- espace monde : tout le contenu du pattern est dessiné via une seule
    // --- transformation, cohérente avec s2wX/s2wY utilisées par la souris.
    const s = scale()
    ctx.save()
    ctx.scale(s, s)
    ctx.translate(-camX, 0)
    for (let i = 0; i < pat.decor.length; i++) {
      drawDecorEditor(ctx, pat.decor[i], selKind === 'decor' && selIdx === i, x => x, y => y, 1)
    }
    if (pat.walls) for (let i = 0; i < pat.walls.length; i++) {
      drawWallEditor(ctx, pat.walls[i], selKind === 'wall' && selIdx === i)
    }
    for (let i = 0; i < pat.platforms.length; i++) {
      drawPlatEditor(ctx, pat.platforms[i], selKind === 'plat' && selIdx === i)
    }
    for (let i = 0; i < pat.balls.length; i++) {
      drawBallEditor(ctx, pat.balls[i], selKind === 'ball' && selIdx === i)
    }
    ctx.restore()
    // --- retour espace écran : badges de validation ---
    const v = drawValidation(ctx, pat)
    // aperçu de placement (espace monde)
    if (mouse.inside && (tool === 'plat' || tool === 'ball' || tool === 'gold' || tool === 'wall')) {
      ctx.save()
      ctx.scale(s, s)
      ctx.translate(-camX, 0)
      ctx.globalAlpha = 0.45
      if (tool === 'plat') {
        const row = clampN(Math.round((mouse.wy - ROW0) / RS), 0, 4)
        drawPlatEditor(ctx, { x: snapCell(mouse.wx), row, cells: platCells, type: platType, spike: null, amp: 0, yOff: 0 }, false)
      } else if (tool === 'wall') {
        const row = clampN(Math.round((mouse.wy - ROW0) / RS), 0, 4)
        drawWallEditor(ctx, { x: snapCell(mouse.wx), row, cells: wallCells, kind: wallKind, spiked: true }, false)
      } else {
        const row = clampN(Math.round((mouse.wy - ROW0) / RS), 0, 4)
        const yOff = Math.round(mouse.wy - rowY(row))
        drawBallEditor(ctx, { x: Math.round(mouse.wx), row, yOff, gold: tool === 'gold' }, false)
      }
      ctx.restore()
    }
    // résumé
    const bad = v.jumps.filter(j => !j).length
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = bad ? COL.ko : COL.ok
    ctx.fillText(bad ? `✗ ${bad} saut(s) impossible(s)` : '✓ tous les sauts passent', 12, 22)
  }

  function drawChecker(c, x, y, w, h, size) {
    c.fillStyle = COL.frame
    c.fillRect(x, y, w, h)
    c.fillStyle = '#20264f'
    for (let yy = 0; yy < h; yy += size) {
      for (let xx = 0; xx < w; xx += size) {
        if (((xx / size) | 0) % 2 === ((yy / size) | 0) % 2) c.fillRect(x + xx, y + yy, size, size)
      }
    }
  }

  // Réplique fidèle du cadre du jeu (drawDamageWalls → drawFrameEdges) :
  // mêmes bandes de damage sur les 3 côtés, même ordre, mêmes géométries.
  function drawLayout() {
    layoutTransform()
    const { s } = fitLayout
    ctx.fillStyle = '#10142e'; ctx.fillRect(0, 0, cv.clientWidth, cv.clientHeight)
    ctx.save()
    ctx.translate(fitLayout.ox, fitLayout.oy); ctx.scale(s, s)
    ctx.imageSmoothingEnabled = false
    const L = Patterns.getLayout()
    const walls = L.walls

    // fond + évocation du parallax
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, VW, VH)
    ctx.fillStyle = COL.bgD
    ctx.fillRect(40, 60, 80, 120); ctx.fillRect(VW - 140, 90, 90, 110)
    // décor posé (derrière le cadre, comme en jeu)
    for (let i = 0; i < L.decor.length; i++) {
      const d = L.decor[i]
      drawDecorEditor(ctx, d, selKind === 'decor' && selIdx === i, x => x, y => y, 1)
    }

    // 1) bandes de damage unifiées : plafond / gauche / droite (drawDamageWalls)
    drawDamageBand(ctx, 0, 0, VW, walls.ceil, 'bottom')
    drawDamageBand(ctx, 0, walls.ceil, walls.left, VH - walls.ceil, 'right')
    drawDamageBand(ctx, VW - walls.right, walls.ceil, walls.right, VH - walls.ceil, 'left')

    // 2) bas du cadre (zone de chute) — même bande bedrock rouge (drawFrameEdges)
    drawDamageBand(ctx, 0, VH - 8, VW, 8, null)

    // 5) lignes de danger (aide à l'édition) + poignées
    ctx.globalAlpha = 0.55
    ctx.fillStyle = COL.ko
    ctx.fillRect(0, walls.ceil - 1, VW, 2)
    ctx.fillRect(walls.left, walls.ceil, 2, VH - walls.ceil)
    ctx.fillRect(VW - walls.right - 2, walls.ceil, 2, VH - walls.ceil)
    ctx.globalAlpha = 1
    drawGrip(ctx, VW / 2, walls.ceil)
    drawGrip(ctx, walls.left, VH / 2)
    drawGrip(ctx, VW - walls.right, VH / 2)
    ctx.font = '10px monospace'; ctx.fillStyle = COL.white
    ctx.fillText('plafond ' + Math.round(walls.ceil), VW / 2 + 10, walls.ceil + 4)
    ctx.fillText('gauche ' + Math.round(walls.left), walls.left + 6, VH / 2 + 4)
    ctx.fillText('droite ' + Math.round(walls.right), VW - walls.right - 60, VH / 2 + 4)
    ctx.restore()

    // 6) zone de chute : sous le cadre, hors du monde (affichage informatif)
    const fy = fitLayout.oy + VH * s
    const fh = Math.min(30 * s, cv.clientHeight - fy - 4)
    if (fh > 8) {
      ctx.save()
      ctx.beginPath(); ctx.rect(fitLayout.ox, fy, VW * s, fh); ctx.clip()
      ctx.fillStyle = 'rgba(226,59,59,.10)'
      ctx.fillRect(fitLayout.ox, fy, VW * s, fh)
      ctx.strokeStyle = 'rgba(226,59,59,.35)'; ctx.lineWidth = 1
      for (let x = -fh; x < VW * s + fh; x += 12) {
        ctx.beginPath()
        ctx.moveTo(fitLayout.ox + x, fy + fh); ctx.lineTo(fitLayout.ox + x + fh, fy)
        ctx.stroke()
      }
      ctx.restore()
      ctx.font = 'bold ' + Math.max(9, Math.round(10 * s)) + 'px monospace'
      ctx.fillStyle = 'rgba(226,59,59,.7)'
      ctx.fillText("ZONE DE CHUTE — mort sous l'écran", fitLayout.ox + 6, fy + fh - 4)
    }
    // cadre
    ctx.strokeStyle = COL.black; ctx.lineWidth = 3
    ctx.strokeRect(fitLayout.ox - 1, fitLayout.oy - 1, VW * s + 2, VH * s + 2)
  }

  // Bande de danger unifiée — copie de drawDamageBand du jeu :
  // texture bedrock teintée rouge + liseré vif sur la frontière létale.
  function drawDamageBand(c, x, y, w, h, edge) {
    if (w <= 0 || h <= 0) return
    c.save()
    c.beginPath(); c.rect(x, y, w, h); c.clip()
    const vb = Sprites.get('voidBand')
    if (vb && vb.width && vb.complete) {
      if (!drawDamageBand.pat || drawDamageBand.patImg !== vb) {
        drawDamageBand.patImg = vb
        try { drawDamageBand.pat = c.createPattern(vb, 'repeat') } catch (e) { drawDamageBand.pat = null }
      }
      if (drawDamageBand.pat) {
        c.fillStyle = drawDamageBand.pat
        c.fillRect(x, y, w, h)
      } else {
        c.drawImage(vb, 0, 0, 960, 230, x, y, w, h)
      }
    } else {
      c.fillStyle = COL.spikeD
      c.fillRect(x, y, w, h)
    }
    c.fillStyle = 'rgba(226,59,59,0.5)'
    c.fillRect(x, y, w, h)
    c.restore()
    if (edge) {
      c.fillStyle = '#ff7b6e'
      if (edge === 'bottom') c.fillRect(x, y + h - 2, w, 2)
      else if (edge === 'right') c.fillRect(x + w - 2, y, 2, h)
      else if (edge === 'left') c.fillRect(x, y, 2, h)
    }
  }

  function drawGrip(c, x, y) {
    c.fillStyle = COL.gold
    c.fillRect(x - 5, y - 5, 10, 10)
    c.strokeStyle = COL.black; c.lineWidth = 2
    c.strokeRect(x - 5, y - 5, 10, 10)
  }

  function draw() {
    const dpr = window.devicePixelRatio || 1
    const cw = cv.clientWidth, chh = cv.clientHeight
    if (cv.width !== cw * dpr || cv.height !== chh * dpr) {
      cv.width = cw * dpr; cv.height = chh * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (mode === 'patterns') drawPatterns()
    else drawLayout()
    if (flashT > 0) {
      flashT -= 1 / 60
      if (flashT <= 0) { statusEl.textContent = ''; statusEl.className = '' }
    }
    requestAnimationFrame(draw)
  }

  // ---------- panneau propriétés ----------
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') }

  function renderProps() {
    if (mode === 'layout') return renderPropsLayout()
    const pat = selPattern()
    if (!pat) {
      propsEl.innerHTML = `<div class="empty">Crée un pattern avec « + Nouveau »,<br>ou copie le pool par défaut pour l'éditer.<br><br>• molette : défiler<br>• clic : placer / sélectionner<br>• Suppr : effacer la sélection</div>`
      return
    }
    const v = Patterns.validatePatternJumps(pat)
    const bad = v.jumps.filter(j => !j).length
    let html = `<h3>Pattern</h3>
      <div class="row"><label>Nom</label><input type="text" id="pName" value="${esc(pat.name)}"/></div>
      <div class="row"><label>Difficulté</label>
        <select id="pTier">${[1, 2, 3, 4, 5].map(t => `<option value="${t}" ${pat.difficulty === t ? 'selected' : ''}>T${t} — ${['très facile', 'facile', 'moyen', 'dur', 'très dur'][t - 1]}</option>`).join('')}</select>
      </div>
      <div class="row"><label>Entrée r</label>
        <select id="pEntry">${[0, 1, 2, 3, 4].map(r => `<option value="${r}" ${Patterns.entryRow(pat) === r ? 'selected' : ''}>ligne ${r}</option>`).join('')}</select>
      </div>
      <div class="row"><span class="badge ${bad ? 'ko' : 'ok'}">${bad ? bad + ' saut(s) KO' : 'Chaîne valide'}</span>
      <span style="color:var(--dim);font-size:11px">${pat.platforms.length} plat. · ${(pat.walls || []).length} mur(s) · ${pat.balls.length} billes · ${Patterns.patternWidth(pat)}px</span></div>
      <h3>Objet sélectionné</h3>`
    if (selKind === 'wall' && pat.walls && pat.walls[selIdx]) {
      const wl = pat.walls[selIdx]
      html += `<div class="row"><label>Type</label>
        <select id="oWKind"><option value="ground" ${wl.kind === 'ground' ? 'selected' : ''}>Colonne (sol → pointe)</option><option value="ceil" ${wl.kind === 'ceil' ? 'selected' : ''}>Stalactite (plafond → pointe)</option></select></div>
        <div class="row"><label>Largeur</label><input type="number" id="oWCells" min="1" max="3" value="${wl.cells}"/><span class="val">${wl.cells * CELL}px</span></div>
        <div class="row"><label>Pointe r</label><select id="oWRow">${[0, 1, 2, 3, 4].map(r => `<option value="${r}" ${wl.row === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="row"><label>X</label><input type="number" id="oWX" step="${CELL}" value="${wl.x}"/><span class="val">px</span></div>
        <div class="chk"><input type="checkbox" id="oWSpiked" ${wl.spiked ? 'checked' : ''}/> flancs piqués (mortels)</div>
        <div class="note">Sommet ${wl.kind === 'ground' ? 'aterrissable' : 'bloquant'} — les sauts qui traversent le corps du mur sont marqués ✗.</div>`
    } else if (selKind === 'plat' && pat.platforms[selIdx]) {
      const p = pat.platforms[selIdx]
      html += `<div class="row"><label>Type</label>
        <select id="oType">${Patterns.TYPES.map(t => `<option value="${t}" ${p.type === t ? 'selected' : ''}>${TYPE_LABEL[t]}</option>`).join('')}</select></div>
        <div class="row"><label>Largeur</label><input type="number" id="oCells" min="1" max="12" value="${p.cells}"/><span class="val">${p.cells * CELL}px</span></div>
        <div class="row"><label>Ligne</label><select id="oRow">${[0, 1, 2, 3, 4].map(r => `<option value="${r}" ${p.row === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="row"><label>X</label><input type="number" id="oX" step="${CELL}" value="${p.x}"/><span class="val">px</span></div>`
      if (p.type === 'dynamic') {
        html += `<div class="row"><label>Ampleur</label><input type="range" id="oAmp" min="0" max="40" value="${p.amp || 0}"/><span class="val" id="oAmpV">${p.amp || 0}</span></div>
        <div class="row"><label>Vitesse</label><input type="range" id="oSpd" min="5" max="30" value="${Math.round((p.spd || 1.5) * 10)}"/><span class="val" id="oSpdV">${(p.spd || 1.5).toFixed(1)}</span></div>
        <div class="row"><label>Y offset</label><input type="number" id="oYOff" value="${p.yOff || 0}"/></div>`
      }
      const gPlat = Patterns.getLayout().plat
      if (p.type === 'crumble') {
        const gv = p.crumbleT != null ? p.crumbleT : gPlat.crumbleT
        html += `<div class="chk"><input type="checkbox" id="oCrG" ${p.crumbleT == null ? 'checked' : ''}/> casse après : réglage global (VUE)</div>
        <div class="row"><label>Casse après</label><input type="range" id="oCrT" min="2" max="20" value="${Math.round(gv * 10)}" ${p.crumbleT == null ? 'disabled' : ''}/><span class="val" id="oCrTV">${gv.toFixed(1)} s</span></div>`
      }
      if (p.type === 'dynamic') {
        const gv = p.dynLife != null ? p.dynLife : gPlat.dynLife
        html += `<div class="chk"><input type="checkbox" id="oDlG" ${p.dynLife == null ? 'checked' : ''}/> vie après pose : réglage global (VUE)</div>
        <div class="row"><label>Vie après</label><input type="range" id="oDl" min="10" max="100" step="5" value="${Math.round(gv * 10)}" ${p.dynLife == null ? 'disabled' : ''}/><span class="val" id="oDlV">${gv.toFixed(1)} s</span></div>`
      }
      html += `<div class="chk"><input type="checkbox" id="oSpike" ${p.spike ? 'checked' : ''}/> pics rouges</div>`
      if (p.spike) {
        html += `<div class="row"><label>Début</label><input type="range" id="oSa" min="0" max="90" value="${Math.round(p.spike.a * 100)}"/><span class="val" id="oSaV">${Math.round(p.spike.a * 100)}%</span></div>
        <div class="row"><label>Fin</label><input type="range" id="oSb" min="10" max="100" value="${Math.round(p.spike.b * 100)}"/><span class="val" id="oSbV">${Math.round(p.spike.b * 100)}%</span></div>`
      }
    } else if (selKind === 'ball' && pat.balls[selIdx]) {
      const b = pat.balls[selIdx]
      html += `<div class="chk"><input type="checkbox" id="oGold" ${b.gold ? 'checked' : ''}/> bille dorée (50 pts)</div>
      <div class="row"><label>X</label><input type="number" id="oBX" step="8" value="${b.x}"/></div>
      <div class="row"><label>Ligne</label><select id="oBRow">${[0, 1, 2, 3, 4].map(r => `<option value="${r}" ${b.row === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="row"><label>Y offset</label><input type="number" id="oBYOff" value="${b.yOff}"/></div>`
    } else if (selKind === 'decor' && pat.decor[selIdx]) {
      const d = pat.decor[selIdx]
      html += `<div class="row"><label>Sprite</label><select id="oDSprite">${DECOR_SPRITES.map(k => `<option value="${k}" ${d.sprite === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div class="row"><label>X</label><input type="number" id="oDX" value="${d.x}"/></div>
      <div class="row"><label>Y</label><input type="number" id="oDY" value="${d.y}"/></div>
      <div class="row"><label>Largeur</label><input type="number" id="oDW" min="10" value="${d.w}"/></div>`
    } else {
      html += `<div class="note">Aucun objet sélectionné. Outil « Flèche » pour déplacer, gomme pour supprimer. Flèches du clavier : ajustement fin.</div>`
    }
    propsEl.innerHTML = html
    bindProps(pat)
  }

  function bindProps(pat) {
    if (!pat) return
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn) }
    on('pName', 'input', e => { pat.name = e.target.value; refreshList(false); persistSilent() })
    on('pTier', 'change', e => { pat.difficulty = parseInt(e.target.value, 10); refreshList(false); persistSilent() })
    on('pEntry', 'change', e => { pat.entry = { row: parseInt(e.target.value, 10) }; persistSilent() })
    on('oType', 'change', e => { pat.platforms[selIdx].type = e.target.value; persist(); renderProps() })
    on('oWKind', 'change', e => { pat.walls[selIdx].kind = e.target.value; persist(); renderProps() })
    on('oWCells', 'change', e => { pat.walls[selIdx].cells = clampN(parseInt(e.target.value, 10) || 1, 1, 3); persist(); renderProps() })
    on('oWRow', 'change', e => { pat.walls[selIdx].row = parseInt(e.target.value, 10); persist() })
    on('oWX', 'change', e => { pat.walls[selIdx].x = Math.max(CELL, parseInt(e.target.value, 10) || CELL); persist() })
    on('oWSpiked', 'change', e => { pat.walls[selIdx].spiked = e.target.checked; persist() })
    on('oCells', 'change', e => { pat.platforms[selIdx].cells = clampN(parseInt(e.target.value, 10) || 1, 1, 12); persist(); renderProps() })
    on('oRow', 'change', e => { pat.platforms[selIdx].row = parseInt(e.target.value, 10); persist() })
    on('oX', 'change', e => { pat.platforms[selIdx].x = Math.max(CELL, parseInt(e.target.value, 10) || CELL); persist() })
    on('oAmp', 'input', e => {
      pat.platforms[selIdx].amp = parseInt(e.target.value, 10)
      const v = document.getElementById('oAmpV'); if (v) v.textContent = e.target.value
      persistSilent()
    })
    on('oSpd', 'input', e => {
      pat.platforms[selIdx].spd = parseInt(e.target.value, 10) / 10
      const v = document.getElementById('oSpdV'); if (v) v.textContent = (parseInt(e.target.value, 10) / 10).toFixed(1)
      persistSilent()
    })
    on('oYOff', 'change', e => { pat.platforms[selIdx].yOff = parseInt(e.target.value, 10) || 0; persist() })
    on('oCrG', 'change', e => {
      const p = pat.platforms[selIdx]
      if (e.target.checked) delete p.crumbleT
      else p.crumbleT = Patterns.getLayout().plat.crumbleT
      persist(); renderProps()
    })
    on('oCrT', 'input', e => {
      const p = pat.platforms[selIdx]
      p.crumbleT = parseInt(e.target.value, 10) / 10
      const v = document.getElementById('oCrTV'); if (v) v.textContent = p.crumbleT.toFixed(1) + ' s'
      persistSilent()
    })
    on('oDlG', 'change', e => {
      const p = pat.platforms[selIdx]
      if (e.target.checked) delete p.dynLife
      else p.dynLife = Patterns.getLayout().plat.dynLife
      persist(); renderProps()
    })
    on('oDl', 'input', e => {
      const p = pat.platforms[selIdx]
      p.dynLife = parseInt(e.target.value, 10) / 10
      const v = document.getElementById('oDlV'); if (v) v.textContent = p.dynLife.toFixed(1) + ' s'
      persistSilent()
    })
    on('oSpike', 'change', e => {
      const p = pat.platforms[selIdx]
      p.spike = e.target.checked ? { a: 0.25, b: 0.75 } : null
      persist(); renderProps()
    })
    const spikeUpd = () => {
      const p = pat.platforms[selIdx]
      if (!p.spike) return
      const a = parseInt(document.getElementById('oSa').value, 10)
      const b = parseInt(document.getElementById('oSb').value, 10)
      p.spike = { a: Math.min(a, b - 5) / 100, b: Math.max(b, a + 5) / 100 }
      const va = document.getElementById('oSaV'), vb = document.getElementById('oSbV')
      if (va) va.textContent = Math.round(p.spike.a * 100) + '%'
      if (vb) vb.textContent = Math.round(p.spike.b * 100) + '%'
      persistSilent()
    }
    on('oSa', 'input', spikeUpd); on('oSb', 'input', spikeUpd)
    on('oGold', 'change', e => { pat.balls[selIdx].gold = e.target.checked; persist() })
    on('oBX', 'change', e => { pat.balls[selIdx].x = parseInt(e.target.value, 10) || 0; persist() })
    on('oBRow', 'change', e => { pat.balls[selIdx].row = parseInt(e.target.value, 10); persist() })
    on('oBYOff', 'change', e => { pat.balls[selIdx].yOff = parseInt(e.target.value, 10) || 0; persist() })
    on('oDSprite', 'change', e => { pat.decor[selIdx].sprite = e.target.value; persist(); renderProps() })
    on('oDX', 'change', e => { pat.decor[selIdx].x = parseInt(e.target.value, 10) || 0; persist() })
    on('oDY', 'change', e => { pat.decor[selIdx].y = parseInt(e.target.value, 10) || 0; persist() })
    on('oDW', 'change', e => { pat.decor[selIdx].w = Math.max(10, parseInt(e.target.value, 10) || 60); persist() })
  }
  let silentT = 0
  function persistSilent() {
    Patterns.setPatternsRaw(patterns)
    refreshList(false)
    statusEl.textContent = 'Sauvegardé'
    statusEl.className = 'ok'
    flashT = 1.2
  }

  function renderPropsLayout() {
    const L = Patterns.getLayout()
    const w = L.walls
    let html = `<h3>Murs de damage</h3>
    <div class="row"><label>Plafond</label><input type="range" id="wCeil" min="8" max="90" value="${w.ceil}"/><span class="val" id="wCeilV">${w.ceil}</span></div>
    <div class="row"><label>Gauche</label><input type="range" id="wLeft" min="4" max="60" value="${w.left}"/><span class="val" id="wLeftV">${w.left}</span></div>
    <div class="row"><label>Droite</label><input type="range" id="wRight" min="4" max="60" value="${w.right}"/><span class="val" id="wRightV">${w.right}</span></div>
    <div class="note">Glisse les poignées dorées directement sur la vue. Ces hitboxes s'appliquent au jeu immédiatement.</div>
    <h3>Plateformes (global)</h3>
    <div class="row"><label>Cassable</label><input type="range" id="pCrumb" min="2" max="20" value="${Math.round(L.plat.crumbleT * 10)}"/><span class="val" id="pCrumbV">${L.plat.crumbleT.toFixed(1)} s</span></div>
    <div class="row"><label>Dyn. vie</label><input type="range" id="pDynLife" min="10" max="100" step="5" value="${Math.round(L.plat.dynLife * 10)}"/><span class="val" id="pDynLifeV">${L.plat.dynLife.toFixed(1)} s</span></div>
    <div class="row"><label>Dyn. vit.</label><input type="range" id="pSpdMul" min="5" max="20" value="${Math.round(L.plat.spdMul * 10)}"/><span class="val" id="pSpdMulV">${L.plat.spdMul.toFixed(1)} ×</span></div>
    <div class="note">Cassable : délai avant casse. Dynamique : durée de vie après atterrissage et vitesse d'oscillation globale. Une plateforme peut surcharger ces valeurs (onglet PATTERNS, case « réglage global »).</div>
    <h3>Décor</h3>`
    if (selKind === 'decor' && L.decor[selIdx]) {
      const d = L.decor[selIdx]
      html += `<div class="row"><label>Sprite</label><select id="oDSprite">${DECOR_SPRITES.map(k => `<option value="${k}" ${d.sprite === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div class="row"><label>X</label><input type="number" id="oDX" value="${d.x}"/></div>
      <div class="row"><label>Y</label><input type="number" id="oDY" value="${d.y}"/></div>
      <div class="row"><label>Largeur</label><input type="number" id="oDW" min="10" value="${d.w}"/></div>
      <div class="row"><button id="oDel" class="danger">Supprimer ce décor</button></div>`
    } else {
      html += `<div class="note">Outil « Décor » : clique pour poser un asset. Outil « Flèche » : déplacer. Molette + Ctrl : zoom.</div>
      <div class="row"><button id="btnResetL">Réinitialiser les murs</button></div>`
    }
    propsEl.innerHTML = html
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn) }
    const wallUpd = () => {
      w.ceil = parseInt(document.getElementById('wCeil').value, 10)
      w.left = parseInt(document.getElementById('wLeft').value, 10)
      w.right = parseInt(document.getElementById('wRight').value, 10)
      Patterns.setLayout(L)
      Phys.setWalls(w)
      for (const [id, key] of [['wCeilV', 'ceil'], ['wLeftV', 'left'], ['wRightV', 'right']]) {
        const v = document.getElementById(id); if (v) v.textContent = w[key]
      }
      persistSilent()
    }
    on('wCeil', 'input', wallUpd); on('wLeft', 'input', wallUpd); on('wRight', 'input', wallUpd)
    const platUpd = () => {
      L.plat.crumbleT = parseInt(document.getElementById('pCrumb').value, 10) / 10
      L.plat.dynLife = parseInt(document.getElementById('pDynLife').value, 10) / 10
      L.plat.spdMul = parseInt(document.getElementById('pSpdMul').value, 10) / 10
      Patterns.setLayout(L)
      const vc = document.getElementById('pCrumbV'), vd = document.getElementById('pDynLifeV'), vs = document.getElementById('pSpdMulV')
      if (vc) vc.textContent = L.plat.crumbleT.toFixed(1) + ' s'
      if (vd) vd.textContent = L.plat.dynLife.toFixed(1) + ' s'
      if (vs) vs.textContent = L.plat.spdMul.toFixed(1) + ' ×'
      persistSilent()
    }
    on('pCrumb', 'input', platUpd); on('pDynLife', 'input', platUpd); on('pSpdMul', 'input', platUpd)
    on('oDSprite', 'change', e => { L.decor[selIdx].sprite = e.target.value; Patterns.setLayout(L); persistSilent(); renderProps() })
    on('oDX', 'change', e => { L.decor[selIdx].x = parseInt(e.target.value, 10) || 0; Patterns.setLayout(L); persistSilent() })
    on('oDY', 'change', e => { L.decor[selIdx].y = parseInt(e.target.value, 10) || 0; Patterns.setLayout(L); persistSilent() })
    on('oDW', 'change', e => { L.decor[selIdx].w = Math.max(10, parseInt(e.target.value, 10) || 60); Patterns.setLayout(L); persistSilent() })
    on('oDel', 'click', () => { L.decor.splice(selIdx, 1); selKind = null; selIdx = -1; Patterns.setLayout(L); persistSilent(); renderProps() })
    on('btnResetL', 'click', () => {
      Patterns.setLayout({ walls: { ceil: TIP_T, left: TIP_L, right: SPIKE_W }, decor: L.decor })
      Phys.setWalls(Patterns.getLayout().walls)
      renderProps(); flash('Murs réinitialisés')
    })
  }

  // ---------- liste ----------
  function refreshList(rerenderProps) {
    if (rerenderProps !== false) renderProps()
    const defActive = Patterns.usingDefaults()
    storeInfoEl.textContent = defActive
      ? 'Jeu : pool PAR DÉFAUT (' + Patterns.defaults().length + ' sections) — tes patterns remplaceront le pool dès qu\'il en contient.'
      : 'Jeu : TON pool (' + patterns.length + ' sections)'
    if (!patterns.length) {
      listEl.innerHTML = `<div class="hint">Aucun pattern personnel.<br><br>Le jeu tourne avec le <b>pool par défaut</b> (20 sections validées).<br><br>« + Nouveau » pour créer, ou « Pool par défaut » pour copier les 20 sections et les éditer.</div>`
      return
    }
    listEl.innerHTML = patterns.map((p, i) => {
      const t = clampN(p.difficulty | 0, 1, 5)
      const v = Patterns.validatePatternJumps(p)
      const bad = v.jumps.filter(j => !j).length
      return `<div class="item ${p.id === selId ? 'sel' : ''}" data-i="${i}">
        <div class="tier" style="background:${TIER_COLORS[t - 1]}">${t}</div>
        <div class="nm"><b>${esc(p.name || 'Sans nom')}</b><span>${p.platforms.length} plat · ${Patterns.patternWidth(p)}px ${bad ? '· <span style="color:var(--red)">' + bad + ' KO</span>' : ' · ✓'}</span></div>
        <div class="mini"><button data-act="dup" data-i="${i}" title="Dupliquer">⧉</button><button data-act="del" data-i="${i}" class="danger" title="Supprimer">✕</button></div>
      </div>`
    }).join('')
  }

// ---------- actions ----------
  function selectPattern(id) {
    selId = id
    selKind = null
    selIdx = -1
    refreshList()
  }

  function newPattern() {
    const p = Patterns.emptyPattern('Pattern ' + (patterns.length + 1))
    p.difficulty = 1
    patterns.push(p)
    Patterns.setPatternsRaw(patterns)
    selectPattern(p.id)
    flash('Pattern créé')
  }

  function duplicatePattern() {
    const p = selPattern()
    if (!p) return
    const c = JSON.parse(JSON.stringify(p))
    c.id = Patterns.uid()
    c.name = p.name + ' (copie)'
    patterns.push(c)
    Patterns.setPatternsRaw(patterns)
    selectPattern(c.id)
    flash('Dupliqué')
  }

  function deletePattern() {
    const p = selPattern()
    if (!p) return
    if (!confirm('Supprimer « ' + p.name + ' » ?')) return
    patterns = patterns.filter(q => q.id !== p.id)
    Patterns.setPatternsRaw(patterns)
    patterns = Patterns.getPatterns()
    selId = patterns.length ? patterns[Math.max(0, patterns.length - 1)].id : null
    refreshList()
    flash('Supprimé')
  }

  function installDefaults() {
    if (patterns.length && !confirm('Ajouter les 20 sections du pool par défaut à ta liste ?')) return
    const n = Patterns.installDefaults()
    patterns = Patterns.getPatterns()
    refreshList()
    flash(n + ' sections du pool par défaut copiées')
  }

  function exportJson() {
    const data = Patterns.exportAll()
    const blob = new Blob([data], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'slime-patterns.json'
    a.click()
    URL.revokeObjectURL(a.href)
    flash('Exporté : slime-patterns.json')
  }

  function doImport(text, sourceName) {
    const res = Patterns.importData(text)
    if (!res.ok) { flash('Import impossible : ' + res.error, true); return }
    const n = res.data.patterns.length
    const mode = patterns.length && confirm('OK pour ' + n + ' pattern(s) trouvé(s) dans « ' + sourceName + ' ».\n\nRemplacer ta liste actuelle ?\n• OK = Remplacer\n• Annuler = Fusionner (ajouter les nouveaux)') ? 'replace' : 'merge'
    Patterns.applyImport(res, mode)
    patterns = Patterns.getPatterns()
    refreshList()
    flash(res.errors.length ? 'Importé avec ' + res.errors.length + ' rejet(s)' : 'Importé : ' + n + ' pattern(s)')
    if (res.errors.length) console.warn('Rejets :', res.errors)
  }

  function copyCode() {
    const code = Patterns.exportCode()
    const done = () => flash('Code copié — colle-le sur l\'autre machine')
    const fallback = () => {
      const ta = document.createElement('textarea')
      ta.value = code
      document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy'); done() } catch (e) { prompt('Copie ce code :', code) }
      document.body.removeChild(ta)
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, fallback)
    else fallback()
  }

  function pasteCode() {
    const use = t => { if (t) doImport(t, 'code collé') }
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(use, () => {
        const t = prompt('Colle le code ici :')
        use(t)
      })
    } else {
      const t = prompt('Colle le code ici :')
      use(t)
    }
  }

  function playtest() {
    const p = selPattern()
    if (!p) { flash('Sélectionne un pattern à tester', true); return }
    if (!Patterns.validatePatternJumps(p).ok && !confirm('Ce pattern contient des sauts impossibles. Tester quand même ?')) return
    window.open('index.html?pattern=' + encodeURIComponent(Patterns.patternToCode(p)), '_blank')
  }

  // ---------- toolbar ----------
  function buildToolbar() {
    const tools = [
      ['select', 'Flèche', 'Sélectionner / déplacer (S)'],
      ['plat', 'Plateforme', 'Poser une plateforme (A) — 1-6 : type'],
      ['wall', 'Mur', 'Poser un mur vertical (W)'],
      ['ball', 'Bille', 'Poser une bille (B)'],
      ['gold', 'Bille or', 'Poser une bille dorée (G)'],
      ['decor', 'Décor', 'Poser un asset (D)'],
      ['erase', 'Gomme', 'Supprimer (E)']
    ]
    toolbarEl.innerHTML = `
      <div class="grp">${tools.map(t => `<button class="tool" data-tool="${t[0]}" title="${t[2]}">${t[1]}</button>`).join('')}</div>
      <div class="grp" id="grpType">
        <select id="tType">${Patterns.TYPES.map(t => `<option value="${t}">${TYPE_LABEL[t]}</option>`).join('')}</select>
        <button id="tCellsM" title="Moins large">−</button><span id="tCellsV" style="min-width:46px;text-align:center;font-size:12px">3 cases</span><button id="tCellsP" title="Plus large">+</button>
      </div>
      <div class="grp" id="grpWall">
        <select id="tWallKind"><option value="ground">Colonne (sol)</option><option value="ceil">Stalactite (plafond)</option></select>
        <button id="tWallM" title="Moins large">−</button><span id="tWallV" style="min-width:36px;text-align:center;font-size:12px">1 case</span><button id="tWallP" title="Plus large">+</button>
      </div>
      <div class="grp" id="grpDecor">
        <select id="tSprite">${DECOR_SPRITES.map(k => `<option value="${k}">${k}</option>`).join('')}</select>
      </div>
      <div class="grp">
        <button id="tZoomM">−</button><span id="tZoomV" style="min-width:44px;text-align:center;font-size:12px">100%</span><button id="tZoomP">+</button>
        <button id="tFit" title="Recentrer sur le début">Recadrer</button>
      </div>
      <div class="grp" style="border:none">
        <span style="color:var(--dim);font-size:11px" id="tbHint"></span>
      </div>`
    toolbarEl.querySelectorAll('[data-tool]').forEach(b => {
      b.addEventListener('click', () => setTool(b.dataset.tool))
    })
    document.getElementById('tType').addEventListener('change', e => { platType = e.target.value })
    document.getElementById('tCellsM').addEventListener('click', () => setCells(platCells - 1))
    document.getElementById('tCellsP').addEventListener('click', () => setCells(platCells + 1))
    document.getElementById('tWallKind').addEventListener('change', e => { wallKind = e.target.value })
    document.getElementById('tWallM').addEventListener('click', () => { wallCells = clampN(wallCells - 1, 1, 3); updWallV() })
    document.getElementById('tWallP').addEventListener('click', () => { wallCells = clampN(wallCells + 1, 1, 3); updWallV() })
    document.getElementById('tSprite').addEventListener('change', e => { decorSprite = e.target.value })
    document.getElementById('tZoomM').addEventListener('click', () => setZoom(zoom - 0.25))
    document.getElementById('tZoomP').addEventListener('click', () => setZoom(zoom + 0.25))
    document.getElementById('tFit').addEventListener('click', () => { camX = -6 * CELL; setZoom(1) })
    setTool('select')
    setCells(3)
  }

  function setTool(t) {
    tool = t
    toolbarEl.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t))
    const grpType = document.getElementById('grpType')
    const grpWall = document.getElementById('grpWall')
    const grpDecor = document.getElementById('grpDecor')
    grpType.style.display = (t === 'plat') ? 'flex' : 'none'
    grpWall.style.display = (t === 'wall') ? 'flex' : 'none'
    grpDecor.style.display = (t === 'decor') ? 'flex' : 'none'
    const hints = {
      select: 'Clic : sélectionner · glisser : déplacer · Suppr : effacer · flèches : ajuster',
      plat: 'Clic : poser · 1-6 : type de plateforme',
      wall: 'Clic : poser · glisser : hauteur (ligne de la pointe) · piques réglables à droite',
      ball: 'Clic : poser une bille',
      gold: 'Clic : poser une bille dorée',
      decor: 'Clic : poser l\'asset choisi',
      erase: 'Clic sur un élément : le supprimer'
    }
    document.getElementById('tbHint').textContent = mode === 'layout' ? 'Glisse les poignées dorées pour ajuster les murs' : hints[t]
    cv.style.cursor = t === 'select' ? 'default' : 'crosshair'
  }

  function updWallV() {
    const v = document.getElementById('tWallV')
    if (v) v.textContent = wallCells + ' case' + (wallCells > 1 ? 's' : '')
  }

  function setCells(n) {
    platCells = clampN(n, 1, 12)
    const v = document.getElementById('tCellsV')
    if (v) v.textContent = platCells + ' case' + (platCells > 1 ? 's' : '')
  }

  function setZoom(z) {
    zoom = clampN(Math.round(z * 4) / 4, 0.5, 4)
    const v = document.getElementById('tZoomV')
    if (v) v.textContent = Math.round(zoom * 100) + '%'
  }

  function setMode(m) {
    mode = m
    document.getElementById('tabPatterns').classList.toggle('on', m === 'patterns')
    document.getElementById('tabLayout').classList.toggle('on', m === 'layout')
    selKind = null
    selIdx = -1
    setTool(mode === 'layout' ? 'select' : tool)
    renderProps()
  }

  // ---------- événements canvas ----------
  function canvasPos(e) {
    const r = cv.getBoundingClientRect()
    return { sx: e.clientX - r.left, sy: e.clientY - r.top }
  }

  function onDown(e) {
    const { sx, sy } = canvasPos(e)
    if (mode === 'layout') return onDownLayout(sx, sy)
    const pat = selPattern()
    const wx = s2wX(sx), wy = s2wY(sy)
    if (!pat) return
    if (e.button === 1 || e.button === 2) { drag = { pan: true, sx }; return }
    if (tool === 'erase') {
      const h = hitTest(wx, wy, pat)
      if (h) {
        if (h.kind === 'plat') pat.platforms.splice(h.idx, 1)
        else if (h.kind === 'ball') pat.balls.splice(h.idx, 1)
        else if (h.kind === 'decor') pat.decor.splice(h.idx, 1)
        else if (h.kind === 'wall') pat.walls.splice(h.idx, 1)
        selKind = null; selIdx = -1
        persist(); renderProps()
      }
      return
    }
    if (tool === 'wall') {
      if (!pat.walls) pat.walls = []
      const row = clampN(Math.round((wy - ROW0) / RS), 0, 4)
      const wl = { x: snapCell(wx), row, cells: wallCells, kind: wallKind, spiked: true }
      pat.walls.push(wl)
      selKind = 'wall'; selIdx = pat.walls.length - 1
      persist(); renderProps()
      drag = { kind: 'wall', idx: selIdx, dx: 0, dy: 0 }
      return
    }
    if (tool === 'plat') {
      const row = clampN(Math.round((wy - ROW0) / RS), 0, 4)
      const p = { x: snapCell(wx), row, cells: platCells, type: platType, yOff: 0, amp: platType === 'dynamic' ? 20 : 0, spd: platType === 'dynamic' ? 1.5 : 0, spike: null }
      pat.platforms.push(p)
      selKind = 'plat'; selIdx = pat.platforms.length - 1
      persist(); renderProps()
      drag = { kind: 'plat', idx: selIdx, dx: 0, dy: 0 }
      return
    }
    if (tool === 'ball' || tool === 'gold') {
      const row = clampN(Math.round((wy - ROW0) / RS), 0, 4)
      const b = { x: Math.round(wx), row, yOff: Math.round(wy - rowY(row)), gold: tool === 'gold' }
      pat.balls.push(b)
      selKind = 'ball'; selIdx = pat.balls.length - 1
      persist(); renderProps()
      drag = { kind: 'ball', idx: selIdx, dx: 0, dy: 0 }
      return
    }
    if (tool === 'decor') {
      const d = { sprite: decorSprite, x: Math.round(wx), y: Math.round(wy), w: 60 }
      pat.decor.push(d)
      selKind = 'decor'; selIdx = pat.decor.length - 1
      persist(); renderProps()
      drag = { kind: 'decor', idx: selIdx, dx: 0, dy: 0 }
      return
    }
    // select
    const h = hitTest(wx, wy, pat)
    if (h) {
      selKind = h.kind; selIdx = h.idx
      if (h.kind === 'anchor') { drag = { kind: 'anchor' } }
      else {
        let ox = 0, oy = 0
        if (h.kind === 'plat') { ox = pat.platforms[h.idx].x - wx; oy = 0 }
        else if (h.kind === 'ball') { ox = pat.balls[h.idx].x - wx; oy = pat.balls[h.idx].yOff - (wy - rowY(pat.balls[h.idx].row)) }
        else if (h.kind === 'decor') { ox = pat.decor[h.idx].x - wx; oy = pat.decor[h.idx].y - wy }
        drag = { kind: h.kind, idx: h.idx, dx: ox, dy: oy }
      }
      refreshList(false); renderProps()
    } else {
      drag = { pan: true, sx }
    }
  }

  function onDownLayout(sx, sy) {
    const wx = s2lX(sx), wy = s2lY(sy)
    const L = Patterns.getLayout()
    // poignées ?
    const grips = [
      { k: 'ceil', x: VW / 2, y: L.walls.ceil },
      { k: 'left', x: L.walls.left, y: VH / 2 },
      { k: 'right', x: VW - L.walls.right, y: VH / 2 }
    ]
    for (const g of grips) {
      if (Math.abs(wx - g.x) < 14 && Math.abs(wy - g.y) < 14) { drag = { grip: g.k }; return }
    }
    if (tool === 'erase') {
      for (let i = L.decor.length - 1; i >= 0; i--) {
        const d = L.decor[i]
        if (wx >= d.x && wx <= d.x + d.w && wy >= d.y && wy <= d.y + decorH(d)) {
          L.decor.splice(i, 1); Patterns.setLayout(L); selKind = null; renderProps(); persistSilent(); return
        }
      }
      return
    }
    if (tool === 'decor') {
      L.decor.push({ sprite: decorSprite, x: Math.round(wx), y: Math.round(wy), w: 60 })
      selKind = 'decor'; selIdx = L.decor.length - 1
      Patterns.setLayout(L); renderProps(); persistSilent()
      drag = { decor: selIdx, dx: 0, dy: 0 }
      return
    }
    // select decor
    for (let i = L.decor.length - 1; i >= 0; i--) {
      const d = L.decor[i]
      if (wx >= d.x && wx <= d.x + d.w && wy >= d.y && wy <= d.y + decorH(d)) {
        selKind = 'decor'; selIdx = i
        drag = { decor: i, dx: d.x - wx, dy: d.y - wy }
        renderProps(); return
      }
    }
    selKind = null; selIdx = -1; renderProps()
  }

  function onMove(e) {
    const { sx, sy } = canvasPos(e)
    mouse.inside = true
    if (mode === 'patterns') {
      mouse.wx = s2wX(sx); mouse.wy = s2wY(sy)
      coordsEl.textContent = 'x ' + Math.round(mouse.wx) + '  y ' + Math.round(mouse.wy) + '  ·  zoom ' + Math.round(zoom * 100) + '%'
    } else {
      coordsEl.textContent = 'x ' + Math.round(s2lX(sx)) + '  y ' + Math.round(s2lY(sy))
    }
    if (!drag) return
    if (drag.pan) {
      camX -= (sx - drag.sx) / scale()
      drag.sx = sx
      return
    }
    const pat = selPattern()
    if (mode === 'patterns' && pat) {
      const wx = s2wX(sx), wy = s2wY(sy)
      if (drag.kind === 'plat') {
        const p = pat.platforms[drag.idx]
        p.x = snapCell(wx + drag.dx)
        p.row = clampN(Math.round((wy - ROW0) / RS), 0, 4)
        persistSilent()
      } else if (drag.kind === 'wall') {
        const wl = pat.walls[drag.idx]
        wl.x = snapCell(wx + drag.dx)
        wl.row = clampN(Math.round((wy - ROW0) / RS), 0, 4)
        persistSilent()
      } else if (drag.kind === 'ball') {
        const b = pat.balls[drag.idx]
        b.x = Math.round(wx + drag.dx)
        const row = clampN(Math.round((wy - ROW0 + drag.dy) / RS), 0, 4)
        b.row = row
        b.yOff = Math.round(wy + drag.dy - rowY(row))
        persistSilent()
      } else if (drag.kind === 'decor') {
        const d = pat.decor[drag.idx]
        d.x = Math.round(wx + drag.dx); d.y = Math.round(wy + drag.dy)
        persistSilent()
      } else if (drag.kind === 'anchor') {
        const r = clampN(Math.round((wy - ROW0) / RS), 0, 4)
        pat.entry = { row: r }
        persistSilent(); renderProps()
      }
    } else if (mode === 'layout') {
      const L = Patterns.getLayout()
      const wx = s2lX(sx), wy = s2lY(sy)
      if (drag.grip === 'ceil') { L.walls.ceil = clampN(Math.round(wy), 8, 90); Patterns.setLayout(L); Phys.setWalls(L.walls); persistSilent(); renderPropsLayoutThrottled() }
      else if (drag.grip === 'left') { L.walls.left = clampN(Math.round(wx), 4, 60); Patterns.setLayout(L); Phys.setWalls(L.walls); persistSilent(); renderPropsLayoutThrottled() }
      else if (drag.grip === 'right') { L.walls.right = clampN(Math.round(VW - wx), 4, 60); Patterns.setLayout(L); Phys.setWalls(L.walls); persistSilent(); renderPropsLayoutThrottled() }
      else if (drag.decor != null) {
        const d = L.decor[drag.decor]
        d.x = Math.round(wx + drag.dx); d.y = Math.round(wy + drag.dy)
        Patterns.setLayout(L); persistSilent()
      }
    }
  }
  let propsLayoutT = 0
  function renderPropsLayoutThrottled() {
    const now = Date.now()
    if (now - propsLayoutT > 150) { propsLayoutT = now; renderProps() }
  }

  function onUp() { drag = null }

  function onWheel(e) {
    if (mode !== 'patterns') return
    e.preventDefault()
    if (e.ctrlKey) {
      setZoom(zoom + (e.deltaY < 0 ? 0.25 : -0.25))
    } else {
      camX += (e.deltaY + e.deltaX) / scale()
    }
  }

  function onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return
    const pat = selPattern()
    if (e.key === 'Escape') { selKind = null; selIdx = -1; renderProps(); return }
    if (mode === 'layout') return
    const types = ['basic', 'sticky', 'dynamic', 'crumble', 'ghost', 'bouncy']
    if (/^[1-6]$/.test(e.key)) { platType = types[parseInt(e.key, 10) - 1]; document.getElementById('tType').value = platType; if (tool !== 'plat') setTool('plat'); return }
    const toolKeys = { s: 'select', a: 'plat', w: 'wall', b: 'ball', g: 'gold', d: 'decor', e: 'erase' }
    if (toolKeys[e.key.toLowerCase()]) { setTool(toolKeys[e.key.toLowerCase()]); return }
    if (!pat) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selKind === 'plat') pat.platforms.splice(selIdx, 1)
      else if (selKind === 'ball') pat.balls.splice(selIdx, 1)
      else if (selKind === 'decor') pat.decor.splice(selIdx, 1)
      else if (selKind === 'wall') pat.walls.splice(selIdx, 1)
      else return
      selKind = null; selIdx = -1
      persist(); renderProps()
      return
    }
    if (selKind && selIdx >= 0) {
      const step = e.shiftKey ? 8 : 1
      let obj, move
      if (selKind === 'plat') { obj = pat.platforms[selIdx]; move = (dx, dr) => { obj.x = Math.max(CELL, obj.x + dx); obj.row = clampN(obj.row + dr, 0, 4) } }
      else if (selKind === 'wall') { obj = pat.walls[selIdx]; move = (dx, dr) => { obj.x = Math.max(CELL, obj.x + dx); obj.row = clampN(obj.row + dr, 0, 4) } }
      else if (selKind === 'ball') { obj = pat.balls[selIdx]; move = (dx, dy) => { obj.x += dx; obj.yOff += dy } }
      else if (selKind === 'decor') { obj = pat.decor[selIdx]; move = (dx, dy) => { obj.x += dx; obj.y += dy } }
      if (obj && move) {
        if (e.key === 'ArrowLeft') move(-step, 0)
        else if (e.key === 'ArrowRight') move(step, 0)
        else if (e.key === 'ArrowUp') move(0, -step)
        else if (e.key === 'ArrowDown') move(0, step)
        else return
        e.preventDefault()
        persistSilent()
      }
    }
  }

  // ---------- init ----------
  function init() {
    cv = document.getElementById('cv')
    ctx = cv.getContext('2d')
    listEl = document.getElementById('list')
    propsEl = document.getElementById('props')
    toolbarEl = document.getElementById('toolbar')
    coordsEl = document.getElementById('coords')
    statusEl = document.getElementById('status')
    storeInfoEl = document.getElementById('storeInfo')
    fileInput = document.getElementById('fileImport')

    Patterns.load()
    Phys.setWalls(Patterns.getLayout().walls)
    patterns = Patterns.getPatterns()
    Sprites.load()

    document.getElementById('tabPatterns').addEventListener('click', () => setMode('patterns'))
    document.getElementById('tabLayout').addEventListener('click', () => setMode('layout'))
    document.getElementById('btnNew').addEventListener('click', newPattern)
    document.getElementById('btnDefaults').addEventListener('click', installDefaults)
    document.getElementById('btnExport').addEventListener('click', exportJson)
    document.getElementById('btnCopy').addEventListener('click', copyCode)
    document.getElementById('btnPaste').addEventListener('click', pasteCode)
    document.getElementById('btnPlay').addEventListener('click', playtest)
    fileInput.addEventListener('change', e => {
      const f = e.target.files[0]
      if (!f) return
      const r = new FileReader()
      r.onload = () => doImport(r.result, f.name)
      r.readAsText(f)
      fileInput.value = ''
    })
    window.addEventListener('dragover', e => e.preventDefault())
    window.addEventListener('drop', e => {
      e.preventDefault()
      const f = e.dataTransfer.files[0]
      if (!f) return
      const r = new FileReader()
      r.onload = () => doImport(r.result, f.name)
      r.readAsText(f)
    })

    listEl.addEventListener('click', e => {
      const act = e.target.dataset.act
      const i = parseInt(e.target.dataset.i, 10)
      if (act === 'dup') {
        const c = JSON.parse(JSON.stringify(patterns[i]))
        c.id = Patterns.uid(); c.name += ' (copie)'
        patterns.push(c)
        Patterns.setPatternsRaw(patterns)
        selectPattern(c.id)
        return
      }
      if (act === 'del') {
        if (!confirm('Supprimer « ' + patterns[i].name + ' » ?')) return
        patterns.splice(i, 1)
        Patterns.setPatternsRaw(patterns)
        if (selId && !patterns.find(p => p.id === selId)) selId = patterns.length ? patterns[0].id : null
        refreshList()
        return
      }
      const item = e.target.closest('.item')
      if (item) selectPattern(patterns[parseInt(item.dataset.i, 10)].id)
    })

    cv.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    cv.addEventListener('wheel', onWheel, { passive: false })
    cv.addEventListener('contextmenu', e => e.preventDefault())
    cv.addEventListener('pointerleave', () => { mouse.inside = false })
    window.addEventListener('keydown', onKey)

    buildToolbar()
    if (patterns.length) selId = patterns[0].id
    refreshList()
    requestAnimationFrame(draw)
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()

  return { setMode }
})()
