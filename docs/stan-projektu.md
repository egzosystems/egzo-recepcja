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

## Przejścia (od wersji z 2026-10-27, popołudnie)
- Szwy między klipami: interpolacja ruchu (`tools/seam.py`, ffmpeg minterpolate) zamiast przenikania — twarz przesuwa się zamiast nakładać dwa razy.
- Wyjście z klipu: klip kończy się dokładnie klatką 265 pętli bazowej, silnik przełącza bez przenikania.
- Wejście w klip: paczka wejść (`media/egzo-wejscia_2026-10-27.mp4`, `tools/entry_pack.py`) — przejścia z każdej pełnej sekundy pętli do kadru bazowego. Silnik czeka do najbliższej pełnej sekundy (≤1 s, jak czas reakcji).
- Test lokalny wymaga serwera z obsługą zakresów bajtów (przewijanie wideo); prosty `python3 -m http.server` jej nie ma.

## Plan
1. Ujęcia obiegu: 05 odczyt, 06 analiza, 08 segregowanie, 12 odłożenie (prompty w `docs/ujecia.md`).
2. Poprawki logo na ścianie → nowy kadr bazowy (wtedy klipy generujemy już z niego).
3. Analiza treści plików przez Claude API i zapis notatek prosto do vaulta Obsidiana.
4. Głos: synteza mowy (np. ElevenLabs) + klipy mówienia / lip-sync; rozmowa z poziomu Obsidiana.
