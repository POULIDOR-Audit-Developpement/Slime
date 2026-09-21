// SLIME — module partagé : constantes, grille et simulation physique de saut.
// Utilisé par le jeu (game.js), l'éditeur (editor.html) et les outils (tools/).
// Math pure : aucune dépendance à litecanvas. Doit être chargé en premier.

const VW = 480, VH = 270
const CELL = 32, RS = 38, ROW0 = 88, CEIL = 16, GRAV = 620
const TIP_T = CEIL + 12, TIP_L = 11
const VMIN = 210, VMAX = 360, CHARGE_T = 0.55, STICKY_MUL = 0.8, SPIKE_W = 14
const BOUNCE_VY = 400, BOUNCE_VX = 140, CRUMBLE_T = 0.5, GOLD_PTS = 50

function rowY(r) { return ROW0 + r * RS }

const Phys = (() => {
  // Murs de damage paramétrables (édités dans l'onglet VUE, appliqués au jeu).
  // (renommé wallsCfg pour libérer le nom `walls` = murs verticaux des patterns)
  let wallsCfg = { ceil: TIP_T, left: TIP_L, right: SPIKE_W }

  function setWalls(next) {
    if (!next) return
    wallsCfg = {
      ceil: Math.max(8, Math.min(90, +next.ceil || TIP_T)),
      left: Math.max(4, Math.min(60, +next.left || TIP_L)),
      right: Math.max(4, Math.min(60, +next.right || SPIKE_W))
    }
  }

  function getWalls() { return wallsCfg }

  // Simulation pas-à-pas (60 Hz, 4 s) : le slime lancé depuis (sx, sy) avec la
  // vélocité (vx, vy) retombe-t-il sur la plateforme target ?
  // `walls` : murs verticaux optionnels [{ x, y1, y2, w, spiked }] — la
  // trajectoire qui les traverse est invalidée (le sommet, lui, reste
  // atteignable : l'atterrissage est testé avant l'obstacle).
  function simLandV(sx, sy, vx, vy, target, walls) {
    let x = sx, y = sy
    const dt = 1 / 60, r = 13
    for (let i = 0; i < 240; i++) {
      vy += GRAV * dt
      x += vx * dt
      y += vy * dt
      if (y - r < wallsCfg.ceil) { y = wallsCfg.ceil + r; if (vy < 0) vy = 0 }
      if (vy >= 0 && x > target.x - 3 && x < target.x + target.w + 3 && y + r >= target.y && y + r <= target.y + 16) return true
      if (walls) {
        for (let j = 0; j < walls.length; j++) {
          const wl = walls[j]
          const m = wl.spiked ? 4 : 0
          if (x + r + m > wl.x && x - r - m < wl.x + wl.w && y + r > wl.y1 + 2 && y - r < wl.y2 - 2) return false
        }
      }
      if (y > VH + 60) return false
    }
    return false
  }

  // Le saut de la plateforme a vers la plateforme b est-il réalisable ?
  // Essaie 14 combinaisons angle/puissance (même logique que le générateur d'origine).
  function canReach(a, target, mul, dirX, walls) {
    dirX = dirX || 1
    const sx = dirX > 0 ? a.x + a.w - 10 : a.x + 10
    const sy = a.y - 12
    for (const p of [1, 0.85]) {
      for (let k = 0; k < 7; k++) {
        const base = 0.5 + k * 0.13
        const ang = dirX > 0 ? -base : -(Math.PI - base)
        const v = VMAX * p * (mul || 1)
        if (simLandV(sx, sy, Math.cos(ang) * v, Math.sin(ang) * v, target, walls)) return true
      }
    }
    return false
  }

  // Rebond automatique d'une plateforme orange : trajectoire fixe.
  function canReachBounce(a, target, walls) {
    return simLandV(a.x + a.w - 10, a.y - 12, BOUNCE_VX, -BOUNCE_VY, target, walls)
  }

  return { setWalls, walls: getWalls, simLandV, canReach, canReachBounce }
})()
