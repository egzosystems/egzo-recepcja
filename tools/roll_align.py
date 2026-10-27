"""Przechył głowy w synchronizacji ust.

1) r0: przechył ust w kadrze bazowym względem poziomych kształtów z atlasu
   (obrót kształtu „rest” dający najlepsze dopasowanie do ust z kadru bazowego).
2) Każdy kształt: obrót o r0, przesunięcie tak, by okolica nad wargą (nos, rynienka,
   górna warga) pokryła się z kadrem bazowym; lekkie wyostrzenie. Atlas zapisany już „w pozie”
   kadru bazowego.
3) Tor pętli spoczynkowej: dla każdej klatki dodatkowy kąt (przechył względem kadru bazowego)
   z dopasowania obróconego wzorca ust.

Użycie: python3 -I roll_align.py KADR.jpg PĘTLA.mp4 ATLAS_ŹRÓDŁOWY.png usta-atlas.json usta-tor.json ATLAS_WYJŚCIOWY.png
"""
import json, sys
import cv2
import numpy as np

poster, idle, atlas_src, meta_p, tor_p, atlas_out = sys.argv[1:7]
ref = cv2.imread(poster)
gref = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY).astype(np.float32)
meta = json.load(open(meta_p))
TW, TH, OFF = meta['tileW'], meta['tileH'], meta['offY']
MX, MY = 582, 227
A = cv2.imread(atlas_src, cv2.IMREAD_UNCHANGED)
base = ref[MY + OFF - TH // 2:MY + OFF + TH // 2, MX - TW // 2:MX + TW // 2]
gbase = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY).astype(np.float32)
c = (TW / 2, TH / 2 - OFF)  # środek ust w łatce

def rot(img, ang, dx=0, dy=0, border=cv2.BORDER_REPLICATE, val=0):
    M = cv2.getRotationMatrix2D(c, ang, 1.0)
    M[0, 2] += dx; M[1, 2] += dy
    return cv2.warpAffine(img, M, (TW, TH), flags=cv2.INTER_CUBIC, borderMode=border, borderValue=val)

def ncc(a, b, m):
    a = a[m]; b = b[m]; a = a - a.mean(); b = b - b.mean()
    return float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-6))

yy, xx = np.mgrid[0:TH, 0:TW]
center = ((xx - c[0]) / 30) ** 2 + ((yy - c[1]) / 12) ** 2 < 1          # same usta
upper = (yy < c[1] - 2) & (yy > c[1] - 20) & (np.abs(xx - c[0]) < 30)     # nad wargą + górna warga

# 1) r0 z kształtu „rest”
rest = cv2.cvtColor(A[:, 0:TW, :3], cv2.COLOR_BGR2GRAY).astype(np.float32)
best = max(((ncc(rot(rest, a, dx, dy), gbase, center), a, dx, dy)
            for a in np.arange(-16, 6.1, 0.5) for dx in range(-6, 7, 2) for dy in range(-6, 7, 2)))
r0 = best[1]
print('przechył ust w kadrze bazowym r0 =', r0, 'st., dopasowanie', round(best[0], 3))

# 2) atlas w pozie kadru bazowego
tiles = []
for k, name in enumerate(meta['shapes']):
    t = A[:, k * TW:(k + 1) * TW]
    g = cv2.cvtColor(t[..., :3], cv2.COLOR_BGR2GRAY).astype(np.float32)
    sc = max(((ncc(rot(g, r0, dx, dy), gbase, upper), dx, dy) for dx in range(-18, 19) for dy in range(-12, 13)))
    _, dx, dy = sc
    rgb = rot(t[..., :3], r0, dx, dy)
    blur = cv2.GaussianBlur(rgb, (0, 0), 1.0)
    rgb = cv2.addWeighted(rgb, 1.6, blur, -0.6, 0)                      # wyostrzenie
    al = rot(t[..., 3], r0, dx, dy, cv2.BORDER_CONSTANT, 0)
    tiles.append(np.dstack([rgb, al]))
    print(name, 'przesunięcie', dx, dy, 'dopasowanie górnej wargi', round(sc[0], 3))
cv2.imwrite(atlas_out, np.hstack(tiles))

# 3) przechył klatka po klatce w pętli (względem kadru bazowego)
tor = json.load(open(tor_p))
tpl = gref[MY - 16:MY + 16, MX - 34:MX + 34]
th, tw = tpl.shape
cap = cv2.VideoCapture(idle)
angles = []
for i, (x, y, s, cf) in enumerate(tor['idle']):
    ok, fr = cap.read()
    if not ok:
        tor['idle'][i] = [x, y, s, cf, 0.0]; continue
    g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    big = int(max(th, tw) * s) + 24
    win = cv2.getRectSubPix(g, (big, big), (x, y))
    bestA = (-2, 0)
    for a in np.arange(-4, 16.1, 1.0):
        M = cv2.getRotationMatrix2D((tw / 2, th / 2), a, s)
        M[0, 2] += 0; M[1, 2] += 0
        t2 = cv2.warpAffine(tpl, M, (tw, th), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        r = cv2.matchTemplate(win, t2, cv2.TM_CCOEFF_NORMED)
        mv = r.max()
        if mv > bestA[0]:
            bestA = (mv, a)
    angles.append(bestA[1])
    tor['idle'][i] = [x, y, s, cf, float(bestA[1])]
print('przechył w pętli względem kadru: min/max', min(angles), max(angles), 'mediana', float(np.median(angles)))
meta['roll0'] = r0
json.dump(meta, open(meta_p, 'w'), indent=1)
json.dump(tor, open(tor_p, 'w'), separators=(',', ':'))
