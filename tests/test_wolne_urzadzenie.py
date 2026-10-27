from playwright.sync_api import sync_playwright
import time, json
with sync_playwright() as p:
    b=p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); pg=b.new_page()
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto("http://localhost:8768/egzo-recepcja_2026-10-27.html"); pg.wait_for_timeout(15500)
    pg.click('#voiceBtn')
    for i in range(80):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>neural.state")!='loading': break
    pg.wait_for_timeout(8000)
    cdp=pg.context.new_cdp_session(pg); cdp.send("Emulation.setCPUThrottlingRate",{"rate":4})
    pg.evaluate("()=>{eng.stats=[]; window.__t0=neural.ctx.currentTime; say('Dziękuję za dokument. Już go czytam i zaraz powiem, co w nim jest. Wygląda na zamówienie terrarium sto dwadzieścia na sześćdziesiąt. Czy mam je od razu przekazać do akceptacji?')}")
    t0=time.time()
    while time.time()-t0<60:
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>eng.live===0&&!eng.busy&&!eng.pend.length&&eng.stats.length>=4"): break
    st=pg.evaluate("()=>[eng.stats, +eng.rtf.toFixed(2), +(eng.sources.length)]")
    print('4x wolniej:', json.dumps(st[0])); print('tempo syntezy (s na 1 s mowy):', st[1])
    print('pierwszy dźwięk po', round(st[0][0]['gap']+0,2) if st[0] else None)
    print('BŁĘDY', errs); b.close()
