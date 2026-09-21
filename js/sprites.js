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
    small: 'small'
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

  return {
    load,
    draw,
    get ready() { return ready }
  }
})()
