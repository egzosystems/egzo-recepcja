#!/usr/bin/env python3
"""Atlas ust z arkusza wizemów (24 kafelki, 3 rzędy × 8) wklejany w kadr bazowy.

Każdy kafelek: wyrównanie do nosa z kafelka „Neutralne”, obrót do przechyłu głowy z wideo (−9,5°),
skala 1,13 (usta z arkusza są ~40 px, w wideo ~50 px, a pełniejsze), jasność i kontrast jak skóra
wokół ust w kadrze, kolor przez skalowanie nasycenia (ciemne wnętrze ust zostaje neutralne),
przygaszony połysk, miękka eliptyczna maska.

Wynik: usta-atlas.png + usta-atlas.json (14 kształtów + „closed”) — wejście dla tools/morph_ust.py.
Użycie: python3 tools/wizemy_z_arkusza.py ARKUSZ.png KADR.jpg KATALOG_WYJ
"""
import json, os, sys
import cv2
import numpy as np

sheet, poster, out_dir = sys.argv[1:4]
S = cv2.imread(sheet); ref = cv2.imread(poster)
ROWS = [30, 258, 487]; TWS = 192
ORDER = ['A', 'E', 'I', 'O', 'U', 'Y', 'MBP', 'FW', 'L', 'TDN', 'KG', 'SZ', 'SZCZ', 'R', 'CH', 'AE_NOS',
         'NEUTR', 'LEKKO', 'SZEROKO', 'OKRAGLE', 'DZIOBEK', 'ZEBY', 'JEZYK', 'POUT']
# wybrane kształty → nazwy w silniku (closed = zamknięte usta z arkusza)
KEEP = [('A', 'a'), ('E', 'e'), ('I', 'i'), ('O', 'o'), ('U', 'u'), ('MBP', 'mbp'), ('FW', 'fw'), ('L', 'l'),
        ('TDN', 'tdn'), ('KG', 'kg'), ('SZ', 's'), ('SZCZ', 'sz'), ('R', 'r'), ('CH', 'ch'), ('LEKKO', 'slight'), ('NEUTR', 'closed')]

def tile(i):
    r, c = divmod(i, 8)
    return S[ROWS[r]:ROWS[r] + 190, c * TWS + 2:(c + 1) * TWS - 2]
g16 = cv2.cvtColor(tile(16), cv2.COLOR_BGR2GRAY)
nose = g16[85:125, 80:125]; NX, NY = 80, 85; MOUTH16 = (102, 136)
MX, MY = 582, 227; R0 = -9.5; PW, PH, OFF = 84, 60, 7; SC = 1.13
yy, xx = np.mgrid[0:PH, 0:PW]; cx, cy = PW / 2, PH / 2 - OFF
a = np.radians(R0)
X = (xx - cx) * np.cos(a) - (yy - cy) * np.sin(a); Y = (xx - cx) * np.sin(a) + (yy - cy) * np.cos(a)
d = (X / 27) ** 2 + ((Y - 4) / 24) ** 2
mask = np.clip((1 - d) / 0.55, 0, 1) ** 1.4
ring = (d > 0.55) & (d < 1.0)
refp = ref[MY + OFF - PH // 2:MY + OFF + PH // 2, MX - PW // 2:MX + PW // 2]
rl = cv2.cvtColor(refp, cv2.COLOR_BGR2LAB).astype(np.float32)

tiles, names = [], []
for src, name in KEEP:
    t = tile(ORDER.index(src)); g = cv2.cvtColor(t, cv2.COLOR_BGR2GRAY)
    r = cv2.matchTemplate(g[60:150, 50:150], nose, cv2.TM_CCOEFF_NORMED); _, mv, _, ml = cv2.minMaxLoc(r)
    mx, my = MOUTH16[0] + ml[0] + 50 - NX, MOUTH16[1] + ml[1] + 60 - NY
    M = cv2.getRotationMatrix2D((mx, my), R0, SC); M[0, 2] += cx - mx; M[1, 2] += cy - my
    p = cv2.warpAffine(t, M, (PW, PH), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    pl = cv2.cvtColor(p, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, Lr = pl[..., 0], rl[..., 0]
    pl[..., 0] = (L - L[ring].mean()) * min(1.0, Lr[ring].std() / max(L[ring].std(), 1e-3) * 1.15) + Lr[ring].mean()
    for c in (1, 2):
        k = (rl[..., c][ring].mean() - 128) / max(pl[..., c][ring].mean() - 128, 1e-3)
        pl[..., c] = 128 + (pl[..., c] - 128) * np.clip(k, 0.4, 1.2) * 0.85
    hl = np.clip((pl[..., 0] - 200) / 40, 0, 1) * (pl[..., 1] > 135)
    pl[..., 0] -= hl * 18
    p = cv2.cvtColor(np.clip(pl, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    tiles.append(np.dstack([p, (mask * 255).astype(np.uint8)])); names.append(name)
    print(f'{src:>7} → {name:<7} dopasowanie nosa {mv:.2f}')
os.makedirs(out_dir, exist_ok=True)
cv2.imwrite(os.path.join(out_dir, 'usta-atlas.png'), np.hstack(tiles))
json.dump({'tileW': PW, 'tileH': PH, 'offY': OFF, 'shapes': names, 'roll0': R0, 'source': 'arkusz wizemów 2026-10-27'},
          open(os.path.join(out_dir, 'usta-atlas.json'), 'w'), indent=1)
