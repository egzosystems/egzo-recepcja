"""Słaby telefon: procesor spowolniony 4× (CDP). Mowa ma iść bez dziur i spóźnień, dobór klatek ust
(z pozą głowy) ma być szybki, a animacja płynna.
Kryteria: spóźnienia = 0, pauzy 0,1–0,35 s, dobór ust ≤ 60 ms na zdanie, ≥ 30 kl/s w trakcie mowy."""
from playwright.sync_api import sync_playwright
import json, sys, time

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); pg = b.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.click('#voiceBtn')
    for i in range(120):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running&&cur.id==='idle'"): break
    cdp = pg.context.new_cdp_session(pg); cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    # czas doboru klatek ust dla zdania ~3 s (z pozą głowy)
    sel = pg.evaluate("""async()=>{ const W=mowa.wnetrze; const m=await W.synthNeural('Wygląda na zamówienie terrarium sto dwadzieścia na sześćdziesiąt.');
      const tr=W.trimSilence(m.pcm.slice(),m.sampleRate), ms=[];
      for(let i=0;i<5;i++){ const t0=performance.now(); W.lipTimeline(m,tr.offset,tr.pcm.length/m.sampleRate,tr.pcm,W.neural.ctx.currentTime+.1); ms.push(performance.now()-t0); }
      return {ms:Math.max(...ms.slice(1)), sek:+(tr.pcm.length/m.sampleRate).toFixed(2)}; }""")
    pg.evaluate("""()=>{ const W=mowa.wnetrze; W.eng.stats=[]; window.__fr=[];
      const loop=t=>{ __fr.push(t); if(mowa.zajeta||__fr.length<30) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
      mowa.powiedz('Dziękuję za dokument. Już go czytam i zaraz powiem, co w nim jest. Wygląda na zamówienie terrarium sto dwadzieścia na sześćdziesiąt. Czy mam je od razu przekazać do akceptacji?'); }""")
    t0 = time.time()
    while time.time() - t0 < 90:
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>!mowa.zajeta&&mowa.wnetrze.eng.stats.length>=4"): break
    st = pg.evaluate("()=>mowa.wnetrze.eng.stats")
    fps = pg.evaluate("()=>{ const f=__fr, n=f.length; return n>10?+((n-1)*1000/(f[n-1]-f[0])).toFixed(1):0; }")
    b.close()
gaps = [s['gap'] for s in st[1:]]; late = [s['late'] for s in st]
print('procesor 4× wolniej')
print('dobór klatek ust:', round(sel['ms'], 1), 'ms dla', sel['sek'], 's mowy')
print('pauzy:', gaps, '| spóźnienia:', late, '| synteza ms:', [s['synthMs'] for s in st])
print('klatek/s w trakcie mowy:', fps)
ok = sel['ms'] <= 60 and all(x == 0 for x in late) and gaps and all(0.1 <= g <= 0.35 for g in gaps) and fps >= 30 and not errs
print('BŁĘDY STRONY:', errs); print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
sys.exit(0 if ok else 1)
