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
  // RENDU (T8) — le squelette atelier.html n'appelle encore rien ici.
  // ======================================================================

  return { fmtTime, jarFill, buildPages, shelfPos }
})()

if (typeof window !== 'undefined') window.Atelier = Atelier
