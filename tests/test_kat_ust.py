"""Test kąta ust podczas mowy, w całej pętli (głowa prosto i przechylona).

W przeglądarce, w trakcie mówienia, w tej samej klatce animacji zrzucamy okolicę ust:
  (a) sama klatka wideo (prawdziwe usta, prawdziwy kąt głowy),
  (b) ta sama klatka + nałożone usta z biblioteki.
W Pythonie: nieruchome części twarzy w zasięgu nakładki (nos, policzki, broda — bez warg) w (b) muszą\nleżeć dokładnie tam, gdzie w (a): mierzymy obrót i przesunięcie metodą ECC.
Kryterium: zamknięte usta — |Δ| średnio ≤ 1,5°, p90 ≤ 2,5°; otwarte usta — p90 ≤ 7°, maks ≤ 9° (szpara rozchylonych
warg ma własny kształt; poprzednia wersja bez pozy: p90 11°, maks 13°).
Użycie: python3 tests/test_kat_ust.py [URL] [KATALOG_ZRZUTÓW]
"""
from playwright.sync_api import sync_playwright
import base64, json, math, os, sys
import cv2, numpy as np

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/test_kat_ust'
os.makedirs(OUT, exist_ok=True)

GRAB = """()=>new Promise(res=>requestAnimationFrame(()=>{
  const W=mowa.wnetrze, lip=W.lip, v=front, fi=lip.frame;
  if(fi<0||lip.alpha<.9||Math.round(W.videoTime(v)*24)!==fi) return res(null);
  const tr=lip.track[fi], cx=Math.round(tr[0]), cy=Math.round(tr[1]), w=150, h=120;
  const c=document.createElement('canvas'); c.width=w*2; c.height=h; const x=c.getContext('2d');
  x.drawImage(v,cx-w/2,cy-h/2,w,h,0,0,w,h);
  x.drawImage(v,cx-w/2,cy-h/2,w,h,w,0,w,h); x.drawImage(lip.canvas,cx-w/2,cy-h/2,w,h,w,0,w,h);
  res({img:c.toDataURL('image/png'), fi, ang:tr[4], tile:lip.cur, open:lip.open[lip.cur], fixes:lip.fixes});
}))"""

