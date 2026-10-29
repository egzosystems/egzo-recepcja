/* EGZO Recepcja — wersja samodzielna (poza aplikacją Claude: Chrome/Safari na telefonie, tablecie, komputerze).
   W Claude strona dostaje window.claude od aplikacji. Tutaj — tylko gdy strona jest otwarta bezpośrednio (nie w ramce)
   i nie ma window.claude — podstawiamy te same funkcje:
     sample    → darmowy Google Gemini (klucz AIza…) albo Claude przez API Anthropic (sk-ant-…), kluczem szefa (zapisany TYLKO w tej przeglądarce; strona nigdzie go nie wysyła poza api.anthropic.com)
     db        → pamięć przeglądarki (rozmowy, dokumenty, zadania, przypomnienia, pamięć zostają na tym urządzeniu)
     downloads → zwykłe pobranie pliku
     mcp (Gmail) → niedostępny w tej wersji (poczta działa w wersji w Claude i przez agentów)
   Mikrofon: strona otwarta bezpośrednio ma normalny dostęp — działa nasłuch „Hej, Egzo”. */
(function(){
  if (window.claude || window.top !== window) return;
  const KLUCZ = 'egzo-klucz-api', MODEL = {quick:'claude-haiku-5-5', default:'claude-sonnet-5-5', complex:'claude-opus-5-5'};
  const klucz = () => { try { return localStorage.getItem(KLUCZ) || ''; } catch (e) { return ''; } };
  const blad = (code, message) => Object.assign(new Error(message || code), {code, message: message || code});

  async function doBase64(blob){ const b = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }

  // jedno wywołanie API ze strumieniem; zwraca {content:[bloki], stop}
  async function wywolaj(body, signal, naTekst){
    let r;
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {method:'POST', signal,
        headers:{'content-type':'application/json','x-api-key':klucz(),'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body: JSON.stringify(Object.assign({stream:true}, body))});
    } catch (e) { if (e && e.name === 'AbortError') throw blad('cancelled'); throw blad('network', 'Brak połączenia z Claude.'); }
    if (!r.ok) {
      let m = ''; try { m = (await r.json()).error.message; } catch (e) {}
      if (r.status === 401 || r.status === 403) throw blad('not_granted', 'Klucz API jest nieprawidłowy.');
      if (r.status === 429 || r.status === 529) throw blad('rate_limited', m);
      throw blad('error', m || ('HTTP ' + r.status));
    }
    const czyt = r.body.getReader(), dek = new TextDecoder(); let bufor = '', stop = null; const bloki = [];
    for (;;) {
      const {done, value} = await czyt.read(); if (done) break;
      bufor += dek.decode(value, {stream:true}); let k;
      while ((k = bufor.indexOf('\n\n')) >= 0) {
        const zd = bufor.slice(0, k); bufor = bufor.slice(k + 2);
        const linia = zd.split('\n').find(l => l.startsWith('data:')); if (!linia) continue;
        let ev; try { ev = JSON.parse(linia.slice(5)); } catch (e) { continue; }
        if (ev.type === 'content_block_start') { const b = Object.assign({}, ev.content_block); if (b.type === 'tool_use') b._json = ''; bloki[ev.index] = b; }
        else if (ev.type === 'content_block_delta') { const b = bloki[ev.index]; if (!b) continue;
          if (ev.delta.type === 'text_delta') { b.text = (b.text || '') + ev.delta.text; naTekst(ev.delta.text); }
          else if (ev.delta.type === 'input_json_delta') b._json += ev.delta.partial_json; }
        else if (ev.type === 'content_block_stop') { const b = bloki[ev.index]; if (b && b.type === 'tool_use') { try { b.input = b._json ? JSON.parse(b._json) : {}; } catch (e) { b.input = {}; } delete b._json; } }
        else if (ev.type === 'message_delta') stop = ev.delta && ev.delta.stop_reason;
        else if (ev.type === 'error') throw blad(ev.error && ev.error.type === 'overloaded_error' ? 'rate_limited' : 'error', ev.error && ev.error.message);
      }
    }
    return {content: bloki.filter(Boolean).filter(b => b.type !== 'thinking'), stop};
  }

  async function sample(input, opts){
    opts = opts || {};
    if (!klucz()) throw blad('not_granted', 'Brak klucza API.');
    if (/^(AIza|AQ\.)/.test(klucz())) return sampleGemini(input, opts);
    let msgs = typeof input === 'string' ? [{role:'user', content:input}] : input.map(m => ({role:m.role, content:m.content}));
    // API wymaga naprzemienności i startu od użytkownika — scalamy sąsiednie wiadomości tej samej roli
    const scal = []; for (const m of msgs) { if (!m.content) continue; const p = scal[scal.length - 1];
      if (p && p.role === m.role && typeof p.content === 'string' && typeof m.content === 'string') p.content += '\n\n' + m.content; else scal.push(Object.assign({}, m)); }
    while (scal.length && scal[0].role !== 'user') scal.shift();
    msgs = scal;
    if (opts.images && opts.images.length) {
      const ost = msgs[msgs.length - 1], cz = [];
      for (const im of opts.images) cz.push({type:'image', source:{type:'base64', media_type: im.type || 'image/jpeg', data: await doBase64(im)}});
      cz.push({type:'text', text: typeof ost.content === 'string' ? ost.content : JSON.stringify(ost.content)}); ost.content = cz;
    }
    const narzedzia = (opts.tools || []).map(t => ({name:t.name, description:t.description || '', input_schema: t.inputSchema || {type:'object', properties:{}}}));
    const model = MODEL[opts.modelTier] || MODEL.default;
    let caly = '';
    const naTekst = d => { caly += d; if (opts.onText) try { opts.onText({text: caly, delta: d}); } catch (e) {} };
    for (let krok = 0; krok < 10; krok++) {
      if (krok && caly && !/\s$/.test(caly)) naTekst(' ');
      const body = {model, max_tokens: 2048, messages: msgs}; if (narzedzia.length) body.tools = narzedzia;
      const odp = await wywolaj(body, opts.signal, naTekst);
      if (odp.stop !== 'tool_use') break;
      msgs.push({role:'assistant', content: odp.content});
      const wyniki = [];
      for (const b of odp.content) { if (b.type !== 'tool_use') continue; const t = (opts.tools || []).find(x => x.name === b.name);
        try { const w = t ? await t.execute(b.input || {}) : {blad:'nieznane narzędzie'}; wyniki.push({type:'tool_result', tool_use_id:b.id, content: JSON.stringify(w === undefined ? null : w).slice(0, 20000)}); }
        catch (e) { wyniki.push({type:'tool_result', tool_use_id:b.id, is_error:true, content: String(e && e.message || e)}); } }
      msgs.push({role:'user', content: wyniki});
    }
    return {text: caly.trim(), truncated: false, modelApplied: model};
  }

  /* ---- Google Gemini (darmowy klucz z aistudio.google.com) — ten sam interfejs co sample ---- */
  const GEM_MODELE = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];
  let gemModel = null; try { gemModel = localStorage.getItem('egzo-gemini-model'); } catch (e) {}
  function schemat(x){ if (!x || typeof x !== 'object') return x; if (Array.isArray(x)) return x.map(schemat);
    const o = {}; for (const k of ['type','description','enum','properties','required','items','nullable','format']) if (x[k] !== undefined) o[k] = k === 'properties' ? Object.fromEntries(Object.entries(x.properties).map(([n, v]) => [n, schemat(v)])) : k === 'items' ? schemat(x.items) : x[k];
    if (o.type === 'object' && o.properties && !Object.keys(o.properties).length) { delete o.properties; } return o; }
  async function gemWywolaj(model, body, signal, naTekst){
    let r;
    try { r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':streamGenerateContent?alt=sse', {method:'POST', signal,
      headers:{'content-type':'application/json','x-goog-api-key':klucz()}, body: JSON.stringify(body)}); }
    catch (e) { if (e && e.name === 'AbortError') throw blad('cancelled'); throw blad('network', 'Brak połączenia z Gemini.'); }
    if (!r.ok) { let m = ''; try { m = (await r.json()).error.message; } catch (e) {}
      if (r.status === 404) throw blad('model', m);
      if (r.status === 429) throw blad('rate_limited', 'Darmowy limit Gemini na teraz się wyczerpał — spróbuj za chwilę.');
      if (r.status === 400 && /API key|API_KEY/i.test(m) || r.status === 401 || r.status === 403) throw blad('not_granted', 'Klucz Gemini jest nieprawidłowy.');
      throw blad(r.status === 400 ? 'bad_request' : 'error', m || ('HTTP ' + r.status)); }
    const czyt = r.body.getReader(), dek = new TextDecoder(); let bufor = ''; const czesci = [];
    for (;;) { const {done, value} = await czyt.read(); if (done) break; bufor += dek.decode(value, {stream:true}).replace(/\r/g, ''); let k;
      while ((k = bufor.indexOf('\n\n')) >= 0) { const zd = bufor.slice(0, k); bufor = bufor.slice(k + 2);
        const linia = zd.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join(''); if (!linia.trim()) continue;
        let ev; try { ev = JSON.parse(linia); } catch (e) { continue; }
        const c = ev.candidates && ev.candidates[0]; if (!c || !c.content || !c.content.parts) continue;
        for (const cz of c.content.parts) { czesci.push(cz); if (cz.text && !cz.thought) naTekst(cz.text); } } }
    return czesci;
  }
  async function sampleGemini(input, opts){
    const msgs = typeof input === 'string' ? [{role:'user', content:input}] : input;
    const contents = [];
    for (const m of msgs) { if (!m.content) continue; const rola = m.role === 'assistant' ? 'model' : 'user'; const tekst = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      const p = contents[contents.length - 1]; if (p && p.role === rola) p.parts.push({text: '\n\n' + tekst}); else contents.push({role: rola, parts:[{text: tekst}]}); }
    while (contents.length && contents[0].role !== 'user') contents.shift();
    if (opts.images && opts.images.length) { const ost = contents[contents.length - 1];
      for (const im of opts.images) ost.parts.unshift({inlineData:{mimeType: im.type || 'image/jpeg', data: await doBase64(im)}}); }
    const tools = (opts.tools || []).length ? [{functionDeclarations: opts.tools.map(t => { const d = {name:t.name, description:t.description || ''}; const sc = schemat(t.inputSchema); if (sc && sc.properties) d.parameters = sc; return d; })}] : undefined;
    let caly = ''; const naTekst = d => { caly += d; if (opts.onText) try { opts.onText({text: caly, delta: d}); } catch (e) {} };
    let modele = gemModel ? [gemModel, ...GEM_MODELE.filter(x => x !== gemModel)] : GEM_MODELE.slice(), myslenie = true;
    for (let krok = 0; krok < 10; krok++) {
      if (krok && caly && !/\s$/.test(caly)) naTekst(' ');
      let czesci;
      for (;;) {
        const body = {contents}; if (tools) body.tools = tools;
        if (myslenie) body.generationConfig = {thinkingConfig:{thinkingBudget: 0}};
        try { czesci = await gemWywolaj(modele[0], body, opts.signal, naTekst); if (gemModel !== modele[0]) { gemModel = modele[0]; try { localStorage.setItem('egzo-gemini-model', gemModel); } catch (e) {} } break; }
        catch (e) { if (e.code === 'model' && modele.length > 1) { modele.shift(); continue; }
          if (e.code === 'bad_request' && myslenie) { myslenie = false; continue; } throw e; }
      }
      const wywolania = czesci.filter(c => c.functionCall);
      if (!wywolania.length) break;
      contents.push({role:'model', parts: czesci});
      const odp = [];
      for (const c of wywolania) { const t = (opts.tools || []).find(x => x.name === c.functionCall.name); let w;
        try { w = t ? await t.execute(c.functionCall.args || {}) : {blad:'nieznane narzędzie'}; } catch (e) { w = {blad: String(e && e.message || e)}; }
        odp.push({functionResponse:{name: c.functionCall.name, response: (w && typeof w === 'object' && !Array.isArray(w)) ? w : {wynik: w === undefined ? null : w}}}); }
      contents.push({role:'user', parts: odp});
    }
    return {text: caly.trim(), truncated: false, modelApplied: gemModel};
  }
  sample.json = async (input, opts) => { const r = await sample(input, opts); const t = r.text;
    const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); const s = m ? m[1] : t; const i = s.search(/[\[{]/);
    try { return JSON.parse(i >= 0 ? s.slice(i, Math.max(s.lastIndexOf('}'), s.lastIndexOf(']')) + 1) : s); } catch (e) { throw blad('error', 'Odpowiedź nie była JSON-em.'); } };
  sample.limits = async () => ({tools: true, images:{mediaTypes:['image/jpeg','image/png','image/gif','image/webp']}});

  /* ---- baza na urządzeniu (to samo API, którego używa strona: collection/doc/orderBy/limit/get/set/update/delete/onSnapshot) ---- */
  const PRE = 'egzo-db:', sluch = {};
  const czytaj = p => { try { const v = localStorage.getItem(PRE + p); return v ? JSON.parse(v) : undefined; } catch (e) { return undefined; } };
  const zapisz = (p, v) => { try { if (v === undefined) localStorage.removeItem(PRE + p); else localStorage.setItem(PRE + p, JSON.stringify(v)); } catch (e) { throw blad('error', 'Brak miejsca w pamięci przeglądarki.'); }
    (sluch[p] || []).forEach(f => { try { f(snapDoc(p)); } catch (e) {} }); };
  const snapDoc = p => { const v = czytaj(p); return {id: p.split('/').pop(), exists: v !== undefined, data: () => v === undefined ? undefined : JSON.parse(JSON.stringify(v))}; };
  function dok(p){ return {id: p.split('/').pop(), path: p,
    get: async () => snapDoc(p), set: async v => zapisz(p, v), update: async v => zapisz(p, Object.assign({}, czytaj(p) || {}, v)), delete: async () => zapisz(p, undefined),
    onSnapshot(fn){ (sluch[p] = sluch[p] || []).push(fn); setTimeout(() => fn(snapDoc(p)), 0); return () => { sluch[p] = (sluch[p] || []).filter(x => x !== fn); }; }}; }
  function zbior(p, por, lim){ return {path: p,
    doc: id => dok(p + '/' + (id || (Date.now() + '-' + Math.random().toString(36).slice(2, 8)))),
    orderBy: (pole, kier) => zbior(p, {pole, kier: kier || 'asc'}, lim), limit: n => zbior(p, por, n),
    async get(){ const docs = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i);
        if (k && k.startsWith(PRE + p + '/') && !k.slice((PRE + p + '/').length).includes('/')) docs.push(snapDoc(k.slice(PRE.length))); }
      if (por) docs.sort((a, b) => { const x = (a.data() || {})[por.pole], y = (b.data() || {})[por.pole]; const c = x < y ? -1 : x > y ? 1 : 0; return por.kier === 'desc' ? -c : c; });
      const d = lim ? docs.slice(0, lim) : docs; return {docs: d, empty: !d.length, size: d.length}; }}; }
  const db = {collection: p => zbior(p), doc: p => dok(p)};

  const downloads = {async save({filename, data}){ const b = data instanceof Blob ? data : new Blob([data], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = filename || 'plik'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); return {saved: true}; }};

  const sluzby = {sample: () => klucz() ? sample : null, db: () => db, downloads: () => downloads, user: () => ({isOwner: () => true, canEdit: () => true, can: () => true, id: async () => 'szef', me: async () => ({id:'szef', name:'Szef'})})};
  window.claude = {use: async nazwa => { const f = sluzby[nazwa]; return f ? f() : null; }};
  window.EGZO_SAMODZIELNA = true;

  /* ---- ustawienie klucza (pierwsze uruchomienie) + aplikacja na ekran główny ---- */
  function panelKlucza(){
    const cel = document.getElementById('chatForm'); if (!cel || document.getElementById('kluczPanel')) return;
    const p = document.createElement('div'); p.id = 'kluczPanel'; p.className = 'hint';
    p.style.cssText = 'margin:6px 0 8px;padding:10px;border:1px solid rgba(201,164,92,.5);border-radius:10px;display:grid;gap:6px';
    const ma = !!klucz();
    p.innerHTML = ma
      ? '<span>Wersja na telefon: rozmowa przez klucz '+(/^(AIza|AQ\.)/.test(klucz())?'Google Gemini (darmowy)':'Claude')+', zapisany tylko na tym urządzeniu. Poczta działa w wersji w Claude.</span>'+'<button type="button" class="btn" id="kluczZmien" style="justify-self:start">Zmień albo usuń klucz</button>'
      : '<b>Pierwsze uruchomienie na tym urządzeniu</b><span>Wklej darmowy klucz Google Gemini (aistudio.google.com/apikey → Create API key, bez karty) albo płatny klucz Claude (sk-ant-…). Klucz zostaje tylko w tej przeglądarce.</span><input type="password" id="kluczPole" placeholder="AQ.… / AIza… (Gemini) albo sk-ant-… (Claude)" autocomplete="off" style="width:100%;box-sizing:border-box;background:#0f0e0c;color:inherit;border:1px solid rgba(201,164,92,.45);border-radius:8px;padding:10px;font:inherit"><button type="button" class="btn pri" id="kluczZapisz" style="justify-self:start">Zapisz i uruchom</button>';
    cel.parentNode.insertBefore(p, cel);
    const w = document.createElement('div'); w.style.cssText = 'opacity:.55;font-size:11px'; w.textContent = 'wersja na telefon: 2026-10-29 e'; p.appendChild(w);
    const z = document.getElementById('kluczZapisz');
    const pole = document.getElementById('kluczPole');
    const wyluskaj = v => { const m = String(v || '').match(/AIza[0-9A-Za-z_\-]{30,}|AQ\.[0-9A-Za-z_.\-]{30,}|sk-ant-[0-9A-Za-z_\-]{20,}/); return m ? m[0] : ''; };
    const zapiszKlucz = () => { const k = wyluskaj(pole.value);
      if (!k) { const sp = p.querySelector('span'); sp.textContent = 'To nie wygląda na klucz: Gemini zaczyna się od „AIza” albo „AQ.”, Claude od „sk-ant-”. Skopiuj go jeszcze raz ikoną kopiowania.'; sp.style.color = '#e0a060'; return; }
      try { localStorage.setItem(KLUCZ, k); } catch (e) {} p.innerHTML = '<b>Klucz zapisany — uruchamiam…</b>'; setTimeout(() => location.reload(), 300); };
    if (z) { z.onclick = zapiszKlucz; z.addEventListener('pointerup', zapiszKlucz); }
    if (pole) { pole.addEventListener('input', () => { if (wyluskaj(pole.value)) zapiszKlucz(); });   // wklejenie wystarczy
      pole.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); zapiszKlucz(); } }); }
    const zm = document.getElementById('kluczZmien');
    if (zm) zm.onclick = () => { try { localStorage.removeItem(KLUCZ); } catch (e) {} location.reload(); };
  }
  function aplikacja(){
    const m = document.createElement('link'); m.rel = 'manifest'; m.href = 'manifest.webmanifest'; document.head.appendChild(m);
    const ap = document.createElement('meta'); ap.name = 'apple-mobile-web-app-capable'; ap.content = 'yes'; document.head.appendChild(ap);
    const ik = document.createElement('link'); ik.rel = 'apple-touch-icon'; ik.href = 'media/ikona-192.png'; document.head.appendChild(ik);
  }
  aplikacja();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', panelKlucza); else panelKlucza();
})();
