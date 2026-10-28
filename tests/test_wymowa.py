"""Test wymowy i tempa: głos Mai czyta zdania z czatu (z liczbami, datami, kwotami, skrótami, słowami obcymi),
a niezależny model rozpoznawania mowy (Whisper small, sherpa-onnx, offline) zapisuje, co usłyszał.

Dźwięk jest dokładnie taki, jak w aplikacji: tekst → EgzoMowa.mowione → model Mai → przycięcie ciszy →
skrócone pauzy → intonacja (OfflineAudioContext). Rozpoznany tekst przechodzi tę samą zamianę liczb na słowa,
więc porównujemy słowa ze słowami.

Kryteria: średni błąd znaków (CER) ≤ 12%, żadne zdanie > 35% (Whisper small sam myli się w kilku procentach,
a model mowy ma losowość — pojedyncze zdanie bywa słabsze); tempo artykulacji 5,0–6,0 sylaby/s
(naturalna polska mowa w rozmowie: ok. 5–6; przy tempie 1,0 było 6,0 i CER 13,7%, przy 0,9: 5,6 i 9,0%), z pauzami ≥ 4,0.
Użycie: python3 tests/test_wymowa.py [URL] [KATALOG_MODELU_WHISPER]
Model: https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2
"""
from playwright.sync_api import sync_playwright
import sys, os, re, json, time
import numpy as np

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
ASR = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('EGZO_WHISPER', '/tmp/claude-0/-home-claude/39a6a5a9-976f-544e-a9ce-9948c9a77f8c/scratchpad/asr/sherpa-onnx-whisper-small')
ZD = [
    'Dzień dobry, szefie. W czym mogę pomóc?',
    'Termin płatności mija 15.11.2026, szefie.',
    'Spotkanie z klientem jest jutro o 14:30.',
    'Faktura na kwotę 1 250,50 zł czeka na akceptację.',
    'Terrarium 120x60x50 cm ze szkłem 4 mm kosztuje 890 zł.',
    'Zadzwoń proszę pod numer 600 123 456.',
    'Mam dla szefa 3 nowe maile i 2 nowe wiadomości.',
    'Np. e-mail od Jana Kowalskiego, m.in. z plikiem PDF.',
    'Rabat wynosi 12,5%, a dostawa trwa 5-7 dni.',
    'Przypomnę o tym za 10 minut, dobrze?',
    'Szkic odpowiedzi czeka w Gmailu, nic nie wysłałam.',
    'Zapisałam notatkę w Obsidianie, w folderze EGZO SEJF.',
    'Czy mam przekazać to zamówienie do akceptacji?',
    'Oczywiście, szefie, już się tym zajmuję.',
    'Klientka pyta, czy zdążymy przed weekendem.',
    'W tym miesiącu mamy 21 zamówień na łączną kwotę 48 tys. zł.',
    'Wczoraj przyszły 4 paczki z płytami MDF.',
    'Pan Nowak prosi o wycenę szafki 80 na 40 centymetrów.',
    'Proszę wysłać SMS z potwierdzeniem do godz. 16.',
    'Plik ma 25 MB, otworzę go w Excelu.',
]

def cer(a, b):
    a, b = a.replace(' ', ''), b.replace(' ', '')
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ca != cb))
    return d[len(b)] / max(1, len(a))

def clean(s):
    s = s.lower().replace('szeef', 'szef').replace('ó', 'u').replace('rz', 'ż').replace('ch', 'h')   # pisownia jednakowo brzmiących głosek; „szeefie” to zapis wymowy „szefie”
    return re.sub(r'\s+', ' ', re.sub(r'[^a-ząćęłńśźż ]', ' ', s)).strip()

def sylaby(s):
    return len(re.findall(r'[aąeęioóuy]+', s.lower()))

