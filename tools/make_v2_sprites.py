from PIL import Image
import os

SRC = 'ASSETS/sprites/v2'
OUT = 'ASSETS/sprites/game'
os.makedirs(OUT, exist_ok=True)

def load(n):
    return Image.open(f'{SRC}/a_{n:02d}.png')

def save(im, name, w=None, h=None):
    if w and h:
        im = im.resize((w, h), Image.LANCZOS)
    elif w:
        h = max(1, round(im.height * w / im.width))
        im = im.resize((w, h), Image.LANCZOS)
    im.save(f'{OUT}/{name}.png')
    print(name, im.size)

def recolor_green(im, target):
    px = im.load()
    out = Image.new('RGBA', im.size)
    po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, al = px[x, y]
            if al == 0:
                po[x, y] = (0, 0, 0, 0)
                continue
            L = (0.30 * r + 0.59 * g + 0.11 * b) / 255.0
            po[x, y] = (min(255, int(target[0] * (0.55 + 0.65 * L))),
                        min(255, int(target[1] * (0.55 + 0.65 * L))),
                        min(255, int(target[2] * (0.55 + 0.65 * L))), al)
    return out

tile = load(7)
save(tile, 'tile_green', 64, 48)
save(recolor_green(tile, (56, 182, 232)), 'tile_blue', 64, 48)
save(recolor_green(tile, (154, 160, 172)), 'tile_gray', 64, 48)
save(recolor_green(tile, (216, 232, 244)), 'tile_ghost', 64, 48)
save(recolor_green(tile, (255, 157, 46)), 'tile_orange', 64, 48)

save(load(27), 'sticky', 320)
save(load(46), 'dyn_strip', 256)

void = load(58)
save(void.crop((0, 0, void.width, 170)), 'void', 960)

save(load(25), 'hud_head', 56)

life = load(21)
save(life.crop((0, 0, 330, life.height)), 'lifebar', 660)

save(load(36), 'needle', 48)

save(load(66), 'bg_big', 700)
for i, n in zip((62, 63, 64, 65), range(4)):
    save(load(i), f'bg_panel{n + 1}', 120)

SLIME_BASES = ['idle0', 'idle1', 'jump', 'fall', 'land']
TIERS = {'orange': (255, 157, 46), 'red': (226, 59, 59)}
for base in SLIME_BASES:
    im = Image.open(f'{OUT}/{base}.png')
    for tier, col in TIERS.items():
        save(recolor_green(im, col), f'{base}_{tier}')

save(load(48), 'needle_h', 56)
