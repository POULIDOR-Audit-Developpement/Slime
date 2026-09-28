litecanvas({
  autoscale: true
})

let VSC = 1, VOX = 0, VOY = 0
let framePattern = null
let voidPattern = null
// Diagnostic perf (?fps ?sim=N ?prof) : compteurs incrémentés dans update()/draw().
let diagFps = false, diagSimTxt = '', diagUps = 0, diagDrs = 0, diagT0 = 0, diagShown = ''
let diagProf = false, diagUpMs = 0, diagDnMs = 0, diagGapMs = 0, diagGapMax = 0, diagLastDraw = 0
let diagSecAn = 0, diagSecOf = 0, diagSecBg = 0, diagSecSc = 0, diagSecRe = 0

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
const VERSION = '4.0'
// Murs de damage latéraux issus du layout éditable (onglet VUE de l'éditeur).
// Plus de plafond : le haut du monde est ouvert (grands sauts autorisés).
let WALL = { left: TIP_L, right: SPIKE_W }
// Réglages globaux des plateformes (onglet VUE), surchargés par plateforme.
let PLAT = { crumbleT: CRUMBLE_T, dynLife: 4, spdMul: 1 }
// Pouvoirs (onglet POWER) et vue (zoom global, onglet VUE) issus du layout.
let POWERS = {
  doubleJump: { enabled: true, cooldown: 4, charges: 1, powerMul: 1 },
  slowmo: { enabled: true, scale: 0.35, duration: 0.6 },
  ledge: { enabled: true, pullT: 0.6, window: 8 }
}
let VIEW = { zoom: 1, showTrajectory: true, shake: true }
// Raccourci : physique courante (onglet PHYS de l'éditeur -> layout.phys).
const PH = () => Phys.phys()
// Largeur de dessin du sprite de référence (pour un rayon de 18).
const SLIME_DRAW_W = 44
// Canevas des frames ledge (tools/make_v4_sprites.py) : haut du bloc = ligne
// des bras = sommet de plateforme à LEDGE_GRIP, face gauche du bloc (là où
// pend le corps au départ) à LEDGE_BLOCK_L, dans LEDGE_W x LEDGE_H. Canevas
// 400x420 : le slime y occupe ~208 px comme dans les frames v3 (sinon il
// paraît deux fois trop petit à l'écran).
// LEDGE_TOP_CX : centre du slime assis dans ledgeTop (fin de remontée).
const LEDGE_W = 400, LEDGE_H = 420, LEDGE_GRIP = 210, LEDGE_BLOCK_L = 138
const LEDGE_TOP_CX = 277

// Nombre borné : non numérique -> défaut ; 0 est une valeur valide.
function numBound(v, def, lo, hi) {
  v = +v
  if (!isFinite(v)) v = def
  return Math.max(lo, Math.min(hi, v))
}

function applyLayout() {
  const l = Patterns.getLayout()
  if (l && l.walls) {
    WALL = { left: l.walls.left, right: l.walls.right }
  }
  if (l && l.plat) {
    PLAT = {
      crumbleT: numBound(l.plat.crumbleT, CRUMBLE_T, 0.2, 2),
      dynLife: numBound(l.plat.dynLife, 4, 1, 10),
      spdMul: numBound(l.plat.spdMul, 1, 0.5, 2)
    }
  }
  if (l && l.powers) {
    const dj = l.powers.doubleJump, sm = l.powers.slowmo, lg = l.powers.ledge || {}
    POWERS = {
      doubleJump: {
        enabled: dj.enabled !== false,
        cooldown: numBound(dj.cooldown, 4, 0, 15),
        charges: Math.round(numBound(dj.charges, 1, 1, 3)),
        powerMul: numBound(dj.powerMul, 1, 0.5, 1.5)
      },
      slowmo: {
        enabled: sm.enabled !== false,
        scale: numBound(sm.scale, 0.35, 0.15, 0.8),
        duration: numBound(sm.duration, 0.6, 0.2, 2)
      },
      ledge: {
        enabled: lg.enabled !== false,
        // pullT (ex hangT) : durée de la remontée ; migration des anciens saves.
        pullT: numBound(lg.pullT !== undefined ? lg.pullT : lg.hangT, 0.6, 0.3, 3),
        window: Math.round(numBound(lg.window, 8, 4, 16))
      }
    }
  }
  if (l && l.view) {
    VIEW = {
      zoom: numBound(l.view.zoom, 1, 1, 4),
      showTrajectory: l.view.showTrajectory !== false,
      shake: l.view.shake !== false
    }
  }
  Phys.setWalls(l && l.walls ? l.walls : null)
  Phys.setPhys(l && l.phys ? l.phys : null)
}

// Recharge le stockage (éditeur ouvert dans un autre onglet) et ré-applique
// tout le layout en cours de partie : physique, pouvoirs, vue, murs, pool.
function refreshLayout() {
  Patterns.load()
  applyLayout()
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
  '#6b1d1d', '#c98d4b',
  // Style « présentation » : fond vitrine, panneaux, ombre du logo.
  '#05050e', '#1c2148', '#12521d'
]
const C_BG0 = 0, C_BG1 = 1, C_BG2 = 2, C_BG3 = 3
const C_PAGE = COLORS.length - 3, C_PANEL2 = COLORS.length - 2, C_LOGO_D = COLORS.length - 1
const C_SLIME = 4, C_SLIME_D = 5, C_SLIME_L = 6
const C_P_TOP = 7, C_P_SIDE = 8, C_P_DARK = 9
const C_S_TOP = 10, C_S_SIDE = 11, C_S_DARK = 12
const C_D_TOP = 13, C_D_SIDE = 14, C_D_DARK = 15
const C_YELLOW = 16, C_ORANGE = 17
const C_RED = 18, C_RED_D = 19
const C_WHITE = 20, C_BLACK = 21, C_GREEN = 22, C_GRAY = 23
// Écran tactile ? (pour l'astuce de visée relative sur l'écran titre)
const TOUCH_DEVICE = typeof window !== 'undefined' && ('ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0)
const C_CR_TOP = 24, C_CR_SIDE = 25, C_CR_DARK = 26
const C_GH_TOP = 27, C_GH_SIDE = 28, C_GH_DARK = 29
const C_BO_SIDE = 30, C_BO_DARK = 31
const C_GOLD = 32
const C_BLUE = 33, C_BLUE_L = 34, C_BLUE_D = 35, C_BLUE_XD = 36, C_BLUE_HI = 37
const C_FRAME = 38, C_FRAME_L = 39, C_LIFE_EMPTY = 40
const C_S_HI = 41

// ---------- Paliers score -> couleur (éditables dans settings.html) ----------
// La couleur du slime dépend du score courant (plus de la vie). Tier 0 = art
// d'origine (vert) ; les teintes suivantes sont recolorées au chargement.
// Pour les fallbacks procéduraux, chaque palier pousse 3 entrées en fin de
// palette (teinte / claire / sombre) installées par applyTiers() dans init().
const TIERS = SlimeColors.load()
let C_TIER = 0

function applyTiers() {
  if (C_TIER) COLORS.length = C_TIER
  C_TIER = COLORS.length
  // Fallbacks procéduraux : couleur representative du palier (+ clair/sombre).
  for (const t of TIERS) {
    const c = SlimeColors.primary(t)
    COLORS.push(c, SlimeColors.shade(c, 0.62), SlimeColors.shade(c, -0.45))
  }
  pal(COLORS, C_WHITE)
}
function tierCol(i) { return C_TIER + i * 3 }
function tierColL(i) { return C_TIER + i * 3 + 1 }
function tierColD(i) { return C_TIER + i * 3 + 2 }
function tierSuffix(i) { return i > 0 ? '_t' + i : '' }
function scoreTierIdx() { return SlimeColors.tierIndex(TIERS, currentScore()) }
let deathTier = 0

// Réglages modifiés dans un autre onglet (settings.html) : rechargement des
// paliers, de la palette et des sprites recolorés, sans réinitialiser la partie.
function refreshTiers() {
  const nt = SlimeColors.load()
  if (JSON.stringify(nt) === JSON.stringify(TIERS)) return
  TIERS.length = 0
  for (const t of nt) TIERS.push(t)
  applyTiers()
  Sprites.setTiers(nt)
}

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
let camX = 0, camSpd = 80, elapsed = 0 // pré-init : base caméra (PHYS_DEF.camBase)
// Horloge du jeu ralentie par le slow-mo (oscillation des plateformes...) et
// échelle de temps courante (1 = vitesse normale).
let gameT = 0, ts = 1
// Slow-mo : temps réel restant pendant lequel le jeu tourne au ralenti.
let slowmoT = 0
// Fenêtre de vue zoomée (monde) : centre + taille, recalculée à chaque frame.
let camW = VW, camH = VH, camCx = VW / 2, camCy = VH / 2
let platforms = [], balls = [], particles = [], decors = [], wallsArr = []
let slime = null
// Visée du saut : le point (monde) visé par le clic/touch. `air` = double saut.
let aim = { on: false, x: 0, y: 0, id: -1, air: false }
// Tactile (id >= 1) : visée RELATIVE — le doigt démarre n'importe où (sans
// couvrir la cible) et le réticule suit son déplacement (delta × AIM_SENS).
// `aimPad` = position écran du doigt pendant la visée (null = souris, absolu).
const AIM_SENS = 1.1
// Caméra : intervalle fixe entre paliers (s). La taille du pas se déduit de
// camRampDur (PHYS : durée pour atteindre camMax) — voir update().
const CAM_PALIER_S = 10
let aimPad = null
let ballsCollected = 0, goldsCollected = 0, bonusCollected = 0, scoreCode = null, deathT = 0, shakeT = 0, copiedT = 0
let best = 0, newRecord = false
let testMode = false, testSecT = 0
// T6 — L'Atelier des bocaux : temps d'obtention de chaque palier de couleur
// ([[tierIdx, sec], ...]), suivi au tick par TierTimes.track puis envoyé au
// serveur à la mort par Scores.submit. TierTimes/Scores (js/scores.js) et
// Player (js/player.js) sont chargés AVANT game.js par play.html ; le harnais
// Node game_sim.mjs ne les charge pas -> capturés une fois, null si absents.
let tierTimes = []
const TT = typeof TierTimes !== 'undefined' ? TierTimes : null
const SCORES = typeof Scores !== 'undefined' ? Scores : null
const PLAYER = typeof Player !== 'undefined' ? Player : null

function slimeR() { return PH().slimeR }
function slimeDrawW() { return SLIME_DRAW_W * (slimeR() / 18) }
function currentScore() { return Math.floor(camX / 10) + ballsCollected * 10 + goldsCollected * GOLD_PTS + bonusCollected * 30 }
function camRatio() {
  const P = PH()
  return clamp((camSpd - P.camBase) / Math.max(1, P.camMax - P.camBase), 0, 1)
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60)
  return m + ':' + String(s).padStart(2, '0')
}