def tilt(raw, comp):
    """obrót (°) i przesunięcie (px) nakładki względem twarzy: ECC (obrót+przesunięcie) na nieruchomych
    częściach w zasięgu nakładki — nos, policzki, broda; wargi wyłączone (one mają się różnić)"""
    h, w = raw.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]
    e = ((xx - w / 2) / 50) ** 2 + ((yy - h / 2 - 12) / 44) ** 2
    lips = ((xx - w / 2) / 34) ** 2 + ((yy - h / 2 - 2) / 17) ** 2 < 1
    m = ((e < 0.9) & ~lips).astype(np.uint8)
    g0 = cv2.GaussianBlur(cv2.cvtColor(raw, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    g1 = cv2.GaussianBlur(cv2.cvtColor(comp, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    W = np.eye(2, 3, dtype=np.float32)
    try:
        _, W = cv2.findTransformECC(g0, g1, W, cv2.MOTION_EUCLIDEAN, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), m, 3)
    except cv2.error:
        return None
    return math.degrees(math.atan2(W[1, 0], W[0, 0])), float(np.hypot(W[0, 2], W[1, 2]))

samples = []
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.click('#voiceBtn')
    for i in range(120):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running&&cur.id==='idle'"): break
    pg.wait_for_timeout(800)
    zdania = ['Mama ma mapę. Basia pije mleko i je owoce.',
              'Przyszedł nowy e-mail. Pomóc ci go przeczytać?',
              'Pamiętaj, pracujesz bez przerwy. Może mała przerwa?',
              'Bob ma pomysł. Pomożemy mu, prawda?']
    for n, pos in enumerate([0.3, 1.4, 2.4, 3.6, 6.0, 9.0, 12.0, 15.0, 17.6, 18.6, 19.4]):
        pg.evaluate(f"()=>{{ front.currentTime={pos}; }}"); pg.wait_for_timeout(350)
        pg.evaluate(f"()=>{{ mowa.powiedz({json.dumps(zdania[n % 4])}); }}")
        pg.wait_for_timeout(450)
        got = 0
        for k in range(45):
            r = pg.evaluate(GRAB)
            if r:
                im = cv2.imdecode(np.frombuffer(base64.b64decode(r['img'].split(',')[1]), np.uint8), cv2.IMREAD_COLOR)
                path = f'{OUT}/kat_{n:02d}_{k:02d}.png'; cv2.imwrite(path, im)
                samples.append(dict(r, img=path, pos=pos)); got += 1
                if got >= 16: break
            pg.wait_for_timeout(130)
        for i in range(40):
            pg.wait_for_timeout(250)
            if pg.evaluate("()=>!mowa.zajeta"): break
    diag = pg.evaluate("()=>{ const g=mowa.wnetrze.lip.diag; return {kroków:g.n, śr_odchyłka_klatek:+(g.off/Math.max(1,g.n)).toFixed(2), maks:g.maxOff}; }")
    b.close()

def slit(img):
    """kąt szpary między ZAMKNIĘTYMI wargami (najciemniejsza linia w kolumnach) i czy usta są zamknięte"""
    g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    h, w = g.shape; cy, cx = h // 2, w // 2
    xs, ys, depth = [], [], []
    for x in range(cx - 22, cx + 23, 2):
        col = g[cy - 12:cy + 14, x]; k = int(np.argmin(col)); xs.append(x); ys.append(cy - 12 + k); depth.append(float(col.max() - col[k]))
    p = np.polyfit(xs, ys, 1); res = float(np.abs(np.polyval(p, xs) - ys).mean())
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[cy - 10:cy + 14, cx - 26:cx + 26, 0]
    closed = (lab < 0.45 * np.median(lab)).sum() < 25 and res < 2.5
    return math.degrees(math.atan(p[0])), closed

def gap_axis(img):
    """oś otworu OTWARTYCH ust (ciemne wnętrze) w stopniach i jego pole w px"""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32); h, w = lab.shape
    roi = lab[h // 2 - 14:h // 2 + 20, w // 2 - 34:w // 2 + 34]; m = (roi < 0.55 * np.median(lab)).astype(np.uint8)
    n, lb, st, _ = cv2.connectedComponentsWithStats(m)
    if n < 2: return None, 0
    k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); area = int(st[k, cv2.CC_STAT_AREA])
    ys, xs = np.nonzero(lb == k)
    if np.ptp(xs) < 20: return None, area
    return math.degrees(math.atan(np.polyfit(xs, ys, 1)[0])), area

slits, gaps = [], []
rows = []
for s in samples:
    im = cv2.imread(s['img']); w = im.shape[1] // 2
    raw, comp = im[:, :w], im[:, w:]
    r = tilt(raw, comp)
    if r is None: continue
    h = raw.shape[0]; yy, xx = np.mgrid[0:h, 0:w]
    e = ((xx - w / 2) / 50) ** 2 + ((yy - h / 2 - 12) / 44) ** 2
    ring = (e > 0.55) & (e < 0.95)
    seam = float(np.abs(raw.astype(np.float32) - comp.astype(np.float32)).mean(axis=2)[ring].mean())
    rows.append((s['pos'], s['fi'], s['ang'], r[0], r[1], seam, s['tile']))
    a0, c0 = slit(raw)
    if not c0: continue
    if s['open'] < 0.2:
        a1, c1 = slit(comp)
        if c1: slits.append(a1 - a0)
    else:
        g, area = gap_axis(comp)
        if g is not None and area >= 40: gaps.append(g - a0)
R = np.array([r[:6] for r in rows])
print('poz.  klatka  głowa°  obrót_nakładki°  przesunięcie_px  szew')
for r in rows: print(f'{r[0]:5.1f} {r[1]:5d} {r[2]:7.1f} {r[3]:+10.2f} {r[4]:12.2f} {r[5]:9.1f}')
ad = np.abs(R[:, 3])
p95, mx, seam = float(np.percentile(ad, 95)), float(ad.max()), float(R[:, 5].mean())
print(f'\npróbek {len(R)} | |obrót| śr {ad.mean():.2f}° p95 {p95:.2f}° maks {mx:.2f}° | przesunięcie p95 {np.percentile(R[:,4],95):.1f} px | szew śr {seam:.1f}')
sl = np.abs(np.array(slits)) if slits else np.array([0.0])
print(f'kąt szpary warg (zamknięte usta w nakładce i w wideo): próbek {len(slits)} | |Δ| śr {sl.mean():.2f}° p90 {np.percentile(sl,90):.2f}° maks {sl.max():.2f}°')
ga = np.abs(np.array(gaps)) if gaps else np.array([99.0])
print(f'oś otwartych ust w nakładce vs linia warg w wideo: próbek {len(gaps)} | |Δ| śr {ga.mean():.2f}° p90 {np.percentile(ga,90):.2f}° maks {ga.max():.2f}°')
print('podmiany pozy przy rysowaniu:', samples[-1]['fixes'] if samples else '-', '| przewidywanie klatki:', diag)
ok = (len(slits) >= 6 and float(sl.mean()) <= 1.5 and float(np.percentile(sl, 90)) <= 2.5
      and len(gaps) >= 8 and float(np.percentile(ga, 90)) <= 7 and float(ga.max()) <= 9 and len(R) >= 40 and not errs)
print('BŁĘDY STRONY:', errs)
print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
sys.exit(0 if ok else 1)
