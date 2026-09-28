// SLIME — module partagé : constantes, grille et simulation physique de saut.
// Utilisé par le jeu (game.js), l'éditeur (editor.html) et les outils (tools/).
// Math pure : aucune dépendance à litecanvas. Doit être chargé en premier.

const VW = 480, VH = 270
const CELL = 32, RS = 38, ROW0 = 88, CEIL = 16, GRAV = 620
const TIP_L = 11
const VMIN = 210, VMAX = 360, AIM_MIN = 24, AIM_MAX = 140, STICKY_MUL = 0.8, SPIKE_W = 14
const BOUNCE_VY = 400, BOUNCE_VX = 140, CRUMBLE_T = 0.5, GOLD_PTS = 50

// Réglages physique mutables (onglet PHYS de l'éditeur, section `phys` du
// layout). Les constantes ci-dessus restent les valeurs par défaut.
// - slimeR : rayon de collision ET de validation du slime (sprite dessiné à
//   l'échelle 44 px pour un rayon de 18).
// - grav / vmin / vmax / fallMax / dragAir : le cœur du « snappy ».
// - aimMin / aimMax : portée de visée du saut — la puissance (vmin→vmax) suit
//   la distance du clic/touch au slime entre ces deux rayons.
// - bounceVy/bounceVx : relance automatique des plateformes orange.
// - stickyMul : puissance du saut après une plateforme collante.
// - invuln : durée d'invincibilité après un coup ; hurtRecoil : échelle des
//   reculs infligés par les piques et murs.
// - coyote : fenêtre pour sauter après avoir quitté une plateforme.
// - camBase / camMax / camRampDur : courbe de vitesse de la caméra
//   (base, plafond, durée en secondes pour atteindre le plafond — 540 s = 9 min,
//   soit 3 BGM de 3 min). Les paliers sont un détail interne : pas fixe de
//   CAM_PALIER_S s (game.js), taille du pas déduite de camRampDur).
//   Base ×2 (80/240) : nouvelle base officielle — l'ancienne (40/120) stockée
//   dans d'anciens saves est migrée automatiquement dans normPhys().
const PHYS_DEF = {
  slimeR: 14,
  grav: GRAV, vmin: VMIN, vmax: VMAX, aimMin: AIM_MIN, aimMax: AIM_MAX,
  fallMax: 520, dragAir: 0.6,
  bounceVy: BOUNCE_VY, bounceVx: BOUNCE_VX, stickyMul: STICKY_MUL,
  invuln: 1.3, hurtRecoil: 1,
  coyote: 0.08,
  camBase: 80, camMax: 240, camRampDur: 540
}

// Borne une valeur numérique ; hors bornes ou non numérique -> défaut.
function physBound(v, def, lo, hi) {
  v = +v
  return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def
}

function normPhys(n) {
  const d = PHYS_DEF
  n = n && typeof n === 'object' ? n : {}
  // Bornes = union des anciennes bornes et des plages de sliders de l'éditeur
  // (chaque défaut est le milieu exact de son slider, onglet PHYS).
  const out = {
    slimeR: physBound(n.slimeR, d.slimeR, 8, 19),
    grav: physBound(n.grav, d.grav, 270, 1000),
    vmin: physBound(n.vmin, d.vmin, 60, 400),
    vmax: physBound(n.vmax, d.vmax, 160, 600),
    aimMin: physBound(n.aimMin, d.aimMin, 0, 60),
    aimMax: physBound(n.aimMax, d.aimMax, 50, 240),
    fallMax: physBound(n.fallMax, d.fallMax, 220, 900),
    dragAir: physBound(n.dragAir, d.dragAir, 0.2, 1),
    bounceVy: physBound(n.bounceVy, d.bounceVy, 200, 650),
    bounceVx: physBound(n.bounceVx, d.bounceVx, 20, 300),
    stickyMul: physBound(n.stickyMul, d.stickyMul, 0.4, 1.1),
    invuln: physBound(n.invuln, d.invuln, 0.3, 3),
    hurtRecoil: physBound(n.hurtRecoil, d.hurtRecoil, 0.25, 2),
    coyote: physBound(n.coyote, d.coyote, 0, 0.25),
    // Caméra : bornes élargies pour couvrir la nouvelle base ×2 (80/240)
    // avec de la marge dans les deux sens. camRampDur : 1 à 17 min,
    // défaut 540 s = milieu exact du slider de l'éditeur.
    camBase: physBound(n.camBase, d.camBase, 20, 200),
    camMax: physBound(n.camMax, d.camMax, 60, 400),
    camRampDur: physBound(n.camRampDur, d.camRampDur, 60, 1020)
  }
  // Migration : l'ancienne base (40/120) stockée dans des saves antérieurs
  // au passage à la base ×2 est considérée non personnalisée -> nouvelle base.
  // L'ancien réglage camRampT (intervalle entre paliers) est abandonné sans
  // migration : sémantique incompatible avec la durée jusqu'au max.
  if (out.camBase === 40) out.camBase = d.camBase
  if (out.camMax === 120) out.camMax = d.camMax
  // Garde-fou : la puissance max doit rester discriminante face au min.
  if (out.vmax < out.vmin + 50) out.vmax = Math.min(600, out.vmin + 50)
  // Garde-fou : la portée max de visée doit dépasser la portée min.
  if (out.aimMax < out.aimMin + 20) out.aimMax = Math.min(240, out.aimMin + 20)
  return out
}

