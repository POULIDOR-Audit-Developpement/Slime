litecanvas({
  autoscale: true
})

let VSC = 1, VOX = 0, VOY = 0
let framePattern = null
let voidPattern = null

function calcView() {
  VSC = Math.min(W / VW, H / VH)
  VOX = (W - VW * VSC) / 2
  VOY = (H - VH * VSC) / 2
}

function buildFramePattern() {
  const img = paint(30, 30, () => {
    rectfill(0, 0, 30, 30, C_FRAME)
    rectfill(0, 0, 15, 15, C_FRAME_L)
    rectfill(15, 15, 15, 15, C_FRAME_L)
  })
  framePattern = ctx().createPattern(img, 'repeat')
}

function ensureVoidPattern() {
  if (voidPattern || !Sprites.ready) return
  const im = Sprites.get('voidBand')
  if (im && im.width) voidPattern = ctx().createPattern(im, 'repeat')
}

function drawOuterFrame() {
  const c = ctx()
  c.save()
  if (voidPattern) {
    c.setTransform(VSC, 0, 0, VSC, VOX, VOY)
    c.fillStyle = voidPattern
    c.fillRect(-VOX / VSC - 2, -VOY / VSC - 2, W / VSC + 4, H / VSC + 4)
  } else {
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.fillStyle = framePattern || '#131735'
    c.fillRect(0, 0, W, H)
  }
  c.restore()
}
const VERSION = '3.1'
// Murs de damage issus du layout éditable (onglet VUE de l'éditeur).
let WALL = { ceil: TIP_T, left: TIP_L, right: SPIKE_W }
// Réglages globaux des plateformes (onglet VUE), surchargés par plateforme.
let PLAT = { crumbleT: CRUMBLE_T, dynLife: 4, spdMul: 1 }
// Raccourci : physique courante (onglet PHYS de l'éditeur -> layout.phys).
const PH = () => Phys.phys()
// Largeur de dessin du sprite de référence (pour un rayon de 18).
const SLIME_DRAW_W = 44

function applyLayout() {
  const l = Patterns.getLayout()
  if (l && l.walls) {
    WALL = { ceil: l.walls.ceil, left: l.walls.left, right: l.walls.right }
  }
  if (l && l.plat) {
    PLAT = {
      crumbleT: Math.max(0.2, Math.min(2, +l.plat.crumbleT || CRUMBLE_T)),
      dynLife: Math.max(1, Math.min(10, +l.plat.dynLife || 4)),
      spdMul: Math.max(0.5, Math.min(2, +l.plat.spdMul || 1))
    }
  }
  Phys.setWalls(l && l.walls ? l.walls : null)
  Phys.setPhys(l && l.phys ? l.phys : null)
}

const COLORS = [
  '#0d0d21', '#191936', '#232348', '#2e2e5e',
  '#3ecb3e', '#1f7a1f', '#a5f0a5',
  '#3fbf46', '#1d7c2c', '#12521d',
  '#a06c33', '#7d5222', '#573813',
  '#38b6e8', '#1c7fb0', '#0e4d70',
  '#ffd83d', '#ff9d2e',
  '#e23b3b', '#8f1f1f',
  '#f4f4f4', '#0a0a12',
  '#6fdc4f', '#8a8ab0',
  '#9aa0ac', '#6b7280', '#3f4652',
  '#d8e8f4', '#a8bccb', '#7e93a3',
  '#cc6d1a', '#8f4a0f',
  '#ffd700',
  '#4a5ed7', '#5f74e3', '#4152c8', '#3946a8', '#6b83ec',
  '#131735', '#20264f',
  '#6b1d1d', '#c98d4b'
]
const C_BG0 = 0, C_BG1 = 1, C_BG2 = 2, C_BG3 = 3
const C_SLIME = 4, C_SLIME_D = 5, C_SLIME_L = 6
const C_P_TOP = 7, C_P_SIDE = 8, C_P_DARK = 9
const C_S_TOP = 10, C_S_SIDE = 11, C_S_DARK = 12
const C_D_TOP = 13, C_D_SIDE = 14, C_D_DARK = 15
const C_YELLOW = 16, C_ORANGE = 17
const C_RED = 18, C_RED_D = 19
const C_WHITE = 20, C_BLACK = 21, C_GREEN = 22, C_GRAY = 23
const C_CR_TOP = 24, C_CR_SIDE = 25, C_CR_DARK = 26
const C_GH_TOP = 27, C_GH_SIDE = 28, C_GH_DARK = 29
const C_BO_SIDE = 30, C_BO_DARK = 31
const C_GOLD = 32
const C_BLUE = 33, C_BLUE_L = 34, C_BLUE_D = 35, C_BLUE_XD = 36, C_BLUE_HI = 37
const C_FRAME = 38, C_FRAME_L = 39, C_LIFE_EMPTY = 40
const C_S_HI = 41

const SFX_JUMP = [,,392,,.03,.12,1,3.6,,69,,,,,,,,.95,.1]
const SFX_COIN = [,,1675,,.06,.24,1,1.82,,,837,.06]
const SFX_HURT = [,,537,.02,.02,.22,1,1.59,-6.98,4.97]
const SFX_DIE = [,,333,.01,0,.9,4,1.9,,,,,,.5,,.6]
const SFX_LAND = [2,.8,999,,,,,1.5,,.3,-99,.1,1.63,,,.11,.22]

const LETTERS = {
  S: ['.####', '#....', '.###.', '....#', '####.'],
  L: ['#....', '#....', '#....', '#....', '#####'],
  I: ['#####', '..#..', '..#..', '..#..', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  E: ['#####', '#....', '####.', '#....', '#####']
}

let state = 'title'
let runStarted = false
let camX = 0, camSpd = 40, elapsed = 0
let platforms = [], balls = [], particles = [], decors = [], wallsArr = []
let slime = null
let charge = { on: false, t: 0, id: -1, aim: { x: 0, y: 0 } }
let ballsCollected = 0, goldsCollected = 0, scoreCode = null, deathT = 0, shakeT = 0, copiedT = 0
let best = 0, newRecord = false
let testMode = false, testSecT = 0

function slimeR() { return PH().slimeR }
function slimeDrawW() { return SLIME_DRAW_W * (slimeR() / 18) }
function currentScore() { return Math.floor(camX / 10) + ballsCollected * 10 + goldsCollected * GOLD_PTS }
function camRatio() {
  const P = PH()
  return clamp((camSpd - P.camBase) / Math.max(1, P.camMax - P.camBase), 0, 1)
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60)
  return m + ':' + String(s).padStart(2, '0')
}

