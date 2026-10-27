/* EGZO MOWA 1.0 — biblioteka mówienia asystentki: głos neuronowy w przeglądarce + gotowe kwestie
   + zsynchronizowane usta z prawdziwych klatek wideo. Jedno źródło prawdy, używane przez stronę
   i przez każdą kolejną umiejętność (maile, czat, przypomnienia…).

   const mowa = EgzoMowa.utworz({
     bazaGlosu: 'voice/', bazaUst: 'lip/', canvas: document.getElementById('lipCanvas'),
     wideo: () => ({ el: aktywneWideo, klip: 'idle' | null }),   // klip, na którym wolno rysować usta
     czekajNaSpoczynek: async () => {},                          // strona przechodzi do pozy mówienia
     napis: tekst => {},                                         // napisy (pusty tekst = schowaj)
   });
   await mowa.wlacz();                 // w kliknięciu (odblokowuje dźwięk na telefonach)
   await mowa.powiedz('Dzień dobry.'); // cała kwestia, usta same się ruszają
   const s = mowa.strumien(); s.dodaj(tekstDotąd); await s.zakoncz(całość);   // odpowiedź z czatu
   const p = await mowa.przygotuj(tekst); …; await mowa.powiedz(tekst, {przygotowane: p});
   mowa.stop(); mowa.zajeta; mowa.on('mowi', bool => …); mowa.on('stan', s => …); mowa.on('postep', p => …);
   EgzoMowa.liczba(125) → 'sto dwadzieścia pięć'; EgzoMowa.mowione('12,5%') → tekst do czytania.
   Szczegóły: docs/mowa.md */
