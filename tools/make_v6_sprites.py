from PIL import Image
import numpy as np
from collections import deque
import os

# v6 : NOUVELLE animation LEDGE CATCH extraite de
# ASSETS/planches/v8-ledge-catch.png par tools/extract_v6.py ->
# ASSETS/sprites/v6/ledge_pull{0,1,2}.png (slime sur blocs de tuiles vertes).
# v6.1 : kill du bloc par palettes + géométrie — l'ancienne bande aveugle
# tuait les coulures du slime sur la face navy et le liseré de la queue
# (frames ledge/ledgeUp trouées, cf. demande « sprite troué »). Détail des
# règles dans erase_block().
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
    H, W = al.shape
    op = al > 0
    # graines : lime vif (b < 40 exclut le reflet haut des tuiles #91e559),
    # reflets pâles, contour noir-vert (b <= g — les noirs bleutés navy ont
    # b > g). Le corps du slime est ensuite reconstruit par diffusion bornée
    # à travers tout SAUF les remplissages étanches du bloc (tuile stricte,
    # face navy, reflet haut) — les verts moyens du ventre (g 150-177) sont
    # partagés avec la tuile #21a130 : seule la connexité au corps les sauve,
    # jamais la couleur.
    bright = op & (g >= 178) & (b < 40)
    whiteish = op & (mx >= 170) & (mx - mn < 60)
    keep_outline = (mx < 40) & (b <= g) & near_mask(bright, 1)
    tile = strict_tile(a)
    navy = op & (r < 20) & (g < 20) & (b >= 25) & (b <= 52)
    hi = op & (g >= 178) & (b >= 55)
    barrier = tile | navy | hi
    medium = op & ~barrier & ~(mx < 40)
    seeds = bright | whiteish | keep_outline
    keep = seeds.copy()
    frontier = seeds.copy()
    # profondeur 14 (au lieu de 6) : les plis profonds du drapé sur le coin
    # sont entourés de remplissages étanches (barrières) ; 6 px ne suffisaient
    # pas à rejoindre leur intérieur et le kill du bloc les grignotait.
    for _ in range(14):
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

    # --- géométrie de la FACE : tx0 du rect du bloc est contaminé par le
    # drapé (verts du slime classés tuile stricte — ex. pull0 : tx0=32 alors
    # que la face commence à 77). Toutes les zones géométriques s'ancrent sur
    # la bbox navy de la face.
    facedens = navy.sum(axis=1)
    face_rows = np.where(facedens > 0.3 * (tx1 - W // 2))[0]
    face_rows = face_rows[face_rows > ty0 + 20]
    face_top = int(face_rows.min()) if len(face_rows) else ty0 + 40
    facecols = np.where(navy[face_rows.min():by1, :].sum(axis=0) > 5)[0]
    nx0 = int(facecols.min()) if len(facecols) else tx0

    # --- queue le long de la face : diffusion prolongée à travers les sombres
    # du slime. La diffusion standard exclut mx < 40 -> queue déchiquetée.
    # sombres verts (b <= g) et sombres bleutés (b > g, la queue pendait
    # contre la face navy et son liseré a pris ses tons, ex. (0,0,18)) —
    # HORS classe navy explicite (remplissage de la face) ; la zone s'arrête
    # à nx0 + 2 donc pas de fuite dans la face.
    tailzone = np.zeros(a.shape[:2], bool)
    tailzone[max(0, ty0 - 16):min(H, by1 + 60), max(0, nx0 - 90):nx0 + 2] = True
    darkgreen = op & (mx < 40) & (b <= g)
    darkblue = op & (mx < 40) & (b > g) & ~((r < 20) & (g < 20) & (b >= 25))
    medium2 = medium | darkgreen | darkblue
    frontier = (keep & tailzone).copy()
    for _ in range(60):
        step = near_mask(frontier, 1) & medium2 & tailzone & ~keep
        if not step.any():
            break
        keep |= step
        frontier = step

    # --- drapé sur la tuile de gauche : sauvetage par dilatation bornée. Le
    # slime posé sur la tuile partage les couleurs du bloc (bordure
    # (22,140,54), verts moyens) : la couleur seule ne les distingue pas (cf.
    # remarque sur les verts du ventre). Un BFS de connexité fuit le long des
    # anneaux de bordure des tuiles -> dilatation simple : les pixels
    # bordure-tuile à <= 6 px du slime gardé rejoignent keep (3 passes =
    # jusqu'à ~18 px de profondeur) ; le reste du bloc meurt par ses palettes.
    tborder = op & ~barrier & near_palette(a, np.array([[22, 140, 54]], dtype=np.int16), 12)
    for _ in range(3):
        rescue = tborder & near_mask(keep, 6) & ~keep
        if not rescue.any():
            break
        keep |= rescue

    # --- kill du bloc : palettes + géométrie (v6.1). L'ancienne bande aveugle
    # tuait aussi les COULURES du slime sur la face navy (gris-bleu
    # (32,65,74)-ish, b > g comme la face) et la queue : d'où les frames
    # ledge/ledgeUp trouées. Désormais :
    #   · les palettes du bloc meurent partout (fill, bevel (35,113,65),
    #     bordure (22,140,54)) — sauf au contact du slime gardé ;
    #   · hors ZONE À COULURES, tout pixel du bloc non au contact du slime
    #     meurt (coutures, grille, bordures, halos JPEG) ;
    #   · dans la zone à coulures (face, sous la rangée de tuiles), seuls les
    #     sombres/gris-bleus non protégés par le cœur d'une coulure ou le
    #     corps meurent (grille débordante) — les coulures survivent.
    dripzone = np.zeros(a.shape[:2], bool)
    dripzone[face_top + 2:min(H, by1 + 6), max(0, nx0 - 14):min(W, nx0 + 80)] = True
    dripcore = dripzone & op & (b > g) & (mx < 100) & ~barrier
    driprotect = near_mask(dripcore, 2)
    keepnear = near_mask(keep, 2)
    mid = op & ~barrier & near_palette(a, np.array([[35, 113, 65]], dtype=np.int16), 10)
    kill = np.zeros(a.shape[:2], bool)
    band = np.zeros(a.shape[:2], bool)
    band[max(0, ty0 - 4):min(H, by1 + 8), max(0, tx0 - 12):] = True
    # zone sous la face (ancien kill « coulures sombres sous le coin »)
    below = np.zeros(a.shape[:2], bool)
    below[max(0, by1 - 2):, max(0, tx0 - 12):min(W, tx0 + 130)] = True
    kill |= band & (tile | navy | hi) & ~near_mask(keep, 1)
    kill |= (band | below) & mid & ~near_mask(keep, 2)
    kill |= (band | below) & tborder & ~near_mask(keep, 1)
    kill |= (band | below) & ~dripzone & ~keepnear
    strandkill = ((mx < 40) | ((b > g) & (mx - mn < 32))) & ~driprotect & ~keepnear
    kill |= (band | below) & dripzone & strandkill
    # ligne noire du haut de tuile (y ∈ [ty0-14, ty0]) : noire à plus de 3 px
    # de tout pixel slime conservé — la patte qui pose reste jointe, le bout
    # de ligne libre saute
    strip = np.zeros(a.shape[:2], bool)
    strip[max(0, ty0 - 14):ty0, max(0, tx0 - 12):] = True
    kill |= strip & (mx < 40) & ~near_mask(keep, 3)
    kill &= ~keep
    al[kill] = 0

    # --- comblement des trous dans la zone à coulures : la masse est un
    # mélange coulure/navy (coulures semi-transparentes + JPEG) ; chaque pixel
    # navy isolé tué y laisse un trou. Un pixel transparent dont les 24
    # voisins du carré 5x5 sont opaques reprend la couleur moyenne voisine.
    def box_cnt(mask, rad):
        m = mask.astype(np.int32)
        c = m.cumsum(0).cumsum(1)
        c = np.pad(c, ((1, 0), (1, 0)))
        HH, WW = m.shape
        ys = np.arange(HH)
        xs = np.arange(WW)
        y0 = np.clip(ys - rad, 0, HH)
        y1 = np.clip(ys + rad + 1, 0, HH)
        x0 = np.clip(xs - rad, 0, WW)
        x1 = np.clip(xs + rad + 1, 0, WW)
        return c[np.ix_(y1, x1)] - c[np.ix_(y0, x1)] - c[np.ix_(y1, x0)] + c[np.ix_(y0, x0)]
    full5 = 5 * 5
    for _ in range(2):
        cnt = box_cnt((al > 0) & dripzone, 2)
        fillable = dripzone & (al == 0) & (cnt >= full5 - 1)
        if not fillable.any():
            break
        for cy, cx in zip(*np.where(fillable)):
            y0, y1 = max(0, cy - 2), min(H, cy + 3)
            x0, x1 = max(0, cx - 2), min(W, cx + 3)
            reg = a[y0:y1, x0:x1]
            m = reg[:, :, 3] > 0
            al[cy, cx] = 255
            a[cy, cx, 0] = reg[:, :, 0][m].mean()
            a[cy, cx, 1] = reg[:, :, 1][m].mean()
            a[cy, cx, 2] = reg[:, :, 2][m].mean()
    # --- fermeture des fissures fines (1-2 px) le long du drapé : la colonne
    # d'effacement du bord de face peut laisser une fissure transparente au
    # contact du slime. Condition : >= 6 voisins opaques sur 8 ET (gauche+
    # droite ou haut+bas opaques) — les vrais creux ne remplissent pas.
    for _ in range(3):
        opq = al > 0
        shift = lambda dy, dx: np.roll(np.roll(opq, dy, 0), dx, 1)
        neigh = sum(shift(dy, dx).astype(np.int16)
                    for dy in (-1, 0, 1) for dx in (-1, 0, 1)) - opq.astype(np.int16)
        crack = (band | below) & ~opq & (neigh >= 6) & (shift(0, -1) & shift(0, 1) | shift(-1, 0) & shift(1, 0))
        if not crack.any():
            break
        for cy, cx in zip(*np.where(crack)):
            y0, y1 = max(0, cy - 1), min(H, cy + 2)
            x0, x1 = max(0, cx - 1), min(W, cx + 2)
            reg = a[y0:y1, x0:x1]
            m = reg[:, :, 3] > 0
            al[cy, cx] = 255
            a[cy, cx, 0] = reg[:, :, 0][m].mean()
            a[cy, cx, 1] = reg[:, :, 1][m].mean()
            a[cy, cx, 2] = reg[:, :, 2][m].mean()
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
