const Sprites = (() => {
  const defs = {
    idle0: 'idle0',
    idle1: 'idle1',
    hurt: 'hurt',
    jump: 'jump',
    fall: 'fall',
    land: 'land',
    splat: 'splat',
    big: 'big',
    mid: 'mid',
    small: 'small',
    tileGreen: 'tile_green',
    tileBlue: 'tile_blue',
    tileGray: 'tile_gray',
    tileGhost: 'tile_ghost',
    tileOrange: 'tile_orange',
    sticky: 'sticky',
    dynStrip: 'dyn_strip',
    voidBand: 'void',
    hudHead: 'hud_head',
    needle: 'needle',
    death1: 'death1',
    death2: 'death2',
    death3: 'death3',
    bonusLife: 'bonus_life',
    ledge: 'ledge',
    ledgeUp: 'ledgeUp',
    ledgeTop: 'ledgeTop',
    djPump0: 'dj_pump0',
    djPump1: 'dj_pump1',
    timeWarp: 'time_warp',
    gaugeBar: 'gauge_bar',
    gaugeSlow: 'gauge_slow',
    gaugeMid: 'gauge_mid',
    gaugeFast: 'gauge_fast',
    gaugeVeryFast: 'gauge_veryfast',
    speedArrow: 'speed_arrow',
    bgBig: 'bg_big',
    bgPanel1: 'bg_panel1',
    bgPanel2: 'bg_panel2',
    bgPanel3: 'bg_panel3',
    bgPanel4: 'bg_panel4',
    needleH: 'needle_h'
  }
  // Frames déclinées en couleurs par recoloration runtime (un palier par
  // entrée de SlimeColors, suffixe de clé _t<index> ; _t0 = PNG d'origine).
  const VARIANT_BASES = ['idle0', 'idle1', 'jump', 'fall', 'land', 'ledge', 'ledgeUp', 'ledgeTop',
    'djPump0', 'djPump1', 'splat', 'death1', 'death2', 'death3', 'big']
  const imgs = {}
  let loaded = 0
  let ready = false
  let tiers = (typeof SlimeColors !== 'undefined') ? SlimeColors.load() : SlimeColors_DEFAULTS_FALLBACK()
  let animT = -1   // temps courant des effets animés (-1 : jamais tiqué)
  // Variantes animées réellement DESSINÉES depuis le dernier tick : seules
  // celles-ci sont régénérées (~1-3 sprites visibles au lieu des 15 bases —
  // l'ancien comportement coûtait 15-45 ms de pixels par tick = saccades).
  const usedAnim = new Set()
  function markAnim(key) { if (/_t\d+$/.test(key)) usedAnim.add(key) }

  function tierSuffix(i) { return i > 0 ? '_t' + i : '' }

  // ti défini : ne régénère que le palier i (tick d'animation) ; sinon tous.
  function makeVariants(key, im, ti) {
    const from = ti === undefined ? 1 : ti
    const to = ti === undefined ? tiers.length : ti + 1
    for (let i = from; i < to; i++) {
      if (!tiers[i]) continue
      try { imgs[key + tierSuffix(i)] = SlimeColors.recolor(im, tiers[i], animT < 0 ? 0 : animT) } catch (e) {}
    }
  }

  // Effets animés (rainbow/brillant/étoilé) : régénération des canvas à
  // ~10 fps max, LIMITÉE aux variantes réellement dessinées depuis le dernier
  // tick (marquées par markAnim via les fonctions de dessin). Coût nul si
  // aucun palier animé, et quasi nul sinon (1-3 petits sprites, pas 15).
  function tickAnimated(now) {
    if (typeof SlimeColors === 'undefined' || !ready || animT === now) return
    let hasAnim = false
    for (let i = 1; i < tiers.length; i++) if (SlimeColors.isAnimated(tiers[i])) { hasAnim = true; break }
    if (!hasAnim) return
    if (animT >= 0 && now > animT && now - animT < 0.1) return
    const jobs = []
    for (const k of usedAnim) {
      const m = /^(.+)_t(\d+)$/.exec(k)
      if (!m) continue
      const base = imgs[m[1]], ti = +m[2]
      if (base && base.width && tiers[ti] && SlimeColors.isAnimated(tiers[ti])) jobs.push([m[1], base, ti])
    }
    usedAnim.clear()
    if (!jobs.length) return
    animT = now
    for (const [k, im, ti] of jobs) makeVariants(k, im, ti)
  }

  // Nouvelle liste de paliers (éditeur) : purge des variantes _t* et
  // régénération immédiate si les PNG de base sont déjà chargés. Le suivi
  // d'usage repart à zéro : tout est frais, rien à rafraîchir d'urgence.
  function setTiers(list) {
    tiers = list
    usedAnim.clear()
    for (const k of Object.keys(imgs)) if (/_t\d+$/.test(k)) delete imgs[k]
    if (!ready) return
    for (const base of VARIANT_BASES) {
      const im = imgs[base]
      if (im && im.width) makeVariants(base, im)
    }
  }

  // Hors navigateur (simulations Node) : palier vert seul.
  function SlimeColors_DEFAULTS_FALLBACK() { return [{ min: 0, hex: '#3ecb3e' }] }

  function load() {
    const keys = Object.keys(defs)
    for (const k of keys) {
      const im = new Image()
      im.onload = () => {
        if (VARIANT_BASES.indexOf(k) >= 0) makeVariants(k, im)
        if (++loaded >= keys.length) ready = true
      }
      im.onerror = () => { loaded++ }
      im.src = 'ASSETS/sprites/game/' + defs[k] + '.png?v=20260926a'
      imgs[k] = im
    }
  }

  function draw(key, cx, feetY, w, sx, sy) {
    markAnim(key)
    const im = imgs[key]
    if (!im || !im.width || im.complete === false) return false
    const c = ctx()
    const sw = w
    const sh = im.height * (w / im.width)
    c.save()
    c.imageSmoothingEnabled = false
    c.drawImage(im, cx - sw * (sx || 1) / 2, feetY - sh * (sy || 1), sw * (sx || 1), sh * (sy || 1))
    c.restore()
    return true
  }

  function drawImage(key, x, y, w, h) {
    markAnim(key)
    const im = imgs[key]
    if (!im || !im.width || im.complete === false) return false
    const c = ctx()
    c.save()
    c.imageSmoothingEnabled = false
    c.drawImage(im, x, y, w, h || im.height * (w / im.width))
    c.restore()
    return true
  }

  function drawSrc(key, sx, sy, sw, sh, dx, dy, dw, dh) {
    markAnim(key)
    const im = imgs[key]
    if (!im || !im.width || im.complete === false) return false
    const c = ctx()
    c.save()
    c.imageSmoothingEnabled = false
    c.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh)
    c.restore()
    return true
  }

  // Ancre haut-gauche (utile pour les frames calées comme le ledge catch),
  // miroir horizontal optionnel.
  function drawTL(key, x, y, w, flip) {
    markAnim(key)
    const im = imgs[key]
    if (!im || !im.width || im.complete === false) return false
    const c = ctx()
    const h = im.height * (w / im.width)
    c.save()
    c.imageSmoothingEnabled = false
    if (flip) {
      c.translate(x + w, y)
      c.scale(-1, 1)
      c.drawImage(im, 0, 0, w, h)
    } else {
      c.drawImage(im, x, y, w, h)
    }
    c.restore()
    return true
  }

  function rotated(key, angle, px, py, ax, ay, scale) {
    markAnim(key)
    const im = imgs[key]
    if (!im || !im.width || im.complete === false) return false
    const c = ctx()
    const w = im.width * (scale || 1)
    const h = im.height * (scale || 1)
    c.save()
    c.imageSmoothingEnabled = false
    c.translate(px, py)
    c.rotate(angle)
    c.drawImage(im, -w * ax, -h * ay, w, h)
    c.restore()
    return true
  }

  function natW(key) {
    const im = imgs[key]
    return im && im.width ? im.width : 0
  }

  function natH(key) {
    const im = imgs[key]
    return im && im.height ? im.height : 0
  }

  function get(key) {
    markAnim(key)
    return imgs[key]
  }

  return {
    load,
    setTiers,
    tickAnimated,
    draw,
    drawImage,
    drawSrc,
    drawTL,
    rotated,
    natW,
    natH,
    get,
    get ready() { return ready }
  }
})()
