# SLIME

Endless runner rétro pixel-art : guide un slime le plus loin possible alors que la caméra accélère sans pitié.

## Jouer

Ouvrir `index.html` : c'est la **page de présentation** (vitrine animée avec les sprites, EN/FR). Le bouton **JOUER** lance le jeu : `play.html`.

Le jeu affiche le même univers (fond sombre, panneaux flottants, sol en tuiles) et un sélecteur de langue EN / FR sur le titre et l'écran de game over.

### Jouer / éditer depuis le réseau local (LAN), pool synchronisé

```
node server.mjs    # à lancer depuis ce dossier (port 8471, --port N pour changer)
```

Puis depuis n'importe quel appareil du LAN : `http://<IP-de-la-machine>:8471/` (présentation), `http://<IP-de-la-machine>:8471/play.html` (jeu) ou `http://<IP-de-la-machine>:8471/editor.html` (éditeur). IP locale : `hostname -I`.

Avec ce serveur, le **pool de patterns + le layout (VUE/PHYS/POWER) sont partagés** entre tous les appareils : édite depuis la tablette, le jeu sur le PC et le téléphone se mettent à jour en ~2 s (polling). La sync est en **concurrence optimiste** : chaque sauvegarde porte la révision sur laquelle elle se base, et le serveur **refuse (409) une poussée périmée** — une session oubliée (onglet rouvert le lendemain) ne peut plus écraser le travail récent. Sur refus, le client recharge l'état à jour et **fusionne** : les patterns créés localement sont conservés et repoussés, un même id existant des deux côtés prend la version du serveur (dernière validée), le layout idem. L'éditeur affiche « conflit résolu, fusion appliquée » quand cela arrive. Contrepartie (pas de marqueurs de suppression) : un pattern supprimé sur un appareil peut ressortir depuis un appareil pas encore synchronisé. Sans serveur (ou avec `python3 -m http.server`), tout reste local au navigateur comme avant — l'éditeur affiche l'état de la sync dans son pied de page. Le pool partagé vit dans `data/pool.json` (ignoré par git) ; premier appareil connecté avec un pool local non vide → il le partage automatiquement.

#### Éditeur protégé

L'éditeur demande un **mot de passe** (par défaut : `slime`) — les joueurs peuvent voir la présentation et jouer, mais pas modifier le jeu. Le serveur refuse aussi toute écriture du pool (`PUT /api/state`) sans la clé (en-tête `X-Slime-Key`). Pour changer la clé : variable d'environnement `SLIME_KEY=autre node server.mjs` — attention, le hash du portail reste dans `editor.html` (page autonome sans serveur), changer la clé côté serveur seul ne suffit pas pour un changement complet.

### Structure du projet

```
index.html              ← PAGE DE PRÉSENTATION : vitrine animée avec les sprites du jeu (EN/FR)
play.html               ← page hôte du jeu (charge les scripts)
js/i18n.js              ← traductions EN/FR, EN par défaut (jeu + page de présentation, très peu de mots)
server.mjs              ← serveur LAN zéro dépendance : statique + sync du pool (API /api/state, /api/rev, PUT protégé par X-Slime-Key) + HTTPS auto-signé PORT+1 (scanner QR)
data/pool.json          ← pool partagé du LAN (créé par server.mjs, ignoré par git)
editor.html             ← ÉDITEUR : patterns + vue principale + physique + pouvoirs + couleurs du slime (autonome)
css/style.css           ← styles de la page
js/game.js              ← moteur du jeu (rendu, physique, enchaînement des patterns)
js/physics.js           ← constantes + config physique réglable + simulation de saut partagée (jeu, éditeur, outils)
js/patterns.js          ← pool de patterns, poids par difficulté, stockage, export/import
js/patterns-defaults.js ← pool par défaut GÉNÉRÉ (20 sections validées) — ne pas éditer
js/music.js             ← BGM : playlist .mp3 à BPM fixe (module Music)
js/crypto.js            ← signature HMAC des codes de fin de partie v1/v2 (module Crypto ; v2 = contact embarqué)
js/contact.js           ← contact du joueur (Instagram/email) : sanitize, stockage, modal 1re mort
js/ranking.js           ← classement local du créateur (decode.html) : meilleur score par joueur, export/import
js/sprites.js           ← chargement et dessin des sprites du slime (recoloration runtime des variantes)
js/slime-colors.js      ← paliers score → couleur (module SlimeColors, partagé jeu + settings)
vendor/                 ← litecanvas embarqué (fallback CDN inclus) + libs QR (qrcode.js, jsQR.js — voir vendor/README.md)
ASSETS/                 ← direction artistique + sprites
tools/                  ← générateur de pool (gen_defaults.mjs, gen-core.js, gen_default_pool.html) + extraction des sprites (Python : extract_v2.py / extract_v3.py, make_v2_sprites.py / make_v3_sprites.py)
decode.html             ← outil créateur : scan QR / collage du code, vérif HMAC et classement local (autonome)
docs/                   ← spécifications de design + aperçus (docs/previews/)
```

