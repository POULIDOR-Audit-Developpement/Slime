from PIL import Image
import numpy as np
import os
from collections import deque

# v3 : frames de l'animation de MORT (séquence splat -> gouttes -> bulles ->
# particules, cf. annotations de la planche 5ny7sq), bonus vie « as in HUD »,
# puis intégration de la planche io9kgw (jauges HUD, ledge catch, double saut
# pump, bullet time) extraite par tools/extract_v3.py.

SRC = 'ASSETS/sprites'
V3 = 'ASSETS/sprites/v3'
OUT = 'ASSETS/sprites/game'
os.makedirs(OUT, exist_ok=True)
TIERS = {'orange': (255, 157, 46), 'red': (226, 59, 59)}

# Canevas commun des frames ledge : ligne des bras (haut du bloc brun) calée
# sur y=GRIP, FACE GAUCHE du bloc (là où pend le corps) sur x=BLOCK_L — le jeu
# ancre le sprite là (mains sur le dessus, corps collé au mur).
LEDGE_W, LEDGE_H, LEDGE_GRIP, LEDGE_BLOCK_L = 320, 320, 150, 110


def load(n):
    return Image.open(f'{SRC}/sprite_{n:02d}.png').convert('RGBA')


def load3(n):
    return Image.open(f'{V3}/{n}.png').convert('RGBA')


def save(im, name):
    im.save(f'{OUT}/{name}.png')
    print(name, im.size)


def paste_center(canvas, im, cx, cy, rot=0):
    if rot:
        im = im.rotate(rot, expand=True, resample=Image.NEAREST)
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def recolor_slime(im, target):
    # Teinte uniquement les pixels verts du slime (g dominant) : le bloc brun
    # du ledge, les yeux et les contours noirs restent inchangés.
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


def grip_align(im):
    # Cale la face gauche du bloc sur LEDGE_BLOCK_L et le haut du bloc sur
    # LEDGE_GRIP. La face = première colonne de bloc soutenu (>=40 px) moins
    # 15 px de contour sombre ; insensible aux décalages d'extraction.
    a = np.asarray(im).astype(np.int16)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    block = (al > 200) & (r > g + 8) & (b > g + 5) & (r > 60) & (r < 180)
    rows = np.where(block.sum(axis=1) > 8)[0]
    prof = block[rows.min():rows.min() + 80, :].sum(axis=0)
    cols = np.where(prof >= 40)[0]
    face = int(cols.min()) - 15
    canvas = Image.new('RGBA', (LEDGE_W, LEDGE_H), (0, 0, 0, 0))
    canvas.alpha_composite(im, (LEDGE_BLOCK_L - face, LEDGE_GRIP - int(rows[0])))
    return canvas


# --- death1 : gouttes projetées vers l'extérieur (frame 2 de MORT) ---
dr1, dr2, dr3 = load(21), load(22), load(23)
d1 = Image.new('RGBA', (150, 150), (0, 0, 0, 0))
paste_center(d1, dr3, 75, 22, rot=180)            # deux gouttes en haut
paste_center(d1, dr1, 24, 75, rot=90)             # goutte à gauche
paste_center(d1, dr1, 126, 75, rot=-90)           # goutte à droite
paste_center(d1, dr2, 60, 120, rot=25)            # gouttes basses
paste_center(d1, dr2, 96, 122, rot=-20)
save(d1, 'death1')

# --- death2 : bulles éparses (frame 3 de MORT) ---
bb1, bb2, bb3 = load(24), load(25), load(26)
d2 = Image.new('RGBA', (150, 150), (0, 0, 0, 0))
paste_center(d2, bb1, 42, 48)
paste_center(d2, bb3, 104, 34)
paste_center(d2, bb2, 118, 92)
paste_center(d2, bb3, 52, 112)
paste_center(d2, bb1, 100, 122)
save(d2, 'death2')

