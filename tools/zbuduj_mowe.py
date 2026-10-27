#!/usr/bin/env python3
"""Buduje wszystkie dane ust do biblioteki „mowa” jednym poleceniem.

Pozycja ust: dopasowanie ECC okolicy ust i brody do kadru bazowego, klatka po klatce. Kluczowe: TA SAMA
metoda liczy tor pętli (gdzie rysować) i wyrównuje klatki biblioteki (co rysować) — wtedy błędy pomiaru się
znoszą i usta nie przekrzywiają się względem twarzy. (Pas policzków/oczu daje inny kąt, bo głowa jest też
lekko odwrócona w bok — tego nie używamy.)

Poza głowy: każda klatka dostaje wektor pozy (4 liczby, z wyglądu głowy bez ust). Strona wkleja usta
tylko z klatek o pozie zbliżonej do obrazu na ekranie — wtedy kąt ust zgadza się z twarzą także przy
przechylaniu i odwracaniu głowy (czego płaskie przekształcenie samo nie odda).

Wyniki (w KATALOG_WYJ):
  usta-tor.json     — dla każdej klatki pętli spoczynkowej: [x, y, skala, jakość, kąt°, [a,b,c,d,e,f]]
                      (a..f: kadr bazowy → klatka, do canvas.setTransform); poza.idle: wektor pozy klatki
  usta-klatki.webp  — prawdziwe klatki dolnej części twarzy w układzie kadru bazowego (RGBA)
  usta-klatki.json  — {tileW, tileH, x0, y0, cols, frames:[{src,i,open,teeth}], poza:[...], next:[...]}

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

# --- 2) POZA GŁOWY każdej klatki (z wyglądu głowy bez ust: oczy, nos, policzki, kontur twarzy)
# Usta wklejamy tylko z klatek o podobnej pozie — płaskie przekształcenie nie odda obrotu głowy w przestrzeni,
# a przy podobnej pozie błąd kąta ust spada z ~5° (do 11°) do ~0,4°.
def pose_feat(fr, mx, my):
    g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)[60:320, 450:720].astype(np.float32)
    bx, by = int(mx) - 450, int(my) - 60
    g[max(0, by - 18):by + 22, max(0, bx - 42):bx + 42] = 0     # usta wyłączone
    return cv2.resize(cv2.GaussianBlur(g, (0, 0), 4), (34, 32)).ravel()
Fi = np.array([pose_feat(fr, t[0], t[1]) for (_, _, fr), t in zip(idle, tor)])
mu = Fi.mean(0); U, sv, Vt = np.linalg.svd(Fi - mu, full_matrices=False)
B = Vt[:4]
Pi = (Fi - mu) @ B.T
unit = float(np.median(np.linalg.norm(Pi[1:] - Pi[:-1], axis=1)))   # 1 = typowa zmiana pozy między klatkami
Pi /= unit
project = lambda fr, mx, my: ((pose_feat(fr, mx, my) - mu) @ B.T) / unit
print(f'poza: 4 składowe ({(sv[:4]**2 / (sv**2).sum()).sum():.0%} zmienności)')
tory['poza'] = {'idle': [[round(float(v), 2) for v in p] for p in Pi]}
os.makedirs(out_dir, exist_ok=True)
json.dump(tory, open(os.path.join(out_dir, 'usta-tor.json'), 'w'), separators=(',', ':'))

# --- 3) biblioteka prawdziwych klatek dolnej części twarzy (co STEP-ta klatka pętli + klipy mówienia)
STEP = 2
X0, Y0, TW, TH = 518, 188, 128, 116
yy, xx = np.mgrid[0:TH, 0:TW].astype(np.float32)
cx, cy = MX - X0, MY - Y0 + 14
ell = ((xx - cx) / 56) ** 2 + ((yy - cy) / 50) ** 2
mask = np.clip((1 - ell) / 0.45, 0, 1) ** 1.3
ang0 = np.radians(-9.5)
EX = ((xx - (MX - X0)) * np.cos(ang0) - (yy - (MY - Y0)) * np.sin(ang0)) / 30
EY = ((xx - (MX - X0)) * np.sin(ang0) + (yy - (MY - Y0)) * np.cos(ang0)) / 16
mouth = (EX ** 2 + (EY - 0.35) ** 2) < 1
refc = ref_bgr[Y0:Y0 + TH, X0:X0 + TW]
skinL = float(cv2.cvtColor(refc, cv2.COLOR_BGR2LAB)[..., 0][(ell > 0.6) & (ell < 1.0)].mean())

def crop_of(fr, T):
    Mc = np.float32([[T[0, 0], T[0, 1], T[0, 0] * X0 + T[0, 1] * Y0 + T[0, 2]],
                     [T[1, 0], T[1, 1], T[1, 0] * X0 + T[1, 1] * Y0 + T[1, 2]]])
    return cv2.warpAffine(fr, Mc, (TW, TH), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)

def features(crop):
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).astype(np.float32)
    L, a = lab[..., 0], lab[..., 1]
    return float(((L < skinL * 0.5) & mouth).sum()), float(((L > skinL * 1.1) & (a < 140) & mouth).sum())

frames = []
for i in range(0, len(idle), STEP):
    T, n, fr = Ts[i], nin[i], idle[i][2]
    if n < 0.85: continue
    c = crop_of(fr, T); o, t = features(c)
    frames.append(dict(src=os.path.basename(idle_p), i=i, open=o, teeth=t, crop=c, poza=Pi[i]))
for p in extra:
    tr = track_clip(p); sm = smooth([t for t, _, _ in tr])
    for i, ((_, n, fr), T) in enumerate(zip(tr, sm)):
        if n < 0.85: continue
        mx, my = T @ np.float32([MX, MY, 1]); c = crop_of(fr, T); o, t = features(c)
        frames.append(dict(src=os.path.basename(p), i=i, open=o, teeth=t, crop=c, poza=project(fr, mx, my)))
omax = max(1.0, np.percentile([f['open'] for f in frames], 98)); tmax = max(1.0, np.percentile([f['teeth'] for f in frames], 98))
idx = {(f['src'], f['i']): n for n, f in enumerate(frames)}
nxt = [idx.get((f['src'], f['i'] + (STEP if f['src'] == os.path.basename(idle_p) else 1)), -1) for f in frames]
for f in frames: f['fo'] = min(1.0, f['open'] / omax); f['ft'] = min(1.0, f['teeth'] / tmax)

# --- 4) PRZENIESIENIE OTWARTYCH UST do póz, w których nagranie ich nie ma
# W pętli usta otwierają się tylko przy przechylonej głowie; w prostej pozie są prawie zamknięte. Dla kotwic
# co ANCHOR_STEP klatek pętli liczymy, jak wpasować otwarte usta z innej pozy w tę pozę: dopasowanie ECC
# dolnej części twarzy BEZ warg i BEZ żuchwy (nos, rynienka, policzki) → korekta (macierz 2×3).
# Strona rysuje wtedy tę samą klatkę z korektą — w bibliotece to „klatka wirtualna” o pozie kotwicy.
POSE_LIMIT, ANCHOR_STEP = 16.0, 24
cxm, cym = MX - X0, MY - Y0
lipsM = ((xx - cxm) / 36) ** 2 + ((yy - cym - 3) / 19) ** 2 < 1
regM = (~lipsM & ~(yy > cym + 22) & (ell < 1.0)).astype(np.uint8)
ringM = (ell > 0.55) & (ell < 1.0) & ~lipsM
g_ = lambda c: cv2.GaussianBlur(cv2.cvtColor(c, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
PT = np.array([f['poza'] for f in frames])
virt, used = [], {}
for a in range(0, len(idle), ANCHOR_STEP):
    if nin[a] < 0.85: continue
    d = np.linalg.norm(PT - Pi[a], axis=1)
    near_open = max([f['fo'] for f, dd in zip(frames, d) if dd <= POSE_LIMIT] or [0])
    if near_open >= 0.6: continue                     # ta poza ma własne otwarte usta
    dst = crop_of(idle[a][2], Ts[a]); gd = g_(dst)
    lab_a = cv2.cvtColor(dst, cv2.COLOR_BGR2LAB).astype(np.float32)[ringM].mean(0)
    for k, f in enumerate(frames):
        if f['fo'] < 0.3 or d[k] <= POSE_LIMIT: continue
        try:
            cc, W = cv2.findTransformECC(gd, g_(f['crop']), np.eye(2, 3, dtype=np.float32), cv2.MOTION_AFFINE,
                                         (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), regM, 3)
        except cv2.error:
            continue
        rot = math.degrees(math.atan2(W[1, 0], W[0, 0])); sc = math.sqrt(abs(np.linalg.det(W[:, :2])))
        if cc < 0.9 or abs(rot) > 15 or not 0.85 < sc < 1.18: continue
        C = cv2.invertAffineTransform(W)              # piksel klatki źródłowej → miejsce w pozie kotwicy
        used.setdefault(k, []).append(lab_a)
        virt.append(dict(k=k, a=a, m=C, rot=rot))
# kolor: jedna przebarwiona kopia każdej przenoszonej klatki (do średniego koloru skóry kotwic, w których jest użyta)
copy_of = {}
for k, labs in used.items():
    c = cv2.cvtColor(frames[k]['crop'], cv2.COLOR_BGR2LAB).astype(np.float32)
    c += (np.mean(labs, axis=0) - c[ringM].mean(0))
    nf = dict(frames[k]); nf['crop'] = cv2.cvtColor(np.clip(c, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR); nf['kopia'] = True
    copy_of[k] = len(frames); frames.append(nf); nxt.append(-1)
vidx = {(v['k'], v['a']): n for n, v in enumerate(virt)}
vnext = [vidx.get((nxt[v['k']], v['a']), -1) if nxt[v['k']] >= 0 else -1 for v in virt]
print(f'przeniesione otwarte usta: {len(virt)} klatek wirtualnych w {len(set(v["a"] for v in virt))} kotwicach | korekta kąta {min(v["rot"] for v in virt):+.1f}…{max(v["rot"] for v in virt):+.1f}°' if virt else 'przeniesione otwarte usta: brak')
cols = 16; rows = (len(frames) + cols - 1) // cols
grid = np.zeros((rows * TH, cols * TW, 4), np.uint8)
for n, f in enumerate(frames):
    r, cc = divmod(n, cols)
    grid[r * TH:(r + 1) * TH, cc * TW:(cc + 1) * TW] = np.dstack([f['crop'], (mask * 255).astype(np.uint8)])
cv2.imwrite(os.path.join(out_dir, 'usta-klatki.webp'), grid, [cv2.IMWRITE_WEBP_QUALITY, 90])
json.dump({'tileW': TW, 'tileH': TH, 'x0': X0, 'y0': Y0, 'cols': cols,
           'frames': [{'src': f['src'], 'i': f['i'], 'open': round(f['fo'], 3), 'teeth': round(f['ft'], 3), **({'kopia': 1} if f.get('kopia') else {})} for f in frames],
           'poza': [[round(float(v), 2) for v in f['poza']] for f in frames],
           'next': nxt,
           # klatki wirtualne: [kafelek, klatka_kotwicy, a,b,c,d,e,f (macierz w układzie kafelka), następna_wirtualna]
           'wirtualne': [[copy_of[v['k']], v['a'], *[round(float(x), 4) for x in (v['m'][0, 0], v['m'][1, 0], v['m'][0, 1], v['m'][1, 1], v['m'][0, 2], v['m'][1, 2])], vn] for v, vn in zip(virt, vnext)]}, open(os.path.join(out_dir, 'usta-klatki.json'), 'w'), separators=(',', ':'))
print('biblioteka klatek:', len(frames), '| ciągi:', sum(1 for x in nxt if x >= 0), '| plik', os.path.getsize(os.path.join(out_dir, 'usta-klatki.webp')) // 1024, 'KB')
