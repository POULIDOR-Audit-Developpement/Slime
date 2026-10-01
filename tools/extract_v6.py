import numpy as np
from PIL import Image
from collections import deque
import os

# Extraction de la NOUVELLE animation LEDGE CATCH (planche v8, 929x224) :
# 3 frames séparées par des bandes navy (~x=293-300 et x=634-640) —
# 1. pendu au coin (accroche), 2. traction (effort), 3. assis sur le bord.
# Le fond gris uni (#728188) est détouré par diffusion depuis les bords ; le
# bloc de tuiles vertes est CONSERVÉ ici (effacé par tools/make_v6_sprites.py,
# la plateforme du jeu fournit le rebord — même chaîne que la v4).
SRC = 'ASSETS/planches/v8-ledge-catch.png'
OUT = 'ASSETS/sprites/v6'
os.makedirs(OUT, exist_ok=True)

# bornes lues sur la planche : séparateurs exclus
FRAMES = {
    'ledge_pull0': (0, 292),    # pendu au coin
    'ledge_pull1': (302, 633),  # traction
    'ledge_pull2': (642, 929),  # assis sur le bord
}

im = Image.open(SRC).convert('RGB')
a = np.asarray(im).astype(np.int16)


def is_bg_arr(arr):
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    return ((mx - mn) < 26) & (mx > 90)


for name, (x0, x1) in FRAMES.items():
    crop = a[:, x0:x1]
    ch, cw = crop.shape[:2]
    isb = is_bg_arr(crop)
    bgm = np.zeros((ch, cw), dtype=bool)
    q = deque()
    for x in range(cw):
        for y in (0, ch - 1):
            if isb[y, x] and not bgm[y, x]:
                bgm[y, x] = True
                q.append((y, x))
    for y in range(ch):
        for x in (0, cw - 1):
            if isb[y, x] and not bgm[y, x]:
                bgm[y, x] = True
                q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < ch and 0 <= nx < cw and isb[ny, nx] and not bgm[ny, nx]:
                bgm[ny, nx] = True
                q.append((ny, nx))
    alpha = np.full((ch, cw), 255, dtype=np.uint8)
    alpha[bgm] = 0
    ys, xs = np.where(alpha > 0)
    xa, xb, ya, yb = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([crop[:, :, 0].astype(np.uint8), crop[:, :, 1].astype(np.uint8),
                      crop[:, :, 2].astype(np.uint8), alpha])[ya:yb, xa:xb]
    Image.fromarray(rgba, 'RGBA').save(f'{OUT}/{name}.png')
    print(f'{name}.png {xb - xa}x{yb - ya}')
