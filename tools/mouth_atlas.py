"""Buduje atlas kształtów ust z klatek klipu powitania.

Dla każdej wybranej klatki: dokładne dopasowanie okolicy nosa/górnej wargi (stabilnej przy mówieniu)
w skali z śledzenia, wycięcie łatki wokół ust, przeskalowanie do skali kadru bazowego,
dopasowanie koloru do skóry wokół ust w kadrze bazowym. Wynik: jeden PNG (łatki w rzędzie,
kanał alfa = miękka elipsa) + JSON z nazwami kształtów.

Użycie: python3 -I mouth_atlas.py KLIP_POWITANIA.mp4 KADR_BAZOWY.jpg TRACK.json KATALOG_WYJŚCIOWY
"""
import json, os, sys
import cv2
import numpy as np

clip, poster, track_path, out_dir = sys.argv[1:5]
os.makedirs(out_dir, exist_ok=True)
ref = cv2.imread(poster)
REF_MOUTH = (582, 227)
PW, PH = 84, 60            # łatka w skali kadru bazowego
OFF_Y = 7                  # łatka sięga niżej niż środek ust (żuchwa)
# kształty: nazwa -> klatka w klipie powitania (wybrane ręcznie z montażu)
SHAPES = {"rest": 46, "slight": 62, "mid": 72, "open": 54, "wide": 68, "o": 58, "o2": 76, "s": 50, "teeth": 80}

# wzorzec nosa i górnej części ust z kadru bazowego (mało się zmienia przy mówieniu)
NX0, NY0, NX1, NY1 = 556, 168, 610, 218
nose = ref[NY0:NY1, NX0:NX1]
cap = cv2.VideoCapture(clip)
frames = {}
for name, n in SHAPES.items():
    cap.set(cv2.CAP_PROP_POS_FRAMES, n)
    ok, fr = cap.read()
    frames[name] = fr

def locate(fr):
    best = None
    for s in np.arange(0.92, 1.30, 0.01):
        t = cv2.resize(nose, None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
        r = cv2.matchTemplate(fr[60:360, 420:760], t, cv2.TM_CCOEFF_NORMED)
        _, mv, _, ml = cv2.minMaxLoc(r)
        if best is None or mv > best[0]:
            best = (mv, ml[0] + 420, ml[1] + 60, s)
    mv, x, y, s = best
    # pozycja ust: ta sama relacja do wzorca nosa co w kadrze bazowym, przeskalowana
    mx = x + (REF_MOUTH[0] - NX0) * s
    my = y + (REF_MOUTH[1] - NY0) * s
    return mx, my, s, mv

# maska: miękka elipsa
yy, xx = np.mgrid[0:PH, 0:PW]
cx, cy = PW / 2, PH / 2
d = ((xx - cx) / (PW * 0.46)) ** 2 + ((yy - cy) / (PH * 0.46)) ** 2
alpha = np.clip((1.0 - d) / 0.45, 0, 1) ** 1.5

# pierścień skóry w kadrze bazowym do dopasowania koloru
ref_patch = ref[REF_MOUTH[1] + OFF_Y - PH // 2: REF_MOUTH[1] + OFF_Y + PH // 2, REF_MOUTH[0] - PW // 2: REF_MOUTH[0] + PW // 2].astype(np.float32)
ring = (d > 0.55) & (d < 1.0)

tiles, meta = [], []
for name, fr in frames.items():
    mx, my, s, score = locate(fr)
    # wycinek w skali klatki, potem skalowanie do 1.0
    w, h = PW * s, PH * s
    x0, y0 = mx - w / 2, my + OFF_Y * s - h / 2
    M = np.float32([[1 / s, 0, -x0 / s], [0, 1 / s, -y0 / s]])
    patch = cv2.warpAffine(fr, M, (PW, PH), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
    # dopasowanie koloru (średnia i odchylenie na pierścieniu skóry)
    for c in range(3):
        a, b = patch[..., c][ring], ref_patch[..., c][ring]
        patch[..., c] = (patch[..., c] - a.mean()) * (b.std() / max(a.std(), 1e-3)) + b.mean()
    patch = np.clip(patch, 0, 255).astype(np.uint8)
    rgba = np.dstack([patch, (alpha * 255).astype(np.uint8)])
    tiles.append(rgba)
    meta.append({"name": name, "frame": SHAPES[name], "score": round(float(score), 3), "scale": round(float(s), 3)})
    print(name, meta[-1])

atlas = np.hstack(tiles)
cv2.imwrite(os.path.join(out_dir, "usta-atlas.png"), atlas)
json.dump({"tileW": PW, "tileH": PH, "offY": OFF_Y, "shapes": [m["name"] for m in meta], "meta": meta},
          open(os.path.join(out_dir, "usta-atlas.json"), "w"), indent=1)

# podgląd: każdy kształt wklejony w kadr bazowy
prev = []
for t in tiles:
    base = ref.copy().astype(np.float32)
    x0, y0 = REF_MOUTH[0] - PW // 2, REF_MOUTH[1] + OFF_Y - PH // 2
    a = t[..., 3:4].astype(np.float32) / 255
    base[y0:y0 + PH, x0:x0 + PW] = base[y0:y0 + PH, x0:x0 + PW] * (1 - a) + t[..., :3] * a
    prev.append(cv2.resize(base[120:330, 480:690].astype(np.uint8), (315, 315)))
cv2.imwrite(os.path.join(out_dir, "podglad.jpg"), np.hstack(prev[:4]) if len(prev) < 5 else np.vstack([np.hstack(prev[:4]), np.hstack(prev[4:] + [np.zeros_like(prev[0])] * (8 - len(prev)))]))
