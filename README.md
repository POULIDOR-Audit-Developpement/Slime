# SLIME

Endless runner rétro pixel-art : guide un slime le plus loin possible alors que la caméra accélère sans pitié.

## Jouer

Ouvrir `index.html` dans un navigateur — c'est tout.

### Structure du projet

```
index.html              ← page hôte (charge les scripts)
editor.html             ← ÉDITEUR : patterns + vue principale (autonome)
css/style.css           ← styles de la page
js/game.js              ← moteur du jeu (rendu, physique, enchaînement des patterns)
js/physics.js           ← constantes + simulation de saut partagée (jeu, éditeur, outils)
js/patterns.js          ← pool de patterns, poids par difficulté, stockage, export/import
js/patterns-defaults.js ← pool par défaut GÉNÉRÉ (20 sections validées) — ne pas éditer
js/music.js             ← musique chiptune procédurale (module Music)
js/crypto.js            ← signature HMAC des scores (module Crypto)
js/sprites.js           ← chargement et dessin des sprites du slime
vendor/                 ← litecanvas embarqué (fallback CDN inclus)
ASSETS/                 ← direction artistique + sprites
tools/                  ← générateur de pool (gen_defaults.mjs, gen-core.js, gen_default_pool.html) + extraction des sprites (Python)
decode.html             ← outil créateur : vérifier les codes (autonome)
docs/                   ← spécifications de design + aperçus (docs/previews/)
```

### Rendu et sprites

Rendu natif 960×540 avec logique interne en coordonnées virtuelles 480×270 (zoom ×2) : style « gros pixels » dans les formes, texte et HTML nets. Le slime utilise les sprites de la feuille fournie (`ASSETS/sprites/game/`) : idle animé, saut, chute, atterrissage, blessure, splat de mort et 3 tailles de vie ; fallback procédural si les images manquent. Le fond bleu à panneaux, les tuiles cerclées de noir, les bordures de bedrock (texture `void`) et la jauge de vitesse à aiguille reprennent la direction artistique. La vie se lit sur 3 têtes de slime en bas à gauche.

### Contrôles (PC & mobile)

- **Maintenir** clic / appui tactile : charge la puissance du saut
- **Bouger le curseur** pendant l'appui : vise la trajectoire **dans n'importe quelle direction** — même en arrière pour aller chercher les billes dorées (au risque de te faire rattraper !)
- **Relâcher** : sauter
- **M** ou l'icône son (coin haut-gauche) : couper/réactiver le son
- La **couleur du slime = ta vie** : vert → orange → rouge à chaque coup des pics, à rouge fatigué un dernier coup et c'est fini
- Les piques du haut, de gauche et de droite font mal — ne tombe pas dans le vide
- Les billes rapportent des points (score caché !), la **bille dorée vaut 50** — elle est toujours au bout d'un détour risqué

### Types de plateformes

| Couleur | Type | Effet |
|---|---|---|
| Verte | Basique | Standard (parfois des pics rouges dessus) |
| Brune | Collante | Affaiblit ton prochain saut (×0.8) |
| Bleue (horloges) | Dynamique | Monte et descend — se désintègre 4 s après le premier contact (clignote en rouge pour prévenir) |
| Grise fissurée | Cassable | Se casse 0,5 s après l'atterrissage |
| Blanche translucide | Éphémère | Disparaît dès que tu la quittes |
| Orange à chevrons | Rebondissante | Te relance automatiquement vers le haut |
| Pics rouges | Danger | Perte de taille au contact |

### Musique & record

- Boucle chiptune de 8 mesures (128 pas, progression Am–F–C–G, refrain une octave plus haut) dont le tempo suit la vitesse de la caméra (112 → 150 BPM) — ~15 s par boucle
- Meilleur score sauvegardé localement, affiché à l'écran titre ; un « NOUVEAU RECORD ! » (sans le chiffre) signale quand tu bats le mien

## Éditeur & patterns (créateur de jeu)

Ouvrir **`editor.html`** — tout est sauvegardé en `localStorage` (clé `slime_patterns_v1`) et appliqué au jeu immédiatement.

