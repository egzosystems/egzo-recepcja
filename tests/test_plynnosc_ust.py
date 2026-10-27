from playwright.sync_api import sync_playwright
import json, collections
with sync_playwright() as p:
    b=p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); pg=b.new_page(viewport={"width":1280,"height":900})
    errs=[]; pg.on("pageerror",lambda e:errs.append(str(e)))
    pg.goto("http://localhost:8768/egzo-recepcja_2026-10-27.html"); pg.wait_for_timeout(3000)
    pg.click('#voiceBtn')
    for i in range(80):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>neural.state")=='ready' and pg.evaluate("()=>eng.live===0&&!eng.busy&&!evq.running"): break
    pg.wait_for_timeout(1500)
    pg.evaluate("""()=>{ window.__d=[]; const ctx=lip.ctx, od=ctx.drawImage.bind(ctx);
      ctx.drawImage=function(img,sx,sy,sw,sh,...r){ const t=Math.round(sy/sh)*lip.mm.cols+Math.round(sx/sw); __d.push([+performance.now().toFixed(0),t,+lip.alpha.toFixed(2)]); return od(img,sx,sy,sw,sh,...r); };
      say('Mama ma moc. Basia pije mleko i je owoce.'); }""")
    pg.wait_for_timeout(7000)
    d=pg.evaluate("()=>__d"); mm=pg.evaluate("()=>[lip.mm.shapes.length, lip.CLOSED_I]")
    nb=mm[0]
    seq=[]; 
    for t,tile,a in d:
        if not seq or seq[-1][1]!=tile: seq.append((t,tile,a))
    kinds=collections.Counter('kształt' if s[1]<nb else 'faza' for s in seq)
    print('narysowanych klatek',len(d),'| zmian kafelka',len(seq),'|',dict(kinds))
    # przejścia kształt→kształt bez fazy pośredniej
    direct=sum(1 for a,b2 in zip(seq,seq[1:]) if a[1]<nb and b2[1]<nb)
    print('bezpośrednich przeskoków kształt→kształt:',direct)
    print('początek:',[ (s[1] if s[1]>=nb else lip) for s,lip in zip(seq[:24],[None]*24)][:24] if False else [s[1] for s in seq[:30]])
    print('BŁĘDY',errs); b.close()
