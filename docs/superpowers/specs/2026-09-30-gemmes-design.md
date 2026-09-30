# Gemmes — high risk high reward (design)

Date : 2026-09-30 · Statut : spec validée en conversation, en attente de relecture

## Problème et objectif

Le score actuel ne récompense que la prise de risque *indirecte* (survivre plus
vite/plus loin). Il n'existe pas de choix explicite « je risque ma vie pour des
points ». Objectif : ajouter un collectible très rentable, la **gemme (250 pts)**,
placé dans des zones mortelles des patterns — le joueur choisit de s'écarter du
chemin sûr pour scorer, au risque de perdre des vies (voire la partie).

## Décisions validées

1. **Forme** : 4e type de bille (flag `gem`), auteuré dans les patterns via
   l'éditeur — comme l'or aujourd'hui. Pas de nouvelle plateforme, pas de
   déclencheur, pas de mécanisme physique nouveau.
2. **Risque** : trajet seul. La gemme est placée à côté de dangers (spikes,
   murs, vide, détours chronophages). La ramasser n'a aucun effet négatif.
3. **Valeur** : 250 pts (5× l'or, ≈ 6 s de course endgame à 40 pts/s) — le
   détour vaut le coup si on survit, ce qui pousse fort à la prise de risque.
4. **Apparition** : portée par la difficulté du pattern hôte, comme tout le
   pool. Cible : patterns **T3-T4** (crumble/phase/sticky/turbo, jouables dès
   ~3:30-4:00 — une run type de 5 min en croise) **+ quelques T5** endgame.
   Pas de garde temps spécifique (pas d'entrée UNLOCK_T : la garde de
   `typeUnlockOk` porte sur les types de plateformes du pattern, pas les billes).
5. **Anti-triche** : la gemme est comptée dans `theoPts` au spawn → le
   « Possible » de `decode.html` reste exact. **Aucun changement** crypto,
   format de code, decode.html, ranking.

## Spécification fonctionnelle

### Valeurs et scoring (js/game.js)

- Nouvelle constante `GEM_PTS = 250` (à côté de `GOLD_PTS`).
- Nouveau compteur `gemsCollected` (comme `goldsCollected`) : initialisé à 0
  dans `startGame()`, incrémenté à la collecte.
- `currentScore()` : ajouter `gemsCollected * GEM_PTS`.
- `theoPts` dans `spawnNext()` : `b.gem ? GEM_PTS : (b.gold ? GOLD_PTS : (b.life ? 30 : 10))`.
- **Priorité des flags** (une bille porte au plus un rôle effectif) :
  `gem` > `gold` > `life` > bille simple. La collecte et le dessin suivent
  cette priorité. Une gemme ne donne PAS le bonus de saut aérien de l'or
  (`goldT` reste exclusif à `b.gold`).

### Collecte (updBalls)

- Rayon de ramassage comme l'or (9) : `b.gem ? 9 : (b.gold || b.life ? 9 : 6)`.
- Branche `if (b.gem)` en tête de la chaîne (priorité ci-dessus) :
  `gemsCollected++`, sfx distinct (même famille que SFX_COIN, réglé à
  l'oreille pour être reconnaissable — départ : `sfx(SFX_COIN, 4, 0.8)` :
  volume fort, pitch grave), burst de particules plus gros que l'or
  (ex. 20 particules, couleur dédiée C_GEM cyan).

### Apparence (drawBall, vectoriel)

- Losange cyan (repo : `shape`/`line`/`circfill` litecanvas) ~9 px, contour
  noir, reflet blanc, halo pulsé comme l'or (`alpha` + `circ`). Scintillement
  lent (sin sur T) pour attirer l'œil.
- 100 % dessin vectoriel statique par frame — aucune régénération canvas,
  conforme aux règles perf du repo (AGENTS.md).

### Éditeur (js/editor.js)

- Nouvel outil **« Gemme »** dans la barre d'outils et la carte des raccourcis
  (`toolKeys`), touche proposée : `v` (libre). Aperçu curseur et dessin des
  billes existantes : losange cyan (même style que le jeu).
- Placement : `b = { x, row, yOff, gold: false, gem: true }` — l'outil bille
  simple force `gem: false`, l'outil or force `gem: false` (exclusivité mutuelle
  au placement).
- Panneau de propriétés bille : case à cocher **« gemme (250 pts) »** à côté de
  « bille dorée » ; cocher l'une décoche l'autre.