// Conversion écran (pixels canvas) -> monde, en passant par la fenêtre zoomée.
function s2w(px, py) {
  calcView()
  const vx = (px - VOX) / VSC, vy = (py - VOY) / VSC
  const kx = camW / VW, ky = camH / VH
  return { x: camCx + (vx - VW / 2) * kx, y: camCy + (vy - VH / 2) * ky }
}

// Recadre la fenêtre de vue : zoom global (VIEW.zoom) centré sur le slime,
// borné à la bande de jeu [camX, camX+VW] x [0, VH]. Titre = plein cadre.
function updateCam() {
  const z = clamp(+VIEW.zoom || 1, 1, 4)
  if (state === 'title' || !slime || z <= 1.001) {
    camW = VW; camH = VH
    camCx = camX + VW / 2; camCy = VH / 2
    return
  }
  camW = VW / z; camH = VH / z
  camCx = clamp(slime.x, camX + camW / 2, camX + VW - camW / 2)
  camCy = clamp(slime.y, camH / 2, VH - camH / 2)
}

// Double saut disponible ? Pouvoir activé + charge aérienne + cooldown écoulé.
function canDoubleJump() {
  const dj = POWERS.doubleJump
  return dj.enabled && slime.airJumps > 0 && slime.djCd <= 0
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
  tierTimes = [] // T6 — nouvelle partie : suivi des paliers remis à zéro
  camX = 0
  camSpd = PH().camBase
  gameT = 0
  ts = 1
  slowmoT = 0
  platforms = []
  balls = []
  particles = []
  decors = []
  wallsArr = []
  ballsCollected = 0
  goldsCollected = 0
  bonusCollected = 0
  newRecord = false
  scoreCode = null
  deathT = 0
  deathTier = 0
  copiedT = 0
  shakeT = 0
  testSecT = 0
  aim = { on: false, x: 0, y: 0, id: -1, air: false }
  aimPad = null
  // Départ : plateforme + slime centrés au milieu de l'écran.
  const first = { x: VW / 2 - (5 * CELL) / 2, row: 2, y: rowY(2), baseY: rowY(2), w: 5 * CELL, type: 'basic', amp: 0, spd: 0, ph: 0, spike: null }
  platforms.push(first)
  slime = {
    x: VW / 2, y: rowY(2) - slimeR(), vx: 0, vy: 0, size: 3,
    grounded: true, groundPlat: first, jumpMul: 1, invuln: 0, squashT: 0,
    coyote: PH().coyote, airJumps: POWERS.doubleJump.charges, djCd: 0,
    pull: null, noCatchT: 0, pumpT: 0, face: 1
  }
  slime.r = slimeR()
  let guard = 0
  while (platforms[platforms.length - 1].x + platforms[platforms.length - 1].w < VW * 2 && guard++ < 60) spawnNext()
  state = 'playing'
  runStarted = false
  updateCam()
}

function damage() {
  if (slime.invuln > 0) return
  slime.size--
  slime.invuln = PH().invuln
  shakeT = 0.25
  sfx(SFX_HURT)
  burst(slime.x, slime.y, tierCol(scoreTierIdx()), 8, 120)
  if (slime.size < 1) die()
}

function die() {
  if (state === 'over') return
  state = 'over'
  Music.stop()
  deathT = 0
  aim.on = false
  aimPad = null
  slowmoT = 0
  slime.pull = null
  const s = currentScore()
  deathTier = scoreTierIdx()
  newRecord = s > best && s > 0
  if (newRecord) {
    best = s
    try { localStorage.setItem('slime_best', String(best)) } catch (e) {}
  }
  scoreCode = Crypto.makeCode(s, elapsed)
  submitScore(s) // T6 — hall of fame : envoi au serveur, jamais bloquant
  shakeT = 0.4
  sfx(SFX_DIE)
  burst(slime.x, slime.y, tierCol(deathTier), 24, 220)
  burst(slime.x, slime.y, tierColL(deathTier), 12, 160)
}

// T6 — soumission du score à la mort (fire-and-forget) : nom connu -> envoi
// immédiat ; sans nom -> la modal le demande et la soumission part au onDone
// (null = « jouer sans nom » -> rien). Ruling revue finale : score nul -> RIEN
// du tout (ni POST ni demande de nom — pas de bruit à modérer ; le code
// copiable reste disponible). Sans module Player (harnais Node) : pas d'envoi.
// L'écran de fin s'affiche dans tous les cas.
function submitScore(s) {
  if (testMode) return // ruling T6 — un playtest (caméra gelée, pattern en boucle) ne remplit JAMAIS l'atelier
  if (!(s > 0)) return // ruling revue finale — score 0 : pas de soumission, pas de modal nom
  if (!SCORES) return
  const payload = name => ({
    v: 1, name, score: s, playtime: Math.round(elapsed), times: tierTimes, code: scoreCode
  })
  const name = PLAYER ? PLAYER.get() : null
  if (name) { SCORES.submit(payload(name)); return }
  if (PLAYER && PLAYER.ensureModal) {
    PLAYER.ensureModal({ onDone: n => { if (n) SCORES.submit(payload(n)) } })
  }
}

// Exécute le saut visé : puissance = distance du point visé au slime (bornée
// par aimMin/aimMax -> vmin/vmax), direction = angle slime -> point visé.
// En l'air (aim.air) : double saut — consomme une charge et démarre le cooldown.
function execJump() {
  const dj = POWERS.doubleJump
  const mul = Phys.aimVel(dist(slime.x, slime.y, aim.x, aim.y)) * slime.jumpMul * (aim.air ? dj.powerMul : 1)
  const ang = Math.atan2(aim.y - slime.y, aim.x - slime.x)
  slime.vx = Math.cos(ang) * mul
  slime.vy = Math.sin(ang) * mul
  slime.face = aim.x >= slime.x ? 1 : -1
  // Saut pendant la remontée : interrompt le pull-up proprement (pas de glissade).
  if (slime.pull) {
    slime.pull = null
    slime.noCatchT = 0.3
  }
  const gp = slime.groundPlat
  if (gp && gp.type === 'ghost') {
    killPlat(gp, C_GH_SIDE)
    sfx(SFX_COIN, -4, 0.4)
  }
  if (aim.air) {
    slime.airJumps--
    slime.djCd = dj.cooldown
    slime.pumpT = 0.18
    burst(slime.x, slime.y, C_BLUE_L, 12, 140)
    sfx(SFX_JUMP, 3, 1.15)
  } else {
    slime.grounded = false
    slime.groundPlat = null
    sfx(SFX_JUMP)
  }
  slime.jumpMul = 1
  slime.coyote = 0
  aim.on = false
  aimPad = null
  slowmoT = 0 // le ralenti ne concerne que la visée : le saut part à pleine vitesse
  runStarted = true
  Music.start() // BGM mp3 : démarre au 1er saut (geste utilisateur -> autoplay OK)
}

