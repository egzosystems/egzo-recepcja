#!/usr/bin/env python3
"""Biblioteka gotowych kwestii asystentki: nagrywane z góry głosem Mai (ten sam model i ustawienia co w przeglądarce).

Dla każdej kwestii: podział na zdania (jak w stronie), synteza, normalizacja szczytu do 0,8,
zapis do jednego pliku WAV (16 bit, 22 050 Hz, mono) + indeks JSON z położeniem każdego zdania
i czasami liter (do synchronizacji ust). Strona odtwarza je natychmiast, bez liczenia na telefonie.

Użycie: python3 tools/generuj_frazy.py MODEL_Z_CZASAMI.onnx TOKENS.txt KATALOG_WYJŚCIOWY
"""
import json, os, re, sys, wave
import numpy as np
import onnxruntime as ort

model, tokens_path, out_dir = sys.argv[1:4]
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
]

tok = {}
for line in open(tokens_path, encoding='utf-8'):
    line = line.rstrip('\n')
    if not line:
        continue
    i = line.rfind(' ')
    tok[line[:i] if i > 0 else ' '] = int(line[i + 1:])
sess = ort.InferenceSession(model)
SENT = re.compile(r'[^.!?…]+[.!?…]*["”»]?\s*')

def synth(text):
    blank = tok['<BLNK>']; ids = []; chars = []
    for ch in re.sub(r'\s+', ' ', text.lower()):
        if ch in tok:
            ids += [blank, tok[ch]]; chars += ['_', ch]
    ids.append(blank); chars.append('_')
    I = lambda a: np.array(a, dtype=np.int64)
    y, d = sess.run(None, {'input': I([ids]), 'input_lengths': I([len(ids)]),
                           'scales': np.array([0.45, 1.15, 0.6], dtype=np.float32), 'sid': I([0]), 'langid': I([0])})
    y = y.squeeze().astype(np.float32); y *= 0.8 / max(1e-6, float(np.abs(y).max()))
    # przycięcie ciszy na brzegach (jak trimSilence w stronie) — mniejszy plik; przesunięcie zapisane dla ust
    th = 0.8 * 0.02; nz = np.where(np.abs(y) >= th)[0]
    a = max(0, int(nz[0]) - int(22050 * .025)) if len(nz) else 0
    b = min(len(y), int(nz[-1]) + int(22050 * .05)) if len(nz) else len(y)
    y = y[a:b].copy(); f = min(len(y) // 2, int(22050 * .006))
    if f: y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    return y, [int(v) for v in d.squeeze()], chars, a / 22050

pcm_all = []; off = 0; index = {}
for line in LINES:
    parts = [s.strip() for s in SENT.findall(line) if s.strip()] or [line]
    chunks = []
    for s in parts:
        y, dur, chars, pre = synth(s)
        q = np.clip(np.round(y * 32767), -32768, 32767).astype(np.int16)
        pcm_all.append(q)
        chunks.append({'text': s, 'off': off, 'len': int(len(q)), 'pre': round(pre, 4), 'dur': dur, 'chars': ''.join(chars)})
        off += len(q)
    index[line] = chunks
pcm = np.concatenate(pcm_all)
with wave.open(os.path.join(out_dir, 'frazy.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050); w.writeframes(pcm.tobytes())
json.dump({'sampleRate': 22050, 'hop': 256, 'lines': index}, open(os.path.join(out_dir, 'frazy.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'kwestii: {len(LINES)}, zdań: {sum(len(v) for v in index.values())}, nagrania: {len(pcm)/22050:.1f} s, plik: {os.path.getsize(os.path.join(out_dir, "frazy.wav"))/1e6:.1f} MB')
