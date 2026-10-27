#!/usr/bin/env python3
"""Kształty ust jako RUCH jej prawdziwych warg (bez wklejania obcych ust).

1) Kafelki z arkusza wizemów (już w pozie kadru bazowego — tools/wizemy_z_arkusza.py).
2) Dopasowanie afiniczne zamkniętych ust z arkusza do jej prawdziwych zamkniętych ust z kadru (ECC).
3) Dla każdego kształtu k: przepływ optyczny (zamknięte → k) liczony NA ARKUSZU, przeniesiony na jej usta:
   jej wargi z kadru są przesuwane i rozciągane tak jak wargi na arkuszu.
4) Tam, gdzie usta się otwierają (wnętrze: ciemność, zęby), wstawiane jest wnętrze z arkusza (miękka maska).
5) Maska kafelka jak dotąd: eliptyczna, kąciki z prawdziwej twarzy.

Wynik nadpisuje usta-atlas.png (te same nazwy kształtów, „closed” = jej prawdziwe zamknięte usta).
Użycie: python3 -I usta_ruch_z_arkusza.py usta-atlas.png usta-atlas.json KADR.jpg PODGLĄD.jpg
"""
import json, sys
import cv2
import numpy as np

atlas_p, meta_p, poster_p, preview_p = sys.argv[1:5]
m = json.load(open(meta_p))
A = cv2.imread(atlas_p, cv2.IMREAD_UNCHANGED)
TW, TH, OFF = m['tileW'], m['tileH'], m['offY']
names = m['shapes']
sheet = {n: A[:, k * TW:(k + 1) * TW].astype(np.float32) for k, n in enumerate(names)}
ref = cv2.imread(poster_p)
MX, MY = 582, 227
R = ref[MY + OFF - TH // 2:MY + OFF + TH // 2, MX - TW // 2:MX + TW // 2].astype(np.float32)
mask = sheet['closed'][..., 3] / 255.0
gray = lambda im: cv2.cvtColor(np.clip(im[..., :3], 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)

# 2) arkusz(zamknięte) → jej usta: afinicznie (ECC na obrazie gradientu w obrębie ust)
def grad(g):
    gx = cv2.Sobel(g, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(g, cv2.CV_32F, 0, 1, ksize=3)
    return cv2.GaussianBlur(cv2.magnitude(gx, gy), (0, 0), 1.2)
W = np.eye(2, 3, dtype=np.float32)
crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6)
inner = ((mask > 0.5) * 255).astype(np.uint8)
try:
    cc, W = cv2.findTransformECC(grad(gray(R)), grad(gray(sheet['closed'])), W, cv2.MOTION_AFFINE, crit, inner, 5)
except cv2.error as e:
    cc = -1
print('dopasowanie zamkniętych ust arkusz→jej usta: ECC', round(float(cc), 3), 'macierz', np.round(W, 3).tolist())
def to_real(im):   # obraz z układu arkusza do układu jej ust
    return cv2.warpAffine(im, W, (TW, TH), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
S = {n: to_real(v) for n, v in sheet.items()}

# 3) przepływ na arkuszu: dla piksela kształtu k — skąd przyszedł w ustach zamkniętych
SC = 4
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
def flow(a, b):
    ga = cv2.resize(gray(a), None, fx=SC, fy=SC, interpolation=cv2.INTER_CUBIC).astype(np.uint8)
    gb = cv2.resize(gray(b), None, fx=SC, fy=SC, interpolation=cv2.INTER_CUBIC).astype(np.uint8)
    f = dis.calc(ga, gb, None)
    f = cv2.GaussianBlur(f, (0, 0), 5.0)
    return cv2.resize(f, (TW, TH), interpolation=cv2.INTER_AREA) / SC
yy, xx = np.mgrid[0:TH, 0:TW].astype(np.float32)

# eliptyczny układ ust (oś wzdłuż warg) — do wygaszania wnętrza przy kącikach
ang = np.radians(m.get('roll0', -9.5)); cx0, cy0 = TW / 2, TH / 2 - OFF
EX = ((xx - cx0) * np.cos(ang) - (yy - cy0) * np.sin(ang)) / 24.0
EY = ((xx - cx0) * np.sin(ang) + (yy - cy0) * np.cos(ang)) / 14.0
corner = np.clip((0.92 - np.abs(EX)) / 0.25, 0, 1) * np.clip((1.0 - np.abs(EY - 0.15)) / 0.3, 0, 1)

def opening(t):
    """wnętrze otwartych ust: ciemne albo zęby; tylko jeden spójny obszar między wargami, wygaszony przy kącikach"""
    lab = cv2.cvtColor(np.clip(t[..., :3], 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    L, a = lab[..., 0], lab[..., 1]
    Lr = cv2.cvtColor(R.astype(np.uint8), cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32).mean()
    dark = np.clip((Lr * 0.55 - L) / 14, 0, 1)
    teeth = np.clip((L - Lr * 1.08) / 14, 0, 1) * np.clip((138 - a) / 5, 0, 1)
    o = np.maximum(dark, teeth) * corner
    b = (o > 0.35).astype(np.uint8)
    n, lab_cc, st, _ = cv2.connectedComponentsWithStats(b, 8)
    if n <= 1:
        return np.zeros_like(o)
    big = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    if st[big, cv2.CC_STAT_AREA] < 12:                 # za mało, by to było otwarcie ust
        return np.zeros_like(o)
    keep = (lab_cc == big).astype(np.uint8)
    keep = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    keep = cv2.dilate(keep, np.ones((2, 2), np.uint8))
    return cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 0.8) * corner

out = []; prev = []
for n in names:
    if n == 'closed':
        tile = R.copy()
    else:
        f = flow(S[n], S['closed'])                 # piksel w kształcie n → położenie w ustach zamkniętych
        moved = cv2.remap(R, xx + f[..., 0], yy + f[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        o = opening(S[n])[..., None]
        tile = moved * (1 - o) + S[n][..., :3] * o
    out.append(np.dstack([tile, mask * 255]))
    base = ref.copy().astype(np.float32); y0, x0 = MY + OFF - TH // 2, MX - TW // 2
    base[y0:y0 + TH, x0:x0 + TW] = base[y0:y0 + TH, x0:x0 + TW] * (1 - mask[..., None]) + tile * mask[..., None]
    v = cv2.resize(np.clip(base[175:275, 532:632], 0, 255).astype(np.uint8), (200, 200), interpolation=cv2.INTER_CUBIC)
    cv2.putText(v, n, (3, 13), cv2.FONT_HERSHEY_SIMPLEX, .42, (0, 255, 255), 1)
    prev.append(v)
cv2.imwrite(atlas_p, np.clip(np.hstack(out), 0, 255).astype(np.uint8))
cv2.imwrite(preview_p, np.vstack([np.hstack(prev[i:i + 8]) for i in range(0, 16, 8)]))
m['source'] = 'ruch warg z arkusza wizemów przeniesiony na jej usta z kadru (2026-10-27)'
json.dump(m, open(meta_p, 'w'), indent=1)
print('kształtów', len(out))