(function (global) {
'use strict';

/* ---------- Liczby i tekst do czytania (model Mai czyta tylko litery) ---------- */
function numPL(n){
  const j=['zero','jeden','dwa','trzy','cztery','pięć','sześć','siedem','osiem','dziewięć','dziesięć','jedenaście','dwanaście','trzynaście','czternaście','piętnaście','szesnaście','siedemnaście','osiemnaście','dziewiętnaście'];
  const d=['','','dwadzieścia','trzydzieści','czterdzieści','pięćdziesiąt','sześćdziesiąt','siedemdziesiąt','osiemdziesiąt','dziewięćdziesiąt'];
  const s=['','sto','dwieście','trzysta','czterysta','pięćset','sześćset','siedemset','osiemset','dziewięćset'];
  const under1000=x=>{const r=[];if(x>=100){r.push(s[Math.floor(x/100)]);x%=100;} if(x>=20){r.push(d[Math.floor(x/10)]);x%=10;if(x)r.push(j[x]);} else if(x||!r.length) r.push(j[x]); return r.join(' ');};
  if(n<1000) return under1000(n);
  if(n<1000000){ const t=Math.floor(n/1000), rest=n%1000;
    const tw=t===1?'tysiąc':under1000(t)+' '+((t%10>=2&&t%10<=4&&(t%100<12||t%100>14))?'tysiące':'tysięcy');
    return rest?tw+' '+under1000(rest):tw; }
  return String(n).split('').map(c=>j[+c]).join(' ');
}
function spokenPL(t){
  return t.replace(/(\d+)\s*[x×]\s*(\d+)/g,'$1 na $2').replace(/(\d+)[,.](\d+)/g,'$1 przecinek $2')
          .replace(/\d+/g,m=>numPL(+m)).replace(/[_/]+/g,' ').replace(/%/g,' procent').replace(/\s+/g,' ');
}
function sentences(t){ return (t.match(/[^.!?…]+[.!?…]*["”»]?\s*/g)||[t]).map(s=>s.trim()).filter(Boolean); }
function pauseAfter(t){ return /[?!]["”»]?$/.test(t)?.32:/[.…]["”»]?$/.test(t)?.26:/[,;:]$/.test(t)?.12:.18; }
function trimSilence(pcm,sr){
  let peak=0; for(let i=0;i<pcm.length;i++) peak=Math.max(peak,Math.abs(pcm[i]));
  const th=peak*.02, pad=Math.round(sr*.025); let a=0, b=pcm.length-1;
  while(a<b&&Math.abs(pcm[a])<th) a++; while(b>a&&Math.abs(pcm[b])<th) b--;
  a=Math.max(0,a-pad); b=Math.min(pcm.length,b+pad*2);
  const out=pcm.slice(a,b);
  const f=Math.min(out.length>>1,Math.round(sr*.006));
  for(let i=0;i<f;i++){ const g=i/f; out[i]*=g; out[out.length-1-i]*=g; }
  return {pcm:out,offset:a/sr};
}

/* ---------- Głoski → otwarcie ust ---------- */
const VOWELS='aąeęioóuy';
// głoski z liter: dwuznaki i zmiękczenia (ci, si, zi, ni, dzi + samogłoska → jedna głoska)
function phonesFromChars(chars,dur){
  const units=[]; let i=0;
  const items=[]; for(let k=0;k<chars.length;k++){ if(chars[k]==='_'){ if(items.length) items[items.length-1].d+=dur[k]; else items.push({c:' ',d:dur[k]}); } else items.push({c:chars[k],d:dur[k]}); }
  while(i<items.length){
    const c=items[i].c, n=items[i+1]?.c||'', n2=items[i+2]?.c||'';
    let ph=c, d=items[i].d, take=1;
    const di=c+n;
    if(c==='d'&&(n==='ż'||n==='ź'||n==='z')){ ph=di; take=2; if(n==='z'&&n2==='i'&&VOWELS.includes(items[i+3]?.c||'')){ ph='dź'; take=3; } }
    else if(['sz','cz','rz','ch'].includes(di)){ ph=di; take=2; }
    else if('csznd'.includes(c)&&n==='i'&&VOWELS.includes(n2)&&n2!=='i'){ ph={c:'ć',s:'ś',z:'ź',n:'ń'}[c]||c; take=2; }
    for(let k=1;k<take;k++) d+=items[i+k].d;
    units.push({p:ph,d}); i+=take;
  }
  return units;
}
function visClass(p){
  if(p===' '||/^[.,!?;:…"”»-]$/.test(p)) return 'SIL';
  if(p==='a') return 'A'; if(p==='e'||p==='ę') return 'E'; if(p==='i'||p==='j') return 'I'; if(p==='y') return 'Y';
  if(p==='o'||p==='ą') return 'O'; if(p==='u'||p==='ó'||p==='ł') return 'U';
  if('mbp'.includes(p)) return 'MBP'; if(p==='f'||p==='w') return 'FV';
  if(['sz','cz','rz','ż','dż'].includes(p)) return 'SH';
  if(['s','z','c','dz','ś','ź','ć','dź'].includes(p)) return 'S';
  if(p==='l') return 'L'; if(p==='r') return 'R'; if(p==='k'||p==='g') return 'KG'; if(p==='ch'||p==='h') return 'CH';
  return 'TDN';
}
const LIP_FPS=25;
// docelowe otwarcie ust (0 = zamknięte, 1 = najszerzej w bibliotece) dla klasy głoski
const OPEN_T={A:1,O:.85,E:.72,Y:.62,U:.55,I:.5,SH:.55,S:.4,L:.55,R:.55,TDN:.5,KG:.6,CH:.6,FV:.28,MBP:0};
function lipTargets(m,offset,total,pcm){
  const n=Math.max(1,Math.ceil(total*LIP_FPS)), tg=new Float32Array(n);
  const sr=m.sampleRate, hop=Math.round(sr/LIP_FPS), env=new Float32Array(n);
  for(let i=0;i<n;i++){ let a=0; const s=i*hop, e=Math.min(pcm.length,s+hop); for(let k=s;k<e;k++) a+=pcm[k]*pcm[k]; env[i]=Math.sqrt(a/Math.max(1,e-s)); }
  const srt=Array.from(env).sort((a,b)=>a-b), p95=srt[Math.floor(.95*(n-1))]||1; for(let i=0;i<n;i++) env[i]=Math.min(1,env[i]/p95);
  if(!m.dur||!m.chars){ for(let i=0;i<n;i++) tg[i]=env[i]<.12?0:Math.min(1,.25+env[i]*.8); return tg; }
  const fr=m.hop/sr, units=phonesFromChars(m.chars,m.dur); let t=-offset; const seg=[];
  for(const u of units){ const t0=t,t1=t+u.d*fr; t=t1; seg.push({v:visClass(u.p),p:u.p,t0,t1}); }
  for(let i=0;i<n;i++){
    const tm=(i+.5)/LIP_FPS, g=seg.find(s=>tm>=s.t0&&tm<s.t1);
    let o;
    if(!g) o=0;
    else if(g.v==='SIL') o=(g.t1-g.t0)>(/[.,!?;:…]/.test(g.p)?.07:.16)?0:.3;
    else o=OPEN_T[g.v]??.5;
    tg[i]=Math.min(1,o*(.75+.45*env[i]));        // głośniej = szerzej
  }
  // krótkie głoski (krótsze niż krok ust 40 ms) nie mogą wypaść między krokami: m/b/p zawsze domyka usta,
  // samogłoski otwarte zawsze się otwierają; tym krokom dajemy większą wagę przy doborze klatek
  const wt=new Float32Array(n).fill(1);
  for(const s of seg){ if(s.v!=='MBP'&&s.v!=='A'&&s.v!=='O') continue;
    const i=Math.round((s.t0+s.t1)/2*LIP_FPS-.5); if(i<0||i>=n) continue;
    if(s.v==='MBP'){ tg[i]=0; wt[i]=3; } else { tg[i]=Math.max(tg[i],OPEN_T[s.v]*(.75+.45*env[i])); wt[i]=2; } }
  tg.wt=wt;
  return tg;
}

function utworz(opt){
  const o=Object.assign({bazaGlosu:'voice/',bazaUst:'lip/',canvas:null,glos:'mai',tempo:1,wysokosc:1.05,
    wideo:()=>null, czekajNaSpoczynek:async()=>{}, napis:()=>{}, wyprzedzenie:.04}, opt||{});
  const zd={}; const emit=(n,...a)=>(zd[n]||[]).slice().forEach(f=>{ try{ f(...a); }catch(e){ console.error(e); } });
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const hasTTS='speechSynthesis' in global;
  const voice={on:false,v:null,rate:o.tempo,pitch:o.wysokosc,list:[],engine:'neural',neural:o.glos};
  const neural={state:'off',worker:null,ctx:null,ready:null,pending:new Map(),seq:0,chain:null};
  const setState=s=>{ neural.state=s; emit('stan',s); };
  let sayTok=0, subTimer=null, mowi=false;
  const napis=t=>{ clearTimeout(subTimer); o.napis(t||''); };

  /* ----- model neuronowy w osobnym wątku ----- */
  function neuralInit(){
    if(neural.ready) return neural.ready;
    setState('loading');
    neural.ready=new Promise((res,rej)=>{
      let w; try{ w=new Worker(o.bazaGlosu+'tts-worker.js'); }catch(e){ setState('failed'); rej(e); return; }
      neural.worker=w;
      w.onmessage=e=>{
        const m=e.data||{};
        if(m.type==='progress') emit('postep',{zaladowano:m.loaded,razem:m.total,zPamieci:!!m.cached});
        else if(m.type==='ready'){ setState('ready'); res(); }
        else if(m.type==='error'&&m.id==null){ setState('failed'); rej(new Error(m.message)); }
        else if(m.id!=null){ const p=neural.pending.get(m.id); neural.pending.delete(m.id); if(p) (m.type==='audio'?p.res(m):p.rej(new Error(m.message))); }
      };
      w.onerror=ev=>{ setState('failed'); rej(new Error(ev.message||'Wątek głosu nie wystartował.')); };
      w.postMessage({type:'init',voice:voice.neural});
    });
    neural.ready.catch(()=>{ neural.ready=null; });
    return neural.ready;
  }
  function synthNeural(text,ids){ const id=++neural.seq; if(ids) ids.push(id); return new Promise((res,rej)=>{ neural.pending.set(id,{res,rej}); neural.worker.postMessage({type:'speak',id,text,rate:voice.rate}); }); }
  // łańcuch brzmienia: ciepły dół, przygaszona ostrość, delikatne „powietrze”, łagodna kompresja
  function voiceChain(ctx){
    if(neural.chain) return neural.chain;
    const f=(type,freq,gain,q)=>{const n=ctx.createBiquadFilter();n.type=type;n.frequency.value=freq;if(gain!=null)n.gain.value=gain;if(q!=null)n.Q.value=q;return n;};
    const hp=f('highpass',80,null,.7), lo=f('lowshelf',220,3), mid=f('peaking',3400,-4,1.4), hi=f('highshelf',9500,2.5);
    const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-20; comp.ratio.value=2.5; comp.attack.value=.008; comp.release.value=.15; comp.knee.value=6;
    const out=ctx.createGain(); out.gain.value=1.1;
    hp.connect(lo); lo.connect(mid); mid.connect(hi); hi.connect(comp); comp.connect(out); out.connect(ctx.destination);
    return neural.chain=hp;
  }

  /* ----- gotowe kwestie (nagrane z góry tym samym głosem) ----- */
  const lib={idx:null,pcm:null,loading:null};
  function loadLibrary(){
    if(lib.loading) return lib.loading;
    lib.loading=(async()=>{
      const [idx,buf]=await Promise.all([fetch(o.bazaGlosu+'frazy.json').then(r=>{if(!r.ok) throw new Error('frazy');return r.json();}),fetch(o.bazaGlosu+'frazy.wav').then(r=>{if(!r.ok) throw new Error('frazy');return r.arrayBuffer();})]);
      const dv=new DataView(buf); let p=12;
      while(p<dv.byteLength-8){
        const id=String.fromCharCode(dv.getUint8(p),dv.getUint8(p+1),dv.getUint8(p+2),dv.getUint8(p+3)), sz=dv.getUint32(p+4,true);
        if(id==='data'){ lib.pcm=new Int16Array(buf.slice(p+8,p+8+sz)); break; }
        p+=8+sz+(sz&1);
      }
      lib.idx=idx;
    })().catch(e=>{ lib.loading=null; throw e; });
    return lib.loading;
  }
  function libChunks(text){
    const L=lib.idx&&lib.idx.lines[text]; if(!L||!lib.pcm) return null;
    return L.map(c=>{ const s=lib.pcm.subarray(c.off,c.off+c.len), f=new Float32Array(c.len); for(let i=0;i<c.len;i++) f[i]=s[i]/32768;
      return {pcm:f,dur:Float32Array.from(c.dur),chars:[...c.chars],hop:lib.idx.hop,sampleRate:lib.idx.sampleRate,pre:c.pre,text:c.text,ms:0}; });
  }

  /* ----- silnik mowy: dźwięk rusza, gdy cała wypowiedź gotowa; zdania na osi czasu karty dźwiękowej ----- */
  const eng={tok:0,pend:[],busy:false,ready:[],open:false,hold:true,endAt:0,last:'',live:0,waiters:[],stats:[],sources:[],ids:[]};
  function speechDone(){ if(!eng.open&&!eng.pend.length&&!eng.busy&&!eng.ready.length&&eng.live===0){ const w=eng.waiters.splice(0); w.forEach(f=>f()); } }
  function waitSpeech(){ return new Promise(r=>{ eng.waiters.push(r); speechDone(); }); }
  function enqueueSpeech(text){ if(!text.trim()) return; eng.pend.push(text); pumpSpeech(); }
  async function pumpSpeech(){
    if(eng.busy) return; eng.busy=true; const tok=eng.tok;
    while(eng.pend.length&&tok===eng.tok){
      const text=eng.pend.shift(); let m;
      try{ m=await synthNeural(text,eng.ids); }catch(e){ continue; }
      if(tok!==eng.tok) break;
      m.text=text; eng.ready.push(m); flushSpeech();
    }
    if(tok===eng.tok){ eng.busy=false; flushSpeech(); speechDone(); }
  }
  function flushSpeech(){
    if(eng.hold){
      const buffered=eng.ready.reduce((a,m)=>a+m.pcm.length/m.sampleRate,0);
      // start dopiero gdy wszystko gotowe (albo zapas ≥ 6 s mowy przy długich odpowiedziach)
      if((!eng.open&&!eng.pend.length&&!eng.busy)||buffered>=6) eng.hold=false; else return;
    }
    while(eng.ready.length) scheduleSpeech(eng.ready.shift());
    speechDone();
  }
  function scheduleSpeech(m){
    const ctx=neural.ctx; if(!ctx) return;
    const sr=m.sampleRate, tr=trimSilence(m.pcm,sr);
    const buf=ctx.createBuffer(1,tr.pcm.length,sr); buf.copyToChannel(tr.pcm,0);
    const s=ctx.createBufferSource(); s.buffer=buf; s.connect(voiceChain(ctx));
    const now=ctx.currentTime, cont=eng.endAt>now-.05, gap=cont?pauseAfter(eng.last):0;
    const start=Math.max(now+.06, eng.endAt+gap);
    eng.stats.push({gap:+(start-Math.max(eng.endAt,now)).toFixed(3),late:eng.endAt>0&&cont===false&&eng.stats.length>0&&eng.last?+(now-eng.endAt).toFixed(3):0,synthMs:Math.round(m.ms||0),sec:+buf.duration.toFixed(2),lib:!m.ms});
    s.start(start); eng.endAt=start+buf.duration; eng.last=m.text||''; eng.live++;
    lip.segs.push({t0:start,dur:buf.duration,tl:lipTimeline(m,tr.offset+(m.pre||0),buf.duration,tr.pcm,start)});
    if(lip.segs.length>16) lip.segs.shift();
    s.onended=()=>{ eng.live--; const i=eng.sources.indexOf(s); if(i>=0) eng.sources.splice(i,1); speechDone(); };
    eng.sources.push(s);
  }
  function stopSpeech(){
    if(neural.worker&&eng.ids.length) neural.worker.postMessage({type:'cancel',ids:eng.ids.slice()});
    eng.ids=[]; eng.tok++; eng.pend=[]; eng.ready=[]; eng.busy=false; eng.open=false; eng.hold=true; eng.endAt=0; eng.last='';
    for(const s of eng.sources){ try{ s.onended=null; s.stop(); }catch(e){} }
    eng.sources=[]; eng.live=0; lip.segs=[]; speechDone();
    if(hasTTS) speechSynthesis.cancel();
  }
  const neuralOn=()=>voice.on&&voice.engine==='neural'&&neural.state==='ready'&&!!neural.ctx;

  async function prepareSpeech(text){
    if(!(voice.on&&voice.engine==='neural')) return null;
    const lc=libChunks(text); if(lc) return lc;
    if(neural.state!=='ready') return null;
    const out=[];
    for(const s of sentences(spokenPL(text))){ try{ const m=await synthNeural(s); m.text=s; out.push(m); }catch(e){ return null; } }
    return out;
  }
  async function say(text,prepared){
    stopSpeech(); const tok=++sayTok;
    napis(text);
    const fin=()=>{ if(tok===sayTok) subTimer=setTimeout(()=>o.napis(''),600); };
    if(voice.on&&voice.engine==='neural'&&neural.ctx){
      if(!lib.idx){ try{ await Promise.race([loadLibrary(),wait(5000)]); }catch(e){} if(tok!==sayTok) return; }
      const chunks=prepared||libChunks(text);
      if(chunks||neural.state==='ready'){
        await o.czekajNaSpoczynek(); if(tok!==sayTok) return;
        eng.open=false;
        if(chunks){ eng.ready.push(...chunks.map(c=>({...c}))); flushSpeech(); }
        else sentences(spokenPL(text)).forEach(enqueueSpeech);
        await waitSpeech(); fin(); return;
      }
    }
    if(voice.on&&hasTTS&&speechSynthesis.getVoices().length){
      const u=new SpeechSynthesisUtterance(text); u.lang='pl-PL'; if(voice.v) u.voice=voice.v; u.rate=voice.rate; u.pitch=voice.pitch;
      await new Promise(r=>{ u.onend=r; u.onerror=r; speechSynthesis.speak(u); }); fin(); return;
    }
    subTimer=setTimeout(()=>{ if(tok===sayTok) o.napis(''); },Math.max(2200,text.length*70));
  }
  // odpowiedź dopływająca kawałkami (czat): zdania liczone w trakcie, dźwięk rusza, gdy całość gotowa
  function speechStream(){
    stopSpeech(); const tok=++sayTok; let done=0;
    if(neuralOn()){ eng.open=true; o.czekajNaSpoczynek(); }
    return {
      dodaj(full){ if(tok!==sayTok) return; napis(full); if(!neuralOn()) return;
        const re=/[^.!?…]+[.!?…]+["”»]?(?=\s|$)/g; re.lastIndex=done; let m;
        while((m=re.exec(full))&&m.index>=done&&/\s/.test(full[re.lastIndex]||'')){ enqueueSpeech(spokenPL(m[0].trim())); done=re.lastIndex; } },
      async zakoncz(full){ if(tok!==sayTok) return; napis(full);
        if(neuralOn()){ const rest=full.slice(done).trim(); if(rest) sentences(spokenPL(rest)).forEach(enqueueSpeech); eng.open=false; flushSpeech(); await waitSpeech(); }
        else await say(full);
        if(tok===sayTok) subTimer=setTimeout(()=>o.napis(''),600); }
    };
  }

  /* ----- usta: prawdziwe klatki dolnej części twarzy, wyrównane do kadru bazowego -----
     Każda klatka ust ma POZĘ GŁOWY, z której pochodzi. Wklejamy tylko usta z klatek o pozie bliskiej
     obrazowi na ekranie — płaskie przekształcenie nie odda obrotu głowy w przestrzeni, więc usta z innej
     pozy byłyby krzywe (do 10°); przy bliskiej pozie błąd kąta < 1°. */
  const POSE_FREE=6, POSE_W=.03, POSE_MAX=16, K_CAND=64;
  const lip={img:null,lib:null,tory:{},segs:[],alpha:0,cur:-1,last:null,canvas:o.canvas,ctx:o.canvas?o.canvas.getContext('2d'):null,ready:null,fixes:0,frame:-1,diag:{n:0,off:0,maxOff:0}};
  lip.ready=(async()=>{ try{
    const [libj,track]=await Promise.all([fetch(o.bazaUst+'usta-klatki.json').then(r=>r.json()),fetch(o.bazaUst+'usta-tor.json').then(r=>r.json())]);
    const img=new Image(); img.src=o.bazaUst+'usta-klatki.webp'; await img.decode();
    lip.fps=track.fps||24;
    for(const k in track) if(Array.isArray(track[k])&&Array.isArray(track[k][0])) lip.tory[k]=track[k];   // tor dla każdego klipu (idle, kolejne pozy…)
    lip.track=lip.tory.idle;
    // lista klatek ust: prawdziwe (kafelek w swojej pozie) + wirtualne (kafelek z korektą, wpasowany w pozę kotwicy)
    const fr=libj.frames, V=libj.wirtualne||[], nR=fr.length, nE=nR+V.length;
    lip.etile=new Int16Array(nE); lip.emat=new Array(nE).fill(null); lip.open=new Float32Array(nE); lip.next=new Int16Array(nE); lip.real=new Uint8Array(nE);
    for(let e=0;e<nR;e++){ lip.etile[e]=e; lip.open[e]=fr[e].open; lip.next[e]=libj.next[e]; lip.real[e]=fr[e].kopia?0:1; }
    V.forEach((v,i)=>{ const e=nR+i; lip.etile[e]=v[0]; lip.emat[e]=v.slice(2,8); lip.open[e]=fr[v[0]].open; lip.next[e]=v[8]>=0?nR+v[8]:-1; });
    { let mi=0; for(let e=1;e<nR;e++) if(lip.real[e]&&lip.open[e]<lip.open[mi]) mi=e; lip.closed=mi; }
    const PL=track.poza&&track.poza.idle, PT=libj.poza;
    if(PL&&PT&&PT.length===nR){
      // odległość pozy: każda klatka ust × każda klatka pętli; dla każdej klatki pętli K najbliższych klatek ust
      const nL=PL.length, nT=nE, Dm=new Float32Array(nT*nL);
      const poseOf=e=>e<nR?(lip.real[e]?PT[e]:null):PL[V[e-nR][1]];   // wirtualna ma pozę swojej kotwicy; kopie tylko przez wirtualne
      for(let t=0;t<nT;t++){ const P=poseOf(t); for(let j=0;j<nL;j++){ if(!P){ Dm[t*nL+j]=1e6; continue; } let s=0; for(let d=0;d<P.length;d++){ const x=P[d]-PL[j][d]; s+=x*x; } Dm[t*nL+j]=Math.sqrt(s); } }
      const k=Math.min(K_CAND,nT), cand=new Int16Array(nL*k), clen=new Uint8Array(nL), ids=[...Array(nT).keys()];
      for(let j=0;j<nL;j++){ ids.sort((a,b)=>Dm[a*nL+j]-Dm[b*nL+j]); let n=0;
        for(let q=0;q<k;q++){ if(q>=6&&Dm[ids[q]*nL+j]>POSE_MAX) break; cand[j*k+q]=ids[q]; n++; } clen[j]=n; }
      lip.D=Dm; lip.nL=nL; lip.K=k; lip.cand=cand; lip.clen=clen;
    }
    lip.lib=libj; lip.img=img;
  }catch(e){ lip.img=null; } })();
  const poseCost=(f,j)=>{ const d=lip.D[f*lip.nL+j]; return d>POSE_FREE?(d-POSE_FREE)*POSE_W:0; };
  // dokładny czas WYŚWIETLANEJ klatki wideo (requestVideoFrameCallback), inaczej currentTime
  function videoTime(v){
    if(v.requestVideoFrameCallback&&!v.__mowaRvfc){ v.__mowaRvfc=true; const cb=(now,md)=>{ v.__mowaMT=md.mediaTime; v.__mowaAt=performance.now(); v.requestVideoFrameCallback(cb); }; v.requestVideoFrameCallback(cb); }
    if(v.__mowaMT!=null&&!v.paused&&performance.now()-v.__mowaAt<150&&Math.abs(v.__mowaMT-v.currentTime)<.3) return v.__mowaMT;
    return v.currentTime;
  }
  // które klatki pętli będą na ekranie w kolejnych krokach ust (od chwili `start` karty dźwiękowej)
  function predictFrames(start,n){
    const L=lip.nL, fps=lip.fps, dur=L/fps, w=o.wideo()||{}, now=neural.ctx.currentTime;
    const base=(w.klip==='idle'&&w.el?videoTime(w.el):0)+(start-now);   // inna scena → pętla zacznie od początku
    const js=new Int16Array(n);
    for(let i=0;i<n;i++){ let tt=(base+(i+.5)/LIP_FPS)%dur; if(tt<0) tt+=dur; js[i]=Math.min(L-1,Math.floor(tt*fps)); }
    return js;
  }
  // wybór klatek (Viterbi): koszt = różnica otwarcia + odejście od pozy na ekranie + skok między nienastępującymi klatkami
  function lipSelect(tg,js){
    const T=tg.length, open=lip.open, nx=lip.next, wt=tg.wt||new Float32Array(T).fill(1);
    const step=(cur,prev,cost,nc,back,t,pose,k)=>{
      for(let q=0;q<cur.length;q++){ const f=cur[q]; let best=1e9,bi=0;
        for(let r=0;r<prev.length;r++){ const g=prev[r]; const c=cost[r]+(nx[g]===f?0:(g===f?.03:.08+.25*Math.abs(open[g]-open[f]))); if(c<best){best=c;bi=r;} }
        nc[q]=best+wt[t]*Math.abs(open[f]-tg[t])+(pose?poseCost(f,js[t]):0); back[t*k+q]=bi; }
    };
    const pose=!!(lip.cand&&js), k=pose?lip.K:open.length;
    const all=Int16Array.from({length:open.length},(_,i)=>i).filter(e=>lip.real[e]);
    const setAt=t=>pose?lip.cand.subarray(js[t]*k,js[t]*k+lip.clen[js[t]]):all;
    let prev=setAt(0); const states=new Int16Array(T*k), back=new Int16Array(T*k);
    let cost=new Float32Array(k), nc=new Float32Array(k); states.set(prev,0);
    for(let q=0;q<prev.length;q++){ const f=prev[q]; cost[q]=wt[0]*Math.abs(open[f]-tg[0])+(pose?poseCost(f,js[0]):(f===lip.closed?0:.05)); }
    for(let t=1;t<T;t++){ const cur=setAt(t); states.set(cur,t*k); step(cur,prev,cost,nc,back,t,pose,k); const x=cost; cost=nc; nc=x; prev=cur; }
    let q=0; for(let r=1;r<prev.length;r++) if(cost[r]<cost[q]) q=r;
    const out=new Int16Array(T); for(let t=T-1;t>=0;t--){ out[t]=states[t*k+q]; q=back[t*k+q]; }
    return out;
  }
  function lipTimeline(m,offset,total,pcm,start){
    if(!lip.lib) return new Int16Array(Math.max(1,Math.ceil(total*LIP_FPS))).fill(-1);
    const tg=lipTargets(m,offset,total,pcm), js=lip.cand&&start!=null?predictFrames(start,tg.length):null;
    const tl=lipSelect(tg,js); tl.js=js; return tl;
  }
  // najbardziej zamknięte usta wśród klatek o pozie zgodnej z klatką pętli j
  function closedAt(j){ const k=lip.K, b=j*k; let best=lip.cand[b]; for(let q=1;q<lip.clen[j];q++){ const g=lip.cand[b+q]; if(lip.open[g]<lip.open[best]) best=g; } return best; }
  // zabezpieczenie przy rysowaniu: gdy wideo odjechało od przewidywania (przycięcie, przewinięcie),
  // klatkę ust z daleka w pozie zamieniamy na najbliższą w pozie o podobnym otwarciu
  function poseFix(f,j){
    if(f<0||!lip.cand||j<0) return f;
    const k=lip.K, b=j*k, lim=Math.max(POSE_MAX,lip.D[lip.cand[b+lip.clen[j]-1]*lip.nL+j])+3;   // granica doboru + zapas na ±1 klatkę
    if(lip.D[f*lip.nL+j]<=lim) return f; let best=lip.cand[b], bc=1e9;
    for(let q=0;q<lip.clen[j];q++){ const g=lip.cand[b+q], c=Math.abs(lip.open[g]-lip.open[f])+poseCost(g,j); if(c<bc){bc=c;best=g;} }
    lip.fixes++; return best;
  }
  function lipFrameAt(t){
    for(const s of lip.segs){ if(t>=s.t0&&t<s.t0+s.dur){ const pos=(t-s.t0)*LIP_FPS, k=Math.floor(pos), kk=Math.min(s.tl.length-1,k);
      return {a:s.tl[kk], b:s.tl[Math.min(s.tl.length-1,k+1)], f:pos-k, j:s.tl.js?s.tl.js[kk]:-1}; } }
    return null;
  }
  function drawLipTile(c,e,alpha,x0,y0,T){
    const L=lip.lib, tw=L.tileW, th=L.tileH, t=lip.etile[e], sx=(t%L.cols)*tw, sy=Math.floor(t/L.cols)*th, m=lip.emat[e];
    c.setTransform(T[0],T[1],T[2],T[3],T[4],T[5]); c.globalAlpha=alpha;
    if(m){ c.translate(x0,y0); c.transform(m[0],m[1],m[2],m[3],m[4],m[5]); c.drawImage(lip.img,sx,sy,tw,th,0,0,tw,th); }   // przeniesione usta: korekta do tej pozy
    else c.drawImage(lip.img,sx,sy,tw,th,x0,y0,tw,th);
  }
  function lipFrame(){
    requestAnimationFrame(lipFrame);
    const c=lip.ctx;
    // „mówi” = jest dźwięk teraz albo za chwilę (krótkie pauzy między zdaniami się nie liczą)
    const ct=neural.ctx?neural.ctx.currentTime:0, gra=eng.live>0&&lip.segs.some(s=>ct<s.t0+s.dur+.25);
    if(gra!==mowi){ mowi=gra; emit('mowi',mowi); }
    if(!lip.img||!c) return;
    const w=o.wideo()||{}, v=w.el, track=w.klip&&lip.tory[w.klip];
    let speaking=false, fa=lip.closed, fb=lip.closed, ff=0, pj=-1;
    if(track&&lip.segs.length&&neural.ctx){
      const x=lipFrameAt(ct+o.wyprzedzenie);   // obraz wyprzedza dźwięk o 40 ms
      if(x&&x.a>=0){ speaking=true; fa=x.a; fb=x.b; ff=x.f; pj=x.j; }
      else if(lip.segs.some(s=>ct<s.t0+s.dur+.25)) speaking=true;
    }
    const fi=track&&v?Math.min(track.length-1,Math.max(0,Math.round(videoTime(v)*lip.fps))):-1, tr=fi>=0?track[fi]:null;
    lip.frame=fi;
    if(pj>=0&&fi>=0){ let d=Math.abs(pj-fi); d=Math.min(d,lip.nL-d); const g=lip.diag; g.n++; g.off+=d; g.maxOff=Math.max(g.maxOff,d); }   // trafność przewidywania klatki
    if(!tr||tr[3]<.6) speaking=false;
    lip.alpha+=((speaking?1:0)-lip.alpha)*(speaking?.4:.15);
    if(lip.last){ c.setTransform(1,0,0,1,0,0); c.clearRect(lip.last[0]-14,lip.last[1]-14,lip.last[2]+28,lip.last[3]+28); lip.last=null; }
    if(lip.alpha<.02||!tr) return;
    const L=lip.lib, x0=L.x0, y0=L.y0, tw=L.tileW, th=L.tileH;
    const [A,B,Cc,D,E,F]=tr[5];
    let bx0=1e9,by0=1e9,bx1=-1e9,by1=-1e9;
    for(const X of [x0,x0+tw]) for(const Y of [y0,y0+th]){ const u=A*X+Cc*Y+E, q=B*X+D*Y+F; bx0=Math.min(bx0,u); by0=Math.min(by0,q); bx1=Math.max(bx1,u); by1=Math.max(by1,q); }
    lip.last=[bx0,by0,bx1-bx0,by1-by0];
    c.setTransform(A,B,Cc,D,E,F);
    if(!speaking){ fa=fb=lip.cur>=0?lip.cur:lip.closed; ff=0; }
    if(w.klip==='idle'&&lip.cand&&fi>=0){
      if(speaking&&pj<0){ fa=fb=closedAt(fi); ff=0; }   // krótka pauza między zdaniami: zamknięte usta w tej samej pozie
      else { fa=poseFix(fa,fi); fb=poseFix(fb,fi); }
    }
    drawLipTile(c,fa,lip.alpha,x0,y0,tr[5]);
    if(fb!==fa&&ff>.05) drawLipTile(c,fb,lip.alpha*ff,x0,y0,tr[5]);   // przejście do następnej prawdziwej klatki
    lip.cur=fa; c.globalAlpha=1; c.setTransform(1,0,0,1,0,0);
  }
  requestAnimationFrame(lipFrame);

  /* ----- interfejs ----- */
  function glosySystemowe(){ voice.list=hasTTS?speechSynthesis.getVoices().filter(v=>/^pl/i.test(v.lang)):[]; return voice.list; }
  const api={
    powiedz:(tekst,o2)=>say(String(tekst||''),o2&&o2.przygotowane||undefined),
    strumien:speechStream,
    przygotuj:t=>prepareSpeech(t).catch(()=>null),
    stop(){ sayTok++; stopSpeech(); },
    on(n,f){ (zd[n]=zd[n]||[]).push(f); return ()=>{ zd[n]=(zd[n]||[]).filter(x=>x!==f); }; },
    get zajeta(){ return eng.live>0||eng.busy||eng.pend.length>0||eng.ready.length>0; },
    get mowi(){ return mowi; },
    get wlaczona(){ return voice.on; },
    get stan(){ return neural.state; },
    get silnik(){ return voice.engine; },
    get glos(){ return voice.neural; },
    // w kliknięciu: kontekst audio (odblokowuje dźwięk), gotowe kwestie od razu, model w tle
    async wlacz(){
      try{ neural.ctx=neural.ctx||new (global.AudioContext||global.webkitAudioContext)(); await neural.ctx.resume(); }catch(e){}
      voice.on=true;
      const model=voice.engine==='neural'&&neural.state!=='ready'?neuralInit():Promise.resolve();
      model.then(()=>{ setTimeout(()=>{ if(neural.state==='ready') synthNeural('Dzień dobry.').catch(()=>{}); },1500); }).catch(()=>{});   // rozgrzewka po cichu
      let biblioteka=false; try{ await loadLibrary(); biblioteka=true; }catch(e){}
      return {biblioteka,model};
    },
    wylacz(){ voice.on=false; api.stop(); napis(''); },
    // przełączenie na syntezator systemu (gdy model nie wstał); false = brak polskich głosów
    naSystem(){ if(hasTTS&&glosySystemowe().length){ voice.engine='system'; if(!voice.list.includes(voice.v)) voice.v=voice.list[0]||null; return true; } return false; },
    ustawGlos(nazwa){
      if(nazwa==='mai'||nazwa==='gosia'){
        voice.engine='neural';
        if(nazwa!==voice.neural){ voice.neural=nazwa; neural.worker?.terminate(); neural.worker=null; neural.ready=null; setState('off');
          if(voice.on) return neuralInit(); }
        return Promise.resolve();
      }
      voice.engine='system'; voice.v=nazwa||null; return Promise.resolve();
    },
    ustaw(p){ if(p.tempo!=null) voice.rate=p.tempo; if(p.wysokosc!=null) voice.pitch=p.wysokosc; },
    glosySystemowe,
    gotoweUsta:()=>lip.ready,
    // dla testów i diagnostyki
    wnetrze:{eng,neural,lip,lib,voice,lipFrameAt,poseFix,predictFrames,videoTime,lipShapeAt:t=>{ const x=lipFrameAt(t); return x?x.a:null; },lipTimeline,trimSilence,phonesFromChars,synthNeural,loadLibrary}
  };
  if(hasTTS) speechSynthesis.addEventListener?.('voiceschanged',()=>emit('glosy',glosySystemowe()));
  return api;
}

global.EgzoMowa={utworz,liczba:numPL,mowione:spokenPL,zdania:sentences,wersja:'1.0'};
})(typeof window!=='undefined'?window:globalThis);
