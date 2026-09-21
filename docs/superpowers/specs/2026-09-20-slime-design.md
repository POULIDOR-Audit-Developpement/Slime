# Slime — Document de design (spec)

**Date :** 2026-09-20
**Statut :** Validé par le joueur (design approuvé en session)
**Version :** 1.0

---

## 1. Vision

Jeu de plateforme à défilement horizontal (endless runner) rétro-minimaliste. Un slime avance vers la droite de plateforme en plateforme ; la caméra avance seule et accélère. La partie se perd en se faisant rattraper, en tombant, ou en perdant toute sa taille à cause des pics.

## 2. Choix techniques

- **Fichier unique** `index.html` (HTML + CSS + JS), aucune étape de build.
- **Moteur :** Litecanvas chargé via CDN jsdelivr (version épinglée).
- **Rendu :** résolution interne 480×270, upscaling avec `image-rendering: pixelated`, tout le pixel art est dessiné procéduralement (rectangles/cercles) — zéro asset externe.
- **Hébergement :** Netlify, déploiement du dossier `slime/` (glisser-déposer ou Git).
- **Crypto :** implémentation pure-JS SHA-256 + HMAC embarquée (synchrone, fonctionne partout, y compris `file://`).

## 3. Le Slime

- **Vie = taille.** 3 unités de départ (grand rayon). Chaque dégât retire 1 unité. À 0 → mort.
- **Physique :** gravité, inertie horizontale (friction au sol), pas de déplacement libre : le seul moteur de progression est le saut.
- **Squash & stretch** à l'atterrissage et selon la vitesse verticale.
- **Invulnérabilité** 1,2 s après un dégât (clignotement).

## 4. Contrôles (unifiés PC/mobile)

- **Appui long** (clic ou tactile) : la durée d'appui détermine la puissance du saut (min → max en ~0,55 s, charge plafonnée).
- **Visée :** la position du pointeur par rapport au slime définit la direction du saut (toujours orientée vers la droite, angle borné).
- **Trajectoire :** pendant la charge, une parabole de points simule le saut (simulation physique réelle, arrêtée au premier contact de plateforme).
- Saut uniquement au sol ; en l'air les appuis sont ignorés.

## 5. Caméra et limites

- Défilement autonome vers la droite : vitesse de base ~40 px/s, +5 px/s toutes les 10 s, plafond à 120 px/s. Jauge de vitesse affichée en haut à droite.
- **Gauche :** slime rattrapé par le bord → mort (flash d'avertissement quand il s'approche).
- **Bas :** chute sous l'écran → mort.
- **Haut :** plafond solide (le slime se cogne, vitesse verticale annulée).
- **Droite :** mur de pics fixé au bord droit de l'écran → dégât de taille + repoussée vers la gauche.

## 6. Génération procédurale (skill-based)

- Grille de cellules 32 px. Chaque plateforme suivante est placée dans une fenêtre **garantie atteignable** : écart horizontal et dénivelé calculés depuis la physique maximale du saut, avec marge pour la vitesse caméra. La difficulté croissante resserre les fenêtres (gaps 2→4 cellules, dénivelé ±2 rangées).
- Types de plateformes :
  - **Basique (60 %)** : standard, verte.
  - **Collante (15 %)** : brune, multiplie la puissance du saut suivant par 0,6.
  - **Dynamique (15 %)** : bleue, oscillation verticale sinusoïdale ; le slime suit la plateforme tant qu'il est posé dessus.
  - **Pics (10 % des plateformes larges)** : bandes rouges au milieu, dégât au contact.
- Billes : arcs de 3 billes au-dessus des gaps ou lignes sur les plateformes ; +10 points chacune.
- Nettoyage des plateformes et billes passées derrière la caméra.

## 7. Score et code de fin de partie

- **Score caché** pendant la partie : `floor(distance/10) + billes × 10`.
- À la mort : génération d'un code `base64url(score.date) + "." + HMAC-SHA256(tronqué)` signé avec une clé secrète intégrée au code.
- Le score numérique n'est **jamais** affiché au joueur.
- `decode.html` (outil créateur, non déployé) : colle un code → vérifie la signature HMAC → affiche score + date + validité.

## 8. Art direction

- Palette : fond bleu-violet nuit (#12122b/#1a1a3a), motif de rectangles en double parallaxe (0,2× et 0,5× vitesse caméra, généré de façon déterministe par index de chunk).
- Slime vert (#3ecb3e) avec yeux et reflet ; plateformes vertes/brunes/bleues selon type ; billes jaunes et orangées ; pics rouges.
- Écran titre : « SLIME » en grandes lettres pixel vertes, consigne d'appui long.
- HUD : barre de vie en bas à gauche (tête de slime + barre segmentée), jauge de vitesse caméra en haut à droite.
- Écran game over : le code de score + bouton rejouer.
- SFX minimalistes générés (saut, bille, dégât, mort). Pas de musique.

## 9. Structure du projet

```
slime/
  index.html    ← le jeu (seul fichier déployé)
  decode.html   ← outil créateur de vérification des codes (local)
  README.md     ← instructions de déploiement Netlify
```

## 10. Vérification

- Test SHA-256/HMAC contre les vecteurs de test officiels (ex. SHA-256("abc")).
- Test manuel navigateur : états titre/jeu/game over, rendu, charge de saut, dégâts, mort, code généré et décodé.

## 11. Hors périmètre V1

Musique, leaderboard en ligne, personnalisation, PWA.

---

# V2 (post-lancement)

## 12. Nouveaux types de plateformes

- **Cassable** (grise fissurée) : se fissure à l'atterrissage, casse 0,5 s après (particules + son) ; le slime doit re-sauter vite.
- **Éphémère** (blanche translucide clignotante) : disparaît dès qu'on saute depuis ou qu'on glisse de son bord — usage unique.
- **Rebondissante** (orange à chevrons) : rebond automatique à l'atterrissage (vy = −400, vitesse horizontale conservée avec un minimum de +140 vers l'avant si faible) ; pas de charge possible dessus.
- Génération : basique 38 %, dynamique 13 %, cassable 11 %, collante 10 %, éphémère 10 %, rebondissante 10 %, basique-à-pics 8 % ; cassable/éphémère après 12 s, rebondissante après 25 s.
- Atteignabilité étendue : depuis une rebondissante, le saut sortant simulé est le rebond fixe.

## 13. Visée 360° et branches bonus

- Suppression du verrou « vers la droite » : la visée est libre à 360°, la caméra continue d'avancer → revenir en arrière est un vrai risque.
- Branches bonus : après ~20 s, 45 % des plateformes principales ancrent une branche de 1 plateforme (2 cellules) placée **en arrière** (3-6 cellules) et ±2 rangées, avec une **bille dorée** (50 pts, ×5) et une bille normale en chemin.
- La garantie d'atteignabilité s'applique aux branches (saut vers l'arrière simulé depuis l'ancrage) ; anti-chevauchement avec le chemin principal.

## 14. Musique

- Séquenceur chiptune 16 pas (basse + mélodie pentatonique) joué via ZzFX, volume discret.
- Tempo lié à la caméra : 112 → 150 BPM quand la vitesse passe de 40 à 120 px/s.
- Joue uniquement en partie ; **M** (clavier) ou l'icône son (coin haut-gauche, tactile) coupe tout ; préférence persistée.

## 15. Record local

- `localStorage` (`slime_best`) : meilleur score, affiché à l'écran titre (« RECORD : N »).
- À la mort si battu : « NOUVEAU RECORD ! » clignotant, **sans le chiffre** ; sauvegarde à la mort uniquement.
