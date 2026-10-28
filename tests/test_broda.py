"""Test brody i żuchwy podczas mowy: kontur nie może „pływać”.

W 5 miejscach pętli (głowa prosto i przechylona) nagrywamy kolejne klatki animacji w trakcie mowy:
samo wideo oraz wideo z ustami. Mierzymy:
  - dolną krawędź brody (przejście skóra → kołnierz) na środku: przesunięcie względem wideo musi mieścić się
    w ruchu żuchwy i głowy (±9 px: żuchwa do 5 px, kiwnięcie głowy do 2,6 px, zapas 1 px) i nie skakać między kolejnymi klatkami (p99 skoku ≤ 2 px),
  - boki żuchwy (krawędź twarzy 40 px nad brodą, gdzie kontur jest stromy; w nakładce wiersz przesunięty o kiwnięcie głowy —
    mierzymy rozjechanie warstw, nie zamierzony ruch): przesunięcie w bok ≤ 2 px (p90; detektor czasem myli kontur z paskiem kołnierza).
Użycie: python3 tests/test_broda.py [URL]
"""
from playwright.sync_api import sync_playwright
import base64, sys
import cv2, numpy as np

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
REC = """()=>{ window.__seq=[]; const L=mowa.wnetrze.lip;
  const loop=()=>{ if(L.frame>=0&&L.alpha>.5){ const v=front, tr=L.track[L.frame], cx=Math.round(tr[0]), cy=Math.round(tr[1])+20, w=150, h=130;
     const c=document.createElement('canvas'); c.width=w*2; c.height=h; const x=c.getContext('2d');
     x.drawImage(v,cx-w/2,cy-h/2,w,h,0,0,w,h); x.drawImage(v,cx-w/2,cy-h/2,w,h,w,0,w,h); mowa.wnetrze.zrzutNakladki(x,cx-w/2,cy-h/2,w,h,w,0);
     __seq.push([c.toDataURL('image/png'),L.hd]); }
    if(__seq.length<150&&(mowa.zajeta||__seq.length<3)) requestAnimationFrame(loop); };
  requestAnimationFrame(loop); }"""

def chin_y(img):
    g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    h, w = g.shape; col = g[:, w // 2 - 10:w // 2 + 10].mean(1)
    d = np.diff(col); lo = 60; k = lo + int(np.argmin(d[lo:112]))
    # dokładność podpikselowa (parabola)
    if 0 < k < len(d) - 1:
        a, b, c = d[k - 1], d[k], d[k + 1]; den = a - 2 * b + c
        if den != 0: return k + 0.5 * (a - c) / den
    return float(k)

def jaw_x(img, y):
    g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.2)
    row = g[y - 2:y + 3].mean(0); w = len(row); d = np.diff(row)
    # szukamy z dala od ust (±48 px od środka): wiersz pomiaru wypada na wysokości warg, a szeroko otwarte
    # usta z zębami (biblioteka z klipu mówienia) mają kąciki ostrzejsze niż kontur żuchwy (ok. ±60 px od środka)
    l = int(np.argmax(d[8:w // 2 - 48])) + 8          # lewa krawędź: ciemno → jasno
    r = w // 2 + 48 + int(np.argmin(d[w // 2 + 48:w - 8]))
    return float(l), float(r)

def run(url):
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = b.new_page(viewport={"width": 1280, "height": 900})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_timeout(2500); pg.click('#voiceBtn')
        for i in range(120):
            pg.wait_for_timeout(500)
            if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running&&cur.id==='idle'"): break
        for n, pos in enumerate([0.4, 5.0, 9.0, 14.0, 18.8]):
            pg.evaluate(f"()=>{{ front.currentTime={pos}; }}"); pg.wait_for_timeout(300)
            pg.evaluate(REC); pg.evaluate("()=>{ mowa.powiedz('Dobra, mam to. Zaraz ci pokażę, co tam jest, dobrze?'); }")
            for i in range(60):
                pg.wait_for_timeout(250)
                if pg.evaluate("()=>!mowa.zajeta"): break
            seq = pg.evaluate("()=>__seq")
            out.append([(cv2.imdecode(np.frombuffer(base64.b64decode(s[0].split(',')[1]), np.uint8), cv2.IMREAD_COLOR), s[1]) for s in seq])
        b.close()
    return out, errs

if __name__ == '__main__':
    seqs, errs = run(URL)
    dys, jumps, sides = [], [], []
    for seq in seqs:
        prev = None
        for im, hd in seq:
            w = im.shape[1] // 2; raw, comp = im[:, :w], im[:, w:]
            yr, yc = chin_y(raw), chin_y(comp)
            if abs(yc - yr) > 25: continue                      # krawędź nie znaleziona
            dy = yc - yr; dys.append(dy)
            if prev is not None: jumps.append(abs(dy - prev))
            prev = dy
            yj = int(round(yr)) - 40   # stroma część żuchwy (przy brodzie kontur jest prawie poziomy: ruch głowy w pionie przesuwa przecięcie w bok)
            (l0, r0), (l1, r1) = jaw_x(raw, yj), jaw_x(comp, yj + int(round(hd)))   # w nakładce: wiersz przesunięty o kiwnięcie głowy
            sides += [abs(l1 - l0), abs(r1 - r0)]
    dys, jumps, sides = np.array(dys), np.array(jumps), np.array(sides)
    print(f'klatek {len(dys)} | opuszczenie brody: min {dys.min():+.1f} maks {dys.max():+.1f} px | skok między klatkami p99 {np.percentile(jumps,99):.2f} maks {jumps.max():.2f} px | boki żuchwy p90 {np.percentile(sides,90):.2f} px')
    ok = len(dys) >= 200 and dys.min() >= -9 and dys.max() <= 9 and np.percentile(jumps, 99) <= 2 and np.percentile(sides, 90) <= 2 and not errs
    print('BŁĘDY STRONY:', errs); print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
    sys.exit(0 if ok else 1)
