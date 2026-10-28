#!/usr/bin/env python3
"""Biblioteka gotowych kwestii asystentki: nagrywane z góry głosem Mai (ten sam model i ustawienia co w przeglądarce).

Dla każdej kwestii: podział na zdania (jak w stronie), synteza, normalizacja szczytu do 0,8,
zapis do jednego pliku WAV (16 bit, 22 050 Hz, mono) + indeks JSON z położeniem każdego zdania
i czasami liter (do synchronizacji ust). Strona odtwarza je natychmiast, bez liczenia na telefonie.

Każde zdanie jest nagrywane kilka razy (model ma losowość), a zostaje wersja, którą niezależny model rozpoznawania
mowy (Whisper small, sherpa-onnx) zrozumiał najlepiej — gotowe kwestie bez potknięć wymowy.

Użycie: python3 tools/generuj_frazy.py MODEL_Z_CZASAMI.onnx TOKENS.txt KATALOG_WYJŚCIOWY [KATALOG_WHISPER] [TEMPO] [PRÓBY]
TEMPO jak w stronie (domyślnie 0.9 = mowa.ustaw({tempo})), PRÓBY: ile wersji każdego zdania (domyślnie 4).
"""
import json, os, re, sys, wave
import numpy as np
import onnxruntime as ort

model, tokens_path, out_dir = sys.argv[1:4]
ASR_DIR = sys.argv[4] if len(sys.argv) > 4 else ''
TEMPO = float(sys.argv[5]) if len(sys.argv) > 5 else 0.9
PROBY = int(sys.argv[6]) if len(sys.argv) > 6 else 4
LENGTH = 1.15 / TEMPO          # jak w tts-worker.js: V.length / rate
os.makedirs(out_dir, exist_ok=True)

HI = ['Dzień dobry', 'Cześć', 'Dobry wieczór']
TAILS = ['Wrzuć dokument, a od razu się nim zajmę.', 'Jestem gotowa, czekam na polecenia.', 'Daj znać, w czym mogę pomóc.']
GODZ = {60: 'godzinę', 90: 'półtorej godziny', 120: 'dwie godziny', 180: 'trzy godziny', 240: 'cztery godziny',
        300: 'pięć godzin', 360: 'sześć godzin', 420: 'siedem godzin', 480: 'osiem godzin'}
BREAK_T = ['Szefie, pracujesz już {g} bez przerwy. Może krótka przerwa?',
           'Szefie, to już {g} bez przerwy. Wstań na chwilę, napij się wody.']
LINES = [f'{h}, szefie! Jestem twoją asystentką. {t}' for h in HI for t in TAILS]
LINES += [b.format(g=g) for g in GODZ.values() for b in BREAK_T]
LINES += [
    'Dziękuję, szefie. Już czytam.',
    'Gotowe, szefie. Dokument czeka na twoją akceptację.',
    'Gotowe, przeczytałam. Czeka na twoją akceptację, szefie.',
    'Zatwierdzone, szefie. Przenoszę do zakończonych.',
    'Głos włączony.',
    'Tak teraz brzmię, szefie.',
    'Dobrze, szefie. Powiem ci, kiedy przyjdzie nowy e-mail.',
    'Witaj z powrotem, szefie! Wszystko czeka na swoim miejscu.',
    'Witaj z powrotem, szefie. Dobrze, że jesteś.',
    'O, jesteś, szefie! Witaj z powrotem.',
    'Masz nową wiadomość, szefie.',
    'Chwileczkę, zastanowię się.',
    # potwierdzenia poleceń (grają od razu, zanim wykona ruch)
    'Już, szefie!', 'Tak jest, szefie!', 'Oczywiście, szefie.', 'Robi się, szefie!',
    # zadania, raport dnia, e-maile i szkice (zdania stałe; zmienne części liczy przeglądarka)
    'Zrobione, szefie.', 'Świetnie, jedno mniej.', 'Jedno zadanie mniej, szefie.', 'Dopisane, szefie.', 'Zapisane, szefie.',
    'Szefie, przyszedł nowy e-mail.', 'Nowych e-maili nie ma.', 'Nic pilnego nie czeka. Spokojny start.',
    'Od czego zaczynamy?', 'Czym się zajmujemy najpierw?', 'Daj znać, od czego zacząć.',
    'Czeka w Gmailu do sprawdzenia.', 'Szefie, przygotowałam szkic odpowiedzi.', 'Głos włączony.',
]

# ta sama zamiana tekstu na mowę i ten sam podział na zdania co w przeglądarce (mowa/egzo-mowa.js)
import subprocess
_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mowa', 'egzo-mowa.js')
def zdania_mowione(lines):
    code = ("require(process.argv[1]); const L=JSON.parse(require('fs').readFileSync(0,'utf8'));"
            "process.stdout.write(JSON.stringify(L.map(l=>EgzoMowa.zdania(EgzoMowa.mowione(l)))));")
    r = subprocess.run(['node', '-e', code, _JS], input=json.dumps(lines), capture_output=True, text=True, check=True)
    return json.loads(r.stdout)
