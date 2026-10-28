/* Głos asystentki EGZO generowany w przeglądarce (działa też w aplikacji Claude).
 *  - „mai”   (domyślny): Coqui VITS pl, kobiecy, wejście = litery (bez słownika wymowy)
 *  - „gosia” (zapasowy): Piper pl_PL, wejście = fonemy z espeak-ng (WASM, słownik tylko polski)
 * Model pobierany w częściach, po pierwszym razie trzymany w IndexedDB.
 *
 * Wiadomości:  {type:'init',voice} -> {type:'progress',loaded,total,cached} ... {type:'ready'} | {type:'error',message}
 *              {type:'speak',id,text,rate,noise?,noiseW?} -> {type:'audio',id,pcm,dur,chars,hop,ms,sampleRate} | {type:'error',id,message}
 *              dur/chars: czas (w ramkach hop) każdego znaku wejścia, także pustych przerw „_” — do synchronizacji ust
 */
const BASE = self.location.href.replace(/[^/]*$/, '');
const VOICES = {
  mai:   { key: 'mai-female-v2-dur', parts: 6, file: i => 'mai-' + i + '.bin.wasm', sr: 22050, noise: 0.45, length: 1.15, noiseW: 0.6, kind: 'graphemes' },
  gosia: { key: 'gosia-medium-v1', parts: 5, file: i => 'gosia-' + i + '.bin.wasm', sr: 22050, noise: 0.45, length: 1.15, noiseW: 0.6, kind: 'phonemes' },
};
let V = null, session = null, initP = null, tokens = null, phWasm = null, phData = null;

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('egzo-voice', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  try { const db = await idb(); return await new Promise(res => { const q = db.transaction('blobs').objectStore('blobs').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); }
  catch (e) { return null; }
}
async function idbPut(k, v) {
  try { const db = await idb(); await new Promise(res => { const t = db.transaction('blobs', 'readwrite'); t.objectStore('blobs').put(v, k); t.oncomplete = res; t.onerror = res; }); }
  catch (e) { /* bez pamięci: następnym razem pobierze ponownie */ }
}

async function loadModel() {
  const cached = await idbGet(V.key);
  if (cached) { postMessage({ type: 'progress', loaded: 1, total: 1, cached: true }); return new Uint8Array(cached); }
  const parts = []; let total = 0;
  for (let i = 0; i < V.parts; i++) {
    const r = await fetch(BASE + V.file(i));
    if (!r.ok) throw new Error('Nie udało się pobrać modelu głosu (część ' + (i + 1) + ').');
    const b = new Uint8Array(await r.arrayBuffer()); parts.push(b); total += b.length;
    postMessage({ type: 'progress', loaded: i + 1, total: V.parts });
  }
  const buf = new Uint8Array(total); let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  idbPut(V.key, buf.buffer);
  return buf;
}

function loadScript(local, remote) {
  try { importScripts(BASE + local); }
  catch (e) { if (!remote) throw e; importScripts(remote); }
}

async function init(voice) {
  V = VOICES[voice] || VOICES.mai;
  loadScript('ort.wasm-core.min.js', 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort.wasm-core.min.js');
  ort.env.wasm.wasmPaths = BASE;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  if (V.kind === 'graphemes') {
    const txt = await fetch(BASE + 'mai-tokens.txt').then(r => r.text());
    tokens = new Map();
    for (const line of txt.split('\n')) {
      if (!line) continue;
      const i = line.lastIndexOf(' ');
      tokens.set(i === 0 ? ' ' : line.slice(0, i), +line.slice(i + 1));
    }
  } else {
    loadScript('piper_phonemize.js');
    [phWasm, phData] = await Promise.all([
      fetch(BASE + 'piper_phonemize.wasm').then(r => r.arrayBuffer()),
      fetch(BASE + 'piper_phonemize.data.wasm').then(r => r.arrayBuffer()),
    ]);
  }
  const model = await loadModel();
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

function graphemeIds(text) {
  const blank = tokens.get('<BLNK>'); const ids = [], chars = [];
  for (const ch of text.toLowerCase().replace(/\s+/g, ' ')) {
    if (tokens.has(ch)) { ids.push(blank, tokens.get(ch)); chars.push('_', ch); }
  }
  ids.push(blank); chars.push('_');
  return { ids, chars };
}

async function phonemeIds(text) {
  let out = '';
  const mod = await createPiperPhonemize({ print: s => { out += s; }, printErr: () => {}, wasmBinary: phWasm, getPreloadedPackage: () => phData, locateFile: f => BASE + f });
  mod.callMain(['-l', 'pl', '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  return JSON.parse(out).phoneme_ids;
}

const i64 = a => new ort.Tensor('int64', BigInt64Array.from(a.map(BigInt)), [a.length]);

async function synth(text, rate, noise, noiseW) {
  let ids, chars = null;
  if (V.kind === 'graphemes') { const g = graphemeIds(text); ids = g.ids; chars = g.chars; }
  else ids = await phonemeIds(text);
  if (!ids || ids.length < 3) throw new Error('Pusty tekst.');
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: i64([ids.length]),
    scales: new ort.Tensor('float32', Float32Array.from([noise ?? V.noise, V.length / (rate || 1), noiseW ?? V.noiseW]), [3]),
  };
  if (session.inputNames.includes('sid')) feeds.sid = i64([0]);
  if (session.inputNames.includes('langid')) feeds.langid = i64([0]);
  const t0 = performance.now();
  const res = await session.run(feeds);
  const pcm = new Float32Array(res['output'].data);
  // czasy znaków (ramki po 256 próbek) — wyjście dodane do modelu Mai
  const durT = res['/Ceil_output_0'];
  const dur = durT ? Float32Array.from(durT.data) : null;
  let peak = 0; for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  if (peak > 0) { const g = 0.8 / peak; for (let i = 0; i < pcm.length; i++) pcm[i] *= g; }
  return { pcm, dur, chars, hop: 256, ms: performance.now() - t0 };
}

self.onmessage = async e => {
  const m = e.data || {};
  if (m.type === 'init') {
    try { initP = initP || init(m.voice); await initP; postMessage({ type: 'ready' }); }
    catch (err) { initP = null; postMessage({ type: 'error', message: String(err && err.message || err) }); }
  } else if (m.type === 'cancel') {
    if (m.upTo) cancelUpTo = Math.max(cancelUpTo, m.upTo);
    if (m.ids) for (const id of m.ids) cancelled.add(id);
  } else if (m.type === 'speak') {
    // jedna synteza naraz (sesja ONNX nie obsługuje równoległych wywołań); przerwane wypowiedzi pomijane
    chain = chain.then(async () => {
      if (m.id <= cancelUpTo || cancelled.has(m.id)) { cancelled.delete(m.id); postMessage({ type: 'error', id: m.id, message: 'anulowano' }); return; }
      try {
        await initP;
        const r = await synth(m.text, m.rate, m.noise, m.noiseW);
        postMessage({ type: 'audio', id: m.id, pcm: r.pcm, dur: r.dur, chars: r.chars, hop: r.hop, ms: r.ms, sampleRate: V.sr }, [r.pcm.buffer]);
      } catch (err) { postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) }); }
    });
  }
};
let chain = Promise.resolve(), cancelUpTo = 0; const cancelled = new Set();
