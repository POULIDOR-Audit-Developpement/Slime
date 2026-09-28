# Plateformes fun — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework des 6 types de plateformes (moins punitifs, plus de feedback) + 3 nouveaux types (Turbo, Dorée, Bascule) + remplacement de l'Éphémère par la Phasante.

**Architecture:** Constantes et helpers partagés dans `js/physics.js` (module pur), mapping de validation dans `js/patterns.js`, mécaniques runtime dans `js/game.js` (fonctions `land`, `execJump`, `updSlime`, `drawPlat`), sprites statiques nouveaux, éditeur et génération mis à jour. Aucun ajout à `VARIANT_BASES` (perf mobile, cf. AGENTS.md).

**Tech Stack:** JS vanilla (litecanvas), tests Node (`tools/*.mjs`, harness stub litecanvas), sprites PNG générés par script Python/PIL.

**Spec:** `docs/superpowers/specs/2026-09-29-plateformes-fun-design.md` (les valeurs exactes ci-dessous viennent de la spec ; en cas de doute, la spec fait foi).

## Global Constraints

- Perf : NE JAMAIS régénérer des canvas en masse par frame ; aucun ajout à `VARIANT_BASES` ; rien de lourd par frame (< 10 ms draw).
- Tout `js/*.js` modifié → bump `?v=` dans `play.html` ET `editor.html` (cache-busting).
- Valeurs exactes : `STICKY_MUL 1.15`, `CRUMBLE_T 0.8`, `PHASE_CYCLE 2.0`, `PHASE_SOLID 0.6`, `RHYTHM_MUL 1.15`, `TURBO_MUL 1.5`, `TURBO_MIN 180`, `GOLD_AIRJUMP_T 10`, `BASCULE_VX 200`, `BASCULE_VY_MUL 0.9`, `COMBO_STEP 1.12`, `COMBO_MAX 1.5`.
- Types : `['basic','sticky','dynamic','crumble','phase','bouncy','turbo','gold','seesaw']` ; alias compat `'ghost'` → `'phase'`.
- Timer des dynamiques (`dynLife`/`timerSet`/`p.timer`) : SUPPRIMÉ du runtime ; les champs hérités des anciens saves/layouts sont tolérés mais ignorés.
- Le sommet incliné de la bascule est purement visuel : collision plate one-way inchangée.
- Tests Node verts avant chaque commit : au minimum le test de la tâche + régression touchée.

## Review Focus

1. **Plateforme `phase` sans `phase0`** (vieux patterns/saves) : `phaseSolid` avec `phase0` indéfini donnerait NaN → plateforme jamais solide. Attendu : `instantiate` pose toujours `phase0` (défaut 0) → solide au début du cycle. Test dans Task 2 (alias/normalize).
2. **`stickyMul` 1.15 écrasé par la borne** `physBound(…, 0.4, 1.1)` de `normPhys` → silencieusement ramené à 1.1. Attendu : borne haute 1.5, défaut conservé. Test Task 1.
3. **Anciens layouts avec `plat.dynLife`** : ne doivent ni crasher ni avoir d'effet (champ ignoré par le jeu). Test Task 3 (sim 6 s sur une dynamique → plateforme vivante).
4. **Bascule + double saut** : le lancement de bascule ne doit s'appliquer qu'au départ du sol (`groundPlat`), jamais consommer une charge aérienne ni interrompre une visée en l'air. Test Task 6.
5. **Chaîne de rebonds** : toucher n'importe quel sol non-rebond remet le combo à zéro. Test Task 3.
6. **Exports/imports contenant `'ghost'`** : chargés sans erreur, joués en phasante. Test Task 2.

---

### Task 1: `js/physics.js` — constantes, bornes, `phaseSolid`, rebond paramétrable

**Files:**
- Modify: `js/physics.js:8-9` (constantes), `js/physics.js:61` (borne stickyMul), `js/physics.js:230-232` (`canReachBounce`), section API `js/physics.js:254`
- Create: `tools/platforms_test.mjs`

**Interfaces:**
- Produces (usé par Toutes les tâches suivantes) : constantes globales listées dans Global Constraints ; `Phys.phaseSolid(p, t)` (p.phase0 ∈ [0,1), t en secondes → bool) ; `Phys.canReachBounce(a, target, walls, opts, vx, vy)` — `vx`/`vy` optionnels, défauts `physCfg.bounceVx` / `-physCfg.bounceVy`.

- [ ] **Step 1: Write the failing test** — créer `tools/platforms_test.mjs` sur le modèle du harness de `tools/game_sim.mjs` (concatène `js/physics.js`, `js/patterns-defaults.js`, `js/patterns.js` via `new Function(src + '\nreturn {...}')`) avec ces checks :