function h32(n) {
  n = Math.imul(n ^ (n >>> 16), 2246822519)
  n = Math.imul(n ^ (n >>> 13), 3266489917)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

// --- Génération 100% patterns : le pool (utilisateur ou par défaut) est
// --- instancié, aligné sur la dernière plateforme, validé, puis ajouté.
function spawnNext() {
  const last = platforms[platforms.length - 1]
  const sec = Patterns.spawnSection(last, elapsed)
  for (const p of sec.platforms) platforms.push(p)
  for (const b of sec.balls) balls.push(b)
  for (const d of sec.decor) decors.push(d)
  for (const wl of sec.walls || []) wallsArr.push(wl)
  if (sec.platforms.length && sec.platforms[0].safety && Patterns.usingDefaults()) {
    console.warn('SLIME : pool vide, plateforme de sécurité utilisée')
  }
}

function genUntil() {
  const last = platforms[platforms.length - 1]
  if (last.x + last.w < camX + VW + 240) spawnNext()
}

function cleanup() {
  platforms = platforms.filter(p => !p.dead && p.x + p.w > camX - 80)
  balls = balls.filter(b => !b.taken && b.x > camX - 40)
  decors = decors.filter(d => d.x + d.w > camX - 80)
  wallsArr = wallsArr.filter(wl => wl.x + wl.w > camX - 80)
}

function killPlat(p, color) {
  if (p.dead) return
  p.dead = true
  burst(p.x + p.w / 2, p.y + 6, color, 10, 110)
  if (slime.groundPlat === p) {
    slime.grounded = false
    slime.groundPlat = null
  }
}

function burst(x, y, color, n, pow) {
  for (let i = 0; i < n; i++) {
    particles.push({ x, y, vx: rand(-pow, pow), vy: rand(-pow, 0), life: rand(0.3, 0.7), c: color, r: rand(1.5, 3) })
  }
}

function startGame() {
  elapsed = 0
  camX = 0
  camSpd = 40
  platforms = []
  balls = []
  particles = []
  decors = []
  wallsArr = []
  ballsCollected = 0
  goldsCollected = 0
  newRecord = false
  scoreCode = null
  deathT = 0
  copiedT = 0
  shakeT = 0
  testSecT = 0
  charge = { on: false, t: 0, id: -1, aim: { x: 0, y: 0 } }
  // Départ : plateforme + slime centrés au milieu de l'écran.
  const first = { x: VW / 2 - (5 * CELL) / 2, row: 2, y: rowY(2), baseY: rowY(2), w: 5 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0, spike: null }
  platforms.push(first)
  slime = {
    x: VW / 2, y: rowY(2) - slimeR(), vx: 0, vy: 0, size: 3,
    grounded: true, groundPlat: first, jumpMul: 1, invuln: 0, squashT: 0,
    coyote: PH().coyote, buffer: 0, bufferRel: false, bufferId: -1, bufferAim: null
  }
  slime.r = slimeR()
  let guard = 0
  while (platforms[platforms.length - 1].x + platforms[platforms.length - 1].w < VW * 2 && guard++ < 60) spawnNext()
  state = 'playing'
  runStarted = false
}

function damage() {
  if (slime.invuln > 0) return
  slime.size--
  slime.invuln = PH().invuln
  shakeT = 0.25
  sfx(SFX_HURT)
  burst(slime.x, slime.y, C_SLIME, 8, 120)
  if (slime.size < 1) die()
}

function die() {
  if (state === 'over') return
  state = 'over'
  deathT = 0
  charge.on = false
  const s = currentScore()
  newRecord = s > best && s > 0
  if (newRecord) {
    best = s
    try { localStorage.setItem('slime_best', String(best)) } catch (e) {}
  }
  scoreCode = Crypto.makeCode(s, elapsed)
  shakeT = 0.4
  sfx(SFX_DIE)
  burst(slime.x, slime.y, C_SLIME, 24, 220)
  burst(slime.x, slime.y, C_SLIME_L, 12, 160)
}

function doJump() {
  const P = PH()
  const p = 0.12 + 0.88 * Math.min(charge.t / P.chargeT, 1)
  const v = lerp(P.vmin, P.vmax, p) * slime.jumpMul
  const gp = slime.groundPlat
  const ang = Math.atan2(charge.aim.y - slime.y, charge.aim.x - slime.x)
  slime.vx = Math.cos(ang) * v
  slime.vy = Math.sin(ang) * v
  if (gp && gp.type === 'ghost') {
    killPlat(gp, C_GH_SIDE)
    sfx(SFX_COIN, -4, 0.4)
  }
  slime.grounded = false
  slime.groundPlat = null
  slime.jumpMul = 1
  slime.coyote = 0
  slime.buffer = 0
  runStarted = true
  sfx(SFX_JUMP)
}

// Consomme un appui mémorisé en l'air (jump buffer) à l'atterrissage :
// doigt encore posé -> la charge démarre ; déjà relâché -> saut faible immédiat.
function consumeBuffer() {
  if (!(slime.buffer > 0)) { slime.buffer = 0; return }
  const rel = slime.bufferRel, id = slime.bufferId, aim = slime.bufferAim
  slime.buffer = 0
  if (charge.on) return
  if (aim) charge.aim = aim
  if (rel) {
    charge.t = 0
    charge.on = false
    doJump()
  } else {
    charge.on = true
    charge.t = 0
    charge.id = id
  }
}

function land(p) {
  if (p.type === 'bouncy') {
    const P = PH()
    slime.vy = -P.bounceVy
    if (Math.abs(slime.vx) < P.bounceVx) slime.vx = P.bounceVx
    slime.squashT = 0.12
    slime.buffer = 0
    sfx(SFX_LAND, -2, 0.7)
    return
  }
  slime.grounded = true
  slime.groundPlat = p
  slime.vy = 0
  slime.y = p.y - slime.r
  slime.squashT = 0.1
  slime.jumpMul = p.type === 'sticky' ? PH().stickyMul : 1
  if (p.type === 'crumble' && !p.crackT) p.crackT = p.crumbleT || PLAT.crumbleT
  if (p.type === 'dynamic' && !p.timerSet) {
    p.timerSet = true
    p.timer = p.dynLife || PLAT.dynLife
  }
  sfx(SFX_LAND, 0, 0.2)
  consumeBuffer()
}

function updSlime(dt) {
  const P = PH()
  const prevY = slime.y
  if (slime.grounded) {
    const p = slime.groundPlat
    if (!p || p.dead || slime.x < p.x - 10 || slime.x > p.x + p.w + 10) {
      if (p && p.type === 'ghost' && !p.dead) {
        killPlat(p, C_GH_SIDE)
        sfx(SFX_COIN, -4, 0.4)
      }
      slime.grounded = false
      slime.groundPlat = null
      // Quitter le sol sans sauter : fenêtre de coyote encore disponible.
    } else {
      slime.vx *= Math.pow(0.002, dt)
      if (Math.abs(slime.vx) < 2) slime.vx = 0
      slime.x += slime.vx * dt
      slime.y = p.y - slime.r
      slime.coyote = P.coyote
      slime.buffer = 0
    }
  }
  if (!slime.grounded) {
    if (slime.coyote > 0) slime.coyote -= dt
    if (slime.buffer > 0) slime.buffer -= dt
    slime.vy += P.grav * dt
    if (slime.vy > P.fallMax) slime.vy = P.fallMax
    slime.vx *= Math.pow(P.dragAir, dt)
    slime.x += slime.vx * dt
    slime.y += slime.vy * dt
    if (slime.y - slime.r < WALL.ceil) {
      slime.y = WALL.ceil + slime.r
      if (slime.vy < 0) slime.vy = 0
      damage()
    }
    if (slime.vy >= 0) {
      for (const p of platforms) {
        if (p.dead) continue
        if (slime.x > p.x - 6 && slime.x < p.x + p.w + 6 && prevY + slime.r <= p.y + 8 && slime.y + slime.r >= p.y) {
          land(p)
          break
        }
      }
    }
  }
  // Murs verticaux : contact latéral = repoussé (dégât si flancs piqués).
  // Le sommet atterrissable est géré par la plateforme wallTop (y+r == y1
  // quand on est posé dessus, donc pas d'intersection ici).
  for (const wl of wallsArr) {
    if (slime.x + slime.r > wl.x && slime.x - slime.r < wl.x + wl.w && slime.y + slime.r > wl.y1 + 2 && slime.y - slime.r < wl.y2 - 2) {
      const cx = wl.x + wl.w / 2
      if (slime.x < cx) {
        slime.x = wl.x - slime.r
        if (slime.vx > 0) slime.vx = -100
      } else {
        slime.x = wl.x + wl.w + slime.r
        if (slime.vx < 0) slime.vx = 100
      }
      if (wl.spiked) {
        damage()
        if (wl.kind === 'ceil') slime.vy = Math.max(slime.vy, 120 * P.hurtRecoil)
        else {
          slime.vy = -240 * P.hurtRecoil
          slime.grounded = false
          slime.groundPlat = null
        }
      }
      break
    }
  }
  for (const p of platforms) {
    if (p.spike && slime.y + slime.r > p.y - 10 && slime.y + slime.r < p.y + 4 && slime.x > p.spike.x1 - 4 && slime.x < p.spike.x2 + 4) {
      slime.vy = -240 * P.hurtRecoil
      slime.grounded = false
      slime.groundPlat = null
      damage()
      break
    }
  }
  if (slime.x - slime.r < camX + WALL.left) {
    slime.x = camX + WALL.left + slime.r
    if (slime.vx < 0) slime.vx = 140 * P.hurtRecoil
    damage()
  }
  if (slime.x + slime.r > camX + VW - WALL.right) {
    slime.x = camX + VW - WALL.right - slime.r
    if (slime.vx > 0) slime.vx = -120 * P.hurtRecoil
    damage()
  }
  if (slime.invuln > 0) slime.invuln -= dt
  if (slime.squashT > 0) slime.squashT -= dt
  slime.r = slimeR()
}

function updBalls() {
  for (const b of balls) {
    if (b.taken) continue
    if (dist(slime.x, slime.y, b.x, b.y) < slime.r + (b.gold ? 9 : 6)) {
      b.taken = true
      if (b.gold) {
        goldsCollected++
        sfx(SFX_COIN, 2, 1.2)
        burst(b.x, b.y, C_GOLD, 14, 160)
      } else {
        ballsCollected++
        sfx(SFX_COIN)
        burst(b.x, b.y, b.o ? C_ORANGE : C_YELLOW, 6, 90)
      }
    }
  }
}

function updParticles(dt) {
  for (const pt of particles) {
    pt.vy += 500 * dt
    pt.x += pt.vx * dt
    pt.y += pt.vy * dt
    pt.life -= dt
  }
  particles = particles.filter(p => p.life > 0)
}

function update(dt) {
  if (dt > 1) dt /= 1000
  if (iskeypressed('m')) Music.toggle()
  if (state === 'title') { camX += 14 * dt; return }
  if (state === 'over') { deathT += dt; if (copiedT > 0) copiedT -= dt; updParticles(dt); if (shakeT > 0) shakeT -= dt; return }
  // Avant le premier saut : tout est gelé (caméra, chrono, timers, musique),
  // seule la visée du saut est active.
  if (!runStarted) {
    if (charge.on) {
      charge.t += dt
      if (!slime.grounded && slime.coyote <= 0) charge.on = false
    }
    updParticles(dt)
    return
  }
  elapsed += dt
  const P = PH()
  camSpd = testMode ? 55 : Math.min(P.camBase + Math.floor(elapsed / P.camRampT) * 5, P.camMax)
  camX += camSpd * dt
  if (testMode) testSecT += dt
  if (shakeT > 0) shakeT -= dt
  genUntil()
  cleanup()
  for (const p of platforms) {
    if (p.type === 'dynamic') p.y = p.baseY + Math.sin(T * p.spd * PLAT.spdMul + p.ph) * p.amp
    if (p.crackT > 0) {
      p.crackT -= dt
      if (p.crackT <= 0) {
        p.crackT = 0
        killPlat(p, C_CR_SIDE)
        sfx(SFX_DIE, 2, 0.3)
      }
    }
    if (p.timerSet) {
      p.timer -= dt
      if (p.timer <= 0) {
        p.timer = 0
        killPlat(p, C_BLUE_L)
        sfx(SFX_DIE, 2, 0.3)
      }
    }
  }
  updSlime(dt)
  if (charge.on) {
    charge.t += dt
    if (!slime.grounded && slime.coyote <= 0) charge.on = false
  }
  updBalls()
  updParticles(dt)
  Music.tick(dt, camRatio())
  if (slime.x + slime.r < camX) die()
  if (slime.y - slime.r > VH + 30) die()
}

function tap(px, py, touchId) {
  calcView()
  const x = (px - VOX) / VSC
  const y = (py - VOY) / VSC
  if (x < 30 && y < 24) { Music.toggle(); return }
  if (fsSupported() && x > VW - 34 && y < 26) { toggleFullscreen(); return }
  if (state === 'title') startGame() // pas de return : ce même appui charge le 1er saut
  if (state === 'over') {
    if (deathT < 0.7) return
    if (hitBtn(x, y, BTN_COPY)) { copyCode(); return }
    if (hitBtn(x, y, BTN_REPLAY)) { startGame(); return }
    return
  }
  if (slime.grounded || slime.coyote > 0) {
    if (!charge.on) {
      charge.on = true
      charge.t = 0
      charge.id = touchId
      charge.aim = { x: clamp(x, 0, VW) + camX, y: clamp(y, 0, VH) }
    }
  } else if (PH().jumpBuffer > 0) {
    // En l'air : l'appui est mémorisé et sera consommé à l'atterrissage.
    slime.buffer = PH().jumpBuffer
    slime.bufferRel = false
    slime.bufferId = touchId
    slime.bufferAim = { x: clamp(x, 0, VW) + camX, y: clamp(y, 0, VH) }
  }
}

function tapping(px, py, touchId) {
  calcView()
  if (charge.on && touchId === charge.id) {
    charge.aim = { x: clamp((px - VOX) / VSC, 0, VW) + camX, y: clamp((py - VOY) / VSC, 0, VH) }
  }
}

function untap(x, y, touchId) {
  if (charge.on && touchId === charge.id) {
    charge.on = false
    doJump()
  } else if (slime.buffer > 0 && touchId === slime.bufferId) {
    slime.bufferRel = true
  }
}

function bgLayer(f, seed, cb) {
  const off = camX * f
  const c0 = Math.floor(off / 64) - 1
  const c1 = Math.floor((off + VW) / 64) + 1
  for (let c = c0; c <= c1; c++) {
    cb(c * 64 - off, h32(c * 91 + seed), h32(c * 137 + seed + 7), h32(c * 31 + seed + 13))
  }
}

function drawBG() {
  cls(C_BLUE)
  bgLayer(0.12, 11, (x, h, h2, h3) => {
    rectfill(x, CEIL, 64, VH - CEIL, h2 < 0.5 ? C_BLUE_D : C_BLUE)
    if (h < 0.45) rectfill(x + 6 + h * 26, 36 + h3 * 130, 24 + h2 * 22, 70 + h * 90, C_BLUE_L)
  })
  if (Sprites.ready) {
    const bw = 350
    const off1 = -(camX * 0.08 % (bw + 280))
    alpha(0.42)
    for (let k = -1; k < 3; k++) Sprites.drawImage('bgBig', off1 + k * (bw + 280), 96, bw, VH - 96)
    alpha(0.85)
    const off2 = -(camX * 0.3 % 760)
    for (let k = 0; k < 3; k++) {
      const h1 = h32(k * 13 + 5), h2v = h32(k * 29 + 11)
      Sprites.drawImage('bgPanel' + (1 + (h1 * 4 | 0)), off2 + k * 380 + h1 * 220, 74 + h2v * 90, 60)
    }
    alpha(1)
  }
  bgLayer(0.28, 77, (x, h, h2, h3) => {
    if (h < 0.22) rectfill(x + h2 * 40, 30 + h3 * 180, 14, 3, C_BLUE_XD)
    if (h > 0.5 && h < 0.62) rectfill(x + h3 * 40, 40 + h2 * 160, 3, 26, C_BLUE_XD)
    if (h2 < 0.14) rectfill(x + h * 44, 60 + h3 * 150, 7, 7, C_BLUE_HI)
    if (h > 0.86) rectfill(x + h2 * 40, 100 + h * 90, 18, 3, C_BLUE_HI)
  })
}

function drawVignette() {
  const c = 46
  alpha(0.22)
  rectfill(0, 0, c, 4, C_BLACK)
  rectfill(0, 0, 4, c, C_BLACK)
  rectfill(VW - c, 0, c, 4, C_BLACK)
  rectfill(VW - 4, 0, 4, c, C_BLACK)
  rectfill(0, VH - 4, c, 4, C_BLACK)
  rectfill(0, VH - c, 4, c, C_BLACK)
  rectfill(VW - c, VH - 4, c, 4, C_BLACK)
  rectfill(VW - 4, VH - c, 4, c, C_BLACK)
  alpha(0.12)
  rectfill(0, 4, c, 5, C_BLACK)
  rectfill(4, 0, 5, c, C_BLACK)
  rectfill(VW - c - 5, 4, c, 5, C_BLACK)
  rectfill(VW - 9, 0, 5, c, C_BLACK)
  rectfill(0, VH - 9, c, 5, C_BLACK)
  rectfill(4, VH - c - 5, 5, c, C_BLACK)
  rectfill(VW - c - 5, VH - 9, c, 5, C_BLACK)
  rectfill(VW - 9, VH - c - 5, 5, c, C_BLACK)
  alpha(1)
}

function drawTitle() {
  const word = 'SLIME'
  const px = 9
  const totalW = word.length * 6 * px - px
  rectfill(VW / 2 - totalW / 2 - 20, 34, totalW + 40, 5 * px + 30, C_FRAME, 8)
  for (let dx = 0; dx < totalW + 40; dx += 12) {
    rectfill(VW / 2 - totalW / 2 - 20 + dx, 32, 4, 4, C_WHITE)
    rectfill(VW / 2 - totalW / 2 - 20 + dx, 34 + 5 * px + 26, 4, 4, C_WHITE)
  }
  for (let dy = 0; dy < 5 * px + 30; dy += 12) {
    rectfill(VW / 2 - totalW / 2 - 22, 34 + dy, 4, 4, C_WHITE)
    rectfill(VW / 2 + totalW / 2 + 18, 34 + dy, 4, 4, C_WHITE)
  }
  let lx = (VW - totalW) / 2
  for (let li = 0; li < word.length; li++) {
    const rows = LETTERS[word[li]]
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (rows[r][c] === '#') {
          rectfill(lx + c * px - 2, 48 + r * px, px + 4, px, C_BLACK)
          rectfill(lx + c * px + 2, 48 + r * px, px, px + 4, C_BLACK)
          rectfill(lx + c * px, 48 + r * px - 2, px, px + 4, C_BLACK)
          rectfill(lx + c * px, 48 + r * px + 2, px, px + 4, C_BLACK)
        }
      }
    }
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (rows[r][c] === '#') {
          rectfill(lx + c * px, 48 + r * px, px, px, r < 2 ? C_SLIME_L : C_GREEN)
        }
      }
    }
    for (let c = 0; c < 5; c++) {
      if (rows[4][c] === '#' && h32(li * 31 + c * 7) < 0.4) {
        const dl = 1 + Math.floor(h32(li * 13 + c) * 3)
        rectfill(lx + c * px + 1, 48 + 5 * px, px - 2, dl * 4, C_GREEN)
      }
    }
    lx += 6 * px
  }
  const bob = Math.sin(T * 2.5) * 6
  if (Sprites.ready) {
    alpha(0.25)
    push(VW / 2, 153, 0, 1 + 0.05 * bob / 6, 0.28)
    circfill(0, 0, 24, C_BLACK)
    pop()
    alpha(1)
    Sprites.draw('big', VW / 2, 152 + bob, 48)
  } else {
    drawBlob(VW / 2, 128 + bob, 20, 1, 1, false)
  }
  textalign('center', 'top')
  textsize(10)
  text(VW / 2, 166, 'Maintiens pour charger, vise avec le curseur, relache', C_WHITE)
  alpha(0.55 + 0.45 * Math.sin(T * 3))
  text(VW / 2, 182, "Vise meme vers l'arriere pour les billes dorees !", C_GOLD)
  alpha(1)
  textsize(12)
  alpha(0.55 + 0.45 * Math.sin(T * 3))
  text(VW / 2, 200, 'Clique ou touche pour commencer', C_GREEN)
  alpha(1)
  if (window.innerHeight > window.innerWidth) {
    textsize(9)
    text(VW / 2, 244, 'Tourne ton ecran en paysage', C_ORANGE)
  } else if (/iP(hone|od|ad)/.test(navigator.userAgent || '') && !fsSupported()) {
    // iPhone/Safari sans API plein écran : l'ajout à l'écran d'accueil
    // lance le jeu plein écran (métas apple-mobile-web-app-*).
    textsize(8)
    alpha(0.7)
    text(VW / 2, 245, "Plein ecran : ajoute a l'ecran d'accueil", C_WHITE)
    alpha(1)
  }
  if (best > 0) {
    textsize(11)
    text(VW / 2, 222, 'RECORD : ' + best, C_GOLD)
  }
  textsize(8)
  text(VW - 24, VH - 12, 'v' + VERSION, C_GRAY)
  textalign('start', 'top')
}