def main():
    import sherpa_onnx
    rec = sherpa_onnx.OfflineRecognizer.from_whisper(
        encoder=f'{ASR}/small-encoder.int8.onnx', decoder=f'{ASR}/small-decoder.int8.onnx', tokens=f'{ASR}/small-tokens.txt',
        language='pl', task='transcribe', num_threads=2)
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); pg = b.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#voiceBtn')
        for i in range(120):
            pg.wait_for_timeout(500)
            if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running"): break
        if os.environ.get('EGZO_GLOS'): pg.evaluate("(p)=>mowa.ustaw(p)", json.loads(os.environ['EGZO_GLOS']))
        res = pg.evaluate("""async(Z)=>{ const W=mowa.wnetrze, out=[];
          for(const t of Z){ const mow=EgzoMowa.mowione(t), parts=EgzoMowa.zdania(mow), pcs=[]; let sr=22050, mowa_s=0;
            for(const s of parts){ const m=await W.synthNeural(s); sr=m.sampleRate;
              const tr=W.trimSilence(m.pcm,m.sampleRate), sp=W.skrocPauzy(m,tr.pcm,tr.offset);
              const ctx=new OfflineAudioContext(1,sp.pcm.length+2205,sr), buf=ctx.createBuffer(1,sp.pcm.length,sr); buf.copyToChannel(sp.pcm,0);
              const src=ctx.createBufferSource(); src.buffer=buf; src.connect(ctx.destination); W.intonacja(src,0,buf.duration,W.pytanieTakNie(s),{...m,dur:sp.dur},tr.offset); src.start(0);
              const r=await ctx.startRendering(); pcs.push(Array.from(r.getChannelData(0))); }
            out.push({t, mow, sr, pcm:pcs}); }
          return out; }""", ZD)
        b.close()
    rows, ok = [], not errs
    for r in res:
        sr = r['sr']; gap = [0.0] * int(0.26 * sr)            # pauza między zdaniami jak w aplikacji
        pcm = np.array(sum([x + gap for x in r['pcm']], []), dtype=np.float32)
        dur = len(pcm) / sr
        # czas artykulacji: ramki 20 ms z głosem (bez pauz)
        fr = int(0.02 * sr); e = np.array([np.sqrt(np.mean(pcm[i:i + fr] ** 2)) for i in range(0, len(pcm) - fr, fr)])
        talk = (e > 0.02 * e.max()).sum() * 0.02
        # 16 kHz dla Whispera
        n16 = int(len(pcm) * 16000 / sr); x16 = np.interp(np.linspace(0, len(pcm) - 1, n16), np.arange(len(pcm)), pcm).astype(np.float32)
        st = rec.create_stream(); st.accept_waveform(16000, x16); rec.decode_stream(st); heard = st.result.text.strip()
        rows.append(dict(t=r['t'], mow=r['mow'], heard=heard, dur=dur, talk=talk, syl=sylaby(r['mow'])))
    # rozpoznany tekst → ta sama zamiana liczb i skrótów na słowa (w przeglądarce)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); pg.goto(URL); pg.wait_for_timeout(800)
        heard_m = pg.evaluate("(H)=>H.map(h=>EgzoMowa.mowione(h))", [x['heard'] for x in rows]); b.close()
    cers, rates, rates_all = [], [], []
    for x, hm in zip(rows, heard_m):
        c = cer(clean(x['mow']), clean(hm)); cers.append(c)
        rate, rate_all = x['syl'] / max(x['talk'], .1), x['syl'] / max(x['dur'], .1); rates.append(rate); rates_all.append(rate_all)
        good = c <= 0.35
        ok &= good
        print(f"{'OK ' if good else 'BŁĄD'} CER {c*100:4.1f}% | {rate:.1f} syl/s | {x['t']}")
        if c > 0.03: print(f"        mówi:    {x['mow']}\n        słyszę:  {x['heard']}")
    m_cer, m_rate, m_all = float(np.mean(cers)), float(np.mean(rates)), float(np.mean(rates_all))
    print(f"\nśredni CER {m_cer*100:.1f}% | tempo artykulacji {m_rate:.2f} syl/s | z pauzami {m_all:.2f} syl/s")
    ok &= m_cer <= 0.12 and 5.0 <= m_rate <= 6.0 and m_all >= 4.0
    print('BŁĘDY STRONY:', errs); print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
    json.dump(rows, open('/tmp/wynik_wymowa.json', 'w'), ensure_ascii=False, indent=1)
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
