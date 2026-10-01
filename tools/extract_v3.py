import numpy as np
from PIL import Image
from collections import deque
import os

# Extraction ciblée de la planche v3 (jauges, ledge catch, double saut pump,
# bullet time). Découpe manuelle (coordonnées lues sur la grille 128 px) puis
# détourage : test de couleur fond damier + diffusion depuis les bords du crop
# (les cellules gris clair de la jauge, encadrées de noir, ne sont pas atteintes).
SRC = 'ASSETS/planches/v3-actions.png'
OUT = 'ASSETS/sprites/v3'
os.makedirs(OUT, exist_ok=True)

REGIONS = {
    'arrow':        (138, 300, 268, 430),    # icône flèche VITESSE
    'bar':          (280, 290, 962, 402),    # barre segmentée 12 cellules (escalier)
    'ledge_grab':   (1530, 300, 1812, 720),  # yeux écarquillés au bord
    'ledge_stretch':(1835, 300, 2118, 720),  # étiré (cri)
    'ledge_tired0': (2160, 300, 2430, 720),  # fatigué, pose 1
    'ledge_tired1': (2455, 300, 2740, 720),  # fatigué, pose 2
    'dj_pump0':     (390, 1320, 590, 1490),  # boule + lignes de vitesse
    'dj_pump1':     (672, 1320, 872, 1490),  # boule + anneau d'impulsion
    'time_warp':    (2485, 930, 2748, 1172), # slime teal + tourbillons cyan
}

im = Image.open(SRC).convert('RGB')
W, H = im.size
a = np.asarray(im).astype(np.int16)


def is_bg_arr(arr, blue=False):
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    bg = (mx > 85) & ((mx - mn) < 34)
    if blue:
        # time_warp : halo du damier (bleuté OU cyan pâle) autour des
        # tourbillons vifs — on retire les pixels clairs peu saturés.
        bg = bg | ((b > g + 8) & (mx > 140)) | (((mx - mn) < 70) & (mn > 130))
    return bg


for name, (x0, y0, x1, y1) in REGIONS.items():
    crop = a[y0:y1, x0:x1]
    ch, cw = crop.shape[:2]
    isb = is_bg_arr(crop, blue=(name == 'time_warp'))
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
