"""Zawężenie maski atlasu ust (kąciki z prawdziwej twarzy, bez „szerokiego uśmiechu”)
i przygaszenie zbyt jasnych zębów.

Użycie: python3 -I atlas_mask.py usta-atlas.png usta-atlas.json [RX=27] [ZĘBY=0.86]
"""
import json, sys
import cv2
import numpy as np

atlas_p, meta_p = sys.argv[1:3]
RX = float(sys.argv[3]) if len(sys.argv) > 3 else 27
TEETH = float(sys.argv[4]) if len(sys.argv) > 4 else 0.86
m = json.load(open(meta_p))
A = cv2.imread(atlas_p, cv2.IMREAD_UNCHANGED)
TW, TH, OFF = m['tileW'], m['tileH'], m['offY']
yy, xx = np.mgrid[0:TH, 0:TW]
cx, cy = TW / 2, TH / 2 - OFF
a = np.radians(m.get('roll0', -9.5))
X = (xx - cx) * np.cos(a) - (yy - cy) * np.sin(a)
Y = (xx - cx) * np.sin(a) + (yy - cy) * np.cos(a)
d = (X / RX) ** 2 + ((Y - 4) / 24) ** 2
mask = np.clip((1 - d) / 0.55, 0, 1) ** 1.4
for k in range(len(m['shapes'])):
    t = A[:, k * TW:(k + 1) * TW].astype(np.float32)
    hsv = cv2.cvtColor(t[..., :3].astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
    teeth = np.clip((hsv[..., 2] - 170) / 50, 0, 1) * np.clip((90 - hsv[..., 1]) / 60, 0, 1)
    f = 1 - (1 - TEETH) * teeth
    t[..., :3] *= f[..., None]
    t[..., 3] *= mask
    A[:, k * TW:(k + 1) * TW] = np.clip(t, 0, 255).astype(np.uint8)
cv2.imwrite(atlas_p, A)
m['maskRX'] = RX
json.dump(m, open(meta_p, 'w'), indent=1)
print('maska rx', RX, 'zęby x', TEETH)