# --- death3 : fines particules (frame 4 de MORT) ---
g = dr1.split()[3]
px_green = Image.new('RGBA', (3, 3), (96, 216, 62, 255))
d3 = Image.new('RGBA', (150, 150), (0, 0, 0, 0))
dots = [(30, 36, 3), (58, 22, 2), (86, 40, 2), (114, 30, 3), (40, 70, 2),
        (76, 64, 3), (108, 74, 2), (26, 100, 2), (60, 96, 3), (94, 106, 2),
        (122, 116, 3), (46, 128, 2), (84, 132, 2)]
for x, y, s in dots:
    dot = px_green.resize((s * 2, s * 2), Image.NEAREST)
    d3.alpha_composite(dot, (x, y))
save(d3, 'death3')

# --- bonus vie : tête « as in HUD » (grande variation de taille) ---
save(load(29).resize((44, 35), Image.LANCZOS), 'bonus_life')

# --- planche v3 : ledge catch, double saut pump, bullet time, jauges HUD ---
def erase_block(im):
    # Efface le bloc (gris-violet ET gris chaud de sa face claire) : la
    # plateforme du jeu fournit elle-même le rebond — on ne garde que le
    # slime accroché (bras au-dessus de la ligne d'accroche, conservés).
    a = np.asarray(im).astype(np.int16)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    purple = (r > g + 8) & (b > g + 5)
    warm = (r > g + 12) & (b >= g - 14)
    block = (al > 0) & (r < 215) & (purple | warm)
    a[:, :, 3][block] = 0
    # arête sombre neutre du bloc, sous la ligne d'accroche (le contour
    # noir-vert du slime, à g dominant ou quasi noir, est conservé)
    mx = np.maximum(np.maximum(r, g), b)
    Y = np.arange(a.shape[0])[:, None]
    dark_neutral = (mx >= 40) & (mx < 110) & (r > g - 6) & (b > g - 6) & (Y >= LEDGE_GRIP + 6)
    a[:, :, 3][dark_neutral & (al > 0)] = 0
    # sous la ligne d'accroche : les pixels sombres NON verts sont du bloc
    # (son bord quasi noir, même collé au slime) — le corps du slime y est
    # entièrement vert foncé, donc intact.
    sombre = (mx < 60) & (g <= r + 8) & (Y >= LEDGE_GRIP + 4)
    a[:, :, 3][sombre & (al > 0)] = 0
    # arête supérieure du bloc (qui monte en perspective vers la droite) à
    # DROITE des mains : rien de légitime au-delà, on efface tout.
    Y0, Y1 = LEDGE_GRIP - 45, LEDGE_GRIP + 40
    green = (g > r + 10) & (g > b + 10)
    gband = green[Y0:Y1, :]
    gmax = int(gband.nonzero()[1].max()) if gband.any() else 0
    a[:, :, 3][Y0:Y1, min(gmax + 3, a.shape[1]):] = 0
    # poussiers : on ne garde que les composantes connexes d'au moins 40 px
    al = a[:, :, 3]
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
    a[:, :, 3][~keep] = 0
    return Image.fromarray(a.astype(np.uint8), 'RGBA')


ledge = {}
for src, name in [('ledge_grab', 'ledge'), ('ledge_tired0', 'ledge0'), ('ledge_tired1', 'ledge1')]:
    im = erase_block(grip_align(load3(src)))
    ledge[name] = im
    save(im, name)
for name, im in ledge.items():
    for tier, col in TIERS.items():
        save(recolor_slime(im, col), f'{name}_{tier}')

for src in ('dj_pump0', 'dj_pump1'):
    im = load3(src)
    save(im, src)
    for tier, col in TIERS.items():
        save(recolor_slime(im, col), f'{src}_{tier}')

save(load3('time_warp'), 'time_warp')
save(load3('bar'), 'gauge_bar')
save(load3('arrow'), 'speed_arrow')
