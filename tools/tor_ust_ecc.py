#!/usr/bin/env python3
"""Tor ust klatka po klatce: położenie, skala i OBRÓT (przechył głowy) względem kadru bazowego.

Wzorzec: okolica ust z kadru bazowego (dolna część nosa, usta, broda). Dla każdej klatki pętli
dopasowanie ECC (MOTION_AFFINE) startujące z poprzedniej klatki; z macierzy wyciągamy środek ust,
skalę i kąt. Wynik: usta-tor.json z wpisami [x, y, skala, pewność, kąt°, [a, b, c, d, e, f]]
(ostatnie = macierz dla canvas.setTransform: punkt kadru bazowego → punkt klatki).

Użycie: python3 -I tor_ust_ecc.py KADR.jpg PĘTLA.mp4 usta-tor.json
"""
import json, math, sys
import cv2
import numpy as np

poster, idle, out_p = sys.argv[1:4]
ref = cv2.cvtColor(cv2.imread(poster), cv2.COLOR_BGR2GRAY).astype(np.float32)
MX, MY = 582.0, 227.0
X0, Y0, X1, Y1 = 527, 192, 637, 282          # wzorzec 110×90 wokół ust
tpl = cv2.GaussianBlur(ref[Y0:Y1, X0:X1], (0, 0), 1.0)
cx, cy = MX - X0, MY - Y0                   # środek ust we wzorcu
crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-5)
cap = cv2.VideoCapture(idle)
W = np.float32([[1, 0, X0], [0, 1, Y0]])     # wzorzec → klatka
out = []
while True:
    ok, fr = cap.read()
    if not ok:
        break
    g = cv2.GaussianBlur(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.0)
    try:
        cc, W2 = cv2.findTransformECC(tpl, g, W.copy(), cv2.MOTION_AFFINE, crit, None, 3)
        W = W2
    except cv2.error:
        cc = 0.0
    mx = W[0, 0] * cx + W[0, 1] * cy + W[0, 2]
    my = W[1, 0] * cx + W[1, 1] * cy + W[1, 2]
    s = math.sqrt(abs(np.linalg.det(W[:, :2])))
    ang = math.degrees(math.atan2(W[1, 0], W[0, 0]))   # obrót wzorca w klatce (dodatni = zgodnie z ruchem wskazówek w obrazie)
    # pełne przekształcenie kadr bazowy → klatka (do canvas.setTransform): p' = L·p + t
    L = W[:, :2]; t = W[:, 2] - L @ np.float32([X0, Y0])
    out.append([round(float(mx), 2), round(float(my), 2), round(s, 4), round(float(cc), 3), round(ang, 2),
                [round(float(L[0, 0]), 5), round(float(L[1, 0]), 5), round(float(L[0, 1]), 5), round(float(L[1, 1]), 5), round(float(t[0]), 2), round(float(t[1]), 2)]])
cc = [o[3] for o in out]; an = [o[4] for o in out]
print(f'klatek {len(out)} | pewność min {min(cc):.2f} mediana {np.median(cc):.2f} | kąt {min(an):.1f}…{max(an):.1f}° | skala {min(o[2] for o in out):.3f}…{max(o[2] for o in out):.3f}')
json.dump({'fps': 24, 'mouth0': [MX, MY], 'idle': out}, open(out_p, 'w'), separators=(',', ':'))
