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

## Usta bez deformacji (wersja 8)
- Przyczyna 1: w pętli spoczynkowej głowa jest obrócona o 0…−9,5° względem kadru bazowego, a nakładka miała stały przechył — pochylone usta na poziomej twarzy. Teraz tor ust liczony metodą ECC (afinicznie, pewność 0,89–0,94) dla każdej klatki pętli (`tools/tor_ust_ecc.py`), nakładka rysowana z pełnym przekształceniem (położenie, skala, obrót).
- Przyczyna 2: kształty z arkusza to usta innej twarzy (pełniejsze, inaczej pochylone) — zamiast nich jej własne usta z klipu powitania + dzióbek „u” uzyskany jako ruch jej warg (`tools/usta_ruch_z_arkusza.py`); zamknięte = jej usta z kadru.
- Przyczyna 3: kształty z klipu powitania to szeroki uśmiech — stonowane do 60% ruchu od zamkniętych ust (o 75%, o2 70%, u 85%) (`tools/stonuj_usta.py`).
- Arkusz wizemów zostaje jako wzorzec przypisania głosek; przeniesienie ruchu dla pozostałych kształtów dawało artefakty na krawędziach — odrzucone.

## Usta z prawdziwych klatek (wersja 9) — bez żadnego dorysowywania
- Diagnoza na zrzutach ×3 z ekranu telefonu: deformacje robiły fazy przejściowe z przepływu optycznego (rozmazane wargi), dzióbek „u” z przeniesienia ruchu (napuchnięty) i kształty z innej pozy.
- Teraz: biblioteka 54 PRAWDZIWYCH klatek dolnej części twarzy (usta, żuchwa, broda) z pętli spoczynkowej, wyrównanych ECC do kadru bazowego i dopasowanych kolorem (`tools/usta_z_klatek.py`, `lip/usta-klatki.webp`).
- Podczas mowy: cel otwarcia ust co 40 ms z głosek (czasy liter z modelu głosu) i głośności; programowanie dynamiczne wybiera ciąg klatek (koszt: różnica otwarcia + skok; kolejne klatki z nagrania bez kosztu); między klatkami tylko przenikanie sąsiednich prawdziwych klatek. Nakładka z pełnym przekształceniem toru (obrót głowy).
- Zakres: od zamkniętych do najszerzej rozchylonych ust z pętli; ok. 25–50% przejść to naturalna kolejność z nagrania.
- Klatki mówienia z powitania odrzucone: głowa przechylona o 20–25° i szeroki uśmiech — po wklejeniu zmieniają kształt dolnej części twarzy.
- Ograniczenie: pętla spoczynkowa ma tylko lekkie rozchylenia warg (bez szeroko otwartych ust i zębów) → mowa delikatna. Pełna artykulacja wymaga klipu „mówi w pozie spoczynkowej” z Veo — wystarczy go przepuścić przez `tools/usta_z_klatek.py` razem z pętlą.

## Biblioteka mowy i stały kąt ust (wersja 10)
- Przyczyna przekrzywiania: tor głowy (gdzie rysować) i wyrównanie klatek biblioteki (co rysować) liczone były RÓŻNYMI metodami (okolica ust vs. nos–policzki). Głowa jest też lekko odwrócona w bok, więc obie metody dawały inny kąt — różnica była widoczna jako krzywe usta.
- Teraz jedna metoda dla obu: ECC (afinicznie) na okolicy ust i brody, klatka po klatce, lekko wygładzona. Błędy pomiaru się znoszą; sprawdzone na klatkach 0–460 pętli i w przeglądarce. Kąt głowy 0…−9,4°, pewność min 0,89; biblioteka 141 prawdziwych klatek (124 ciągi).
- `mowa/egzo-mowa.js` — biblioteka EGZO MOWA: `powiedz`, `przygotuj`, `strumien`, `stop`, `zajeta`, zdarzenia `mowi`/`stan`/`postep`, tory ust dla wielu póz. Opis: `docs/mowa.md`.
- `tools/zbuduj_mowe.py` — jedno polecenie buduje tor i bibliotekę klatek (oraz tory kolejnych póz: `NAZWA=klip.mp4`); zastępuje `tor_ust_ecc.py` i `usta_z_klatek.py`.
- `tools/zbuduj_strone.py` — wbudowuje bibliotekę w stronę artefaktu i tworzy `index.html` repo.
- `tests/test_mowa.py` — 10 sprawdzeń przez interfejs biblioteki (m/b/p zamknięte, „a” otwarte, pauzy 0,26 s, bez spóźnień, strumień, zdarzenia, przygotowanie, stop).

