"""Test analizy dokumentów (atrapa Claude i bazy): odczyt TXT, DOCX, XLSX, PDF z tekstem, PDF-skanu i zdjęcia,
przekazanie treści (albo obrazu) do analizy, notatka Obsidiana z danymi, zapis dokumentów w bazie,
ona mówi wynik analizy, pobranie notatki .md.
Użycie: python3 tests/test_dokumenty.py KATALOG_Z_PLIKAMI [URL]
(pliki testowe: zamowienie_*.txt, zamowienie_word_*.docx, rozkroj_*.xlsx, faktura_*.pdf, skan_*.pdf, zdjecie_zapytania_*.png)"""
from playwright.sync_api import sync_playwright
import glob, json, os, sys

DIR = sys.argv[1]
URL = sys.argv[2] if len(sys.argv) > 2 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
STUB = r"""(()=>{
  window.__PDFJS_URL='lib/pdf.min.js'; window.__prompts=[]; window.__saved=[]; window.__subs=[];
  const sample=async()=>({text:'ok'}); sample.limits=async()=>({tools:true,images:{maxCount:5}});
  sample.json=async(prompt,opts)=>{ __prompts.push({prompt,img:!!(opts&&opts.images&&opts.images.length)}); await new Promise(r=>setTimeout(r,700));
    return {typ:'zamówienie',tytul:'Dokument '+__prompts.length,streszczenie:'Streszczenie testowe.',dane:{klient:'Klient X',kwota:'100 zł',pusty:''},zadania:['Oddzwonić do klienta'],tagi:['test'],powiedz:'Szefie, to zamówienie testowe numer '+__prompts.length+'.'}; };
  const S={};
  const coll=path=>({ orderBy(){return this}, limit(){return this},
    get:async()=>({docs:Object.entries(S[path]||{}).map(([id,v])=>({id,exists:true,data:()=>v}))}),
    doc:id=>({ get:async()=>({exists:!!(S[path]&&S[path][id]),data:()=>S[path]&&S[path][id]}),
      set:async v=>{ (S[path]=S[path]||{})[id]=JSON.parse(JSON.stringify(v)); }, update:async v=>{ Object.assign(S[path][id],v); }, onSnapshot:()=>()=>{} }) });
  const db={collection:coll}; window.__S=S;
  const dl={save:async r=>{ __saved.push({filename:r.filename,data:String(r.data)}); return {status:'saved'}; }};
  window.claude={use:async n=>n==='sample'?sample:n==='db'?db:n==='downloads'?dl:null};
})()"""
files = sorted(glob.glob(os.path.join(DIR, '*')))
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); pg = b.new_page(viewport={"width": 1280, "height": 900})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.add_init_script(STUB)
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#voiceBtn')
    for i in range(120):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running&&cur.id==='idle'"): break
    pg.evaluate("()=>{ new MutationObserver(()=>{ const t=document.getElementById('subtitle').textContent; if(t) __subs.push(t); }).observe(document.getElementById('subtitle'),{childList:true,characterData:true,subtree:true}); }")
    pg.set_input_files('#fileIn', files)
    for i in range(400):
        pg.wait_for_timeout(1000)
        if pg.evaluate(f"()=>docs.filter(d=>!d.ex&&d.s==='DO AKCEPTACJI').length>={len(files)}&&!busy.v&&!mowa.zajeta"): break
    prompts = pg.evaluate("()=>__prompts")
    stored = pg.evaluate("()=>Object.values(__S.dokumenty||{}).map(v=>({name:v.name,s:v.s,an:!!v.analiza,len:(v.tekst||'').length}))")
    note = pg.evaluate("()=>{ sel=docs.find(d=>d.analiza); renderNote(); return document.getElementById('notePre').textContent; }")
    pg.click('#dlNoteBtn'); pg.wait_for_timeout(500)
    saved = pg.evaluate("()=>__saved.map(s=>s.filename)"); subs = pg.evaluate("()=>[...new Set(__subs)]")
    b.close()
expect = {'Anna Nowak': 'txt', 'Piotr Zieliński': 'docx', 'Marek Wiśniewski': 'xlsx', 'Tomasz Kowalczyk': 'pdf z tekstem'}
ok = not errs
for k, what in expect.items():
    hit = any(k in x['prompt'] for x in prompts); ok &= hit; print(f"{'OK ' if hit else 'BŁĄD'} odczyt {what}: „{k}” w treści dla analizy")
imgs = sum(1 for x in prompts if x['img']); ok &= imgs >= 2; print(f"{'OK ' if imgs >= 2 else 'BŁĄD'} obrazy do analizy (skan PDF + zdjęcie): {imgs}")
n_an = sum(1 for s in stored if s['an']); ok &= n_an == len(files); print(f"{'OK ' if n_an == len(files) else 'BŁĄD'} dokumenty w bazie z analizą: {n_an}/{len(files)}")
nt = '## Streszczenie' in note and '| klient | Klient X |' in note and 'pusty' not in note and '- [ ] Oddzwonić do klienta' in note
ok &= nt; print(f"{'OK ' if nt else 'BŁĄD'} notatka z danymi i zadaniami")
sp = any('zamówienie testowe' in s for s in subs); ok &= sp; print(f"{'OK ' if sp else 'BŁĄD'} mówi wynik analizy: {[s for s in subs if 'testowe' in s][:2]}")
fn = bool(saved) and saved[0].endswith('.md') and '2026' in saved[0]; ok &= fn; print(f"{'OK ' if fn else 'BŁĄD'} pobranie notatki: {saved}")
print('BŁĘDY STRONY:', errs); print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
sys.exit(0 if ok else 1)
