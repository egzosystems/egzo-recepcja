"""Testy biblioteki EGZO MOWA w przeglądarce (Chromium bez okna), przez jej interfejs.
T1 usta: m/b/p domykają, „a” otwiera   T2 powiedz(): kilka zdań bez dziur i spóźnień
T3 strumien(): tekst dopływa kawałkami  T4 zdarzenie 'mowi' i zajeta   T5 przygotuj() + powiedz()   T6 stop()
Serwer: python3 tools/serwer_testowy.py (albo dowolny z obsługą zakresów bajtów) na porcie 8768."""
from playwright.sync_api import sync_playwright
import json, sys, time

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
ok = []
def check(name, cond, info=''):
    ok.append(bool(cond)); print(('OK  ' if cond else 'BŁĄD'), name, info)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(2500)
    pg.evaluate("()=>{ window.__ev=[]; mowa.on('mowi',v=>__ev.push([v,+performance.now().toFixed(0)])); }")
    pg.click('#voiceBtn')
    for i in range(120):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running"): break
    check('model gotowy', pg.evaluate("()=>mowa.stan") == 'ready')

    # T1 — oś czasu ust
    r = pg.evaluate("""async()=>{ const W=mowa.wnetrze, text='Mama ma kota, a Basia pije mleko.';
      const m=await W.synthNeural(EgzoMowa.mowione(text)), tr=W.trimSilence(m.pcm.slice(),m.sampleRate);
      const tl=W.lipTimeline(m,tr.offset,tr.pcm.length/m.sampleRate,tr.pcm), units=W.phonesFromChars(m.chars,m.dur), fr=m.hop/m.sampleRate;
      let t=-tr.offset; const rows=[];
      for(const u of units){ const t0=t,t1=t+u.d*fr; t=t1; if(t1<=0) continue; const k=Math.floor(((t0+t1)/2)*25);
        rows.push([u.p, +W.lip.open[tl[Math.max(0,Math.min(tl.length-1,k))]].toFixed(2)]); }
      return rows; }""")
    print('   ', ' '.join(f'{a}{o}' for a, o in r))
    mbp = [o for a, o in r if a in 'mbp']; aa = [o for a, o in r if a == 'a']
    check('T1 m/b/p prawie zamknięte', max(mbp) <= 0.3, mbp)
    check('T1 „a” otwarte', min(aa) >= 0.35, aa)

    # T2 — kilka zdań
    pg.evaluate("()=>{ mowa.wnetrze.eng.stats=[]; mowa.powiedz('Dzień dobry. Jestem asystentką EGZO. Wrzuć dokument, a z przyjemnością się nim zajmę. Wszystko zapiszę w Obsidianie.'); }")
    t0 = time.time()
    while time.time() - t0 < 40:
        pg.wait_for_timeout(300)
        if pg.evaluate("()=>!mowa.zajeta&&mowa.wnetrze.eng.stats.length>=4"): break
    st = pg.evaluate("()=>mowa.wnetrze.eng.stats")
    gaps = [s['gap'] for s in st[1:]]
    check('T2 pauzy między zdaniami 0,1–0,35 s', gaps and all(0.1 <= g <= 0.35 for g in gaps), gaps)
    check('T2 bez spóźnień syntezy', all(s['late'] == 0 for s in st), [s['late'] for s in st])

    # T3 — strumień
    pg.evaluate("""()=>{ window.__sp=mowa.strumien(); window.__t0=mowa.wnetrze.neural.ctx.currentTime;
      const full='Oczywiście, już sprawdzam. Na biurku leży jedno zamówienie, które czeka na Twoją akceptację. Czy mam je otworzyć?';
      let i=0; window.__iv=setInterval(()=>{ i=Math.min(full.length,i+12); __sp.dodaj(full.slice(0,i)); if(i>=full.length){ clearInterval(__iv); window.__done=__sp.zakoncz(full); } },180); }""")
    first = None
    for i in range(150):
        pg.wait_for_timeout(200)
        info = pg.evaluate("()=>[mowa.wnetrze.eng.sources.length, +(mowa.wnetrze.neural.ctx.currentTime-__t0).toFixed(2), mowa.zajeta]")
        if info[0] > 0 and first is None: first = info[1]
        if first is not None and not info[2]: break
    check('T3 strumień zagrał', first is not None, f'pierwszy dźwięk po {first} s')

    # T4 — zdarzenia
    ev = pg.evaluate("()=>__ev.map(e=>e[0])")
    check("T4 zdarzenie 'mowi' (start/koniec)", True in ev and ev[-1] is False, ev[:8])

    # T5 — przygotuj + powiedz
    r = pg.evaluate("""async()=>{ const t='Przyszedł nowy e-mail od Anny. Temat: zamówienie numer 12.'; const p=await mowa.przygotuj(t);
      const c=mowa.wnetrze.neural.ctx, a=c.currentTime; mowa.powiedz(t,{przygotowane:p});
      await new Promise(r=>setTimeout(r,50)); return [!!p, mowa.wnetrze.eng.sources.length>0, mowa.zajeta]; }""")
    check('T5 przygotowana kwestia startuje od razu', r[0] and r[1], r)

    # T6 — stop
    pg.wait_for_timeout(500)
    r = pg.evaluate("()=>{ mowa.stop(); return [mowa.zajeta, mowa.wnetrze.eng.sources.length]; }")
    check('T6 stop() ucisza od razu', r == [False, 0], r)
    check('brak błędów strony', not errs, errs)
    b.close()
print('WYNIK:', sum(ok), '/', len(ok))
sys.exit(0 if all(ok) else 1)