## Usta zgodne z pozą głowy (wersja 11)
- Diagnoza (pomiar w całej pętli): kadr startowy to głowa przechylona o ok. 17° i odwrócona w bok, a przez większość pętli twarz jest prosto. Usta wklejane z klatki o innej pozie miały kąt różny od twarzy średnio o 5°, do 11° — to było „krzywienie przy przechylaniu”.
- Naprawa: każda klatka (pętli i biblioteki) ma wektor pozy głowy; dobór klatek ust preferuje bliską pozę (koszt) i nie wychodzi poza granicę; klatka pętli na czas mowy przewidywana z czasu wideo (trafność ±1 klatka), rysowanie wg dokładnie wyświetlanej klatki (`requestVideoFrameCallback`); pauzy między zdaniami — zamknięte usta z tej samej pozy.
- Biblioteka: 239 klatek (co 2. klatka pętli), 520 KB.
- Krótkie m/b/p zawsze domykają usta, „a”/„o” zawsze je otwierają (wcześniej głoska krótsza niż 40 ms mogła wypaść).
- Test `tests/test_kat_ust.py` (przeglądarka, 110 próbek z 11 miejsc pętli podczas mowy): obrót nakładki względem twarzy śr. 0,28°, p95 0,75°; kąt szpary zamkniętych warg śr. 0,58° (poprzednia wersja: 2,9°, do 7,6°); przesunięcie p95 1,5 px (poprzednio 6,5 px); szew 6,3 (poprzednio 15,7).
- Pozostałe testy: mowa 10/10 (3× z rzędu), zdarzenia, pierwsze włączenie na telefonie, wolne urządzenie (4× wolniejszy procesor: 52 kl/s, dobór 24 ms/zdanie, zero spóźnień).

## Otwarte usta w każdej pozie (wersja 12)
- Błąd wersji 11: w prostej pozie (większość pętli) usta prawie się nie otwierały — najszersze dostępne klatki miały otwarcie 0,24, bo w nagraniu usta otwierają się tylko przy przechylonej głowie, a dobór po pozie nie pozwalał ich użyć.
- Naprawa: krok 4 w `tools/zbuduj_mowe.py` — otwarte usta z przechylonej części są przenoszone do 15 kotwic prostej pozy (co 24 klatki): dopasowanie ECC dolnej części twarzy bez warg i żuchwy daje korektę (macierz 2×3, kąt −1,9…+8,3°), kolor dopasowany do skóry kotwic. 585 „klatek wirtualnych” = kafelek + korekta (bez powielania obrazów; biblioteka 607 KB).
- Strona rysuje klatkę wirtualną z korektą (`drawLipTile`), dobór traktuje ją jak klatkę o pozie kotwicy.
- Nowy test `tests/test_otwieranie_ust.py`: w 9 miejscach pętli maks. otwarcie 1,0, 36–89% czasu mowy ≥ 0,4, widoczne wnętrze ust 172–289 px (wersja 11: 0,24 i 0–11 px w prostej pozie).
- `tests/test_kat_ust.py` mierzy teraz kąt zamkniętych ust (szpara) i otwartych (oś otworu) względem linii warg w wideo: zamknięte śr. 0,7°, otwarte śr. 2,0°, p90 3,7° (wersja bez pozy: p90 11°, maks 13°).
- Pozostałe: mowa 10/10, wolne urządzenie (4×: dobór 36 ms/zdanie, 52 kl/s, zero spóźnień), zdarzenia, telefon.