```js
// constantes
check('STICKY_MUL 1.15', STICKY_MUL === 1.15)
check('CRUMBLE_T 0.8', CRUMBLE_T === 0.8)
check('PHASE_CYCLE 2.0', PHASE_CYCLE === 2.0)
check('PHASE_SOLID 0.6', PHASE_SOLID === 0.6)
check('TURBO_MUL 1.5', TURBO_MUL === 1.5)
check('TURBO_MIN 180', TURBO_MIN === 180)
check('GOLD_AIRJUMP_T 10', GOLD_AIRJUMP_T === 10)
check('BASCULE_VX 200', BASCULE_VX === 200)
check('BASCULE_VY_MUL 0.9', BASCULE_VY_MUL === 0.9)
check('COMBO_STEP 1.12', COMBO_STEP === 1.12)
check('COMBO_MAX 1.5', COMBO_MAX === 1.5)
check('RHYTHM_MUL 1.15', RHYTHM_MUL === 1.15)
// phaseSolid : cycle
check('phase solide en début de cycle', Phys.phaseSolid({ phase0: 0 }, 0) === true)
check('phase solide à 1.0 s', Phys.phaseSolid({ phase0: 0 }, 1.0) === true)
check('phase traversable à 1.4 s', Phys.phaseSolid({ phase0: 0 }, 1.4) === false)
check('phase boucle sur 2 cycles', Phys.phaseSolid({ phase0: 0.5 }, 1.2) === true)
check('phaseSolid tolère phase0 absent', Phys.phaseSolid({}, 0) === true)
// normPhys : le défaut stickyMul ne doit pas être écrasé par la borne
const np = Phys.normalize(null)
check('normPhys garde stickyMul 1.15', np.stickyMul === 1.15)
// canReachBounce : surcharges vx/vy
check('canReachBounce signature vx/vy', Phys.canReachBounce.length >= 4 || Phys.canReachBounce.length <= 6)
```