- Compteur d'objets du pattern (ligne « X billes ») inchangé (une gemme EST une
  bille).

### Format et compat (js/patterns.js)

- `instantiate()` : propager `gem: !!b.gem` à côté de `gold`/`life`.
- `validatePattern()` : **aucun changement** (la validation des billes vérifie
  déjà `x` seulement — le flag est optionnel). Format `slime-patterns@1`
  inchangé → compat arrière totale : vieux pools, exports, LAN et codes signés
  fonctionnent sans migration. Un vieil éditeur qui re-sérialise un pattern
  contenant des gemmes conserve le flag (clé JSON inconnue préservée).

### Pool par défaut (tools/gen-core.js + gen_defaults.mjs)

- Le générateur ne pose aujourd'hui que des billes simples. Ajouter un étage
  **`simSpawnGems`** appelé dans `simSpawnNext` après le placement des
  plateformes, pour les tiers 3-5 uniquement, seed-déterministe :
  - **T3** : ~1 pattern sur 3 porte 1 gemme ; **T4** : ~1 sur 3 porte 1-2
    gemmes ; **T5** : ~1 sur 2 porte 1-3 gemmes.
  - Spots mortels (au choix du RNG parmi ce que le pattern contient) :
    au ras d'une rangée de spikes, au sommet d'un mur `ground` (saut de
    timing serré), en hauteur au-dessus d'un gap (apex de saut — on saute
    « à travers » la gemme), ou sur la dernière plateforme haute du pattern
    (détour qui coûte du temps, la caméra continuant d'avancer).
  - Jamais plus d'une gemme par tranche de 6 cellules (lisibilité), jamais
    dans le chemin bas direct si aucun danger adjacent.
- Le seed est fixé : le résultat est déterministe et vérifié à la
  régénération. Garde du générateur : si un tier 3-5 ressort sans aucun
  pattern gemmé, on ajuste les parts (ou le seed) jusqu'à ≥ 1 par tier —
  le test smoke l'exige.
- Régénérer `js/patterns-defaults.js` (même seed par défaut) ; les stats du
  générateur affichent les gemmes par tier.

### Documents

- README : section scoring (gemme 250 pts), section éditeur (outil Gemme).

## Non-goals (assumés)

- Pas de déclencheur à la collecte, pas de « payer une vie », pas de nouveau
  type de plateforme, pas de détour procédural hors pool.
- Pas de champ de valeur générique (`v`) : un flag dédié aujourd'hui, YAGNI.
- Pas de garde UNLOCK_T spécifique aux gemmes.

## Fichiers touchés

| Fichier | Changement |
|---|---|
| `js/game.js` | `GEM_PTS`, `gemsCollected`, `currentScore`, `theoPts`, `updBalls`, `drawBall` |
| `js/patterns.js` | `instantiate` : propagation du flag `gem` |
| `js/editor.js` | outil Gemme, dessins, panneau propriétés, exclusivité or/gemme |
| `tools/gen-core.js` | `simSpawnGems` + intégration `simSpawnNext` |
| `js/patterns-defaults.js` | régénéré (seed inchangée) |
| `play.html`, `editor.html` | bump `?v=` des js modifiés |
| `README.md` | scoring + éditeur |
| tests (`tools/game_sim.mjs`, `tools/editor_dom_test.mjs`, `tools/smoke_test.mjs`) | cas gemmes |

## Tests (TDD)

1. **game_sim** : placer un pattern avec gemme, téléporter le slime sur la
   gemme → `gemsCollected === 1`, score += 250 ; `theoPts` compte une gemme à
   250 au spawn (étendre le check existant « theoPts = valeur des collectibles
   ajoutés ») ; une gemme ne pose pas `goldT` (pas de saut aérien bonus).
2. **editor_dom_test** : l'outil `gem` existe (raccourci `v`), place une bille
   `gem: true`, la case propriétés « gemme » coche/décoche et exclut l'or.
3. **smoke_test** : le pool régénéré passe la validation ; chaque tier 3-5 du
   pool par défaut contient au moins un pattern avec gemme ; aucun tier 1-2
   n'en contient.
4. **Suite complète verte** + bump `?v=` avant de conclure.

## Perf

Aucun nouveau canvas, aucune ressource animée : dessin vectoriel par frame
identique en coût aux billes/or existants. Le comptage theoPts est O(1) par
collectible spawné (déjà le cas).
