# SLIME

Endless runner rétro pixel-art : guide un slime le plus loin possible alors que la caméra accélère sans pitié.

## Jouer

Ouvrir `index.html` dans un navigateur — c'est tout. Le jeu est un fichier unique (HTML + CSS + JS).

### Contrôles (PC & mobile)

- **Maintenir** clic / appui tactile : charge la puissance du saut
- **Bouger le curseur** pendant l'appui : vise la trajectoire **dans n'importe quelle direction** — même en arrière pour aller chercher les billes dorées (au risque de te faire rattraper !)
- **Relâcher** : sauter
- **M** ou l'icône son (coin haut-gauche) : couper/réactiver le son
- La **taille du slime = ta vie** : les pics la réduisent, à zéro c'est fini
- Ne te fais pas rattraper par le bord gauche, ne tombe pas dans le vide
- Le mur de pics à droite t'empêche de dépasser la caméra
- Les billes rapportent des points (score caché !), la **bille dorée vaut 50** — elle est toujours au bout d'un détour risqué

### Types de plateformes

| Couleur | Type | Effet |
|---|---|---|
| Verte | Basique | Standard (parfois des pics rouges dessus) |
| Brune | Collante | Affaiblit ton prochain saut (×0.8) |
| Bleue | Dynamique | Monte et descend |
| Grise fissurée | Cassable | Se casse 0,5 s après l'atterrissage |
| Blanche translucide | Éphémère | Disparaît dès que tu la quittes |
| Orange à chevrons | Rebondissante | Te relance automatiquement vers le haut |
| Pics rouges | Danger | Perte de taille au contact |

### Musique & record

- Boucle chiptune procédurale dont le tempo suit la vitesse de la caméra (112 → 150 BPM)
- Meilleur score sauvegardé localement, affiché à l'écran titre ; un « NOUVEAU RECORD ! » (sans le chiffre) signale quand tu bats le mien

## Déploiement Netlify

1. Aller sur <https://app.netlify.com/drop>
2. Glisser-déposer **le dossier `slime/`** (celui qui contient `index.html`)
3. Le jeu est en ligne (HTTPS automatique)

Ou en CLI : `npx netlify-cli deploy --dir . --prod`

> Seul `index.html` doit être déployé. `decode.html` reste en local.

## Scores sécurisés (côté créateur)

À la mort, le jeu génère un code signé en HMAC-SHA256 — le score n'est jamais affiché.
Pour vérifier un code : ouvrir `decode.html` en local et coller le code.

Pour changer la clé secrète : modifier la constante `SECRET` (identique dans `index.html` **et** `decode.html`).

## Tech

- Moteur : [Litecanvas](https://litecanvas.js.org) v0.302.0 via CDN jsDelivr (~4 KB)
- Rendu 480×270 upscalé, pixel art 100 % procédural (zéro asset)
- Génération procédurale avec garantie d'atteignabilité (simulation physique de chaque saut)
- SHA-256 + HMAC embarqués (fonctionne hors-ligne, sans dépendance)
