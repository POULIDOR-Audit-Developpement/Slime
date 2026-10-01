import numpy as np
from PIL import Image
from collections import deque
import os

# Extraction ciblée de la planche v4 (ASSETS/planches/v4-ledge-catch.png,
# 1024x559) : séquence
# LEDGE CATCH « remontée » (accroche -> traction -> assis) et jauges vitesse
# caméra (4 états + jauge alternative verticale). Découpe manuelle (coordonnées
# lues sur la planche, flèches et chiffres exclus par les bornes) puis
# détourage : test de couleur fond damier + diffusion depuis les bords du crop.
# Le bloc brun/pierre des frames ledge est conservé ici (effacé plus tard par
# tools/make_v4_sprites.py, la plateforme du jeu fournit le rebord).
SRC = 'ASSETS/planches/v4-ledge-catch.png'
OUT = 'ASSETS/sprites/v4'
os.makedirs(OUT, exist_ok=True)

REGIONS = {
    'ledge_pull0':  (674, 112, 786, 292),  # drapé sur le coin, yeux fermés
    'ledge_pull1':  (798, 112, 890, 292),  # traction, effort (sourcils serrés)
    'ledge_pull2':  (916, 112, 1004, 292), # assis sur le bord, apaisé
    'gauge_slow':   (8, 104, 122, 206),    # cadran LENT
    'gauge_mid':    (124, 104, 238, 206),  # cadran MOYEN
    'gauge_fast':   (240, 104, 342, 206),  # cadran RAPIDE
    'gauge_veryfast': (344, 100, 450, 210),# cadran TRÈS RAPIDE (pointes rouges)
    'gauge_alt':    (452, 102, 512, 212),  # jauge verticale alternative
}

im = Image.open(SRC).convert('RGB')
W, H = im.size
a = np.asarray(im).astype(np.int16)


def is_bg_arr(arr):
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    # damier clair/gris de la planche (deux teintes neutres peu saturées)
    return (mx > 85) & ((mx - mn) < 34)


for name, (x0, y0, x1, y1) in REGIONS.items():
    crop = a[y0:y1, x0:x1]
    ch, cw = crop.shape[:2]
    isb = is_bg_arr(crop)
    bgm = np.zeros((ch, cw), dtype=bool)
    qq = deque()
    for x in range(cw):
        for y in (0, ch - 1):
            if isb[y, x] and not bgm[y, x]:
                bgm[y, x] = True
                qq.append((y, x))
    for y in range(ch):
        for x in (0, cw - 1):
            if isb[y, x] and not bgm[y, x]:
                bgm[y, x] = True
                qq.append((y, x))
    while qq:
        cy, cx = qq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < ch and 0 <= nx < cw and not bgm[ny, nx] and isb[ny, nx]:
                bgm[ny, nx] = True
                qq.append((ny, nx))
    # effile les pixels de bord qui gardent une teinte du damier
    trans = bgm.copy()
    trans[1:-1, 1:-1] |= bgm[:-2, 1:-1] | bgm[2:, 1:-1] | bgm[1:-1, :-2] | bgm[1:-1, 2:]
    alpha = np.full((ch, cw), 255, dtype=np.uint8)
    alpha[trans] = 0
    ys, xs = np.where(alpha > 0)
    if len(ys) == 0:
        print(name, 'VIDE')
        continue
    xa, xb, ya, yb = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([crop[:, :, 0].astype(np.uint8), crop[:, :, 1].astype(np.uint8),
                      crop[:, :, 2].astype(np.uint8), alpha])[ya:yb, xa:xb]
    Image.fromarray(rgba, 'RGBA').save(f'{OUT}/{name}.png')
    print(f'{name}.png {xb - xa}x{yb - ya}')
