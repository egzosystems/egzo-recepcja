from playwright.sync_api import sync_playwright
import time, json, sys
WAIT_BEFORE_TAP = float(sys.argv[1]) if len(sys.argv) > 1 else 3
with sync_playwright() as p:
    b=p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    ctx=b.new_context(viewport={"width":412,"height":915},device_scale_factor=2.6,is_mobile=True,has_touch=True)
    pg=ctx.new_page(); errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    cdp=ctx.new_cdp_session(pg); cdp.send("Emulation.setCPUThrottlingRate",{"rate":4})
    pg.goto("http://localhost:8768/egzo-recepcja_2026-10-27.html"); pg.wait_for_timeout(int(WAIT_BEFORE_TAP*1000))
    pg.tap('#voiceBtn'); t0=time.time(); rows=[]
    while time.time()-t0<60:
        pg.wait_for_timeout(250)
        r=pg.evaluate("""()=>{ const ct=neural.ctx?neural.ctx.currentTime:0; const sh=lip.segs.length?lipShapeAt(ct+.04):null;
          const playing=eng.sources.length>0&&lip.segs.some(s=>ct>=s.t0&&ct<s.t0+s.dur);
          return [neural.state, cur.id, front.src.split('/').pop().slice(5,16), playing, sh===null?'-':sh===255?'Z':lip.meta.shapes[sh], +lip.alpha.toFixed(2), document.getElementById('subline').innerText.slice(0,40)] }""")
        rows.append((round(time.time()-t0,2),r))
        if r[0]=='ready' and time.time()-t0>12 and not r[3] and pg.evaluate("()=>eng.live===0&&!eng.busy&&!eng.pend.length"): break
    st=pg.evaluate("()=>eng.stats")
    prev=None
    for t,r in rows:
        key=(r[0],r[1],r[2],r[3],r[4]!='-',r[5]>0.5)
        if key!=prev: print(t,r); prev=key
    print('stats',json.dumps(st)); print('BŁĘDY',errs); b.close()
