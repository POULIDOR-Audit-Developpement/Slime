# ASSETS/atelier/ — assets de « L'Atelier des bocaux »

Assets attendus pour la scène de l'atelier. Spécification de référence :
`docs/superpowers/specs/2026-09-27-atelier-bocaux-design.md` (§8).

## Fichiers attendus

| Fichier | Rôle | Source |
|---|---|---|
| `bg.png` (ou `bg.jpg`) | Fond de scène : **l'atelier complet** (meuble + livre), utilisé tel quel, sans découpe | `ASSETS/atbg.jpeg` (conversion directe) |
| `jar_full.png` | Bocal en verre (verre transparent, contour visible) — un par palier, rempli des slimes recolorés des joueurs (top 8) | Découpe de `ASSETS/atsprite.jpeg` |
| `jar_empty.png` | Le même bocal **vide et neutre** — ni couleur, ni seuil visible — pour les paliers fermés ; ne doit pas trahir la couleur à venir | Découpe de `ASSETS/atsprite.jpeg` |
| `plate.png` | Petite plaque d'étiquette sous chaque slime (**optionnel**) | Découpe de `ASSETS/atsprite.jpeg` |

## Sources

- `ASSETS/atbg.jpeg` — mockup de la scène d'atelier complète (fond direct).
- `ASSETS/atsprite.jpeg` — planche d'éléments (bocaux, étagère, livre) à découper.

La découpe est faite par `tools/extract_atelier.py`, en suivant la convention des
`tools/extract_v*.py` : régions repérées sur la planche, détourage du fond, PNG
**transparents** écrits ici. Les éléments d'étagère et de livre découpés servent de
secours/zoom (le livre fermé est déjà présent dans le fond `bg`).

## Règles

- **Fallback procédural** : si un PNG manque ou qu'une découpe est inexploitable,
  `js/atelier.js` dessine l'élément (pattern des sprites du jeu) — l'atelier doit rester
  présentable sans aucun asset.
- `jar_empty.png` est **neutre** : aucune teinte ni marque laissant deviner le palier.
- Aucun chiffre de score nulle part dans l'atelier (règle d'or de la spec, §1).