- [ ] **Step 2: Run test to verify it fails** — `node tools/platforms_test.mjs` → FAIL (constantes absentes / 0.8 / 0.5, `Phys.phaseSolid` n'existe pas).
- [ ] **Step 3: Implement** — dans `js/physics.js` : ligne 8 `STICKY_MUL = 0.8` → `1.15` ; ligne 9 `CRUMBLE_T = 0.5` → `0.8` + ajouter les 10 nouvelles constantes (Global Constraints) ; `normPhys` ligne 61 : borne `stickyMul` → `physBound(n.stickyMul, d.stickyMul, 0.4, 1.5)` ; `canReachBounce(a, target, walls, opts, vx, vy)` : `return simLandV(a.x + a.w - 10, a.y - 12, vx != null ? vx : physCfg.bounceVx, vy != null ? vy : -physCfg.bounceVy, target, walls, opts)` ; ajouter :

```js
// Plateforme phasante : solide pendant PHASE_SOLID du cycle PHASE_CYCLE.
// phase0 ∈ [0,1) décale le cycle par plateforme (défaut 0).
function phaseSolid(p, t) {
  const u = (((t / PHASE_CYCLE) + (p && p.phase0 ? p.phase0 : 0)) % 1 + 1) % 1
  return u < PHASE_SOLID
}
```
et l'exporter dans le `return` final (ligne 254).
- [ ] **Step 4: Run test to verify it passes** — `node tools/platforms_test.mjs` → PASS ; `node tools/smoke_test.mjs` → PASS (régression).
- [ ] **Step 5: Commit** — `git add js/physics.js tools/platforms_test.mjs && git commit -m "feat(platforms): constantes fun + phaseSolid + canReachBounce paramétrable"`

### Task 2: `js/patterns.js` — types, alias `ghost` → `phase`, mapping validation

**Files:**
- Modify: `js/patterns.js:10` (TYPES), `js/patterns.js:14` (DEFAULT_PLAT), `js/patterns.js:104-136` (`validatePattern`), `js/patterns.js:153-203` (`instantiate`), `js/patterns.js:231-263` (`jumpOk`)

**Interfaces:**
- Consumes: constantes Task 1 (`BASCULE_VX`, `BASCULE_VY_MUL`, `BOUNCE_VY`), `Phys.canReachBounce(..., vx, vy)`, `Phys.phaseSolid`.
- Produces: `Patterns.TYPES` (9 types) ; `instantiate` normalise `type: q.type === 'ghost' ? 'phase' : q.type` et pose `phase0: q.type === 'phase' || q.type === 'ghost' ? Math.random() : 0` (toujours défini, cf. Review Focus 1) ; `jumpOk` traite `seesaw` comme source famille rebond.

- [ ] **Step 1: Write the failing test** (dans `tools/platforms_test.mjs`) :

```js
// alias ghost -> phase
const patGhost = { id: 't-alias', name: 'alias', difficulty: 1, entry: { row: 2 },
  platforms: [{ x: 3 * CELL, row: 2, cells: 3, type: 'ghost', yOff: 0, amp: 0, spd: 0, spike: null }], balls: [], decor: [] }
check('validatePattern accepte ghost (alias)', Patterns.validatePattern(patGhost).length === 0)
const anchor = { x: 0, row: 2, y: rowY(2), w: 4 * CELL, type: 'basic' }
const instG = Patterns.instantiate(patGhost, anchor)
check('instantiate normalise ghost -> phase', instG.platforms[0].type === 'phase')
check('phase0 toujours défini', typeof instG.platforms[0].phase0 === 'number')
// seesaw validé comme famille rebond
const patSeesaw = { id: 't-seesaw', name: 'seesaw', difficulty: 3, entry: { row: 2 },
  platforms: [{ x: 3 * CELL, row: 2, cells: 3, type: 'seesaw', yOff: 0, amp: 0, spd: 0, spike: null }], balls: [], decor: [] }
check('validatePattern accepte seesaw', Patterns.validatePattern(patSeesaw).length === 0)
const instS = Patterns.instantiate(patSeesaw, anchor)
const r = Patterns.jumpOk(instG.platforms[0], instS.platforms[0], [], { dj: 0 })
check('jumpOk depuis phase vers seesaw (source famille basique)', r.ok)
check('TYPES a 9 types', Patterns.TYPES.length === 9 && Patterns.TYPES.indexOf('turbo') >= 0 && Patterns.TYPES.indexOf('gold') >= 0 && Patterns.TYPES.indexOf('seesaw') >= 0)
```

- [ ] **Step 2: Run** — `node tools/platforms_test.mjs` → FAIL (type invalide, TYPES à 6).
- [ ] **Step 3: Implement** — `TYPES` ligne 10 → les 9 types (Global Constraints) ; `DEFAULT_PLAT` ligne 14 → `{ crumbleT: CRUMBLE_T, spdMul: 1 }` (dynLife retiré ; `normalizeLayout` ligne 47 laissé tel quel : le champ hérité est normalisé mais ignoré par le jeu) ; dans `instantiate` : `type: q.type === 'ghost' ? 'phase' : q.type` dans l'objet inst, et `phase0: (q.type === 'ghost' || q.type === 'phase') ? Math.random() : 0` ; dans `jumpOk` : `if (a.type === 'bouncy' || a.type === 'seesaw')` — pour `seesaw`, appeler `Phys.canReachBounce(a, tgt, walls, opts, BASCULE_VX, -BOUNCE_VY * BASCULE_VY_MUL)` (les deux branches bounce+bounce+dj). Ligne `catchable: b.type !== 'ghost'` : la laisser telle quelle (mort après normalisation) OU la simplifier — au choix de l'implémenteur, aucun test ne la pinne.
- [ ] **Step 4: Run** — `node tools/platforms_test.mjs` PASS ; `node tools/smoke_test.mjs` PASS.
- [ ] **Step 5: Commit** — `git add js/patterns.js tools/platforms_test.mjs && git commit -m "feat(platforms): 9 types, alias ghost->phase, seesaw validé comme rebond"`

### Task 3: `js/game.js` — rework des types existants + juice universel

**Files:**
- Modify: `js/game.js:54` (PLAT), `js/game.js:90` (layout read), `js/game.js:213+` (SFX constants), `js/game.js:370` (slime init), `js/game.js:460-495` (`execJump`), `js/game.js:497-522` (`land`), `js/game.js:547-565` (`catchLedge`), `js/game.js:619-635` (posé au sol), `js/game.js:647-657` (collision), `js/game.js:794-809` (boucle update plateformes)

**Interfaces:**
- Consumes: Task 1 constantes.
- Produces: champs slime `bounceCombo`, `goldT`, `turboT` (init Task 3, usés Tasks 5-6) ; `p.crackWarn` (bool, télégraphe cassable) ; `SFX_CRACK`, `SFX_WHOOSH`, `SFX_GOLD`, `SFX_TIC` (constantes zzfx) ; absence totale de `p.timerSet`/`p.timer`/`dynLife` côté runtime.

- [ ] **Step 1: Write the failing test** (harness : ajouter `js/game.js` à la concaténation comme `game_sim.mjs`, stubs identiques ; exposer depuis la Function : `{ land, execJump, updSlime, slime, platforms, PH, gameT }` — cf. driver de `game_sim.mjs`) :

```js
// bouncy : combo croissant, cap, reset
plateformeBouncyTest() // helper : pose le slime sur une bouncy, appelle land(p)
// 1er land : vy === -400 ; 2e land consécutif : vy === -448 ; 5e : -400*1.12^4 ; 10e : -600 (cap 1.5)
// land sur basic → slime.bounceCombo === 0
// sticky : land(stickyPlat) → slime.jumpMul === 1.15
// crumble : land(crumblePlat) → p.crackT défini ; avancer la boucle update 0.4 s → p.crackWarn === true ; 0.8 s → p.dead === true
// dynamic : land(dynamicPlat) puis avancer update 6 s → p.dead === false (plus de timer)
// execJump sur dynamic montante → vy plus fort que sur basic (×1.15) ; sur dynamic descendante → ×1
// walk-off ghost : N/A (plus de branche ghost)
```

- [ ] **Step 2: Run** — `node tools/platforms_test.mjs` → FAIL.
- [ ] **Step 3: Implement** —
  - `PLAT` ligne 54 : retirer `dynLife` ; ligne 90 : retirer la lecture `dynLife`.
  - `land(p)` : bloc `p.type === 'dynamic' && !p.timerSet` (517-520) supprimé ; bouncy : `slime.bounceCombo = (slime.bounceCombo || 0) + 1` ; `slime.vy = -P.bounceVy * Math.min(COMBO_MAX, Math.pow(COMBO_STEP, slime.bounceCombo - 1))` (remplace ligne 504 ; 505 inchangé) ; pour tout type non-bouncy : `slime.bounceCombo = 0` (avant le bloc bouncy) ; SFX par type : `sfx(SFX_LAND, pitch, 0.2)` avec pitch = 0 basic, 1 sticky, -1 dynamic, 2 crumble, 3 phase, 4 turbo, 5 gold, -2 bouncy (déjà -2/0.7).
  - `execJump()` : bloc ghost (473-476) supprimé ; après calcul de `mul` : `const gp = slime.groundPlat` (déjà 472) → si `gp && gp.type === 'dynamic' && gp.amp > 0 && Math.cos(gameT * gp.spd * PLAT.spdMul + gp.ph) > 0` alors `mul *= RHYTHM_MUL` + `burst(slime.x, slime.y - 10, C_BLUE_L, 8, 120)` (boost rythme : plateforme montante = saut amplifié). NOTE : `mul` est `const` ligne 462 → passer en `let`.
  - `catchLedge()` : bloc ghost (548-552) supprimé ; bloc dynamic timer (554-557) supprimé.
  - `updSlime()` posé au sol (619-635) : branche ghost walk-off (622-625) supprimée ; friction : `const fr = p.type === 'sticky' ? 0.0001 : 0.002` → `slime.vx *= Math.pow(fr, dt)` (ligne 630).
  - Collision (647-654) : capturer `const impactVy = slime.vy` avant `land(p)` ; après `land(p)` : juice universel — `if (impactVy > 600 && VIEW.shake !== false) shakeT = 0.08` ; `burst(slime.x, slime.y + slime.r, C_WHITE, 4, 60)` (poussière, hors bouncy qui a déjà son squash/SFX).
  - Boucle update plateformes (794-809) : bloc `if (p.timerSet)` (803-809) supprimé ; cassable télégraphée : `if (p.crackT > 0 && !p.crackWarn && p.crackT <= CRUMBLE_T / 2) { p.crackWarn = true; sfx(SFX_CRACK, 0, 0.5) }` (avant le décompte existant).
  - `slime = {` (370) : ajouter `bounceCombo: 0, goldT: 0, turboT: 0`.
  - SFX zzfx (près de ligne 213) : `SFX_CRACK`, `SFX_WHOOSH`, `SFX_GOLD`, `SFX_TIC` — style `SFX_LAND`, hauteurs/durées distinctes (valeur libre, noms exacts requis).
- [ ] **Step 4: Run** — `node tools/platforms_test.mjs` PASS ; `node tools/game_sim.mjs` PASS (sim complète).
- [ ] **Step 5: Commit** — `git add js/game.js tools/platforms_test.mjs && git commit -m "feat(platforms): rework sticky/crumble/dynamic/bouncy + juice universel, fin du timer dynamique"`

### Task 4: `js/game.js` — Phasante (collision cyclique)

**Files:**
- Modify: `js/game.js:619-635` (posé au sol), `js/game.js:647-657` (collision + `tryLedgeCatch` 531-545), `js/game.js:1151-1244` (`drawPlat` — branche alpha seulement, le sprite reste `tileGhost`)

**Interfaces:**
- Consumes: `Phys.phaseSolid(p, gameT)` (Task 1), `p.phase0` (Task 2).
- Produces: convention « phase traversable = exclue des collisions » réutilisée par le rendu (alpha).

- [ ] **Step 1: Write the failing test** :

```js
// plateforme phase phase0=0 : solide à t=0.2 → land ok ; à t=1.4 le slime posé dessus tombe
// pose à t=0.2 sur phase → grounded true ; avancer update jusqu'à t=1.4 → grounded false (chute, pas de killPlat, p.dead false)
// collision : slime en chute au-dessus d'une phase traversable (t=1.4) → PAS de land ; même position t=0.2 → land
// tryLedgeCatch ignore la phase traversable
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** — helper local `const solide = p => p.type !== 'phase' || Phys.phaseSolid(p, gameT)` ; dans la boucle de collision (648) : `if (p.dead || !solide(p)) continue` ; dans le posé au sol (621) : ajouter `|| !solide(p)` à la condition de décrochage (le slime tombe, sans `killPlat`) ; dans `tryLedgeCatch` (534) : `if (p.dead || !solide(p)) continue` ; `drawPlat` : remplacer l'alpha pulse ghost (1157 et 1203) par `alpha(solide(p) ? 0.9 : 0.25)` pour `p.type === 'phase'` (les branches `ghost` restantes deviennent `phase`).
- [ ] **Step 4: Run** — `node tools/platforms_test.mjs` PASS ; `node tools/game_sim.mjs` PASS.
- [ ] **Step 5: Commit** — `git add js/game.js tools/platforms_test.mjs && git commit -m "feat(platforms): phasante remplace l'éphémère (cycle solide/traversable)"`

### Task 5: `js/game.js` — Turbo et Dorée

**Files:**
- Modify: `js/game.js` (`execJump` 460-495, `land` 497-522, `updSlime` 610-706, `drawSlime`/overlay + `drawPlat` overlays)

**Interfaces:**
- Consumes: Task 1 constantes ; `slime.goldT`/`slime.turboT` (Task 3).
- Produces: rien d'exporté ; conventions de dessin (lignes de vitesse, teinte dorée) pour Task 7.

- [ ] **Step 1: Write the failing test** :

```js
// turbo : slime sur turbo, vx=300, execJump → vx === 450 ; vx=100 → 180 (min) ; vx=500 → 540 (cap vmax*1.5)
// turbo marcher hors du bord (vx≈0, face à droite) → vx >= 180 (lancement) + slime.turboT > 0
// gold : land(goldPlat) → slime.airJumps === charges+1, slime.goldT === 10 ; saut aérien consommé, land sur basic pendant goldT → airJumps recharge à charges+1 ; avancer 10 s → goldT 0 puis land basic → airJumps === charges
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** —
  - `execJump()` après `slime.vx/vy = ...` (464-465) : `if (slime.groundPlat && slime.groundPlat.type === 'turbo') { const d = slime.vx >= 0 ? 1 : -1; slime.vx = d * Math.max(TURBO_MIN, Math.min(Math.abs(slime.vx) * TURBO_MUL, Phys.phys().vmax * TURBO_MUL)); slime.turboT = 0.6; sfx(SFX_WHOOSH) }` — et consommer `gp` AVANT que `groundPlat` soit annulé (485) : garder une ref locale.
  - Walk-off (621-628) : si la plateforme quittée est `turbo` → même formule avec `d = slime.face` (lancement même à vx=0) + `slime.turboT = 0.6`.
  - `land(p)` : `p.type === 'gold'` → `slime.goldT = GOLD_AIRJUMP_T; burst(p.x + p.w/2, p.y - 8, C_GOLD_L, 14, 160); sfx(SFX_GOLD)` ; ligne 500 : `slime.airJumps = POWERS.doubleJump.charges + (slime.goldT > 0 ? 1 : 0)`.
  - `updSlime` : `if (slime.goldT > 0) { slime.goldT -= dt; if (slime.goldT <= 0) { slime.goldT = 0; slime.airJumps = Math.min(slime.airJumps, POWERS.doubleJump.charges) } }` ; traînée : `if (slime.goldT > 0 && Math.random() < dt * 8) burst(slime.x, slime.y, C_GOLD_L, 1, 30)` ; `if (slime.turboT > 0) slime.turboT -= dt`.
  - Couleurs : ajouter au tableau `COLORS` + constantes `C_TURBO_TOP/SIDE`, `C_GOLD_TOP/SIDE`, `C_GOLD_L` (indices en fin de tableau, style existant lignes 154-160).
- [ ] **Step 4: Run** — `node tools/platforms_test.mjs` PASS ; `node tools/game_sim.mjs` PASS.
- [ ] **Step 5: Commit** — `git add js/game.js tools/platforms_test.mjs && git commit -m "feat(platforms): turbo (amplification vx) et dorée (+1 saut aérien 10 s)"`

### Task 6: `js/game.js` — Bascule

**Files:**
- Modify: `js/game.js` (`land` 497-522, `execJump` 460-495, `drawPlat` 1151-1244 + fallback)

**Interfaces:**
- Consumes: Task 1 (`BASCULE_VX`, `BASCULE_VY_MUL`, `BOUNCE_VY`) ; Task 2 validation.
- Produces: `p.tilt` (∈ {-1, 0, 1}) — posé au `land`, lu au `execJump`, remis à 0 après lancement ; usé par le rendu (Task 7).

- [ ] **Step 1: Write the failing test** :

```js
// land côté gauche (slime.x < centre) → p.tilt === -1 ; côté droit → +1
// execJump depuis bascule tilt=-1 → vx === +BASCULE_VX (200), vy === -BOUNCE_VY*0.9 (-360), p.tilt === 0
// pas de consommation de charge aérienne ni de visée : aim.air false → aucune charge dj consommée ; jump depuis bascule n'utilise PAS la puissance visée
// en l'air (aim.air), execJump → comportement double saut inchangé (jamais bascule)
```

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** —
  - `land(p)` : pour `p.type === 'seesaw'` : `p.tilt = slime.x < p.x + p.w / 2 ? -1 : 1` ; `slime.jumpMul = 1` (pas la branche sticky) ; SFX landing pitch dédié (Task 3 mapping : 6).
  - `execJump()` : avant le calcul de visée (462) : `const gp0 = slime.groundPlat ; if (gp0 && gp0.type === 'seesaw' && !aim.air) { slime.vx = -gp0.tilt * BASCULE_VX ; slime.vy = -Phys.phys().bounceVy * BASCULE_VY_MUL ; slime.face = slime.vx >= 0 ? 1 : -1 ; slime.grounded = false ; slime.groundPlat = null ; gp0.tilt = 0 ; slime.squashT = 0.12 ; sfx(SFX_LAND, 5, 0.8) ; runStarted = true ; Music.start() ; aim.on = false ; aimPad = null ; slowmoT = 0 ; slime.coyote = 0 ; return }` (lancement fixe famille rebond ; ne touche ni `airJumps` ni `djCd`).
  - `drawPlat` : pour seesaw, dessiner avec rotation : `save()` ; `translate(p.x + p.w/2, p.y + 12)` ; `rotate(p.tilt * 0.17)` (≈10°) ; dessiner la tuile centrée sur `(-p.w/2, -12)` ; `restore()` — dans les DEUX chemins (sprites et fallback). Les tuiles sont posées par cellule : translate/rotate une fois puis boucle avec coordonnées relatives.
- [ ] **Step 4: Run** — `node tools/platforms_test.mjs` PASS ; `node tools/game_sim.mjs` PASS.
- [ ] **Step 5: Commit** — `git add js/game.js tools/platforms_test.mjs && git commit -m "feat(platforms): bascule (see-saw, lancement opposé à l'inclinaison)"`

### Task 7: Sprites & rendu des 9 types

**Files:**
- Create: `tools/make_new_tiles.py`
- Create: `ASSETS/sprites/game/tile_turbo.png`, `tile_gold.png`, `tile_seesaw.png` (64×48, style des tuiles existantes : bord noir arrondi, face, bande top + reflet blanc)
- Modify: `js/sprites.js:2-45` (defs), `js/game.js:1176` (keys map), `js/game.js:1219-1220` (palettes fallback), overlays chevrons/étincelles

**Interfaces:**
- Consumes: `p.tilt` (Task 6), `slime.turboT`/`slime.goldT` (Tasks 5-6), couleurs Task 5.
- Produces: clés sprites `tileTurbo`/`tileGold`/`tileSeesaw` (usées par drawPlat et l'éditeur Task 8).

- [ ] **Step 1: Write the failing test** (dans `platforms_test.mjs`, avec le stub ctx de game_sim) :

```js
// drawPlat ne crashe pour chacun des 9 types (sprite path ET fallback)
for (const t of ['basic','sticky','dynamic','crumble','phase','bouncy','turbo','gold','seesaw']) {
  const p = { x: 100, y: 100, w: 96, type: t, tilt: 0, phase0: 0, spike: null, crackT: 0 }
  drawPlat(p) // ne doit pas lever
}
```
- [ ] **Step 2: Run** — FAIL (drawPlat dessine turbo/gold/seesaw comme basic sans lever ? Vérifier : le test doit aussi pinner le RENDU — utiliser le stub Proxy pour compter les appels rectfill/rotate : seesaw appelle `rotate`, turbo dessine ≥ 1 chevron). Ajuster : compter via le stub (`calls.push(k)`) et vérifier `rotate` appelé pour seesaw.
- [ ] **Step 3: Implement** —
  - `tools/make_new_tiles.py` : PIL, 64×48 chacun, même style que les tuiles (cadrage : le script regarde `tile_orange.png` comme référence de style) — turbo : top cyan `#35c4e7`, side bleu foncé `#186a80`, double chevron blanc horizontal ; gold : top `#ffd83d`, side `#b8860b`, étoile blanche ; seesaw : bois top `#c98d4e`, side `#8a5a2b`, cercle pivot central. Exécuter : `python3 tools/make_new_tiles.py`.
  - `js/sprites.js` defs : `tileTurbo: 'tile_turbo', tileGold: 'tile_gold', tileSeesaw: 'tile_seesaw'` (PAS dans `VARIANT_BASES`).
  - `drawPlat` : keys map (1176) += `turbo: 'tileTurbo', gold: 'tileGold', seesaw: 'tileSeesaw'` ; overlay turbo : chevrons blancs orientés (style bouncy, 2 triangles) ; overlay gold : contour pulsé `alpha(0.5 + 0.4*sin(T*5))` rectangle doré ; seesaw : rotation (Task 6) appliquée à la boucle de tuiles.
  - Fallback (1203-1233) : palettes `tops/sides` += `turbo: C_TURBO_TOP/SIDE, gold: C_GOLD_TOP/SIDE, seesaw: bois` ; fallback seesaw : pivot (cercle central) ; fallback phase : `drawTile` + alpha déjà géré Task 4.
  - Lignes de vitesse turbo : dans le draw du slime, si `slime.turboT > 0` → 2-3 rects blancs derrière le slime (opacité liée à turboT).
- [ ] **Step 4: Run** — `node tools/platforms_test.mjs` PASS ; `node tools/sprites_test.mjs` PASS (gardes de dessin intacts) ; vérifier les 3 PNG existent (`ls ASSETS/sprites/game/tile_{turbo,gold,seesaw}.png`).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(platforms): sprites turbo/gold/seesaw + rendu des 9 types"`

### Task 8: `js/editor.js` — 9 types, touches 1-9, retrait dynLife

**Files:**
- Modify: `js/editor.js:24-28` (TYPE_LABEL), `js/editor.js:29-31` (DECOR_SPRITES), `js/editor.js:180-235` (preview), `js/editor.js:2072-2073` (touches), onglet VUE (slider `dynLife`, grep `dynLife`)

**Interfaces:**
- Consumes: `Patterns.TYPES` (Task 2), clés sprites (Task 7).

- [ ] **Step 1: Write the failing test** — étendre `tools/editor_dom_test.mjs` (mini-DOM existant) : `TYPE_LABEL` contient 9 entrées dont `phase: 'Phasante'`, `turbo: 'Turbo'`, `gold: 'Dorée'`, `seesaw: 'Bascule'` ; appui touche `'7'` → `platType === 'turbo'`, `'9'` → `'seesaw'` ; le panneau VUE n'expose plus de contrôle `dynLife`.
- [ ] **Step 2: Run** — `node tools/editor_dom_test.mjs` → FAIL.
- [ ] **Step 3: Implement** — `TYPE_LABEL` += 4 entrées ; `types` ligne 2072 → `Patterns.TYPES` (source unique) ; regex `/^[1-6]$/` → `/^[1-9]$/` ; preview (180-235) : alpha pour phase (solide/traversable figé à solide en éditeur), rotation tilt simulé ±10° pour seesaw, couleurs chevrons turbo / contour gold (repérer le type via les mêmes couleurs que le jeu) ; slider `dynLife` de l'onglet VUE supprimé (le champ reste toléré côté `normalizeLayout`) ; `DECOR_SPRITES` += `tileTurbo`, `tileGold`, `tileSeesaw`.
- [ ] **Step 4: Run** — `node tools/editor_dom_test.mjs` PASS ; `node tools/game_sim.mjs` PASS (l'éditeur n'est pas chargé en jeu, régression par prudence).
- [ ] **Step 5: Commit** — `git add js/editor.js tools/editor_dom_test.mjs && git commit -m "feat(editor): 9 types de plateformes (touches 1-9), retrait slider dynLife"`

### Task 9: Génération — poids et règles, régénération du pool

**Files:**
- Modify: `tools/gen-core.js:57-75` (roll des types, cellules, règles), régénère `js/patterns-defaults.js`

**Interfaces:**
- Consumes: TYPES 9 (Task 2) ; validateur inchangé.

- [ ] **Step 1: Write the failing test** (dans `tools/platforms_test.mjs`) :

```js
// Le pool régénéré contient au moins 1 pattern avec chaque nouveau type
const pool = Patterns.defaults()
for (const t of ['phase','turbo','gold','seesaw']) check('pool contient ' + t, pool.some(p => p.platforms.some(q => q.type === t)))
check('gold rare (<= 2% des plateformes)', (() => { const all = pool.flatMap(p => p.platforms); return all.filter(q => q.type === 'gold').length / all.length <= 0.04 })())
check('phase jamais > 2 consécutives dans un pattern', pool.every(p => { let c = 0; for (const q of p.platforms) { c = q.type === 'phase' ? c + 1 : 0; if (c > 2) return false } return true }))
check('gold max 1 par pattern', pool.every(p => p.platforms.filter(q => q.type === 'gold').length <= 1))
```

- [ ] **Step 2: Run** — FAIL (pool actuel sans nouveaux types).
- [ ] **Step 3: Implement** — `gen-core.js` roll (57-63) : `basic .30`, `dynamic .42`, `crumble .52` (elapsed > 12), `sticky .60`, `phase .69` (elapsed > 12), `bouncy .79` (elapsed > 25), `turbo .87` (elapsed > 18), `seesaw .93` (elapsed > 25), `gold .96` (elapsed > 30), sinon basic ; cellules : turbo `randi(2,4)`, gold `randi(1,2)`, seesaw `randi(3,4)`, phase `randi(2,3)` ; règles : gold ≤ 1/pattern, phase ≤ 2 consécutives (compteur local), seesaw jamais dernière plateforme du pattern (si dernier tiré → basic) ; la génération `amp/spd` pour dynamic et l'ancienne ligne 62 (`ghost`) remplacées en conséquence. Puis `node tools/gen_defaults.mjs` (régénère `js/patterns-defaults.js` — vérifier le mode d'emploi en tête de fichier).
- [ ] **Step 4: Run** — `node tools/platforms_test.mjs` PASS ; `node tools/smoke_test.mjs` PASS (pool ≥ 20, valide, chaînage 400 sections).
- [ ] **Step 5: Commit** — `git add tools/gen-core.js js/patterns-defaults.js tools/platforms_test.mjs && git commit -m "feat(gen): poids des 9 types + règles (gold rare, phase <=2, seesaw non-final)"`

### Task 10: Finalisation — tests complets, cache-busting, doc

**Files:**
- Modify: `play.html:17-27` (?v=), `editor.html:222-226,245` (?v=), `README.md:71-81` (tableau types), `README.md:132` (PHYS sticky ×0.8 → ×1.15)

- [ ] **Step 1: Run la suite complète** — `node tools/smoke_test.mjs && node tools/game_sim.mjs && node tools/platforms_test.mjs && node tools/sprites_test.mjs && node tools/editor_dom_test.mjs && node tools/music_test.mjs && node tools/ranking_test.mjs` → tout PASS.
- [ ] **Step 2: Bump `?v=`** — play.html : `physics.js`, `patterns.js`, `patterns-defaults.js`, `game.js`, `sprites.js` → `?v=20260929b` (ou date du jour) ; editor.html : mêmes fichiers + `editor.js`.
- [ ] **Step 3: README** — tableau « Types de plateformes » : 9 types avec nouveaux libellés/effets (Phasante : « solide 60 % du temps, cycle 2 s — attendez votre moment » ; Turbo : « amplifie ta vitesse au départ » ; Dorée : « rare : +1 saut aérien 10 s » ; Bascule : « te propulse du côté opposé ») ; section PHYS : « puissance après plateforme collante (×1.15) » ; éditeur : « touches 1-9 = type ».
- [ ] **Step 4: Vérif manuelle** — `node tools/smoke_test.mjs` une dernière fois + relancer le jeu (`python3 -m http.server` ou `server.mjs`) et jouer 2 min : squash/dust au posé, phasante lisible, turbo qui pousse, dorée qui scintille, bascule qui propulse. (La mesure `?prof` sur mobile cible reste à faire par l'humain, cf. AGENTS.md.)
- [ ] **Step 5: Commit** — `git add -A && git commit -m "chore: cache-busting + doc des 9 types de plateformes"`

## Self-review

- **Spec coverage** : §2 juice (T3), §3 reworks (T3, phase T4), §4 turbo/gold/seesaw (T5, T6), §5 physique/validation (T1-T2), §6 génération (T9), §7 rendu/perf (T7, contrainte VARIANT_BASES), §8 éditeur (T8), §9 SFX (T3), §10 tests+README (toutes + T10), §11 critères (T10). ✔
- **Step scan** : chaque step = une action vérifiable ; les corps non déterminés par tests/signatures sont décrits (rotation seesaw, lancement bascule). ✔
- **Type consistency** : `phase0`, `tilt`, `bounceCombo`, `goldT`, `turboT`, `crackWarn`, clés `tileTurbo/tileGold/tileSeesaw`, `Phys.phaseSolid`, `canReachBounce(...,vx,vy)` — nommés identiquement partout. ✔
- **Review Focus** : items 1 (T2), 2 (T1), 3 (T3), 4 (T6), 5 (T3), 6 (T2) — chacun a son test dans la tâche propriétaire. ✔
- **Proportion** : le plan reste plus court que le code produit ; pas de transcription. ✔