function drawReadyHint() {
  textalign('center', 'top')
  textsize(10)
  alpha(0.55 + 0.45 * Math.sin(T * 3))
  text(VW / 2, 108, 'Maintiens pour viser, relache pour sauter', charge.on ? C_GREEN : C_GOLD)
  alpha(1)
  textalign('start', 'top')
}

function drawBlob(x, y, r, sx, sy, blink) {
  if (blink) return
  push(x, y, 0, sx, sy)
  circfill(0, -r * 0.3, r * 0.92 + 2, C_SLIME_D)
  rectfill(-r * 0.92 - 2, -r * 0.3, (r * 0.92 + 2) * 2, r * 1.3 + 2, C_SLIME_D)
  circfill(0, -r * 0.3, r * 0.92, C_SLIME)
  rectfill(-r * 0.92, -r * 0.3, r * 1.84, r * 1.3, C_SLIME)
  rectfill(-r * 0.92, r * 0.86, r * 1.84, r * 0.14, C_SLIME_D)
  circfill(-r * 0.3, -r * 0.35, r * 0.18, C_WHITE)
  circfill(r * 0.22, -r * 0.35, r * 0.18, C_WHITE)
  circfill(-r * 0.24, -r * 0.33, r * 0.09, C_BLACK)
  circfill(r * 0.28, -r * 0.33, r * 0.09, C_BLACK)
  alpha(0.7)
  circfill(-r * 0.45, -r * 0.72, r * 0.13, C_WHITE)
  alpha(1)
  pop()
}

