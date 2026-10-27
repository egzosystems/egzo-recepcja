"""Test pamięci i zadań (atrapy Claude, bazy i Gmaila):
1) „Zapamiętaj…” → fakt w bazie, po przeładowaniu strony jest w kontekście rozmowy,
2) „Przypomnij za minutę…” → przypomnienie w bazie, o czasie ona mówi „Szefie, przypominam: …”,
3) „Odpowiedz na maila…” → szkic w Gmailu (create_draft z replyToMessageId), nic nie jest wysyłane."""
from playwright.sync_api import sync_playwright
import sys
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
STUB = r"""(()=>{
  window.__calls=[]; window.__personas=[];
  const S=JSON.parse(localStorage.getItem('__S')||'{}'), save=()=>localStorage.setItem('__S',JSON.stringify(S));
  const coll=path=>({ orderBy(){return this}, limit(){return this},
    get:async()=>({docs:Object.entries(S[path]||{}).map(([id,v])=>({id,exists:true,data:()=>v}))}),
    doc:id=>({ get:async()=>({exists:!!(S[path]&&S[path][id]),data:()=>S[path]&&S[path][id]}),
      set:async v=>{ (S[path]=S[path]||{})[id]=JSON.parse(JSON.stringify(v)); save(); }, update:async v=>{ Object.assign(S[path][id],v); save(); },
      delete:async()=>{ if(S[path]) delete S[path][id]; save(); }, onSnapshot:()=>()=>{} }) });
  const pad=n=>String(n).padStart(2,'0'), loc=t=>{ const d=new Date(t); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const sample=async(msgs,opts)=>{ __personas.push(msgs[0].content); const q=msgs[msgs.length-1].content, T=n=>opts.tools.find(t=>t.name===n), ctx={signal:null};
    let ans='Dobrze, szefie.';
    if(/Zapamiętaj/i.test(q)){ __calls.push(['zapamietaj',await T('zapamietaj').execute({fakt:'Rafał tnie płyty we wtorki'},ctx)]); ans='Zapamiętałam, szefie.'; }
    else if(/Przypomnij/i.test(q)){ __calls.push(['przypomnij',await T('przypomnij').execute({kiedy:loc(Date.now()+60000),tresc:'telefon do Ani'},ctx)]); ans='Przypomnę, szefie.'; }
    else if(/Odpowiedz/i.test(q)){ const t=T('szkic_odpowiedzi'); __calls.push(['szkic',t?await t.execute({id_wiadomosci:'m123',do:'Jan Kowalski <jan@example.com>',temat:'Re: Terrarium',tresc:'Dzień dobry, dziękujemy za zapytanie.'},ctx):'brak narzędzia']); ans='Szkic czeka w Gmailu, szefie.'; }
    opts.onText&&opts.onText({text:ans,delta:ans}); return {text:ans}; };
  sample.limits=async()=>({tools:true});
  window.claude={use:async n=>n==='sample'?sample:n==='db'?{collection:coll}:null};
})()"""
def ready(pg):
    for i in range(120):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running&&cur.id==='idle'"): return
def ask(pg, q):
    pg.fill('#chatIn', q); pg.press('#chatIn', 'Enter')
    for i in range(60):
        pg.wait_for_timeout(300)
        if pg.evaluate("()=>!chatBusy"): break
ok = True
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); ctx = b.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page(); errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.add_init_script(STUB)
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#voiceBtn'); ready(pg)
    ask(pg, 'Zapamiętaj, że Rafał tnie płyty we wtorki')
    ask(pg, 'Przypomnij mi za minutę o telefonie do Ani')
    pg.evaluate("()=>{ window.__drafts=[]; mail.state='on'; mail.mcp={callTool:async(s,t,a)=>{ __drafts.push([s,t,a]); return {payload:{id:'draft1'}}; }}; }")
    ask(pg, 'Odpowiedz Janowi na maila o terrarium')
    calls = pg.evaluate("()=>__calls"); drafts = pg.evaluate("()=>__drafts")
    # przeładowanie: pamięć z bazy w kontekście
    pg.reload(); pg.wait_for_timeout(2500); pg.click('#voiceBtn'); ready(pg)
    ask(pg, 'Co pamiętasz?')
    persona = pg.evaluate("()=>__personas.slice(-1)[0]")
    # przypomnienie o czasie
    said = False
    for i in range(110):
        pg.wait_for_timeout(1000)
        if pg.evaluate("()=>evq.log.some(e=>e.text.includes('przypominam')&&e.text.includes('telefon do Ani'))"): said = True; break
    log = pg.evaluate("()=>evq.log.map(e=>e.text)")
    b.close()
print('narzędzia:', calls)
c1 = calls and calls[0][1] == {'zapisano': True}; ok &= bool(c1); print(f"{'OK ' if c1 else 'BŁĄD'} zapamiętanie")
c2 = 'Rafał tnie płyty we wtorki' in (persona or ''); ok &= c2; print(f"{'OK ' if c2 else 'BŁĄD'} po przeładowaniu fakt jest w kontekście")
c3 = len(calls) > 1 and calls[1][1].get('ustawiono') is True; ok &= bool(c3); print(f"{'OK ' if c3 else 'BŁĄD'} przypomnienie ustawione: {calls[1][1] if len(calls) > 1 else None}")
ok &= said; print(f"{'OK ' if said else 'BŁĄD'} przypomnienie powiedziane o czasie: {[t for t in log if 'przypominam' in t]}")
c5 = bool(drafts) and drafts[0][1] == 'create_draft' and drafts[0][2].get('replyToMessageId') == 'm123' and drafts[0][2].get('to') == ['jan@example.com'] and all(d[1] != 'send_message' for d in drafts)
ok &= c5; print(f"{'OK ' if c5 else 'BŁĄD'} szkic w Gmailu (bez wysyłania): {drafts[:1]}")
ok &= not errs; print('BŁĘDY STRONY:', errs); print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
sys.exit(0 if ok else 1)
