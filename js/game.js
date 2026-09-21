litecanvas({
  width: 960,
  height: 540,
  autoscale: true
})

const SCALE = 2
const VW = 480, VH = 270
const CELL = 32, RS = 38, ROW0 = 88, CEIL = 16, GRAV = 620
const VERSION = '2.2'
const VMIN = 210, VMAX = 360, CHARGE_T = 0.55, STICKY_MUL = 0.8, SPIKE_W = 14
const BOUNCE_VY = 400, BOUNCE_VX = 140, CRUMBLE_T = 0.5, GOLD_PTS = 50

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
let camX = 0, camSpd = 40, elapsed = 0
let platforms = [], balls = [], particles = []
let slime = null
let charge = { on: false, t: 0, id: -1, aim: { x: 0, y: 0 } }
let ballsCollected = 0, goldsCollected = 0, scoreCode = null, deathT = 0, shakeT = 0
let best = 0, newRecord = false

function rowY(r) { return ROW0 + r * RS }
function slimeR() { return 9 + slime.size * 3 }
function currentScore() { return Math.floor(camX / 10) + ballsCollected * 10 + goldsCollected * GOLD_PTS }

function h32(n) {
  n = Math.imul(n ^ (n >>> 16), 2246822519)
  n = Math.imul(n ^ (n >>> 13), 3266489917)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

function simLandV(sx, sy, vx, vy, target) {
  let x = sx, y = sy
  const dt = 1 / 60, r = 13
  for (let i = 0; i < 240; i++) {
    vy += GRAV * dt
    x += vx * dt
    y += vy * dt
    if (y - r < CEIL) { y = CEIL + r; if (vy < 0) vy = 0 }
    if (vy >= 0 && x > target.x - 3 && x < target.x + target.w + 3 && y + r >= target.y && y + r <= target.y + 16) return true
    if (y > VH + 60) return false
  }
  return false
}

function canReach(a, target, mul, dirX) {
  dirX = dirX || 1
  const sx = dirX > 0 ? a.x + a.w - 10 : a.x + 10
  const sy = a.y - 12
  for (const p of [1, 0.85]) {
    for (let k = 0; k < 7; k++) {
      const base = 0.5 + k * 0.13
      const ang = dirX > 0 ? -base : -(Math.PI - base)
      const v = VMAX * p * mul
      if (simLandV(sx, sy, Math.cos(ang) * v, Math.sin(ang) * v, target)) return true
    }
  }
  return false
}

function canReachBounce(a, target) {
  return simLandV(a.x + a.w - 10, a.y - 12, BOUNCE_VX, -BOUNCE_VY, target)
}

function spawnBalls(a, b, gapCells) {
  if (rand() < 0.62) {
    const gx = a.x + a.w + gapCells * CELL / 2
    const top = Math.min(a.y, b.y)
    for (let i = -1; i <= 1; i++) {
      const by = clamp(top - 30 - (i === 0 ? 12 : 0), CEIL + 14, 252)
      balls.push({ x: gx + i * 13, y: by, o: rand() < 0.3, taken: false })
    }
  } else if (b.w >= 3 * CELL && rand() < 0.45) {
    for (let i = 0; i < 3; i++) balls.push({ x: b.x + b.w / 2 + (i - 1) * 14, y: b.y - 12, o: rand() < 0.3, taken: false })
  }
}

function spawnBranch(anchor) {
  if (elapsed < 20 || rand() > 0.45) return
  const dRow = rand() < 0.5 ? -2 : 2
  const row = clamp(anchor.row + dRow, 0, 4)
  if (row === anchor.row) return
  const p = { x: anchor.x - randi(3, 6) * CELL, row, y: rowY(row), baseY: rowY(row), w: 2 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0, spike: null, branch: true }
  if (p.x < camX + 30) return
  for (const q of platforms) {
    if (q.dead) continue
    if (p.x < q.x + q.w + 8 && p.x + p.w > q.x - 8 && Math.abs(p.y - q.y) < 24) return
  }
  if (!canReach(anchor, p, 1, -1)) return
  platforms.push(p)
  balls.push({ x: p.x + p.w / 2, y: p.y - 14, o: false, taken: false, gold: true })
  balls.push({ x: p.x + p.w + CELL, y: (p.y + anchor.y) / 2 - 8, o: rand() < 0.4, taken: false })
}

function spawnNext() {
  const last = platforms[platforms.length - 1]
  const D = Math.min(elapsed / 75, 1)
  for (let attempt = 0; attempt < 24; attempt++) {
    let gap = 2 + randi(0, Math.round(2 * D))
    let dRow = randi(-2, 2)
    const roll = rand()
    let type
    if (roll < 0.38) type = 'basic'
    else if (roll < 0.51) type = 'dynamic'
    else if (roll < 0.62) type = elapsed > 12 ? 'crumble' : 'basic'
    else if (roll < 0.72) type = 'sticky'
    else if (roll < 0.82) type = elapsed > 12 ? 'ghost' : 'basic'
    else if (roll < 0.92) type = elapsed > 25 ? 'bouncy' : 'basic'
    else type = 'basic'
    let cells
    if (type === 'basic') cells = randi(2, 5)
    else if (type === 'dynamic' || type === 'sticky' || type === 'ghost') cells = randi(2, 3)
    else if (type === 'crumble') cells = randi(2, 4)
    else cells = 2
    if (elapsed < 10) { gap = Math.min(gap, 2); dRow = clamp(dRow, -1, 1); type = 'basic'; cells = randi(3, 4) }
    if (dRow === -2 && gap > 2) dRow = -1
    if (last.type === 'sticky') { gap = Math.min(gap, 3); if (dRow < -1) dRow = -1; if (dRow === -1 && gap > 2) gap = 2 }
    if (last.type === 'bouncy' && dRow < -1) dRow = -1
    const row = clamp(last.row + dRow, 0, 4)
    const p = { x: last.x + last.w + gap * CELL, row, y: rowY(row), baseY: rowY(row), w: cells * CELL, type, amp: 0, spd: 0, ph: 0, spike: null }
    if (type === 'dynamic') {
      p.amp = rand(16, 34)
      p.spd = rand(1.2, 2.1)
      p.ph = rand(0, TAU)
      p.baseY = clamp(p.baseY, CEIL + 24 + p.amp, 248 - p.amp)
      p.y = p.baseY
    }
    if (type === 'basic' && cells >= 4 && elapsed > 20 && rand() < 0.3) {
      p.spike = { x1: p.x + p.w * 0.28, x2: p.x + p.w * 0.78 }
    }
    const checkY = type === 'dynamic' ? p.baseY - p.amp * 0.7 : p.y
    const target = { x: p.x, y: checkY, w: p.w }
    const ok = last.type === 'bouncy' ? canReachBounce(last, target) : canReach(last, target, last.type === 'sticky' ? STICKY_MUL : 1, 1)
    if (ok) {
      platforms.push(p)
      spawnBalls(last, p, gap)
      spawnBranch(p)
      return
    }
  }
  const p = { x: last.x + last.w + 2 * CELL, row: last.row, y: rowY(last.row), baseY: rowY(last.row), w: 3 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0, spike: null }
  platforms.push(p)
  spawnBalls(last, p, 2)
}

function genUntil() {
  const last = platforms[platforms.length - 1]
  if (last.x + last.w < camX + VW + 240) spawnNext()
}

function cleanup() {
  platforms = platforms.filter(p => !p.dead && p.x + p.w > camX - 80)
  balls = balls.filter(b => !b.taken && b.x > camX - 40)
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
  ballsCollected = 0
  goldsCollected = 0
  newRecord = false
  scoreCode = null
  deathT = 0
  shakeT = 0
  charge = { on: false, t: 0, id: -1, aim: { x: 0, y: 0 } }
  const first = { x: 16, row: 2, y: rowY(2), baseY: rowY(2), w: 5 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0, spike: null }
  platforms.push(first)
  slime = { x: 80, y: rowY(2) - 18, vx: 0, vy: 0, size: 3, grounded: true, groundPlat: first, jumpMul: 1, invuln: 0, squashT: 0 }
  slime.r = slimeR()
  for (let i = 0; i < 20; i++) genUntil()
  state = 'playing'
}

function damage() {
  if (slime.invuln > 0) return
  slime.size--
  slime.invuln = 1.3
  shakeT = 0.25
  sfx(SFX_HURT)
  burst(slime.x, slime.y, C_SLIME, 8, 120)
  if (slime.size < 1) die()
}

function die() {
  if (state === 'over') return
  state = 'over'
  deathT = 0
  const s = currentScore()
  newRecord = s > best && s > 0
  if (newRecord) {
    best = s
    try { localStorage.setItem('slime_best', String(best)) } catch (e) {}
  }
  scoreCode = Crypto.makeCode(s)
  shakeT = 0.4
  sfx(SFX_DIE)
  burst(slime.x, slime.y, C_SLIME, 24, 220)
  burst(slime.x, slime.y, C_SLIME_L, 12, 160)
}

function doJump() {
  const p = 0.12 + 0.88 * Math.min(charge.t / CHARGE_T, 1)
  const v = lerp(VMIN, VMAX, p) * slime.jumpMul
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
  sfx(SFX_JUMP)
}

function land(p) {
  if (p.type === 'bouncy') {
    slime.vy = -BOUNCE_VY
    if (Math.abs(slime.vx) < BOUNCE_VX) slime.vx = BOUNCE_VX
    slime.squashT = 0.12
    sfx(SFX_LAND, -2, 0.7)
    return
  }
  slime.grounded = true
  slime.groundPlat = p
  slime.vy = 0
  slime.y = p.y - slime.r
  slime.squashT = 0.1
  slime.jumpMul = p.type === 'sticky' ? STICKY_MUL : 1
  if (p.type === 'crumble' && !p.crackT) p.crackT = CRUMBLE_T
  sfx(SFX_LAND, 0, 0.2)
}

function updSlime(dt) {
  const prevY = slime.y
  if (slime.grounded) {
    const p = slime.groundPlat
    if (!p || slime.x < p.x - 10 || slime.x > p.x + p.w + 10) {
      if (p && p.type === 'ghost') {
        killPlat(p, C_GH_SIDE)
        sfx(SFX_COIN, -4, 0.4)
      }
      slime.grounded = false
      slime.groundPlat = null
    } else {
      slime.vx *= Math.pow(0.002, dt)
      if (Math.abs(slime.vx) < 2) slime.vx = 0
      slime.x += slime.vx * dt
      slime.y = p.y - slime.r
    }
  }
  if (!slime.grounded) {
    slime.vy += GRAV * dt
    if (slime.vy > 520) slime.vy = 520
    slime.vx *= Math.pow(0.6, dt)
    slime.x += slime.vx * dt
    slime.y += slime.vy * dt
    if (slime.y - slime.r < CEIL) { slime.y = CEIL + slime.r; if (slime.vy < 0) slime.vy = 0 }
    if (slime.vy >= 0) {
      for (const p of platforms) {
        if (slime.x > p.x - 6 && slime.x < p.x + p.w + 6 && prevY + slime.r <= p.y + 8 && slime.y + slime.r >= p.y) {
          land(p)
          break
        }
      }
    }
  }
  for (const p of platforms) {
    if (p.spike && slime.y + slime.r > p.y - 10 && slime.y + slime.r < p.y + 4 && slime.x > p.spike.x1 - 4 && slime.x < p.spike.x2 + 4) {
      slime.vy = -240
      slime.grounded = false
      slime.groundPlat = null
      damage()
      break
    }
  }
  if (slime.x + slime.r > camX + VW - SPIKE_W) {
    slime.x = camX + VW - SPIKE_W - slime.r - 2
    if (slime.vx > 0) slime.vx = -120
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
  if (state === 'over') { deathT += dt; updParticles(dt); if (shakeT > 0) shakeT -= dt; return }
  elapsed += dt
  camSpd = Math.min(40 + Math.floor(elapsed / 10) * 5, 120)
  camX += camSpd * dt
  if (shakeT > 0) shakeT -= dt
  genUntil()
  cleanup()
  for (const p of platforms) {
    if (p.type === 'dynamic') p.y = p.baseY + Math.sin(T * p.spd + p.ph) * p.amp
    if (p.crackT > 0) {
      p.crackT -= dt
      if (p.crackT <= 0) {
        p.crackT = 0
        killPlat(p, C_CR_SIDE)
        sfx(SFX_DIE, 2, 0.3)
      }
    }
  }
  updSlime(dt)
  if (charge.on) {
    charge.t += dt
    if (!slime.grounded) charge.on = false
  }
  updBalls()
  updParticles(dt)
  Music.tick(dt, (camSpd - 40) / 80)
  if (slime.x + slime.r < camX) die()
  if (slime.y - slime.r > VH + 30) die()
}

function tap(px, py, touchId) {
  const x = px / SCALE
  const y = py / SCALE
  if (x < 28 && y < 28) { Music.toggle(); return }
  if (state === 'title') { startGame(); return }
  if (state === 'over') { if (deathT > 0.7) startGame(); return }
  if (slime.grounded && !charge.on) {
    charge.on = true
    charge.t = 0
    charge.id = touchId
    charge.aim = { x: x + camX, y }
  }
}

function tapping(px, py, touchId) {
  if (charge.on && touchId === charge.id) charge.aim = { x: px / SCALE + camX, y: py / SCALE }
}

function untap(x, y, touchId) {
  if (charge.on && touchId === charge.id) {
    charge.on = false
    doJump()
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
  bgLayer(0.28, 77, (x, h, h2, h3) => {
    if (h < 0.22) rectfill(x + h2 * 40, 30 + h3 * 180, 14, 3, C_BLUE_XD)
    if (h > 0.5 && h < 0.62) rectfill(x + h3 * 40, 40 + h2 * 160, 3, 26, C_BLUE_XD)
    if (h2 < 0.14) rectfill(x + h * 44, 60 + h3 * 150, 7, 7, C_BLUE_HI)
    if (h > 0.86) rectfill(x + h2 * 40, 100 + h3 * 110, 18, 3, C_BLUE_HI)
  })
}

function drawCheckerBand(x, y, w, h, size) {
  rectfill(x, y, w, h, C_FRAME)
  for (let yy = 0; yy < h; yy += size) {
    for (let xx = 0; xx < w; xx += size) {
      if (((xx / size) | 0) % 2 === ((yy / size) | 0) % 2) rectfill(x + xx, y + yy, size, size, C_FRAME_L)
    }
  }
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
  drawBlob(VW / 2, 128 + bob, 20, 1, 1, false)
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
  if (best > 0) {
    textsize(11)
    text(VW / 2, 222, 'RECORD : ' + best, C_GOLD)
  }
  textsize(8)
  text(VW - 24, VH - 12, 'v' + VERSION, C_GRAY)
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

function drawTile(x, y, top, side) {
  rect(x, y, 32, 32, C_BLACK, 7)
  rectfill(x + 2, y + 2, 28, 28, side, 6)
  rectfill(x + 2, y + 2, 28, 15, top, 5)
  rectfill(x + 6, y + 5, 9, 4, C_WHITE)
}

function drawPlat(p) {
  if (p.dead) return
  const n = Math.round(p.w / CELL)
  const jx = p.type === 'crumble' && p.crackT > 0 ? rand(-1.5, 1.5) : 0
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
  const p = 0.12 + 0.88 * Math.min(charge.t / CHARGE_T, 1)
  const v = lerp(VMIN, VMAX, p) * slime.jumpMul
  const ang = Math.atan2(charge.aim.y - slime.y, charge.aim.x - slime.x)
  let x = slime.x, y = slime.y
  let vx = Math.cos(ang) * v, vy = Math.sin(ang) * v
  const dt = 1 / 60
  let idx = 0
  for (let i = 0; i < 100; i++) {
    vy += GRAV * dt
    x += vx * dt
    y += vy * dt
    if (y - slime.r < CEIL) { y = CEIL + slime.r; if (vy < 0) vy = 0 }
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
  if (Sprites.ready) {
    let key, w
    const blinkFrame = slime.invuln > 0 && Math.floor(T * 14) % 2 === 0
    if (slime.squashT > 0) { key = 'land'; w = 50 }
    else if (blinkFrame) { key = 'hurt'; w = 44 }
    else if (!slime.grounded) {
      if (slime.vy < 60) { key = 'jump'; w = 40 } else { key = 'fall'; w = 44 }
    } else if (slime.size === 3) {
      key = Math.floor(T * 3) % 2 ? 'idle0' : 'idle1'
      w = 44
    } else if (slime.size === 2) { key = 'mid'; w = 37 } else { key = 'small'; w = 29 }
    let sx = 1, sy = 1
    if (charge.on) {
      const c = Math.min(charge.t / CHARGE_T, 1)
      sy = 1 - 0.26 * c
      sx = 1 + 0.2 * c
    }
    alpha(slime.invuln > 0 && !blinkFrame ? 0.7 : 1)
    Sprites.draw(key, slime.x, feet, w, sx, sy)
    alpha(1)
    return
  }
  const blink = slime.invuln > 0 && Math.floor(T * 18) % 2 === 0
  let sx = 1, sy = 1
  if (charge.on) {
    const c = Math.min(charge.t / CHARGE_T, 1)
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
  drawBlob(slime.x, slime.y, slime.r, sx, sy, false)
  alpha(1)
}

function drawParticles() {
  for (const p of particles) {
    alpha(clamp(p.life * 2, 0, 1))
    circfill(p.x, p.y, p.r, p.c)
  }
  alpha(1)
}

function drawSpikeWall() {
  rectfill(VW - 8, 0, 8, VH, C_FRAME)
  for (let y = 2; y < VH; y += 11) {
    shape([VW - 3, y - 1, VW - SPIKE_W, y + 5.5, VW - 3, y + 12])
    fill(C_RED_D)
    shape([VW - 4, y + 1, VW - SPIKE_W - 2, y + 5.5, VW - 4, y + 10])
    fill(C_RED)
  }
}

function drawCeiling() {
  drawCheckerBand(0, 0, VW, CEIL, 8)
}

function drawFrameEdges() {
  drawCheckerBand(0, CEIL, 9, VH - CEIL, 9)
  drawCheckerBand(VW - 9, CEIL, 9, VH - CEIL, 9)
  drawCheckerBand(0, VH - 14, VW, 14, 7)
}

function drawVoid() {
  alpha(0.45)
  rectfill(0, VH - 22, VW, 22, C_BLACK)
  alpha(1)
}

function drawHUD() {
  rectfill(8, VH - 27, 122, 23, C_FRAME, 9)
  rect(8, VH - 27, 122, 23, C_BLACK, 9)
  if (Sprites.ready) {
    Sprites.draw('big', 24, VH - 8, 26)
  } else {
    circfill(20, VH - 14, 8, C_SLIME)
    rectfill(12, VH - 14, 16, 8, C_SLIME)
    circfill(17, VH - 16, 1.6, C_WHITE)
    circfill(23, VH - 16, 1.6, C_WHITE)
  }
  for (let i = 0; i < 3; i++) {
    const filled = i < slime.size
    const col = !filled ? C_LIFE_EMPTY : (slime.size === 1 ? (Math.floor(T * 6) % 2 ? C_RED : C_SLIME) : C_SLIME)
    rectfill(38 + i * 28, VH - 21, 26, 12, col, 4)
    rect(38 + i * 28, VH - 21, 26, 12, C_BLACK, 4)
  }
  const ratio = (camSpd - 40) / 80
  const gx = VW - 50, gy = 26, r = 17
  for (let i = 0; i <= 10; i++) {
    const a0 = Math.PI * (1 - i / 10)
    const col = i < 5 ? C_SLIME : i < 8 ? C_ORANGE : C_RED
    line(gx + Math.cos(a0) * (r - 4), gy - Math.sin(a0) * (r - 4), gx + Math.cos(a0) * (r + 2), gy - Math.sin(a0) * (r + 2), col)
  }
  const na = Math.PI * (1 - ratio)
  line(gx, gy, gx + Math.cos(na) * (r - 5), gy - Math.sin(na) * (r - 5), C_WHITE)
  circfill(gx, gy, 2, C_WHITE)
  textsize(8)
  text(VW - 76, 2, 'VITESSE', C_WHITE)
  textsize(9)
  if (slime.x - slime.r < camX + 40) {
    alpha(0.4 + 0.3 * Math.sin(T * 12))
    rectfill(0, CEIL, 5, VH - CEIL, C_RED)
    textalign('center', 'top')
    textsize(10)
    text(30, 60, 'DANGER', C_RED)
    alpha(1)
    textalign('start', 'top')
  }
}

function drawOver() {
  alpha(0.65)
  rectfill(0, 0, VW, VH, C_BLACK)
  alpha(1)
  textalign('center', 'top')
  textsize(26)
  text(VW / 2, 44, 'PERDU !', C_RED, 'bold')
  if (newRecord) {
    alpha(0.55 + 0.45 * Math.sin(T * 6))
    textsize(13)
    text(VW / 2, 78, 'NOUVEAU RECORD !', C_GOLD, 'bold')
    alpha(1)
  }
  textsize(9)
  text(VW / 2, 100, 'CODE DE SCORE', C_GRAY)
  rectfill(58, 110, VW - 116, 32, C_BG1)
  rect(58, 110, VW - 116, 32, C_GRAY)
  textsize(9)
  text(VW / 2, 121, scoreCode, C_WHITE)
  textsize(8)
  text(VW / 2, 156, 'Donne ce code au createur pour valider ton score', C_GRAY)
  if (deathT > 0.7) {
    alpha(0.55 + 0.45 * Math.sin(T * 4))
    textsize(12)
    text(VW / 2, 196, 'TAPE POUR REJOUER', C_GREEN)
    alpha(1)
  }
  textalign('start', 'top')
}

function drawSoundIcon() {
  alpha(0.85)
  rectfill(9, 11, 5, 8, C_WHITE)
  shape([14, 11, 22, 5, 22, 25, 14, 19])
  fill(C_WHITE)
  if (Music.muted) {
    line(24, 9, 31, 21, C_RED)
    line(31, 9, 24, 21, C_RED)
  } else {
    circ(25, 15, 4, C_WHITE)
    circ(25, 15, 7, C_WHITE)
  }
  alpha(1)
}

function draw() {
  ctx().setTransform(SCALE, 0, 0, SCALE, 0, 0)
  drawBG()
  if (state === 'title') { drawTitle(); drawSoundIcon(); drawVignette(); return }
  const shx = shakeT > 0 ? rand(-3, 3) : 0
  const shy = shakeT > 0 ? rand(-3, 3) : 0
  push(Math.round(-camX) + shx, shy)
  for (const p of platforms) drawPlat(p)
  for (const b of balls) if (!b.taken) drawBall(b)
  drawParticles()
  if (state === 'over' && Sprites.ready) Sprites.draw('splat', slime.x, slime.y + slime.r * 0.9, 66)
  else drawSlime()
  if (charge.on) drawTrajectory()
  pop()
  drawSpikeWall()
  drawCeiling()
  drawFrameEdges()
  drawHUD()
  if (state === 'over') drawOver()
  drawSoundIcon()
  drawVignette()
}

function init() {
  pal(COLORS, C_WHITE)
  textsize(9)
  try {
    best = parseInt(localStorage.getItem('slime_best') || '0', 10) || 0
  } catch (e) {}
  Music.restore()
  Sprites.load()
}
