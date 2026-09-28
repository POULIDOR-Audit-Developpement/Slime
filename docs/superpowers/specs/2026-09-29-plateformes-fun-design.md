# Spec — Ravalement des plateformes : plus fun, moins punitif

Date : 2026-09-29 · Projet : Slime · Statut : design validé en conversation, à implémenter

## 1. Contexte et objectifs

Le jeu compte 6 types de plateformes (`js/patterns.js` ligne 10) jugés peu fun :

- **trop punitifs** : collante (saut ×0.8), dynamique (timer 4 s), éphémère (1 usage) ;
- **peu de feedback** : atterrir ne se sent pas ;
- **anecdotiques** : aucun moment mémorable, aucune expression de skill.

**Objectif** : rework des 6 types + 3 nouveaux types, selon la règle de design :

> Une plateforme ne punit jamais le joueur, elle lui propose un choix.

Chaque type doit avoir (1) une identité positive, (2) un feedback visible/sonore
propre, (3) une opportunité de skill.

**Contraintes** : perf mobile non négociable (AGENTS.md), génération par patterns
conservée, éditeur et tests à jour, README synchronisé, compatibilité des anciens
patterns (alias `ghost`).

## 2. Juice universel (toutes plateformes)

À chaque atterrissage : squash & stretch du slime (échelle Y 0.8 → 1 en ~120 ms),
particules de poussière aux pieds, SFX d'atterrissage distinct par type (zzfx),
micro screenshake (~2 px) si impact rapide (`vy` > ~600).

Implémentation : particules existantes (cf. `killPlat`, `js/game.js` 327-335),
transform canvas pour le squash. Aucun travail lourd par frame.

## 3. Rework des 6 types existants

| Type | Avant | Après |
|---|---|---|
| 🟢 Basique | Neutre | Inchangé mécaniquement + juice universel. Le « repos » |
| 🟤 Collante | `jumpMul` ×0.8 | **Catapulte lente** : saut suivant chargé **×1.15** (`STICKY_MUL` 0.8 → 1.15) + friction forte (pas de glisse). Identité : on y prépare un gros saut |
| 🔵 Dynamique | Oscillation + mort à `dynLife` 4 s | **Timer supprimé** (`dynLife` retiré, overrides ignorés). Oscillation conservée ; **boost rythme** : sauter pendant que la plateforme monte → `vy` ×1.15 + effet visuel. Identité : un rythme à surfer |
| ⚪ Cassable | Fissure 0.5 s puis casse | `CRUMBLE_T` 0.5 → **0.8 s** ; télégraphie à 50 % restants (fissures visibles + tremblement + SFX crack) ; casse = particules + SFX |
| 👻 Éphémère | 1 seul usage, disparaît | **Remplacée par la Phasante** (voir §4.1) — le « 1 usage » disparaît |
| 🟠 Rebondissante | Rebond fixe (`BOUNCE_VY` 400) | **Combo** : rebonds consécutifs (sans toucher un autre sol) → `BOUNCE_VY` ×1.12 par maillon, **cap ×1.5**. SFX de plus en plus aigu + particules croissantes. Chaîne remise à zéro au premier atterrissage non-rebond |

Note de validation : le « pit-stop recharge les sauts aériens » envisagé pour la
collante est **abandonné** — `land()` recharge déjà tous les sauts aériens
(`js/game.js` ~497), c'était redondant.

## 4. Nouveaux types (3)

Identifiants : `'turbo'`, `'gold'`, `'seesaw'`. Liste `TYPES` mise à jour :
`['basic','sticky','dynamic','crumble','phase','bouncy','turbo','gold','seesaw']`.

### 4.1 Phasante (`phase`, remplace `ghost`)
- Cycle sinusoïdal `PHASE_CYCLE = 2.0 s`, **solide ≥ 60 %** du cycle (`PHASE_SOLID = 0.6`).
- Solide : rendu normale (`tileGhost`, alpha lié à la phase). Traversable : alpha ~0.25,
  contour discret, **exclue de la boucle de collision** (one-way test ignoré).
- Si le joueur est dessus au moment du passage en traversable → il tombe (pas de dégât) :
  c'est le skill de timing. Aucune destruction, on peut toujours attendre.
- Compat : `validatePattern`/`instantiate` acceptent `'ghost'` en alias → `'phase'`.

### 4.2 Turbo (`turbo`)
- Chevrons orientés. En **quittant** la plateforme (saut ou bord) : `vx` courant
  **×1.5**, borné [180, `maxVx`×1.5] (`TURBO_VX`, `TURBO_MIN`).
- Feedback : lignes de vitesse derrière le slime tant que le boost est actif ;
  SFX « whoosh ».
- Validation d'atteignabilité : traitée comme `basic` (le boost ne fait
  qu'augmenter la portée → conservateur-safe).

### 4.3 Dorée (`gold`)
- Rare (2-3 %), petite (1-2 cases), scintille (particules périodiques légères à
  l'arrêt — pas par frame sur toutes les dorées : seulement les visibles, via le
  mécanisme existant de marquage de dessin).
- Atterrissage : **+1 saut aérien** (utilisable immédiatement) actif **10 s**
  (`GOLD_AIRJUMP_T`), traînée dorée pendant le buff, burst d'étincelles, SFX.
- Validation : comme `basic`.

### 4.4 Bascule (`seesaw`)
- See-saw : atterrir à gauche/droite incline la plateforme (~±12°, visuel) de ce côté ;
  le saut suivant part **dans la direction opposée** à l'inclinaison :
  `vx = ±BASCULE_VX (200)` + énergie famille rebond (`vy = BOUNCE_VY ×0.9`),
  puis retour au neutre.
