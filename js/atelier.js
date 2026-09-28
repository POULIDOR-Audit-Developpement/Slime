// SLIME — T7 « L'Atelier des bocaux » : hall of fame du jeu.
// Ce fichier contient la logique PURE (testée en Node par
// tools/atelier_test.mjs via un harnais new Function) : pages du livre,
// remplissage des bocaux, formatage du temps, position des étagères.
// T8 ajoutera PLUS BAS dans ce même fichier le rendu canvas de la page
// atelier.html — la section pure reste en tête, sans aucune dépendance DOM.
//
// Donnée consommée : forme EXACTE de GET /api/scores (server.mjs, publicView)
//   { golden:[{id,name,tier}],
//     tiers:[{index, open, total, top:[{id,name,time}]}] } — tiers couvre
//   TOUS les paliers de la config (fermés : open:false, top:[], total:0).
//
// RÈGLE de confidentialité : un palier fermé n'expose jamais sa couleur —
// buildPages renvoie color:null et des lignes vides pour ces paliers.
const Atelier = (() => {
  // ======================================================================
  // SECTION PURE — aucune dépendance DOM/navigateur, testée en Node.
  // ======================================================================

  // fmtTime(sec) -> 'm:ss' : 0 -> '0:00', 95 -> '1:35', 600 -> '10:00'.
  // Aucun padding sur les minutes ; non-entiers tronqués, négatifs -> 0.
  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(+sec || 0))
    const m = Math.floor(s / 60)
    return m + ':' + String(s % 60).padStart(2, '0')
  }

  // jarFill(top, total, cap=8) -> { shown:[nom…≤cap], extra } : les bocaux
  // dérivent du MÊME top que les pages du livre (déjà trié par temps).
  // shown = les `cap` premiers noms, extra = « +N » = max(0, total-shown).
  // `top` accepte des noms bruts ou des entrées {name} (forme serveur).
  // total manquant/indéfini -> total = top.length (défaut sain).
  function jarFill(top, total, cap) {
    const c = Number.isInteger(cap) && cap > 0 ? cap : 8
    const list = Array.isArray(top) ? top : []
    const shown = list
      .map(e => (e && typeof e.name === 'string') ? e.name : e)
      .slice(0, c)
    const tot = Number.isFinite(total) ? total : list.length
    return { shown, extra: Math.max(0, tot - shown.length) }
  }

  // buildPages(view, tiers) -> pages du livre, dans l'ordre de lecture :
  //   1. page dorée  { kind:'golden', open, total, lines:[{name}] }
  //      (score JAMAIS exposé : seul le nom, ni time ni score/tier)
  //   2. une page par entrée de view.tiers (TOUS les paliers de la config,
  //      ouverts ET fermés, dans l'ordre) :
  //      { kind:'tier', index, color, open, total, lines:[{name,time}] }
  //      - ouvert  : color = hex du palier dans la config (param tiers,
  //        entrées {min, hex…} style SlimeColors.DEFAULTS)
  //      - fermé   : open:false, color:null, lines:[], total:0
  function buildPages(view, tiers) {
    const v = view || {}
    const golden = Array.isArray(v.golden) ? v.golden : []
    const cfg = Array.isArray(tiers) ? tiers : []
    const pages = [{
      kind: 'golden',
      open: true,
      total: golden.length,
      lines: golden.map(g => ({ name: (g && typeof g.name === 'string') ? g.name : '' }))
    }]
    const tl = Array.isArray(v.tiers) ? v.tiers : []
    for (let p = 0; p < tl.length; p++) {
      const t = tl[p] || {}
      const open = t.open === true
      const top = open && Array.isArray(t.top) ? t.top : []
      // Couleur : index du palier -> entrée de la config ; un palier fermé
      // ne fuite JAMAIS sa couleur (null), ouverte sans hex valide non plus.
      const idx = Number.isInteger(t.index) ? t.index : p
      const c = cfg[idx]
      const color = open && c && typeof c.hex === 'string' ? c.hex : null
      pages.push({
        kind: 'tier',
        index: t.index,
        color,
        open,
        total: open ? (Number.isFinite(t.total) ? t.total : top.length) : 0,
        lines: top.map(e => ({ name: (e && typeof e.name === 'string') ? e.name : '', time: e ? e.time : undefined }))
      })
    }
    return pages
  }

  // shelfPos(i, count, W, H) -> {x, y} : position du centre de l'étagère i.
  // Zone meuble = moitié GAUCHE de la scène : x constant = W*0.25 ; y réparti
  // linéairement dans [H*0.08, H*0.92], i=0 en HAUT (i croissant = descente).
  function shelfPos(i, count, W, H) {
    const n = Math.max(1, Math.floor(+count || 1))
    const f = Math.min(1, Math.max(0, n > 1 ? i / (n - 1) : 0.5))
    return { x: W * 0.25, y: H * 0.08 + (H * 0.92 - H * 0.08) * f }
  }

  // ======================================================================
  // SECTION RENDU (T8) — scène atelier.html. Rien ici ne s'exécute au
  // chargement Node (harnais du test) : tout vit dans init(canvas),
  // appelé par atelier.html.
  //
  // RÈGLES PERF (AGENTS.md) : les slimes sont recolorés UNE FOIS par
  // config de paliers en canvases offscreen (re-recoloration seulement
  // si les tiers du serveur changent) ; le canvas n'est redessiné que
  // sur zoom/pan/feuilletage/données nouvelles/responsive — ou pour le
  // PULSE du slime du joueur (seule animation continue : opacité seule,
  // rafraîchie ~20 fps, jamais de recoloration en boucle).
  // ======================================================================

  // Scène logique : l'image de fond est étirée sur 960x540 (coordonnées
  // monde). Livre : bornes MESURÉES sur atbg.jpeg (pages claires autour
  // d'une reliure sombre, cf. tools/extract_atelier.py) — proches du
  // rect indicatif [560..900, 130..430] du brief.
  const SCENE_W = 960, SCENE_H = 540
  const BOOK = { x: 472, y: 157, w: 372, h: 212 }
  const JAR_RATIO = 126 / 198        // PNG extrait (tools/extract_atelier.py)
  const JAR_H = 56
  const POLL_MS = 2000

  // init(canvas) -> branche toute la scène. Retour immédiat hors navigateur.
  function init(canvas) {
    if (!canvas || !canvas.getContext || typeof window === 'undefined') return
    const ctx = canvas.getContext('2d')

    // ---- vue (zoom/pan, borné aux bords de l'image) ----
    let cw = 0, ch = 0, dpr = 1, fit = 1
    let z = 1, cx = SCENE_W / 2, cy = SCENE_H / 2
    let anim = null                  // recentrage fluide {from,to,t0,dur}
    const kScale = () => fit * z
    function clampView() {
      const k = kScale(), hw = cw / (2 * k), hh = ch / (2 * k)
      cx = hw * 2 >= SCENE_W ? SCENE_W / 2 : Math.min(SCENE_W - hw, Math.max(hw, cx))
      cy = hh * 2 >= SCENE_H ? SCENE_H / 2 : Math.min(SCENE_H - hh, Math.max(hh, cy))
    }
    function s2w(sx, sy) { const k = kScale(); return { x: (sx - cw / 2) / k + cx, y: (sy - ch / 2) / k + cy } }
    function w2s(wx, wy) { const k = kScale(); return { x: (wx - cx) * k + cw / 2, y: (wy - cy) * k + ch / 2 } }
    function zoomAt(sx, sy, factor) {
      const wp = s2w(sx, sy)
      const nz = Math.min(6, Math.max(0.5, z * factor))
      if (nz === z) return
      cx = wp.x - (wp.x - cx) * (z / nz)
      cy = wp.y - (wp.y - cy) * (z / nz)
      z = nz
      anim = null
      clampView(); dirty = true
    }
    function goHome() {
      anim = { from: { z: z, cx: cx, cy: cy }, to: { z: 1, cx: SCENE_W / 2, cy: SCENE_H / 2 }, t0: performance.now(), dur: 380 }
      dirty = true
    }

    // ---- données / i18n / joueur ----
    let tiers = (typeof SlimeColors !== 'undefined') ? SlimeColors.load() : null
    let sigTiers = JSON.stringify(tiers)
    let view = null, sigView = ''
    let pages = [], page = 0
    let offline = false
    const I = k => (typeof I18N !== 'undefined' ? I18N.t(k) : k)
    const myName = (typeof Player !== 'undefined' && Player.get) ? Player.get() : null
    const isMe = n => typeof n === 'string' && myName != null && n.trim().toLowerCase() === myName.trim().toLowerCase()

    // ---- assets (fallbacks procéduraux si un chargement échoue) ----
    let bgImg = null, jarImg = null, jarEmptyImg = null, slimeBase = null
    let slimeCv = []                 // canvas recoloré par palier (0 = PNG d'origine)
    function loadImage(src, ok) {
      const im = new Image()
      im.onload = () => { if (ok) ok(); dirty = true }
      im.onerror = () => { im._failed = true; dirty = true }
      im.src = src
      return im
    }
    // Recoloration UNE FOIS par palier (offscreen) — jamais en boucle.
    function recolorAll() {
      slimeCv = []
      if (typeof SlimeColors === 'undefined' || !slimeBase || !slimeBase.complete || !slimeBase.naturalWidth || !tiers) return
      for (let i = 1; i < tiers.length; i++) {
        try { slimeCv[i] = SlimeColors.recolor(slimeBase, tiers[i], 0) } catch (e) {}
      }
      dirty = true
    }
    bgImg = loadImage('ASSETS/atbg.jpeg', null)
    jarImg = loadImage('ASSETS/atelier/jar_full.png?v=1', null)
    jarEmptyImg = loadImage('ASSETS/atelier/jar_empty.png?v=1', null)
    slimeBase = loadImage('ASSETS/sprites/game/idle0.png?v=20260926a', recolorAll)

    // Config paliers : GET /api/state -> state.layout.tiers si exploitable,
    // sinon les paliers locaux du jeu (SlimeColors.load).
    function resolveTiers(st) {
      const raw = st && st.layout && st.layout.tiers
      if (Array.isArray(raw) && raw.length && typeof SlimeColors !== 'undefined') {
        const n = SlimeColors.normalize(raw)
        if (n && n.length > 1) return n
      }
      return (typeof SlimeColors !== 'undefined') ? SlimeColors.load() : tiers
    }

    function shelfCount() {
      if (view && Array.isArray(view.tiers) && view.tiers.length) return view.tiers.length
      return tiers && tiers.length ? tiers.length : 6
    }

    function rebuild() {
      const t = tiers && tiers.length ? tiers : (SlimeColors.DEFAULTS || [])
      const empty = { golden: [], tiers: t.map((c, i) => ({ index: i, open: false, total: 0, top: [] })) }
      pages = buildPages(view || empty, t)
      if (page >= pages.length) page = Math.max(0, pages.length - 1)
      dirty = true
    }

    // ---- données live : fetch initial + polling 2 s, silencieux hors ligne ----
    let polling = false
    async function refresh() {
      if (polling || typeof fetch !== 'function') return
      polling = true
      try {
        const [vr, sr] = await Promise.all([
          fetch('/api/scores').then(r => { if (!r.ok) throw new Error('scores ' + r.status); return r.json() }),
          fetch('/api/state').then(r => { if (!r.ok) throw new Error('state ' + r.status); return r.json() })
        ])
        const nt = resolveTiers(sr && sr.state ? sr.state : null) || tiers
        const sv = JSON.stringify(vr), st = JSON.stringify(nt)
        const tiersChanged = st !== sigTiers
        if (tiersChanged) { tiers = nt; sigTiers = st; recolorAll() }
        if (tiersChanged || sv !== sigView) { view = vr; sigView = sv; rebuild() }
        if (offline) { offline = false; dirty = true }
      } catch (e) {
        // Hors ligne : la scène reste (bocaux vides, message du livre).
        if (!view && !offline) { offline = true; dirty = true }
      } finally {
        polling = false
      }
    }

    // ---- boucle : redraw événementiel + pulse ~20 fps si mon slime ----
    let dirty = true, lastPulseDraw = 0
    function pulseActive() {
      if (!myName) return false
      const pg = pages[page]
      if (pg) for (let i = 0; i < pg.lines.length; i++) if (isMe(pg.lines[i].name)) return true
      if (view && Array.isArray(view.tiers)) {
        for (let i = 0; i < view.tiers.length; i++) {
          const f = jarFill(view.tiers[i].top, view.tiers[i].total, 8)
          for (let j = 0; j < f.shown.length; j++) if (isMe(f.shown[j])) return true
        }
      }
      return false
    }
    function frame(now) {
      requestAnimationFrame(frame)
      if (anim) {
        const p = Math.min(1, (now - anim.t0) / anim.dur)
        const e = 1 - Math.pow(1 - p, 3)
        z = anim.from.z + (anim.to.z - anim.from.z) * e
        cx = anim.from.cx + (anim.to.cx - anim.from.cx) * e
        cy = anim.from.cy + (anim.to.cy - anim.from.cy) * e
        clampView()
        dirty = true
        if (p >= 1) anim = null
      }
      if (!dirty && pulseActive() && now - lastPulseDraw > 50) dirty = true
      if (!dirty) return
      dirty = false
      lastPulseDraw = now
      render(now / 1000)
    }

    // ---- primitives vectorielles ----
    function rrect(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2)
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.arcTo(x + w, y, x + w, y + h, r)
      ctx.arcTo(x + w, y + h, x, y + h, r)
      ctx.arcTo(x, y + h, x, y, r)
      ctx.arcTo(x, y, x + w, y, r)
      ctx.closePath()
    }
    function setFont(px, weight) {
      ctx.font = (weight ? weight + ' ' : '') + px + 'px "Courier New", ui-monospace, Consolas, monospace'
    }

    // ---- fond : l'image de l'atelier telle quelle, ou vectoriel ----
    function drawFallbackBg() {
      const g = ctx.createLinearGradient(0, 0, 0, SCENE_H)
      g.addColorStop(0, '#2b2013'); g.addColorStop(0.72, '#1a1209'); g.addColorStop(1, '#0e0a05')
      ctx.fillStyle = g; ctx.fillRect(0, 0, SCENE_W, SCENE_H)
      ctx.strokeStyle = 'rgba(0,0,0,0.32)'; ctx.lineWidth = 2
      for (let y = 46; y < 432; y += 56) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke() }
      const r = ctx.createRadialGradient(690, 70, 12, 690, 70, 400)
      r.addColorStop(0, 'rgba(255,190,90,0.28)'); r.addColorStop(1, 'rgba(255,190,90,0)')
      ctx.fillStyle = r; ctx.fillRect(290, 0, 670, 470)
      ctx.fillStyle = '#241708'; ctx.fillRect(420, 366, 480, 20)
      ctx.fillStyle = '#191005'; ctx.fillRect(438, 386, 14, 150); ctx.fillRect(868, 386, 14, 150)
    }

    // Slime : canvas recoloré du palier (0 = PNG d'origine) ; ti < 0 = blob
    // doré vectoriel (page dorée). alpha < 1 = pulse du joueur.
    function drawSlime(ti, sx, fy, w, alpha) {
      const h = w * (71 / 88)
      let src = null
      if (ti >= 0) src = (ti > 0 && slimeCv[ti]) ? slimeCv[ti] : slimeBase
      if (src && (src.naturalWidth || src.width)) {
        if (alpha < 1) ctx.globalAlpha = alpha
        ctx.drawImage(src, sx - w / 2, fy - h, w, h)
        if (alpha < 1) ctx.globalAlpha = 1
        return
      }
      const col = ti < 0 ? '#ffd23f'
        : (tiers && tiers[ti] && typeof SlimeColors !== 'undefined') ? SlimeColors.primary(tiers[ti]) : '#3ecb3e'
      ctx.globalAlpha = alpha
      ctx.fillStyle = col
      ctx.beginPath(); ctx.ellipse(sx, fy - h / 2, w / 2, h / 2, 0, 0, 6.2832); ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.fillRect(sx - w * 0.24, fy - h * 0.68, w * 0.15, h * 0.22)
      ctx.fillRect(sx + w * 0.09, fy - h * 0.68, w * 0.15, h * 0.22)
      ctx.globalAlpha = 1
    }

    // Bocal en vecteurs (secours si le PNG n'a pas chargé).
    function drawJarFallback(x, y, w, h) {
      ctx.fillStyle = '#8a5a2e'
      rrect(x + w * 0.24, y, w * 0.52, h * 0.1, 2); ctx.fill()
      ctx.fillStyle = 'rgba(195,220,230,0.20)'
      rrect(x, y + h * 0.07, w, h * 0.93, w * 0.3); ctx.fill()
      ctx.strokeStyle = 'rgba(235,245,250,0.55)'; ctx.lineWidth = 1.2
      rrect(x, y + h * 0.07, w, h * 0.93, w * 0.3); ctx.stroke()
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(x + w * 0.18, y + h * 0.2); ctx.lineTo(x + w * 0.18, y + h * 0.62); ctx.stroke()
    }

    function drawPlank(x, y, edge) {
      // planche vectorielle + chant coloré (liseré du palier, neutre si fermé).
      // Le mobilier occupe le BAS de la zone d'étagère (shelfPos = centre de
      // zone) : le bocal du haut reste ainsi entier à l'écran (testé).
      ctx.fillStyle = 'rgba(0,0,0,0.30)'
      rrect(x - 66, y + 16, 132, 11, 3); ctx.fill()
      ctx.fillStyle = '#3a2a1a'
      rrect(x - 64, y + 14, 128, 10, 3); ctx.fill()
      ctx.fillStyle = '#5d4426'
      ctx.fillRect(x - 64, y + 14, 128, 2)
      ctx.fillStyle = edge
      ctx.fillRect(x - 64, y + 21, 128, 3)
    }

    function drawPlaque(x, y, open, i) {
      // plaque sous l'étagère : nom du 1er du palier (tronqué 12) + « +N »
      const vt = view && view.tiers ? view.tiers[i] : null
      const f = open && vt ? jarFill(vt.top, vt.total, 8) : null
      const extra = f && f.extra > 0 ? f.extra : 0
      const name = f && f.shown.length ? String(f.shown[0]).slice(0, extra ? 10 : 12) : ''
      ctx.fillStyle = 'rgba(20,14,9,0.88)'
      rrect(x - 34, y + 27, 68, 11, 2); ctx.fill()
      ctx.strokeStyle = 'rgba(226,200,150,0.30)'; ctx.lineWidth = 0.8; ctx.stroke()
      setFont(6.5, 'bold')
      ctx.textBaseline = 'middle'
      ctx.fillStyle = open ? '#efe2c2' : '#8d8577'
      ctx.textAlign = 'left'
      if (name) ctx.fillText(name, x - 30, y + 33)
      if (extra) {
        ctx.fillStyle = '#ffd23f'
        ctx.textAlign = 'right'
        ctx.fillText('+' + extra, x + 31, y + 33)
      }
      ctx.textAlign = 'left'
    }

    function drawJar(p, i, open, pulse) {
      const w = JAR_H * JAR_RATIO, h = JAR_H
      const x = p.x - w / 2, yb = p.y + 14, y = yb - h
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.beginPath(); ctx.ellipse(p.x, yb + 1, w * 0.5, 3, 0, 0, 6.2832); ctx.fill()
      const im = open ? jarImg : jarEmptyImg
      if (im && !im._failed && im.complete && im.naturalWidth) ctx.drawImage(im, x, y, w, h)
      else drawJarFallback(x, y, w, h)
      if (!open) return
      // mini-slimes du palier : 2 rangées de 4 dans le verre (jarFill)
      const vt = view && view.tiers ? view.tiers[i] : null
      const f = jarFill(vt ? vt.top : [], vt ? vt.total : undefined, 8)
      const ti = Math.min(i, (tiers ? tiers.length : 6) - 1)
      const ix0 = x + w * 0.17, ix1 = x + w * 0.83
      // 2 rangées (4+4) : les premiers posés dans la gelée du fond, les
      // suivants au-dessus — ordre jarFill (top par temps croissant).
      const rows = [yb - 10.5, yb - 24]
      for (let s = 0; s < f.shown.length; s++) {
        const col = s % 4, row = s < 4 ? 0 : 1
        const sx = ix0 + (ix1 - ix0) * (col / 3)
        drawSlime(ti, sx, rows[row], 7.2, isMe(f.shown[s]) ? pulse : 1)
      }
    }

    function drawShelves(t) {
      const n = shelfCount()
      const pulse = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(t * 6.2832))
      for (let i = 0; i < n; i++) {
        const p = shelfPos(i, n, SCENE_W, SCENE_H)
        const pg = pages[i + 1] || null
        const open = !!(pg && pg.open)
        drawPlank(p.x, p.y, open ? (pg.color || '#b9b4a6') : '#6a6459')
        drawJar(p, i, open, pulse)
        drawPlaque(p.x, p.y, open, i)
      }
    }

    // ---- le livre : parchemin redessiné vectoriellement (lisible à tout zoom)
    function drawBook(t) {
      const B = BOOK, pg = pages[page] || null
      const gold = !!(pg && pg.kind === 'golden')
      ctx.fillStyle = 'rgba(8,5,2,0.45)'
      rrect(B.x - 2, B.y + 3, B.w + 10, B.h + 9, 10); ctx.fill()
      ctx.fillStyle = '#4a2f18'
      rrect(B.x - 7, B.y - 7, B.w + 14, B.h + 14, 9); ctx.fill()
      const g = ctx.createLinearGradient(0, B.y, 0, B.y + B.h)
      if (gold) { g.addColorStop(0, '#efdc9a'); g.addColorStop(1, '#ddbf68') }
      else { g.addColorStop(0, '#efe2c0'); g.addColorStop(1, '#dcc99a') }
      ctx.fillStyle = g
      rrect(B.x, B.y, B.w, B.h, 5); ctx.fill()
      // pli central discret
      const mx = B.x + B.w / 2
      const cg = ctx.createLinearGradient(mx - 16, 0, mx + 16, 0)
      cg.addColorStop(0, 'rgba(90,66,30,0)'); cg.addColorStop(0.5, 'rgba(90,66,30,0.16)'); cg.addColorStop(1, 'rgba(90,66,30,0)')
      ctx.fillStyle = cg
      ctx.fillRect(mx - 16, B.y + 2, 32, B.h - 4)

      // flèches ‹ › (zones hit ≥ 44 px — cf. arrowHit) + pagination
      const my = B.y + B.h / 2
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center'
      setFont(15, 'bold')
      ctx.fillStyle = page > 0 ? '#5a4322' : 'rgba(90,67,34,0.25)'
      ctx.fillText('‹', B.x + 14, my)
      ctx.fillStyle = page < pages.length - 1 ? '#5a4322' : 'rgba(90,67,34,0.25)'
      ctx.fillText('›', B.x + B.w - 14, my)
      setFont(8, 'bold'); ctx.fillStyle = '#6b5a3a'
      ctx.fillText((page + 1) + '/' + pages.length, mx, B.y + B.h - 14)

      // hors ligne (aucune donnée) : message i18n, scène quand même
      if (offline && !view) {
        setFont(10, 'bold'); ctx.fillStyle = '#6b5a3a'
        ctx.fillText(I('offline'), mx, B.y + B.h / 2 - 8)
        ctx.textAlign = 'left'
        return
      }
      if (!pg) { ctx.textAlign = 'left'; return }

      // en-tête : étoile dorée ou pastille de la couleur du palier
      const hy = B.y + 19
      if (gold) {
        setFont(13, 'bold'); ctx.fillStyle = '#a97f16'
        ctx.fillText('★', B.x + 26, hy)
        if (pg.total > 0) {
          setFont(8, 'bold'); ctx.fillStyle = '#7a6531'
          ctx.fillText('✦ ' + pg.total, B.x + B.w - 46, hy)
        }
      } else {
        ctx.fillStyle = pg.open && pg.color ? pg.color : '#8d8778'
        rrect(B.x + 18, hy - 6, 13, 12, 3); ctx.fill()
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.stroke()
      }

      // lignes : position 1-10, slime du palier, pseudo (+ temps si palier)
      const lx = B.x + 20, cw0 = B.w - 40, ly0 = B.y + 36, lh = 15.4
      const ti = gold ? -1 : Math.max(0, Math.min(page - 1, (tiers ? tiers.length : 6) - 1))
      const pulse = 0.85 + 0.15 * (0.5 + 0.5 * Math.sin(t * 6.2832))
      for (let i = 0; i < pg.lines.length && i < 10; i++) {
        const ln = pg.lines[i] || {}, yy = ly0 + i * lh
        const me = isMe(ln.name)
        if (me) {
          ctx.fillStyle = 'rgba(255,214,64,0.30)'
          rrect(lx - 2, yy - lh / 2 - 1, cw0, lh, 3); ctx.fill()
        }
        setFont(9, 'bold')
        ctx.fillStyle = '#7a6531'; ctx.textAlign = 'right'
        ctx.fillText(String(i + 1), lx + 9, yy)
        drawSlime(ti, lx + 22, yy + 5, 10, me ? pulse : 1)
        ctx.textAlign = 'left'
        ctx.fillStyle = me ? '#3f2c08' : '#4a3a1e'
        ctx.fillText(String(ln.name || '').slice(0, 12), lx + 32, yy)
        if (pg.kind === 'tier' && Number.isFinite(ln.time)) {
          ctx.textAlign = 'right'; ctx.fillStyle = '#8a6f3c'
          ctx.fillText(fmtTime(ln.time), lx + cw0 - 4, yy)
        }
      }
      ctx.textAlign = 'left'
    }

    // ---- rendu complet (uniquement sur événement/pulse) ----
    function render(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#05050e'
      ctx.fillRect(0, 0, cw, ch)
      const k = kScale()
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cw / 2 - cx * k), dpr * (ch / 2 - cy * k))
      // pixelisé en zoom (>1), lissé en dézoom (<1) — look du jeu sans crénelage
      ctx.imageSmoothingEnabled = k > 1.05 ? false : true
      if (bgImg && !bgImg._failed && bgImg.complete && bgImg.naturalWidth) ctx.drawImage(bgImg, 0, 0, SCENE_W, SCENE_H)
      else drawFallbackBg()
      drawShelves(t)
      drawBook(t)
    }

    // ---- entrées : molette/pince = zoom, glisser = pan, dblclic = vue entière
    const pointers = new Map()
    let pinch = null, dragMoved = false, lastTap = 0, lastTapX = 0, lastTapY = 0
    function arrowHit(sx, sy) {
      // boutons ‹ › : cercles ≥ 44 px d'écran ; secours : bords du livre
      const m = B_y()
      const a = w2s(BOOK.x + 14, m), b = w2s(BOOK.x + BOOK.w - 14, m)
      if (Math.hypot(sx - a.x, sy - a.y) <= 24) return -1
      if (Math.hypot(sx - b.x, sy - b.y) <= 24) return 1
      const wp = s2w(sx, sy)
      if (wp.x >= BOOK.x && wp.x <= BOOK.x + BOOK.w && wp.y >= BOOK.y && wp.y <= BOOK.y + BOOK.h) {
        const f = (wp.x - BOOK.x) / BOOK.w
        if (f < 0.3) return -1
        if (f > 0.7) return 1
      }
      return 0
    }
    function B_y() { return BOOK.y + BOOK.h / 2 }
    function flip(d) {
      const n = Math.max(0, Math.min(pages.length - 1, page + d))
      if (n !== page) { page = n; dirty = true }
    }
    canvas.addEventListener('pointerdown', e => {
      if (canvas.setPointerCapture) { try { canvas.setPointerCapture(e.pointerId) } catch (err) {} }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      dragMoved = false
      if (pointers.size === 2) {
        const ps = []
        pointers.forEach(v => ps.push(v))
        pinch = { d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), mx: (ps[0].x + ps[1].x) / 2, my: (ps[0].y + ps[1].y) / 2 }
      }
      anim = null
    })
    canvas.addEventListener('pointermove', e => {
      const p = pointers.get(e.pointerId)
      if (!p) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      p.x = e.clientX; p.y = e.clientY
      if (pointers.size === 1) {
        if (dragMoved || Math.abs(dx) + Math.abs(dy) > 2) {
          dragMoved = true
          const k = kScale()
          cx -= dx / k; cy -= dy / k
          anim = null
          clampView(); dirty = true
        }
      } else if (pointers.size === 2 && pinch) {
        dragMoved = true
        const ps = []
        pointers.forEach(v => ps.push(v))
        const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y)
        const mx = (ps[0].x + ps[1].x) / 2, my = (ps[0].y + ps[1].y) / 2
        if (pinch.d > 4) zoomAt(mx, my, d / pinch.d)
        const k = kScale()
        cx -= (mx - pinch.mx) / k; cy -= (my - pinch.my) / k
        clampView()
        pinch = { d: d, mx: mx, my: my }
        dirty = true
      }
    })
    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (pointers.size !== 0 || dragMoved) return
      const dir = arrowHit(e.clientX, e.clientY)
      if (dir) { flip(dir); return }
      // double-tap hors livre = vue entière (reset fluide)
      const now = performance.now()
      if (now - lastTap < 350 && Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40) {
        lastTap = 0
        goHome()
        return
      }
      lastTap = now; lastTapX = e.clientX; lastTapY = e.clientY
    }
    canvas.addEventListener('pointerup', endPointer)
    canvas.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pinch = null })
    canvas.addEventListener('wheel', e => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0014))
    }, { passive: false })
    canvas.addEventListener('dblclick', e => { e.preventDefault(); goHome() })

    // ---- démarrage ----
    function resize() {
      dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
      cw = canvas.clientWidth || window.innerWidth
      ch = canvas.clientHeight || window.innerHeight
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(ch * dpr)
      fit = Math.min(cw / SCENE_W, ch / SCENE_H)
      clampView()
      dirty = true
    }
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) dirty = true })
    }
    if (canvas.style) { canvas.style.touchAction = 'none'; canvas.style.cursor = 'grab' }
    resize()
    rebuild()
    refresh()
    setInterval(refresh, POLL_MS)
    requestAnimationFrame(frame)
  }

  return { fmtTime, jarFill, buildPages, shelfPos, init }
})()

if (typeof window !== 'undefined') window.Atelier = Atelier
