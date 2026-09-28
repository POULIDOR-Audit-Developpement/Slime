# ASSETS/atelier/ — assets de « L'Atelier des bocaux »

Assets réellement utilisés par la scène de l'atelier (`js/atelier.js`).
Spécification de référence : `docs/superpowers/specs/2026-09-27-atelier-bocaux-design.md` (§8).

## Fichiers

| Fichier | Rôle | Source |
|---|---|---|
| `jar_full.png` | Bocal en verre (contenu visible, contour net) — un par palier ouvert, rempli des slimes recolorés des joueurs (top 8) | Découpe de `ASSETS/atsprite.jpeg` par `tools/extract_atelier.py` |
| `jar_empty.png` | Le même bocal **vide et neutre** — ni couleur, ni seuil visible — pour les paliers fermés ; ne doit pas trahir la couleur à venir | Découpe de `tools/extract_atelier.py` (contenu vert du même crop neutralisé en verre vide) |

- **Pas de `bg.png`** : le fond de scène est `ASSETS/atbg.jpeg` (mockup de
  l'atelier complet : meuble + livre), chargé **directement** par `js/atelier.js`
  sans conversion ni découpe.
- **Pas de `plate.png`** : aucune plaque individuelle exploitable sur la planche
  source — la plaque d'étiquette sous chaque étagère est **dessinée
  vectoriellement** par `js/atelier.js` (`drawPlaque` : nom du 1er du palier
  tronqué à 12 + « +N »).

## Sources

- `ASSETS/atbg.jpeg` — mockup de la scène d'atelier complète (fond direct).
- `ASSETS/atsprite.jpeg` — planche d'éléments (grille de bocaux) d'où sont
  extraits les deux PNG.

La découpe suit la convention des `tools/extract_v*.py` : région repérée sur la
planche, chroma-key du fond gris uniforme (le verre garde son « intérieur vu par
transparence »), effilage de 1 px contre la frange JPEG, PNG **transparent**
écrit ici.

## Règles

- **Fallback procédural** : si un PNG manque ou qu'une découpe est inexploitable,
  `js/atelier.js` dessine l'élément (pattern des sprites du jeu) — l'atelier doit rester
  présentable sans aucun asset.
- `jar_empty.png` est **neutre** : aucune teinte ni marque laissant deviner le palier.
- Aucun chiffre de score nulle part dans l'atelier (règle d'or de la spec, §1).
