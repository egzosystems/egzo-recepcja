"""Test poleceń ruchu w czacie (z atrapą Claude): „podnieś rękę” → krótkie potwierdzenie z biblioteki kwestii
(od razu, bez liczenia), potem klip powitania (ruch nie jest przerywany mową), na końcu powrót do spoczynku.
Sprawdza też, że osobowość zwraca się „szefie” i zabrania mówienia, że nie ma rąk."""
from playwright.sync_api import sync_playwright
import sys
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
STUB = """(()=>{ window.__persona=null; const sample=async(msgs,opts)=>{ window.__persona=msgs[0].content;
    const t=opts.tools&&opts.tools.find(x=>x.name==='wykonaj_ruch'); window.__toolRes=t?await t.execute({ruch:'powitanie'},{}):null;
    opts.onText&&opts.onText({text:'Już, szefie!',delta:'Już, szefie!'}); return {text:'Już, szefie!'}; };
  sample.limits=async()=>({tools:true});
  window.claude={use:async n=>n==='sample'?sample:null}; })()"""
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); pg = b.new_page(viewport={"width":1280,"height":900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.add_init_script(STUB)
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#voiceBtn')
    for i in range(120):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running&&cur.id==='idle'"): break
    pg.evaluate("""()=>{ window.__log=[]; let last=''; const t0=performance.now(); const L=mowa.wnetrze;
      const loop=()=>{ const s=cur.id+'|'+(mowa.mowi?'mówi':'-'); if(s!==last){ __log.push([Math.round(performance.now()-t0),s,L.eng.stats.slice(-1)[0]?.lib]); last=s; } if(performance.now()-t0<24000) requestAnimationFrame(loop); }; requestAnimationFrame(loop); }""")
    pg.fill('#chatIn', 'Podnieś rękę'); pg.press('#chatIn', 'Enter')
    pg.wait_for_timeout(19000)
    log = pg.evaluate("()=>__log"); per = pg.evaluate("()=>__persona"); tr = pg.evaluate("()=>__toolRes")
    hist = pg.evaluate("()=>chatHistory.slice(-2).map(m=>m.content)")
    b.close()
print('przebieg (ms, stan|mowa, z biblioteki):', log)
print('narzędzie:', tr, '| historia:', hist)
seq = [s for _, s, _ in log]
i_m = next((k for k, s in enumerate(seq) if s.endswith('mówi')), -1)
i_g = next((k for k, s in enumerate(seq) if s.startswith('greet')), -1)
lib = next((l for _, s, l in log if s.endswith('mówi')), None)
ok = (tr == {'wykonano': True, 'ruch': 'powitanie'} and 0 <= i_m < i_g and lib is True and seq[-1].startswith('idle')
      and 'szefie' in per and 'nie masz ciała' in per and not errs)
print('BŁĘDY STRONY:', errs); print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
sys.exit(0 if ok else 1)
