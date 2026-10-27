# EGZO Recepcja

Animowana recepcja EGZO SYSTEMS: realistyczna asystentka przy biurku z tackami
**NOWE → W TRAKCIE → DO AKCEPTACJI → ZAKOŃCZONE**. Wrzucasz plik, ona go przyjmuje,
czyta i odkłada, a wynik trafia jako notatka do Obsidiana. Docelowo rozmowa z nią
(pisanie lub głos) z poziomu Obsidiana.

## Uruchomienie

Zwykła strona bez budowania:

```bash
python3 -m http.server 8000
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

## Struktura

| Ścieżka | Co tam jest |
|---|---|
| `index.html` | cała aplikacja (HTML + CSS + JS, bez zależności) |
| `media/` | klipy gotowe dla silnika i kadr bazowy |
| `source-clips/` | surowe klipy z Veo (Gemini) — źródło do ponownej obróbki |
| `reference/` | kadr referencyjny i arkusz 15 póz |
| `docs/ujecia.md` | status ujęć i prompty do Veo |
| `docs/stan-projektu.md` | decyzje, wnioski, plan |
| `tools/clips.sh` | pętla tam-i-z-powrotem, sklejanie z domknięciem, poster |
| `tools/find_join.py` | szukanie najlepszego miejsca sklejenia dwóch klipów |

Wymagania narzędzi: `ffmpeg`, `python3` z `numpy`.

## Nazewnictwo plików

Nazwy zawierają datę `RRRR-MM-DD`, kolejne wersje dostają przyrostek `_v2`, `_v3`.