function drawWalls() {
  for (const wl of wallsArr) {
    if (wl.kind === 'ceil' && wl.y2 - wl.y1 < 8) continue
    // corps : tuiles grises empilées
    if (Sprites.ready) {
      for (let ty = wl.y1; ty < wl.y2 - 6; ty += 24) {
        Sprites.drawImage('tileGray', wl.x, ty, wl.w, 24)
      }
    } else {
      for (let ty = wl.y1; ty < wl.y2 - 6; ty += CELL) {
        drawTile(wl.x, ty, C_CR_TOP, C_CR_SIDE)
      }
    }
    // cap clair à la pointe (sommet atterrissable pour une colonne)
    const capY = wl.kind === 'ground' ? wl.y1 + 2 : wl.y2 - 6
    rectfill(wl.x + 3, capY, wl.w - 6, 3, C_WHITE)
    // flancs piqués
    if (wl.spiked) {
      for (let sy = wl.y1 + 6; sy + 8 <= wl.y2 - 2; sy += 8) {
        shape([wl.x, sy, wl.x - 9, sy + 4, wl.x, sy + 8]); fill(C_RED_D)
        shape([wl.x, sy + 1, wl.x - 7, sy + 4, wl.x, sy + 7]); fill(C_RED)
        shape([wl.x + wl.w, sy, wl.x + wl.w + 9, sy + 4, wl.x + wl.w, sy + 8]); fill(C_RED_D)
        shape([wl.x + wl.w, sy + 1, wl.x + wl.w + 7, sy + 4, wl.x + wl.w, sy + 7]); fill(C_RED)
      }
    }
  }
}

