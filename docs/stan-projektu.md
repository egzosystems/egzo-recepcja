# Stan projektu

## Decyzje
- Realistyczny ruch daje tylko wideo z generatora (Veo 3.1 w Gemini / Flow). Nieruchome kadry służą wyłącznie jako referencja.
- Jeden kadr bazowy 16:9 (`media/egzo-poster_2026-10-27.jpg`) jako pierwsza i ostatnia klatka każdego klipu.
- Napisy na tackach i logo nie są brane z wideo (rozmywają się) — tabliczki to nakładka HTML.
- Kod w tym repozytorium, notatki projektowe w Obsidianie (wtyczka Obsidian Git może synchronizować folder `docs/`).

## Wnioski z klipów Veo
- Bez ustawionej ostatniej klatki Veo nie wraca do pozycji → sklejanie z domknięciem (`tools/clips.sh stitch`) albo pętla tam-i-z-powrotem.
- Długie przenikanie (1,5 s) przy przesuniętej głowie daje podwójne oczy; ≤0,5 s jest akceptowalne.
- Veo lubi odkładać kartkę → w prompcie: trzyma kartkę w prawej dłoni na początku i na końcu.
- Kok dotyka górnej krawędzi kadru → przy nowym kadrze bazowym zostawić miejsce nad głową.

## Plan
1. Ujęcia obiegu: 05 odczyt, 06 analiza, 08 segregowanie, 12 odłożenie (prompty w `docs/ujecia.md`).
2. Poprawki logo na ścianie → nowy kadr bazowy (wtedy klipy generujemy już z niego).
3. Analiza treści plików przez Claude API i zapis notatek prosto do vaulta Obsidiana.
4. Głos: synteza mowy (np. ElevenLabs) + klipy mówienia / lip-sync; rozmowa z poziomu Obsidiana.
