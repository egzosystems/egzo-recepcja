"""Test brzmienia: pauzy przy przecinkach i intonacja pytań — na dźwięku z przeglądarki.
W przeglądarce: model liczy zdanie → silnik skraca pauzy → OfflineAudioContext gra je z intonacją.
Kryteria: pauza przy przecinku ≤ 0,26 s (było do 0,49 s); pytanie tak/nie bez „czy” — ton na końcu ≥ +8%
względem środka zdania; stwierdzenie i pytanie „co/gdzie…” — bez podnoszenia; czasy głosek (usta)
zgadzają się z długością dźwięku po skróceniu (±40 ms)."""
from playwright.sync_api import sync_playwright
import sys, numpy as np
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8768/egzo-recepcja_2026-10-27.html'
ZD = [('Tak, mam to.', 'stw'), ('Zaraz ci pokażę, co tam jest, dobrze?', 'tak'), ('Oczywiście, szefie, już sprawdzam.', 'stw'),
      ('Wysłać to teraz?', 'tak'), ('Mam je od razu otworzyć?', 'tak'), ('Co tam jest w środku?', 'szcz'), ('Czy mam je od razu otworzyć?', 'czy')]
def f0(y, sr=22050, win=1024, hop=256):
    out = []
    for i in range(0, len(y) - win, hop):
        x = y[i:i + win] * np.hanning(win)
        if np.sqrt((x ** 2).mean()) < 0.02: out.append(0); continue
        ac = np.correlate(x, x, 'full')[win - 1:]; lo, hi = int(sr / 400), int(sr / 120)
        k = lo + int(np.argmax(ac[lo:hi])); out.append(sr / k if ac[k] > 0.3 * ac[0] else 0)
    return np.array(out)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"]); pg = b.new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL); pg.wait_for_timeout(2500); pg.click('#voiceBtn')
    for i in range(120):
        pg.wait_for_timeout(500)
        if pg.evaluate("()=>mowa.stan==='ready'&&!mowa.zajeta&&!evq.running"): break
    res = pg.evaluate("""async(Z)=>{ const W=mowa.wnetrze, out=[];
      for(const [t] of Z){ const m=await W.synthNeural(EgzoMowa.mowione(t)); m.text=t;
        const tr=W.trimSilence(m.pcm,m.sampleRate), sp=W.skrocPauzy(m,tr.pcm,tr.offset);
        const ctx=new OfflineAudioContext(1,sp.pcm.length+2205,m.sampleRate), buf=ctx.createBuffer(1,sp.pcm.length,m.sampleRate); buf.copyToChannel(sp.pcm,0);
        const s=ctx.createBufferSource(); s.buffer=buf; s.connect(ctx.destination); const rise=W.pytanieTakNie(t); W.intonacja(s,0,buf.duration,rise,{...m,dur:sp.dur},tr.offset); s.start(0);
        const r=await ctx.startRendering();
        const before=Array.from(m.dur), after=Array.from(sp.dur);
        out.push({t, rise, y:Array.from(r.getChannelData(0)), chars:m.chars, durB:before, durA:after, hop:m.hop, sr:m.sampleRate, off:tr.offset, lenA:sp.pcm.length, lenB:tr.pcm.length}); }
      return out; }""", [list(z) for z in ZD])
    b.close()
ok = not errs
for (t, kind), r in zip(ZD, res):
    ch, dA, dB, hop, sr = r['chars'], r['durA'], r['durB'], r['hop'], r['sr']
    def pauses(du):
        out = []
        for k, c in enumerate(ch):
            if c in ',;:':
                j = k + 1; L = du[k]
                while j < len(ch) and ch[j] in '_ ': L += du[j]; j += 1
                out.append(L * hop / sr)
        return out
    pb, pa = pauses(dB), pauses(dA)
    y = np.array(r['y'], dtype=np.float32); f = f0(y); v = f[f > 0]
    tail, mid = np.median(v[-6:]), np.median(v[:len(v) // 2]); rise = tail / mid - 1
    # zgodność czasów głosek z dźwiękiem: suma czasów po skróceniu − przesunięcie ≈ długość dźwięku (±40 ms + końcowa cisza)
    sync = abs((sum(dA) * hop / sr - r['off']) - r['lenA'] / sr) - abs((sum(dB) * hop / sr - r['off']) - r['lenB'] / sr)
    good = all(x <= 0.26 for x in pa) and abs(sync) <= 0.04
    if kind == 'tak': good &= r['rise'] and rise >= 0.08
    elif kind in ('stw', 'szcz'): good &= not r['rise']
    elif kind == 'czy': good &= not r['rise']
    ok &= good
    print(f"{'OK ' if good else 'BŁĄD'} {t:42s} pauzy {[round(x,2) for x in pb]}→{[round(x,2) for x in pa]} s | wzniesienie {'tak' if r['rise'] else 'nie'}, ton na końcu {rise*100:+.0f}% | usta Δ {sync*1000:+.0f} ms")
print('BŁĘDY STRONY:', errs); print('WYNIK:', 'OK' if ok else 'NIE ZALICZONY')
sys.exit(0 if ok else 1)
