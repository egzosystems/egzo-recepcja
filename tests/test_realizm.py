"""Test realizmu mowy — pomiary na tym, co faktycznie słychać i widać (przeglądarka).

Podczas dłuższej wypowiedzi w 4 miejscach pętli, co klatkę animacji:
  - głośność dźwięku z karty dźwiękowej (AnalyserNode na wyjściu głosu),
  - otwarcie rysowanych ust, klatka biblioteki, ruch żuchwy,
  - obraz okolicy ust: wideo z nakładką oraz samo wideo.
Miary:
  SYNC   przesunięcie ust względem głosu (korelacja obwiedni dźwięku i otwarcia): usta mogą lekko wyprzedzać,
         naturalnie 0–100 ms; dodatnie = usta spóźnione.
  DRGANIA ruch, którego mowa nie wymaga: energia > 8 Hz różnicy (rysowane − cel) wobec energii celu
         (sam cel ma ~20% energii > 8 Hz — szybkie domknięcia przy 6 sylabach/s są naturalne).
  RYTM   cykle otwórz–zamknij w rysowanych ustach wobec cykli w celu (1 = każda sylaba widoczna).
  MIGOTANIE zmiana skóry wokół ust między kolejnymi klatkami ponad zmianę w samym wideo (przeskoki tekstury).
         Próg z pomiaru prawdziwej mowy: klip, w którym ta sama twarz naprawdę mówi (Higgsfield, 24 kl./s), ma
         średnio 2,46, p95 6,91 — policzki i broda ruszają się z ustami. Limit (śr. ≤ 1,3, p95 ≤ 6) jest poniżej
         naturalnej mowy; dawny limit 0,8 / 3 pasował do biblioteki z prawie nieruchomymi ustami.
  SKOKI  przejścia między niesąsiednimi klatkami nagrania na sekundę (informacyjnie: pomiary pokazały, że
         same skoki nie zwiększają migotania — liczy się MIGOTANIE).
  SAMOGŁOSKI średnie otwarcie na a/o/e wobec spółgłosek m/b/p.
  OSTROŚĆ  ostrość warg w nakładce wobec wideo (mediana; przenikanie dwóch różnych klatek rozmywa wargi).
Użycie: python3 tests/test_realizm.py [URL]   (wypisuje raport i WYNIK)
"""
from playwright.sync_api import sync_playwright
import json, sys
import numpy as np

import os
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
CFG = json.loads(os.environ.get('MOWA_CFG', '{}'))   # strojenie (np. {"skok": .15})
TEKST = 'Dzień dobry. Właśnie przyszła paczka z nowym zamówieniem na terrarium. Mam ją otworzyć, czy wolisz poczekać do jutra?'

SETUP = """()=>{ const W=mowa.wnetrze, L=W.lip, ctx=W.neural.ctx;
  window.__an=ctx.createAnalyser(); __an.fftSize=512; (W.neural.chain||W.voiceChain(ctx)).connect(__an); window.__buf=new Float32Array(512);
  const cv=document.createElement('canvas'); cv.width=150; cv.height=120; window.__cx=cv.getContext('2d',{willReadFrequently:true});
  // pierścień skóry wokół ust (strefa przejścia nakładki) i obszar warg
  const ring=[], lips=[];
  for(let y=0;y<120;y++) for(let x=0;x<150;x++){ const e=((x-75)/46)**2+((y-65)/31)**2, l=((x-75)/34)**2+((y-62)/16)**2;
    if(l<1) lips.push(y*150+x); else if(e>.5&&e<1.05) ring.push(y*150+x); }
  window.__ring=ring; window.__lips=lips; }"""
