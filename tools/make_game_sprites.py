from PIL import Image
import os

SRC = 'ASSETS/sprites'
OUT = 'ASSETS/sprites/game'
os.makedirs(OUT, exist_ok=True)

TARGETS = {
    'idle0': ('sprite_01.png', 88),
    'idle1': ('sprite_02.png', 88),
    'hurt': ('sprite_14.png', 88),
    'jump': ('sprite_16.png', 76),
    'fall': ('sprite_04.png', 84),
    'land': ('sprite_06.png', 96),
    'splat': ('sprite_20.png', 130),
    'big': ('sprite_29.png', 88),
    'mid': ('sprite_30.png', 72),
    'small': ('sprite_31.png', 56),
}

for name, (src, w) in TARGETS.items():
    im = Image.open(f'{SRC}/{src}')
    h = max(1, round(im.height * w / im.width))
    im = im.resize((w, h), Image.LANCZOS)
    im.save(f'{OUT}/{name}.png')
    print(f'{name}.png {w}x{h}')
