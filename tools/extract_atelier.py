# Extraction des assets de « L'Atelier des bocaux » depuis la planche
# ASSETS/atsprite.jpeg (convention des tools/extract_v*.py : régions repérées
# sur la planche, détourage du fond, PNG transparents dans ASSETS/atelier/).
#
# La planche (2814x1536) a un fond GRIS UNIFORME (~137,137,137 ; sigma ~1)
# -> chroma-key global : distance couleur au gris < SEUIL => alpha 0. Le
# verre du bocal (gris-bleu ~101,100,101, distance ~61) et l'intérieur
# « vu à travers » le verre (gris pur, distance ~0 : fond visible par
# transparence — comportement VOULU pour un bocal en verre) : la distance
# seule suffit, pas de diffusion depuis les bords (qui garderait l'intérieur
# opaque). Un effilage de 1 px retire la frange JPEG du contour.
#
# jar_full  : bocal VERT de la rangée du BAS de la grille des bocaux
#             (5 colonnes x 2 rangées en x1983..2781, y542..986 — la rangée
#             du bas garde un fond de slime plus bas + étiquette blanche).
# jar_empty : le MÊME crop, contenu vert neutralisé en verre vide (les
#             pixels verts => teinte verre de ce bocal, luminance amortie) —
#             neutre, ne trahit pas la couleur à venir (règle du README).
# plate.png : aucune plaque individuelle exploitable sur la planche (les
#             régions 272x92 / 213x93 sont des rangées de tuiles gravées) —
#             la plaque est dessinée vectoriellement par js/atelier.js
#             (fallback du brief, « plate.png optionnel »).
import numpy as np
from PIL import Image
import os

SRC = 'ASSETS/atsprite.jpeg'
OUT = 'ASSETS/atelier'
os.makedirs(OUT, exist_ok=True)

BG = np.array([137, 137, 137], dtype=np.int16)
SEUIL = 14          # distance couleur au gris du fond (bords mesurés < 8)
GRIS = np.array([101, 100, 102], dtype=np.int16)  # teinte verre du bocal

# Bocal vert, rangée du bas, colonne verte (x1983..2126, y771..986) + marge 8.
JAR = (1975, 763, 2135, 995)

im = Image.open(SRC).convert('RGB')
a = np.asarray(im).astype(np.int16)


def detoure(crop):
    """Chroma-key du fond gris + effilage 1 px de la frange JPEG."""
    d = np.sqrt(((crop - BG) ** 2).sum(2))
    trans = d < SEUIL
    # effile : un pixel gardé collé à du fond devient transparent (frange)
    t2 = trans.copy()
    t2[1:-1, 1:-1] |= trans[:-2, 1:-1] | trans[2:, 1:-1] | trans[1:-1, :-2] | trans[1:-1, 2:]
    alpha = np.where(t2, 0, 255).astype(np.uint8)
    return alpha


x0, y0, x1, y1 = JAR
crop0 = a[y0:y1, x0:x1]
alpha0 = detoure(crop0)
# rogne les marges entièrement transparentes (même rognage pour les 2 PNG)
ys, xs = np.where(alpha0 > 0)
ya, yb, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
crop = crop0[ya:yb, xa:xb]
alpha = alpha0[ya:yb, xa:xb]
h, w = crop.shape[:2]

# --- jar_full : le bocal tel quel (slime vert + étiquette) ---------------
rgba = np.dstack([crop.astype(np.uint8), alpha])
Image.fromarray(rgba, 'RGBA').save(f'{OUT}/jar_full.png')
print('jar_full.png  %dx%d (rogne x%d..%d y%d..%d du crop %dx%d)'
      % (w, h, xa, xb, ya, yb, crop0.shape[1], crop0.shape[0]))

# --- jar_empty : contenu neutralisé en verre vide -------------------------
# Zone slime mesurée sur ce bocal : y 51..90 %, x 10..95 % du crop. Dans
# cette zone, tout pixel « vert dominant » ou sombre (contour du slime)
# devient la teinte verre, en gardant +/-25 % de sa luminance (aucune
# silhouette résiduelle). L'étiquette blanche et le verre restent intacts.
glass = crop.copy().astype(np.float32)
zy0, zy1 = int(h * 0.50), int(h * 0.92)
zx0, zx1 = int(w * 0.06), int(w * 0.96)
r, g, b = crop[:, :, 0], crop[:, :, 1], crop[:, :, 2]
vert = (g > r + 10) & (g > b + 10)
sombre = (np.maximum(np.maximum(r, g), b) < 75)
cible = (vert | sombre)
zone = np.zeros((h, w), dtype=bool)
zone[zy0:zy1, zx0:zx1] = True
cible &= zone & (alpha > 0)
L = (0.30 * r + 0.59 * g + 0.11 * b).astype(np.float32)
Lg = float((0.30 * GRIS[0] + 0.59 * GRIS[1] + 0.11 * GRIS[2]))
k = np.clip(0.75 + 0.25 * L / Lg, 0.55, 1.25)  # amortit la luminance
for c in range(3):
    glass[:, :, c] = np.where(cible, GRIS[c] * k, crop[:, :, c])
rgba_v = np.dstack([np.clip(glass, 0, 255).astype(np.uint8), alpha])
Image.fromarray(rgba_v, 'RGBA').save(f'{OUT}/jar_empty.png')
print('jar_empty.png %dx%d (%d px neutralisés en verre)' % (w, h, cible.sum()))