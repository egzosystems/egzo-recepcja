"""Testy mowy i ust w przeglądarce (Chromium bez okna).
T1 oś czasu ust dla zdania kontrolnego, T2 płynność wielu zdań, T3 mowa strumieniowa, T4 zrzuty ust."""
from playwright.sync_api import sync_playwright
import json, sys, time

S = '/tmp/claude-0/-home-claude/39a6a5a9-976f-544e-a9ce-9948c9a77f8c/scratchpad'
URL = 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(15500)
    pg.click('#voiceBtn')
    for i in range(60):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>neural.state") != 'loading': break
    pg.wait_for_timeout(7000)  # powitanie
    print('stan głosu:', pg.evaluate("()=>[neural.state, voice.neural]"))

    # T1 — oś czasu ust
    r = pg.evaluate("""async()=>{
      const text='Mama ma kota, a Basia pije mleko.';
      const m=await synthNeural(spokenPL(text));
      const tr=trimSilence(m.pcm.slice(),m.sampleRate);
      const tl=lipTimeline(m,text,tr.offset,tr.pcm.length/m.sampleRate,tr.pcm);
      const units=phonesFromChars(m.chars,m.dur); const fr=m.hop/m.sampleRate;
      let t=-tr.offset; const names=lip.meta.shapes; const rows=[];
      for(const u of units){ const t0=t,t1=t+u.d*fr; t=t1; if(t1<=0) continue; const mid=Math.floor(((t0+t1)/2)/.01);
        const id=tl[Math.max(0,Math.min(tl.length-1,mid))]; rows.push([u.p,+t0.toFixed(2),+t1.toFixed(2),id===255?'ZAMKNIĘTE':names[id]]); }
      return {rows,ms:Math.round(m.ms),sec:+(m.pcm.length/m.sampleRate).toFixed(2)};
    }""")
    print('T1 synteza', r['ms'], 'ms dla', r['sec'], 's dźwięku')
    print('T1', ' '.join(f"{a}[{d}]" for a, b0, c, d in r['rows']))
    bad = [row for row in r['rows'] if row[0] in ('m', 'b', 'p') and row[3] not in ('mbp','ZAMKNIĘTE')]
    vow = [row for row in r['rows'] if row[0] in ('a',) and row[3] in ('ZAMKNIĘTE',)]
    print('T1 m/b/p niezamknięte:', bad, '| „a” zamknięte:', vow)

    # T2 — płynność kilku zdań
    pg.evaluate("()=>{eng.stats=[]; say('Dzień dobry. Jestem asystentką EGZO. Wrzuć dokument, a z przyjemnością się nim zajmę. Wszystko zapiszę w Obsidianie.')}")
    t0 = time.time()
    while time.time() - t0 < 30:
        pg.wait_for_timeout(300)
        if pg.evaluate("()=>eng.live===0&&!eng.busy&&!eng.pend.length&&eng.stats.length>=4"): break
    st = pg.evaluate("()=>eng.stats")
    print('T2', json.dumps(st))
    print('T2 przerwy między zdaniami [s]:', [s['gap'] for s in st[1:]], '| spóźnienia syntezy:', [s['late'] for s in st])

    # T3 — strumień: tekst dopływa kawałkami
    pg.evaluate("""()=>{ window.__sp=speechStream(); window.__t0=neural.ctx.currentTime;
      const full='Oczywiście, już sprawdzam. Na biurku leży jedno zamówienie, które czeka na Twoją akceptację. Czy mam je otworzyć?';
      let i=0; window.__iv=setInterval(()=>{ i=Math.min(full.length,i+12); __sp.push(full.slice(0,i)); if(i>=full.length){ clearInterval(__iv); __sp.end(full); } },180); }""")
    first = None
    for i in range(60):
        pg.wait_for_timeout(200)
        info = pg.evaluate("()=>[eng.sources.length, +(neural.ctx.currentTime-__t0).toFixed(2), eng.stats.length]")
        if info[0] > 0 and first is None: first = info[1]
    print('T3 pierwszy dźwięk po', first, 's od początku dopływu tekstu (cały tekst dopływa ok. 1,7 s)')

    # T4 — zrzuty ust podczas mowy z opisem głoski (po zakończeniu poprzedniej mowy)
    for i in range(40):
        pg.wait_for_timeout(300)
        if pg.evaluate("()=>eng.live===0&&!eng.busy&&!eng.pend.length"): break
    pg.evaluate("()=>{ say('Mama ma moc. Basia pije mleko i je owoce.'); }")
    pg.wait_for_timeout(400)
    shots = []
    for k in range(22):
        pg.wait_for_timeout(110)
        info = pg.evaluate("""()=>{ const t=neural.ctx.currentTime+.04; const sh=lipShapeAt(t); return [sh===null?'-':sh===255?'ZAMKN':lip.meta.shapes[sh], +lip.alpha.toFixed(2)]; }""")
        path = f"{S}/lip/t4_{k:02d}.png"
        pg.screenshot(path=path, clip={"x": 0, "y": 0, "width": 900, "height": 600})
        shots.append((path, info))
    json.dump(shots, open(f"{S}/lip/t4.json", "w"))
    print('T4 kształty:', [s[1][0] for s in shots])
    print('BŁĘDY:', errs)
    b.close()