function drawTile(x, y, top, side) {
  rect(x, y, 32, 32, C_BLACK, 7)
  rectfill(x + 2, y + 2, 28, 28, side, 6)
  rectfill(x + 2, y + 2, 28, 15, top, 5)
  rectfill(x + 6, y + 5, 9, 4, C_WHITE)
}

function drawPlat(p) {
  if (p.dead) return
  if (p.wallTop) return // dessiné par drawWalls (cap de la colonne)
  const n = Math.round(p.w / CELL)
  const jx = p.type === 'crumble' && p.crackT > 0 ? rand(-1.5, 1.5) : 0
  if (Sprites.ready) {
    if (p.type === 'ghost') alpha(0.5 + 0.25 * Math.sin(T * 6))
    if (p.type === 'sticky') {
      Sprites.drawImage('sticky', p.x + jx - 2, p.y - 4, p.w + 6, Math.min(54, (p.w + 6) * 0.5))
    } else if (p.type === 'dynamic') {
      const h = clamp(p.w * 0.14, 13, 19)
      Sprites.drawImage('dynStrip', p.x + jx, p.y, p.w, h)
      if (p.timerSet && p.timer < 1.5) {
        alpha(0.25 + 0.25 * Math.sin(T * 12))
        rectfill(p.x + jx, p.y, p.w, h, C_RED)
        alpha(1)
      }
    } else {
      const keys = { basic: 'tileGreen', crumble: 'tileGray', ghost: 'tileGhost', bouncy: 'tileOrange' }
      for (let i = 0; i < n; i++) {
        const tx = p.x + jx + i * CELL
        Sprites.drawImage(keys[p.type] || 'tileGreen', tx, p.y, CELL, 24)
        if (p.type === 'crumble') {
          rectfill(tx + 9, p.y + 6, 2, 8, C_CR_DARK)
          rectfill(tx + 20, p.y + 10, 2, 6, C_CR_DARK)
        }
        if (p.type === 'bouncy') {
          shape([tx + 7, p.y + 14, tx + 13, p.y + 7, tx + 19, p.y + 14])
          fill(C_WHITE)
          shape([tx + 15, p.y + 14, tx + 21, p.y + 7, tx + 27, p.y + 14])
          fill(C_WHITE)
        }
      }
    }
    if (p.type === 'ghost') alpha(1)
    if (p.spike) {
      for (let sx = p.spike.x1; sx + 8 <= p.spike.x2 + 0.1; sx += 8) {
        shape([sx, p.y + 1, sx + 4, p.y - 10, sx + 8, p.y + 1])
        fill(C_RED_D)
        shape([sx + 1, p.y + 1, sx + 4, p.y - 7, sx + 7, p.y + 1])
        fill(C_RED)
      }
    }
    return
  }
  if (p.type === 'ghost') alpha(0.5 + 0.25 * Math.sin(T * 6))
  if (p.type === 'sticky') {
    rectfill(p.x - 1, p.y - 1, p.w + 2, 34, C_BLACK, 8)
    rectfill(p.x + 1, p.y + 1, p.w - 2, 28, C_S_SIDE, 7)
    rectfill(p.x + 1, p.y + 1, p.w - 2, 13, C_S_TOP, 6)
    for (let c = 10; c < p.w - 10; c += 16) {
      const dl = 7 + Math.floor(h32(p.x + c) * 9)
      const dx = p.x + c + (h32(p.x * 3 + c) * 8 | 0)
      rectfill(dx, p.y + 26, 7, dl, C_S_SIDE)
      rectfill(dx, p.y + 24 + dl, 7, 2, C_S_DARK)
      rect(dx - 1, p.y + 25, 9, dl + 2, C_BLACK, 3)
    }
    for (let c = 8; c < p.w - 8; c += 24) rectfill(p.x + c, p.y + 4, 9, 4, C_S_HI)
  } else {
    for (let i = 0; i < n; i++) {
      const tx = p.x + jx + i * CELL
      const tops = { basic: C_P_TOP, dynamic: C_D_TOP, crumble: C_CR_TOP, ghost: C_GH_TOP, bouncy: C_ORANGE }
      const sides = { basic: C_P_SIDE, dynamic: C_D_SIDE, crumble: C_CR_SIDE, ghost: C_GH_SIDE, bouncy: C_BO_SIDE }
      drawTile(tx, p.y, tops[p.type] || C_P_TOP, sides[p.type] || C_P_SIDE)
      if (p.type === 'crumble') {
        rectfill(tx + 8, p.y + 4, 2, 9, C_CR_DARK)
        rectfill(tx + 18, p.y + 7, 2, 7, C_CR_DARK)
        rectfill(tx + 13, p.y + 13, 2, 5, C_CR_DARK)
      }
      if (p.type === 'bouncy') {
        shape([tx + 6, p.y + 10, tx + 12, p.y + 4, tx + 18, p.y + 10])
        fill(C_WHITE)
        shape([tx + 14, p.y + 10, tx + 20, p.y + 4, tx + 26, p.y + 10])
        fill(C_WHITE)
      }
    }
  }
  if (p.type === 'ghost') alpha(1)
  if (p.spike) {
    for (let sx = p.spike.x1; sx + 8 <= p.spike.x2 + 0.1; sx += 8) {
      shape([sx, p.y + 1, sx + 4, p.y - 10, sx + 8, p.y + 1])
      fill(C_RED_D)
      shape([sx + 1, p.y + 1, sx + 4, p.y - 7, sx + 7, p.y + 1])
      fill(C_RED)
    }
  }
}

