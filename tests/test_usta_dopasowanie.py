"""Zrzuty ust podczas mowy w różnych miejscach pętli: klatka wideo + nakładka ust złożone w przeglądarce (układ wideo)."""
from playwright.sync_api import sync_playwright
import json, base64
S = '/tmp/claude-0/-home-claude/39a6a5a9-976f-544e-a9ce-9948c9a77f8c/scratchpad'
GRAB = """()=>{ const v=front, fi=Math.min(lip.track.length-1,Math.round(v.currentTime*24)), tr=lip.track[fi];
  const c=document.createElement('canvas'); c.width=120; c.height=100; const x=c.getContext('2d');
  const sx=tr[0]-60, sy=tr[1]-55;
  x.drawImage(v,sx,sy,120,100,0,0,120,100); x.drawImage(lip.canvas,sx,sy,120,100,0,0,120,100);
  const ct=neural.ctx.currentTime+.04, sh=lipShapeAt(ct);
  return {img:c.toDataURL('image/png'), ang:tr[4], a:+lip.alpha.toFixed(2), tile:lip.lastTile, sh:sh===null?'-':sh===255?'Z':lip.mm.shapes[sh]}; }"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    pg = b.new_page(viewport={"width": 1280, "height": 900}); errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8768/egzo-recepcja_2026-10-27.html"); pg.wait_for_timeout(2500)
    pg.click('#voiceBtn')
    for i in range(80):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>neural.state")=='ready' and pg.evaluate("()=>eng.live===0&&!eng.busy&&!evq.running"): break
    shots = []
    for loopT in (1.0, 9.5, 14.0):
        pg.evaluate(f"()=>{{ front.currentTime={loopT}; }}"); pg.wait_for_timeout(500)
        pg.evaluate("()=>{ say('Dobry wieczór! Jestem asystentką EGZO. Wrzuć dokument, a zajmę się nim.'); }")
        pg.wait_for_timeout(250)
        for k in range(8):
            r = pg.evaluate(GRAB)
            path = f"{S}/lip/fit_{loopT}_{k}.png"; open(path, 'wb').write(base64.b64decode(r['img'].split(',')[1]))
            shots.append((path, loopT, {kk: r[kk] for kk in ('ang', 'a', 'tile', 'sh')})); pg.wait_for_timeout(330)
        for i in range(30):
            pg.wait_for_timeout(300)
            if pg.evaluate("()=>eng.live===0&&!eng.busy"): break
    json.dump(shots, open(f"{S}/lip/fit.json", "w"))
    print('BŁĘDY', errs); b.close()
