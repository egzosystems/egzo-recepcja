"""Doprecyzowanie synchronizacji ust.

1) Tor ust w pętli spoczynkowej: w każdej klatce dopasowanie samego wzorca ust (z kadru
   bazowego, usta zamknięte) w małym oknie wokół pozycji z toru twarzy -> dokładny środek ust.
2) Atlas: każdy kształt przesunięty tak, by górna warga leżała tam, gdzie w kadrze bazowym
   (dopasowanie pasa górnej wargi i okolicy nad nią wewnątrz łatki).

Użycie: python3 -I refine_lips.py KADR.jpg PĘTLA.mp4 usta-tor.json usta-atlas.png usta-atlas.json
(pliki toru i atlasu są nadpisywane)
"""
import json, sys
import cv2
import numpy as np

poster, idle, tor_p, atlas_p, meta_p = sys.argv[1:6]
ref = cv2.imread(poster)
gref = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY).astype(np.float32)
MX, MY = 582, 227
mouth_t = gref[MY - 16:MY + 16, MX - 34:MX + 34]          # usta zamknięte + kąciki
tor = json.load(open(tor_p))
track = tor['idle']

cap = cv2.VideoCapture(idle)
out = []
for i, (x, y, s, c) in enumerate(track):
    ok, fr = cap.read()
    if not ok:
        out.append([x, y, s, c]); continue
    g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    t = cv2.resize(mouth_t, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
    th, tw = t.shape
    R = 14
    x0, y0 = int(x - tw / 2 - R), int(y - th / 2 - R)
    win = g[y0:y0 + th + 2 * R, x0:x0 + tw + 2 * R]
    r = cv2.matchTemplate(win, t, cv2.TM_CCOEFF_NORMED)
    _, mv, _, ml = cv2.minMaxLoc(r)
    # dokładność podpikselowa: parabola wokół maksimum
    def sub(a, i, n):
        if 0 < i < n - 1:
            d = a[i - 1] - 2 * a[i] + a[i + 1]
            return i + (0.5 * (a[i - 1] - a[i + 1]) / d if d != 0 else 0)
        return i
    px = sub(r[ml[1], :], ml[0], r.shape[1]); py = sub(r[:, ml[0]], ml[1], r.shape[0])
    nx, ny = x0 + px + tw / 2, y0 + py + th / 2
    out.append([round(float(nx), 1), round(float(ny), 1), s, round(float(mv), 3)])
sc = [o[3] for o in out]
shift = [np.hypot(o[0] - t[0], o[1] - t[1]) for o, t in zip(out, track)]
print('tor ust: pewność min/mediana', round(min(sc), 2), round(float(np.median(sc)), 2), '| korekta px mediana/max', round(float(np.median(shift)), 1), round(float(max(shift)), 1))
tor['idle'] = out
json.dump(tor, open(tor_p, 'w'), separators=(',', ':'))

# --- atlas: wyrównanie górnej wargi
meta = json.load(open(meta_p))
atlas = cv2.imread(atlas_p, cv2.IMREAD_UNCHANGED)
TW, TH, OFF = meta['tileW'], meta['tileH'], meta['offY']
# pas: okolica pod nosem + górna warga, w układzie łatki
cy = TH // 2 - OFF                 # środek ust w łatce
band = gref[MY - 18:MY - 2, MX - 30:MX + 30]
tiles = []
for k in range(len(meta['shapes'])):
    tile = atlas[:, k * TW:(k + 1) * TW]
    g = cv2.cvtColor(tile[..., :3], cv2.COLOR_BGR2GRAY).astype(np.float32)
    r = cv2.matchTemplate(g, band, cv2.TM_CCOEFF_NORMED)
    _, mv, _, ml = cv2.minMaxLoc(r)
    ex, ey = TW // 2 - 30, cy - 18          # gdzie pas powinien być
    dx, dy = ex - ml[0], ey - ml[1]
    if abs(dx) > 8 or abs(dy) > 8 or mv < 0.4:
        dx = dy = 0                          # niepewne dopasowanie: bez zmian
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    rgb = cv2.warpAffine(tile[..., :3], M, (TW, TH), borderMode=cv2.BORDER_REPLICATE)
    a = cv2.warpAffine(tile[..., 3], M, (TW, TH), borderValue=0)
    tiles.append(np.dstack([rgb, a]))
    print(meta['shapes'][k], 'przesunięcie', dx, dy, 'pewność', round(float(mv), 2))
cv2.imwrite(atlas_p, np.hstack(tiles))
