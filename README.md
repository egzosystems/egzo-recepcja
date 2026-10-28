# EGZO Recepcja

Animowana recepcja EGZO SYSTEMS: realistyczna asystentka przy biurku z tackami
**NOWE → W TRAKCIE → DO AKCEPTACJI → ZAKOŃCZONE**. Wrzucasz plik, ona go przyjmuje,
czyta i odkłada, a wynik trafia jako notatka do Obsidiana. Docelowo rozmowa z nią
(pisanie lub głos) z poziomu Obsidiana.

## Uruchomienie

Zwykła strona bez budowania:

```bash
npx http-server -p 8000   # serwer z obsługą przewijania wideo
# otwórz http://localhost:8000
```

Przycisk **Studio** w nagłówku pokazuje listę ujęć, prompty do generatora i suwaki kamery.
Klawisz **L** blokuje kamerę.

## Jak to działa

- **Silnik stanów.** 15 ujęć (`STATES` w `index.html`). Każde ujęcie to klip wideo; przejścia to przenikanie 0,45 s między dwoma elementami `<video>`.
- **Wspólny kadr bazowy.** Każdy klip zaczyna się i kończy kadrem `media/egzo-poster_2026-10-27.jpg`, więc klipy łączą się bez szwu.
- **Wejście w pętlę.** Po klipie pętla bazowa startuje w klatce najbardziej podobnej do końca klipu (`exitAt`).
- **Pomijanie brakujących ujęć.** W obiegu dokumentu grają tylko ujęcia z klipem; brakujące są pomijane, żeby kamera nie najeżdżała na pusty ruch.
- **Kamera.** Sprężyna z tłumieniem (bezwładność), podąża za punktem akcji ujęcia, delikatny dryf „z ręki”, blokada.
- **Nakładki.** Ostre tabliczki na tackach z licznikami, rozmycie ściany z logo, ziarno filmowe.

## Co potrafi asystentka

- **Mówi** głosem Mai (liczonym w przeglądarce, bez opłat), z ustami z prawdziwych klatek jej twarzy, ruchem głowy,
  brwi i żuchwy; liczby, daty, kwoty i skróty czyta poprawnie po polsku (`docs/mowa.md`).
- **Rozmawia** (Claude) i wykonuje polecenia „szefa”: ruchy, pamięć, przypomnienia, zadania, dokumenty, maile.
- **Czyta dokumenty** (PDF, skany, Word, Excel, zdjęcia), analizuje je i robi notatki do Obsidiana.
- **Sama**: raport dnia, szkice odpowiedzi na zapytania klientów w Gmailu (nigdy nie wysyła), zadania z dokumentów
  i e-maili, przypomnienia o terminach i przerwach.
- **Obsidian**: paczka ZIP z notatkami i pulpitem Dataview, osadzenie strony w panelu (`docs/obsidian.md`).

Testy: `tests/uruchom_wszystkie.sh` (serwer testowy: `python3 tools/serwer_testowy.py`).

## Struktura## Struktura

| Ścieżka | Co tam jest |
|---|---|
| `index.html` | cała aplikacja (HTML + CSS + JS, bez zależności) |
| `media/` | klipy gotowe dla silnika i kadr bazowy |
| `source-clips/` | surowe klipy z Veo (Gemini) — źródło do ponownej obróbki |
| `reference/` | kadr referencyjny i arkusz 15 póz |
| `docs/ujecia.md` | status ujęć i prompty do Veo |
| `docs/stan-projektu.md` | decyzje, wnioski, plan |
| `docs/mowa.md` | biblioteka mowy: głos, usta, tekst do czytania, tempo, wydajność |
| `docs/obsidian.md` | paczka do Obsidiana, Dataview, osadzenie strony, co asystentka robi sama |
| `mowa/egzo-mowa.js` | biblioteka mowy (wbudowywana w stronę przez `tools/zbuduj_strone.py`) |
| `tests/` | testy w przeglądarce (Playwright) i testy bez przeglądarki |
| `tools/clips.sh` | pętla tam-i-z-powrotem, sklejanie z domknięciem, poster |
| `tools/find_join.py` | szukanie najlepszego miejsca sklejenia dwóch klipów |
| `tools/seam.py` | sklejanie z interpolacją ruchu i zakończenie w klatce pętli |
| `tools/entry_pack.py` | paczka wejść z pętli bazowej do kadru startowego |

Wymagania narzędzi: `ffmpeg`, `python3` z `numpy`.

## Nazewnictwo plików

Nazwy zawierają datę `RRRR-MM-DD`, kolejne wersje dostają przyrostek `_v2`, `_v3`.
