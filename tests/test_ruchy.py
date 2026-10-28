"""Test ruchów na polecenie: każdy dostępny ruch (każdy wariant) gra, a po nim pętla wraca szybko (bez zatrzymanego obrazu).
Ruch mówiony „aaa”: przeciągłe „Aaaa” (≥ 1,2 s mowy) z otwartymi ustami z biblioteki.
Kryteria: każdy klip się odtwarza, powrót do pętli ≤ 400 ms od końca klipu, „aaa” trwa ≥ 1,2 s, brak błędów strony.
Użycie: python3 tests/test_ruchy.py [URL]
"""
from playwright.sync_api import sync_playwright
import sys
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
ok = True
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); pg = b.new_page(viewport={"width": 1280, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#voiceBtn')
    for i in range(120):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running&&cur.id==='idle'"): break
    ids = pg.evaluate("()=>Object.values(RUCHY_KAT).flatMap(r=>r.ids).filter(x=>x.startsWith('ruch_'))")
    print('warianty:', len(ids))
    for id in ids:
        r = pg.evaluate("""async(id)=>{ let grał=false, koniec=null, powrot=null;
          const t=setInterval(()=>{ const v=[vA,vB].find(x=>x.style.opacity==='1');
            if(cur.id===id&&v&&v.src.endsWith(byId[id].src)&&v.currentTime>.2) grał=true;
            if(grał&&cur.id==='idle'&&koniec==null) koniec=performance.now();
            if(koniec!=null&&v&&v.src.endsWith(byId.idle.src)&&powrot==null) powrot=performance.now()-koniec; },10);
          await play([id]); const t0=performance.now(); while(powrot==null&&performance.now()-t0<3000) await new Promise(f=>setTimeout(f,20));
          clearInterval(t); return {grał, powrot:powrot==null?null:Math.round(powrot)}; }""", id)
        good = r['grał'] and r['powrot'] is not None and r['powrot'] <= 400
        ok &= good; print(f"{'OK ' if good else 'BŁĄD'} {id}: grał={r['grał']} powrót do pętli {r['powrot']} ms")
    r = pg.evaluate("""async()=>{ const L=mowa.wnetrze.lip; let od=null, do_=null, mx=0; const t0=performance.now();
      const t=setInterval(()=>{ if(L.cur>=0&&L.alpha>.5){ const n=performance.now(); if(od==null) od=n; do_=n; mx=Math.max(mx,L.open[L.cur]); } },10);
      await wykonajRuch('mow:aaa'); clearInterval(t); return {czas:od==null?0:Math.round(do_-od), otwarcie:+mx.toFixed(2)}; }""")
    good = r['czas'] >= 1200 and r['otwarcie'] >= 0.6
    ok &= good; print(f"{'OK ' if good else 'BŁĄD'} aaa: {r['czas']} ms, otwarcie maks {r['otwarcie']}")
    b.close()
ok &= not errs
print('BŁĘDY STRONY:', errs); print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
sys.exit(0 if ok else 1)
