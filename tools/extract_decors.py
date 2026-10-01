import numpy as np
from PIL import Image, ImageDraw
from collections import deque
import os

# Extraction de TOUS les assets des planches niveaux v5 (plaines), v6 (usine
# de magma) et v7 (manoir hanté) — décors d'ambiance et textures de
# plateformes — en complément de tools/extract_v5.py (fonds bg_level1..3 et
# tuiles tile_volcanic/tile_manor, déjà en jeu).
#
# Méthode (même chaîne que extract_v5.py) :
# - le fond gris uni (#728188) est détouré par diffusion depuis les bords du
#   crop (ne traverse jamais les couleurs vives du sprite) ;
# - dans chaque groupe (bornes lues sur la planche), les items sont séparés
#   automatiquement par composantes connexes de pixels non-fond, fusionnées
#   quand leurs boîtes sont proches (merge_radius) ;
# - les étiquettes de texte sont écartées par taille (les lettres font
#   ~8-13px, les items >= 15px) ;
# - les panneaux « CONSERVÉS / RAPPEL » (UI, slime, collectables, ennemi)
#   ne sont PAS découpés : leur contenu est déjà en jeu (planches v1-v4).
#
# Sorties : ASSETS/sprites/v5/ (convention LISEZ-MOI, planches v5-v7) puis
# copie vers ASSETS/sprites/game/ (seul dossier chargé par js/sprites.js).
# Contrôle visuel : /tmp/opencode/check_decors.png (planche de contact) et
# /tmp/opencode/zoom/overlay_vN.png (rects verts = gardés, rouges = écartés).

V5 = 'ASSETS/planches/v5-niveau1-plaines.jpg'
V6 = 'ASSETS/planches/v6-niveau2-magma.jpg'
V7 = 'ASSETS/planches/v7-niveau3-manoir.jpg'
OUT = 'ASSETS/sprites/v5'
GAME = 'ASSETS/sprites/game'
os.makedirs(OUT, exist_ok=True)

MIN_DIM = 13     # côté minimum d'un item (les lettres font 8-13px)
MIN_AREA = 220   # aire minimum en pixels
MERGE_RADIUS = 3 # fusion des composantes proches (anti-chaînage de rangée)


