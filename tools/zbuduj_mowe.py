#!/usr/bin/env python3
"""Buduje wszystkie dane ust do biblioteki „mowa” jednym poleceniem.

Pozycja ust: dopasowanie ECC okolicy ust i brody do kadru bazowego, klatka po klatce. Kluczowe: TA SAMA
metoda liczy tor pętli (gdzie rysować) i wyrównuje klatki biblioteki (co rysować) — wtedy błędy pomiaru się
znoszą i usta nie przekrzywiają się względem twarzy. (Pas policzków/oczu daje inny kąt, bo głowa jest też
lekko odwrócona w bok — tego nie używamy.)

Wyniki (w KATALOG_WYJ):
  usta-tor.json     — dla każdej klatki pętli spoczynkowej: [x, y, skala, jakość, kąt°, [a,b,c,d,e,f]]
                      (a..f: kadr bazowy → klatka, do canvas.setTransform)
  usta-klatki.webp  — prawdziwe klatki dolnej części twarzy w układzie kadru bazowego (RGBA)
  usta-klatki.json  — {tileW, tileH, x0, y0, cols, frames:[{src,i,open,teeth}], next:[...]}

Użycie:
  python3 -I tools/zbuduj_mowe.py KADR.jpg PĘTLA.mp4 KATALOG_WYJ [KLIP_MÓWIENIA.mp4 ...] [NAZWA=KLIP_POZY.mp4 ...]
KLIP_MÓWIENIA.mp4 — dokłada do biblioteki klatki z szerzej otwartymi ustami (ta sama poza co pętla).
NAZWA=KLIP_POZY.mp4 — tylko tor (gdzie i pod jakim kątem rysować usta) dla innej pozy, zapisany pod kluczem NAZWA;
                      strona zwraca tę nazwę w wideo().klip, gdy ten klip jest na ekranie.
"""
import json, math, os, sys
import cv2
import numpy as np

poster_p, idle_p, out_dir = sys.argv[1:4]
extra = [a for a in sys.argv[4:] if '=' not in a]
poses = [a.split('=', 1) for a in sys.argv[4:] if '=' in a]
ref_bgr = cv2.imread(poster_p)
ref = cv2.cvtColor(ref_bgr, cv2.COLOR_BGR2GRAY)
MX, MY = 582.0, 227.0

# --- okolica ust i brody (dolna część nosa, usta, broda): to ona decyduje o kącie ust na ekranie.
# TA SAMA metoda dla toru pętli i dla klatek biblioteki → błędy się znoszą, usta trafiają w kąt twarzy.
SX0, SY0, SX1, SY1 = 527, 192, 637, 282
strip = cv2.GaussianBlur(ref[SY0:SY1, SX0:SX1].astype(np.float32), (0, 0), 1.0)
CRIT = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)

def track_clip(path):
    """dla każdej klatki: przekształcenie kadr bazowy → klatka (2×3, afiniczne) i jakość dopasowania ECC"""
    cap = cv2.VideoCapture(path); res = []; W = None
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        g = cv2.GaussianBlur(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.0)
        if W is None:
            r = cv2.matchTemplate(g[40:420, 360:820], strip, cv2.TM_CCOEFF_NORMED); _, _, _, ml = cv2.minMaxLoc(r)
            W = np.float32([[1, 0, ml[0] + 360], [0, 1, ml[1] + 40]])
        try:
            cc, W2 = cv2.findTransformECC(strip, g, W.copy(), cv2.MOTION_AFFINE, CRIT, None, 3)
            W = W2
        except cv2.error:
            cc = 0.0
        T = W.copy(); T[:, 2] = W[:, 2] - W[:, :2] @ np.float32([SX0, SY0])
        res.append((T, float(cc), fr))
    return res

def smooth(Ts, k=1):
    """lekkie wygładzenie w czasie (średnia macierzy z okna ±k klatek)"""
    A = np.array(Ts); return [A[max(0, i - k):i + k + 1].mean(axis=0).astype(np.float32) for i in range(len(A))]

# --- 1) tor pętli spoczynkowej
idle = track_clip(idle_p)
Ts = smooth([t for t, _, _ in idle])
nin = [n for _, n, _ in idle]
def tor_of(Ts, nin):
    out = []
    for T, n in zip(Ts, nin):
        mx, my = T @ np.float32([MX, MY, 1])
        s = math.sqrt(abs(np.linalg.det(T[:, :2]))); ang = math.degrees(math.atan2(T[1, 0], T[0, 0]))
        out.append([round(float(mx), 2), round(float(my), 2), round(s, 4), round(n, 3), round(ang, 2),
                    [round(float(T[0, 0]), 5), round(float(T[1, 0]), 5), round(float(T[0, 1]), 5), round(float(T[1, 1]), 5), round(float(T[0, 2]), 2), round(float(T[1, 2]), 2)]])
    an = [t[4] for t in out]; q = [t[3] for t in out]
    print(f'  {len(out)} klatek | kąt głowy {min(an):.1f}…{max(an):.1f}° | skala {min(t[2] for t in out):.3f}…{max(t[2] for t in out):.3f} | jakość min {min(q):.2f}')
    return out
print('pętla:'); tor = tor_of(Ts, nin)
tory = {'fps': 24, 'mouth0': [MX, MY], 'metoda': 'ECC na okolicy ust i brody (ta sama dla toru i klatek)', 'idle': tor}
for name, path in poses:
    print(f'poza {name}:'); pr = track_clip(path)
    tory[name] = tor_of(smooth([t for t, _, _ in pr]), [n for _, n, _ in pr])
