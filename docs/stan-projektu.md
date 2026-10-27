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

## Głos (wersja 3) i synchronizacja ust
- Głos domyślny: **Mai** (Coqui VITS pl, kobiecy, ok. 171 Hz), wybrany przez właściciela z próbek. Wejście = litery, liczby rozwijane na słowa (`spokenPL`). Gosia zostaje jako opcja w Studiu.
- Brzmienie „miękkie”: wolniej (length 1,15), gładziej (noise 0,45 / 0,6), filtr: dolnoprzepustowy 80 Hz, +3 dB półka 220 Hz, −4 dB przy 3,4 kHz, +2,5 dB półka 9,5 kHz, łagodna kompresja.
- Usta: atlas 7 kształtów (rest, slight, mid, open, wide, o, o2) wyciętych z klipu powitania, obróconych do przechyłu głowy w kadrze bazowym (−9,5°), wyrównanych do górnej wargi, dopasowanych kolorystycznie i lekko wyostrzonych (`lip/usta-atlas.png`).
- Tor ust w pętli spoczynkowej: twarz (wzorzec oczy–nos–usta) + doprecyzowanie samym wzorcem ust, podpikselowo (`lip/usta-tor.json`).
- Dobór kształtu: głośność co 10 ms + sylaby (maksima głośności) przypisane do kolejnych samogłosek z tekstu (o/u/ó/ą → zaokrąglone, e/i/y/ę → szerokie, a → otwarte); wygładzenie 70 ms; obraz wyprzedza dźwięk o 45 ms.
- Mówi w spoczynku (tam śledzenie jest najdokładniejsze): podziękowanie przed sięgnięciem po kartkę, „gotowe” po powrocie, odpowiedzi w rozmowie.
- Narzędzia: `tools/track_face.py`, `tools/mouth_atlas.py`, `tools/refine_lips.py`, `tools/roll_align.py` (z tego ostatniego używany wynik atlasu; kąt klatka po klatce okazał się zbędny — przechył w pętli jest stały).

## Mowa i usta (wersja 4) — dokładne czasy głosek
- Model Mai ma dodatkowe wyjście z czasem każdego znaku (`tools/eksport_czasow_liter.py`); suma czasów = długość dźwięku co do próbki.
- Głoski z liter: dwuznaki (sz, cz, rz, ch, dz, dż, dź) i zmiękczenia (ci/si/zi/ni + samogłoska).
- Kształty: m/b/p = prawdziwe, zamknięte usta z wideo (nakładka znika); a → open/mid; e → wide/slight; i/j → teeth/s; o/ą → o; u/ó/ł → mid; sz/cz/ż/rz/dż → o2; s/z/c/ś/ź/ć/dz/dź → s; f/w → slight; t/d/n/l/r/k/g/ch → od sąsiedniej samogłoski. Zaokrąglenie warg 50 ms przed o/u/sz. Siła otwarcia z głośności.
- Spacje między słowami nie zamykają ust (chyba że obok m/b/p); interpunkcja > 70 ms i przerwy > 160 ms zamykają.
- Atlas: 9 kształtów, maska zawężona (kąciki z prawdziwej twarzy — bez efektu „szerokiego uśmiechu”), zęby przygaszone o 14% (`tools/atlas_mask.py`).
- Silnik mowy: zdania na osi czasu karty dźwiękowej, przycięta cisza na brzegach, pauza 0,26 s po kropce / 0,32 s po ?!, jedna synteza naraz z anulowaniem przerwanych wypowiedzi, odpowiedzi czatu mówione zdanie po zdaniu w trakcie dopływania tekstu.
- Ochrona przed dziurami na wolnych urządzeniach: pomiar ms syntezy i sekund mowy na literę; jeśli kolejne zdania by nie zdążyły, start całej wypowiedzi jest opóźniony (max 3 s).
- Testy: `tests/test_mowa.py` (oś czasu ust, przerwy, strumień, zrzuty), `tests/test_wolne_urzadzenie.py` (procesor 4× wolniejszy). Serwer: `python3 tools/serwer_testowy.py . 8768`.
- Wyniki (2026-10-27): m/b/p zawsze zamknięte, „a” zawsze otwarte; przerwy między zdaniami 0,26 s; zero spóźnień syntezy przy normalnej prędkości; przy 4× wolniejszym procesorze start po ~2 s, potem bez dziur.
- Arkusz z minami i ustami od właściciela: kształty ust nie pasują do jej twarzy (inne usta, kolor, skala) — użyte tylko jako lista brakujących kształtów; miny i obroty głowy wymagają klipów Veo.