tok = {}
for line in open(tokens_path, encoding='utf-8'):
    line = line.rstrip('\n')
    if not line:
        continue
    i = line.rfind(' ')
    tok[line[:i] if i > 0 else ' '] = int(line[i + 1:])
sess = ort.InferenceSession(model)
SENT = re.compile(r'[^.!?…]+[.!?…]*["”»]?\s*')

ROZBIEG = ', '   # jak w przeglądarce (synthNeural): rozbieg przed zdaniem — wyraźniejsze pierwsze słowo
def synth(text):
    blank = tok['<BLNK>']; ids = []; chars = []
    for ch in re.sub(r'\s+', ' ', (ROZBIEG + text).lower()):
        if ch in tok:
            ids += [blank, tok[ch]]; chars += ['_', ch]
    ids.append(blank); chars.append('_')
    I = lambda a: np.array(a, dtype=np.int64)
    y, d = sess.run(None, {'input': I([ids]), 'input_lengths': I([len(ids)]),
                           'scales': np.array([0.45, LENGTH, 0.6], dtype=np.float32), 'sid': I([0]), 'langid': I([0])})
    y = y.squeeze().astype(np.float32); y *= 0.8 / max(1e-6, float(np.abs(y).max()))
    # przycięcie ciszy na brzegach (jak trimSilence w stronie) — mniejszy plik; przesunięcie zapisane dla ust
    th = 0.8 * 0.02; nz = np.where(np.abs(y) >= th)[0]
    a = max(0, int(nz[0]) - int(22050 * .025)) if len(nz) else 0
    b = min(len(y), int(nz[-1]) + int(22050 * .05)) if len(nz) else len(y)
    y = y[a:b].copy(); f = min(len(y) // 2, int(22050 * .006))
    if f: y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    return y, [int(v) for v in d.squeeze()], chars, a / 22050

rec = None
if ASR_DIR:
    import sherpa_onnx
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(encoder=f'{ASR_DIR}/small-encoder.int8.onnx', decoder=f'{ASR_DIR}/small-decoder.int8.onnx',
                                                     tokens=f'{ASR_DIR}/small-tokens.txt', language='pl', task='transcribe', num_threads=2)
def clean(t):
    t = t.lower().replace('szeef', 'szef').replace('ó', 'u').replace('rz', 'ż').replace('ch', 'h')
    return re.sub(r'[^a-ząćęłńśźż]', '', t)
def cer(a, b):
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ca != cb))
    return d[len(b)] / max(1, len(a))
def heard(y):
    n = int(len(y) * 16000 / 22050); x = np.interp(np.linspace(0, len(y) - 1, n), np.arange(len(y)), y).astype(np.float32)
    x = np.concatenate([np.zeros(3200, np.float32), x, np.zeros(4800, np.float32)])
    st = rec.create_stream(); st.accept_waveform(16000, x); rec.decode_stream(st); return st.result.text.strip()
def najlepsza(s):
    if not rec: return synth(s)
    cands = []
    for k in range(PROBY):
        c = synth(s); h = heard(c[0]); cands.append((cer(clean(s), clean(h)), k, c, h))
    cands.sort(key=lambda x: (x[0], x[1]))
    best = cands[0]; stats.append(best[0])
    if best[0] > 0.12: print(f'  uwaga: {s!r} → najlepiej {best[0]*100:.0f}% ({best[3]!r})')
    return best[2]
stats = []
pcm_all = []; off = 0; index = {}
ZD = zdania_mowione(LINES)
for line, parts in zip(LINES, ZD):
    chunks = []
    for s in parts:
        y, dur, chars, pre = najlepsza(s)
        q = np.clip(np.round(y * 32767), -32768, 32767).astype(np.int16)
        pcm_all.append(q)
        chunks.append({'text': s, 'off': off, 'len': int(len(q)), 'pre': round(pre, 4), 'dur': dur, 'chars': ''.join(chars)})
        off += len(q)
    index[line] = chunks
pcm = np.concatenate(pcm_all)
with wave.open(os.path.join(out_dir, 'frazy.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050); w.writeframes(pcm.tobytes())
json.dump({'sampleRate': 22050, 'hop': 256, 'lines': index}, open(os.path.join(out_dir, 'frazy.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
if stats: print(f'rozpoznanie wybranych wersji: średni CER {np.mean(stats)*100:.1f}%, najgorszy {max(stats)*100:.1f}%')
print(f'tempo {TEMPO} (length_scale {LENGTH:.3f}), kwestii: {len(LINES)}, zdań: {sum(len(v) for v in index.values())}, nagrania: {len(pcm)/22050:.1f} s, plik: {os.path.getsize(os.path.join(out_dir, "frazy.wav"))/1e6:.1f} MB')
