#!/usr/bin/env python3
"""Buduje stronę: wbudowuje bibliotekę mowy (mowa/egzo-mowa.js) w HTML między znacznikami
/*<mowa>*/ … /*</mowa>*/ (artefakt nie pozwala na osobne skrypty) i tworzy wersję repo index.html
(ścieżki klipów w media/).

Użycie: python3 tools/zbuduj_strone.py ŹRÓDŁO.html [--repo index.html]
  ŹRÓDŁO.html — strona artefaktu (klipy obok strony); zostaje zaktualizowana w miejscu.
"""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1])
mod = (root / 'mowa' / 'egzo-mowa.js').read_text()
h = src.read_text()
a, b = '/*<mowa>*/', '/*</mowa>*/'
if a not in h or b not in h:
    sys.exit('brak znaczników /*<mowa>*/ … /*</mowa>*/ w ' + str(src))
i, j = h.index(a) + len(a), h.index(b)
h = h[:i] + '\n' + mod.rstrip() + '\n' + h[j:]
src.write_text(h)
print('wbudowano mowę', len(mod), 'B →', src)
if '--repo' in sys.argv:
    out = pathlib.Path(sys.argv[sys.argv.index('--repo') + 1])
    r = re.sub(r'(?<![/\w])(egzo-[\w.-]+_\d{4}-\d{2}-\d{2}[\w.-]*\.(?:mp4|jpg))', r'media/\1', h)
    r = '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + r
    out.write_text(r)
    print('wersja repo →', out)