### Rendu et sprites

Rendu natif 960×540 avec logique interne en coordonnées virtuelles 480×270 (zoom ×2) : style « gros pixels » dans les formes, texte et HTML nets. Le slime utilise les sprites des feuilles fournies (`ASSETS/sprites/game/`) : idle animé, saut et chute **en version miroir selon la direction**, atterrissage, blessure, **séquence de mort en 4 frames** (splat → gouttes → bulles → particules), **ledge catch** (remontée en 3 frames : drapé sur le coin, traction, assis), **double saut** (boule + lignes de vitesse, anneau d'impulsion) et **bullet time** (slime teal à tourbillons) ; fallback procédural si les images manquent. Les variantes de couleur sont **recolorées à l'exécution** (`js/slime-colors.js` : teinte des pixels verts avec préservation des ombrages — un seul jeu de PNG pour toutes les teintes, paliers éditables dans l'onglet COULEURS de l'éditeur, effets dégradé/multicolore/arc-en-ciel/brillant/étoilé supportés). Le fond bleu à panneaux, les tuiles cerclées de noir, les bordures de bedrock (texture `void`) et la **jauge de vitesse compacte « VITESSE »** (cadran pré-rendu en 4 états — lent/moyen/rapide/très rapide, barre en escalier de secours) reprennent la direction artistique. La vie se lit sur 3 têtes de slime en bas à gauche.

### Contrôles (PC & mobile)

- **Appuyer** clic / appui tactile : la **visée** démarre au point cliqué (souris) ou sur le slime (tactile)
- **Bouger le curseur** pendant l'appui : vise la trajectoire **dans n'importe quelle direction** — même en arrière pour aller chercher les billes dorées (au risque de te faire rattraper !). La **distance du réticule au slime règle la puissance** : tout près = petit saut, au-delà de la portée max = saut maximal
- **Sur mobile (visée relative)** : pose le doigt **n'importe où** (coin de l'écran, sans couvrir la cible) puis **glisse** — le réticule se déplace avec le doigt (delta × sensibilité) pendant qu'un halo repère le pouce ; le réticule et la trajectoire restent lisibles à l'écran. La souris garde la visée absolue au point cliqué
- **Relâcher** : sauter
- **Double saut** : en l'air, appui = visée en **temps ralenti** (bullet time), relâcher = second saut dans la direction et la puissance visées. Recharge réglable (onglet POWER), charges restaurées à chaque atterrissage. Pendant la visée le slime se transforme en boule (lignes de vitesse), anneau d'impulsion au départ ; tourbillons « time warp » pendant le ralenti
- **Ledge catch** : un bord de plateforme manqué de justesse (fenêtre réglable) est agrippé in-extremis — le slime se hisse immédiatement dessus (durée de la remontée réglable) ; appui = viser un saut pendant qu'il se tire vers le haut (onglet POWER)
- **Coyote time** : un appui juste après avoir glissé d'une plateforme saute quand même (fenêtre réglable, 0.08 s par défaut)
- **M** ou l'icône son (coin haut-gauche) : couper/réactiver le son
- **Plein écran** : icône coins (haut-droite) — API native sur Android/desktop ; sur iPhone (Safari), le canvas est diffusé dans une vidéo plein écran (contournement de l'API restreinte d'iOS, entrées relais avec conversion letterbox). Si le jeu est ajouté à l'écran d'accueil (standalone), l'icône disparaît : le jeu est déjà plein écran
- La **couleur du slime = ton score** : il change de teinte en direct à chaque palier franchi (score toujours caché — la couleur est un indice, pas un chiffre). Paliers réglables dans l'**onglet COULEURS de l'éditeur** : seuils, teintes, ajout/suppression, avec preview du slime en temps réel. **Effets spéciaux** par palier : unie, dégradé (fondu haut→bas, 2 à 6 couleurs), multicolore (bandes verticales), arc-en-ciel, brillant (reflet balaie le corps) et étoilé (paillettes scintillantes) — les trois derniers sont **animés en jeu** (~10 fps, régénération des canvas par round-robin)
- **Plus de plafond** : le haut du monde est ouvert — les grands sauts passent au-dessus de l'écran (une flèche te repère quand tu es hors-champ)
- Les piques de gauche et de droite font mal — ne tombe pas dans le vide
- Les billes rapportent des points (score caché !), la **bille dorée vaut 50** — elle est toujours au bout d'un détour risqué
- Le **bonus slime** (tête verte « as in HUD ») rend une vie ; si elle est déjà pleine, il vaut 30 points

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