REC = """()=>{ window.__rec=[]; let prevC=null, prevR=null; const W=mowa.wnetrze, L=W.lip, ctx=W.neural.ctx;
  const grab=(withLip,tr,bezRuchu)=>{ const x=__cx, v=front, cx=Math.round(tr[0]), cy=Math.round(tr[1]);
    x.drawImage(v,cx-75,cy-60,150,120,0,0,150,120); if(withLip) mowa.wnetrze.zrzutNakladki(x,cx-75,cy-60,150,120,0,0,bezRuchu);
    const d=x.getImageData(0,0,150,120).data, g=new Float32Array(150*120); for(let i=0;i<g.length;i++) g[i]=.3*d[i*4]+.59*d[i*4+1]+.11*d[i*4+2]; return g; };
  const md=(a,b,idx)=>{ let s=0; for(const i of idx) s+=Math.abs(a[i]-b[i]); return s/idx.length; };
  const loop=()=>{ __an.getFloatTimeDomainData(__buf); let r=0; for(const s of __buf) r+=s*s; r=Math.sqrt(r/__buf.length);
    const fi=L.frame; let row={t:ctx.currentTime, rms:r, a:L.alpha, e:L.cur, o:L.cur>=0?(L.open[L.cur]*(1-(L.ffLast||0))+(L.ffLast&&L.fbLast>=0?L.open[L.fbLast]*L.ffLast:0)):0, cel:L.celNow??-1, jaw:L.jaw||0, fi};
    if(fi>=0&&L.alpha>.5){ const tr=L.track[fi], C=grab(true,tr), R=grab(false,tr);
      if(prevC){ row.dc=md(C,prevC,__ring); row.dr=md(R,prevR,__ring); row.dlc=md(C,prevC,__lips); }
      // ostrość warg (wariancja laplasjanu) — nakładka vs wideo
      const lap=g=>{ let s=0,s2=0,n=0; for(const i of __lips){ const v=4*g[i]-g[i-1]-g[i+1]-g[i-150]-g[i+150]; s+=v; s2+=v*v; n++; } return s2/n-(s/n)**2; };
      // ostrość ust bez ruchu głowy (ruch głowy to zamierzone przesunięcie o ułamek piksela — każde przeliczenie obrazu je zmiękcza)
      row.sc=lap(grab(true,tr,true)); row.sr=lap(R); row.ff=L.ffLast||0;
      prevC=C; prevR=R; } else { prevC=prevR=null; }
    __rec.push(row); if(mowa.zajeta||__rec.length<10) requestAnimationFrame(loop); };
  requestAnimationFrame(loop); }"""

def analyse(rec, meta, text):
    t = np.array([r['t'] for r in rec]); rms = np.array([r['rms'] for r in rec]); al = np.array([r['a'] for r in rec])
    op = np.array([r['o'] for r in rec]) * al
    # równy krok 10 ms
    tt = np.arange(t[0], t[-1], 0.01); A = np.interp(tt, t, rms); O = np.interp(tt, t, op)
    k = 4; A = np.convolve(A, np.ones(k) / k, 'same')
    A = (A - A.mean()) / (A.std() + 1e-9); O = (O - O.mean()) / (O.std() + 1e-9)
    lags = range(-25, 26); cc = [np.mean(A[max(0, -l):len(A) - max(0, l)] * O[max(0, l):len(O) - max(0, -l)]) for l in lags]
    lag = list(lags)[int(np.argmax(cc))] * 10      # ms; dodatni = usta spóźnione względem dźwięku
    # drgania: ruch, którego mowa nie wymaga = wysokie częstotliwości (> 8 Hz) różnicy (rysowane − cel)
    cel = np.array([r['cel'] if r['cel'] is not None and r['cel'] >= 0 else np.nan for r in rec]) * al
    ok_ = ~np.isnan(cel)
    tt60 = np.arange(t[0], t[-1], 1 / 60)
    o60 = np.interp(tt60, t, op); c60 = np.interp(tt60, t[ok_], cel[ok_])
    res_ = (o60 - c60) - (o60 - c60).mean(); cc_ = c60 - c60.mean()
    P = np.abs(np.fft.rfft(res_)) ** 2; Pc = np.abs(np.fft.rfft(cc_)) ** 2; f = np.fft.rfftfreq(len(res_), 1 / 60)
    hf = float(P[f > 8].sum() / (Pc[f > 0.5].sum() + 1e-9))
    def cycles(s):
        n = 0; hi = lo = s[0]; up = True
        for v in s:
            if up:
                if v > hi: hi = v
                elif hi - v >= 0.15: n += 1; up = False; lo = v
            else:
                if v < lo: lo = v
                elif v - lo >= 0.15: up = True; hi = v
        return n
    s = np.interp(np.arange(t[0], t[-1], 0.02), t, op); sc = np.interp(np.arange(t[0], t[-1], 0.02), t[ok_], cel[ok_])
    peaks, peaks_c = cycles(s), cycles(sc)
    talk = float((al > 0.5).sum()) / len(al) * (t[-1] - t[0])
    vowels = sum(text.lower().count(c) for c in 'aąeęioóuy')
    flick = [r['dc'] - r['dr'] for r in rec if 'dc' in r]
    lipmove = [r['dlc'] for r in rec if 'dlc' in r]
    # skoki między niesąsiednimi klatkami nagrania
    es = [r['e'] for r in rec if r['e'] >= 0 and r['a'] > .5]; jumps = 0
    for a, b in zip(es, es[1:]):
        if a != b and meta['next'][a] != b: jumps += 1
    sh = [r['sc'] / max(r['sr'], 1e-6) for r in rec if 'sc' in r]
    return dict(rytm_wzgl_celu=round(peaks / max(peaks_c, 1), 2), ostrosc=round(float(np.median(sh)), 2) if sh else None, sync_ms=lag, drgania=round(hf, 3), cykle_na_s=round(peaks / max(talk, .1), 2), samogloski_na_s=round(vowels / max(talk, .1), 2),
                migotanie=round(float(np.mean(flick)), 2) if flick else None, migotanie_p95=round(float(np.percentile(flick, 95)), 2) if flick else None,
                ruch_warg=round(float(np.mean(lipmove)), 2) if lipmove else None, skoki_na_s=round(jumps / max(talk, .1), 1), czas_mowy=round(talk, 1))

