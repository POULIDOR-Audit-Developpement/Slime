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
    bgBig: 'bg_big',
    bgPanel1: 'bg_panel1',
    bgPanel2: 'bg_panel2',
    bgPanel3: 'bg_panel3',
    bgPanel4: 'bg_panel4',
    needleH: 'needle_h'
  }
  for (const base of ['idle0', 'idle1', 'jump', 'fall', 'land']) {
    for (const tier of ['orange', 'red']) {
      defs[base + '_' + tier] = base + '_' + tier
    }
  }
  const imgs = {}
  let loaded = 0
  let ready = false

  function load() {
    const keys = Object.keys(defs)
    for (const k of keys) {
      const im = new Image()
      im.onload = () => { if (++loaded >= keys.length) ready = true }
      im.onerror = () => { loaded++ }
      im.src = 'ASSETS/sprites/game/' + defs[k] + '.png'
      imgs[k] = im
    }
  }

  function draw(key, cx, feetY, w, sx, sy) {
    const im = imgs[key]
    if (!im || !im.width || !im.complete) return false
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
    const im = imgs[key]
    if (!im || !im.width || !im.complete) return false
    const c = ctx()
    c.save()
    c.imageSmoothingEnabled = false
    c.drawImage(im, x, y, w, h || im.height * (w / im.width))
    c.restore()
    return true
  }

  function drawSrc(key, sx, sy, sw, sh, dx, dy, dw, dh) {
    const im = imgs[key]
    if (!im || !im.width || !im.complete) return false
    const c = ctx()
    c.save()
    c.imageSmoothingEnabled = false
    c.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh)
    c.restore()
    return true
  }

  function rotated(key, angle, px, py, ax, ay, scale) {
    const im = imgs[key]
    if (!im || !im.width || !im.complete) return false
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

  return {
    load,
    draw,
    drawImage,
    drawSrc,
    rotated,
    natW,
    natH,
    get ready() { return ready }
  }
})()
