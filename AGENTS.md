# SLIME — règles pour les agents (et les humains pressés)

## Perf : sprites et effets animés — LEÇON du 2026-09-27

Les variantes de couleur du slime (paliers de l'onglet COULEURS) sont des
canvas recolorés par pixels à partir des PNG de base (js/sprites.js,
`VARIANT_BASES` — 15 sprites ; les plus gros coûtent ~2-3 ms de recoloration
chacun, ex. ledge 400×420).

Règles non négociables quand on ajoute une couleur/animation (slime ou autre
sprite) :

1. **Ne JAMAIS régénérer en masse dans un tick/frame.** Un tick ne rafraîchit
   QUE les variantes réellement dessinées : les fonctions de dessin de
   sprites.js (`draw`, `drawImage`, `drawSrc`, `drawTL`, `rotated`, `get`)
   marquent l'usage via `markAnim()`, et `tickAnimated` ne régénère qu'elles.
   L'ancien comportement (15 bases × ~10 Hz, affichées ou non) = 15-45 ms de
   burst sur le thread principal = saccades à 20-30 fps sur mobile, avec dips
   périodiques toutes les ~100 ms.
2. Un sprite ajouté à `VARIANT_BASES` hérite du mécanisme : rien à faire de
   plus, et surtout NE PAS le régénérer manuellement dans une boucle de tick.
3. Nouvel effet animé : le déclarer dans `SlimeColors.EFFECTS` avec
   `animated: true` — `isAnimated` pilote le throttle 10 fps ET l'exclusion
   totale du coût quand aucun palier animé n'existe.
4. Coût pixel ≈ largeur × hauteur : un grand canvas animé reste cher même bien
   régénéré. Préférer un petit canvas, ou du dessin vectoriel (rects/lignes).
5. Tout ajout d'effet passe par `tools/sprites_test.mjs` (les checks
   « tick : seule la variante dessinée est refaite » doivent rester verts) et
   une mesure `?prof` sur un vrai mobile avant/après.

## Diagnostic perf intégré (paramètres d'URL — aucun effet sans eux)

- `?fps` : compteur images rendues/s + maj simulation/s, en haut à gauche
- `?prof` : chronométrage par frame — `u` = ms simulation, `d` = ms draw,
  `g` = écart moyen/max rAF, sections `[an animation | of cadre | bg fond |
  sc scène | r reste]` + résolution du canvas
- `?sim=N` : force la cadence de simulation (ex. `?sim=60` — défaut 240 Hz)

Méthode : **mesurer avant/après sur le mobile cible**. Ce dossier a coûté
plusieurs allers-retours en hypothèses non mesurées ; un seul `?prof` a
désigné le coupable (`d32.0`) en une capture.

## Rappels

- Modifier un `js/*.js` = relancer les tests Node (README « Tests de
  régression ») **et** bump le `?v=` du fichier dans `play.html` (cache-busting).
- `js/music.js` : les éléments `<audio>` sont créés paresseusement au 1er saut
  (jamais au boot — un burst média au chargement coûte des FPS sur mobile) ;
  no-op complet hors navigateur ; `toggle` coupe aussi les SFX (volume zzfx).
- Le draw est le goulot classique sur mobile : un canvas de 0,4 MP n'excuse
  pas 32 ms — tout ce qui est par frame doit rester en dessous de ~10 ms.
