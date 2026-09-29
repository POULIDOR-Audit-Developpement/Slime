#!/usr/bin/env python3
"""Tuiles « plateformes fun » — turbo, dorée, bascule (64×48, comme les tuiles
existantes, cf. référence de style ASSETS/sprites/game/tile_orange.png : face,
bande top plus claire, reflet blanc ; bord noir arrondi par-dessus).

Motif propre à chaque type :
- tile_turbo   : top cyan #35c4e7 / flanc #186a80 + double chevron » blanc ;
- tile_gold    : top #ffd83d / flanc #b8860b + étoile blanche ;
- tile_seesaw  : bois top #c98d4e / flanc #8a5a2b + cercle pivot central.

Les PNG sont dessinés en 2× (une tuile de jeu = 32×24) puis affichés tels
quels par Sprites.drawImage — pas de recoloration runtime (jamais dans
VARIANT_BASES, règle perf AGENTS.md).

Usage : python3 tools/make_new_tiles.py
"""
from math import cos, sin, pi
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'ASSETS' / 'sprites' / 'game'
REF = OUT / 'tile_orange.png'
W, H = 64, 48

BLACK = (10, 10, 18, 255)
WHITE = (244, 244, 244, 255)


def check_ref():
    """La référence de style fixe le cadrage (64×48) : on la vérifie."""
    im = Image.open(REF)
    if im.size != (W, H):
        raise SystemExit(f'référence {REF.name} : {im.size}, attendu ({W}, {H})')


def base_tile(top, side):
    """Corps commun : bord noir arrondi, flanc, bande top, reflet blanc."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W - 1, H - 1), radius=9, fill=BLACK)
    d.rounded_rectangle((2, 2, W - 3, H - 3), radius=7, fill=side)
    # bande top : coins arrondis en haut, bord droit en bas (y 20..30)
    d.rounded_rectangle((2, 2, W - 3, 30), radius=7, fill=top)
    d.rectangle((2, 20, W - 3, 30), fill=top)
    # reflet blanc (à la même place que le drawTile procédural, ×2)
    d.rounded_rectangle((12, 10, 30, 18), radius=4, fill=WHITE)
    return im


def star_points(cx, cy, big, small, n=5):
    pts = []
    for i in range(2 * n):
        r = big if i % 2 == 0 else small
        a = -pi / 2 + i * pi / n
        pts.append((cx + r * cos(a), cy + r * sin(a)))
    return pts


def tile_turbo():
    # cyan électrique / bleu foncé + double chevron » (sens du boost)
    im = base_tile((0x35, 0xc4, 0xe7, 255), (0x18, 0x6a, 0x80, 255))
    d = ImageDraw.Draw(im)
    d.polygon([(34, 13), (46, 24), (34, 35)], fill=WHITE)
    d.polygon([(48, 13), (58, 24), (48, 35)], fill=WHITE)
    return im


def tile_gold():
    # or clair / bronze + étoile blanche
    im = base_tile((0xff, 0xd8, 0x3d, 255), (0xb8, 0x86, 0x0b, 255))
    d = ImageDraw.Draw(im)
    d.polygon(star_points(36, 25, 11, 4.5), fill=WHITE)
    return im


def tile_seesaw():
    # bois clair / bois foncé + cercle pivot central (logement sombre, axe clair)
    im = base_tile((0xc9, 0x8d, 0x4e, 255), (0x8a, 0x5a, 0x2b, 255))
    d = ImageDraw.Draw(im)
    d.ellipse((23, 15, 41, 33), fill=(0x4a, 0x2e, 0x14, 255))
    d.ellipse((27, 19, 37, 29), fill=(0xe8, 0xd5, 0xb5, 255))
    return im


def main():
    check_ref()
    for name, im in [('tile_turbo.png', tile_turbo()),
                     ('tile_gold.png', tile_gold()),
                     ('tile_seesaw.png', tile_seesaw())]:
        path = OUT / name
        im.save(path)
        print(f'écrit {path.relative_to(ROOT)} {im.size[0]}x{im.size[1]}')


if __name__ == '__main__':
    main()
