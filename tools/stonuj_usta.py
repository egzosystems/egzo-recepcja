#!/usr/bin/env python3
"""Stonowanie kształtów ust: każdy kształt = punkt w ruchu od zamkniętych ust (jej, z kadru) do pełnego kształtu.

Kształty z klipu powitania to szeroki uśmiech — przy zwykłej mowie wyglądają przesadnie.
Klatka „t” między zamkniętymi a kształtem liczona jak w morph_ust.py (przepływ optyczny w obie strony).

Użycie: python3 -I stonuj_usta.py usta-atlas.png usta-atlas.json AMPLITUDA(0..1) [nazwa=ampl ...]
(nadpisuje atlas; „closed” bez zmian)
"""
import json, sys
import cv2
import numpy as np

atlas_p, meta_p, amp = sys.argv[1], sys.argv[2], float(sys.argv[3])
per = dict(a.split('=') for a in sys.argv[4:])
m = json.load(open(meta_p)); A = cv2.imread(atlas_p, cv2.IMREAD_UNCHANGED)
TW, TH = m['tileW'], m['tileH']; names = m['shapes']
tiles = [A[:, k * TW:(k + 1) * TW].astype(np.float32) for k in range(len(names))]
C = tiles[names.index('closed')]
SC = 3
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
def gray(t): return cv2.resize(cv2.cvtColor(np.clip(t[..., :3], 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY), None, fx=SC, fy=SC, interpolation=cv2.INTER_CUBIC)
def flow(a, b):
    f = cv2.GaussianBlur(dis.calc(gray(a), gray(b), None), (0, 0), 2.5)
    return cv2.resize(f, (TW, TH), interpolation=cv2.INTER_AREA) / SC
yy, xx = np.mgrid[0:TH, 0:TW].astype(np.float32)
def warp(img, f, t): return cv2.remap(img, xx - t * f[..., 0], yy - t * f[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
out = []
for n, t in zip(names, tiles):
    if n == 'closed':
        out.append(t); continue
    s = float(per.get(n, amp))
    fcs, fsc = flow(C, t), flow(t, C)
    mix = warp(C, fcs, s) * (1 - s) + warp(t, fsc, 1 - s) * s
    mix[..., 3] = t[..., 3]
    out.append(mix)
    print(f'{n:<7} amplituda {s:.2f}')
cv2.imwrite(atlas_p, np.clip(np.hstack(out), 0, 255).astype(np.uint8))
m['amplitude'] = {n: float(per.get(n, amp)) for n in names if n != 'closed'}
json.dump(m, open(meta_p, 'w'), indent=1)