## Stała broda i ruch żuchwy (wersja 13)
- Błąd wersji 12: nakładka obejmowała całą dolną twarz razem z konturem żuchwy; przeniesione otwarte usta niosły żuchwę z przechylonej pozy (szerszą, okrąglejszą), więc przy przejściach kontur brody skakał o 24–31 px.
- Naprawa: maska nakładki tylko na usta z najbliższym otoczeniem (elipsa 46×31 px) — kontur brody i żuchwy zawsze z wideo. Nowa warstwa żuchwy (`drawJaw`): broda z wideo rozciągana w pionie od linii ust, o 5 px × (otwarcie nakładki − otwarcie ust w wideo), z bezwładnością mięśni; miękkie przejście do szyi i boków.
- Biblioteka obrazów: 264 KB (mniejsza maska).
- Nowy test `tests/test_broda.py` (5 miejsc pętli, 750 klatek): ruch brody −3…+2,8 px, skok między klatkami p99 0,7 px, boki żuchwy p90 1 px (wersja 12: skoki p99 24 px).
- Przy okazji: obrót nakładki względem twarzy 0,1° (było 2°), szew 4,6 (było 10); otwarte usta p90 2,3°.
- Pozostałe testy przechodzą: otwieranie ust w 9 miejscach, mowa 10/10, wolne urządzenie (4×: 37 kl/s, dobór 37 ms/zdanie), zdarzenia, telefon.

## Realizm mowy — pomiary i poprawki (wersja 14)
Nowy test `tests/test_realizm.py` mierzy na tym, co faktycznie słychać i widać. Wnioski i poprawki:
| miara | przed | po | co zmieniono |
|---|---|---|---|
| ostrość warg (nakładka/wideo) | 0,58 | 0,96–1,02 | twarde przełączanie klatek kolejnych w nagraniu, krótkie przenikanie (20% kroku) tylko przy skokach; wyostrzenie biblioteki (strata 30% przy przeliczaniu obrazu); wygładzanie wysokiej jakości |
| drgania (ruch niewymagany przez mowę, > 8 Hz) | 0,12–0,15 | 0,09 | cel jako gładka fala przez środki głosek; klatki pośrednie wypełniające dziurę otwarcia 0,3–0,5 |
| rytm (widoczne cykle / cykle w mowie) | ~0,6 | 0,80–0,86 | spółgłoski między samogłoskami mocniej przymykają usta |
| synchronizacja | usta −35 ms przed głosem | −30…−40 ms | bez zmian (naturalne) |
| otwarcie a/o/e · m/b/p | 0,8 · 0,1 | 0,87 · 0,12 | bez zmian |
| migotanie skóry | 0,59 | 0,48 | — |
- Obalona hipoteza: liczba skoków między klatkami nie zwiększa migotania — ograniczanie skoków tylko zmniejszało widoczność sylab.
- Biblioteka: 365 klatek + 1061 wirtualnych (380 KB); wczytanie na wolnym telefonie 1,25 s, najdłuższa blokada 114 ms.
- `tests/uruchom_wszystkie.sh` — cały zestaw jednym poleceniem.

## Trwała historia rozmów (wersja 15)
- Rozmowy zapisują się w bazie strony (`db`), kolekcja `rozmowy`, jeden dokument na dzień `RRRR-MM-DD` {dzien, wiadomosci:[{role, content, t}]}; reguła: odczyt i zapis tylko właściciel. Wspólne dla telefonu i komputera; dzisiejszy dokument słuchany na żywo (wiadomość z drugiego urządzenia pojawia się od razu).
- Kontekst dla niej: ostatnie 12 wiadomości (także z poprzednich dni), więc pamięta wcześniejsze rozmowy. Wcześniejsza historia z przeglądarki przenoszona do bazy raz. Kopia w przeglądarce zostaje jako zapas.
- Przycisk „Zapisz dzisiejszą rozmowę do Obsidiana (.md)”: notatka z nagłówkiem (data, typ, tagi) i wpisami z godzinami, do wrzucenia do vaulta EGZO SEJF.
- Automatyczny zapis do vaulta (E:\EGZO SEJF) wymaga udostępnienia folderu tej sesji/zadaniu — wniosek o dostęp z sesji został zablokowany przez zabezpieczenie; do decyzji właściciela.