function drawBall(b) {
  if (b.gold) {
    const pu = 1 + 0.12 * Math.sin(T * 5)
    alpha(0.4)
    circ(b.x, b.y, 10 * pu, C_GOLD)
    alpha(1)
    circ(b.x, b.y, 8, C_BLACK)
    circfill(b.x, b.y, 6.5, C_GOLD)
    circfill(b.x - 2, b.y - 2, 2, C_WHITE)
    return
  }
  const col = b.o ? C_ORANGE : C_YELLOW
  circ(b.x, b.y, 5.5, C_BLACK)
  circfill(b.x, b.y, 4, col)
  circfill(b.x - 1.5, b.y - 1.5, 1.4, C_WHITE)
}

function drawTrajectory() {
  const P = PH()
  const p = 0.12 + 0.88 * Math.min(charge.t / P.chargeT, 1)
  const v = lerp(P.vmin, P.vmax, p) * slime.jumpMul
  const ang = Math.atan2(charge.aim.y - slime.y, charge.aim.x - slime.x)
  let x = slime.x, y = slime.y
  let vx = Math.cos(ang) * v, vy = Math.sin(ang) * v
  const dt = 1 / 60
  let idx = 0
  for (let i = 0; i < 100; i++) {
    vy += P.grav * dt
    x += vx * dt
    y += vy * dt
    if (y - slime.r < WALL.ceil) { y = WALL.ceil + slime.r; if (vy < 0) vy = 0 }
    let hit = false
    if (vy >= 0) {
      for (const p2 of platforms) {
        if (p2.dead) continue
        if (x > p2.x - 6 && x < p2.x + p2.w + 6 && y + slime.r >= p2.y && y + slime.r <= p2.y + 14) { hit = true; break }
      }
    }
    if (i % 3 === 0) {
      alpha(0.85 - idx * 0.04)
      circfill(x, y, Math.max(1.2, 2.6 - idx * 0.12), C_WHITE)
      alpha(1)
      idx++
    }
    if (hit || y > VH + 40 || x < camX - 40 || x > camX + VW + 30) break
  }
}

