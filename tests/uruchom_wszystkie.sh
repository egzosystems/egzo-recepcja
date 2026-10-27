#!/usr/bin/env bash
# Cały zestaw testów mowy i ust (serwer testowy na porcie 8768 musi działać: python3 tools/serwer_testowy.py).
# Wynik: lista testów z OK / NIE ZALICZONY; kod wyjścia 1, jeśli którykolwiek nie przeszedł.
cd "$(dirname "$0")/.." || exit 1
URL=${1:-http://localhost:8768/egzo-recepcja_2026-10-27.html}
fail=0
for t in test_mowa test_polecenia test_realizm test_kat_ust test_otwieranie_ust test_broda test_wolne_urzadzenie; do
  if python3 "tests/$t.py" "$URL" > "/tmp/wynik_$t.txt" 2>&1; then echo "OK            $t"; else echo "NIE ZALICZONY $t  (szczegóły: /tmp/wynik_$t.txt)"; fail=1; fi
done
exit $fail
