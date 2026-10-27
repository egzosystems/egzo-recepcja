from playwright.sync_api import sync_playwright
import time
with sync_playwright() as p:
    b=p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); pg=b.new_page(viewport={"width":1280,"height":1000})
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto("http://localhost:8768/egzo-recepcja_2026-10-27.html"); pg.wait_for_timeout(15500)
    pg.click('#voiceBtn')
    for i in range(60):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>neural.state")!='loading': break
    pg.wait_for_timeout(7000)
    print('gmail:', pg.inner_text('#mailNote'), '| przerwa:', pg.inner_text('#workNow'))
    pg.click('#studioBtn'); pg.wait_for_timeout(300)
    # zdarzenie w trakcie obsługi dokumentu: ma poczekać
    pg.set_input_files("#fileIn","/tmp/claude-0/-home-claude/39a6a5a9-976f-544e-a9ce-9948c9a77f8c/scratchpad/test_faktura.txt"); pg.wait_for_timeout(1500)
    pg.click('#testMail'); pg.click('#testBreak')
    log=[]; t0=time.time()
    while time.time()-t0<70:
        pg.wait_for_timeout(1000)
        s=pg.evaluate("()=>[cur.id, document.getElementById('statusTxt').innerText.slice(0,40), document.getElementById('subline').innerText.slice(0,70)||document.getElementById('subtitle').innerText.slice(0,70), busy.v, evq.queue.length]")
        if not log or s!=log[-1][1]: log.append((round(time.time()-t0),s))
        if time.time()-t0>20 and not s[3] and s[4]==0 and pg.evaluate("()=>eng.live===0&&!evq.running"): break
    for l in log: print(l)
    pg.click('#testBack'); pg.wait_for_timeout(4000); print('powrót:', pg.inner_text('#subtitle')[:80])
    print('log zdarzeń:', pg.inner_text('#evLog').replace('\n',' | ')[:300])
    print('BŁĘDY', errs); b.close()
