# Spec — Progression « découverte & difficulté » + défauts au feeling validé

Date : 2026-09-29 · Statut : validée en brainstorming (design + 6 décisions)

## Objectif

Chaque run apprend le jeu : les premières minutes ne font découvrir que les
mouvements de base (saut visé, coyote, visée du double saut assistée par le
slow-mo long), puis les 9 types de plateformes apparaissent **un à un, dans des
contextes faciles**, et la difficulté monte en continu sur les 9 min (3 BGM).
La courbe s'applique aussi aux pools personnalisés (garde runtime), et les
réglages PHYS/POWER actuellement en production (data/pool.json) deviennent les
défauts du code.

## Décisions validées

1. Progression **dans la run** (roguelike), aucune méta-progression.
2. Découverte par **pool pédagogique** (pas de séquence tutorielle forcée, pas
   d'UI/toast).
3. Difficulté pilotée par le **temps seulement** (poids + caméra existants).
4. La garde de déblocage est **universelle** : elle filtre aussi les pools
   éditeur/LAN.
5. **Tout le layout actuel** (phys, powers, walls, plat, view) devient défaut
   du code.
6. data/pool.json : patterns **remplacés** par le nouveau pool ; le pattern
   custom « T1-5 » est abandonné.
7. Budget de génération/validation **conservateur : 1 double saut par chaîne**
   (DJ_PER_CHAIN inchangé). Le nouveau feeling (2 charges, recharge 0,5 s)
   donne de la marge en jeu sans changer le contrat des patterns.
8. **Nouveau seed** de régénération ; 6 patterns par tier (30 au total).

## 1. Courbe de découverte

| Tier | Fenêtre | Nouveaux types | Apprentissage |
|---|---|---|---|
| T1 | 0–90 s | basic, dynamic (doux) | saut visé, coyote, rythme |
| T2 | 90–210 s | crumble (90 s), phase (120 s) | timing |
| T3 | 210–330 s | sticky (210 s), turbo (240 s) | contrôle |
| T4 | 330–450 s | bouncy (330 s), seesaw (360 s) | lancements |
| T5 | 450 s+ | gold (420 s) + mélanges durs | risque/récompense |

## 2. Garde universelle (js/patterns.js)

- Table `UNLOCK_T = { basic: 0, dynamic: 0, crumble: 90, phase: 120,
  sticky: 210, turbo: 240, bouncy: 330, seesaw: 360, gold: 420 }` (l'alias
  legacy `ghost` compte comme `phase`).
- Dans `weights()` : un pattern dont **au moins une** plateforme a un type de
  `UNLOCK_T > elapsed` voit son poids à 0.
- `spawnSection()` : si le poids total éligible est 0 (petit pool 100 %
  exotique), recalcul **sans garde** — jamais une chaîne de plateformes de
  sécurité.
- `pinned` (mode test `?pattern=`) : bypass total de la garde.
- `W0` passe de `[100, 26, 6, 0, 0]` à `[120, 20, 0, 0, 0]` (démarrage pur
  T1) ; `W1` inchangé. La caméra reste le moteur continu (CAM_PALIER_S).

## 3. Pool par défaut (tools/gen-core.js → js/patterns-defaults.js)

- **Palettes par tier** = la table ci-dessus (un tier ne tire que ses types +
  les précédents). Les seuils temporels internes de l'ancien générateur
  (`simElapsed > N`) disparaissent au profit des palettes.
- **Vitrines** : pour chaque nouveau type, au moins un pattern du tier où il
  apparaît isolé, large (3–4 cells), sans piques, entouré de basic, gaps
  courts, billes en guide de trajectoire.
- Ramp intra-tier : gaps et fréquence des piques croissants en fin de tier,
  largeurs plus étroites en T4/T5.
- Régénération : `node tools/gen_defaults.mjs 6 20260930` (seed figé pour la
  reproductibilité) — **après** la cuisson des nouveaux défauts PHYS (la
  validation doit simuler avec le feeling final : slimeR 11, stickyMul 0.8,
  vmin/vmax 170/380…).

## 4. Défauts du layout = feeling actuel

### js/physics.js — PHYS_DEF

| Clé | Nouveau défaut | Ancien |
|---|---|---|
| slimeR | 11 | 14 |
| vmin / vmax | 170 / 380 | 210 / 360 |
| aimMin / aimMax | 30 / 90 | 24 / 140 |
| stickyMul | 0.8 | 1.15 |
| hurtRecoil | 0.8 | 1 |
| coyote | 0.07 | 0.08 |
| camBase / camMax | 35 / 400 | 80 / 240 |

Inchangés : grav 620, fallMax 520, dragAir 0.6, bounceVy/Vx 400/140, invuln
1.3, camRampDur 540. La migration des anciens saves caméra (40/120) doit
pointer vers les nouveaux défauts (35/400).

### js/patterns.js — POWERS_DEF, murs

| Pouvoir | Nouveau défaut | Ancien |
|---|---|---|
| doubleJump cooldown / charges / powerMul | 0.5 / 2 / 1.15 | 4 / 1 / 1 |
| slowmo scale / duration | 0.05 / 2 | 0.35 / 0.6 |
| ledge window / pullT | 5 / 0.3 | 8 / 0.6 |

Murs latéraux par défaut : **4 / 4** (au lieu de TIP_L=11 / SPIKE_W=14) —
unifiés dans physics.js (`WALL_DEF`) et consommés par patterns.js, game.js et
editor.js. `DEFAULT_PLAT` et `VIEW_DEF` sont déjà conformes.

### js/editor.js — sliders

Invariant respecté : chaque slider PHYS recentré sur son nouveau défaut (plage
élargie si la valeur en sortait). POWER : le slider « Durée » du slow-mo passe
de 0.2–1 à **0.2–2** (le défaut 2 s en sortait). Vérifier que chaque défaut
reste atteignable au pas du slider.

## 5. Remplacement du pool LAN (poolTag)

Problème : la fusion locale « rien n'est perdu » (mergeRemoteUnion) ferait
ressortir les 21 anciens patterns depuis le cache localStorage des appareils,
et le PUT du serveur ne whiteliste que `format/patterns/layout`.

Mécanique légère :
- `data/pool.json` : `state.poolTag` (chaîne, ex. `"gen-2026-pedago"`),
  whitelisté dans server.mjs (PUT + état initial du fichier, rev incrémentée).
- patterns.js : au pull (`lanPull`, `resolveConflict`), si le `poolTag`
  distant diffère du tag miroir (`localStorage 'slime_pool_tag'`), on installe
  l'état distant **sans fusion** (les patterns locaux absents du distant sont
  abandonnés — c'est le remplacement voulu) puis on stocke le tag. Tag
  identique → comportement actuel (union, rien n'est perdu) : les créations
  d'éditeur postérieures au remplacement sont préservées. Trade-off assumé :
  un appareil resté hors ligne pendant le remplacement, qui aurait créé des
  patterns entre-temps, les perd au premier pull (appareils concernés = les
  machines du créateur).

## 6. Tests & régression

- Nouveaux checks (tools, Node) sur le pool par défaut : (a) pour chaque
  seconde 0→540, l'ensemble éligible n'est jamais vide ; (b) aucun pattern
  éligible ne contient un type avant son UNLOCK_T ; (c) chaque nouveau type
  possède sa vitrine ; (d) chaque pattern du pool reste valide
  (validatePatternJumps).
- Suite Node complète (README « Tests de régression ») au verte.
- Cache-busting : bump `?v=` de physics.js, patterns.js, patterns-defaults.js
  dans play.html ; editor.js dans editor.html (+ scripts partagés).

## 7. Fichiers touchés

`js/physics.js`, `js/patterns.js`, `js/editor.js`, `tools/gen-core.js`,
`js/patterns-defaults.js` (régénéré), `server.mjs` (poolTag),
`data/pool.json` (régénéré), `play.html`, `editor.html`, `README.md`,
`tools/smoke_test.mjs` ou nouveau `tools/progression_test.mjs`.

## 8. Hors périmètre

Toast/UI de découverte, méta-progression, format d'export/import (le poolTag
ne part pas dans les exports patterns-seuls), PHYS/caméra au-delà des défauts,
extension du simulateur multi-double-saut.
