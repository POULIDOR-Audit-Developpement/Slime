// Couleurs et effets du slime par palier de score — partagé entre le jeu
// (game.js) et l'éditeur (onglet COULEURS). Le palier 0 est l'art d'origine
// (vert, non recoloré) ; les autres paliers sont générés par recoloration
// des PNG (SlimeColors.recolor), à temps partagé pour les effets animés.
//
// Un palier : { min, type, ...params } avec type parmi EFFECT_LIST :
//   flat     { hex }              couleur unie
//   gradient { hexes[>=2] }       fondu smooth haut -> bas
//   multi    { hexes[>=2] }       bandes verticales nettes gauche -> droite
//   rainbow  { speed 0..1 }       cycle des teintes balayé en X + temps (animé)
//   shine    { hex, speed 0..1 }  bande de reflet blanche diagonale (animé)
//   star     { hex }              paillettes blanches scintillantes (animé)
// Les anciens saves { min, hex } sont auto-upgradés en flat au chargement.
const SlimeColors = (() => {
  const KEY = 'slime_tiers'
  const DEFAULTS = [
    { min: 0, type: 'flat', hex: '#3ecb3e' },
    { min: 100, type: 'flat', hex: '#35d0c5' },
    { min: 200, type: 'flat', hex: '#4a5ed7' },
    { min: 350, type: 'flat', hex: '#a04fd8' },
    { min: 500, type: 'flat', hex: '#ef5fa7' },
    { min: 750, type: 'flat', hex: '#ffd23f' }
  ]
  const MAX_STOPS = 6

  // ---------- math couleur ----------
  const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
  const clamp01 = v => Math.min(1, Math.max(0, v))
  const spd = (v, d) => { v = +v; return isFinite(v) ? clamp01(v) : d }

  // h 0-360, s/l 0-1 -> [r,g,b] 0-255
  function hsl2rgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s
    const hp = (((h % 360) + 360) % 360) / 60
    const x = c * (1 - Math.abs(hp % 2 - 1))
    let r = 0, g = 0, b = 0
    if (hp < 1) { r = c; g = x } else if (hp < 2) { r = x; g = c } else if (hp < 3) { g = c; b = x }
    else if (hp < 4) { g = x; b = c } else if (hp < 5) { r = x; b = c } else { r = c; b = x }
    const m = l - c / 2
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
  }

  // Interpolation smooth le long des stops (f 0..1) et bandes nettes.
  const stopColor = (hexes, f) => {
    const n = hexes.length - 1
    const x = clamp01(f) * n
    const i = Math.min(n - 1, Math.floor(x))
    return mix(hex2rgb(hexes[i]), hex2rgb(hexes[i + 1]), x - i)
  }
  const bandColor = (hexes, f) => hex2rgb(hexes[Math.min(hexes.length - 1, Math.max(0, Math.floor(clamp01(f) * hexes.length)))])

  // Hash déterministe 0..1 (grille d'étoiles stable entre frames/sprites).
  const hash2 = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }

  const WHITE = [255, 255, 255]

  // ---------- registre des effets ----------
  // pixel(tier, xn, yn, px, py, t) -> [r,g,b] cible du pixel (xn/yn normalisés
  // 0..1, px/py pixels sprite, t secondes) ; le facteur de luminance du
  // recolor préserve ensuite l'ombrage du sprite.
  const EFFECTS = {
    flat: {
      label: 'Unie', animated: false,
      primary: p => p.hex,
      pixel: p => hex2rgb(p.hex)
    },
    gradient: {
      label: 'Dégradé', animated: false,
      primary: p => p.hexes[0],
      pixel: (p, xn, yn) => stopColor(p.hexes, yn)
    },
    multi: {
      label: 'Multicolore', animated: false,
      primary: p => p.hexes[0],
      pixel: (p, xn) => bandColor(p.hexes, xn)
    },
    rainbow: {
      label: 'Arc-en-ciel', animated: true,
      primary: () => '#e05fbf',
      pixel: (p, xn, yn, px, py, t) => hsl2rgb(((xn * 0.85 + t * p.speed) % 1) * 360, 0.85, 0.55)
    },
    shine: {
      label: 'Brillant', animated: true,
      primary: p => p.hex,
      // Large bande diagonale (28 % du balayage) à 90 % de blanc : visible
      // même en preview réduite ; écho discret en queue pour l'éclat.
      pixel: (p, xn, yn, px, py, t) => {
        const f = ((xn + yn) * 0.85 - t * p.speed) % 1
        let band = 0
        if (f >= 0 && f < 0.28) band = 1 - Math.abs(f - 0.14) / 0.14
        else if (f >= 0.34 && f < 0.44) band = (1 - Math.abs(f - 0.39) / 0.05) * 0.3
        return mix(hex2rgb(p.hex), WHITE, band * 0.9)
      }
    },
    star: {
      label: 'Étoilé', animated: true,
      primary: p => p.hex,
      // Étoiles à 4 branches (croix + halo) : cellules de 8 px, 45 % des
      // cellules occupées, scintillement allumé ~75 % du cycle.
      pixel: (p, xn, yn, px, py, t) => {
        const base = hex2rgb(p.hex)
        const gx = Math.floor(px / 8), gy = Math.floor(py / 8)
        const h = hash2(gx, gy)
        if (h < 0.55) return base
        const cx = gx * 8 + 1.5 + h * 5, cy = gy * 8 + 1.5 + hash2(gx + 91, gy + 17) * 5
        const ax = Math.abs(px - cx), ay = Math.abs(py - cy)
        const cross = Math.max(ax, ay) <= 2.6 && Math.min(ax, ay) <= 0.9
        const d2 = ax * ax + ay * ay
        const glow = !cross && d2 <= 3.6
        if (!cross && !glow) return base
        const tw = 0.5 + 0.5 * Math.sin(t * 6.283 * (0.6 + h) + h * 40)
        const twk = (tw - 0.25) / 0.75
        if (twk <= 0) return base
        let inten = 1
        if (!cross) inten = (1 - Math.sqrt(d2) / 1.9) * 0.5
        return mix(base, WHITE, Math.min(1, inten * twk))
      }
    }
  }
  const EFFECT_LIST = ['flat', 'gradient', 'multi', 'rainbow', 'shine', 'star']
  const EFFECT_DEFAULTS = {
    flat: { hex: '#3ecb3e' },
    gradient: { hexes: ['#ff5f6d', '#ffc371'] },
    multi: { hexes: ['#e53935', '#8e24aa', '#3949ab'] },
    rainbow: { speed: 0.15 },
    shine: { hex: '#3a7bd5', speed: 0.3 },
    star: { hex: '#2b5876' }
  }

  const hexOk = h => typeof h === 'string' && /^#[0-9a-fA-F]{6}$/.test(h)
  const hexOf = (v, fb) => (hexOk(v) ? v.toLowerCase() : fb)
  const isAnimated = t => !!(t && EFFECTS[t.type] && EFFECTS[t.type].animated)
  const primary = t => (t && EFFECTS[t.type] ? EFFECTS[t.type].primary(t) : DEFAULTS[0].hex)

  // Valide une entrée de palier ; retourne null si irrécupérable.
  function sanitizeTier(t) {
    if (!t || typeof t !== 'object') return null
    const min = Math.max(0, Math.floor(+t.min || 0))
    const type = typeof t.type === 'string' && EFFECTS[t.type] ? t.type : (hexOk(t.hex) ? 'flat' : null)
    if (!type) return null
    if (type === 'flat') {
      const hex = hexOf(t.hex, null)
      return hex ? { min, type, hex } : null
    }
    if (type === 'gradient' || type === 'multi') {
      const hexes = (Array.isArray(t.hexes) ? t.hexes.map(h => hexOf(h, null)) : []).filter(Boolean).slice(0, MAX_STOPS)
      if (hexes.length < 2) return null
      return { min, type, hexes }
    }
    if (type === 'rainbow') return { min, type, speed: spd(t.speed, EFFECT_DEFAULTS.rainbow.speed) }
    if (type === 'shine') {
      const hex = hexOf(t.hex, null)
      return hex ? { min, type, hex, speed: spd(t.speed, EFFECT_DEFAULTS.shine.speed) } : null
    }
    if (type === 'star') {
      const hex = hexOf(t.hex, null)
      return hex ? { min, type, hex } : null
    }
    return null
  }

  // Valide et trie une liste de paliers ; entrées invalides supprimées ;
  // le premier palier démarre toujours à 0 (art d'origine).
  function normalize(list) {
    if (!Array.isArray(list)) return null
    const out = []
    for (const t of list) {
      const s = sanitizeTier(t)
      if (s) out.push(s)
    }
    out.sort((a, b) => a.min - b.min)
    if (!out.length || out[0].min !== 0) out.unshift(DEFAULTS[0])
    return out
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY)
      if (!raw) return DEFAULTS.slice()
      return normalize(JSON.parse(raw)) || DEFAULTS.slice()
    } catch (e) {
      return DEFAULTS.slice()
    }
  }

  function save(list) {
    const t = normalize(list)
    if (!t) return false
    try { localStorage.setItem(KEY, JSON.stringify(t)); return true } catch (e) { return false }
  }

  function clear() {
    try { localStorage.removeItem(KEY) } catch (e) {}
  }

  function tierIndex(tiers, score) {
    let idx = 0
    for (let i = 0; i < tiers.length; i++) if (score >= tiers[i].min) idx = i
    return idx
  }

  // Recoloration : teinte uniquement les pixels verts (g dominant) en
  // préservant les ombrages via un facteur de luminance k = 0.55 + 0.65*L ;
  // yeux, contours et bloc brun intacts. tier = objet palier (ou hex string
  // rétro-compatible flat) ; t = temps partagé des effets animés (secondes).
  function recolor(im, tier, t) {
    const T = typeof tier === 'string' ? { type: 'flat', hex: tier } : tier
    const E = EFFECTS[T.type] || EFFECTS.flat
    const tt = +t || 0
    const cv = document.createElement('canvas')
    cv.width = im.naturalWidth || im.width
    cv.height = im.naturalHeight || im.height
    const c = cv.getContext('2d')
    c.imageSmoothingEnabled = false
    c.drawImage(im, 0, 0)
    const a = c.getImageData(0, 0, cv.width, cv.height)
    const d = a.data
    const w = cv.width, h = cv.height
    // Chemin rapide pour l'effet unie (cible précalculée, comme avant).
    if (E === EFFECTS.flat) {
      const target = hex2rgb(T.hex || DEFAULTS[0].hex)
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2]
        if (d[i + 3] === 0 || !(g > r + 10 && g > b + 10)) continue
        const k = 0.55 + 0.65 * (0.30 * r + 0.59 * g + 0.11 * b) / 255
        d[i] = Math.min(255, target[0] * k)
        d[i + 1] = Math.min(255, target[1] * k)
        d[i + 2] = Math.min(255, target[2] * k)
      }
    } else {
      for (let y = 0; y < h; y++) {
        const yn = h > 1 ? y / (h - 1) : 0
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          const r = d[i], g = d[i + 1], b = d[i + 2]
          if (d[i + 3] === 0 || !(g > r + 10 && g > b + 10)) continue
          const k = 0.55 + 0.65 * (0.30 * r + 0.59 * g + 0.11 * b) / 255
          const c2 = E.pixel(T, w > 1 ? x / (w - 1) : 0, yn, x, y, tt)
          d[i] = Math.min(255, c2[0] * k)
          d[i + 1] = Math.min(255, c2[1] * k)
          d[i + 2] = Math.min(255, c2[2] * k)
        }
      }
    }
    c.putImageData(a, 0, 0)
    return cv
  }

  // Recoloration des pixels BLEUS (b dominant) : même préservation de
  // luminance que recolor, sélection inverse. Sert au fond par piste musicale
  // (bg_big/bg_panel sont bleus ; fenêtres claires, contours et pixels neutres
  // restent intacts). Retourne un canvas — la recoloration est faite UNE fois
  // par bascule de piste, jamais par frame (règles perf AGENTS.md).
  function recolorBlue(im, hex) {
    const target = hex2rgb(typeof hex === 'string' && hex ? hex : DEFAULTS[0].hex)
    const cv = document.createElement('canvas')
    cv.width = im.naturalWidth || im.width
    cv.height = im.naturalHeight || im.height
    const c = cv.getContext('2d')
    c.imageSmoothingEnabled = false
    c.drawImage(im, 0, 0)
    const a = c.getImageData(0, 0, cv.width, cv.height)
    const d = a.data
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2]
      if (d[i + 3] === 0 || !(b > r + 10 && b > g + 10)) continue
      const k = 0.55 + 0.65 * (0.30 * r + 0.59 * g + 0.11 * b) / 255
      d[i] = Math.min(255, target[0] * k)
      d[i + 1] = Math.min(255, target[1] * k)
      d[i + 2] = Math.min(255, target[2] * k)
    }
    c.putImageData(a, 0, 0)
    return cv
  }

  // Éclaircit (f > 0, vers blanc) ou assombrit (f < 0, vers noir) un hex.
  function shade(hex, f) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
    const mx = v => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))))
    return '#' + [mx(r), mx(g), mx(b)].map(v => v.toString(16).padStart(2, '0')).join('')
  }

  return { KEY, DEFAULTS, MAX_STOPS, EFFECTS, EFFECT_LIST, EFFECT_DEFAULTS, load, save, clear, normalize, sanitizeTier, tierIndex, isAnimated, primary, recolor, recolorBlue, shade }
})()
