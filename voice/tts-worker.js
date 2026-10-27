/* Głos asystentki EGZO: neuronowy syntezator Piper (pl_PL „gosia”) w przeglądarce.
 * Wątek roboczy: wymowa (espeak-ng w WASM, tylko polski) -> identyfikatory fonemów -> model VITS (onnxruntime-web)
 * -> próbki audio 22 050 Hz odsyłane do strony. Model trzymany w IndexedDB po pierwszym pobraniu.
 *
 * Wiadomości:  {type:'init'} -> {type:'progress',loaded,total} ... {type:'ready'} | {type:'error',message}
 *              {type:'speak',id,text,rate} -> {type:'audio',id,pcm:Float32Array,sampleRate} | {type:'error',id,message}
 */
const BASE = self.location.href.replace(/[^/]*$/, '');
const MODEL_KEY = 'gosia-medium-v1';
const MODEL_PARTS = 5;
const CFG = { sampleRate: 22050, noise: 0.667, lengthScale: 1.0, noiseW: 0.8 };

let session = null, wasmBin = null, dataBin = null, initP = null;

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
  const cached = await idbGet(MODEL_KEY);
  if (cached) { postMessage({ type: 'progress', loaded: 1, total: 1, cached: true }); return new Uint8Array(cached); }
  const parts = []; let total = 0;
  for (let i = 0; i < MODEL_PARTS; i++) {
    const r = await fetch(BASE + 'gosia-' + i + '.bin.wasm');
    if (!r.ok) throw new Error('Nie udało się pobrać modelu głosu (część ' + (i + 1) + ').');
    const b = new Uint8Array(await r.arrayBuffer()); parts.push(b); total += b.length;
    postMessage({ type: 'progress', loaded: i + 1, total: MODEL_PARTS });
  }
  const buf = new Uint8Array(total); let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  idbPut(MODEL_KEY, buf.buffer);
  return buf;
}

function loadScript(local, remote) {
  try { importScripts(BASE + local); }
  catch (e) { if (!remote) throw e; importScripts(remote); }
}

async function init() {
  loadScript('ort.wasm-core.min.js', 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.3/dist/ort.wasm-core.min.js');
  ort.env.wasm.wasmPaths = BASE;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  loadScript('piper_phonemize.js');
  const [w, d] = await Promise.all([
    fetch(BASE + 'piper_phonemize.wasm').then(r => r.arrayBuffer()),
    fetch(BASE + 'piper_phonemize.data.wasm').then(r => r.arrayBuffer()),
  ]);
  wasmBin = w; dataBin = d;
  const model = await loadModel();
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

async function phonemize(text) {
  let out = '';
  const mod = await createPiperPhonemize({
    print: s => { out += s; },
    printErr: () => {},
    wasmBinary: wasmBin,
    getPreloadedPackage: () => dataBin,
    locateFile: f => BASE + f,
  });
  mod.callMain(['-l', 'pl', '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  const ids = JSON.parse(out).phoneme_ids;
  if (!ids || !ids.length) throw new Error('Pusta wymowa.');
  return ids;
}

async function synth(text, rate) {
  const ids = await phonemize(text);
  const n = ids.length;
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, n]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(n)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([CFG.noise, CFG.lengthScale / (rate || 1), CFG.noiseW]), [3]),
  };
  const res = await session.run(feeds);
  const out = res[session.outputNames[0]];
  return new Float32Array(out.data);
}

self.onmessage = async e => {
  const m = e.data || {};
  if (m.type === 'init') {
    try { initP = initP || init(); await initP; postMessage({ type: 'ready' }); }
    catch (err) { initP = null; postMessage({ type: 'error', message: String(err && err.message || err) }); }
  } else if (m.type === 'speak') {
    try {
      await initP;
      const pcm = await synth(m.text, m.rate);
      postMessage({ type: 'audio', id: m.id, pcm, sampleRate: CFG.sampleRate }, [pcm.buffer]);
    } catch (err) { postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) }); }
  }
};