def run(url):
    res = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = b.new_page(viewport={"width": 1280, "height": 900})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(url); pg.wait_for_timeout(2500); pg.click('#voiceBtn')
        for i in range(120):
            pg.wait_for_timeout(500)
            if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running&&cur.id==='idle'"): break
        pg.wait_for_timeout(1000); pg.evaluate(SETUP); pg.evaluate('(c)=>Object.assign(mowa.wnetrze.cfg,c)', CFG)
        meta = pg.evaluate("()=>({next:Array.from(mowa.wnetrze.lip.next)})")
        # samogłoski vs m/b/p (oś czasu dla zdania kontrolnego)
        vm = pg.evaluate("""async()=>{ const W=mowa.wnetrze, L=W.lip, v=[], c=[];
          for(const text of ['Mama ma dobre pomysły, a Basia pije mleko.','Pakuję paczkę dla pana Bartka.','Oto nowa wiadomość od Ani.'])
          for(let rep=0;rep<2;rep++){
            const m=await W.synthNeural(EgzoMowa.mowione(text)), tr=W.trimSilence(m.pcm.slice(),m.sampleRate);
            const tl=W.lipTimeline(m,tr.offset,tr.pcm.length/m.sampleRate,tr.pcm,W.neural.ctx.currentTime+.1);
            const units=W.phonesFromChars(m.chars,m.dur), fr=m.hop/m.sampleRate; let t=-tr.offset;
            for(const u of units){ const t0=t,t1=t+u.d*fr; t=t1; if(t1<=0) continue; const k=Math.min(tl.length-1,Math.max(0,Math.floor((t0+t1)/2*25))), o=L.open[tl[k]];
              if('aoe'.includes(u.p)) v.push(o); else if('mbp'.includes(u.p)) c.push(o); } }
          return {v:v.reduce((a,b)=>a+b,0)/v.length, c:c.reduce((a,b)=>a+b,0)/c.length}; }""")
        for pos in (1.0, 6.0, 12.0, 17.5):
            pg.evaluate(f"()=>{{ front.currentTime={pos}; }}"); pg.wait_for_timeout(300)
            pg.evaluate(REC); pg.evaluate(f"()=>{{ mowa.powiedz({json.dumps(TEKST)}); }}")
            for i in range(120):
                pg.wait_for_timeout(250)
                if pg.evaluate("()=>!mowa.zajeta"): break
            rec = pg.evaluate("()=>__rec")
            r = analyse(rec, meta, TEKST); r['poz'] = pos; res.append(r)
        b.close()
    return res, vm, errs

if __name__ == '__main__':
    res, vm, errs = run(URL)
    for r in res: print(r)
    agg = {k: round(float(np.mean([r[k] for r in res if r[k] is not None])), 3) for k in res[0] if k != 'poz'}
    agg['samogłoski_otwarcie'] = round(vm['v'], 2); agg['mbp_otwarcie'] = round(vm['c'], 2)
    print('ŚREDNIO:', agg)
    ok = (agg['ostrosc'] >= 0.6 and -100 <= agg['sync_ms'] <= 20 and agg['drgania'] <= 0.12 and agg['migotanie'] <= 1.3 and agg['migotanie_p95'] <= 6
          and agg['samogłoski_otwarcie'] >= 0.6 and agg['mbp_otwarcie'] <= 0.15 and 0.75 <= agg['rytm_wzgl_celu'] <= 1.2 and not errs)
    print('BŁĘDY STRONY:', errs); print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
    sys.exit(0 if ok else 1)