def bg_mask(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    return ((mx - mn) < 26) & (mx > 90)


def detour(im, tight=False):
    # fond gris -> transparence : diffusion depuis les bords du crop.
    # tight=True : fond local estimé (médiane des bords du crop) et distance
    # couleur < 14 — pour les sprites pâles (roches, dalles) dont la face,
    # trop proche du fond planche, est mangée par le masque générique.
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    if tight:
        border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
        bmx = border.max(axis=1)
        bmn = border.min(axis=1)
        ok = ((bmx - bmn) < 26) & (bmx > 90)   # pixels de bordure « fond »
        bg = np.median(border[ok], axis=0) if ok.any() else np.median(border,
                                                                        axis=0)
        dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
        isb = dist < 16
        # les lignes de grille de la planche (gris neutre, plus sombre que le
        # fond) ne doivent pas rester opaques : on mange les structures fines
        # 1-2px de gris neutre — les faces pleines (dalles, pierres) et les
        # contours saturés des sprites y échappent.
        gmx = a.max(axis=2)
        gmn = a.min(axis=2)
        gridish = ((gmx - gmn) < 20) & (gmx > 95) & (gmx < 140)
        er = gridish[1:-1, 1:-1] & gridish[:-2, 1:-1] & gridish[2:, 1:-1] \
            & gridish[1:-1, :-2] & gridish[1:-1, 2:]
        thin = np.zeros_like(gridish)
        thin[1:-1, 1:-1] = gridish[1:-1, 1:-1] & ~er
        isb = isb | thin
    else:
        isb = bg_mask(a)
    h, w = isb.shape
    bgm = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if isb[y, x] and not bgm[y, x]:
                bgm[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if isb[y, x] and not bgm[y, x]:
                bgm[y, x] = True
                q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and isb[ny, nx] and not bgm[ny, nx]:
                bgm[ny, nx] = True
                q.append((ny, nx))
    alpha = np.full((h, w), 255, np.uint8)
    alpha[bgm] = 0
    return alpha


# --- groupes ---------------------------------------------------------------
# Deux formes :
# - (planche, boîte, noms, options) : segmentation auto dans la boîte ;
#   options : merge_all, merge_radius (défaut 3), single_box (tout le crop =
#   un sprite, pour les dalles à faible contraste que la segmentation fragments).
# - (planche, (y0, y1), items) : items explicites [(nom, x0, x1), ...] — un
#   sprite par item, pour les rangées de décors où les halos JPEG fusionnent
#   les voisins. Bornes x mesurées au pixel sur les planches.
GROUPS = [
    # v5 — décors d'arrière-plan (3 rangées à droite ; y0=113 pour les items
    # de droite : échappe les oiseaux volant au-dessus, x 1220-1320)
    (V5, (90, 195), [
        ('dec_pine1', 705, 767), ('dec_pine2', 771, 835),
        ('dec_tree1', 836, 943), ('dec_tree2', 946, 1018),
        ('dec_tree_big', 1018, 1143), ('dec_bush1', 1156, 1190),
        ('dec_bush2', 1201, 1239, 113), ('dec_sprout1', 1256, 1279, 113),
        ('dec_sprout2', 1298, 1331, 113), ('dec_log1', 1346, 1380)]),
    (V5, (200, 331), [
        ('dec_pine6', 706, 760), ('dec_tree_yellow', 761, 816),
        ('dec_tree_cypress', 817, 849), ('dec_tree_round', 850, 920),
        ('dec_bush_trunk', 921, 952), ('dec_bush_leafy', 953, 996),
        ('dec_bush_fern', 1002, 1045), ('dec_rockpile_small', 1046, 1088),
        ('dec_rockpile_big', 1092, 1182), ('dec_rock_single', 1186, 1241),
        ('dec_flowers_purple', 1247, 1295), ('dec_flowers_white', 1297, 1348),
        ('dec_flowers_pink', 1350, 1380)]),
    (V5, (334, 424), [
        ('dec_pine3', 705, 761), ('dec_pine4', 762, 816),
        ('dec_pine5', 817, 861), ('dec_rockpile_mossy', 862, 952),
        ('dec_rock3', 953, 1002), ('dec_flowers3', 1003, 1052),
        ('dec_flowers4', 1053, 1098), ('dec_flowers5', 1099, 1143),
        ('dec_flowers6', 1144, 1198), ('dec_flowers7', 1199, 1247),
        ('dec_stump1', 1248, 1297), ('dec_stump_big', 1298, 1380)]),
    # v5 — plateformes standards (herbe / terre), 3 rangées x 2 moitiés
    (V5, (0, 459, 620, 539),
     ['plat_grass_1x1', 'plat_grass1', 'plat_grass2', 'plat_grass3',
      'plat_grass_flowers1', 'plat_grass_flowers2'], {}),
    (V5, (630, 459, 1380, 538),
     ['plat_dirt_wide', 'plat_mossy1', 'plat_mossy2', 'plat_mossy3',
      'plat_bridge1', 'plat_bridge2'], {}),
    (V5, (0, 569, 620, 638),
     ['plat_grass4', 'plat_grass5', 'plat_grass6', 'plat_grass7',
      'plat_grass8', 'plat_grass9'], {}),
    (V5, (630, 569, 1380, 638),
     ['plat_grass10', 'plat_mossy5', 'plat_mossy6', 'plat_bridge5',
      'plat_mini2', 'plat_mini_grass3'], {'merge_radius': 16}),
    (V5, (0, 669, 620, 728),
     ['plat_grass_1x1b', 'plat_grass_nue1', 'plat_grass_2x1',
      'plat_grass_nue2', 'plat_grass_3x1', 'plat_grass_flowers3'], {}),
    (V5, (669, 729), [
        ('plat_grass_flowers_wide', 624, 762), ('plat_path1', 778, 900),
        ('plat_path2', 915, 1035), ('plat_path3', 1048, 1170),
        ('plat_mini_grass2', 1185, 1266)]),
    # v6 — roche volcanique (existante mais jamais extraite en blocs)
    (V6, (523, 163, 948, 272),
     ['plat_volcanic_wide', 'plat_volcanic_top', 'plat_volcanic_corner'], {}),
    # v6 — grilles métalliques rivetées (nouvelle standard)
    (V6, (523, 330, 948, 540),
     ['plat_grid1', 'plat_grid2', 'plat_grid3', 'plat_grid4', 'plat_grid5',
      'plat_grid6', 'plat_grid7', 'plat_vent_small'], {}),
    (V6, (523, 595, 860, 752), ['plat_walkway'], {'merge_all': True}),
    (V6, (862, 595, 948, 752), ['plat_vent_riveted', 'plat_grate_small'], {}),
    # v6 — décors (tuyaux, roues, flammes « existants » jamais en jeu)
    (V6, (945, 157, 1215, 262), ['dec_pipe_elbow', 'dec_pipe_stub'], {}),
    (V6, (1215, 155, 1335, 242), ['dec_flamedrop', 'dec_flamedrops'], {}),
    (V6, (945, 310, 1212, 385), ['dec_wheel1', 'dec_wheel2', 'dec_wheel3'], {}),
    (V6, (1215, 288, 1335, 398), ['haz_flame'], {}),
    (V6, (940, 428, 1020, 752), ['dec_steam_vent', 'dec_fan', 'plat_plate'], {}),
    (V6, (1058, 452, 1345, 585), ['dec_steam_pipe', 'dec_console'], {}),
    (V6, (1058, 620, 1345, 735), ['dec_ladder', 'dec_lava_bubbles'],
     {'merge_radius': 25}),
    # v7 — plateformes pierre de manoir
    (V7, (60, 466, 940, 539),
     ['plat_stone_1x1', 'plat_stone_2x1', 'plat_stone_3x1'], {}),
    (V7, (60, 573, 940, 640),
     ['plat_stone_web', 'plat_stone_worn', 'plat_stone_broken'],
     {'tight': True}),
    (V7, (60, 672, 940, 718),
     ['plat_slab_mini', 'plat_path_broken', 'plat_wood'], {}),
    # v7 — décors et hazards du manoir
    (V7, (945, 86, 1350, 252),
     ['dec_chandelier_gold', 'dec_chandelier_dark1', 'dec_candle_wall',
      'dec_candle1', 'dec_chandelier_dark2', 'dec_candle2',
      'haz_shadow_eyes'], {}),
    (V7, (955, 360, 1380, 504),
     ['dec_clock', 'dec_armchair', 'dec_books', 'dec_cauldron'], {}),
]

def components(alpha):
    # étiquetage des composantes connexes de pixels opaques
    h, w = alpha.shape
    seen = np.zeros((h, w), bool)
    comps = []
    for sy in range(h):
        for sx in range(w):
            if alpha[sy, sx] == 0 or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            x0, x1, y0, y1, area = sx, sx, sy, sy, 0
            while q:
                cy, cx = q.popleft()
                area += 1
                x0, x1 = min(x0, cx), max(x1, cx)
                y0, y1 = min(y0, cy), max(y1, cy)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] \
                            and alpha[ny, nx] > 0:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            comps.append([x0, y0, x1 + 1, y1 + 1, area])
    return comps


def merge(comps, radius):
    # union-find sur les boîtes proches (gap <= radius sur les 2 axes)
    n = len(comps)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            a, b = comps[i], comps[j]
            dx = max(0, a[0] - b[2], b[0] - a[2])
            dy = max(0, a[1] - b[3], b[1] - a[3])
            if dx <= radius and dy <= radius:
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[ri] = rj
    groups = {}
    for i, c in enumerate(comps):
        groups.setdefault(find(i), []).append(c)
    out = []
    for g in groups.values():
        x0 = min(c[0] for c in g)
        y0 = min(c[1] for c in g)
        x1 = max(c[2] for c in g)
        y1 = max(c[3] for c in g)
        out.append([x0, y0, x1, y1, sum(c[4] for c in g)])
    return out


def rows_order(boxes):
    # tri « par rangées puis de gauche à droite » : regroupement en lignes
    # par centre y (tolérance relative à la hauteur médiane)
    boxes = sorted(boxes, key=lambda b: (b[1] + b[3]) / 2)
    med_h = sorted(b[3] - b[1] for b in boxes)[len(boxes) // 2] if boxes else 0
    tol = max(14, med_h * 0.6)
    rows = []
    for b in boxes:
        cy = (b[1] + b[3]) / 2
        if rows and abs(cy - rows[-1][0]) <= tol:
            rows[-1][1].append(b)
            n = len(rows[-1][1])
            rows[-1][0] = (rows[-1][0] * (n - 1) + cy) / n
        else:
            rows.append([cy, [b]])
    out = []
    for _, r in rows:
        out.extend(sorted(r, key=lambda b: b[0]))
    return out


planche_imgs = {}
overlay = {}
sprites = []  # (name, RGBA)
warnings = []


def load_planche(src):
    key = os.path.basename(src)
    if key not in planche_imgs:
        im = Image.open(src).convert('RGB')
        planche_imgs[key] = (im, im.copy())
    return planche_imgs[key]


def add_item(name, crop, alpha, b, dr, gx0, gy0):
    pad = 2
    bx0 = max(0, b[0] - pad)
    by0 = max(0, b[1] - pad)
    bx1 = min(crop.width, b[2] + pad)
    by1 = min(crop.height, b[3] + pad)
    arr = np.asarray(crop)
    rgba = np.dstack([arr[by0:by1, bx0:bx1, 0], arr[by0:by1, bx0:bx1, 1],
                      arr[by0:by1, bx0:bx1, 2], alpha[by0:by1, bx0:bx1]])
    sprites.append((name, Image.fromarray(rgba, 'RGBA')))
    if dr:
        dr.rectangle([gx0 + bx0, gy0 + by0, gx0 + bx1, gy0 + by1],
                     outline=(0, 255, 60), width=2)
        dr.text((gx0 + bx0, max(0, gy0 + by1 + 1)), name, fill=(255, 255, 0))


for entry in GROUPS:
    if len(entry) == 3:
        src, (gy0, gy1), items = entry          # rangée à items explicites
        for item in items:
            name, gx0, gx1 = item[:3]
            iy0 = item[3] if len(item) > 3 else gy0
            im, ov = load_planche(src)
            box = (gx0, iy0, gx1, gy1)
            crop = im.crop(box)
            alpha = detour(crop, tight=True)
            ys, xs = np.where(alpha > 0)
            if not len(xs):
                warnings.append(f'{name}: vide')
                continue
            add_item(name, crop, alpha,
                     [int(xs.min()), int(ys.min()), int(xs.max()) + 1,
                      int(ys.max()) + 1], ImageDraw.Draw(ov), gx0, gy0)
        continue
    src, box, names, opt = entry
    im, ov = load_planche(src)
    x0, y0, x1, y1 = box
    crop = im.crop(box)
    alpha = detour(crop, tight=opt.get('tight', False))
    dr = ImageDraw.Draw(ov)
    if opt.get('single_box'):
        ys, xs = np.where(alpha > 0)
        add_item(names[0], crop, alpha,
                 [int(xs.min()), int(ys.min()), int(xs.max()) + 1,
                  int(ys.max()) + 1], dr, x0, y0)
        continue
    comps = components(alpha)
    merged = merge(comps, opt.get('merge_radius', MERGE_RADIUS))
    if opt.get('merge_all'):
        merged = merge(merged, 10 ** 6)
    keep, drop = [], []
    for b in merged:
        w, h = b[2] - b[0], b[3] - b[1]
        if min(w, h) >= opt.get('min_dim', MIN_DIM) and \
                b[4] >= opt.get('min_area', MIN_AREA):
            keep.append(b)
        else:
            drop.append(b)
    keep = rows_order(keep)
    for b in drop:  # écartés (texte, débris) : rects rouges fins
        dr.rectangle([x0 + b[0], y0 + b[1], x0 + b[2], y0 + b[3]],
                     outline=(255, 60, 60), width=1)
    if len(keep) != len(names):
        warnings.append(f'{os.path.basename(src)} {box}: {len(keep)} items '
                        f'pour {len(names)} noms')
    for i, b in enumerate(keep):
        add_item(names[i] if i < len(names) else f'?_{i}', crop, alpha,
                 b, dr, x0, y0)

for key, (im, ov) in planche_imgs.items():
    tag = key.split('-')[0]
    ov.save(f'/tmp/opencode/zoom/overlay_{tag}.png')

for name, sp in sprites:
    sp.save(f'{OUT}/{name}.png')
    print(f'{name}.png {sp.width}x{sp.height}')

if warnings:
    print('\nATTENTION — comptes inattendus :')
    for w in warnings:
        print(' -', w)

# --- planche de contact sur fond en damier (transparence visible) ----------
def checker(w, h, s=8):
    a = np.zeros((h, w, 3), np.uint8)
    for yy in range(0, h, s):
        for xx in range(0, w, s):
            c = 90 if (xx // s + yy // s) % 2 else 60
            a[yy:yy + s, xx:xx + s] = c
    return Image.fromarray(a, 'RGB')


COLS, CELL = 10, 120
rows = (len(sprites) + COLS - 1) // COLS
sheet = checker(COLS * CELL, rows * (CELL + 16))
dr = ImageDraw.Draw(sheet)
for i, (name, sp) in enumerate(sprites):
    cx, cy = (i % COLS) * CELL, (i // COLS) * (CELL + 16)
    t = sp.copy()
    t.thumbnail((CELL - 8, CELL - 8), Image.NEAREST)
    sheet.paste(t, (cx + 4, cy + 4), t)
    dr.text((cx + 4, cy + CELL + 2), name, fill=(255, 255, 255))
sheet.save('/tmp/opencode/check_decors.png')
print(f'\n-> {len(sprites)} sprites, planche /tmp/opencode/check_decors.png')
