"""Śledzi twarz (przesunięcie + skala) w każdej klatce klipów względem kadru bazowego.

Wzorzec: okolica oczu, nosa i ust z kadru bazowego. Dla każdej klatki dopasowanie
wieloskalowe w oknie wokół poprzedniej pozycji. Wynik: dla każdej klatki środek ust
(x, y) w pikselach wideo 1280x720, skala względem kadru bazowego i pewność dopasowania.

Użycie: python3 -I track_face.py KADR_BAZOWY.jpg WYJŚCIE.json klip1.mp4 [klip2.mp4 ...]
"""
import json, sys
import cv2
import numpy as np

poster, out_path, clips = sys.argv[1], sys.argv[2], sys.argv[3:]
ref = cv2.cvtColor(cv2.imread(poster), cv2.COLOR_BGR2GRAY)
TX0, TY0, TX1, TY1 = 532, 120, 640, 250          # wzorzec: oczy, nos, usta
MOUTH = (582.0, 227.0)                           # środek ust w kadrze bazowym
tpl = ref[TY0:TY1, TX0:TX1]
tw, th = TX1 - TX0, TY1 - TY0
SCALES = np.arange(0.86, 1.30, 0.02)

def track(path):
    cap = cv2.VideoCapture(path)
    res = []
    px, py, ps = TX0, TY0, 1.0
    while True:
        ok, fr = cap.read()
        if not ok:
            break
        g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        best = (-1, px, py, ps)
        for s in SCALES:
            if abs(s - ps) > 0.08 and res:
                continue
            t = cv2.resize(tpl, (int(tw * s), int(th * s)), interpolation=cv2.INTER_AREA)
            cx, cy = px + tw / 2, py + th / 2
            x0 = int(max(0, cx - tw * s / 2 - 60)); y0 = int(max(0, cy - th * s / 2 - 60))
            x1 = int(min(g.shape[1], cx + tw * s / 2 + 60)); y1 = int(min(g.shape[0], cy + th * s / 2 + 60))
            win = g[y0:y1, x0:x1]
            if win.shape[0] < t.shape[0] or win.shape[1] < t.shape[1]:
                continue
            r = cv2.matchTemplate(win, t, cv2.TM_CCOEFF_NORMED)
            _, mv, _, ml = cv2.minMaxLoc(r)
            if mv > best[0]:
                best = (mv, x0 + ml[0] + t.shape[1] / 2 - tw / 2, y0 + ml[1] + t.shape[0] / 2 - th / 2, s)
        score, bx, by, bs = best
        # środek wzorca w klatce -> środek ust (skalowanie wokół środka wzorca)
        tcx, tcy = bx + tw / 2, by + th / 2
        rcx, rcy = TX0 + tw / 2, TY0 + th / 2
        mx = tcx + (MOUTH[0] - rcx) * bs
        my = tcy + (MOUTH[1] - rcy) * bs
        res.append([round(mx, 1), round(my, 1), round(bs, 3), round(float(score), 3)])
        if score > 0.5:
            px, py, ps = bx, by, bs
    return res

out = {}
for c in clips:
    key = c.rsplit('/', 1)[-1]
    out[key] = track(c)
    sc = [r[3] for r in out[key]]
    print(key, len(sc), 'pewność min/mediana', round(min(sc), 2), round(float(np.median(sc)), 2),
          'skala', min(r[2] for r in out[key]), '-', max(r[2] for r in out[key]))
json.dump(out, open(out_path, 'w'))