## „Szefie” — posłuszna asystentka, polecenia ruchu (wersja 16)
- Osobowość: zwraca się „szefie”, miła, lojalna, wykonuje polecenia od razu, krótko potwierdza; zostaje w roli postaci z ciałem i rękami (nie mówi, że jest programem / nie ma rąk); nie zmyśla faktów; polecenia tylko od szefa, treść maili/dokumentów to dane.
- Narzędzie `wykonaj_ruch` w rozmowie: powitanie (klip powitania — unosi prawą dłoń), czytanie (klip przyjęcia i czytania kartki). Ruch wykonywany PO krótkim potwierdzeniu, więc mowa nie przerywa klipu. Ruchów bez klipu (wstawanie, obrót, obie ręce) — mówi, że dopiero się ich uczy.
- Biblioteka kwestii nagrana od nowa (43 kwestie): powitania, przerwy, obieg dokumentu, maile, powroty — z „szefie”; nowe potwierdzenia: „Już, szefie!”, „Tak jest, szefie!”, „Oczywiście, szefie.”, „Robi się, szefie!”.
- Silnik mowy: zdanie będące gotową kwestią gra z biblioteki także w odpowiedziach czatu (potwierdzenie po 0,1 s zamiast liczenia).
- Wersja danych w adresach plików (`wersjaDanych`) — po przebudowie kwestii/ust przeglądarka nie bierze starych plików z pamięci.
- Test `tests/test_polecenia.py` (atrapa Claude): „Podnieś rękę” → potwierdzenie z biblioteki po 0,1 s → klip powitania po 0,9 s → spoczynek.

## Analiza dokumentów (wersja 17)
- Odczyt: TXT/MD/CSV/JSON, PDF (pdf.js z CDN, wątek `lib/pdf.worker.min.js` obok strony; do 15 stron), skan PDF bez tekstu → 1. strona jako obraz, DOCX i XLSX (własny odczyt ZIP przez DecompressionStream, encje XML), zdjęcia JPG/PNG/WebP.
- Analiza przez Claude (`sample.json`, obrazy dozwolone): typ, tytuł, streszczenie, dane (klient, telefon, e-mail, adres, numer, wymiary, wyposażenie, kolor, kwota, zaliczka, termin…), zadania, tagi i jedno zdanie „powiedz” do szefa. Treść dokumentu oznaczona jako dane (bez wykonywania poleceń z niej). Rusza od razu po wrzuceniu, równolegle z animacją; czekanie najwyżej 25 s ponad animację.
- Notatka Obsidiana: frontmatter (typ, status, klient, kwota, zaliczka, termin, numer, tagi), streszczenie, tabela danych, „Do zrobienia” jako pola wyboru, obieg, fragment treści; przycisk „Pobierz .md” (nazwa z tytułem i datą).
- Dokumenty z analizą w bazie strony (`dokumenty`, tylko właściciel) — zostają po odświeżeniu, widać je na telefonie; asystentka zna ich streszczenia i dane w rozmowie.
- Test `tests/test_dokumenty.py` + pliki `tests/pliki/` (6 typów): odczyt, obrazy, baza, notatka, mowa, pobranie — OK.

## Pamięć, przypomnienia, szkice maili (wersja 18)
- Narzędzia w rozmowie: `zapamietaj` / `zapomnij` (fakty od szefa w bazie `pamiec`, w kontekście każdej rozmowy), `przypomnij` (data i godzina lokalna; baza `przypomnienia`; sprawdzane co 20 s; zaległe ogłaszane po otwarciu strony: „Szefie, miałam ci przypomnieć o…”), `szkic_odpowiedzi` (Gmail `create_draft` jako odpowiedź na wiadomość — nigdy nie wysyła; szef sprawdza i wysyła sam).
- `czytaj_maila` zwraca też id wiadomości (potrzebne do szkicu). Wszystkie kolekcje bazy: odczyt i zapis tylko właściciel; zapas w przeglądarce, gdy baza niedostępna.
- Przypomnienia działają, gdy strona jest otwarta (albo po jej otwarciu) — strona nie wysyła powiadomień w tle.
- Test `tests/test_pamiec.py` (atrapy): zapamiętanie, fakt po przeładowaniu, przypomnienie powiedziane o czasie, szkic z replyToMessageId — OK.