os.makedirs(out_dir, exist_ok=True)
json.dump(tory, open(os.path.join(out_dir, 'usta-tor.json'), 'w'), separators=(',', ':'))

# --- 2) biblioteka prawdziwych klatek dolnej części twarzy
X0, Y0, TW, TH = 518, 188, 128, 116
yy, xx = np.mgrid[0:TH, 0:TW].astype(np.float32)
cx, cy = MX - X0, MY - Y0 + 14
ell = ((xx - cx) / 56) ** 2 + ((yy - cy) / 50) ** 2
mask = np.clip((1 - ell) / 0.45, 0, 1) ** 1.3
ring = (ell > 0.6) & (ell < 1.0)
ang0 = np.radians(-9.5)
EX = ((xx - (MX - X0)) * np.cos(ang0) - (yy - (MY - Y0)) * np.sin(ang0)) / 30
EY = ((xx - (MX - X0)) * np.sin(ang0) + (yy - (MY - Y0)) * np.cos(ang0)) / 16
mouth = (EX ** 2 + (EY - 0.35) ** 2) < 1
refc = ref_bgr[Y0:Y0 + TH, X0:X0 + TW]
rl = cv2.cvtColor(refc, cv2.COLOR_BGR2LAB).astype(np.float32)
skinL = float(rl[..., 0][ring].mean())

def crop_of(fr, T):
    # piksel wycinka (u,v) → kadr bazowy (X0+u, Y0+v) → klatka (przez T)
    Mc = np.float32([[T[0, 0], T[0, 1], T[0, 0] * X0 + T[0, 1] * Y0 + T[0, 2]],
                     [T[1, 0], T[1, 1], T[1, 0] * X0 + T[1, 1] * Y0 + T[1, 2]]])
    return cv2.warpAffine(fr, Mc, (TW, TH), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)

def features(crop):
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, a = lab[..., 0], lab[..., 1]
    dark = (L < skinL * 0.5) & mouth
    teeth = (L > skinL * 1.1) & (a < 140) & mouth
    return float(dark.sum()), float(teeth.sum())

cands = []
sources = [(os.path.basename(idle_p), [(T, n, fr) for (T, n), (_, _, fr) in zip(zip(Ts, nin), idle)])]
for p in extra:
    tr = track_clip(p); sm = smooth([t for t, _, _ in tr])
    sources.append((os.path.basename(p), [(T, n, fr) for (T, n), (_, _, fr) in zip(zip(sm, [n for _, n, _ in tr]), tr)]))
for name, frames in sources:
    for i, (T, n, fr) in enumerate(frames):
        c = crop_of(fr, T)
        diff = float(np.abs(c.astype(np.float32) - refc.astype(np.float32)).mean(axis=2)[ring & ~mouth].mean())
        rot = math.degrees(math.atan2(T[1, 0], T[0, 0]))
        o, t = features(c)
        cands.append(dict(src=name, i=i, n=n, diff=diff, rot=rot, open=o, teeth=t, crop=c))
good = [c for c in cands if c['n'] >= 0.85 and c['diff'] < 24]
print('klatek', len(cands), '| dobrych', len(good))
for c in good:   # kolor jak w kadrze bazowym
    lab = cv2.cvtColor(c['crop'], cv2.COLOR_BGR2LAB).astype(np.float32)
    for ch in range(3):
        a, b = lab[..., ch][ring], rl[..., ch][ring]
        lab[..., ch] = (lab[..., ch] - a.mean()) * min(1.15, max(0.85, b.std() / max(a.std(), 1e-3))) + b.mean()
    c['crop'] = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
omax = max(1.0, np.percentile([c['open'] for c in good], 98)); tmax = max(1.0, np.percentile([c['teeth'] for c in good], 98))
for c in good:
    c['fo'] = min(1.0, c['open'] / omax); c['ft'] = min(1.0, c['teeth'] / tmax)
sel = set()
for oi in range(10):
    for ti in range(4):
        cell = [k for k, c in enumerate(good) if int(min(9, c['fo'] * 10)) == oi and int(min(3, c['ft'] * 4)) == ti]
        cell.sort(key=lambda k: good[k]['diff'])
        for k in cell[:3]:
            sel.add(k)
            for d in (-2, -1, 1, 2):
                j = k + d
                if 0 <= j < len(good) and good[j]['src'] == good[k]['src'] and good[j]['i'] - good[k]['i'] == d:
                    sel.add(j)
sel = sorted(sel); frames = [good[k] for k in sel]
idx = {(f['src'], f['i']): n for n, f in enumerate(frames)}
nxt = [idx.get((f['src'], f['i'] + 1), -1) for f in frames]
cols = 12; rows = (len(frames) + cols - 1) // cols
grid = np.zeros((rows * TH, cols * TW, 4), np.uint8)
for n, f in enumerate(frames):
    r, cc = divmod(n, cols)
    grid[r * TH:(r + 1) * TH, cc * TW:(cc + 1) * TW] = np.dstack([f['crop'], (mask * 255).astype(np.uint8)])
cv2.imwrite(os.path.join(out_dir, 'usta-klatki.webp'), grid, [cv2.IMWRITE_WEBP_QUALITY, 93])
json.dump({'tileW': TW, 'tileH': TH, 'x0': X0, 'y0': Y0, 'cols': cols,
           'frames': [{'src': f['src'], 'i': f['i'], 'open': round(f['fo'], 3), 'teeth': round(f['ft'], 3)} for f in frames],
           'next': nxt}, open(os.path.join(out_dir, 'usta-klatki.json'), 'w'), separators=(',', ':'))
print('biblioteka klatek:', len(frames), '| ciągi:', sum(1 for x in nxt if x >= 0))
