#!/usr/bin/env bash
# Cały zestaw testów mowy i ust (serwer testowy na porcie 8768 musi działać: python3 tools/serwer_testowy.py).
# Wynik: lista testów z OK / NIE ZALICZONY; kod wyjścia 1, jeśli którykolwiek nie przeszedł.
cd "$(dirname "$0")/.." || exit 1
URL=${1:-http://localhost:8768/egzo-recepcja_2026-10-27.html}
fail=0
if node tests/test_normalizacja.js > /tmp/wynik_test_normalizacja.txt 2>&1; then echo "OK            test_normalizacja"; else echo "NIE ZALICZONY test_normalizacja  (szczegóły: /tmp/wynik_test_normalizacja.txt)"; fail=1; fi
for t in test_mowa test_glos test_polecenia test_pamiec test_autonomia test_realizm test_kat_ust test_otwieranie_ust test_broda test_wolne_urzadzenie; do
  if python3 "tests/$t.py" "$URL" > "/tmp/wynik_$t.txt" 2>&1; then echo "OK            $t"; else echo "NIE ZALICZONY $t  (szczegóły: /tmp/wynik_$t.txt)"; fail=1; fi
done
if python3 tests/test_dokumenty.py tests/pliki "$URL" > /tmp/wynik_test_dokumenty.txt 2>&1; then echo "OK            test_dokumenty"; else echo "NIE ZALICZONY test_dokumenty  (szczegóły: /tmp/wynik_test_dokumenty.txt)"; fail=1; fi
# wymowa (Whisper offline; model: EGZO_WHISPER=katalog sherpa-onnx-whisper-small)
if [ -n "$EGZO_WHISPER" ] && [ -d "$EGZO_WHISPER" ]; then
  if python3 tests/test_wymowa.py "$URL" "$EGZO_WHISPER" > /tmp/wynik_test_wymowa.txt 2>&1; then echo "OK            test_wymowa"; else echo "NIE ZALICZONY test_wymowa  (szczegóły: /tmp/wynik_test_wymowa.txt)"; fail=1; fi
else echo "pominięty     test_wymowa (ustaw EGZO_WHISPER)"; fi
exit $fail