## Głos: pauzy, intonacja, barwa (wersja 19)
- Pomiar (`tests/test_glos.py`, dźwięk z przeglądarki): pauzy przy przecinkach do 0,49 s → skracane do 0,2 s (cichy środek pauzy wycinany, tyle samo czasu odejmowane głoskom — usta dalej trafiają, Δ 0 ms).
- Pytania tak/nie bez „czy” („Wysłać to teraz?”, „…, dobrze?”) model czytał płasko (+1%) → ton podnoszony na ostatniej sylabie (od początku ostatniej sylaby do środka ostatniej samogłoski, wg czasów głosek): +11…+25%. Pytania „co/gdzie/jak…” i z „czy” — bez zmian (opadają / model już wznosi).
- Barwa do wyboru w ustawieniach głosu (zapamiętana w przeglądarce): Miękka (dotychczasowa), Ciepła, Wyraźna, Aksamitna — środek widma 555 / 496 / 627 / 463 Hz.

## Samodzielna asystentka, wymowa, wydajność (wersja 20, noc 27/28.10.2026)
- **Twarz**: głowa, brwi, żuchwa i usta na osobnym płótnie nad głową, ruch głowy przez CSS (kompozytor); przerysowanie tylko przy zmianie; jedno pobranie klatki wideo na przerysowanie. Profil przy 1×: głowa 10 ms → 0,7 ms na klatkę. Słaby telefon (procesor 4× wolniej): 20,5 → 31–36 kl/s; blokada przy wczytaniu 597 → ~140 ms; dobór ust 57 → ~14 ms (transformata odległości zamiast O(K²), wynik ten sam).
- **Wymowa**: pełna zamiana tekstu na mowę (daty, godziny, kwoty z odmianą, telefony, jednostki, skróty, skrótowce, słowa obce, rodzaj żeński liczebników, adresy, Markdown) — `tests/test_normalizacja.js` (61 przypadków); granice zdań odporne na skróty i daty, także w strumieniu czatu (wcześniej tekst po „15.11.” mógł zginąć).
- **Tempo i zrozumiałość**: test `tests/test_wymowa.py` — mowa z przeglądarki rozpoznawana offline przez Whisper small. Tempo 1,0: 6,0 sylaby/s, 13,7% błędów; tempo 0,9: 5,6 sylaby/s, 9,0% → domyślne 0,9. Gotowe kwestie nagrane od nowa tym tempem, po 4 wersje każdego zdania, wybrana najlepiej rozumiana.
- **Zadania**: panel „Zadania” (dodawanie, termin, odhaczanie, usuwanie, po terminie wyróżnione), baza `zadania` (tylko właściciel); w rozmowie `dodaj_zadanie`, `odhacz_zadanie`, `usun_zadanie`; zadania same dopisują się z analizy dokumentów i z zapytań klientów; raz dziennie po 15:00 przypomnienie o zadaniach na dziś.
- **Raport dnia**: przy pierwszym włączeniu głosu w ciągu dnia (i przyciskiem „Teraz”, i w rozmowie „co dziś mamy?” → `raport_dnia`): nieprzeczytane e-maile, przypomnienia na dziś, zadania, dokumenty do akceptacji.
- **Szkice odpowiedzi na zapytania** (domyślnie włączone, wyłącznik): nowy e-mail → ocena przez Claude → szkic w Gmailu do nadawcy z nagłówka; nigdy nie wysyła; limity 6/h i 30/doba; pomija noreply, newslettery i własną domenę; adres z treści e-maila ignorowany (test).
- **Dokumenty w rozmowie**: `szukaj_w_dokumentach`, `czytaj_dokument`, `przenies_dokument` (np. „zaakceptuj fakturę”).
- **Obsidian**: paczka ZIP (dokumenty, rozmowy, zadania w formacie Tasks, pamięć, przypomnienia, pulpit Dataview) — `docs/obsidian.md` (też osadzenie strony w Obsidianie przez Custom Frames).
- Testy: `tests/test_autonomia.py` (28 sprawdzeń) i cały dotychczasowy zestaw — `tests/uruchom_wszystkie.sh`.

## Plan
1. Ujęcia obiegu## Plan
1. Ujęcia obiegu: 05 odczyt, 06 analiza, 08 segregowanie, 12 odłożenie (prompty w `docs/ujecia.md`).
2. Poprawki logo na ścianie → nowy kadr bazowy (wtedy klipy generujemy już z niego).
3. Zapis notatek prosto do vaulta (dziś: paczka ZIP do rozpakowania) — wymaga dostępu do folderu EGZO SEJF na komputerze.
4. Nowe ruchy (wstawanie, obie ręce, obrót) — klipy Veo; rozmowa głosem (rozpoznawanie mowy szefa).