- BGM : 3 fichiers `ASSETS/music/bgm1..3.mp3` (~3 min, BPM fixe) joués en séquence pendant la partie — démarrage au 1er saut, arrêt à la mort, « Rejouer » repart de la piste 1 ; la 3e boucle si tu survies au-delà de 9 min. Touche 'm' ou coin haut-gauche : mute (coupe aussi les SFX, préférence persistée). Fichier absent = silence, jamais bloquant
- Meilleur score sauvegardé localement mais **jamais affiché en clair** ; à l'écran titre, le gros slime porte la **couleur du palier de ton record** (et « NOUVEAU RECORD ! » signale quand tu bats le mien, sans le chiffre)

## Éditeur & patterns (créateur de jeu)

Ouvrir **`editor.html`** — un mot de passe est demandé (défaut : `slime`, voir « Éditeur protégé » plus haut ; mémorisé jusqu'au clic sur 🔒 dans le pied de page). Tout est sauvegardé en `localStorage` (clé `slime_patterns_v1`) et appliqué au jeu immédiatement. Le panneau de propriétés (à droite) est **redimensionnable** : glisse la poignée entre le canvas et le panneau (200→560 px, largeur mémorisée).

> ⚠ **Où sont stockés tes réglages ?** Dans le `localStorage` du navigateur — c'est-à-dire **par machine, par navigateur ET par origine** : `http://localhost:8471` et `http://192.168.1.68:8471` sont deux origines **distinctes** avec deux stockages indépendants — et changer le **port** (`--port N`, variable `PORT`) crée une troisième origine. Si tes réglages « se remettent aux défauts », tu as probablement changé d'adresse, de port, de navigateur ou de machine — l'origine active est affichée en bas de l'éditeur (« stockage : … »). Conseil : garde toujours la même adresse pour éditer (par ex. l'IP LAN), le jeu de l'adresse sert juste à consulter. Avec `server.mjs` le pool remonte au serveur à la première sauvegarde, ce qui atténue ces sauts d'origine ; sans serveur, pense à **exporter** ton pool (onglet PATTERNS) avant de changer d'adresse. Une copie de secours (`slime_patterns_v1_bak`, une sauvegarde en arrière) est tenue à jour et restaurée automatiquement si le stockage principal devient illisible.

### Onglet PATTERNS
- Chaque pattern est une **section** de plateformes/billes/murs/décor en coordonnées relatives, avec une **ligne d'entrée** (l'ancre verte : d'où le slime saute en arrivant) et une **difficulté T1→T5**
- **Rangement automatique** : la liste (et le pool partagé LAN, ainsi que les exports) est triée en continu par **difficulté croissante** puis **ordre alphabétique** du nom (casse et accents ignorés) — inutile de classer à la main
- Outils : flèche (déplacer), plateforme (touches **1-6** = type, **+/-** = largeur), **mur vertical (W)** : colonne au sol ou stalactite au plafond, largeur 1-3, **flancs piqués optionnels** (mortels) — le sommet d'une colonne est toujours atterrissable, bille, bille or, décor, gomme ; **Suppr** efface, **flèches** ajustent au pixel
- **Multi-sélection** (outil flèche) : **Ctrl ou Shift+clic** ajoute/retire un élément, **Ctrl ou Shift+glisser sur le vide** trace un rectangle qui capture tout ce qu'il touche ; glisser un élément **déjà sélectionné** déplace **tout le groupe** (un clic simple sans glisser réduit la sélection à cet élément) ; plateformes/murs snappés à la grille, lignes 0-4
- **Copier/coller d'éléments** : **Ctrl+C** copie la sélection, **Ctrl+X** coupe, **Ctrl+V** colle dans le pattern courant — ou dans un **autre pattern** — ancré sous la souris (sinon décalé d'une case) ; **Ctrl+A** sélectionne tout le pattern, **Suppr** efface la sélection entière, **flèches** la déplacent (Shift = pas de 8 px)
- **Validation en direct** : la même physique que le jeu (`js/physics.js`) simule chaque saut **avec les pouvoirs du layout** — ✓ vert = faisable au saut visé simple, ✓ bleu (DJ/L) = faisable seulement via double saut ou rattrape de bord, ✗ rouge = impossible même avec les pouvoirs ; un saut qui traverse le corps d'un mur est invalidé, sauter **sur** le sommet d'une colonne reste valide. Budget fidèle au jeu : **un seul double saut par pattern** (cooldown 4 s) ; les plateformes collantes affaiblissent le 1er saut, les rebondissantes peuvent être corrigées en plein vol. Un pattern avec des ✗ ne bloque pas le jeu (il est juste joué tel quel, prudence !)
- **▶ Playtest** : ouvre le jeu en boucle sur ce pattern seul (`index.html?pattern=<code>`, bannière « TEST » en haut)

### Onglet VUE
- Cadre affiché **fidèlement** comme en jeu (bandes de bedrock, piques alignés sur les hitboxes, zone de chute hachurée sous l'écran)
- **Zoom global de la vue en jeu** (×1 à ×4, centré sur le slime, fixe pendant la partie) — pratique pour bien voir un slime réduit ; l'aperçu montre la fenêtre visible
- Options d'affichage : trajectoire de saut, secousse d'écran
- Hitboxes des murs de damage (gauche / droite) : glisse les poignées dorées ou les curseurs — appliqué au jeu en direct, les piques suivent automatiquement. Pas de plafond : le haut est ouvert
- Placement des assets décoratifs (sprites de `ASSETS/sprites/game/`), posés derrière les plateformes en jeu

### Onglet POWER
Pouvoirs du slime — réglés sur un **brouillon** puis validés par le bouton **« ✓ Appliquer au jeu »** (l'onglet jeu ouvert se met à jour immédiatement, sans recharger) :

| Pouvoir | Réglages (défaut) |
|---|---|
| Double saut | activé (oui), recharge (4 s), charges par atterrissage (1), puissance (×1) |
| Slow-mo | activé (oui), échelle du temps (×0.35), durée max (0.6 s) |
| Ledge catch | activé (oui), durée de la remontée (0.6 s), fenêtre (8 px) |

- En l'air, un appui déclenche la **visée du double saut** (et le ralenti si le slow-mo est activé) ; le ralenti ne concerne **que la visée** — au relâcher, le saut part à pleine vitesse
- Le **ledge catch** s'enclenche tout seul quand le slime frôle un bord en tombant : il se hisse immédiatement sur la plateforme (le sommet d'un bord accroché se comporte comme un sol : crumble démarre, timer dynamique lancé, plateformes éphémères disparaissent) ; un appui pendant la remontée permet de viser un saut, sinon il est posé au bout de la durée réglée
- Le **cooldown** démarre à chaque utilisation ; les charges se rechargent à l'atterrissage
- Tant que le brouillon diffère, le bouton passe en doré avec la note « modifications non appliquées »
- « Réinitialiser les pouvoirs » remet les défauts et les applique immédiatement

### Onglet PHYS
Physique du jeu réglable pour de **micro-ajustements** du game feel — même modèle que POWER : les curseurs modifient un **brouillon**, le bouton **« ✓ Appliquer au jeu »** sauvegarde et met à jour l'onglet jeu ouvert instantanément (inclus dans l'export .json / code compact) :

| Groupe | Réglages (défaut) |
|---|---|
| Slime | taille du rayon : hitbox + sprite + validation des sauts (14 px) |
| Saut & visée | gravité (620), vitesse min/max (210/360), portée de visée min/max (24/140 px), chute max (520), traînée aérienne (0.6) |
| Rebond & collant | vélocités du rebond orange (400/140), puissance après plateforme collante (×0.8) |
| Dégâts | invincibilité après un coup (1.3 s), échelle des reculs infligés (×1) |
| Caméra | vitesse de base (80), vitesse max (240), temps jusqu'au max en min (9 min = 3 musiques de 3 min ; paliers automatiques de +3 toutes les 10 s) |
| Game feel | coyote time (0.08 s) — 0 = désactivé |

- La validation ✓/✗ des patterns et le playtest utilisent les valeurs **appliquées** (aucun décalage éditeur/jeu)
- « Réinitialiser la physique » remet les défauts et les applique immédiatement
- Si tu augmentes la taille du slime au-delà du défaut, revalide tes patterns : quelques sauts du pool par défaut pourraient devenir serrés

### Difficulté & pool
- Le jeu pioche dans le pool selon une **courbe de poids** : T1 domine au début, les tiers durs prennent le dessus vers 9 min (calé sur la caméra : 3 BGM de 3 min) ; anti-répétition immédiate ; chaque enchaînement est revalidé, avec plateforme de secours si rien ne passe
- **Ton pool remplace le pool par défaut dès qu'il contient au moins 1 pattern** (sinon le jeu joue les 20 sections embarquées) ; bouton « Pool par défaut » pour les copier et les éditer

### Portabilité (autre machine)
- **Exporter .json** / **Importer .json** (ou glisser-déposer) : toutes tes créations + le layout de vue
- **Copier code / Coller code** : même contenu en code compact `SLIME1.…` à passer de machine en machine
- Le jeu lit le même `localStorage` que l'éditeur : importer suffit à changer le contenu du jeu
- Importer un backup contenant une vue (murs/physique/décor) **remplace** le réglage de vue actuel — un avertissement est affiché au moment de l'import

### Régénérer le pool par défaut
```bash
node tools/gen_defaults.mjs [sections par tier] [graine]   # réécrit js/patterns-defaults.js
```
ou visuellement : `tools/gen_default_pool.html` (aperçu validé saut par saut, export, « Installer dans mes patterns »).

## Scores sécurisés (côté créateur)

À la mort, le jeu génère un **code signé en HMAC-SHA256** (le score n'est jamais calculé côté lecteur).
Si le joueur a renseigné son **contact** (Instagram ou email — demandé à la 1re mort avec un score,
éditable sur l'écran de fin via ✏), il est **embarqué dans le code** (format v2) : c'est ce qui permet
de contacter le gagnant. L'écran de fin affiche le code en **QR code** (plus le bouton **COPIER LE CODE**
et **REJOUER**) ; un joueur sans contact a quand même un QR valide (code v1).

Côté créateur, `decode.html` :
- **📷 Scanner (caméra)** : lecture live du QR à l'écran du joueur (caméra = localhost/HTTPS uniquement) ;
- **🖼 Depuis une photo** : lecture d'un QR photographié (marche partout, même en `file://`) ;
- **Coller un code** à la main (secours) ;
- chaque code vérifié alimente le **classement local** (meilleur score par joueur, persisté en
  localStorage) avec **export/import JSON** pour sauvegarde ou transfert entre appareils.

Le contact vit DANS le code : quiconque décode un QR lit le contact de CE joueur seulement —
c'est assumé pour le giveaway.

Pour changer la clé secrète : modifier la constante `SECRET` (dans `js/crypto.js` **et** `decode.html`).

### Scanner QR sur le LAN (HTTPS)

La **caméra** du scanner n'est disponible qu'en **contexte sécurisé** (HTTPS ou localhost). Le serveur
gère ça tout seul : au premier lancement, il génère un **certificat auto-signé** (`data/tls/`, ignoré
par git, via `openssl`) et écoute **aussi en HTTPS sur PORT+1 (8472 par défaut)** :

```bash
node server.mjs                # HTTP :8471 (jeu) + HTTPS :8472 (scanner QR)
node server.mjs --no-tls       # HTTP seul
node server.mjs --tls-port 9000
```

Sur le téléphone : ouvrir `https://<IP-du-PC>:8472/decode.html`, accepter l'avertissement de
certificat (auto-signé — « Avancé → Continuer »), puis 📷 Scanner. Le SAN du certificat couvre
toutes les IP LAN détectées. Sans openssl sur la machine : HTTP seul, le scan photo et le collage
du code restent disponibles.

## Tech

- Moteur : [Litecanvas](https://litecanvas.js.org) v0.302.0 via CDN jsDelivr (fallback unpkg)
- Canvas plein écran adaptatif : le terrain reste en coordonnées 480×270 (zoom auto), les bords se prolongent en cadre de bedrock — aucune bande vide
- Zoom de vue global réglable (onglet VUE), physique du jeu paramétrable (onglet PHYS), pouvoirs réglables (onglet POWER), couleurs du slime par palier de score avec effets (onglet COULEURS, recoloration runtime des sprites verts, effets animés à temps partagé)
- Saut « visée » : la puissance suit la distance du clic/touch au slime, la direction suit l'angle — plus de temps de charge ; double saut avec bullet time (onglet POWER) et animations dédiées (boule de visée, impulsion anneau, time warp)
- Séquence de mort en 4 frames composée par `tools/make_v3_sprites.py` (sources : feuille annotée extraite dans `ASSETS/sprites/sprite_*.png`)
- Pas de plafond : le haut du monde est ouvert (indicateur hors-écran en haut)
- Génération **100 % patterns** : pool embarqué (généré puis validé par simulation physique de chaque saut) ou pool du créateur — `js/physics.js` garantit l'atteignabilité au chaînage
- SHA-256 + HMAC embarqués (fonctionne hors-ligne, sans dépendance)
- Tests de régression (`node tools/<test>.mjs`) : `smoke_test` (génération/validation du pool), `game_sim` (partie simulée : saut, coyote, jump buffer, physique live), `editor_dom_test` (onglets PHYS et COULEURS de l'éditeur avec mini-DOM), `music_test` (logique BGM mp3 : idempotence start, mute, enchaînement des pistes), `sprites_test` (variantes canvas acceptées par les gardes de dessin), `server_test` (API pool : GET/PUT /api/state, concurrence optimiste 409, clé X-Slime-Key), `code_contact_test` (code v2 : contact embarqué/signé, compat v1, sanitize Contact), `qr_test` (round-trip génération/lecture QR avec les libs vendorées), `ranking_test` (classement local : meilleur par joueur, merge/import, stockage corrompu), `tls_test` (cert auto-signé : SAN IP LAN, réutilisation, openssl absent -> null), `lan_sync_test` (sync LAN du pool : fusion, conflits 409, polling)
- Diagnostic perf : `play.html?fps` (compteur), `?prof` (chronométrage par frame : sim/draw/rAF + sections), `?sim=N` (cadence de simulation) — et voir `AGENTS.md` pour les règles perf (sprites/effets animés, musique, mobile) à respecter avant d'ajouter couleurs, animations ou tout travail par frame
