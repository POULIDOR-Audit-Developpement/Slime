# Progression « découverte & difficulté » — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** chaque run apprend le jeu — types de plateformes débloqués progressivement (garde universelle par temps), pool par défaut régénéré en paliers pédagogiques avec vitrines, et défauts PHYS/POWER/murs du code alignés sur le feeling actuel (pool.json).

**Architecture :** table `UNLOCK_T` + filtre de poids dans `patterns.js` (fallback anti-pool-vide, bypass `?pattern=`) ; `tools/gen-core.js` restructuré en palettes de types par tier + patterns vitrines ; `poolTag` dans l'état LAN pour imposer le nouveau pool sans ressusciter l'ancien ; défauts cuits dans `PHYS_DEF`/`POWERS_DEF`/`WALL_DEF`.

**Tech Stack :** JS navigateur sans dépendances (scripts classiques), Node pour la génération et les tests (`node tools/<test>.mjs`), server.mjs (HTTP natif) pour le pool LAN.

**Spec :** `docs/superpowers/specs/2026-09-29-progression-decouverte-design.md`

## Global Constraints

- Tests Node : `node tools/smoke_test.mjs`, `platforms_test.mjs`, `game_sim.mjs`, `editor_dom_test.mjs`, `lan_sync_test.mjs`, `server_test.mjs` — tous au vert à chaque commit.
- Cache-busting : tout `js/*.js` modifié → bump `?v=` dans `play.html` et/ou `editor.html` (récupéré en Task 7 : `?v=20260930a`).
- Budget de génération/validation conservateur : `DJ_PER_CHAIN = 1` (patterns.js) et `budget = { dj: tier >= DJ_TIERS ? 1 : 0 }` (gen-core) **inchangés**.
- `STICKY_MUL` (constante physics 1.15) ne doit plus servir à la validation : utiliser `Phys.phys().stickyMul` (défaut devient 0.8).
- Seed de régénération : `20260930`, 6 patterns/tier. poolTag exact : `gen-pedago-20260930`.
- `UNLOCK_T` exact : `{ basic: 0, dynamic: 0, crumble: 90, phase: 120, sticky: 210, turbo: 240, bouncy: 330, seesaw: 360, gold: 420 }`.
- `W0 = [120, 20, 0, 0, 0]`, `W1 = [2, 12, 30, 55, 80]` (inchangé).
- Export/import patterns-seuls : `poolTag` ne sort JAMAIS dans `exportPatterns`/`exportCode` (LAN uniquement).
- Pas d'UI/toast, pas de méta-progression, pas de changement de `FORMAT`.

## Review Focus

1. **Pool utilisateur 100 % exotique** (ex. que des seesaw) avant 330 s : le tirage doit retomber sur le pool complet (fallback), jamais enchaîner des plateformes `safety`. → test Task 3.
2. **Ancien save caméra (80/240 ou 40/120)** : migré vers 35/400 au chargement — personne ne reste sur une caméra à l'ancienne base. → test Task 1.
3. **Appareil hors ligne pendant le remplacement `poolTag`** : au premier pull ses patterns locaux absents du distant sont abandonnés, le tag est stocké, et rien n'est repoussé (pas de résurrection en boucle). → test Task 6.
4. **Pattern legacy avec type `ghost`** : compte comme `phase` (déverrouillage 120 s), jamais d'exception ni de NaN. → test Task 3.
5. **Pattern épinglé `?pattern=` avec types verrouillés** : joué tel quel, jamais remplacé par `safety`. → test Task 3.
6. **Slow-mo durée 2 s** (hors ancienne plage de slider 0.2–1) : saisissable dans l'éditeur et appliqué sans écrêtage. → test Task 2.

---

### Task 1 : Défauts PHYS + murs 4/4 (js/physics.js) + cohérence gen-core

