from PIL import Image
import numpy as np
from collections import deque
import os

# v6 : NOUVELLE animation LEDGE CATCH extraite de
# ASSETS/planches/v8-ledge-catch.png par tools/extract_v6.py ->
# ASSETS/sprites/v6/ledge_pull{0,1,2}.png (slime sur blocs de tuiles vertes).
# Le bloc de tuiles et le slime partagent des verts proches (JPEG) : la
# couleur seule ne suffit pas. Stratégie :
#   1. le bloc est un rectangle à position FIXE (feuille alignée) ; sa moitié
#      droite n'est JAMAIS recouverte par le slime -> mesure propre du rect
#      (haut des tuiles, bas de la face navy, bord droit, bord gauche lu sous
#      le menton) ;
#   2. effacement à l'échelle BRUTE : dans le rect, on ne tue que les pixels
#      à ±6 de la PALETTE EXACTE du bloc (échantillonnée sur sa moitié
#      droite), en épargnant le contour noir-vert du slime (≤ 1 px du lime,
#      b <= g — les noirs bleutés navy ont b > g) ;
#   3. PUIS mesure de la largeur du slime sur l'image détourée (vraie largeur
#      visuelle, contours compris), resize vers 208 px, et calage sur le
#      canevas LEDGE par simple report de coordonnées (plus de re-détection).
V6 = 'ASSETS/sprites/v6'
OUT = 'ASSETS/sprites/game'
os.makedirs(OUT, exist_ok=True)
TIERS = {'orange': (255, 157, 46), 'red': (226, 59, 59)}

# Canevas des frames ledge — mêmes constantes que la v4 (répercutées dans
# js/game.js : LEDGE_*).
LEDGE_W, LEDGE_H, LEDGE_GRIP, LEDGE_BLOCK_L = 400, 420, 210, 138
SLIME_TARGET_W = 208


def load6(n):
    return Image.open(f'{V6}/{n}.png').convert('RGBA')


def save(im, name):
    im.save(f'{OUT}/{name}.png')
    print(name, im.size)


def strict_tile(a):
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    return (al > 0) & (g >= 150) & (g <= 172) & (g > r + 60) & (b >= 38)


