from PIL import Image
import numpy as np
from collections import deque
import os

# v4 : séquence LEDGE CATCH « remontée » extraite de ASSETS/v4.png par
# tools/extract_v4.py -> ASSETS/sprites/v4/ledge_pull{0,1,2}.png.
# Le bloc brun/pierre de la planche est effacé (la plateforme du jeu fournit
# elle-même le rebord), puis chaque frame est calée sur le même canevas que la
# v3 (LEDGE_W/H/GRIP/BLOCK_L, cf. js/game.js) : haut du bloc = ligne des bras
# = sommet de plateforme, face gauche du bloc = bord de plateforme. Le
# déplacement du slime (drapé sur le coin -> hissé dessus) est ainsi intégré
# aux frames ; le jeu n'a qu'à les enchainer.
# Les jauges v4 (gauge_slow/mid/fast/veryfast + gauge_alt) sont copiées telles
# quelles dans ASSETS/sprites/game/.

V4 = 'ASSETS/sprites/v4'
OUT = 'ASSETS/sprites/game'
os.makedirs(OUT, exist_ok=True)
TIERS = {'orange': (255, 157, 46), 'red': (226, 59, 59)}

LEDGE_W, LEDGE_H, LEDGE_GRIP, LEDGE_BLOCK_L = 320, 320, 150, 110


def load4(n):
    return Image.open(f'{V4}/{n}.png').convert('RGBA')


def save(im, name):
    im.save(f'{OUT}/{name}.png')
    print(name, im.size)


def recolor_slime(im, target):
    # Teinte uniquement les pixels verts du slime (g dominant) : yeux,
    # contours et résidus éventuels du décor restent inchangés.
    a = np.asarray(im).astype(np.int16)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    L = (0.30 * r + 0.59 * g + 0.11 * b) / 255.0
    k = 0.55 + 0.65 * L
    green = (g > r + 10) & (g > b + 10) & (al > 0)
    out = a.copy()
    for i in range(3):
        ch = out[:, :, i]
        ch[green] = np.minimum(255, (target[i] * k)[green]).astype(np.int16)
    return Image.fromarray(out.astype(np.uint8), 'RGBA')


def block_masks(a):
    # Masques du bloc v4 : brun ( dessus + coulures ), pierre bleutée,
    # contours sombres chauds (brun) ou froids (pierre), et le sable clair de
    # la flèche « -> » de la planche (fragment au bord du crop).
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    mx = np.maximum(np.maximum(r, g), b)
    brown = (al > 0) & (r > g + 20) & (r > b + 25)
    stone = (al > 0) & (b > r + 20) & (b > g + 5)
    dark_warm = (al > 0) & (mx < 110) & (r > g) & (b < g + 12)
    dark_cool = (al > 0) & (mx < 110) & (b > r + 8)
    sand = (al > 0) & (r > 200) & (g > 150) & (b > 60) & (r > b + 80) & (g > b + 40)
    return brown | stone | dark_warm | dark_cool | sand


def erase_block(im):
    a = np.asarray(im).copy()
    a4 = a.astype(np.int16)
    a4[:, :, 3][block_masks(a4)] = 0
    # poussiers : on ne garde que les composantes connexes d'au moins 40 px
    al = a4[:, :, 3]
    opaque = al > 0
    seen = np.zeros(al.shape, dtype=bool)
    keep = np.zeros(al.shape, dtype=bool)
    for sy, sx in zip(*np.where(opaque)):
        if seen[sy, sx]:
            continue
        comp = [(sy, sx)]
        seen[sy, sx] = True
        qq = deque(comp)
        while qq:
            cy, cx = qq.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < al.shape[0] and 0 <= nx < al.shape[1] \
                            and opaque[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        comp.append((ny, nx))
                        qq.append((ny, nx))
        if len(comp) >= 40:
            for cy, cx in comp:
                keep[cy, cx] = True
    a4[:, :, 3][~keep] = 0
    return Image.fromarray(a4.astype(np.uint8), 'RGBA')


def grip_align(im):
    # Cale la face gauche du bloc sur LEDGE_BLOCK_L et le haut du bloc sur
    # LEDGE_GRIP. La face = première colonne de bloc soutenue (>= 40 px) moins
    # 15 px de contour ; insensible aux décalages d'extraction. (Le slime
    # assis sur le bloc dans pull1/pull2 masque le milieu de l'arête : les
    # profils de lignes/colonnes restent dominés par le bloc.)
    a = np.asarray(im).astype(np.int16)
    block = block_masks(a)
    rows = np.where(block.sum(axis=1) > 8)[0]
    prof = block[rows.min():rows.min() + 80, :].sum(axis=0)
    cols = np.where(prof >= 40)[0]
    face = int(cols.min()) - 15
    canvas = Image.new('RGBA', (LEDGE_W, LEDGE_H), (0, 0, 0, 0))
    canvas.alpha_composite(im, (LEDGE_BLOCK_L - face, LEDGE_GRIP - int(rows[0])))
    return canvas


frames = {}
for src, name in [('ledge_pull0', 'ledge'), ('ledge_pull1', 'ledgeUp'), ('ledge_pull2', 'ledgeTop')]:
    im = erase_block(grip_align(load4(src)))
    frames[name] = im
    save(im, name)
for name, im in frames.items():
    for tier, col in TIERS.items():
        save(recolor_slime(im, col), f'{name}_{tier}')

# Jauges vitesse caméra v4 : cadran par état + jauge verticale alternative.
for src in ('gauge_slow', 'gauge_mid', 'gauge_fast', 'gauge_veryfast', 'gauge_alt'):
    save(load4(src), src)

# Mesure du centre du slime dans ledgeTop (assise finale) : sert au jeu pour
# poser le slime à la fin de la remontée (fraction du canevas, cf. game.js).
a = np.asarray(frames['ledgeTop'])
ys, xs = np.where(a[:, :, 3] > 0)
cx = (xs.min() + xs.max() + 1) / 2
print(f'LEDGE_TOP_CX = {cx:.0f}  (barycentre bbox, face bloc a {LEDGE_BLOCK_L})')
