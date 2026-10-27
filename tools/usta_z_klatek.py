#!/usr/bin/env python3
"""Biblioteka PRAWDZIWYCH klatek mówienia (dolna część twarzy) — bez dorysowywania kształtów.

Dla każdej klatki klipów źródłowych:
  1) dopasowanie ECC (afiniczne) sztywnej okolicy nos–policzki do kadru bazowego,
  2) przeniesienie klatki do układu kadru bazowego i wycięcie dolnej części twarzy (usta, żuchwa, broda),
  3) cechy: otwarcie ust (ciemne wnętrze), zęby (jasne, mało nasycone), szerokość ust,
  4) kolor dopasowany do kadru bazowego (Lab, pierścień skóry).
Wybór: klatki z dobrym dopasowaniem i bez zasłonięcia, rozłożone równo po przestrzeni cech;
zachowujemy ciągi kolejnych klatek (silnik woli je w odtwarzaniu).

Wynik: usta-klatki.webp (siatka kafelków RGBA) + usta-klatki.json:
  {tileW, tileH, x0, y0, cols, frames:[{src, i, open, teeth, width}], next:[indeks następnej klatki z tego samego nagrania lub -1]}
Użycie: python3 -I usta_z_klatek.py KADR.jpg KATALOG_WYJ klip1.mp4 [klip2.mp4 ...]
"""
import json, os, sys
import cv2
import numpy as np

poster, out_dir = sys.argv[1:3]; clips = sys.argv[3:]
ref = cv2.imread(poster)
gref = cv2.GaussianBlur(cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.0)
# sztywny wzorzec: nos i policzki (bez ust i żuchwy, które się ruszają)
RX0, RY0, RX1, RY1 = 500, 140, 665, 212
tpl = gref[RY0:RY1, RX0:RX1]
# wycinek dolnej części twarzy w układzie kadru bazowego
X0, Y0, TW, TH = 518, 188, 128, 116
MX, MY = 582, 227
yy, xx = np.mgrid[0:TH, 0:TW].astype(np.float32)
cx, cy = MX - X0, MY - Y0 + 14
ell = ((xx - cx) / 56) ** 2 + ((yy - cy) / 50) ** 2
mask = np.clip((1 - ell) / 0.45, 0, 1) ** 1.3
ring = (ell > 0.6) & (ell < 1.0)
# obszar ust do cech (elipsa wokół ust, z przechyłem kadru bazowego)
ang = np.radians(-9.5)
EX = ((xx - (MX - X0)) * np.cos(ang) - (yy - (MY - Y0)) * np.sin(ang)) / 30
EY = ((xx - (MX - X0)) * np.sin(ang) + (yy - (MY - Y0)) * np.cos(ang)) / 16
mouth = (EX ** 2 + (EY - 0.35) ** 2) < 1
refc = ref[Y0:Y0 + TH, X0:X0 + TW]
rl = cv2.cvtColor(refc, cv2.COLOR_BGR2LAB).astype(np.float32)
skinL = float(rl[..., 0][ring].mean())
crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 150, 1e-5)

def features(crop):
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, a = lab[..., 0], lab[..., 1]
    dark = (L < skinL * 0.5) & mouth
    teeth = (L > skinL * 1.12) & (a < 138) & mouth
    cols = np.where((dark | teeth).any(axis=0))[0]
    return float(dark.sum()), float(teeth.sum()), float(np.ptp(cols) if len(cols) else 0)