**Files:**
- Modify: `js/physics.js` (PHYS_DEF lignes 35-43 ; bornes caméra lignes ~73-80 ; migration ~84-87 ; `wallsCfg`/`setWalls` ~99-106 ; constantes lignes 7-8)
- Modify: `js/patterns.js:43-44` (normalizeLayout murs), `js/game.js:52`, `js/editor.js:975`
- Modify: `tools/gen-core.js` — `reachOk` : `const mul = a.type === 'sticky' ? Phys.phys().stickyMul : 1`
- Test: `tools/smoke_test.mjs` (sections 3, 6, 6b, 6b'' mises à jour)

**Interfaces:**
- Produces: `WALL_DEF = { left: 4, right: 4 }` (constante exportée par physics.js, consommée par patterns.js/game.js/editor.js) ; `Phys.phys()` défauts nouveaux ; constantes `TIP_L`/`SPIKE_W` supprimées.

- [ ] **Step 1: Écrire les tests qui échouent (smoke_test.mjs)**

Remplacer les assertions épinglant les anciens défauts :
```js
// section 3 (import) :
check('réglages intacts après import (grav 777, murs défaut)', Patterns.getLayout().phys.grav === 777 && Patterns.getLayout().walls.left === 4 && Patterns.getLayout().walls.right === 4)
// section 6 :
check('layout par défaut (murs latéraux, pas de plafond)', Patterns.getLayout().walls.left === 4 && Patterns.getLayout().walls.right === 4 && Patterns.getLayout().walls.ceil === undefined)
// section 6b :
check('phys défauts (slime 11, grav 620)', phDef.slimeR === 11 && phDef.grav === 620 && phDef.vmin === 170 && phDef.vmax === 380)
check('layout.phys normalisé par défaut', Patterns.getLayout().phys.slimeR === 11 && Patterns.getLayout().phys.aimMin === 30 && Patterns.getLayout().phys.aimMax === 90)
// section 6b'' (caméra) — remplacer tout le bloc par :
check('caméra : défauts feeling (35/400)', phDef.camBase === 35 && phDef.camMax === 400)
check('caméra : durée jusqu\'au max par défaut (540 s)', phDef.camRampDur === 540)
Phys.setPhys({ camBase: 40, camMax: 120 })
check('caméra : ancienne base (40/120) migrée vers 35/400', Phys.phys().camBase === 35 && Phys.phys().camMax === 400)
Phys.setPhys({ camBase: 80, camMax: 240 })
check('caméra : base officielle précédente (80/240) migrée vers 35/400', Phys.phys().camBase === 35 && Phys.phys().camMax === 400)
Phys.setPhys({ camBase: 200, camMax: 600 })
check('caméra : bornes hautes accessibles (200/600)', Phys.phys().camBase === 200 && Phys.phys().camMax === 600)
Phys.setPhys({ camBase: 300, camMax: 900 })
check('caméra : hors bornes écrêté (200/600)', Phys.phys().camBase === 200 && Phys.phys().camMax === 600)
// et la ligne 'installDefaults remplace par les 20 défauts' devient :
check('installDefaults remplace par les défauts', Patterns.installDefaults() === defs.length && Patterns.getPatterns().length === defs.length && Patterns.getPatterns()[0].id === defs[0].id)
```

- [ ] **Step 2: Vérifier l'échec**

Run: `node tools/smoke_test.mjs`
Expected: FAIL sur les nouvelles assertions caméra/murs/PHYS.

- [ ] **Step 3: Implémenter dans js/physics.js**