function rowY(r) { return ROW0 + r * RS }

const Phys = (() => {
  // Murs de damage paramétrables (édités dans l'onglet VUE, appliqués au jeu).
  // (renommé wallsCfg pour libérer le nom `walls` = murs verticaux des patterns)
  // Pas de plafond : le haut du monde est ouvert (grands sauts autorisés).
  let wallsCfg = { left: TIP_L, right: SPIKE_W }

  function setWalls(next) {
    if (!next) return
    wallsCfg = {
      left: Math.max(4, Math.min(60, +next.left || TIP_L)),
      right: Math.max(4, Math.min(60, +next.right || SPIKE_W))
    }
  }

  function getWalls() { return wallsCfg }

  // Physique courante (défauts tant que setPhys n'est pas appelé).
  let physCfg = normPhys(null)

  function setPhys(next) { physCfg = normPhys(next) }
  function getPhys() { return physCfg }

  // Prédicat d'impact d'un pas de simulation (60 Hz) : 'land' (atterrissage),
  // 'ledge' (accroche de bord), 'wall' (mur percé), 'oob' (tombé sous l'écran)
  // ou false (rien).
  // - Atterrissage : traversée du plan de la plateforme entre l'image
  //   précédente et l'image courante (même test que le jeu, insensible aux
  //   grandes vitesses de chute).
  // - Accroche (ledge catch) : même fenêtre que tryLedgeCatch (game.js) — en
  //   descente, bas du slime franchissant le bord de la plateforme de quelques
  //   pixels (opts.ledge = fenêtre en px) ; les éphémères (ghost) ne sont pas
  //   rattrapables (opts.catchable).
  // `walls` : murs verticaux optionnels [{ x, y1, y2, w, spiked }] — la
  // trajectoire qui les traverse est invalidée (le sommet, lui, reste
  // atteignable : l'atterrissage est testé avant l'obstacle).
  function stepHit(x, y, py, vy, target, walls, opts, r) {
    if (vy >= 0 && x > target.x - 3 && x < target.x + target.w + 3 && py + r <= target.y + 8 && y + r >= target.y) return 'land'
    if (walls) {
      for (let j = 0; j < walls.length; j++) {
        const wl = walls[j]
        const m = wl.spiked ? 4 : 0
        if (x + r + m > wl.x && x - r - m < wl.x + wl.w && y + r > wl.y1 + 2 && y - r < wl.y2 - 2) return 'wall'
      }
    }
    const win = opts && opts.ledge
    if (win && opts.catchable !== false && vy >= 0 && py + r <= target.y + 6 && y + r >= target.y && y + r <= target.y + 12) {
      if (x >= target.x - 6 - win && x < target.x - 6) return 'ledge'
      if (x <= target.x + target.w + 6 + win && x > target.x + target.w + 6) return 'ledge'
    }
    if (y > VH + 60) return 'oob'
    return false
  }

  // Simulation pas-à-pas (60 Hz, 4 s) : le slime lancé depuis (sx, sy) avec la
  // vélocité (vx, vy) retombe-t-il sur la plateforme target ?
  // `opts` : { ledge, catchable } — accroche de bord autorisée (voir stepHit).
  function simLandV(sx, sy, vx, vy, target, walls, opts) {
    const P = physCfg
    let x = sx, y = sy
    const dt = 1 / 60, r = P.slimeR
    for (let i = 0; i < 240; i++) {
      const py = y
      vy += P.grav * dt
      x += vx * dt
      y += vy * dt
      if (y < -4000) return false // garde-fou (le haut du monde est ouvert)
      const hit = stepHit(x, y, py, vy, target, walls, opts, r)
      if (hit === 'land' || hit === 'ledge') return true
      if (hit === 'wall' || hit === 'oob') return false
    }
    return false
  }

  // Le saut de la plateforme a vers la plateforme b est-il réalisable ?
  // Essaie 14 combinaisons angle/puissance (même logique que le générateur d'origine).
  function canReach(a, target, mul, dirX, walls, opts) {
    dirX = dirX || 1
    const sx = dirX > 0 ? a.x + a.w - 10 : a.x + 10
    const sy = a.y - 12
    for (const p of [1, 0.85]) {
      for (let k = 0; k < 7; k++) {
        const base = 0.5 + k * 0.13
        const ang = dirX > 0 ? -base : -(Math.PI - base)
        const v = physCfg.vmax * p * (mul || 1)
        if (simLandV(sx, sy, Math.cos(ang) * v, Math.sin(ang) * v, target, walls, opts)) return true
      }
    }
    return false
  }

  // Simule un 1er saut (jambe 1, déjà lancée) et tente le 2e saut (double saut)
  // dès l'approche de l'apex : à chaque pas pair où vy >= -60, on re-tire les
  // 14 combinaisons angle/puissance à vmax × dj.powerMul (la visée en vol est
  // libre à 360° : angles vers l'avant ET vers l'arrière testés).
  // `opts.ledge` s'applique aux deux jambes : le combo double saut + rattrape
  // de bord est donc couvert.
  function doubleFrom(sx, sy, vx, vy, target, walls, dj, opts) {
    const P = physCfg
    let x = sx, y = sy
    const dt = 1 / 60, r = P.slimeR
    const pm = dj && dj.powerMul ? dj.powerMul : 1
    for (let i = 0; i < 240; i++) {
      const py = y
      vy += P.grav * dt
      x += vx * dt
      y += vy * dt
      if (y < -4000) return false // garde-fou (le haut du monde est ouvert)
      const hit = stepHit(x, y, py, vy, target, walls, opts, r)
      if (hit === 'land' || hit === 'ledge') return true
      if (hit === 'wall' || hit === 'oob') return false
      if (vy >= -60 && i >= 3 && (i & 1) === 0) {
        for (const p of [1, 0.85]) {
          for (let k = 0; k < 7; k++) {
            const base = 0.5 + k * 0.13
            const v2 = physCfg.vmax * p * pm
            if (simLandV(x, y, Math.cos(-base) * v2, Math.sin(-base) * v2, target, walls, opts)) return true
            if (simLandV(x, y, Math.cos(-(Math.PI - base)) * v2, Math.sin(-(Math.PI - base)) * v2, target, walls, opts)) return true
          }
        }
      }
    }
    return false
  }

  // Le saut a -> b est-il réalisable avec un double saut (2e impulsion en vol) ?
  // 1ère jambe : mêmes candidats que canReach (le mul sticky s'applique) ;
  // puissance du 2e saut × dj.powerMul.
  function canReachDouble(a, target, mul, dirX, walls, dj, opts) {
    dirX = dirX || 1
    const sx = dirX > 0 ? a.x + a.w - 10 : a.x + 10
    const sy = a.y - 12
    for (const p of [1, 0.85]) {
      for (let k = 0; k < 7; k++) {
        const base = 0.5 + k * 0.13
        const ang = dirX > 0 ? -base : -(Math.PI - base)
        const v = physCfg.vmax * p * (mul || 1)
        if (doubleFrom(sx, sy, Math.cos(ang) * v, Math.sin(ang) * v, target, walls, dj, opts)) return true
      }
    }
    return false
  }

  // Rebond automatique d'une plateforme orange : trajectoire fixe.
  function canReachBounce(a, target, walls, opts) {
    return simLandV(a.x + a.w - 10, a.y - 12, physCfg.bounceVx, -physCfg.bounceVy, target, walls, opts)
  }

  // Rebond + correction éventuelle en plein arc par un double saut (si `dj`).
  function canReachBounceExt(a, target, walls, dj, opts) {
    if (!dj) return canReachBounce(a, target, walls, opts)
    return doubleFrom(a.x + a.w - 10, a.y - 12, physCfg.bounceVx, -physCfg.bounceVy, target, walls, dj, opts)
  }

  // Puissance du saut « visée » : la distance du clic/touch au slime, bornée
  // entre aimMin (-> vmin) et aimMax (-> vmax), donne la vitesse de départ.
  function aimVel(d) {
    const P = physCfg
    const t = Math.max(0, Math.min(1, (d - P.aimMin) / Math.max(1, P.aimMax - P.aimMin)))
    return P.vmin + (P.vmax - P.vmin) * t
  }

  // Ratio 0..1 de la puissance visée (pour l'affichage : jauge, écrasement).
  function aimRatio(d) {
    const P = physCfg
    return Math.max(0, Math.min(1, (d - P.aimMin) / Math.max(1, P.aimMax - P.aimMin)))
  }

  return { setWalls, walls: getWalls, setPhys, phys: getPhys, normalize: normPhys, simLandV, canReach, canReachDouble, canReachBounce, canReachBounceExt, aimVel, aimRatio }
})()