function drawSlime() {
  const feet = slime.y + slime.r * 0.92
  const suffix = slime.size >= 3 ? '' : slime.size === 2 ? '_orange' : '_red'
  if (Sprites.ready) {
    let key
    if (slime.squashT > 0) key = 'land' + suffix
    else if (!slime.grounded) key = slime.vy < 60 ? 'jump' + suffix : 'fall' + suffix
    else key = (Math.floor(T * 3) % 2 ? 'idle0' : 'idle1') + suffix
    let sx = 1, sy = 1
    if (charge.on) {
      const c = Math.min(charge.t / PH().chargeT, 1)
      sy = 1 - 0.26 * c
      sx = 1 + 0.2 * c
    }
    if (slime.invuln > 0) alpha(Math.floor(T * 14) % 2 === 0 ? 1 : 0.45)
    Sprites.draw(key, slime.x, feet, slimeDrawW(), sx, sy)
    alpha(1)
    return
  }
  const blink = slime.invuln > 0 && Math.floor(T * 18) % 2 === 0
  const col = slime.size >= 3 ? C_SLIME : slime.size === 2 ? C_ORANGE : C_RED
  let sx = 1, sy = 1
  if (charge.on) {
    const c = Math.min(charge.t / PH().chargeT, 1)
    sy = 1 - 0.28 * c
    sx = 1 + 0.22 * c
  } else if (slime.squashT > 0) {
    sx = 1.22
    sy = 0.78
  } else if (!slime.grounded) {
    const st = clamp(Math.abs(slime.vy) / 500, 0, 1)
    sy = 1 + 0.16 * st
    sx = 1 - 0.1 * st
  }
  alpha(blink ? 0.35 : 1)
  push(slime.x, slime.y, 0, sx, sy)
  circfill(0, -slime.r * 0.3, slime.r * 0.92 + 2, C_BLACK)
  rectfill(-slime.r * 0.92 - 2, -slime.r * 0.3, (slime.r * 0.92 + 2) * 2, slime.r * 1.3 + 2, C_BLACK)
  circfill(0, -slime.r * 0.3, slime.r * 0.92, col)
  rectfill(-slime.r * 0.92, -slime.r * 0.3, slime.r * 1.84, slime.r * 1.3, col)
  circfill(-slime.r * 0.3, -slime.r * 0.35, slime.r * 0.18, C_WHITE)
  circfill(slime.r * 0.22, -slime.r * 0.35, slime.r * 0.18, C_WHITE)
  circfill(-slime.r * 0.24, -slime.r * 0.33, slime.r * 0.09, C_BLACK)
  circfill(slime.r * 0.28, -slime.r * 0.33, slime.r * 0.09, C_BLACK)
  alpha(1)
  pop()
}

function drawParticles() {
  for (const p of particles) {
    alpha(clamp(p.life * 2, 0, 1))
    circfill(p.x, p.y, p.r, p.c)
  }
  alpha(1)
}

// ---------- Bandes de danger (rendu unifié : plafond / gauche / droite / bas) ----------
// Texture bedrock (voidBand) teintée rouge = « ne pas toucher », avec liseré
// vif sur la frontière létale (sauf pour le bas : chute sous l'écran).
function drawDamageBand(x, y, w, h, edge) {
  if (w <= 0 || h <= 0) return
  const c = ctx()
  c.save()
  c.beginPath(); c.rect(x, y, w, h); c.clip()
  if (voidPattern) {
    c.fillStyle = voidPattern
    c.fillRect(x, y, w, h)
  } else if (Sprites.ready) {
    Sprites.drawSrc('voidBand', 0, 0, 960, 230, x, y, w, h)
  } else {
    c.fillStyle = COLORS[C_RED_D]
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

function drawDamageWalls() {
  drawDamageBand(0, 0, VW, WALL.ceil, 'bottom')
  drawDamageBand(0, WALL.ceil, WALL.left, VH - WALL.ceil, 'right')
  drawDamageBand(VW - WALL.right, WALL.ceil, WALL.right, VH - WALL.ceil, 'left')
}

function drawFrameEdges() {
  drawDamageBand(0, VH - 8, VW, 8, null)
}

function drawHUD() {
  const headW = 24
  for (let i = 0; i < 3; i++) {
    const hx = 12 + i * (headW + 4), hy = VH - 30
    const alive = i < slime.size
    if (Sprites.ready) {
      alpha(alive ? 1 : 0.22)
      Sprites.drawImage('hudHead', hx, hy, headW)
      alpha(1)
    } else {
      const col = slime.size >= 3 ? C_SLIME : slime.size === 2 ? C_ORANGE : C_RED
      circfill(hx + headW / 2, hy + headW / 2, 9, alive ? col : C_BG1)
      circ(hx + headW / 2, hy + headW / 2, 9, C_BLACK)
      if (alive) {
        circfill(hx + 8, hy + 10, 1.5, C_WHITE)
        circfill(hx + 16, hy + 10, 1.5, C_WHITE)
      }
    }
  }
  const ratio = camRatio()
  const gx = VW - 76, gy = 56, r = 14
  rectfill(VW - 98, 32, 90, 30, C_FRAME, 10)
  rect(VW - 98, 32, 90, 30, C_BLACK, 2)
  for (let i = 0; i <= 10; i++) {
    const a0 = Math.PI * (1 - i / 10)
    const col = i < 5 ? C_SLIME : i < 8 ? C_ORANGE : C_RED
    line(gx + Math.cos(a0) * (r - 4), gy - Math.sin(a0) * (r - 4), gx + Math.cos(a0) * (r + 3), gy - Math.sin(a0) * (r + 3), col)
  }
  const na = Math.PI * (1 - ratio)
  if (Sprites.ready) {
    Sprites.rotated('needleH', -na, gx, gy, 0.08, 0.5, 0.45)
  } else {
    line(gx, gy, gx + Math.cos(na) * (r - 4), gy - Math.sin(na) * (r - 4), C_WHITE)
  }
  circfill(gx, gy, 2, C_BLACK)
  textsize(7)
  text(VW - 52, 43, 'VITESSE', C_WHITE)
  textsize(9)
  if (testMode) {
    const name = Patterns.getPinned() ? Patterns.getPinned().name : '?'
    textalign('center', 'top')
    textsize(10)
    rectfill(VW / 2 - 90, 8, 180, 20, C_FRAME, 6)
    text(VW / 2, 13, 'TEST : ' + name, C_GOLD, 'bold')
    textalign('start', 'top')
  }
  if (slime.x - slime.r < camX + 40) {
    alpha(0.4 + 0.3 * Math.sin(T * 12))
    rectfill(0, WALL.ceil - 12, 5, VH - WALL.ceil + 12, C_RED)
    textalign('center', 'top')
    textsize(10)
    text(30, 60, 'DANGER', C_RED)
    alpha(1)
    textalign('start', 'top')
  }
}

const BTN_COPY = { x: 62, y: 188, w: 156, h: 30 }
const BTN_REPLAY = { x: 262, y: 188, w: 156, h: 30 }

function hitBtn(x, y, b) {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

function copyCode() {
  const ok = () => { copiedT = 1.8 }
  const manual = () => {
    try {
      const ta = document.createElement('textarea')
      ta.value = scoreCode
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      if (document.execCommand('copy')) ok()
      else window.prompt('Copie le code :', scoreCode)
      document.body.removeChild(ta)
    } catch (e) {
      try { window.prompt('Copie le code :', scoreCode) } catch (e2) {}
    }
  }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(scoreCode).then(ok, manual)
    } else manual()
  } catch (e) { manual() }
}

function drawBtn(b, label, col, hot) {
  rectfill(b.x, b.y, b.w, b.h, hot ? C_BG2 : C_FRAME, 8)
  rect(b.x, b.y, b.w, b.h, C_BLACK, 2)
  rect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, C_GRAY)
  textsize(9)
  text(b.x + b.w / 2, b.y + 11, label, col)
}

