// Couleurs du slime par palier de score — partagé entre le jeu (game.js)
// et la page de réglages (settings.html). Le palier 0 est l'art d'origine
// (vert, non recoloré) ; les paliers suivants sont générés au chargement
// par recoloration des PNG (voir SlimeColors.recolor).
const SlimeColors = (() => {
  const KEY = 'slime_tiers'
  const DEFAULTS = [
    { min: 0, hex: '#3ecb3e' },
    { min: 100, hex: '#35d0c5' },
    { min: 200, hex: '#4a5ed7' },
    { min: 350, hex: '#a04fd8' },
    { min: 500, hex: '#ef5fa7' },
    { min: 750, hex: '#ffd23f' }
  ]

  // Valide et trie une liste de paliers ; le premier démarre toujours à 0.
  function normalize(list) {
    if (!Array.isArray(list)) return null
    const out = []
    for (const t of list) {
      const min = Math.max(0, Math.floor(+t.min || 0))
      const hex = typeof t.hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(t.hex) ? t.hex.toLowerCase() : null
      if (hex === null) return null
      out.push({ min, hex })
    }
    out.sort((a, b) => a.min - b.min)
    if (!out.length || out[0].min !== 0) out.unshift({ min: 0, hex: DEFAULTS[0].hex })
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

  // Portage JS de tools/make_v3_sprites.py:recolor_slime : teinte uniquement
  // les pixels verts (g dominant) en préservant les ombrages via un facteur
  // de luminance k = 0.55 + 0.65*L ; yeux, contours et bloc brun intacts.
  function recolor(im, hex) {
    const target = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ]
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
      if (d[i + 3] === 0 || !(g > r + 10 && g > b + 10)) continue
      const L = (0.30 * r + 0.59 * g + 0.11 * b) / 255
      const k = 0.55 + 0.65 * L
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

  return { KEY, DEFAULTS, load, save, clear, normalize, tierIndex, recolor, shade }
})()
