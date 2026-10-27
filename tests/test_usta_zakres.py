from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto("http://localhost:8768/egzo-recepcja_2026-10-27.html"); pg.wait_for_timeout(2000)
    r=pg.evaluate("""async()=>{ await loadLibrary(); const res=[];
      for(const line of ['Dobry wieczór! Jestem asystentką EGZO. Wrzuć dokument, a zajmę się nim.','Pracujesz już pięć godzin bez przerwy. Może zrobisz sobie krótką przerwę?']){
        for(const m of libChunks(line)){ const tr=trimSilence(m.pcm.slice(),m.sampleRate); const tl=lipTimeline(m,m.text,tr.offset+(m.pre||0),tr.pcm.length/m.sampleRate,tr.pcm);
          const op=Array.from(tl).map(i=>lip.open[i]); let seq=0; for(let k=1;k<tl.length;k++) if(lip.next[tl[k-1]]===tl[k]) seq++;
          res.push({t:m.text.slice(0,30), n:tl.length, max:+Math.max(...op).toFixed(2), mean:+(op.reduce((a,b)=>a+b,0)/op.length).toFixed(2), zmian:new Set(tl).size, ciagle:+(seq/(tl.length-1)).toFixed(2), sciezka:op.map(x=>Math.round(x*9)).join('')}); } }
      return res; }""")
    for x in r: print(x)
    b.close()