### Onglet PATTERNS
- Chaque pattern est une **section** de plateformes/billes/murs/décor en coordonnées relatives, avec une **ligne d'entrée** (l'ancre verte : d'où le slime saute en arrivant) et une **difficulté T1→T5**
- Outils : flèche (déplacer), plateforme (touches **1-6** = type, **+/-** = largeur), **mur vertical (W)** : colonne au sol ou stalactite au plafond, largeur 1-3, **flancs piqués optionnels** (mortels) — le sommet d'une colonne est toujours atterrissable, bille, bille or, décor, gomme ; **Suppr** efface, **flèches** ajustent au pixel
- **Validation en direct** : la même physique que le jeu (`js/physics.js`) simule chaque saut — ✓ vert = faisable, ✗ rouge = impossible ; un saut qui traverse le corps d'un mur est invalidé, sauter **sur** le sommet d'une colonne reste valide. Un pattern avec des ✗ ne bloque pas le jeu (il est juste joué tel quel, prudence !)
- **▶ Playtest** : ouvre le jeu en boucle sur ce pattern seul (`index.html?pattern=<code>`, bannière « TEST » en haut)

### Onglet VUE
- Cadre affiché **fidèlement** comme en jeu (bandes de bedrock, piques alignées sur les hitboxes, zone de chute hachurée sous l'écran)
- Hitboxes des murs de damage (plafond / gauche / droite) : glisse les poignées dorées ou les curseurs — appliqué au jeu en direct, les piques suivent automatiquement
- Placement des assets décoratifs (sprites de `ASSETS/sprites/game/`), posés derrière les plateformes en jeu

### Difficulté & pool
- Le jeu pioche dans le pool selon une **courbe de poids** : T1 domine au début, les tiers durs prennent le dessus vers 120 s ; anti-répétition immédiate ; chaque enchaînement est revalidé, avec plateforme de secours si rien ne passe
- **Ton pool remplace le pool par défaut dès qu'il contient au moins 1 pattern** (sinon le jeu joue les 20 sections embarquées) ; bouton « Pool par défaut » pour les copier et les éditer

### Portabilité (autre machine)
- **Exporter .json** / **Importer .json** (ou glisser-déposer) : toutes tes créations + le layout de vue
- **Copier code / Coller code** : même contenu en code compact `SLIME1.…` à passer de machine en machine
- Le jeu lit le même `localStorage` que l'éditeur : importer suffit à changer le contenu du jeu

### Régénérer le pool par défaut
```bash
node tools/gen_defaults.mjs [sections par tier] [graine]   # réécrit js/patterns-defaults.js
```
ou visuellement : `tools/gen_default_pool.html` (aperçu validé saut par saut, export, « Installer dans mes patterns »).

## Scores sécurisés (côté créateur)

À la mort, le jeu génère un code signé en HMAC-SHA256 — le score n'est jamais affiché. Le **temps de jeu** est affiché à l'écran de fin et signé dans le code : `decode.html` le restitue pour croiser les deux et détecter toute triche. L'écran de fin propose un bouton **COPIER LE CODE** (presse-papiers) et un bouton **REJOUER**.
Pour vérifier un code : ouvrir `decode.html` et coller le code.

Pour changer la clé secrète : modifier la constante `SECRET` (dans `js/crypto.js` **et** `decode.html`).

## Tech

- Moteur : [Litecanvas](https://litecanvas.js.org) v0.302.0 via CDN jsDelivr (fallback unpkg)
- Canvas plein écran adaptatif : le terrain reste en coordonnées 480×270 (zoom auto), les bords se prolongent en cadre de bedrock — aucune bande vide
- Piques muraux gauche/haut/droite paramétrables (onglet VUE de l'éditeur), sprites du slime fournis avec variantes de dégâts (vert/orange/rouge)
- Génération **100 % patterns** : pool embarqué (généré puis validé par simulation physique de chaque saut) ou pool du créateur — `js/physics.js` garantit l'atteignabilité au chaînage
- SHA-256 + HMAC embarqués (fonctionne hors-ligne, sans dépendance)
- Test de régression : `node tools/smoke_test.mjs`
