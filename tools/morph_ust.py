#!/usr/bin/env python3
"""Klatki pośrednie między kształtami ust (płynny ruch zamiast przenikania).

Wejście: atlas kształtów (w pozie kadru bazowego, z maską) + kadr bazowy.
Dodaje kształt „closed” (prawdziwe zamknięte usta z kadru bazowego), potem dla każdej pary
kształtów liczy przepływ optyczny (DIS) w obie strony i tworzy 3 fazy przejścia (25/50/75%):
obraz A przesunięty o t·przepływ, obraz B cofnięty o (1−t)·przepływ, zmieszane wagami.

Wynik: usta-morph.png (siatka kafelków) + usta-morph.json:
  base[i] = numer kafelka kształtu i; pair["a,b"] = [k25, k50, k75] dla a<b (dla b→a w odwrotnej kolejności).

Użycie: python3 -I morph_ust.py usta-atlas.png usta-atlas.json KADR.jpg KATALOG_WYJŚCIOWY
"""
import json, os, sys
import cv2
import numpy as np

atlas_p, meta_p, poster_p, out_dir = sys.argv[1:5]
m = json.load(open(meta_p))
A = cv2.imread(atlas_p, cv2.IMREAD_UNCHANGED)
TW, TH, OFF = m['tileW'], m['tileH'], m['offY']
names = list(m['shapes'])
tiles = [A[:, k * TW:(k + 1) * TW].astype(np.float32) for k in range(len(names))]

# kształt „closed”: jeśli atlas go nie ma — prawdziwe usta z kadru bazowego, z tą samą maską co kafelki
ref = cv2.imread(poster_p)
MX, MY = 582, 227
if 'closed' not in names:
    crop = ref[MY + OFF - TH // 2:MY + OFF + TH // 2, MX - TW // 2:MX + TW // 2].astype(np.float32)
    alpha = np.max(np.stack([t[..., 3] for t in tiles]), axis=0)          # obwiednia masek
    tiles.append(np.dstack([crop, alpha])); names.append('closed')
N = len(tiles)

S = 3   # liczymy przepływ w powiększeniu — kafelki są małe
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_ULTRAFAST)
dis.setFinestScale(0)
def flow(a, b):
    ga = cv2.resize(cv2.cvtColor(a[..., :3].astype(np.uint8), cv2.COLOR_BGR2GRAY), None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)
    gb = cv2.resize(cv2.cvtColor(b[..., :3].astype(np.uint8), cv2.COLOR_BGR2GRAY), None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)
    f = dis.calc(ga, gb, None)
    f = cv2.GaussianBlur(f, (0, 0), 2.0)
    return cv2.resize(f, (TW, TH), interpolation=cv2.INTER_AREA) / S
yy, xx = np.mgrid[0:TH, 0:TW].astype(np.float32)
def warp(img, f, t):
    # próbkowanie wstecz: piksel w klatce pośredniej pochodzi z położenia minus t·przepływ
    return cv2.remap(img, xx - t * f[..., 0], yy - t * f[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

out = list(tiles)
pairs = {}
for a in range(N):
    for b in range(a + 1, N):
        fab, fba = flow(tiles[a], tiles[b]), flow(tiles[b], tiles[a])
        ids = []
        for t in (0.25, 0.5, 0.75):
            wa = warp(tiles[a], fab, t)        # A przesunięte do przodu o t·przepływ
            wb = warp(tiles[b], fba, 1 - t)                                              # B cofnięte
            mix = wa * (1 - t) + wb * t
            ids.append(len(out)); out.append(mix)
        pairs[f'{a},{b}'] = ids

cols = 16
rows = (len(out) + cols - 1) // cols
grid = np.zeros((rows * TH, cols * TW, 4), np.float32)
for i, t in enumerate(out):
    r, c = divmod(i, cols)
    grid[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW] = t
os.makedirs(out_dir, exist_ok=True)
cv2.imwrite(os.path.join(out_dir, 'usta-morph.png'), np.clip(grid, 0, 255).astype(np.uint8))
json.dump({'tileW': TW, 'tileH': TH, 'offY': OFF, 'cols': cols, 'shapes': names, 'base': list(range(N)), 'pair': pairs},
          open(os.path.join(out_dir, 'usta-morph.json'), 'w'), separators=(',', ':'))
print('kształtów', N, 'kafelków', len(out), 'siatka', grid.shape[1], 'x', grid.shape[0])
