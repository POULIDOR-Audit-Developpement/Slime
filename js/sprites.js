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
    // « Plateformes fun » : turbo, dorée, bascule (recolorées JAMAIS — hors
    // VARIANT_BASES, règles perf AGENTS.md).
    tileTurbo: 'tile_turbo',
    tileGold: 'tile_gold',
    tileSeesaw: 'tile_seesaw',
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
    // fonds illustrés par niveau (niveau = piste BGM, planches v5-v7)
    bgLevel1: 'bg_level1',
    bgLevel2: 'bg_level2',
    bgLevel3: 'bg_level3',
    // tuiles « basic » des niveaux 2 et 3 (le niveau 1 garde tileGreen)
    tileVolcanic: 'tile_volcanic',
    tileManor: 'tile_manor',
    needleH: 'needle_h',
    decArmchair: 'dec_armchair', decBooks: 'dec_books', decBush1: 'dec_bush1', decBush2: 'dec_bush2',
    decBushFern: 'dec_bush_fern', decBushLeafy: 'dec_bush_leafy', decBushTrunk: 'dec_bush_trunk', decCandle1: 'dec_candle1',
    decCandle2: 'dec_candle2', decCandleWall: 'dec_candle_wall', decCauldron: 'dec_cauldron', decChandelierDark1: 'dec_chandelier_dark1',
    decChandelierDark2: 'dec_chandelier_dark2', decChandelierGold: 'dec_chandelier_gold', decClock: 'dec_clock', decConsole: 'dec_console',
    decFan: 'dec_fan', decFlamedrop: 'dec_flamedrop', decFlamedrops: 'dec_flamedrops', decFlowers3: 'dec_flowers3',
    decFlowers4: 'dec_flowers4', decFlowers5: 'dec_flowers5', decFlowers6: 'dec_flowers6', decFlowers7: 'dec_flowers7',
    decFlowersPink: 'dec_flowers_pink', decFlowersPurple: 'dec_flowers_purple', decFlowersWhite: 'dec_flowers_white', decLadder: 'dec_ladder',
    decLavaBubbles: 'dec_lava_bubbles', decLog1: 'dec_log1', decPine1: 'dec_pine1', decPine2: 'dec_pine2',
    decPine3: 'dec_pine3', decPine4: 'dec_pine4', decPine5: 'dec_pine5', decPine6: 'dec_pine6',
    decPipeElbow: 'dec_pipe_elbow', decPipeStub: 'dec_pipe_stub', decRock3: 'dec_rock3', decRockSingle: 'dec_rock_single',
    decRockpileBig: 'dec_rockpile_big', decRockpileMossy: 'dec_rockpile_mossy', decRockpileSmall: 'dec_rockpile_small', decSprout1: 'dec_sprout1',
    decSprout2: 'dec_sprout2', decSteamPipe: 'dec_steam_pipe', decSteamVent: 'dec_steam_vent', decStump1: 'dec_stump1',
    decStumpBig: 'dec_stump_big', decTree1: 'dec_tree1', decTree2: 'dec_tree2', decTreeBig: 'dec_tree_big',
    decTreeCypress: 'dec_tree_cypress', decTreeRound: 'dec_tree_round', decTreeYellow: 'dec_tree_yellow', decWheel1: 'dec_wheel1',
    decWheel2: 'dec_wheel2', decWheel3: 'dec_wheel3', hazFlame: 'haz_flame', hazShadowEyes: 'haz_shadow_eyes',
    platBridge1: 'plat_bridge1', platBridge2: 'plat_bridge2', platBridge5: 'plat_bridge5', platDirtWide: 'plat_dirt_wide',
    platGrass1: 'plat_grass1', platGrass10: 'plat_grass10', platGrass2: 'plat_grass2', platGrass3: 'plat_grass3',
    platGrass4: 'plat_grass4', platGrass5: 'plat_grass5', platGrass6: 'plat_grass6', platGrass7: 'plat_grass7',
    platGrass8: 'plat_grass8', platGrass9: 'plat_grass9', platGrass1x1: 'plat_grass_1x1', platGrass1x1b: 'plat_grass_1x1b',
    platGrass2x1: 'plat_grass_2x1', platGrass3x1: 'plat_grass_3x1', platGrassFlowers1: 'plat_grass_flowers1', platGrassFlowers2: 'plat_grass_flowers2',
    platGrassFlowers3: 'plat_grass_flowers3', platGrassFlowersWide: 'plat_grass_flowers_wide', platGrassNue1: 'plat_grass_nue1', platGrassNue2: 'plat_grass_nue2',
    platGrateSmall: 'plat_grate_small', platGrid1: 'plat_grid1', platGrid2: 'plat_grid2', platGrid3: 'plat_grid3',
    platGrid4: 'plat_grid4', platGrid5: 'plat_grid5', platGrid6: 'plat_grid6', platGrid7: 'plat_grid7',
    platMini2: 'plat_mini2', platMiniGrass2: 'plat_mini_grass2', platMiniGrass3: 'plat_mini_grass3', platMossy1: 'plat_mossy1',
    platMossy2: 'plat_mossy2', platMossy3: 'plat_mossy3', platMossy5: 'plat_mossy5', platMossy6: 'plat_mossy6',
    platPath1: 'plat_path1', platPath2: 'plat_path2', platPath3: 'plat_path3', platPathBroken: 'plat_path_broken',
    platPlate: 'plat_plate', platSlabMini: 'plat_slab_mini', platStone1x1: 'plat_stone_1x1', platStone2x1: 'plat_stone_2x1',
    platStone3x1: 'plat_stone_3x1', platStoneBroken: 'plat_stone_broken', platStoneWeb: 'plat_stone_web', platStoneWorn: 'plat_stone_worn',
    platVentRiveted: 'plat_vent_riveted', platVentSmall: 'plat_vent_small', platVolcanicCorner: 'plat_volcanic_corner', platVolcanicTop: 'plat_volcanic_top',
    platVolcanicWide: 'plat_volcanic_wide', platWalkway: 'plat_walkway', platWood: 'plat_wood'
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
      im.src = 'ASSETS/sprites/game/' + defs[k] + '.png?v=20261001b'
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

  // Fond par piste musicale : game.js recolore bg_big/bg_panel* UNE fois par
  // bascule (jamais par frame — règles perf AGENTS.md) et remplace la base.
  // setBase n'accepte qu'un canvas réel (largeur > 0) ; les clés inconnues et
  // les valeurs vides sont refusées — la base reste alors l'PNG d'origine.
  function base(key) {
    return imgs[key]
  }

  function setBase(key, cv) {
    if (!key || !imgs[key] || !cv || !cv.width) return false
    imgs[key] = cv
    return true
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
    base,
    setBase,
    get ready() { return ready }
  }
})()
