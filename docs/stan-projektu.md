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

## Głos i rozmowa (wersja 1)
- Głos: syntezator przeglądarki (Web Speech API, pl-PL), włączany przyciskiem „Włącz głos” (telefony wymagają gestu).
- Powitanie zgrane z ruchem ust w klipie (kwestia startuje w 2,1 s).
- Pozostałe kwestie jak lektor, z napisem w kadrze (na telefonie pod kadrem).
- Rozmowa: pole „Napisz do niej” → Claude (capability `sample` w artefakcie) z opisem roli i listą dokumentów → odpowiedź czytana na głos.
- Następny krok: pętla mówienia z Veo (prompt 16 w ujecia.md), potem własny głos (np. ElevenLabs) w wersji lokalnej / Obsidian.

## Głos (wersja 2): neuronowy, w przeglądarce
- Syntezator systemu nie działa w aplikacji Claude na Androidzie, więc głos generuje sama strona.
- Model: Piper `pl_PL-gosia-medium` (VITS, 22 050 Hz, licencja CC0), źródło: wydanie `tts-models` projektu k2-fsa/sherpa-onnx na GitHubie.
- Wymowa: espeak-ng w WASM (`@diffusionstudio/piper-wasm`), słownik przycięty do polskiego 18 MB → 0,9 MB (`tools/trim_phonemize.py`).
- Wykonanie: onnxruntime-web 1.17.3 (`ort.wasm-core`, jeden wątek) w Web Workerze (`voice/tts-worker.js`).
- Model w 5 częściach po 13 MB (`voice/gosia-N.bin.wasm` — rozszerzenie .wasm tylko dlatego, że hosting artefaktów serwuje ten typ), po pierwszym pobraniu trzymany w IndexedDB.
- Pierwsze włączenie: ok. 75 MB do pobrania; potem start w kilka sekund. Mowa generowana zdanie po zdaniu.
- Kwantyzacja int8 sprawdzona i odrzucona: zmienia barwę głosu i liczy się ~5× wolniej.

## Plan
1. Ujęcia obiegu: 05 odczyt, 06 analiza, 08 segregowanie, 12 odłożenie (prompty w `docs/ujecia.md`).
2. Poprawki logo na ścianie → nowy kadr bazowy (wtedy klipy generujemy już z niego).
3. Analiza treści plików przez Claude API i zapis notatek prosto do vaulta Obsidiana.
4. Głos: synteza mowy (np. ElevenLabs) + klipy mówienia / lip-sync; rozmowa z poziomu Obsidiana.