- Collision : plate one-way classique (l'inclinaison est purement visuelle, avec
  léger décalage Y du sprite) — simplicité et lisibilité.
- Validation : famille `bounce` (`canReachBounce`), énergie ≤ rebond.

## 5. Physique et atteignabilité

`js/physics.js` — nouvelles constantes :
`STICKY_MUL 1.15`, `CRUMBLE_T 0.8`, `PHASE_CYCLE 2.0`, `PHASE_SOLID 0.6`,
`TURBO_VX 1.5`, `TURBO_MIN 180`, `GOLD_AIRJUMP_T 10`, `BASCULE_VX 200`,
`BASCULE_VY_MUL 0.9`, `COMBO_STEP 1.12`, `COMBO_MAX 1.5`,
`RHYTHM_MUL 1.15` (dynamique), `JUICE` (squash/shake) si paramétrable.

Mapping validation (`validateInstance`/`jumpOk`, `js/patterns.js` 231-300) :
`phase`/`turbo`/`gold` → `basic` ; `seesaw` → `bounce`. Tous les reworks étant
plus permissants qu'avant, le pool existant reste atteignable ; le pool est
régénéré de toute façon (§6).

## 6. Génération

Poids proposés (affinables au playtest) dans `tools/gen_defaults.mjs` /
`tools/gen-core.js`, puis régénération de `js/patterns-defaults.js` :

basic 30 %, dynamic 12 %, crumble 11 %, sticky 8 %, phase 9 %, bouncy 10 %,
turbo 8 %, seesaw 6 %, gold 2-3 %, basic+pics ~4 %.

Règles : `gold` limitée à ~1 par section au maximum ; `seesaw` jamais en
dernière plateforme avant un mur (sinon propusion vers le mur) ; `phase`
jamais plus de 2 consécutives (lisibilité du rythme).

## 7. Rendu et perf (`js/game.js` `drawPlat` 1151-1244, `js/sprites.js`)

- Nouveaux sprites **statiques** : `tileTurbo`, `tileGold`, `tileSeesaw`
  (PNG dans `ASSETS/sprites/game/`, déclarations `js/sprites.js` 13-19).
  **Aucun ajout à `VARIANT_BASES`** → zéro recoloration runtime.
- `phase` : réutilise `tileGhost`, alpha piloté par la phase (remplace le pulse
  décoratif actuel).
- `seesaw` : un `ctx.rotate` au dessin + décalage Y — coût négligeable.
- `gold` : scintillement par particules existantes, à l'atterrissage/visibilité
  seulement.
- Fallback procédural vectoriel étendu aux 9 types (mode sans sprites).
- Bump `?v=` dans `play.html` pour chaque `js/*.js` modifié.

## 8. Éditeur (`js/editor.js`)

- Touches **1-9** (au lieu de 1-6), `TYPE_LABEL` FR : Basique, Collante,
  Dynamique, Cassable, Phasante, Rebondissante, Turbo, Dorée, Bascule.
- Panneau propriétés : `crumbleT` conservé ; `dynLife` retiré (champ ignoré à
  la validation pour compat) ; nouvelles props optionnelles par plateforme si
  pertinent (`amp`/`spd` déjà génériques pour `dynamic`).
- Preview des 9 types (`js/editor.js` 180-235) alignée sur le nouveau rendu.

## 9. SFX (`js/music.js`)

Un SFX d'atterrissage par type (zzfx) + sons dédiés : crack (cassable), whoosh
(turbo), jingle court (dorée), tic rythmé léger (dynamique, discret). Le toggle
musique coupe aussi les SFX (comportement existant conservé). Création
paresseuelle des `<audio>` conservée.

## 10. Tests et doc

- `tools/sprites_test.mjs` : doit rester vert (les checks « tick : seule la
  variante dessinée est refaite » ne changent pas — aucun ajout à
  `VARIANT_BASES`).
- Tests Node de régression (README « Tests de régression »), nouveaux checks :
  - `phase` : bloque quand solide, laisse passer quand traversable (timé) ;
  - `sticky` : `jumpMul` 1.15 + friction appliquée ;
  - `dynamic` : plus aucun kill par timer ; boost si saut en montée ;
  - `crumble` : casse à 0.8 s, flag télégraphe à 0.4 s ;
  - `bouncy` : combo multiplie et cappe à ×1.5, reset hors chaîne ;
  - `turbo` : amplification `vx` au départ, bornes respectées ;
  - `gold` : +1 saut aérien, expiration à 10 s ;
  - `seesaw` : inclinaison selon le côté, lancement opposé, énergie ≤ rebond ;
  - alias `'ghost'` → `'phase'` accepté par `validatePattern` ;
  - pool régénéré : `jumpOk`/`validateInstance` 100 % verts.
- README : tableau « Types de plateformes » (lignes 71-81) mis à jour pour 9
  types + réglages PHYS (§132) actualisés.

## 11. Critères de succès

1. Tous les tests Node verts, y compris nouveaux checks.
2. `?prof` sur mobile cible : draw < 10 ms typique avant/après (aucune régression).
3. Aucune plateforme restante à mécanique purement punitive.
4. Chaque type a SFX + signature visuelle distincte et un intérêt en jeu.
5. Anciens patterns chargent sans erreur (alias `ghost`).
6. Éditeur utilisable au clavier 1-9 avec preview juste.

## 12. Hors scope (YAGNI)

Système de combos inter-plateformes, progression de difficulté globale,
téléporteuses, mutantes, plateformes cachées, scoring refiné.