function land(p) {
  // Chaque contact avec une plateforme recharge les sauts aériens ; une visée
  // de double saut en cours devient une visée de saut au sol (slow-mo coupé).
  slime.airJumps = POWERS.doubleJump.charges
  if (aim.on && aim.air) { aim.air = false; slowmoT = 0 }
  if (p.type === 'bouncy') {
    const P = PH()
    slime.vy = -P.bounceVy
    if (Math.abs(slime.vx) < P.bounceVx) slime.vx = P.bounceVx
    slime.squashT = 0.12
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
}

// ---------- Ledge catch ----------
// Manqué une plateforme de justesse ? Si le bord est dépassé de quelques
// pixels (fenêtre réglable) pendant que le bas du slime frôle le sommet,
// il s'y agrippe in-extremis et se hisse immédiatement dessus : la remontée
// dure pullT secondes (« pulled up time »), à la fin il est posé. Un appui
// pendant la remontée permet de viser un saut. Les effets « atterrissage »
// s'appliquent dès l'accroche (casse, timer, disparition éphémère).
function tryLedgeCatch(prevY) {
  const win = POWERS.ledge.window
  for (const p of platforms) {
    if (p.dead) continue
    // bas du slime à peine sous le sommet, en train de franchir le bord
    if (slime.y + slime.r < p.y || slime.y + slime.r > p.y + 12) continue
    if (prevY + slime.r > p.y + 6) continue
    let side = 0
    if (slime.x >= p.x - 6 - win && slime.x < p.x - 6) side = -1
    else if (slime.x <= p.x + p.w + 6 + win && slime.x > p.x + p.w + 6) side = 1
    if (!side) continue
    catchLedge(p, side)
    return
  }
}

function catchLedge(p, side) {
  if (p.type === 'ghost') { // éphémère : disparaît, pas d'accroche
    killPlat(p, C_GH_SIDE)
    sfx(SFX_COIN, -4, 0.4)
    return
  }
  if (p.type === 'crumble' && !p.crackT) p.crackT = p.crumbleT || PLAT.crumbleT
  if (p.type === 'dynamic' && !p.timerSet) {
    p.timerSet = true
    p.timer = p.dynLife || PLAT.dynLife
  }
  slime.pull = { plat: p, side, t: POWERS.ledge.pullT, dur: POWERS.ledge.pullT }
  slime.grounded = false
  slime.groundPlat = null
  slime.vx = 0
  slime.vy = 0
  slime.jumpMul = p.type === 'sticky' ? PH().stickyMul : 1
  sfx(SFX_LAND, 4, 0.45)
}

// Remontée (pull-up) : le slime se hisse sur la plateforme en pullT s. La
// position logique glisse du bord (corps pendant hors du bord) vers sa place
// assise (centre mesuré sur la frame ledgeTop, cf. LEDGE_TOP_CX), lissée en
// smoothstep avec une petite élévation en arc ; la plateforme mouvante est
// suivie. À la fin il est posé (land) ; si elle meurt pendant l'effort,
// il glisse hors du bord.
function updPull(dt) {
  const h = slime.pull, p = h.plat
  if (!POWERS.ledge.enabled || !p || p.dead) {
    releaseLedge(true)
    return
  }
  h.t -= dt
  const k = 1 - Math.max(h.t, 0) / h.dur
  const e = k * k * (3 - 2 * k)
  const inset = (LEDGE_TOP_CX - LEDGE_BLOCK_L) / LEDGE_W * (slimeDrawW() * 2)
  const edgeX = h.side < 0 ? p.x - slime.r * 0.45 : p.x + p.w + slime.r * 0.45
  const standX = h.side < 0 ? p.x + inset : p.x + p.w - inset
  const y0 = p.y + slime.r * 0.35, y1 = p.y - slime.r
  slime.x = edgeX + (standX - edgeX) * e
  slime.y = y0 + (y1 - y0) * e - Math.sin(k * Math.PI) * slime.r * 0.3
  slime.vx = 0
  slime.vy = 0
  if (h.t <= 0) {
    slime.pull = null
    land(p)
  }
}

// Relâche (plateforme morte ou pouvoir coupé en pleine remontée) : glisse
// hors du bord puis tombe.
function releaseLedge(slip) {
  if (!slime.pull) return
  const side = slime.pull.side
  slime.pull = null
  slime.noCatchT = 0.5
  slime.grounded = false
  if (slip) { // décroche : glisse hors du bord puis tombe
    slime.vx = side * 30
    slime.vy = 60
  }
}

function updSlime(dt) {
  const P = PH()
  const prevY = slime.y
  if (slime.noCatchT > 0) slime.noCatchT -= dt
  if (slime.pumpT > 0) slime.pumpT -= dt
  if (slime.pull) {
    updPull(dt)
    return
  }
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
    }
  }
  if (!slime.grounded) {
    if (slime.coyote > 0) slime.coyote -= dt
    slime.vy += P.grav * dt
    if (slime.vy > P.fallMax) slime.vy = P.fallMax
    slime.vx *= Math.pow(P.dragAir, dt)
    if (Math.abs(slime.vx) > 40) slime.face = slime.vx > 0 ? 1 : -1
    slime.x += slime.vx * dt
    slime.y += slime.vy * dt
    // Pas de plafond : le slime peut monter au-dessus de l'écran (un
    // indicateur en haut le signale, voir drawOffscreen).
    if (slime.vy >= 0) {
      for (const p of platforms) {
        if (p.dead) continue
        if (slime.x > p.x - 6 && slime.x < p.x + p.w + 6 && prevY + slime.r <= p.y + 8 && slime.y + slime.r >= p.y) {
          land(p)
          break
        }
      }
      // Atterrissage raté de justesse -> accroche au bord (ledge catch).
      if (!slime.grounded && POWERS.ledge.enabled && slime.noCatchT <= 0) tryLedgeCatch(prevY)
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
    if (dist(slime.x, slime.y, b.x, b.y) < slime.r + (b.gold || b.life ? 9 : 6)) {
      b.taken = true
      if (b.life) {
        // Bonus slime « as in HUD » : +1 vie, ou points si déjà au max.
        bonusCollected++
        if (slime.size < 3) {
          slime.size++
          sfx(SFX_COIN, 4, 1.1)
          burst(b.x, b.y, C_SLIME, 12, 140)
        } else {
          sfx(SFX_COIN, 2, 1.2)
          burst(b.x, b.y, C_SLIME_L, 14, 160)
        }
      } else if (b.gold) {
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

// Shim de mesure : ?prof chronomètre update() (tous early-returns inclus).
function update(dt) {
  if (!diagProf) { update_(dt); return }
  const t0 = performance.now()
  update_(dt)
  diagUpMs += performance.now() - t0
}

function update_(dt) {
  if (diagFps || diagProf) diagUps++
  if (dt > 1) dt /= 1000
  if (iskeypressed('m')) Music.toggle()
  // Slow-mo : la durée décroit en temps réel ; l'échelle de temps du jeu
  // (ts) glisse en douceur vers la cible (1 = vitesse normale).
  if (slowmoT > 0) {
    slowmoT -= dt
    if (slowmoT <= 0) slowmoT = 0
  }
  const target = slowmoT > 0 && POWERS.slowmo.enabled ? POWERS.slowmo.scale : 1
  ts += (target - ts) * Math.min(1, dt * 12)
  if (Math.abs(ts - target) < 0.01) ts = target
  const dts = dt * ts
  gameT += dts
  if (state === 'title') { camX += 14 * dt; return }
  if (state === 'over') { deathT += dt; if (copiedT > 0) copiedT -= dt; updParticles(dts); if (shakeT > 0) shakeT -= dt; return }
  // Avant le premier saut : tout est gelé (caméra, chrono, timers, musique),
  // seule la visée du saut est active.
  if (!runStarted) {
    if (aim.on && !aim.air && !slime.grounded && !slime.pull && slime.coyote <= 0) { aim.on = false; aimPad = null }
    updParticles(dts)
    return
  }
  elapsed += dts
  const P = PH()
  // Caméra : paliers tous les CAM_PALIER_S s ; le pas est déduit de camRampDur
  // (réglage éditeur « Temps jusqu'au max ») pour atteindre le plafond en
  // camRampDur secondes de jeu, quelle que soit la base/max choisies.
  // Défauts (80→240, 9 min) : +3 px/s toutes les 10 s — calé sur 3 BGM de 3 min.
  // Le playtest n'est pas figé : il part de la vitesse de base réglée (P.camBase).
  const camStep = Math.max(1, Math.round((P.camMax - P.camBase) * CAM_PALIER_S / P.camRampDur))
  camSpd = testMode ? P.camBase : Math.min(P.camBase + Math.floor(elapsed / CAM_PALIER_S) * camStep, P.camMax)
  camX += camSpd * dts
  if (testMode) testSecT += dts
  if (shakeT > 0) shakeT -= dts
  genUntil()
  cleanup()
  for (const p of platforms) {
    if (p.type === 'dynamic') p.y = p.baseY + Math.sin(gameT * p.spd * PLAT.spdMul + p.ph) * p.amp
    if (p.crackT > 0) {
      p.crackT -= dts
      if (p.crackT <= 0) {
        p.crackT = 0
        killPlat(p, C_CR_SIDE)
        sfx(SFX_DIE, 2, 0.3)
      }
    }
    if (p.timerSet) {
      p.timer -= dts
      if (p.timer <= 0) {
        p.timer = 0
        killPlat(p, C_BLUE_L)
        sfx(SFX_DIE, 2, 0.3)
      }
    }
  }
  if (slime.djCd > 0) slime.djCd = Math.max(0, slime.djCd - dts)
  updSlime(dts)
  // Visée au sol devenue impossible (plateforme quittée sans sauter).
  if (aim.on && !aim.air && !slime.grounded && !slime.pull && slime.coyote <= 0) { aim.on = false; aimPad = null }
  updBalls()
  updParticles(dts)
  // T6 — score de ce tick recalculé (distance parcourue + billes ramassées
  // ci-dessus) : mémorise l'instant d'obtention d'un palier de couleur.
  // Pur et O(1) hors franchissement de palier ; avant les tests de mort pour
  // que la soumission embarque le palier atteint à l'instant fatal.
  if (TT) tierTimes = TT.track(tierTimes, scoreTierIdx(), elapsed)
  if (slime.x + slime.r < camX) die()
  if (slime.y - slime.r > VH + 30) die()
}

function tap(px, py, touchId) {
  calcView()
  const vx = (px - VOX) / VSC, vy = (py - VOY) / VSC
  if ((state === 'title' || state === 'over') && langTapped(vx, vy)) return
  if (vx < 30 && vy < 24) { Music.toggle(); return }
  if (fsCanEnter() && !fsStandalone() && vx > VW - 34 && vy < 26) { toggleFullscreen(); return }
  if (state === 'title') startGame() // pas de return : ce même appui vise le 1er saut
  if (state === 'over') {
    if (deathT < OVER_DELAY + 0.7) return // boutons pas encore affichés
    if (hitBtn(vx, vy, BTN_COPY)) { copyCode(); return }
    if (hitBtn(vx, vy, BTN_REPLAY)) { startGame(); return }
    if (hitBtn(vx, vy, BTN_ATELIER)) { openAtelier(); return }
    return
  }
  const w = s2w(px, py)
  const touch = touchId > 0
  const sx = touch ? slime.x : w.x, sy = touch ? slime.y : w.y
  if (slime.grounded || slime.coyote > 0 || slime.pull) {
    if (!aim.on) {
      aim = { on: true, x: sx, y: sy, id: touchId, air: false }
      aimPad = touch ? { x: px, y: py } : null
    }
  } else if (canDoubleJump()) {
    if (!aim.on) {
      aim = { on: true, x: sx, y: sy, id: touchId, air: true }
      aimPad = touch ? { x: px, y: py } : null
      // Bullet time : le jeu ralentit pendant la visée du double saut.
      if (POWERS.slowmo.enabled) slowmoT = POWERS.slowmo.duration
    }
  }
  // Sinon (en l'air, pouvoir indisponible) : l'appui est ignoré.
}

function tapping(px, py, touchId) {
  if (aim.on && touchId === aim.id) {
    if (aimPad) {
      // Tactile : le réticule suit le DELTA du doigt, converti en unités monde
      // (zoom de vue inclus) et borné autour de la caméra.
      const k = AIM_SENS * camW / (VW * VSC)
      aim.x = clamp(aim.x + (px - aimPad.x) * k, camX - 120, camX + VW + 120)
      aim.y = clamp(aim.y + (py - aimPad.y) * k, -240, VH + 40)
      aimPad.x = px
      aimPad.y = py
    } else {
      const w = s2w(px, py)
      aim.x = w.x
      aim.y = w.y
    }
  }
}

function untap(px, py, touchId) {
  if (aim.on && touchId === aim.id) {
    aimPad = null
    execJump()
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

// ---------- titre : style « présentation » (fond sombre, panneaux flottants,
// sol en tuiles, logo à ombres superposées) ----------
const LANG_W = 30, LANG_GAP = 6, LANG_H = 17

function langZone() {
  const ls = I18N.langs()
  const total = ls.length * LANG_W + (ls.length - 1) * LANG_GAP
  return { x: VW / 2 - total / 2, y: 5, w: total, h: LANG_H + 5 }
}

function drawLangToggle() {
  const z = langZone()
  const c = ctx()
  c.save()
  c.globalAlpha = 0.5
  rectfill(z.x - 5, z.y - 1, z.w + 10, z.h + 2, C_PAGE, 6)
  c.restore()
  textalign('center', 'top')
  textsize(8)
  let x = z.x
  for (const l of I18N.langs()) {
    const on = I18N.get() === l
    rectfill(x, z.y, LANG_W, LANG_H, on ? C_GREEN : C_PANEL2, 5)
    if (!on) rect(x, z.y, LANG_W, LANG_H, C_BG3, 1)
    text(x + LANG_W / 2, z.y + 5, I18N.label(l), on ? C_BLACK : C_WHITE, on ? '900' : 'normal')
    x += LANG_W + LANG_GAP
  }
  textalign('start', 'top')
}

// true si le tap est dans le sélecteur de langue (et change la langue).
function langTapped(vx, vy) {
  const z = langZone()
  if (vx < z.x || vx > z.x + z.w || vy > z.y + z.h) return false
  const ls = I18N.langs()
  const idx = Math.max(0, Math.min(ls.length - 1, Math.floor((vx - z.x) / (LANG_W + LANG_GAP))))
  I18N.set(ls[idx])
  return true
}

function drawTitleBG() {
  cls(C_PAGE)
  const c = ctx()
  // Halo vert doux derrière le logo (équivalent du radial-gradient CSS).
  c.save()
  const g = c.createRadialGradient(VW / 2, -30, 20, VW / 2, -30, 230)
  g.addColorStop(0, 'rgba(62,203,62,0.17)')
  g.addColorStop(1, 'rgba(62,203,62,0)')
  c.fillStyle = g
  c.fillRect(0, 0, VW, VH)
  c.restore()
  if (!Sprites.ready) return
  // Panneaux du décor, flottants, très discrets (comme .floatPanel).
  const P = [
    ['bgPanel1', 48, 58, 62, 0],
    ['bgPanel2', 372, 80, 54, 3],
    ['bgPanel3', 86, 148, 58, 5],
    ['bgPanel4', 338, 162, 48, 7]
  ]
  alpha(0.10)
  for (let k = 0; k < P.length; k++) {
    Sprites.drawImage(P[k][0], P[k][1], P[k][2] + Math.sin(T * 0.8 + P[k][4]) * 5, P[k][3])
  }
  alpha(1)
  // Sol en tuiles vertes + liseré noir (comme .ground).
  for (let x = 0; x < VW; x += 64) Sprites.drawImage('tileGreen', x, VH - 48, 64, 48)
  rectfill(0, VH - 48, VW, 3, C_BLACK)
}

function drawLogo() {
  const c = ctx()
  const pw = 320, ph = 70
  const px = VW / 2 - pw / 2, py = 26
  // Ombre décalée puis panneau à bordure fine (style .card).
  rectfill(px - 3, py + 6, pw + 6, ph, C_BLACK, 10)
  rectfill(px, py, pw, ph, C_FRAME, 10)
  rect(px, py, pw, ph, C_BG3, 2)
  const word = 'SLIME', ty = py + 12
  textalign('center', 'top')
  textsize(46)
  text(VW / 2, ty + 8, word, C_BLACK, '900')
  text(VW / 2, ty + 4, word, C_LOGO_D, '900')
  c.save()
  c.shadowColor = 'rgba(62,203,62,0.5)'
  c.shadowBlur = 22
  text(VW / 2, ty, word, C_GREEN, '900')
  c.restore()
  // Deux tons : moitié haute plus claire (comme le logo d'origine).
  c.save()
  c.beginPath()
  c.rect(px + 6, ty, pw - 12, 19)
  c.clip()
  text(VW / 2, ty, word, C_SLIME_L, '900')
  c.restore()
  textalign('start', 'top')
}

function drawTitleSlime() {
  if (!Sprites.ready) {
    drawBlob(VW / 2, VH - 74, 20, 1, 1, false)
    return
  }
  const bob = Math.sin(T * 2.5) * 4
  const feet = VH - 46
  alpha(0.25)
  push(VW / 2, feet + 2, 0, 1 + 0.04 * bob / 4, 0.28)
  circfill(0, 0, 26, C_BLACK)
  pop()
  alpha(1)
  // Le slime du titre porte la couleur du high score (record masqué).
  const k = 'big' + tierSuffix(SlimeColors.tierIndex(TIERS, best))
  if (!Sprites.draw(k, VW / 2, feet + bob, 52)) Sprites.draw('big', VW / 2, feet + bob, 52)
}

function drawTitle() {
  drawTitleBG()
  drawLogo()
  drawTitleSlime()
  drawLangToggle()
  textalign('center', 'top')
  textsize(10)
  text(VW / 2, 118, I18N.t('aim'), C_WHITE)
  textsize(12)
  alpha(0.55 + 0.45 * Math.sin(T * 3))
  text(VW / 2, 140, I18N.t('start'), C_GOLD, 'bold')
  alpha(1)
  if (window.innerHeight > window.innerWidth) {
    textsize(9)
    text(VW / 2, 196, I18N.t('rotate'), C_ORANGE, 'bold')
  } else if (!fsCanEnter() && !fsStandalone()) {
    // Aucune API plein écran : l'ajout à l'écran d'accueil lance le jeu
    // plein écran (métas apple-mobile-web-app-*).
    textsize(8)
    alpha(0.7)
    text(VW / 2, 198, I18N.t('addhome'), C_WHITE)
    alpha(1)
  }
  textsize(8)
  rectfill(VW - 46, VH - 22, 42, 15, C_PAGE, 4)
  text(VW - 25, VH - 18, 'v' + VERSION, C_GRAY)
  textalign('start', 'top')
}

function drawReadyHint() {
  textalign('center', 'top')
  textsize(10)
  alpha(0.55 + 0.45 * Math.sin(T * 3))
  text(VW / 2, 108, I18N.t('aim'), aim.on ? C_GREEN : C_GOLD)
  if (TOUCH_DEVICE) text(VW / 2, 122, I18N.t('anywhere'), C_GRAY)
  alpha(1)
  textalign('start', 'top')
}

function drawBlob(x, y, r, sx, sy, blink, col, colD) {
  if (blink) return
  col = col || C_SLIME
  colD = colD || C_SLIME_D
  push(x, y, 0, sx, sy)
  circfill(0, -r * 0.3, r * 0.92 + 2, colD)
  rectfill(-r * 0.92 - 2, -r * 0.3, (r * 0.92 + 2) * 2, r * 1.3 + 2, colD)
  circfill(0, -r * 0.3, r * 0.92, col)
  rectfill(-r * 0.92, -r * 0.3, r * 1.84, r * 1.3, col)
  rectfill(-r * 0.92, r * 0.86, r * 1.84, r * 0.14, colD)
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
      // bande dynamique : 9 tuiles de pas 256/9 (icônes chrono sur les
      // cellules 1, 5, 9), dessinées par cellule à la même taille que les
      // autres tuiles (32x24) — l'étirer sur p.w entier la déformait selon
      // le nombre de cellules.
      const pitch = 256 / 9
      for (let i = 0; i < n; i++) {
        const t = (i % 9) * pitch
        Sprites.drawSrc('dynStrip', t, 0, pitch, 33, p.x + jx + i * CELL, p.y, CELL, 24)
      }
      if (p.timerSet && p.timer < 1.5) {
        alpha(0.25 + 0.25 * Math.sin(T * 12))
        rectfill(p.x + jx, p.y, p.w, 24, C_RED)
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
  if (b.life) {
    const pu = 1 + 0.1 * Math.sin(T * 4)
    alpha(0.35)
    circ(b.x, b.y, 11 * pu, C_SLIME_L)
    alpha(1)
    if (!Sprites.drawImage('bonusLife', b.x - 11, b.y - 9, 22)) {
      circ(b.x, b.y, 7.5, C_BLACK)
      circfill(b.x, b.y, 6, C_SLIME)
      circfill(b.x - 2, b.y - 2, 1.6, C_WHITE)
      circfill(b.x + 2, b.y - 2, 1.6, C_WHITE)
    }
    return
  }
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

// Halo sous le doigt (visée tactile relative) : repère le pouce pendant que le
// réticule — posé plus loin, lui — reste lisible.
function drawAimPad() {
  const w = s2w(aimPad.x, aimPad.y)
  alpha(0.12)
  circfill(w.x, w.y, 17, C_WHITE)
  alpha(0.4)
  circ(w.x, w.y, 17, C_WHITE)
  alpha(1)
}

function drawTrajectory() {
  const P = PH()
  const pw = Phys.aimRatio(dist(slime.x, slime.y, aim.x, aim.y))
  const v = Phys.aimVel(dist(slime.x, slime.y, aim.x, aim.y)) * slime.jumpMul * (aim.air ? POWERS.doubleJump.powerMul : 1)
  const ang = Math.atan2(aim.y - slime.y, aim.x - slime.x)
  // Anneaux de portée : min (vmin) et max (vmax) autour du slime + réticule.
  alpha(0.18)
  circ(slime.x, slime.y, P.aimMin, C_WHITE)
  circ(slime.x, slime.y, P.aimMax, pw >= 1 ? C_GOLD : C_WHITE)
  alpha(1)
  alpha(0.7)
  circ(aim.x, aim.y, 5, C_WHITE)
  alpha(0.9)
  line(aim.x - 9, aim.y, aim.x - 3, aim.y, C_WHITE)
  line(aim.x + 3, aim.y, aim.x + 9, aim.y, C_WHITE)
  line(aim.x, aim.y - 9, aim.x, aim.y - 3, C_WHITE)
  line(aim.x, aim.y + 3, aim.x, aim.y + 9, C_WHITE)
  alpha(1)
  let x = slime.x, y = slime.y
  let vx = Math.cos(ang) * v, vy = Math.sin(ang) * v
  const dt = 1 / 60
  let idx = 0
  for (let i = 0; i < 120; i++) {
    vy += P.grav * dt
    x += vx * dt
    y += vy * dt
    let hit = false
    if (vy >= 0) {
      for (const p2 of platforms) {
        if (p2.dead) continue
        if (x > p2.x - 6 && x < p2.x + p2.w + 6 && y + slime.r >= p2.y && y + slime.r <= p2.y + 14) { hit = true; break }
      }
    }
    if (i % 3 === 0) {
      alpha(0.85 - idx * 0.04)
      circfill(x, y, Math.max(1.2, 2.6 - idx * 0.12), pw >= 1 ? C_GOLD : C_WHITE)
      alpha(1)
      idx++
    }
    if (hit || y > VH + 40 || x < camX - 40 || x > camX + VW + 30) break
  }
}

function drawSlime() {
  // Bas du sprite ancré 1 px sous le plan de collision (slime.y + r) :
  // contact visuel garanti avec la plateforme, couture d'AA masquée.
  const feet = slime.y + slime.r + 1
  const suffix = tierSuffix(scoreTierIdx())
  if (Sprites.ready) {
    // Ledge catch : remontée en 3 frames calées sur le canevas LEDGE_* (haut
    // du bloc = sommet plateforme, face du bloc = bord de la plateforme) :
    // drapé sur le coin (accroche), traction (effort), assis (posé). Le
    // déplacement est intégré aux frames ; miroir selon le côté. Facteur 2 :
    // échelle visible identique à 1.5/240.
    if (slime.pull) {
      const kk = 1 - Math.max(slime.pull.t, 0) / slime.pull.dur
      const key = kk < 0.25 ? 'ledge' : kk < 0.8 ? 'ledgeUp' : 'ledgeTop'
      let k = key + suffix
      if (!(Sprites.get(k) && Sprites.get(k).width)) k = key
      const im = Sprites.get(k)
      if (im && im.width) {
        const w = slimeDrawW() * 2
        const h = w * LEDGE_H / LEDGE_W
        const p = slime.pull.plat
        const flip = slime.pull.side > 0
        const x = flip ? p.x + p.w - 2 - w * (1 - LEDGE_BLOCK_L / LEDGE_W)
                       : p.x + 2 - w * (LEDGE_BLOCK_L / LEDGE_W)
        if (slime.invuln > 0) alpha(Math.floor(T * 14) % 2 === 0 ? 1 : 0.55)
        Sprites.drawTL(k, x, p.y - 1 - h * (LEDGE_GRIP / LEDGE_H), w, flip)
        alpha(1)
      } else {
        drawPullFallback(kk)
      }
      return
    }
    // Double saut : pendant le ralenti de visée, le slime « time warp »
    // (teal + tourbillons) remplace la boule ; sinon boule + lignes de
    // vitesse, puis anneau d'impulsion juste après le relâcher.
    if (!slime.grounded && (slime.pumpT > 0 || (aim.on && aim.air))) {
      const ring = slime.pumpT > 0
      const tw = !ring && ts < 0.9 ? Sprites.get('timeWarp') : null
      if (tw && tw.width) {
        const wt = slimeDrawW() * 1.35
        const ht = wt * tw.height / tw.width
        alpha(0.6 + 0.25 * Math.sin(T * 8))
        Sprites.drawTL('timeWarp', slime.x - wt / 2, slime.y - ht * 0.55, wt, false)
        alpha(1)
        return
      }
      let key = ring ? 'djPump1' : 'djPump0'
      let k = key + suffix
      if (!(Sprites.get(k) && Sprites.get(k).width)) k = key
      const im = Sprites.get(k)
      if (im && im.width) {
        const w = slimeDrawW() * 1.05
        const h = w * im.height / im.width
        Sprites.drawTL(k, slime.x - w / 2, slime.y - h / 2 + slime.r * 0.15, w, false)
      } else {
        drawPumpFallback(ring)
      }
      return
    }
    let key
    if (slime.squashT > 0) key = 'land' + suffix
    else if (!slime.grounded) key = slime.vy < 60 ? 'jump' + suffix : 'fall' + suffix
    else key = (Math.floor(T * 3) % 2 ? 'idle0' : 'idle1') + suffix
    let sx = 1, sy = 1
    if (aim.on) {
      const c = Phys.aimRatio(dist(slime.x, slime.y, aim.x, aim.y))
      sy = 1 - 0.2 * c
      sx = 1 + 0.15 * c
    }
    // « invert too » : saut/chute vers la gauche = sprites en miroir.
    if (!slime.grounded && key !== 'land' + suffix && slime.face < 0) sx = -1
    if (slime.invuln > 0) alpha(Math.floor(T * 14) % 2 === 0 ? 1 : 0.45)
    // Variante de couleur absente -> repli sur le sprite de base (jamais invisible).
    if (!Sprites.draw(key, slime.x, feet, slimeDrawW(), sx, sy)) Sprites.draw(key.replace(/_t\d+$/, ''), slime.x, feet, slimeDrawW(), sx, sy)
    alpha(1)
    // Bullet time (time warp) : tourbillons autour du slime en plein ralenti.
    if (ts < 0.9 && !slime.pull) drawTimeWarp()
    return
  }
  const blink = slime.invuln > 0 && Math.floor(T * 18) % 2 === 0
  const col = tierCol(scoreTierIdx())
  let sx = 1, sy = 1
  if (slime.pull) {
    drawPullFallback(1 - Math.max(slime.pull.t, 0) / slime.pull.dur)
    return
  }
  if (!slime.grounded && (slime.pumpT > 0 || (aim.on && aim.air))) {
    drawPumpFallback(slime.pumpT > 0)
    return
  }
  if (aim.on) {
    const c = Phys.aimRatio(dist(slime.x, slime.y, aim.x, aim.y))
    sy = 1 - 0.22 * c
    sx = 1 + 0.17 * c
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

// Remontée sans asset : première moitié — corps pendant sous le bord, deux
// bras sur le sommet ; seconde moitié — corps qui s'élève au-dessus du bord.
function drawPullFallback(k) {
  const col = tierCol(scoreTierIdx())
  const p = slime.pull.plat
  const dir = slime.pull.side < 0 ? 1 : -1 // bord côté plateforme
  if (k < 0.5) {
    push(slime.x, slime.y + slime.r * 0.4, 0, 1, 0.85)
    circfill(0, -slime.r * 0.2, slime.r * 0.88, C_BLACK)
    circfill(0, -slime.r * 0.2, slime.r * 0.78, col)
    pop()
    // bras par-dessus le bord de la plateforme
    const ex = slime.x + dir * slime.r * 0.7
    rectfill(ex - 3, p.y - 3, 6, 3, col)
    rectfill(ex + dir * 6 - 2, p.y - 3, 5, 3, col)
    // yeux fatigués
    const ey = slime.y + slime.r * 0.25
    line(slime.x - 5, ey, slime.x - 1, ey, C_BLACK)
    line(slime.x + 1, ey, slime.x + 5, ey, C_BLACK)
  } else {
    push(slime.x, slime.y + slime.r, 0, 1, 1 - 0.15 * (1 - k))
    circfill(0, -slime.r * 0.5, slime.r * 0.95, C_BLACK)
    circfill(0, -slime.r * 0.5, slime.r * 0.85, col)
    pop()
  }
}

// Double saut sans asset : boule comprimée cerclée de noir, arcs de vitesse
// (visée) ou anneau d'impulsion (relâcher).
function drawPumpFallback(ring) {
  const col = tierCol(scoreTierIdx())
  const rr = slime.r * 0.78
  circfill(slime.x, slime.y, rr + 2, C_BLACK)
  circfill(slime.x, slime.y, rr, col)
  circfill(slime.x - rr * 0.3, slime.y - rr * 0.3, rr * 0.22, C_WHITE)
  alpha(0.8)
  if (ring) {
    circ(slime.x, slime.y, rr + 5 + Math.sin(T * 20) * 1.5, tierColL(scoreTierIdx()))
  } else {
    for (let i = -1; i <= 1; i++) {
      const a = T * 14 + i * 0.9
      line(slime.x + Math.cos(a) * (rr + 3), slime.y + Math.sin(a) * (rr + 3), slime.x + Math.cos(a) * (rr + 7), slime.y + Math.sin(a) * (rr + 7), tierColL(scoreTierIdx()))
    }
  }
  alpha(1)
}

// Time warp sans asset : anneaux cyan rotatifs autour du slime.
function drawTimeWarp() {
  const tw = Sprites.get('timeWarp')
  if (tw && tw.width) {
    const w = slimeDrawW() * 1.35
    const h = w * tw.height / tw.width
    alpha(0.55 + 0.25 * Math.sin(T * 8))
    Sprites.drawTL('timeWarp', slime.x - w / 2, slime.y - h * 0.55, w, false)
    alpha(1)
    return
  }
  alpha(0.45 + 0.2 * Math.sin(T * 9))
  for (let i = 0; i < 2; i++) {
    const rr = slime.r + 4 + i * 4
    const a0 = T * (6 - i * 2.5) + i * 2.4
    let px = slime.x + Math.cos(a0) * rr, py = slime.y + Math.sin(a0) * rr * 0.85
    for (let k = 1; k <= 5; k++) {
      const a = a0 + k * 0.42
      const nx = slime.x + Math.cos(a) * rr, ny = slime.y + Math.sin(a) * rr * 0.85
      line(px, py, nx, ny, C_BLUE_HI)
      px = nx; py = ny
    }
  }
  alpha(1)
}

// Mort en séquence (cf. planche annotée) : splat -> gouttes -> bulles ->
// fines particules (~0.12 s/frame) qui s'estompent ; les particules du burst
// prennent ensuite le relais. Fallback : splat seul, comme avant.
function drawDeath() {
  if (!Sprites.ready) return
  const feet = slime.y + slime.r + 1
  const suffix = tierSuffix(deathTier)
  const f = Math.floor(deathT / 0.12)
  if (f >= 1 && f <= 3) {
    const im = Sprites.get('death' + f + suffix) || Sprites.get('death' + f)
    if (im && im.width) {
      alpha(clamp(1.7 - deathT * 1.4, 0.3, 1))
      Sprites.draw('death' + f + suffix, slime.x, feet, slimeDrawW() * 1.9) || Sprites.draw('death' + f, slime.x, feet, slimeDrawW() * 1.9)
      alpha(1)
      return
    }
  }
  if (deathT < 0.5) Sprites.draw('splat' + suffix, slime.x, feet, slimeDrawW() * 1.5) || Sprites.draw('splat', slime.x, feet, slimeDrawW() * 1.5)
}

function drawParticles() {
  for (const p of particles) {
    alpha(clamp(p.life * 2, 0, 1))
    circfill(p.x, p.y, p.r, p.c)
  }
  alpha(1)
}

// ---------- Bandes de danger (rendu unifié : gauche / droite / bas) ----------
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

// Bandes latérales en coordonnées MONDE : dessinées dans le transform zoomé,
// elles restent alignées sur les hitboxes quel que soit le zoom.
function drawDamageWalls() {
  drawDamageBand(camX, 0, WALL.left, VH, 'right')
  drawDamageBand(camX + VW - WALL.right, 0, WALL.right, VH, 'left')
}

function drawFrameEdges() {
  drawDamageBand(0, VH - 8, VW, 8, null)
}

// ---------- HUD vitesse (compact) ----------
// Jauge « VITESSE » v4 : cadran pré-rendu selon l'état (LENT / MOYEN /
// RAPIDE / TRÈS RAPIDE — pointes rouges), choisi par quartile de camRatio().
// Fallback : barre segmentée v3 en escalier (asset gauge_bar) remplie de
// vert à rouge ; puis mini-arc procédural avec aiguille (ancien style).
// 15 cellules de l'asset gauge_bar (659x91) : [x0, x1, yHaut], bas commun 91.
const GAUGE_CELLS = [[5, 38, 41], [46, 84, 40], [92, 126, 34], [134, 172, 34], [180, 214, 29], [222, 256, 29], [264, 302, 23], [310, 344, 23], [352, 389, 17], [397, 431, 17], [439, 477, 12], [485, 520, 11], [528, 565, 6], [573, 607, 5], [615, 652, 0]]
const GAUGE_W = 659, GAUGE_H = 91
const GAUGE_STATES = ['gaugeSlow', 'gaugeMid', 'gaugeFast', 'gaugeVeryFast']

function drawSpeedGauge(ratio) {
  const gkey = GAUGE_STATES[Math.min(3, Math.max(0, Math.floor(ratio * 4)))]
  const dial = Sprites.get(gkey)
  if (dial && dial.width) {
    textsize(7)
    text(VW - 70, 18, I18N.t('speed'), C_WHITE)
    const dh = 22, dw = dh * dial.width / dial.height
    Sprites.drawImage(gkey, VW - 8 - dw, 10, dw)
  } else {
    const bar = Sprites.get('gaugeBar')
    if (bar && bar.width) {
      textsize(7)
      text(VW - 70, 18, I18N.t('speed'), C_WHITE)
      Sprites.drawImage('speedArrow', VW - 70, 26, 12)
      const bw = 50, bh = 8, bx = VW - 56, by = 28
      Sprites.drawImage('gaugeBar', bx, by, bw)
      const filled = Math.round(ratio * GAUGE_CELLS.length)
      for (let i = 0; i < filled; i++) {
        const c = GAUGE_CELLS[i]
        const col = i < 7 ? C_SLIME : i < 11 ? C_ORANGE : C_RED
        rectfill(bx + c[0] / GAUGE_W * bw + 0.5, by + c[2] / GAUGE_H * bh + 0.4,
          (c[1] - c[0]) / GAUGE_W * bw - 1, (GAUGE_H - c[2]) / GAUGE_H * bh - 0.8, col)
      }
    } else {
      const gx = VW - 24, gy = 36, r = 12
      textsize(7)
      text(VW - 70, 24, I18N.t('speed'), C_WHITE)
      text(VW - 70, 32, 'CAMERA', C_WHITE)
      for (let i = 0; i <= 8; i++) {
        const a0 = Math.PI * (1 - i / 8)
        const col = i < 4 ? C_SLIME : i < 6.5 ? C_ORANGE : C_RED
        line(gx + Math.cos(a0) * (r - 4), gy - Math.sin(a0) * (r - 4), gx + Math.cos(a0) * (r + 3), gy - Math.sin(a0) * (r + 3), col)
      }
      const na = Math.PI * (1 - ratio)
      if (Sprites.ready) Sprites.rotated('needleH', -na, gx, gy, 0.08, 0.5, 0.3)
      else line(gx, gy, gx + Math.cos(na) * (r - 3), gy - Math.sin(na) * (r - 3), C_WHITE)
      circfill(gx, gy, 1.5, C_BLACK)
    }
  }
  textsize(9)
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
  drawSpeedGauge(camRatio())
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
    rectfill(0, -12, 5, VH + 24, C_RED)
    textalign('center', 'top')
    textsize(10)
    text(30, 60, 'DANGER', C_RED)
    alpha(1)
    textalign('start', 'top')
  }
  drawPowerHud()
}

// Indicateur du double saut : jauge de recharge + chevrons, à droite des
// têtes de vie. Pleine et bleue = prêt, grise = en cooldown / épuisée.
function drawPowerHud() {
  const dj = POWERS.doubleJump
  if (!dj.enabled) return
  const x = 12 + 3 * 28 + 6, y = VH - 30, w = 14, h = 24
  const ready = canDoubleJump()
  rectfill(x - 1, y - 1, w + 2, h + 2, C_FRAME, 4)
  rect(x - 1, y - 1, w + 2, h + 2, C_BLACK, 2)
  const f = ready ? 1 : slime.djCd > 0 && dj.cooldown > 0 ? 1 - slime.djCd / dj.cooldown : 0
  rectfill(x + 1, y + 1 + (h - 2) * (1 - f), w - 2, (h - 2) * f, ready ? C_BLUE : C_GRAY)
  alpha(ready ? 0.85 + 0.15 * Math.sin(T * 6) : 0.45)
  shape([x + 3, y + 11, x + 7, y + 6, x + 11, y + 11]); fill(C_WHITE)
  shape([x + 3, y + 18, x + 7, y + 13, x + 11, y + 18]); fill(C_WHITE)
  alpha(1)
}

// Écran game over : délai (s) avant l'assombrissement, pour laisser voir
// l'animation du slime (splat -> gouttes -> bulles -> particules) en plein
// cadre, puis fondu de OVER_FADE s de l'overlay + du panneau.
const OVER_DELAY = 1.5, OVER_FADE = 0.4
const BTN_COPY = { x: 62, y: 180, w: 156, h: 34 }
const BTN_REPLAY = { x: 262, y: 180, w: 156, h: 34 }
// T6 — lien vers L'Atelier des bocaux (hall of fame), pleine largeur sous les
// deux boutons ; disponible même si le joueur n'a pas donné de pseudo.
const BTN_ATELIER = { x: 62, y: 219, w: 356, h: 28 }

// T6 — « VOIR L'ATELIER » : ouvre la page du hall of fame (même onglet).
// try : game_sim (Node) n'a qu'un window.location factice.
function openAtelier() {
  try { window.location.href = 'atelier.html' } catch (e) {}
}

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

// Bouton « chunky » style présentation : ombre décalée + panneau + bordure.
function drawBtn(b, label, col, hot, accent) {
  rectfill(b.x, b.y + 4, b.w, b.h, C_BLACK, 8)
  rectfill(b.x, b.y, b.w, b.h, hot ? C_PANEL2 : (accent || C_PANEL2), 8)
  rect(b.x, b.y, b.w, b.h, C_BLACK, 2)
  if (!hot) rect(b.x + 2, b.y + 2, b.w - 4, b.h - 4, C_BG3, 1)
  textsize(9)
  text(b.x + b.w / 2, b.y + 13, label, col, '900')
}

function drawOver() {
  // Avant OVER_DELAY : rien par-dessus le monde, le splash reste visible.
  const k = clamp((deathT - OVER_DELAY) / OVER_FADE, 0, 1)
  if (k <= 0) return
  const c = ctx()
  c.save()
  c.setTransform(1, 0, 0, 1, 0, 0)
  alpha(0.66 * k)
  rectfill(0, 0, W, H, C_BLACK)
  alpha(1)
  c.restore()
  // Tout le panneau fond avec k (les textes sans alpha() explicite héritent).
  alpha(k)
  // Panneau central, style « présentation » (234 de haut : T6 ajoute le
  // bouton VOIR L'ATELIER sous CODE/REJOUER).
  rectfill(VW / 2 - 3, 30, 406, 234, C_BLACK, 12)
  rectfill(VW / 2 - 200, 24, 400, 234, C_FRAME, 12)
  rect(VW / 2 - 200, 24, 400, 234, C_BG3, 2)
  drawLangToggle()
  textalign('center', 'top')
  // Titre à ombres superposées.
  textsize(30)
  text(VW / 2, 46, I18N.t('over'), C_BLACK, '900')
  text(VW / 2, 42, I18N.t('over'), C_RED, '900')
  if (newRecord) {
    alpha(k * (0.55 + 0.45 * Math.sin(T * 6)))
    textsize(13)
    text(VW / 2, 80, I18N.t('record'), C_GOLD, 'bold')
    alpha(k)
  }
  textsize(9)
  text(VW / 2, 102, I18N.t('code'), C_GRAY)
  rectfill(72, 112, 336, 28, C_PAGE, 6)
  rect(72, 112, 336, 28, C_BG3, 2)
  textsize(9)
  text(VW / 2, 120, scoreCode, C_WHITE)
  textsize(8)
  text(VW / 2, 148, I18N.t('codehint'), C_GRAY)
  textsize(9)
  text(VW / 2, 164, I18N.t('time') + ' ' + fmtTime(elapsed), C_WHITE)
  if (deathT > OVER_DELAY + 0.7) {
    const copied = copiedT > 0
    const kb = clamp((deathT - OVER_DELAY - 0.7) * 3, 0, 1)
    alpha(kb)
    drawBtn(BTN_COPY, copied ? I18N.t('copied') : I18N.t('copy'), copied ? C_SLIME_L : C_GOLD, copied)
    alpha(kb * (0.6 + 0.4 * Math.sin(T * 4)))
    drawBtn(BTN_REPLAY, I18N.t('replay'), C_BLACK, false, C_GREEN)
    // T6 — hall of fame : disponible même sans pseudo (navigation seule).
    alpha(kb)
    drawBtn(BTN_ATELIER, I18N.t('atelier'), C_WHITE, false, C_BLUE)
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
// Android/desktop : API Fullscreen native. iPhone : Safari n'expose l'API
// que sur <video> — on diffuse le canvas dans une <video> via captureStream
// et on passe celle-ci en plein écran (seul moyen de masquer l'UI Safari).
let fsVideo = null
let fsVideoOn = false
let fsVideoBound = false
let fsMouseDown = false

function fsSupported() {
  const el = document.documentElement
  return !!(el.requestFullscreen || el.webkitRequestFullscreen)
}

// Vrai plein écran disponible : API native (Android/desktop) ou astuce vidéo (iOS).
function fsCanEnter() {
  if (fsSupported()) return true
  const v = typeof HTMLVideoElement !== 'undefined' && HTMLVideoElement.prototype
  return !!(v && (v.webkitEnterFullscreen || v.webkitRequestFullscreen) && canvas().captureStream)
}

// Déjà plein écran via l'ajout à l'écran d'accueil (iOS standalone / PWA).
function fsStandalone() {
  return !!navigator.standalone ||
    !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
}

function fsFullscreenActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || fsVideoOn)
}

function toggleFullscreen() {
  if (fsFullscreenActive()) { fsExit(); return }
  if (fsSupported()) { fsEnterNative(); return }
  fsEnterVideo()
}

function fsEnterNative() {
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

function fsExit() {
  if (fsVideoOn && fsVideo) {
    try { if (fsVideo.webkitExitFullscreen) fsVideo.webkitExitFullscreen() } catch (e) {}
    try { if (document.webkitExitFullscreen) document.webkitExitFullscreen() } catch (e) {}
    return
  }
  const exit = document.exitFullscreen || document.webkitExitFullscreen
  if (exit) exit.call(document)
}

// Astuce iOS : captureStream du canvas -> <video> plein écran. Le play() et
// l'entrée en plein écran doivent rester dans le geste (tap sur l'icône).
function fsEnterVideo() {
  const cv = canvas()
  if (!cv.captureStream) return
  try {
    if (!fsVideo) {
      fsVideo = document.createElement('video')
      fsVideo.muted = true
      fsVideo.playsInline = true
      fsVideo.setAttribute('playsinline', '')
      fsVideo.setAttribute('webkit-playsinline', '')
      fsVideo.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none'
      document.body.appendChild(fsVideo)
      // iPhone : webkitbegin/endfullscreen ; iPad : (webkit)fullscreenchange.
      for (const ev of ['webkitbeginfullscreen', 'webkitendfullscreen', 'fullscreenchange', 'webkitfullscreenchange']) {
        fsVideo.addEventListener(ev, fsVideoState)
      }
    }
    if (fsVideo.srcObject && fsVideo.srcObject.getTracks) {
      try { fsVideo.srcObject.getTracks().forEach(t => t.stop()) } catch (e) {}
    }
    fsVideo.srcObject = cv.captureStream()
    const p = fsVideo.play()
    if (p && p.catch) p.catch(() => {})
    if (fsVideo.webkitEnterFullscreen) fsVideo.webkitEnterFullscreen()
    else if (fsVideo.webkitRequestFullscreen) {
      const q = fsVideo.webkitRequestFullscreen()
      if (q && q.catch) q.catch(() => {})
    }
  } catch (e) {}
}

function fsVideoState() {
  const v = fsVideo
  const on = !!v && (!!v.webkitDisplayingFullscreen ||
    document.fullscreenElement === v || document.webkitFullscreenElement === v)
  if (on === fsVideoOn) return
  fsVideoOn = on
  if (on) fsVideoBind()
  else fsVideoUnbind()
}

// Pendant le plein écran vidéo, la vidéo capte les touchers à la place du
// canvas : conversion des coordonnées écran (letterbox) puis relais direct
// vers les mêmes callbacks tap/tapping/untap que le canvas.
function fsVideoToCanvas(cx, cy) {
  const cv = canvas()
  const r = fsVideo.getBoundingClientRect()
  const vw = fsVideo.videoWidth || cv.width
  const vh = fsVideo.videoHeight || cv.height
  const k = Math.min(r.width / vw, r.height / vh)
  const ox = r.left + (r.width - vw * k) / 2
  const oy = r.top + (r.height - vh * k) / 2
  return [(cx - ox) / k, (cy - oy) / k]
}

function fsVideoBind() {
  if (fsVideoBound || !fsVideo) return
  fsVideoBound = true
  fsVideo.addEventListener('touchstart', fsTouchStart, { passive: false })
  fsVideo.addEventListener('touchmove', fsTouchMove, { passive: false })
  fsVideo.addEventListener('touchend', fsTouchEnd, { passive: false })
  fsVideo.addEventListener('touchcancel', fsTouchEnd, { passive: false })
  fsVideo.addEventListener('mousedown', fsMouseDownFn)
  fsVideo.addEventListener('mousemove', fsMouseMove)
  fsVideo.addEventListener('mouseup', fsMouseUpFn)
  window.addEventListener('mouseup', fsMouseUpFn)
}

function fsVideoUnbind() {
  if (!fsVideoBound || !fsVideo) return
  fsVideoBound = false
  fsMouseDown = false
  fsVideo.removeEventListener('touchstart', fsTouchStart)
  fsVideo.removeEventListener('touchmove', fsTouchMove)
  fsVideo.removeEventListener('touchend', fsTouchEnd)
  fsVideo.removeEventListener('touchcancel', fsTouchEnd)
  fsVideo.removeEventListener('mousedown', fsMouseDownFn)
  fsVideo.removeEventListener('mousemove', fsMouseMove)
  fsVideo.removeEventListener('mouseup', fsMouseUpFn)
  window.removeEventListener('mouseup', fsMouseUpFn)
}

function fsTouchStart(e) {
  e.preventDefault()
  for (const t of e.changedTouches) {
    const c = fsVideoToCanvas(t.clientX, t.clientY)
    tap(c[0], c[1], t.identifier + 1)
  }
}

function fsTouchMove(e) {
  e.preventDefault()
  for (const t of e.changedTouches) {
    const c = fsVideoToCanvas(t.clientX, t.clientY)
    tapping(c[0], c[1], t.identifier + 1)
  }
}

function fsTouchEnd(e) {
  e.preventDefault()
  for (const t of e.changedTouches) {
    const c = fsVideoToCanvas(t.clientX, t.clientY)
    untap(c[0], c[1], t.identifier + 1)
  }
}

function fsMouseDownFn(e) {
  if (e.button) return
  e.preventDefault()
  fsMouseDown = true
  const c = fsVideoToCanvas(e.clientX, e.clientY)
  tap(c[0], c[1], 0)
}

function fsMouseMove(e) {
  if (!fsMouseDown) return
  e.preventDefault()
  const c = fsVideoToCanvas(e.clientX, e.clientY)
  tapping(c[0], c[1], 0)
}

function fsMouseUpFn(e) {
  if (e.button || !fsMouseDown) return
  e.preventDefault()
  fsMouseDown = false
  const c = fsVideoToCanvas(e.clientX, e.clientY)
  untap(c[0], c[1], 0)
}

function drawFsIcon() {
  if (!fsCanEnter() || fsStandalone()) return
  alpha(fsFullscreenActive() ? 0.45 : 0.85)
  const l = 5
  const x0 = VW - 26, x1 = VW - 8, y0 = 5, y1 = 23
  // 4 coins "agrandir"
  line(x0, y0 + l, x0, y0, C_WHITE); line(x0, y0, x0 + l, y0, C_WHITE)
  line(x1 - l, y0, x1, y0, C_WHITE); line(x1, y0, x1, y0 + l, C_WHITE)
  line(x0, y1 - l, x0, y1, C_WHITE); line(x0, y1, x0 + l, y1, C_WHITE)
  line(x1 - l, y1, x1, y1, C_WHITE); line(x1, y1, x1, y1 - l, C_WHITE)
  alpha(1)
}

// Indicateur hors-écran : flèche + tête de slime en haut quand il vole
// au-dessus du cadre (possible depuis la suppression du plafond).
function drawOffscreen() {
  if (state !== 'playing' || !slime) return
  const kx = camW / VW, ky = camH / VH
  const vy = VH / 2 + (slime.y - camCy) / ky
  if (vy - slime.r / kx > 6) return
  const vx = clamp(VW / 2 + (slime.x - camCx) / kx, 18, VW - 18)
  alpha(0.55 + 0.45 * Math.sin(T * 10))
  shape([vx - 7, 15, vx, 5, vx + 7, 15]); fill(C_WHITE)
  circfill(vx, 21, 6, C_SLIME)
  circ(vx, 21, 6, C_BLACK)
  circfill(vx - 2, 20, 1.2, C_WHITE)
  circfill(vx + 2, 20, 1.2, C_WHITE)
  alpha(1)
  const d = Math.round(camCy - camH / 2 - slime.y)
  if (d > 12) {
    textalign('center', 'top')
    textsize(7)
    text(vx, 30, '+' + d, C_WHITE)
    textalign('start', 'top')
  }
}

// Voile bleu pendant le slow-mo (bullet time du double saut).
function drawSlowmoOverlay() {
  if (ts >= 0.995) return
  alpha(Math.min(0.28, (1 - ts) * 0.55))
  rectfill(0, 0, VW, VH, C_BLUE_HI)
  alpha(1)
}

// Shim de mesure : ?prof chronomètre draw() et l'écart entre frames (rAF).
function draw() {
  if (!diagProf) { draw_(); return }
  const now = performance.now()
  if (diagLastDraw) {
    const g = now - diagLastDraw
    diagGapMs += g
    if (g > diagGapMax) diagGapMax = g
  }
  diagLastDraw = now
  const t0 = now
  draw_()
  diagDnMs += performance.now() - t0
}

function draw_() {
  if (diagFps || diagProf) diagDrs++
  const q0 = diagProf ? performance.now() : 0
  // Effets de couleur animés (rainbow/brillant/étoilé) : ~10 fps, coût nul
  // si aucun palier animé. Le temps de jeu T les ralentit en bullet-time.
  Sprites.tickAnimated(T)
  const q05 = diagProf ? performance.now() : 0
  calcView()
  ensureVoidPattern()
  drawOuterFrame()
  const q1 = diagProf ? performance.now() : 0
  const c = ctx()
  c.setTransform(VSC, 0, 0, VSC, VOX, VOY)
  updateCam()
  c.save()
  c.beginPath()
  c.rect(0, 0, VW, VH)
  c.clip()
  drawBG()
  const q2 = diagProf ? performance.now() : 0
  if (state !== 'title') {
    const shx = VIEW.shake && shakeT > 0 ? rand(-3, 3) : 0
    const shy = VIEW.shake && shakeT > 0 ? rand(-3, 3) : 0
    // Monde : fenêtre zoomée centrée sur le slime (identité à zoom 1).
    c.save()
    c.translate(VW / 2 + shx, VH / 2 + shy)
    c.scale(camW / VW, camH / VH)
    c.translate(-camCx, -camCy)
    for (const d of decors) Sprites.drawImage(d.sprite, d.x, d.y, d.w)
    drawWalls()
    for (const p of platforms) drawPlat(p)
    for (const b of balls) if (!b.taken) drawBall(b)
    drawParticles()
    if (state === 'over') drawDeath()
    else drawSlime()
    if (aim.on) {
      if (aimPad) drawAimPad()
      if (VIEW.showTrajectory) drawTrajectory()
    }
    drawDamageWalls()
    c.restore()
    const q3 = diagProf ? performance.now() : 0
    drawOffscreen()
    drawSlowmoOverlay()
    drawFrameEdges()
    if (state === 'playing' && !runStarted) drawReadyHint()
    drawHUD()
  } else {
    // Titre : espace vue (le parallax de fond défile via camX).
    drawTitle()
  }
  if (state === 'over') drawOver()
  drawSoundIcon()
  drawFsIcon()
  drawVignette()
  c.restore()
  rect(-1, -1, VW + 2, VH + 2, C_BLACK)
  if (diagFps || diagProf) {
    const now = performance.now()
    if (diagProf) {
      const q4 = now
      diagSecAn += q05 - q0
      diagSecOf += q1 - q05; diagSecBg += q2 - q1; diagSecSc += q3 - q2; diagSecRe += q4 - q3
    }
    if (now - diagT0 >= 1000) {
      if (diagProf) {
        const avg = (total, n) => (n ? (total / n).toFixed(1) : '?')
        diagShown = diagDrs + 'f u' + avg(diagUpMs, diagUps) + ' d' + avg(diagDnMs, diagDrs) +
          ' g' + Math.round(diagGapMs / Math.max(1, diagDrs)) + '/' + Math.round(diagGapMax) +
          ' [an' + Math.round(diagSecAn / Math.max(1, diagDrs)) +
          ' of' + Math.round(diagSecOf / Math.max(1, diagDrs)) +
          ' bg' + Math.round(diagSecBg / Math.max(1, diagDrs)) +
          ' sc' + Math.round(diagSecSc / Math.max(1, diagDrs)) +
          ' r' + Math.round(diagSecRe / Math.max(1, diagDrs)) + ']' +
          ' ' + W + 'x' + H + diagSimTxt
      } else {
        diagShown = diagDrs + ' fps / ' + diagUps + ' maj' + diagSimTxt
      }
      diagDrs = 0; diagUps = 0; diagUpMs = 0; diagDnMs = 0; diagGapMs = 0; diagGapMax = 0
      diagSecAn = 0; diagSecOf = 0; diagSecBg = 0; diagSecSc = 0; diagSecRe = 0; diagT0 = now
    }
    if (diagShown) text(4, 4, diagShown, C_WHITE)
  }
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
  applyTiers()
  textsize(9)
  // Simulation 240 Hz (dt-correct : toute la physique est basée sur dt) et
  // rendu quasi à chaque rAF : supprime le judder sur écrans 120/144 Hz.
  // Garde : le stub litecanvas de tools/game_sim.mjs n'a pas cette API.
  if (typeof framerate === 'function') framerate(240)
  // ---- Instrumentation diagnostic (?sim=N, ?fps — aucun effet sinon) ----
  // ?sim=N : force la cadence de simulation (ex. ?sim=60 — test « sur écran
  //          60 Hz, la sim 240 Hz = 4 pas de physique par frame »).
  // ?fps   : compteur live en haut à gauche (images/s rendues, maj/s simulées).
  // Modèle setupTestMode : window.location dans un try (game_sim n'a pas window).
  try {
    const q = new URLSearchParams(window.location.search)
    const sim = +q.get('sim')
    if (sim >= 30 && sim <= 240 && typeof framerate === 'function') framerate(sim)
    diagSimTxt = q.has('sim') ? ' sim=' + sim : ''
    diagFps = q.has('fps')
    diagProf = q.has('prof')
    diagT0 = performance.now()
  } catch (e) {}
  try {
    best = parseInt(localStorage.getItem('slime_best') || '0', 10) || 0
  } catch (e) {}
  const st = Patterns.load()
  if (st === 'recupere') console.warn('SLIME : stockage illisible — backup restauré')
  else if (st === 'invalide' || st === 'corrompu') console.warn('SLIME : stockage illisible — réglages par défaut utilisés')
  applyLayout()
  setupTestMode()
  // T5 — modal « 1re visite » (spec §3) : lancement de play.html sans pseudo
  // posé (Player.get() null) -> on le demande tout de suite. Jamais en playtest
  // (?pattern= : le testeur n'a pas de nom à donner) ni dans le harnais Node
  // (PLAYER null, js/player.js n'y est pas chargé). Non bloquante : onDone
  // vide, la modal se ferme au clic et le jeu reste jouable dessous.
  if (!testMode && PLAYER && PLAYER.ensureModal && PLAYER.get() === null) {
    PLAYER.ensureModal({ onDone: function() {} })
  }
  Music.restore()
  Sprites.load()
  buildFramePattern()
  // L'éditeur (autre onglet) a sauvegardé : rechargement du layout en direct
  // — physique, pouvoirs, vue, murs et pool se mettent à jour sans recharger.
  // Sync LAN : un autre appareil a poussé le pool (server.mjs) -> pareil.
  try {
    window.addEventListener('storage', e => {
      if (!e || !e.key) return
      if (e.key === SlimeColors.KEY) refreshTiers()
      else if (e.key === 'slime_patterns_v1' || e.key === 'slime_patterns_v1_bak') refreshLayout()
    })
    window.addEventListener('focus', () => { refreshLayout(); refreshTiers() })
    if (Patterns.lanOnChange) Patterns.lanOnChange(refreshLayout)
  } catch (e) {}
}
