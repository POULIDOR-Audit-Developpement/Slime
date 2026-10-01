import numpy as np
from PIL import Image
from collections import deque
import os

SRC = 'ASSETS/planches/v2-atouts.jpeg'
OUT = 'ASSETS/sprites/v2'
os.makedirs(OUT, exist_ok=True)

im = Image.open(SRC).convert('RGB')
W, H = im.size
a = np.asarray(im).astype(np.int16)

def is_bg_arr(arr):
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    return (mx > 85) & ((mx - mn) < 34)

bg = is_bg_arr(a)
h, w = bg.shape
visited = np.zeros((h, w), dtype=bool)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if bg[y, x] and not visited[y, x]:
            visited[y, x] = True
            q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if bg[y, x] and not visited[y, x]:
            visited[y, x] = True
            q.append((y, x))
while q:
    cy, cx = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = cy + dy, cx + dx
        if 0 <= ny < h and 0 <= nx < w and bg[ny, nx] and not visited[ny, nx]:
            visited[ny, nx] = True
            q.append((ny, nx))

content = ~visited
ds = 4
small = content[::ds, ::ds]
sh, sw = small.shape
labels = np.zeros((sh, sw), dtype=np.int32)
cur = 0
boxes = []
for y in range(sh):
    for x in range(sw):
        if small[y, x] and labels[y, x] == 0:
            cur += 1
            qq = deque([(y, x)])
            labels[y, x] = cur
            x0 = x1 = x
            y0 = y1 = y
            n = 0
            while qq:
                cy, cx = qq.popleft()
                n += 1
                if cx < x0: x0 = cx
                if cx > x1: x1 = cx
                if cy < y0: y0 = cy
                if cy > y1: y1 = cy
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < sh and 0 <= nx < sw and small[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = cur
                        qq.append((ny, nx))
            if n >= 30:
                boxes.append([x0 * ds, y0 * ds, (x1 + 1) * ds, (y1 + 1) * ds])

final = []
for bx in boxes:
    if bx[2] - bx[0] > W * 0.5:
        continue
    final.append(bx)

final.sort(key=lambda bx: (bx[1] // 220, bx[0]))

for i, bx in enumerate(final):
    x0, y0, x1, y1 = bx
    pad = 5
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(W, x1 + pad); y1 = min(H, y1 + pad)
    crop = a[y0:y1, x0:x1]
    ch, cw = crop.shape[:2]
    alpha = np.full((ch, cw), 255, dtype=np.uint8)
    isb = is_bg_arr(crop)
    bgm = np.zeros((ch, cw), dtype=bool)
    qq = deque()
    for x in range(cw):
        for y in (0, ch - 1):
            if isb[y, x] and not bgm[y, x]:
                bgm[y, x] = True
                qq.append((y, x))
    for y in range(ch):
        for x in (0, cw - 1):
            if isb[y, x] and not bgm[y, x]:
                bgm[y, x] = True
                qq.append((y, x))
    while qq:
        cy, cx = qq.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < ch and 0 <= nx < cw and not bgm[ny, nx] and isb[ny, nx]:
                bgm[ny, nx] = True
                qq.append((ny, nx))
    trans = bgm.copy()
    trans[1:-1, 1:-1] |= bgm[:-2, 1:-1] | bgm[2:, 1:-1] | bgm[1:-1, :-2] | bgm[1:-1, 2:]
    alpha[trans] = 0
    ys, xs = np.where(alpha > 0)
    if len(ys) == 0:
        continue
    xa, xb, ya, yb = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = np.dstack([crop[:, :, 0].astype(np.uint8), crop[:, :, 1].astype(np.uint8), crop[:, :, 2].astype(np.uint8), alpha])
    rgba = rgba[ya:yb, xa:xb]
    Image.fromarray(rgba, 'RGBA').save(f'{OUT}/a_{i:02d}.png')
    print(f'a_{i:02d}.png ({x0},{y0})-({x1},{y1}) {xb-xa}x{yb-ya}')

print('total:', len(final))
