from playwright.sync_api import sync_playwright
import time, json
def done(pg): return pg.evaluate("()=>eng.live===0&&!eng.busy&&!eng.pend.length&&!eng.ready.length&&!evq.running")
with sync_playwright() as p:
    b=p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx=b.new_context(viewport={"width":412,"height":915},is_mobile=True,has_touch=True); pg=ctx.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    cdp=ctx.new_cdp_session(pg); cdp.send("Emulation.setCPUThrottlingRate",{"rate":4})
    pg.goto("http://localhost:8768/egzo-recepcja_2026-10-27.html"); pg.wait_for_timeout(3000)
    pg.tap('#voiceBtn')
    for i in range(120):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>neural.state")=='ready' and done(pg): break
    pg.wait_for_timeout(4000)  # rozgrzewka
    # 1) ogłoszenie nowego maila (zmienna treść)
    pg.evaluate("()=>{eng.stats=[]; window.__t=performance.now(); document.getElementById('testMail').click();}")
    t0=time.time()
    while time.time()-t0<40:
        pg.wait_for_timeout(300)
        if pg.evaluate("()=>eng.stats.length>0") and done(pg): break
    print('MAIL', json.dumps(pg.evaluate("()=>eng.stats")), '| od zdarzenia do końca', round(time.time()-t0,1),'s')
    # 2) odpowiedź czatu dopływająca kawałkami (3 zdania)
    pg.evaluate("""()=>{ eng.stats=[]; const sp=mowa.strumien(); const full='Jasne, już sprawdzam. Masz dziś jedno zamówienie, które czeka na twoją akceptację. Czy mam je od razu otworzyć?';
      let i=0; const iv=setInterval(()=>{ i=Math.min(full.length,i+14); sp.dodaj(full.slice(0,i)); if(i>=full.length){ clearInterval(iv); sp.zakoncz(full); } },150); }""")
    t0=time.time(); first=None
    while time.time()-t0<60:
        pg.wait_for_timeout(200)
        if first is None and pg.evaluate("()=>eng.sources.length>0"): first=round(time.time()-t0,1)
        if pg.evaluate("()=>eng.stats.length>=3") and done(pg): break
    st=pg.evaluate("()=>eng.stats")
    print('CZAT', json.dumps(st), '| pierwszy dźwięk po', first, 's')
    print('przerwy między zdaniami:', [s['gap'] for s in st[1:]])
    print('BŁĘDY', errs); b.close()