- `PHYS_DEF` : `slimeR: 11, vmin: 170, vmax: 380, aimMin: 30, aimMax: 90, stickyMul: 0.8, hurtRecoil: 0.8, coyote: 0.07, camBase: 35, camMax: 400` (grav/fallMax/dragAir/bounceVy/bounceVx/invuln/camRampDur inchangés).
- `normPhys` : borne `camMax: physBound(n.camMax, d.camMax, 60, 600)` (le slider montera à 560) ; bornes des autres inchangées.
- Migration caméra : garder les lignes `if (out.camBase === 40)...` / `if (out.camMax === 120)...` et ajouter `if (out.camBase === 80) out.camBase = d.camBase` / `if (out.camMax === 240) out.camMax = d.camMax`.
- Ligne 7-8 : supprimer `TIP_L` et `SPIKE_W`, ajouter `const WALL_DEF = { left: 4, right: 4 }`.
- `wallsCfg = { left: WALL_DEF.left, right: WALL_DEF.right }` et fallbacks `setWalls` : `+next.left || WALL_DEF.left` (idem right).
- Mettre à jour le commentaire « Base ×2 (80/240) » pour décrire les défauts 35/400 + migrations.

- [ ] **Step 4: Propager WALL_DEF**

- `js/patterns.js` (normalizeLayout) : `w.left = clampN(+w.left || WALL_DEF.left, 4, 60)` (idem right avec `SPIKE_W`→`WALL_DEF.right`).
- `js/game.js:52` : `let WALL = { left: WALL_DEF.left, right: WALL_DEF.right }`.
- `js/editor.js:975` : `walls: { left: WALL_DEF.left, right: WALL_DEF.right }`.
- `tools/gen-core.js` (`reachOk`) : `const mul = a.type === 'sticky' ? Phys.phys().stickyMul : 1`.

- [ ] **Step 5: Vérifier le vert**

Run: `node tools/smoke_test.mjs && node tools/platforms_test.mjs && node tools/game_sim.mjs`
Expected: PASS (game_sim peut utiliser les défauts : vérifier qu'aucune assertion n'épingle 14/210/360/80/240 ; ajuster ces éventuelles lignes sur les nouveaux défauts).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(defauts): PHYS feeling (slimeR 11, 170/380, 30/90, sticky 0.8, cam 35/400) + murs 4/4 (WALL_DEF)"
```

### Task 2 : Défauts POWERS + sliders éditeur

**Files:**
- Modify: `js/patterns.js:18-23` (POWERS_DEF), `js/editor.js` (PHYS_SLIDERS ~987, POWER sliders ~1090)
- Test: `tools/smoke_test.mjs` (section 6), `tools/editor_dom_test.mjs`

**Interfaces:**
- Produces: `POWERS_DEF` = `{ doubleJump: { enabled: true, cooldown: 0.5, charges: 2, powerMul: 1.15 }, slowmo: { enabled: true, scale: 0.05, duration: 2 }, ledge: { enabled: true, pullT: 0.3, window: 5 } }` ; sliders couvrant tous les défauts.

- [ ] **Step 1: Écrire les tests qui échouent**

smoke_test.mjs — ajouter en section 6 :
```js
const pw = Patterns.getLayout().powers
check('pouvoirs défauts (DJ 0.5s/2/×1.15, slowmo ×0.05/2s, ledge 5/0.3s)',
  pw.doubleJump.cooldown === 0.5 && pw.doubleJump.charges === 2 && pw.doubleJump.powerMul === 1.15 &&
  pw.slowmo.scale === 0.05 && pw.slowmo.duration === 2 && pw.ledge.window === 5 && pw.ledge.pullT === 0.3)