function drawOver() {
  const c = ctx()
  c.save()
  c.setTransform(1, 0, 0, 1, 0, 0)
  alpha(0.66)
  rectfill(0, 0, W, H, C_BLACK)
  alpha(1)
  c.restore()
  textalign('center', 'top')
  textsize(26)
  text(VW / 2, 40, 'PERDU !', C_RED, 'bold')
  if (newRecord) {
    alpha(0.55 + 0.45 * Math.sin(T * 6))
    textsize(13)
    text(VW / 2, 76, 'NOUVEAU RECORD !', C_GOLD, 'bold')
    alpha(1)
  }
  textsize(9)
  text(VW / 2, 98, 'CODE DE SCORE', C_GRAY)
  rectfill(72, 108, 336, 30, C_BG0)
  rect(72, 108, 336, 30, C_BLACK, 2)
  rect(76, 112, 328, 22, C_GRAY)
  textsize(9)
  text(VW / 2, 118, scoreCode, C_WHITE)
  textsize(8)
  text(VW / 2, 152, 'Donne ce code au createur pour valider ton score', C_GRAY)
  textsize(9)
  text(VW / 2, 170, 'TEMPS DE JEU : ' + fmtTime(elapsed), C_WHITE)
  if (deathT > 0.7) {
    alpha(clamp((deathT - 0.7) * 3, 0, 1))
    const copied = copiedT > 0
    drawBtn(BTN_COPY, copied ? 'CODE COPIE !' : 'COPIER LE CODE', copied ? C_SLIME_L : C_WHITE, copied)
    alpha(clamp((deathT - 0.7) * 3, 0, 1) * (0.6 + 0.4 * Math.sin(T * 4)))
    drawBtn(BTN_REPLAY, 'REJOUER', C_GREEN)
    alpha(1)
  }
  textalign('start', 'top')
}

function drawSoundIcon() {
  alpha(0.85)
  rectfill(9, 10, 4, 6, C_WHITE)
  shape([13, 10, 19, 4, 19, 22, 13, 16])
  fill(C_WHITE)
  if (Music.muted) {
    line(21, 8, 27, 18, C_RED)
    line(27, 8, 21, 18, C_RED)
  } else {
    circ(20, 13, 3, C_WHITE)
    circ(20, 13, 5.5, C_WHITE)
  }
  alpha(1)
}

// ---------- Plein écran (mobile) ----------
function fsSupported() {
  const el = document.documentElement
  return !!(el.requestFullscreen || el.webkitRequestFullscreen)
}

function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen
    if (exit) exit.call(document)
    return
  }
  const el = document.documentElement
  const req = el.requestFullscreen || el.webkitRequestFullscreen
  if (!req) return
  try {
    const p = req.call(el)
    if (p && p.then) {
      p.then(() => {
        // Verrouillage paysage (Android/Chrome en plein écran ; sinon ignoré).
        try {
          const lock = screen.orientation && screen.orientation.lock
          if (lock) lock.call(screen.orientation, 'landscape').catch(() => {})
        } catch (e) {}
      }).catch(() => {})
    }
  } catch (e) {}
}

function drawFsIcon() {
  if (!fsSupported()) return
  alpha(0.85)
  const l = 5
  const x0 = VW - 26, x1 = VW - 8, y0 = 5, y1 = 23
  // 4 coins "agrandir"
  line(x0, y0 + l, x0, y0, C_WHITE); line(x0, y0, x0 + l, y0, C_WHITE)
  line(x1 - l, y0, x1, y0, C_WHITE); line(x1, y0, x1, y0 + l, C_WHITE)
  line(x0, y1 - l, x0, y1, C_WHITE); line(x0, y1, x0 + l, y1, C_WHITE)
  line(x1 - l, y1, x1, y1, C_WHITE); line(x1, y1, x1, y1 - l, C_WHITE)
  alpha(1)
}

function draw() {
  calcView()
  ensureVoidPattern()
  drawOuterFrame()
  const c = ctx()
  c.setTransform(VSC, 0, 0, VSC, VOX, VOY)
  c.save()
  c.beginPath()
  c.rect(0, 0, VW, VH)
  c.clip()
  drawBG()
  if (state === 'title') {
    drawTitle()
    drawSoundIcon()
    drawFsIcon()
    drawVignette()
    c.restore()
    rect(-1, -1, VW + 2, VH + 2, C_BLACK)
    return
  }
  const shx = shakeT > 0 ? rand(-3, 3) : 0
  const shy = shakeT > 0 ? rand(-3, 3) : 0
  push(Math.round(-camX) + shx, shy)
  for (const d of decors) Sprites.drawImage(d.sprite, d.x, d.y, d.w)
  drawWalls()
  for (const p of platforms) drawPlat(p)
  for (const b of balls) if (!b.taken) drawBall(b)
  drawParticles()
  if (state === 'over' && Sprites.ready) Sprites.draw('splat', slime.x, slime.y + slime.r * 0.9, slimeDrawW() * 1.5)
  else drawSlime()
  if (charge.on) drawTrajectory()
  pop()
  drawDamageWalls()
  drawFrameEdges()
  if (state === 'playing' && !runStarted) drawReadyHint()
  drawHUD()
  if (state === 'over') drawOver()
  drawSoundIcon()
  drawFsIcon()
  drawVignette()
  c.restore()
  rect(-1, -1, VW + 2, VH + 2, C_BLACK)
}

function setupTestMode() {
  try {
    const qs = new URLSearchParams(window.location.search)
    const code = qs.get('pattern')
    if (!code) return
    const res = Patterns.importData(code)
    if (!res.ok || !res.data.patterns.length) {
      console.warn('SLIME test : pattern invalide —', res.error || res.errors)
      return
    }
    Patterns.pin(res.data.patterns[0])
    testMode = true
  } catch (e) {}
}

function init() {
  pal(COLORS, C_WHITE)
  textsize(9)
  try {
    best = parseInt(localStorage.getItem('slime_best') || '0', 10) || 0
  } catch (e) {}
  const st = Patterns.load()
  if (st === 'recupere') console.warn('SLIME : stockage illisible — backup restauré')
  else if (st === 'invalide' || st === 'corrompu') console.warn('SLIME : stockage illisible — réglages par défaut utilisés')
  applyLayout()
  setupTestMode()
  Music.restore()
  Sprites.load()
  buildFramePattern()
}