## Zdarzenia i rozmowa (wersja 5)
- Kolejka zdarzeń: ona odzywa się sama, ale czeka, aż skończy obsługę dokumentu, rozmowę i bieżącą wypowiedź.
- Powitanie zależne od pory dnia; „Witaj z powrotem” po ≥ 20 min nieobecności (nie przy samym otwarciu strony).
- Czas pracy: liczony, gdy strona jest otwarta i widoczna; przerwa = 10 min nieobecności; przypomnienie co 1 / 1,5 / 2 / 3 h (domyślnie 2 h), stan w localStorage.
- Gmail (capability `mcp`, łącznik „Gmail”, narzędzia `search_threads`, `get_thread` — tylko odczyt): po kliknięciu „Włącz” zapamiętuje stan skrzynki (`in:inbox newer_than:2d`, 20 wątków) i co minutę ogłasza tylko nowe wątki i nowe odpowiedzi w wątkach.
- Rozmowa: pamięć 20 ostatnich wiadomości (localStorage), w kontekście data, godzina, czas pracy, nowe maile, dokumenty; Claude może sam wywołać `szukaj_maili` i `czytaj_maila` (gdy powiadomienia z Gmaila są włączone). Treść maili traktowana jako dane, nie polecenia.
- Testy w Studiu: „Test: nowy e-mail”, „Test: 5 h bez przerwy”, „Test: powrót”; `tests/test_zdarzenia.py` (kolejkowanie w trakcie obsługi dokumentu).
- Ograniczenie: działa, gdy strona jest otwarta (w tle telefon ją usypia); głos po każdym otwarciu wymaga jednego stuknięcia „Włącz głos”.

## Mowa bez przerw (wersja 6) — poprawki po teście na telefonie
- Problem 1: głos startował, gdy jeszcze leciał klip powitania → nakładka ust wyłączona (usta „zamknięte”). Teraz przed mówieniem ona przechodzi do spoczynku: klip powitania przerywany przenikaniem, obieg dokumentu dokańczany.
- Problem 2: przerwa po „Dzień dobry” — telefon liczył drugie zdanie wolniej, niż silnik przewidział. Teraz:
  - biblioteka 39 gotowych kwestii (`voice/frazy.wav` 6,1 MB + `frazy.json`, `tools/generuj_frazy.py`): powitania, obieg dokumentu, przypomnienia o przerwie (1–8 h), „witaj z powrotem”, Gmail — odtwarzane od razu, przed pobraniem modelu;
  - kwestie zmienne: dźwięk rusza dopiero, gdy cała wypowiedź jest policzona (czat: całość albo ≥ 6 s zapasu); ogłoszenia liczone z wyprzedzeniem w kolejce;
  - anulowanie w wątku głosu po identyfikatorach konkretnej wypowiedzi; rozgrzewka modelu po cichu.
- Usunięte podwójne powitanie (licznik cichego powitania przy otwarciu strony).
- Testy (Chromium, ekran telefonu, procesor 4× wolniejszy): powitanie 0,5 s po stuknięciu, raz, ruch ust od pierwszego słowa, pauzy 0,26–0,32 s; kwestie zmienne bez spóźnień (pauzy 0,26 s), start czatu ok. 5,5 s na wolnym urządzeniu (ok. 3,5 s na komputerze).

## Usta i płynność (wersja 7)
- Kształty ust z arkusza wizemów (`reference/arkusz-wizemy_2026-10-27.png`, `tools/wizemy_z_arkusza.py`): a, e, i, o, u (dzióbek), m/b/p, f/w (zęby na wardze), l, t/d/n, k/g, s/z/c, sz/ż/cz/dż, r, ch/h, lekko otwarte, zamknięte. Wyrównanie do nosa (0,95–0,98), skala 1,13, obrót −9,5°, jasność i nasycenie dopasowane do skóry, przygaszony połysk. Odrzucone: szeroko otwarte i język (wychodzą poza maskę), Y (na arkuszu narysowane jak dzióbek).
- Przejścia między kształtami: 3 fazy pośrednie z przepływu optycznego (`tools/morph_ust.py`, 376 kafelków, `lip/usta-morph.webp` 560 KB), przejście 72 ms; nigdy dwa różne kształty w kolejnych klatkach (przy słabym procesorze wstawiana faza pośrednia).
- Zaokrąglenie warg przed o/u/sz także na t, d, k, s, l, r (ostatnie 50 ms spółgłoski).
- Rozmycie ściany z logo wypalone w klipach (`tools/maska-rozmycia.png`, gblur σ=3,9) — wcześniej liczone na żywo, co obniżało płynność z 60 do 20 kl/s; ziarno przesuwane transformacją (GPU). Strona: 60 kl/s.
- Klipy: idle_v2, powitanie_v3, obieg-1_v3, wejscia_v2, poster_v2 (te same klatki, rozmycie wypalone).
- Arkusz mimiki (`reference/arkusz-mimika_2026-10-27.png`): pojedyncze obrazy — miny i obroty głowy wymagają klipów Veo; na razie tylko jako wzorzec do promptów.

## Plan
1. Ujęcia obiegu: 05 odczyt, 06 analiza, 08 segregowanie, 12 odłożenie (prompty w `docs/ujecia.md`).
2. Poprawki logo na ścianie → nowy kadr bazowy (wtedy klipy generujemy już z niego).
3. Analiza treści plików przez Claude API i zapis notatek prosto do vaulta Obsidiana.
4. Głos: synteza mowy (np. ElevenLabs) + klipy mówienia / lip-sync; rozmowa z poziomu Obsidiana.