```
editor_dom_test.mjs — mettre à jour : `check('reset -> slimeR défaut 11', ...)` ; `slider cooldown -> brouillon, layout inchangé` attend `=== 0.5` ; `slider échelle slow-mo -> brouillon` attend `=== 0.05` ; et ajouter :
```js
els['pw_slowmo_duration'].value = '2'
els['pw_slowmo_duration'].handlers.input()
// ... appliquer ...
check('slow-mo durée 2 s appliquée (slider élargi)', Patterns.getLayout().powers.slowmo.duration === 2)
```

- [ ] **Step 2: Vérifier l'échec**

Run: `node tools/smoke_test.mjs && node tools/editor_dom_test.mjs`
Expected: FAIL sur pouvoirs défauts / slow-mo durée.

- [ ] **Step 3: Implémenter**

- `POWERS_DEF` (patterns.js) : valeurs de l'interface ci-dessus. Bornes de `normalizeLayout` déjà compatibles (duration 0.2–2 inclusif).
- `PHYS_SLIDERS` (editor.js) — recentrés milieu = nouveau défaut, plages sinon intactes :
  `slimeR 6–16`, `vmin 60–280`, `vmax 200–560`, `aimMin 12–48`, `aimMax 50–130`, `hurtRecoil 0.3–1.3`, `coyote 0–0.14`, `camBase 20–50`, `camMax 240–560` ; inchangés : grav, fallMax, dragAir, bounceVy/Vx, stickyMul (0.5–1.1 déjà centré 0.8), invuln, camRampDur.
- POWER sliders : `['duration', 'Durée', 0.2, 2, 0.1, ...]` (slow-mo) ; autres inchangés (tous défauts atteignables au pas).
- Mettre à jour les commentaires « le défaut est le milieu exact du slider » si nécessaire.

- [ ] **Step 4: Vérifier le vert**

Run: `node tools/smoke_test.mjs && node tools/editor_dom_test.mjs && node tools/game_sim.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(defauts): pouvoirs feeling (DJ 0.5s/2 charges/×1.15, slowmo ×0.05/2s, ledge 5/0.3s) + sliders recentrés"
```

### Task 3 : Garde universelle UNLOCK_T (js/patterns.js)

**Files:**
- Modify: `js/patterns.js` (W0 ~329 ; `weights` ~338 ; `spawnSection` ~359 ; nouveaux `UNLOCK_T`/`typeUnlockOk` ; exports)
- Create: `tools/progression_test.mjs`
- Test: `tools/progression_test.mjs`

**Interfaces:**
- Produces: `Patterns.UNLOCK_T` (objet const ci-dessus), `Patterns.typeUnlockOk(p, elapsed) -> boolean` (alias legacy `ghost` → `phase`), consommés par Task 5 et les tests.
- `weights(pool, elapsed, ignoreGate)` : signature étendue (interne).

- [ ] **Step 1: Écrire tools/progression_test.mjs (échoue)**

Même squelette que smoke_test (charge `js/physics.js` + `js/patterns-defaults.js` + `js/patterns.js` via `new Function`, stubs localStorage/window). Checks :
```js
const U = Patterns.UNLOCK_T
check('table UNLOCK_T', U.basic === 0 && U.dynamic === 0 && U.crumble === 90 && U.phase === 120 && U.sticky === 210 && U.turbo === 240 && U.bouncy === 330 && U.seesaw === 360 && U.gold === 420)
const legacy = { platforms: [{ type: 'ghost' }] } // objet minimal : ghost compte comme phase
check('ghost traité comme phase (120 s)', Patterns.typeUnlockOk(legacy, 119) === false && Patterns.typeUnlockOk(legacy, 120) === true)
// (a) pool jamais vide : pour s = 0..539, au moins un pattern défaut éligible
let vide = -1
for (let s = 0; s < 540 && vide < 0; s++) if (!Patterns.defaults().some(p => Patterns.typeUnlockOk(p, s))) vide = s
check('ensemble éligible non vide sur 0-539 s', vide < 0)
// (b) simulation : aucune plateforme d\'un type verrouillé
let last = { x: 16, row: 2, y: rowY(2), w: 5 * CELL }
for (let i = 0; i < 400; i++) {
  const el = i * 1.35
  const sec = Patterns.spawnSection(last, el)
  for (const p of sec.platforms) check('type débloqué à ' + Math.round(el) + ' s : ' + p.type, (U[p.type] || 0) <= el)
  last = sec.platforms[sec.platforms.length - 1] || last
}
// (c) fallback pool exotique : que du bouncy -> joué dès 0 s (pas de safety)
const exotic = { id: 'x1', name: 'X', difficulty: 1, entry: { row: 2 }, platforms: [{ x: 64, row: 2, cells: 3, type: 'bouncy', yOff: 0, amp: 0, spd: 0, spike: null }], balls: [], decor: [] }
Patterns.setPatterns([JSON.parse(JSON.stringify(exotic))])
const secX = Patterns.spawnSection(last, 0)
check('pool exotique : fallback sans safety', secX.platforms.length === 1 && secX.platforms[0].type === 'bouncy' && !secX.platforms[0].safety)
Patterns.resetUser()
// (d) pinned bypass : pattern bouncy épinglé joué à 0 s
Patterns.pin(JSON.parse(JSON.stringify(exotic)))
const secP = Patterns.spawnSection(last, 0)
check('pinned bypass la garde', secP.platforms.some(p => p.type === 'bouncy') && !secP.platforms[0].safety)
Patterns.pin(null)
```
NB : si un `check` dans la boucle (b) échoue, ne spammer qu'une fois par type — compter les échecs puis un seul check agrégé.

- [ ] **Step 2: Vérifier l'échec**

Run: `node tools/progression_test.mjs`
Expected: FAIL (`Patterns.UNLOCK_T` undefined).

- [ ] **Step 3: Implémenter dans js/patterns.js**

- Const `UNLOCK_T` (valeurs Global Constraints) ; `typeUnlockOk(p, elapsed)` : faux si une plateforme a un type dont `UNLOCK_T[type === 'ghost' ? 'phase' : type] > elapsed`.
- `W0 = [120, 20, 0, 0, 0]`.
- `weights(pool, elapsed, ignoreGate)` : après le calcul existant, `if (!ignoreGate && !pinned && !typeUnlockOk(p, elapsed)) w = 0` (avant le `Math.max(w, 0)`).
- `spawnSection` : `const ws = weights(pool, elapsed, !!pinned)` ; si total ≤ 0 **et pas pinned** → recalcul `weights(pool, elapsed, true)` ; si toujours ≤ 0 → `safety(last)` (comportement existant).
- Exports : ajouter `UNLOCK_T, typeUnlockOk` à l'objet retourné.

- [ ] **Step 4: Vérifier le vert (toute la suite)**

Run: `node tools/progression_test.mjs && node tools/smoke_test.mjs && node tools/platforms_test.mjs && node tools/game_sim.mjs`
Expected: PASS (le pool actuel contient tous les types dès ses patterns — les checks (a)/(b) passent car `typeUnlockOk` est saturé à 540 s pour tous les types).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(gen): garde universelle de découverte (UNLOCK_T) + fallback anti-pool-vide + bypass pinned"
```