def block_rect(a):
    # Rect du bloc mesuré sans contamination :
    # - moitié droite : jamais recouverte par le slime -> ty0 (haut des
    #   tuiles), tx1 (bord droit), by1 (bas de la face navy) fiables ;
    # - tx0 (bord gauche) : première colonne de tuiles sous le menton
    #   (rangées ty0+30..ty0+60), là où la face gauche est exposée.
    tile = strict_tile(a)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    navy = (al > 0) & (r < 20) & (g < 20) & (b >= 25) & (b <= 52)
    W = a.shape[1]
    right = tile[:, W // 2:]
    rowdens = right.sum(axis=1)
    ty0 = int(np.argmax(rowdens > 8))
    coldens = tile[ty0:ty0 + 40, :].sum(axis=0)
    tx1 = int(np.where(coldens > 3)[0].max())
    facedens = navy.sum(axis=1)
    face = np.where(facedens > 0.3 * (tx1 - W // 2))[0]
    face = face[face > ty0 + 20]
    by1 = int(face.max()) + 1 if len(face) else ty0 + 100
    rows = slice(ty0 + 30, min(by1 - 5, ty0 + 60))
    coldens2 = tile[rows, :].sum(axis=0)
    tx0 = int(np.where(coldens2 > 3)[0].min())
    return tx0, ty0, tx1, by1


def block_palette(a, rect):
    # Palette EXACTE du bloc, échantillonnée sur sa moitié droite (pure) :
    # couleurs représentées par >= 30 px. Le slime n'y a pas part.
    tx0, ty0, tx1, by1 = rect
    mid = (tx0 + tx1) // 2
    reg = a[ty0:by1, mid:tx1]
    op = reg[:, :, 3] > 0
    px = reg[op][:, :3]
    cnt = {}
    for t in map(tuple, px):
        cnt[t] = cnt.get(t, 0) + 1
    return np.array([c for c, n in cnt.items() if n >= 30], dtype=np.int16)


def near_palette(a, pal, tol=6):
    # pixel à tol de n'importe quelle entrée de la palette (par canal)
    d = np.full(a.shape[:2], 9999, np.int16)
    for p in pal:
        dist = np.abs(a[:, :, :3] - p[None, None, :]).sum(axis=2)
        d = np.minimum(d, dist)
    return d <= tol * 3


def near_mask(mask, r=1):
    out = np.zeros_like(mask)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            out |= np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
    return out


def erase_block(im):
    a = np.asarray(im).astype(np.int16)
    rect = block_rect(a)
    tx0, ty0, tx1, by1 = rect
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    al = a[:, :, 3]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    op = al > 0
    # graines : lime vif (b < 40 exclut le reflet haut des tuiles #91e559),
    # reflets pâles, contour noir-vert (b <= g — les noirs bleutés navy ont
    # b > g). Le corps du slime est ensuite reconstruit par diffusion bornée
    # (profondeur 6) à travers tout SAUF les remplissages étanches du bloc
    # (tuile stricte, face navy, reflet haut) — les verts moyens du ventre
    # (g 150-177) sont partagés avec la tuile #21a130 : seule la connexité
    # au corps les sauve, jamais la couleur.
    bright = op & (g >= 178) & (b < 40)
    whiteish = op & (mx >= 170) & (mx - mn < 60)
    keep_outline = (mx < 40) & (b <= g) & near_mask(bright, 1)
    tile = strict_tile(a)
    navy = op & (r < 20) & (g < 20) & (b >= 25) & (b <= 52)
    hi = op & (g >= 178) & (b >= 55)
    barrier = tile | navy | hi
    # le noir ne se diffuse PAS (grille des tuiles, lignes noires du bloc) :
    # il ne survit que via keep_outline (≤ 1 px du lime)
    medium = op & ~barrier & ~(mx < 40)
    seeds = bright | whiteish | keep_outline
    # diffusion multi-sources, profondeur max 6 (BFS)
    keep = seeds.copy()
    frontier = seeds.copy()
    for _ in range(6):
        step = near_mask(frontier, 1) & medium & ~keep
        if not step.any():
            break
        keep |= step
        frontier = step
    # zone des pattes/menton (sur les tuiles, à gauche du bloc) : diffusion
    # prolongée — les remplissages de tuiles, étanches, bornent la diffusion
    zx0, zx1 = max(0, tx0 - 12), tx0 + 90
    zy0, zy1 = max(0, ty0 - 16), min(a.shape[0], ty0 + 12)
    zone = np.zeros(a.shape[:2], bool)
    zone[zy0:zy1, zx0:zx1] = True
    frontier = (keep & zone).copy()
    for _ in range(24):
        step = near_mask(frontier, 1) & medium & zone & ~keep
        if not step.any():
            break
        keep |= step
        frontier = step
    keep |= keep_outline
    kill = np.zeros(a.shape[:2], bool)
    # bande horizontale du bloc vers la DROITE entière : le slime ne vit
    # jamais à droite du bloc, tous ses halos (bord droit, arêtes, grille)
    # tombent quel que soit leur éloignement ; à GAUCHE, 12 px de marge
    # englobent le contour du bloc (la queue du slime qui pend le long de la
    # face reste protégée par les classes conservées)
    kill[max(0, ty0 - 4):by1 + 8, max(0, tx0 - 12):] = True
    # coulures sombres sous le coin du bloc (sous la face navy)
    kill[by1 - 2:, max(0, tx0 - 12):tx0 + 130] = True
    # ligne noire du haut de tuile (y ∈ [ty0-14, ty0]) : noire à plus de 3 px
    # de tout pixel slime conservé — la patte qui pose reste jointe, le bout
    # de ligne libre saute
    strip = np.zeros(a.shape[:2], bool)
    strip[max(0, ty0 - 14):ty0, max(0, tx0 - 12):] = True
    kill |= strip & (mx < 40) & ~near_mask(keep, 3)
    kill &= ~keep
    al[kill] = 0
    # miettes et halos : on garde les composantes >= 80 px SAUF celles à
    # dominance grise (halo JPEG du bord du bloc — le slime est saturé,
    # jamais gris)
    opaque = al > 0
    seen = np.zeros(al.shape, bool)
    for sy, sx in zip(*np.where(opaque)):
        if seen[sy, sx]:
            continue
        comp = [(sy, sx)]
        seen[sy, sx] = True
        q = deque(comp)
        while q:
            cy, cx = q.popleft()
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < al.shape[0] and 0 <= nx < al.shape[1] \
                            and opaque[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        comp.append((ny, nx))
                        q.append((ny, nx))
        grayish = 0
        for cy, cx in comp:
            if mx[cy, cx] - mn[cy, cx] < 26 and mx[cy, cx] > 60:
                grayish += 1
        if len(comp) < 80 or grayish >= 0.5 * len(comp):
            for cy, cx in comp:
                al[cy, cx] = 0
    return Image.fromarray(a.astype(np.uint8), 'RGBA'), rect


def recolor_slime(im, target):
    # Teinte uniquement les pixels verts du slime (g dominant) : yeux,
    # contours et reflets restent inchangés.
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


frames = {}
meta = {}
for src, name in [('ledge_pull0', 'ledge'), ('ledge_pull1', 'ledgeUp'), ('ledge_pull2', 'ledgeTop')]:
    im = load6(src)
    im, rect = erase_block(im)
    # vraie largeur visuelle du slime (seul contenu restant, contours compris)
    aa = np.asarray(im)
    ys, xs = np.where(aa[:, :, 3] > 0)
    w = int(xs.max() - xs.min() + 1)
    f = SLIME_TARGET_W / w
    im2 = im.resize((round(im.width * f), round(im.height * f)), Image.NEAREST)
    print(f'{src}: largeur {w} px, facteur {f:.2f}')
    # calage : haut du bloc -> LEDGE_GRIP, face gauche -> LEDGE_BLOCK_L
    tx0, ty0, tx1, by1 = rect
    dx, dy = LEDGE_BLOCK_L - round(tx0 * f), LEDGE_GRIP - round(ty0 * f)
    canvas = Image.new('RGBA', (LEDGE_W, LEDGE_H), (0, 0, 0, 0))
    sx0, sy0 = max(0, -dx), max(0, -dy)
    sx1 = min(im2.width, LEDGE_W - dx)
    sy1 = min(im2.height, LEDGE_H - dy)
    canvas.alpha_composite(im2.crop((sx0, sy0, sx1, sy1)), (dx + sx0, dy + sy0))
    frames[name] = canvas
    meta[name] = (f, dx, dy)
    save(canvas, name)
for name, im in frames.items():
    for tier, col in TIERS.items():
        save(recolor_slime(im, col), f'{name}_{tier}')

# Mesure du centre du slime dans ledgeTop (assise finale) : sert au jeu pour
# poser le slime à la fin de la remontée (fraction du canevas, cf. game.js).
a = np.asarray(frames['ledgeTop'])
ys, xs = np.where(a[:, :, 3] > 0)
cx = (xs.min() + xs.max() + 1) / 2
print(f'LEDGE_TOP_CX = {cx:.0f}  (barycentre bbox, face bloc a {LEDGE_BLOCK_L})')

# planche de contrôle : les 3 frames alignées côte à côte
tile = Image.new('RGBA', (LEDGE_W * 3 + 40, LEDGE_H + 20), (90, 94, 102, 255))
for i, (x0, y0) in enumerate([(10, 10), (LEDGE_W + 20, 10), (LEDGE_W * 2 + 30, 10)]):
    tile.alpha_composite(frames[list(frames)[i]], (x0, y0))
tile.resize((tile.width // 2, tile.height // 2), Image.NEAREST).save('/tmp/opencode/check_ledge.png')
