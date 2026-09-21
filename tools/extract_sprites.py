import numpy as np
from PIL import Image
from collections import deque
import os

SRC = 'ASSETS/Gemini_Generated_Image_5ny7sq5ny7sq5ny7.jpeg'
OUT = 'ASSETS/sprites'
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert('RGB')
W, H = im.size
a = np.asarray(im).astype(np.int16)
r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]

green = (g > 90) & (g > r + 25) & (g > b + 25)

ds = 4
small = green[::ds, ::ds]
sh, sw = small.shape
labels = np.zeros((sh, sw), dtype=np.int32)
cur = 0
boxes = []
for y in range(sh):
    for x in range(sw):
        if small[y, x] and labels[y, x] == 0:
            cur += 1
            q = deque([(y, x)])
            labels[y, x] = cur
            x0 = x1 = x
            y0 = y1 = y
            n = 0
            while q:
                cy, cx = q.popleft()
                n += 1
                if cx < x0: x0 = cx
                if cx > x1: x1 = cx
                if cy < y0: y0 = cy
                if cy > y1: y1 = cy
                for dy, dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = cur
                        q.append((ny, nx))
            if n >= 40:
                boxes.append([x0*ds, y0*ds, (x1+1)*ds, (y1+1)*ds])

merged = []
for bx in boxes:
    placed = False
    for m in merged:
        if not (bx[2] + 20 < m[0] or bx[0] - 20 > m[2] or bx[3] + 20 < m[1] or bx[1] - 20 > m[3]):
            m[0] = min(m[0], bx[0]); m[1] = min(m[1], bx[1])
            m[2] = max(m[2], bx[2]); m[3] = max(m[3], bx[3])
            placed = True
            break
    if not placed:
        merged.append(list(bx))

def refine(bx):
    x0, y0, x1, y1 = bx
    x0 = max(0, x0 - 10); y0 = max(0, y0 - 10)
    x1 = min(W, x1 + 10); y1 = min(H, y1 + 10)
    sub = green[y0:y1, x0:x1]
    ys, xs = np.where(sub)
    return [x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1]

def is_bg(px):
    rr, gg, bb = int(px[0]), int(px[1]), int(px[2])
    mx = max(rr, gg, bb)
    mn = min(rr, gg, bb)
    return mx > 140 and (mx - mn) < 30

final = [refine(bx) for bx in merged]
final.sort(key=lambda bx: (bx[1] // 200, bx[0]))

for i, bx in enumerate(final):
    x0, y0, x1, y1 = bx
    pad = 6
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(W, x1 + pad); y1 = min(H, y1 + pad)
    crop = a[y0:y1, x0:x1]
    ch, cw = crop.shape[:2]
    alpha = np.full((ch, cw), 255, dtype=np.uint8)
    bg = np.zeros((ch, cw), dtype=bool)
    q = deque()
    for x in range(cw):
        for y in (0, ch - 1):
            if is_bg(crop[y, x]) and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(ch):
        for x in (0, cw - 1):
            if is_bg(crop[y, x]) and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        cy, cx = q.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < ch and 0 <= nx < cw and not bg[ny, nx] and is_bg(crop[ny, nx]):
                bg[ny, nx] = True
                q.append((ny, nx))
    trans = bg.copy()
    trans[1:-1, 1:-1] |= bg[:-2, 1:-1] | bg[2:, 1:-1] | bg[1:-1, :-2] | bg[1:-1, 2:]
    alpha[trans] = 0
    ys, xs = np.where(alpha > 0)
    if len(ys) == 0:
        continue
    x0c, x1c, y0c, y1c = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([crop[:, :, 0].astype(np.uint8), crop[:, :, 1].astype(np.uint8), crop[:, :, 2].astype(np.uint8), alpha])
    rgba = rgba[y0c:y1c, x0c:x1c]
    Image.fromarray(rgba, 'RGBA').save(f'{OUT}/sprite_{i:02d}.png')
    print(f'sprite_{i:02d}.png  bbox=({x0},{y0},{x1},{y1})  taille={x1c-x0c}x{y1c-y0c}')

print('total:', len(final))
