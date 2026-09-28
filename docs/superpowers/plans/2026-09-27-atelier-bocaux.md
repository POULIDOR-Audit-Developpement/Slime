# L'Atelier des bocaux — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Hall of fame visuel « atelier d'alchimiste » : bocaux par palier de couleur remplis des slimes des joueurs + livre à double pages (une par palier classée par temps d'obtention, une page dorée top 10 par score), soumission serveur avec modération admin du premier slime par palier.

**Architecture :** Le serveur zéro-dépendance existant (`server.mjs`) est rendu exportable puis enrichi d'un stockage `data/scores.json` avec logique de classement **côté serveur** (le client ne reçoit jamais de scores, seulement noms + temps déjà triés). Côté client : module pseudo, suivi des temps de palier, soumission à la mort, page `atelier.html` (scène zoomable + livre). Modération dans un onglet de l'éditeur.

**Tech Stack :** Node HTTP pur (aucune dépendance), JS navigateur IIFE (pattern existant), canvas 2D, tests Node `tools/*_test.mjs` (style `music_test.mjs` : `check(label, ok)`, exit non-nul).

**Spec :** `docs/superpowers/specs/2026-09-27-atelier-bocaux-design.md` — **à mettre à jour en v1.1 par la Tâche 1** (arbitrages du 2026-09-27 : livre à pages, temps d'obtention, aucun score dans les payloads publics, replays en phase 2).

## Global Constraints

- Serveur **zéro dépendance** ; écritures atomiques `tmp` + `rename` (pattern `savePool`) ; données dans `SLIME_DATA_DIR` (défaut `data/`), fichier scores : `data/scores.json`.
- Tests : `node tools/<x>_test.mjs` — chaque test affiche `ok`/`FAIL` et **exit ≠ 0** si échec. Tout `js/*.js` modifié → bump du `?v=` dans les pages hôtes (règle AGENTS.md).
- Perf (AGENTS.md) : scène atelier événementielle — recoloration des slimes **une fois** en canvases offscreen ; redessin complet uniquement sur zoom/pan/données nouvelles ; la seule animation continue est le pulse d'un sprite.
- i18n : EN par défaut + FR via `I18N.t()` / `[data-i18n]`.
- **Aucun chiffre de score affiché ni transmis publiquement** : `GET /api/scores` retourne noms + temps triés, jamais de score. Les temps affichés sont au format `m:ss` (`fmtTime`).
- Paliers **non atteints** : ni couleur, ni seuil, ni nom visibles (bocal vide neutre, page vide).
- Secret HMAC inchangé (`js/crypto.js`), `decode.html` intact. Plausibilité serveur : `score ≤ playtime × 45 + 60`, `score ≤ 100 000`, `playtime ≥ 1`.
- Modération : un palier s'ouvre dès qu'une entrée **approuvée** l'atteint (dérivé, jamais stocké) ; premier d'un palier fermé → `pending` invisible ; suppression du dernier approuvé → le palier se referme.
- **Hors périmètre (phase 2)** : replays des runs (nécessite RNG seedé — la sélection de patterns utilise `Math.random()` en l'état), ghost, seed du jour, combos.

## Review Focus

1. **Pseudo hostile** (balise HTML, insulte, emoji) : doit être nettoyé côté client ET serveur, affiché sans jamais interpérer du HTML. → testé Tâche 5.
2. **Unicode non normalisé** : deux « é » (NFC vs décomposé) doivent compter comme le même nom pour la règle meilleur-par-nom. → testé Tâche 3.
3. **Redémarrage serveur** avec `scores.json` existant : l'état ouvert/fermé des paliers doit être recalculé depuis les entrées approuvées, jamais lu depuis un champ stocké. → testé Tâche 3.
4. **Suppression admin du dernier validé d'un palier** : le palier se referme, les pendings redeviennent invisibles, la vue publique ne référence plus rien. → testé Tâche 4.
5. **Atelier sans serveur** (fichier ouvert en local, API muette) : scène + message « en ligne », aucune exception. → testé Tâche 8.

---

### Task 1: Mise à jour de la spec (v1.1)

**Files:**
- Modify: `docs/superpowers/specs/2026-09-27-atelier-bocaux-design.md`
- Create: `ASSETS/atelier/README.md` (liste des assets attendus)

**Interfaces:**
- Produces: la spec de référence pour toutes les tâches suivantes.

- [ ] **Step 1: Mettre à jour la spec** — remplacer §1/§2/§8 par : aucun score affiché ni transmis ; livre à **double page par palier** (10 joueurs max, tri **temps d'obtention** croissant, pseudo + temps `m:ss`) + **double page dorée** (top 10 par score, pseudo seul, pas de chiffre) ; bocaux = paliers (top 8 par temps + « +N ») ; assets réels = `ASSETS/atbg.jpeg` / `ASSETS/atsprite.jpeg` (mockups) à redessiner en PNG dans `ASSETS/atelier/` (`bg.png` atelier complet avec meuble + livre, `jar_full.png`, `jar_empty.png` neutre sans couleur, `plate.png` optionnel) avec **fallback dessiné procéduralement** si un PNG manque (pattern des sprites du jeu) ; replays notés hors périmètre phase 2 ; §2 table mise à jour (temps d'obtention remplace le tri par score dans les pages de palier).

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-09-27-atelier-bocaux-design.md ASSETS/atelier/README.md
git commit -m "docs: spec atelier v1.1 — livre à pages, temps d'obtention, aucun score public"
```

### Task 2: Rendre `server.mjs` exportable (refactor comportant-identique)

**Files:**
- Modify: `server.mjs`
- Test: `tools/server_test.mjs`

**Interfaces:**
- Produces: `createHandler({ dataDir, writeKey }) → Promise<(req,res)=>Promise<void>>` et garde CLI `import.meta.url === pathToFileURL(process.argv[1]).href` pour le `listen` existant. Toute la logique HTTP passe par le handler.

- [ ] **Step 1: Write the failing test** — importe `createHandler` depuis `../server.mjs`, démarre `http.createServer(handler)` sur le port 0, puis :

```js
// GET /api/rev -> 200 {rev:number}
// GET /api/state -> 200 {rev, state:null} (dataDir temporaire vierge)
// PUT /api/state sans X-Slime-Key -> 401
// PUT /api/state avec clé + {state:{format:'slime-patterns@1',patterns:[]}} -> 200 {ok:true,rev:2}
// PUT avec baseRev périmé -> 409
```

- [ ] **Step 2: Run** `node tools/server_test.mjs` → FAIL (createHandler n'existe pas)
- [ ] **Step 3: Implement** — extraire le corps du `http.createServer` actuel dans `createHandler({ dataDir, writeKey })` ; `loadPool`/`savePool` deviennent des closures du handler ; le bloc CLI (`loadPool().then(listen)`) ne s'exécute que lancé directement. Aucun changement de comportement.
- [ ] **Step 4: Run** → PASS. Vérifier aussi `node server.mjs --port 8479` à la main (GET / 200).
- [ ] **Step 5: Commit** `git commit -m "refactor: server.mjs exportable (createHandler) — comportement inchangé"`

### Task 3: Cœur de classement `Scores` (pur, testé sans HTTP)

**Files:**
- Modify: `server.mjs` (module `Scores` exporté + chargement/sauvegarde `scores.json` dans le handler)
- Test: `tools/scores_test.mjs`

**Interfaces:**
- Produces (tout depuis `server.mjs`) :
  - `Scores.newStore() → {seq:0, entries:[]}`
  - `Scores.normalizeName(raw) → string` (trim, NFC, espaces réduits, 1–12 car, charset lettres/chiffres/espaces/`-_. '` → `''` si invalide)
  - `Scores.validateSubmission(body, now) → {ok:true, sub} | {ok:false, error}` — sub = `{name, score, playtime, times:[[tierIdx,sec],…]}`, contraintes Global Constraints + `times` strictement croissant en tier, sec croissant, `sec ≤ playtime`
  - `Scores.tierIndex(tiers, score) → int` (mêmes sémantiques que `SlimeColors.tierIndex`)
  - `Scores.ingest(store, sub, code, tiers, now) → {accepted, replaced, entry}` — palier recalculé serveur ; meilleur-par-nom (NFC) : remplace si score strictement supérieur ; statut `ok` si palier ouvert sinon `pending` ; **ouvert(T) = ∃ approuvé e : e.tier ≥ T** (dérivé à chaque opération)
  - `Scores.approve(store, id, tiers) → boolean` + bascule des pendings couverts par le nouveau palier ouvert
  - `Scores.remove(store, id, tiers) → boolean` + re-fermeture éventuelle (pendings du palier refermé re-passent `pending`)
  - `Scores.publicView(store, tiers) → {golden:[{id,name,tier}], tiers:[{index, open, total, top:[{id,name,time}]}]}` — golden = top 10 score desc ; par palier ouvert : total d'entrées + top 10 par `times[tier]` asc (égalité → createdAt asc) ; **aucun champ score**
- Constantes exportées : `RATE_MAX=45, RATE_MARGE=60, MAX_SCORE=100000, PAGE=10, JAR=8`

- [ ] **Step 1: Write the failing test** — avec `tiers = [{min:0},{min:100},{min:200},{min:350},{min:500},{min:750}]` :

```js
// normalizeName : '  Émile  ' -> 'émile' NFC ; '<b>x</b>' -> '' ; 'Z'.repeat(13) -> ''
// validateSubmission : score 999999 -> {ok:false} ; playtime 0 -> false ;
//   times [[1,10],[1,20]] -> false ; score 300 en 2 s -> false (plausibilité)
// ingest 1er à tier 2 -> pending ; approve -> tier 2 ouvert, publicView.tiers[2].open=true
//   times [[2,95]] -> publicView.tiers[2].top[0] = {name, time:95}
// ingest 2e joueur tier 2 time 80 -> top[0] = lui ; total=2
// ingest meilleur-par-nom NFC : 'Émile' puis 'émile' (NFD) même nom -> 1 entrée
// ingest tier 4 pendant tier 2 ouvert seul -> pending
// remove du seul approuvé tier 2 -> tiers[2].open=false, pendings retombent
// newStore vide -> publicView tout fermé, golden []
```

- [ ] **Step 2: Run** `node tools/scores_test.mjs` → FAIL
- [ ] **Step 3: Implement** le module `Scores` (pur, aucune I/O) + brancher `scores.json` dans le handler (load au démarrage, save atomique à chaque mutation ; fichier absent → `newStore()`).
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(serveur): cœur de classement Scores — ingestion, paliers ouverts, vues publiques sans score"`

### Task 4: Endpoints HTTP scores + admin + tiers dans `/api/state`

**Files:**
- Modify: `server.mjs`
- Test: `tools/scores_http_test.mjs`

**Interfaces:**
- Produces:
  - `POST /api/scores` `{v:1, name, score, playtime, times, code}` → `201 {ok:true}` | `400 {error}` | `429 {error}` — HMAC du code vérifié (node:crypto `createHmac('sha256', writeKeySecret)` … **attention** : le secret est celui de `js/crypto.js`, à dupliquer côté serveur en constante `SCORE_SECRET`) + re-décodage b64url du body pour contrôler `score`/`elapsed` contre le payload ; rate-limit IP glissant 1/30 s (en mémoire)
  - `GET /api/scores` → `publicView` (names/times only)
  - `GET /api/admin/pending` (X-Slime-Key) → `{pending:[{id,name,score,tier,times,createdAt}]}`
  - `POST /api/admin/validate` `{id}` / `POST /api/admin/delete` `{id}` (X-Slime-Key) → `{ok:true}`
  - `PUT /api/state` : `state.layout.tiers` (optionnel, retro-compatible) stocké tel quel ; `GET /api/state` le retourne ; `Scores.tierIndex` utilise `state.layout.tiers` si présent sinon `SlimeColors.DEFAULTS` (copiés en constante serveur)

- [ ] **Step 1: Write the failing test** (HTTP, dataDir tmp) — fabrique un code valide avec une copie JS de `makeCode` (même format b64url+HMAC tronqué 32 hex) :

```js
// POST valide -> 201 ; GET /api/scores -> tier fermé : entry ABSENTE
// POST sans code valide -> 400 ; POST score 999999 -> 400
// POST 2e soumission immédiate même IP -> 429
// X-Slime-Key faux sur /api/admin/* -> 401
// validate -> GET /api/scores contient maintenant le nom ; times en time
// PUT /api/state avec layout.tiers custom -> POST recalculé selon ces tiers
// delete du dernier approuvé -> GET ne contient plus le nom
```

- [ ] **Step 2: Run** `node tools/scores_http_test.mjs` → FAIL
- [ ] **Step 3: Implement** les routes dans `createHandler` (thin : parse + appels `Scores` + `send`), rate-limiter en mémoire (Map ip→timestamps), constantes `SCORE_SECRET`, `DEFAULT_TIERS`.
- [ ] **Step 4: Run** → PASS (+ relancer `node tools/server_test.mjs` et `node tools/scores_test.mjs`)
- [ ] **Step 5: Commit** `git commit -m "feat(serveur): API scores publique + modération admin + paliers syncés via /api/state"`

### Task 5: Pseudo — `js/player.js`

**Files:**
- Create: `js/player.js`
- Modify: `play.html` (script tag `?v=1`), `index.html`, `js/i18n.js`
- Test: `tools/player_test.mjs`

**Interfaces:**
- Produces: global `Player` avec
  - `Player.sanitize(raw) → string` (règles `Scores.normalizeName`, + filtre insultes FR/EN → remplace le mot par `Slime`)
  - `Player.get() → string|null` (`localStorage['slime_player_name']`)
  - `Player.set(raw) → string|null` (sanitize ; `null` si vide → clef supprimée)
  - `Player.ensureModal({onDone})` — modal DOM (styles `css/style.css`) : champ + JOUER + « jouer sans nom » ; appelée au 1er lancement de `play.html` si `get()` null, et réaffichée à la mort si score > 0 sans nom (intégration Tâche 6)

- [ ] **Step 1: Write the failing test** (harnais `new Function` comme `music_test.mjs`, localStorage factice) :

```js
// sanitize : 'Émile' ok ; '  <img src=x>  ' -> '' ; insulte 'connard' -> 'Slime' ;
//   13 car -> tronqué à 12 ; 'a  b' -> 'a b'
// set/get round-trip ; set('') supprime la clef
```

- [ ] **Step 2: Run** `node tools/player_test.mjs` → FAIL
- [ ] **Step 3: Implement** module + modal (I18N : `nameAsk`, `nameSkip`, `nameTitle`, `yourName`) + ligne « TON NOM : X ✏️ » sur `index.html` (même `sanitize`, re-saisie).
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: pseudo joueur — sanitize, modal 1re visite, édition à l'écran titre"`

### Task 6: Temps de palier + soumission à la mort

**Files:**
- Create: `js/scores.js`
- Modify: `js/game.js` (`die()` ~l.387-408, tick où le score change ~l.732, écran de fin ~l.1690-1730), `js/i18n.js`, `play.html` (`?v=`)
- Test: `tools/tiertime_test.mjs`

**Interfaces:**
- Consumes: `Player.get()`, `Crypto.makeCode(s, elapsed)`, `SlimeColors.tierIndex(TIERS, currentScore())`
- Produces:
  - global `TierTimes` (dans `js/scores.js`) : `TierTimes.track(times, tierIdx, elapsed) → times` (pur : push `[tierIdx, round(elapsed)]` si tierIdx > dernier suivi) + `TierTimes.reset()`
  - global `Scores` (client, dans `js/scores.js`) : `Scores.submit({name, score, playtime, times, code}) → Promise` (POST `/api/scores`, timeout 3 s, `.catch(()=>{})`)
- game.js : au tick, `TierTimes.track(tierTimes, scoreTierIdx(), elapsed)` quand le tier monte ; dans `die()` : construire le payload (name via `Player.get()` ; si null et score > 0 → `Player.ensureModal` puis soumettre au `onDone`, sinon rien) et appeler `Scores.submit` ; bouton canvas « VOIR L'ATELIER » sous « CODE » (même mécanique de hit-test que REJOUER, lien `atelier.html`)

- [ ] **Step 1: Write the failing test** (pur, sans canvas) :

```js
// track([], 0, 10) -> [[0,10]] ; track([[0,10]], 0, 20) -> inchangé ;
// track([[0,10]], 2, 95) -> [[0,10],[2,95]] ; reset -> []
```

- [ ] **Step 2: Run** `node tools/tiertime_test.mjs` → FAIL
- [ ] **Step 3: Implement** `js/scores.js` + intégration `game.js` (init `tierTimes=[]` au reset de partie l.337) + i18n `atelier: 'ATELIER'` + bump `?v=` de `game.js`, `i18n.js` dans `play.html`.
- [ ] **Step 4: Run** `node tools/tiertime_test.mjs` + `node tools/game_sim.mjs` + tous les tests → PASS
- [ ] **Step 5: Commit** `git commit -m "feat: temps d'obtention par palier + soumission serveur à la mort + bouton atelier"`

### Task 7: Atelier — logique pure (layout, pages, book)

**Files:**
- Create: `js/atelier.js` (partie pure, exportée sur le global `Atelier`), `atelier.html` (squelette), `css/style.css` (plein écran)
- Test: `tools/atelier_test.mjs`

**Interfaces:**
- Consumes: forme `GET /api/scores` (Task 4), `SlimeColors.DEFAULTS`
- Produces (purs, testés) :
  - `Atelier.buildPages(view, tiers) → [{kind:'golden'|'tier', index?, color?, open, lines:[{name, time?}], total}]` — page dorée d'abord (top 10 score, `lines.name` seul), puis une page par palier : ouverte → top 10 `{name, time}` + `total` ; fermée → `open:false`, lines vides, **color null** (couleur masquée)
  - `Atelier.jarFill(entriesTop, cap) → {shown:[names…≤8], extra:N}` (top 8 par temps + « +N »)
  - `Atelier.fmtTime(sec) → 'm:ss'` (95 → '1:35')
  - `Atelier.shelfPos(i, count, W, H) → {x, y}` (6 étagères réparties verticalement, zone meuble = moitié gauche)

- [ ] **Step 1: Write the failing test** (harnais `new Function`) :

```js
// fmtTime : 0 -> '0:00', 95 -> '1:35', 600 -> '10:00'
// buildPages avec view {golden:[2], tiers:[…6]} -> 7 pages, dorée en tête ;
//   palier fermé -> open:false, color:null, lines:[] (la vue publique n'expose
//   aucun top pour un palier fermé)
// jarFill : 12 entrées -> shown 8, extra 4 ; 3 entrées -> shown 3, extra 0
// shelfPos(0..5, 6, 960, 540) -> y strictement croissant, x constant
```

- [ ] **Step 2: Run** `node tools/atelier_test.mjs` → FAIL
- [ ] **Step 3: Implement** les 4 fonctions + `atelier.html` minimal (canvas plein écran + bouton retour).
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `git commit -m "feat(atelier): logique pure — pages du livre, remplissage bocaux, temps, étagères"`

### Task 8: Atelier — scène, rendu, zoom/pan, polling

**Files:**
- Modify: `js/atelier.js` (partie rendu), `atelier.html`, `css/style.css`
- Modify: `index.html` (bouton « L'ATELIER »), `js/i18n.js`
- Test: relance `node tools/atelier_test.mjs` (les purs doivent rester verts)

**Interfaces:**
- Consumes: `Atelier.*` (Task 7), `SlimeColors.load()/recolor()` (recolor runtime existant), assets `ASSETS/atelier/*.png` avec **fallback procédural** si absent (dessiner bocaux/livre en rects — le jeu doit être jouable/testable sans l'art final)

- [ ] **Step 1: Implement le rendu** — au chargement : fetch `GET /api/scores` + `GET /api/state` (tiers → couleurs), recolorer chaque slime de tier **une fois** en canvas offscreen ; boucle de dessin : fond + meuble + 6 bocaux (plein si ouvert : slimes `jarFill` sur `plate` + « +N » si extra ; vide → `jar_empty` neutre) + livre ouvert montrant `buildPages[currentPage]` (colonne position 1-10 dessinée, pseudo, temps `fmtTime` si page palier ; page dorée = fond doré) ; polling 2 s → si `publicView` change, re-render (re-recoloration seulement si tiers changé).
- [ ] **Step 2: Implement navigation** — molette/pince zoom 0,5×–6× centré curseur, glisser = pan, double-clic = vue entière ; boutons ‹ › sur le livre (hit-tests 44 px min, tactile) ; **ton slime pulse** (opacité 0,85→1 sinus 1 Hz — un seul sprite, règle perf) ; hors ligne : `catch` fetch → scène + message i18n `offline`.
- [ ] **Step 3: Vérifier** `node tools/atelier_test.mjs` PASS ; manuellement avec `node server.mjs` : soumettre 2–3 scores de test via `curl`, valider en admin, voir les bocaux se remplir en ~2 s sans action.
- [ ] **Step 4: Perf check** — `?prof` n'existe pas sur l'atelier : vérifier à la main sur mobile que pan/zoom reste fluide (un seul redraw par frame d'interaction), aucune recoloration en boucle.
- [ ] **Step 5: Commit** `git commit -m "feat(atelier): scène zoomable, bocaux par palier, livre à pages, polling live"`

### Task 9: Modération éditeur + intégration finale + README

**Files:**
- Modify: `editor.html`, `js/editor.js` (nouvel onglet ATELIER), `js/i18n.js`, `index.html`, `play.html`, `atelier.html` (`?v=`), `README.md`
- Test: `node tools/editor_dom_test.mjs` (étendu), tous les tests

**Interfaces:**
- Consumes: `/api/admin/pending|validate|delete` (Task 4), clé éditeur existante (en-tête `X-Slime-Key`)

- [ ] **Step 1: Onglet ATELIER éditeur** — liste des pendings groupées par palier (✅ valider / 🗑 supprimer), liste par palier ouvert avec 🗑 ; sans serveur : note « atelier disponible en ligne ». Étendre `tools/editor_dom_test.mjs` : rendu de l'onglet avec un pending factice, clic valider → appel POST attendu (fetch factice).
- [ ] **Step 2: Intégration** — bouton « L'ATELIER » à l'écran titre (sous EDITEUR, `atelier.html`) ; **sync des paliers** : l'éditeur inclut désormais `slime_tiers` (config de l'onglet COULEURS) dans le `layout` poussé à `PUT /api/state` — c'est ce qui alimente le recalcul serveur et les couleurs de l'atelier ; vérifier les `?v=` de chaque script modifié dans `index.html`, `play.html`, `atelier.html`, `editor.html`.
- [ ] **Step 3: README** — section « L'Atelier des bocaux » (concept, API 5 endpoints, modération, assets `ASSETS/atelier/`), liste des tests mise à jour (`server_test`, `scores_test`, `scores_http_test`, `player_test`, `tiertime_test`, `atelier_test`).
- [ ] **Step 4: Run ALL** — `node tools/server_test.mjs && node tools/scores_test.mjs && node tools/scores_http_test.mjs && node tools/player_test.mjs && node tools/tiertime_test.mjs && node tools/atelier_test.mjs && node tools/editor_dom_test.mjs && node tools/smoke_test.mjs && node tools/game_sim.mjs && node tools/music_test.mjs && node tools/sprites_test.mjs` → tout PASS
- [ ] **Step 5: Commit** `git commit -m "feat: modération atelier dans l'éditeur + intégration titre/jeu + README"`

---

## Phase 2 (plan séparé, non couvert ici)

Replays des runs classés : RNG seedé pour la sélection de patterns (`js/patterns.js` utilise `Math.random()` l.356 — à remplacer par un PRNG seedé), enregistrement des entrées (press/move/release + tick), upload avec le score des 10 top, lecture dans l'atelier. À spécifier après la mise en production de la phase 1.