cands = []
for src in clips:
    cap = cv2.VideoCapture(src); i = 0
    W = np.float32([[1, 0, RX0], [0, 1, RY0]])
    first = True
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        g = cv2.GaussianBlur(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.0)
        if first:   # start: szukamy wzorca w całej okolicy twarzy
            r = cv2.matchTemplate(g[60:360, 380:800], tpl, cv2.TM_CCOEFF_NORMED); _, _, _, ml = cv2.minMaxLoc(r)
            W = np.float32([[1, 0, ml[0] + 380], [0, 1, ml[1] + 60]]); first = False
        try:
            cc, W = cv2.findTransformECC(tpl, g, W.copy(), cv2.MOTION_AFFINE, crit, None, 3)
        except cv2.error:
            cc = 0.0
        # klatka → kadr bazowy: odwrotność (wzorzec→klatka) złożona z położeniem wzorca
        Wf = np.vstack([W, [0, 0, 1]]); T = np.float32([[1, 0, -RX0], [0, 1, -RY0], [0, 0, 1]])
        to_frame = Wf @ T                                  # punkt kadru bazowego → punkt klatki
        M = to_frame[:2]
        # piksel wycinka (u,v) → punkt kadru bazowego (X0+u, Y0+v) → punkt klatki
        Mc = np.float32([[M[0, 0], M[0, 1], M[0, 0] * X0 + M[0, 1] * Y0 + M[0, 2]],
                         [M[1, 0], M[1, 1], M[1, 0] * X0 + M[1, 1] * Y0 + M[1, 2]]])
        crop = cv2.warpAffine(fr, Mc, (TW, TH), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        s = float(np.sqrt(abs(np.linalg.det(W[:, :2])))); rot = float(np.degrees(np.arctan2(W[1, 0], W[0, 0])))
        # zasłonięcie / zła klatka: różnica szyi i brody od kadru bazowego poza ustami
        diff = float(np.abs(crop.astype(np.float32) - refc.astype(np.float32)).mean(axis=2)[ring & ~mouth].mean())
        o, t, wdt = features(crop)
        cands.append(dict(src=os.path.basename(src), i=i, cc=float(cc), s=s, rot=rot, diff=diff, open=o, teeth=t, width=wdt, crop=crop))
        i += 1
print('klatek razem', len(cands))
import collections
for src in sorted(set(c['src'] for c in cands)):
    cs=[c for c in cands if c['src']==src]
    big=[c for c in cs if c['open']>60]
    print(src, 'klatek', len(cs), '| z otwartymi ustami', len(big))
    for c in big[::max(1,len(big)//8)][:8]:
        print('   i',c['i'],'cc',round(c['cc'],2),'s',round(c['s'],2),'rot',round(c['rot'],1),'diff',round(c['diff'],1),'open',c['open'],'teeth',c['teeth'])
if os.environ.get('TYLKO_DIAG'): sys.exit(0)
good = [c for c in cands if c['cc'] > float(os.environ.get('MIN_CC', 0.85)) and 0.85 < c['s'] < 1.25 and abs(c['rot']) < float(os.environ.get('MAX_ROT', 30)) and c['diff'] < float(os.environ.get('MAX_DIFF', 32))]
print('dobrych', len(good), '| otwarcie max', max(c['open'] for c in good), '| zęby max', max(c['teeth'] for c in good))

# kolor jak w kadrze bazowym
for c in good:
    lab = cv2.cvtColor(c['crop'], cv2.COLOR_BGR2LAB).astype(np.float32)
    for ch in range(3):
        a, b = lab[..., ch][ring], rl[..., ch][ring]
        lab[..., ch] = (lab[..., ch] - a.mean()) * min(1.15, max(0.85, b.std() / max(a.std(), 1e-3))) + b.mean()
    c['crop'] = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)

# wybór: siatka cech (otwarcie × zęby), z każdej komórki do kilku klatek + ich sąsiedzi w czasie
omax = max(1.0, np.percentile([c['open'] for c in good], 98)); tmax = max(1.0, np.percentile([c['teeth'] for c in good], 98))
for c in good:
    c['fo'] = min(1.0, c['open'] / omax); c['ft'] = min(1.0, c['teeth'] / tmax)
sel = set()
for oi in range(8):
    for ti in range(5):
        cell = [k for k, c in enumerate(good) if int(min(7, c['fo'] * 8)) == oi and int(min(4, c['ft'] * 5)) == ti]
        cell.sort(key=lambda k: -good[k]['cc'])
        for k in cell[:3]:
            sel.add(k)
            for d in (-2, -1, 1, 2):           # krótkie ciągi naturalnego ruchu
                j = k + d
                if 0 <= j < len(good) and good[j]['src'] == good[k]['src'] and abs(good[j]['i'] - good[k]['i']) == abs(d):
                    sel.add(j)
sel = sorted(sel)
print('wybranych klatek', len(sel))
frames = [good[k] for k in sel]
idx = {(f['src'], f['i']): n for n, f in enumerate(frames)}
nxt = [idx.get((f['src'], f['i'] + 1), -1) for f in frames]
cols = 12; rows = (len(frames) + cols - 1) // cols
grid = np.zeros((rows * TH, cols * TW, 4), np.uint8)
for n, f in enumerate(frames):
    r, c = divmod(n, cols)
    grid[r * TH:(r + 1) * TH, c * TW:(c + 1) * TW] = np.dstack([f['crop'], (mask * 255).astype(np.uint8)])
os.makedirs(out_dir, exist_ok=True)
cv2.imwrite(os.path.join(out_dir, 'usta-klatki.webp'), grid, [cv2.IMWRITE_WEBP_QUALITY, 93])
cv2.imwrite(os.path.join(out_dir, 'usta-klatki.png'), grid)
json.dump({'tileW': TW, 'tileH': TH, 'x0': X0, 'y0': Y0, 'cols': cols,
           'frames': [{'src': f['src'], 'i': f['i'], 'open': round(f['fo'], 3), 'teeth': round(f['ft'], 3), 'width': f['width']} for f in frames],
           'next': nxt}, open(os.path.join(out_dir, 'usta-klatki.json'), 'w'), separators=(',', ':'))
