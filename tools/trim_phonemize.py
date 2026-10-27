"""Tnie paczkę danych espeak-ng (piper_phonemize.data) do samego języka polskiego.

Czyta metadane z piper_phonemize.js jako tekst/JSON (nic nie uruchamia), zostawia wszystkie
pliki wspólne (phontab, phondata, intonations, lang/*, voices) i tylko słownik pl_dict,
zapisuje nową paczkę i poprawia metadane w kopii pliku JS.

Użycie: python3 -I trim_phonemize.py KATALOG_ŹRÓDŁOWY KATALOG_WYJŚCIOWY
"""
import json, os, re, shutil, sys

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
js = open(os.path.join(src, "piper_phonemize.js"), encoding="utf-8").read()
m = re.search(r'loadPackage\((\{"files":.*?"remote_package_size":\d+\})\)', js)
meta = json.loads(m.group(1))
data = open(os.path.join(src, "piper_phonemize.data"), "rb").read()

keep = [f for f in meta["files"] if not f["filename"].endswith("_dict") or f["filename"].endswith("/pl_dict")]
out = bytearray()
files = []
for f in keep:
    g = dict(f)
    g["start"] = len(out)
    out += data[f["start"]:f["end"]]
    g["end"] = len(out)
    files.append(g)
meta2 = dict(meta, files=files, remote_package_size=len(out))

js2 = js[:m.start(1)] + json.dumps(meta2, separators=(",", ":")) + js[m.end(1):]
js2 = js2.replace(str(meta["remote_package_size"]), str(len(out)))
open(os.path.join(dst, "piper_phonemize.js"), "w", encoding="utf-8").write(js2)
open(os.path.join(dst, "piper_phonemize.data"), "wb").write(out)
shutil.copy(os.path.join(src, "piper_phonemize.wasm"), dst)
print(f"plików: {len(files)}, dane: {len(data)/1e6:.1f} MB -> {len(out)/1e6:.2f} MB")