### Task 4 : gen-core.js — palettes par tier + vitrines + ramp intra-tier

**Files:**
- Modify: `tools/gen-core.js`

**Interfaces:**
- Produces: `generateDefaultPool({ perTier, seed })` inchangée en signature ; sortie respectant les contrats testés en Task 5 : palettes cumulatives, vitrines, dynamic T1 doux.
- Contrats : `TIER_NEW = { 1: ['dynamic'], 2: ['crumble', 'phase'], 3: ['sticky', 'turbo'], 4: ['bouncy', 'seesaw'], 5: ['gold'] }` ; palette du tier d = `['basic', ...TIER_NEW[1..d] à plat]` ; pattern vitrine = pattern d'index `i < TIER_NEW[d].length` du tier, qui contient `TIER_NEW[d][i]`.

- [ ] **Step 1: Implémenter (le test pin vient en Task 5 sur la sortie régénérée)**

- Supprimer `TIER_T` et les seuils `simElapsed > N` du roll ; ajouter `TIER_NEW` + `paletteOf(tier)`.
- `simSpawnNext(A, plats, balls, opts)` avec `opts = { tier, idx, perTier, vitrine, showcase }` :
  - Progression `D = clampN((tier - 1 + (idx + 1) / perTier) / 5, 0, 1)` ; `gap = 2 + A.randi(0, Math.round(2 * D))` ; si vitrine `gap = Math.min(gap, 3)`.
  - Type : sac pondéré `['basic','basic','basic', ...palette sans 'basic']`, tirage uniforme ; règles conservées (gold ≤ 1/pattern, phase ≤ 2 consécutives, seesaw jamais dernier).
  - Vitrine : plateforme `s === 0` forcée au type `showcase` avec `cells = Math.max(3, cellsDuType)` ; `s === 1` et `s === 2` forcés `'basic'` ; aucun spike dans tout le pattern vitrine.
  - Remplacer le bloc `simElapsed < 10` par : `tier === 1 && plats.length <= 3` → `gap ≤ 2`, `dRow ∈ [-1,1]`, type `'basic'`, `cells 3–4`.
  - Dynamic : `tier === 1` → `amp = 8 + rand*8`, `spd = 1.2 + rand*0.4` ; sinon valeurs actuelles.
  - Spike : `type === 'basic' && cells >= 4 && !vitrine && A.rand() < 0.10 + 0.30 * D`.
