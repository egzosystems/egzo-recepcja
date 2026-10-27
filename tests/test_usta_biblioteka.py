from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto("http://localhost:8768/egzo-recepcja_2026-10-27.html"); pg.wait_for_timeout(1500)
    r=pg.evaluate("""async()=>{ await loadLibrary(); const out=[];
      for(const line of ['Dzień dobry! Jestem asystentką EGZO. Wrzuć dokument, a zajmę się nim.','Pracujesz już pięć godzin bez przerwy. Może zrobisz sobie krótką przerwę?']){
        for(const m of libChunks(line)){
          const tr=trimSilence(m.pcm.slice(),m.sampleRate), tl=lipTimeline(m,m.text,tr.offset+(m.pre||0),tr.pcm.length/m.sampleRate,tr.pcm);
          const units=phonesFromChars(m.chars,m.dur), fr=m.hop/m.sampleRate; let t=-(tr.offset+(m.pre||0)); const row=[];
          for(const u of units){ const t0=t,t1=t+u.d*fr; t=t1; if(t1<=0) continue; const id=tl[Math.max(0,Math.min(tl.length-1,Math.floor(((t0+t1)/2)/.01)))]; row.push(u.p+'['+(id===255?'Z':lip.meta.shapes[id])+']'); }
          out.push(row.join(' ')); } }
      return out; }""")
    for l in r: print(l)
    b.close()
