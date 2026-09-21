# SLIME

Endless runner rétro pixel-art : guide un slime le plus loin possible alors que la caméra accélère sans pitié.

## Jouer

Ouvrir `index.html` dans un navigateur — c'est tout.

### Structure du projet

```
index.html        ← page hôte (charge les scripts)
css/style.css     ← styles de la page
js/game.js        ← moteur du jeu (rendu, physique, génération)
js/music.js       ← musique chiptune procédurale (module Music)
js/crypto.js      ← signature HMAC des scores (module Crypto)
js/sprites.js     ← chargement et dessin des sprites du slime
vendor/           ← litecanvas embarqué (fallback CDN inclus)
ASSETS/           ← direction artistique + sprites
tools/            ← scripts d'extraction des sprites (Python)
decode.html       ← outil créateur : vérifier les codes (autonome)
docs/             ← spécifications de design
```

### Rendu et sprites

Rendu natif 960×540 avec logique interne en coordonnées virtuelles 480×270 (zoom ×2) : style « gros pixels » dans les formes, texte et HTML nets. Le slime utilise les sprites de la feuille fournie (`ASSETS/sprites/game/`) : idle animé, saut, chute, atterrissage, blessure, splat de mort et 3 tailles de vie ; fallback procédural si les images manquent. Le fond bleu à panneaux, les tuiles cerclées de noir, les bordures en damier et la jauge de vitesse reprennent la direction artistique.

### Contrôles (PC & mobile)

- **Maintenir** clic / appui tactile : charge la puissance du saut
- **Bouger le curseur** pendant l'appui : vise la trajectoire **dans n'importe quelle direction** — même en arrière pour aller chercher les billes dorées (au risque de te faire rattraper !)
- **Relâcher** : sauter
- **M** ou l'icône son (coin haut-gauche) : couper/réactiver le son
- La **couleur du slime = ta vie** : vert → orange → rouge à chaque coup des pics, à rouge fatigué un dernier coup et c'est fini
- Ne te fais pas rattraper par le bord gauche, ne tombe pas dans le vide
- Le mur de pics à droite t'empêche de dépasser la caméra
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

## Scores sécurisés (côté créateur)

À la mort, le jeu génère un code signé en HMAC-SHA256 — le score n'est jamais affiché.
Pour vérifier un code : ouvrir `decode.html` et coller le code.

Pour changer la clé secrète : modifier la constante `SECRET` (dans `js/crypto.js` **et** `decode.html`).

## Tech

- Moteur : [Litecanvas](https://litecanvas.js.org) v0.302.0 via CDN jsDelivr (fallback unpkg)
- Canvas plein écran adaptatif : le terrain reste en coordonnées 480×270 (zoom auto), les bords se prolongent en cadre damier — aucune bande vide
- Piques muraux gauche/haut/droite, sprites du slime fournis avec variantes de dégâts (vert/orange/rouge)
- Génération procédurale avec garantie d'atteignabilité (simulation physique de chaque saut)
- SHA-256 + HMAC embarqués (fonctionne hors-ligne, sans dépendance)