- `build()` : boucle `i` (index du pattern) passe `vitrine = i < TIER_NEW[tier].length`, `showcase = TIER_NEW[tier][i]` ; budget DJ et revalidation inchangés.

- [ ] **Step 2: Régénérer à blanc et vérifier la générabilité**

Run: `node tools/gen_defaults.mjs 6 20260930` puis `git checkout js/patterns-defaults.js` (la régénération officielle est en Task 5)
Expected: « total : 30 sections » et rejets < 200. Si un contrat est ingénérable (aucune vitrine valide après essais), corriger le générateur — ne pas changer le seed.

- [ ] **Step 3: Commit**

```bash
git add tools/gen-core.js && git commit -m "feat(gen-core): palettes de types par tier, vitrines de découverte, ramp intra-tier"
```

### Task 5 : Régénération officielle du pool + checks de contrats

**Files:**
- Modify: `js/patterns-defaults.js` (régénéré), `tools/progression_test.mjs`, `tools/smoke_test.mjs` (seuil 30)
- Test: `tools/progression_test.mjs`

**Interfaces:**
- Consumes: `Patterns.UNLOCK_T`, `Patterns.typeUnlockOk` (Task 3), `TIER_NEW` (Task 4, redéfini localement dans le test).

- [ ] **Step 1: Écrire les checks de contrats (progression_test.mjs)**

```js
const TIER_NEW = { 1: ['dynamic'], 2: ['crumble', 'phase'], 3: ['sticky', 'turbo'], 4: ['bouncy', 'seesaw'], 5: ['gold'] }
const paletteOf = d => ['basic', ...[1, 2, 3, 4, 5].flatMap(t => TIER_NEW[t]).slice(0, [0, 1, 3, 5, 7, 8][d])]
const pool = Patterns.defaults()
check('30 patterns (6/tier)', pool.length === 30 && [1, 2, 3, 4, 5].every(d => pool.filter(p => p.difficulty === d).length === 6))
check('palettes par tier', pool.every(p => p.platforms.every(q => paletteOf(p.difficulty).includes(q.type === 'ghost' ? 'phase' : q.type))))
// vitrines : pour chaque tier d et chaque j < TIER_NEW[d].length, le pattern gen-t{d}-{j+1} :
//  contient le type, cellules >= 3, aucun spike, gaps <= 3 cells, 2 basic parmi les 3 premières
for (const d of [1, 2, 3, 4, 5]) for (let j = 0; j < TIER_NEW[d].length; j++) {
  const v = pool.find(p => p.id === 'gen-t' + d + '-' + (j + 1))
  const type = TIER_NEW[d][j]
  check('vitrine T' + d + ' ' + type, !!v && v.platforms.some(q => q.type === type && q.cells >= 3)
    && v.platforms.every(q => !q.spike)
    && v.platforms.slice(0, 3).filter(q => q.type === 'basic').length === 2
    && v.platforms.every((q, k, a) => k === 0 || (q.x - (a[k - 1].x + a[k - 1].cells * 32)) / 32 <= 3))
}
check('dynamic T1 doux (amp <= 16, spd <= 1.6)', pool.filter(p => p.difficulty === 1).flatMap(p => p.platforms).filter(q => q.type === 'dynamic').every(q => q.amp <= 16 && q.spd <= 1.6))
```
smoke_test.mjs : `check('pool par défaut >= 30 sections', defs.length >= 30)` (remplacer 20).

