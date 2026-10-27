"""Test: usta OTWIERAJĄ SIĘ podczas mowy w każdym miejscu pętli (głowa prosto i przechylona).

Dla 9 miejsc pętli mówi zdanie pełne „a”/„o”; co klatkę animacji zapisujemy otwarcie rysowanych ust
(0 = zamknięte, 1 = najszerzej w bibliotece). W chwilach najszerszego otwarcia zrzut: klatka wideo + nakładka,
a w Pythonie liczymy, ile ciemnego wnętrza ust widać na obrazie z nakładką.
Kryterium w każdym miejscu: maks. otwarcie ≥ 0,7, co najmniej 25% czasu mowy ≥ 0,4, widoczne wnętrze ust
(≥ 60 ciemnych pikseli w otworze ust) na najszerszym zrzucie.
Użycie: python3 tests/test_otwieranie_ust.py [URL] [KATALOG_ZRZUTÓW]
"""
from playwright.sync_api import sync_playwright
import base64, json, os, sys
import cv2, numpy as np

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/test_otwieranie_ust'
os.makedirs(OUT, exist_ok=True)
REC = """()=>{ const W=mowa.wnetrze, L=W.lip; window.__rec=[]; window.__best=null;
  const loop=()=>{ if(L.alpha>.9&&L.cur>=0&&L.frame>=0){ const o=L.open[L.cur]; __rec.push(o);
      if(!__best||o>__best.o){ const v=front, tr=L.track[L.frame], cx=Math.round(tr[0]), cy=Math.round(tr[1]), w=150, h=120;
        const c=document.createElement('canvas'); c.width=w*2; c.height=h; const x=c.getContext('2d');
        x.drawImage(v,cx-w/2,cy-h/2,w,h,0,0,w,h); x.drawImage(v,cx-w/2,cy-h/2,w,h,w,0,w,h); x.drawImage(L.canvas,cx-w/2,cy-h/2,w,h,w,0,w,h);
        __best={o, fi:L.frame, wirt:!!L.emat[L.cur], img:c.toDataURL('image/png')}; } }
    if(mowa.zajeta||__rec.length<5) requestAnimationFrame(loop); };
  requestAnimationFrame(loop); }"""

def dark(img):
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[..., 0].astype(np.float32)
    h, w = lab.shape; roi = lab[h // 2 - 14:h // 2 + 20, w // 2 - 32:w // 2 + 32]
    return int((roi < 0.55 * np.median(lab)).sum())

res = []
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
    zd = ['Dobra rada: zawsza warto zapytać.', 'Tak, mam to. Zaraz ci pokażę, co tam jest.', 'Hej! Oto nowa wiadomość od Janka.']
    for n, pos in enumerate([0.2, 2.0, 4.0, 6.5, 9.0, 11.5, 14.0, 16.5, 19.0]):
        pg.evaluate(f"()=>{{ front.currentTime={pos}; }}"); pg.wait_for_timeout(300)
        pg.evaluate(REC); pg.evaluate(f"()=>{{ mowa.powiedz({json.dumps(zd[n % 3])}); }}")
        for i in range(60):
            pg.wait_for_timeout(250)
            if pg.evaluate("()=>!mowa.zajeta"): break
        r = pg.evaluate("()=>({rec:__rec, best:__best})")
        if not r['best']: res.append((pos, 0, 0, 0, False, -1)); continue
        im = cv2.imdecode(np.frombuffer(base64.b64decode(r['best']['img'].split(',')[1]), np.uint8), cv2.IMREAD_COLOR)
        cv2.imwrite(f'{OUT}/otw_{n:02d}.png', im); w = im.shape[1] // 2
        rec = np.array(r['rec']); vis = dark(im[:, w:])
        res.append((pos, float(rec.max()), float((rec >= 0.4).mean()), vis, r['best']['wirt'], r['best']['fi']))
    b.close()
print('poz.  klatka  maks_otw  czas≥0,4  widoczne_wnętrze_px  przeniesione')
ok = not errs
for pos, mx, fr, vis, wirt, fi in res:
    good = mx >= 0.7 and fr >= 0.25 and vis >= 60
    ok &= good
    print(f'{pos:5.1f} {fi:6d} {mx:8.2f} {fr:9.0%} {vis:12d}          {"tak" if wirt else "nie"}   {"OK" if good else "ZA MAŁO"}')
cv2.imwrite(f'{OUT}/przeglad.jpg', np.vstack([cv2.imread(f'{OUT}/otw_{n:02d}.png') for n in range(len(res)) if os.path.exists(f'{OUT}/otw_{n:02d}.png')]))
print('BŁĘDY STRONY:', errs); print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
sys.exit(0 if ok else 1)
