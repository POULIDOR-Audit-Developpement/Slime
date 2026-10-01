import numpy as np
from PIL import Image
from collections import deque
import os

# Extraction des assets de NIVEAUX (fond par musique) depuis les planches
# v5 (plaines), v6 (usine de magma) et v7 (manoir hanté) :
# - bg_level1..3.png : fond 480x270 (ratio du monde virtuel) affiché en
#   parallaxe derrière les plateformes, une image par piste BGM (niveau).
# - tile_volcanic.png / tile_manor.png : tuiles « basic » des niveaux 2 et 3
#   (64x48, comme tile_green), le niveau 1 garde tile_green (herbe).
# Les planches ont un fond gris uni (#728188) ; les tuiles sont détourées par
# diffusion depuis les bords du crop (le remplissage ardoise du bloc manoir
# est trop proche du gris pour un test global).
V5 = 'ASSETS/planches/v5-niveau1-plaines.jpg'
V6 = 'ASSETS/planches/v6-niveau2-magma.jpg'
V7 = 'ASSETS/planches/v7-niveau3-manoir.jpg'
OUT = 'ASSETS/sprites/v5'
os.makedirs(OUT, exist_ok=True)


def bg_mask(a):
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    return ((mx - mn) < 26) & (mx > 90)


def trim(im, shave=0):
    # rogne le fond gris autour du contenu (+ rogne `shave` px de plus tout
    # autour : résidus JPEG des bords de bande)
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    content = ~bg_mask(a)
    ys, xs = np.where(content)
    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1
    return im.crop((x0 + shave, y0 + shave, x1 - shave, y1 - shave))


def cover(im, w, h):
    # recadre au ratio w:h (anné largeur conservée) puis redimensionne
    ar = w / h
    if im.width / im.height > ar:
        nw = round(im.height * ar)
        x0 = (im.width - nw) // 2
        im = im.crop((x0, 0, x0 + nw, im.height))
    else:
        nh = round(im.width / ar)
        y0 = (im.height - nh) // 2
        im = im.crop((0, y0, im.width, y0 + nh))
    return im.resize((w, h), Image.LANCZOS)


def detour(im):
    # fond gris -> transparence : diffusion depuis les bords du crop sur les
    # pixels neutres (ne traverse jamais les couleurs vives du sprite)
    a = np.asarray(im.convert('RGB')).astype(np.int16)
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
    out = np.dstack([a[:, :, 0].astype(np.uint8), a[:, :, 1].astype(np.uint8),
                     a[:, :, 2].astype(np.uint8), alpha])
    return Image.fromarray(out, 'RGBA')


# --- bg_level1 : plaines — montagnes (bande 2) au-dessus des collines
# (bande 1) ; les collines se fondent par dessus la base des montagnes
# (fondu alpha sur leurs premières lignes, le ciel des collines masque la
# coupe nette du bas de la bande montagnes)
s5 = Image.open(V5).convert('RGB')
mtn = trim(s5.crop((425, 195, 705, 285)), shave=2)
hills = trim(s5.crop((425, 80, 705, 170)), shave=2)
w = min(mtn.width, hills.width)
mtn = mtn.resize((w, round(mtn.height * w / mtn.width)), Image.LANCZOS)
hills = hills.resize((w, round(hills.height * w / hills.width)), Image.LANCZOS)
OVER, FADE = 26, 14
hills_a = hills.convert('RGBA')
al = np.full((hills.height, hills.width), 255, np.uint8)
al[:FADE, :] = (np.linspace(0, 255, FADE)).reshape(-1, 1).astype(np.uint8)
hills_a.putalpha(Image.fromarray(al, 'L'))
vh = mtn.height - OVER + hills.height
vista = Image.new('RGB', (w, vh))
vista.paste(mtn, (0, 0))
vista.paste(hills_a, (0, mtn.height - OVER), hills_a)
cover(vista, 480, 270).save(f'{OUT}/bg_level1.png')
print('bg_level1', (480, 270), f'(vista {w}x{vh})')

# --- bg_level2 : usine de magma — bande basse de la grande scène (conduites,
# chutes de lave, arches)
s6 = Image.open(V6).convert('RGB')
scene = s6.crop((8, 136, 465, 714))
cover(scene.crop((0, 280 - 136, 457, 537 - 136)), 480, 270).save(f'{OUT}/bg_level2.png')
print('bg_level2', (480, 270))

# --- bg_level3 : manoir hanté — cadrage centré sur la nef (vitraux, escalier)
s7 = Image.open(V7).convert('RGB')
scene3 = trim(s7.crop((8, 86, 935, 385)))
nw = round(scene3.height * 480 / 270)
x0 = (scene3.width - nw) // 2
cover(scene3.crop((x0, 0, x0 + nw, scene3.height)), 480, 270).save(f'{OUT}/bg_level3.png')
print('bg_level3', (480, 270), f'(scène {scene3.size})')

# --- tuiles « basic » des niveaux 2 et 3 (le niveau 1 garde l'herbe)
# v6 : bloc de roche volcanique à croûte brune et lave en sous-sol
volcanic = detour(trim(s6.crop((533, 165, 722, 271))))
volcanic.resize((64, 48), Image.LANCZOS).save(f'{OUT}/tile_volcanic.png')
print('tile_volcanic', volcanic.size, '-> 64x48')

# v7 : bloc de pierre de manoir 1x1 fissuré
manor = detour(trim(s7.crop((108, 474, 183, 539))))
manor.resize((64, 48), Image.LANCZOS).save(f'{OUT}/tile_manor.png')
print('tile_manor', manor.size, '-> 64x48')

# --- copie vers ASSETS/sprites/game/ (le jeu ne charge que ce dossier,
# cf. js/sprites.js) — même chaîne que les make_vN_sprites.py
import shutil
GAME = 'ASSETS/sprites/game'
for f in ('bg_level1.png', 'bg_level2.png', 'bg_level3.png',
          'tile_volcanic.png', 'tile_manor.png'):
    shutil.copyfile(f'{OUT}/{f}', f'{GAME}/{f}')
    print('  ->', f'{GAME}/{f}')

# planches de contrôle visuelle
row = Image.new('RGB', (480, 270 * 3 + 60), (40, 40, 40))
for i in (1, 2, 3):
    row.paste(Image.open(f'{OUT}/bg_level{i}.png'), (0, (i - 1) * (270 + 30)))
row.save('/tmp/opencode/check_bgs.png')


def tile_row(tiles, out, scale=4):
    tw = sum(t.width for t in tiles) + 12 * (len(tiles) + 1)
    th = max(t.height for t in tiles) + 24
    r = Image.new('RGBA', (tw, th), (60, 64, 72, 255))
    x = 12
    for t in tiles:
        r.alpha_composite(t, (x, 12))
        x += t.width + 12
    r = r.resize((r.width * scale, r.height * scale), Image.NEAREST)
    r.save(out)


tile_row([Image.open(f'{OUT}/tile_volcanic.png'),
          Image.open(f'{OUT}/tile_manor.png')], '/tmp/opencode/check_tiles.png')