- [ ] **Step 2: Vérifier l'échec**

Run: `node tools/progression_test.mjs`
Expected: FAIL (30 patterns / vitrines : l'ancien pool embarqué a 20 patterns).

- [ ] **Step 3: Régénérer officiellement**

Run: `node tools/gen_defaults.mjs 6 20260930`
Expected: console « tier t : 6 sections… total : 30 sections », `js/patterns-defaults.js` réécrit.

- [ ] **Step 4: Vérifier le vert (toute la suite)**

Run: `node tools/progression_test.mjs && node tools/smoke_test.mjs && node tools/platforms_test.mjs && node tools/game_sim.mjs && node tools/editor_dom_test.mjs`
Expected: PASS — en particulier les checks T9 existants de platforms_test (gold rare ≤ 4 %, phase ≤ 2 consécutives, gold ≤ 1/pattern, pool contient phase/turbo/gold/seesaw) restent verts ; ajuster uniquement des commentaires si le texte mentionne « 4 par tier ».

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(pool): pool pédagogique régénéré (seed 20260930, 6/tier, vitrines)"
```

### Task 6 : poolTag — remplacement LAN propre

**Files:**
- Modify: `server.mjs` (~163 whitelist PUT), `js/patterns.js` (`lanPull` ~519, `resolveConflict` ~532, nouveaux helpers), `tools/lan_sync_test.mjs`

**Interfaces:**
- Produces: état LAN avec champ optionnel `poolTag` (string) ; `Patterns` adopte le remote **sans fusion** quand le tag change (miroir `localStorage 'slime_pool_tag'`), fusion union sinon. `resolveConflict` retourne 0 après un remplacement.

- [ ] **Step 1: Écrire les tests (lan_sync_test.mjs, nouvelle section)**

Suivre les conventions du fichier (serveur éphémère + `js/patterns.js` en sandbox avec fetch branché) :
1. PUT (avec clé) d'un state `poolTag: 'tag-a'` + 1 pattern distant → GET renvoie `poolTag: 'tag-a'`.
2. PUT **sans** `poolTag` (éditeur ancien) → GET garde `'tag-a'` (préservé).
3. Client sandbox : localStorage pré-rempli avec un pattern local `local-only` et sans tag → démarrage (adoption) → `getPatterns()` ne contient que le distant (remplacement), `localStorage['slime_pool_tag'] === 'tag-a'`, et aucune re-poussée du local (le PUT suivant, déclenché par un `setPatterns` d'un pattern neuf, contient distant + neuf — pas `local-only`).
4. Même tag ensuite : un pattern créé localement survit au pull suivant (fusion union).

- [ ] **Step 2: Vérifier l'échec**

Run: `node tools/lan_sync_test.mjs`
Expected: FAIL (poolTag inconnu du serveur/client).

- [ ] **Step 3: Implémenter**

- `server.mjs` PUT :
```js
pool.state = {
  format: state.format, patterns: state.patterns, layout: state.layout || null,
  poolTag: (typeof state.poolTag === 'string' && state.poolTag) || (pool.state && pool.state.poolTag) || null
}
```
- `js/patterns.js` — `TAG_KEY = 'slime_pool_tag'` ; `adoptRemote(state)` :
  - `replaced = tag distant valide && tag !== localStorage[TAG_KEY]`.
  - `patterns = replaced ? state.patterns.slice() : mergeRemoteUnion(state).patterns` (+ `added` de l'union).
  - Comparer `[patterns, normalizeLayout(state.layout)]` à `[store.patterns, layout]` **avant** `installState` ; si changé → `lanNotify('conflict')`.
  - `installState(patterns, state.layout)` ; si replaced → `localStorage[TAG_KEY] = tag`.
  - Retour `{ replaced, added }`.
- `lanPull` : garder les gardes existantes (état distant invalide/vide) puis `adoptRemote(d.state)`.
- `resolveConflict` : garder les gardes, puis `const r = adoptRemote(d.state); return r.replaced ? 0 : r.added`.

- [ ] **Step 4: Vérifier le vert**

Run: `node tools/lan_sync_test.mjs && node tools/server_test.mjs && node tools/smoke_test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(lan): poolTag — le remplacement du pool s'impose aux appareils sans ressusciter l'ancien"
```

### Task 7 : data/pool.json + documentation + cache-busting + suite complète

**Files:**
- Modify: `data/pool.json`, `README.md`, `play.html`, `editor.html`

- [ ] **Step 1: Remplacer les patterns du pool partagé**

```bash
node -e "
const fs = require('fs');
const pool = JSON.parse(new Function(fs.readFileSync('js/patterns-defaults.js', 'utf8') + ';return SLIME_DEFAULT_POOL')());
const cur = JSON.parse(fs.readFileSync('data/pool.json', 'utf8'));
cur.rev = (typeof cur.rev === 'number' ? cur.rev : 0) + 1;
cur.state = { format: 'slime-patterns@1', patterns: pool, layout: (cur.state && cur.state.layout) || null, poolTag: 'gen-pedago-20260930' };
fs.writeFileSync('data/pool.json', JSON.stringify(cur));
console.log('pool.json : rev', cur.rev, '-', pool.length, 'patterns');
"
```
Si `server.mjs` tourne : le redémarrer (il charge pool.json au boot).

- [ ] **Step 2: README**

- Onglet POWER (table ~119-121) : `recharge (0.5 s), charges (2), puissance (×1.15)` ; `échelle du temps (×0.05), durée max (2 s)` ; `fenêtre (5 px), remontée (0.3 s)`.
- Collantes : remplacer les mentions « boostent le saut suivant (×1.15) » / « transmet sa puissance ×1.15 » (~104, ~124) par « transmet sa puissance (×0.8) ».
- Onglet PHYS/Dégâts (~137) : « reculs (×0.8) » ; vérifier les autres valeurs PHYS citées (grep `1.15|4 s|0.6 s|8 px|×1)` et `camBase|80/240`) → défauts nouveaux.
- Liste des tests (~208) : ajouter `progression_test` (courbe de découverte : UNLOCK_T, vitrines, fallback, pinned).
- Nouvelle courte section « Courbe de découverte » : tableau tiers/types + phrase sur la garde universelle et le poolTag.

- [ ] **Step 3: Cache-busting**

`play.html` : `physics.js`, `patterns-defaults.js`, `patterns.js`, `game.js` → `?v=20260930a`.
`editor.html` : `physics.js`, `patterns-defaults.js`, `patterns.js`, `editor.js` → `?v=20260930a`.

- [ ] **Step 4: Suite complète au vert**

Run: `node tools/smoke_test.mjs && node tools/platforms_test.mjs && node tools/game_sim.mjs && node tools/progression_test.mjs && node tools/editor_dom_test.mjs && node tools/music_test.mjs && node tools/sprites_test.mjs && node tools/server_test.mjs && node tools/lan_sync_test.mjs && node tools/ranking_test.mjs && node tools/qr_test.mjs && node tools/code_contact_test.mjs`
Expected: tous PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(deploy): pool LAN remplacé (poolTag gen-pedago-20260930), doc courbe de découverte, cache-busting"
```
