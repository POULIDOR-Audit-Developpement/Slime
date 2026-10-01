from PIL import Image
import numpy as np
from collections import deque
import os

# v4 : séquence LEDGE CATCH « remontée » extraite de
# ASSETS/planches/v4-ledge-catch.png par
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

# Canevas des frames ledge, agrandi à 400x420 pour loger le slime à la taille
# v3 (~208 px) : la ligne des bras (haut du bloc = sommet de plateforme) est à
# LEDGE_GRIP, la face gauche du bloc à LEDGE_BLOCK_L. 210 px au-dessus de la
# ligne (la tête du slime en traction monte haut) ; constantes répercutées
# dans js/game.js (LEDGE_*).
LEDGE_W, LEDGE_H, LEDGE_GRIP, LEDGE_BLOCK_L = 400, 420, 210, 138


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
    # composantes connexes : on ne garde que la plus grande (le slime, yeux
    # compris — ils touchent son contour). Élimine îlots de damier emprisonnés
    # et résidus de bloc/flèche.
    al = a4[:, :, 3]
    opaque = al > 0
    seen = np.zeros(al.shape, dtype=bool)
    best, best_sz = None, 0
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
        if len(comp) > best_sz:
            best, best_sz = comp, len(comp)
    keep = np.zeros(al.shape, dtype=bool)
    for cy, cx in best:
        keep[cy, cx] = True
    a4[:, :, 3][~keep] = 0
    return Image.fromarray(a4.astype(np.uint8), 'RGBA')


def grip_align(im):
    # Cale la face gauche du bloc sur LEDGE_BLOCK_L et le haut du bloc sur
    # LEDGE_GRIP. Seuils robustes : une LIGNE de bloc porte > 25 % de la
    # largeur (la bouche du slime ou le contour d'une flèche ne passent pas)
    # et une COLONNE de face porte > 45 % de la hauteur du bloc (le slime
    # assis ou drapé non plus). Le slime agrandi peut déborder du canevas :
    # on rogne la source (bords transparents ou bloc voué à l'effacement)
    # au lieu de coller en coordonnées négatives (refusées par alpha_composite).
    a = np.asarray(im).astype(np.int16)
    block = block_masks(a)
    rows = np.where(block.sum(axis=1) > 0.25 * im.width)[0]
    top, bot = rows.min(), rows.max()
    prof = block[top:bot, :].sum(axis=0)
    cols = np.where(prof >= 0.45 * (bot - top))[0]
    dx, dy = LEDGE_BLOCK_L - int(cols.min()), LEDGE_GRIP - int(top)
    sx0, sy0 = max(0, -dx), max(0, -dy)
    sx1, sy1 = min(im.width, LEDGE_W - dx), min(im.height, LEDGE_H - dy)
    canvas = Image.new('RGBA', (LEDGE_W, LEDGE_H), (0, 0, 0, 0))
    canvas.alpha_composite(im.crop((sx0, sy0, sx1, sy1)), (dx + sx0, dy + sy0))
    return canvas


# Normalisation de taille : le slime doit occuper la même place dans le
# canevas que dans les frames v3 (~208 px de large, cf. l'ancien ledge.png)
# sinon il paraît deux fois trop petit à l'écran. Facteur par frame (poses
# de proportions différentes) calculé sur la largeur du corps (pixels verts).
def slime_width(im):
    a = np.asarray(im).astype(np.int16)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    green = (g > r + 10) & (g > b + 10) & (al > 0)
    xs = np.where(green)[1]
    return int(xs.max() - xs.min() + 1)


SLIME_TARGET_W = 208

frames = {}
for src, name in [('ledge_pull0', 'ledge'), ('ledge_pull1', 'ledgeUp'), ('ledge_pull2', 'ledgeTop')]:
    im = load4(src)
    f = SLIME_TARGET_W / slime_width(im)
    im = im.resize((round(im.width * f), round(im.height * f)), Image.NEAREST)
    print(f'{src}: facteur {f:.2f} -> slime {slime_width(im)} px')
    im = erase_block(grip_align(im))
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
