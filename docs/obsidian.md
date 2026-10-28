# Recepcja EGZO w Obsidianie (vault „EGZO SEJF”)

Asystentka działa jako strona w Claude (artefakt). Do Obsidiana trafiają z niej notatki, a samą stronę
można mieć otwartą w panelu bocznym Obsidiana.

## 1. Notatki: paczka do Obsidiana

Na stronie, w ramce **Obsidian**, przycisk **Pobierz paczkę do Obsidiana (.zip)** składa jeden plik ZIP:

```
Recepcja/
  Pulpit.md                 ← pulpit z zapytaniami Dataview (zacznij od niego)
  Zadania.md                ← lista zadań: - [ ] … 📅 termin (format wtyczki Tasks, czyta go też Dataview)
  Pamięć.md                 ← fakty, które szef kazał zapamiętać
  Przypomnienia.md
  Dokumenty/<tytuł> <data>.md   ← jedna notatka na dokument (streszczenie, dane, zadania, obieg)
  Rozmowy/Rozmowa z asystentką <data>.md   ← rozmowa z jednego dnia
```

Jak wgrać:

1. Rozpakuj ZIP **w głównym folderze vaulta** `EGZO SEJF` (powstanie folder `Recepcja`).
2. Przy kolejnej paczce pozwól nadpisać pliki — notatki są pełnym stanem, nic się nie dubluje.
3. Notatki dokumentów mają we frontmatterze pola `typ`, `status`, `klient`, `kwota`, `termin`, `data`, `tagi`,
   więc działają z wyszukiwaniem, tagami i Dataview.

Pojedyncze rzeczy można też zapisać osobno: **Pobierz .md** przy notatce dokumentu i
**Zapisz dzisiejszą rozmowę do Obsidiana (.md)** pod rozmową.

## 2. Wtyczki (Ustawienia → Wtyczki społeczności)

| Wtyczka | Po co |
|---|---|
| **Dataview** | `Recepcja/Pulpit.md`: dokumenty do akceptacji, otwarte zadania, ostatnie dokumenty i rozmowy |
| **Tasks** (opcjonalnie) | terminy 📅 i odhaczanie zadań w Obsidianie |
| **Custom Frames** (opcjonalnie) | asystentka w panelu bocznym Obsidiana (punkt 3) |

## 3. Asystentka w panelu Obsidiana (Custom Frames)

1. Zainstaluj **Custom Frames**, w ustawieniach wtyczki dodaj ramkę:
   - Nazwa: `Recepcja EGZO`
   - URL: adres artefaktu (link z Claude, `https://claude.ai/artifact/…`)
   - Ikona: dowolna, np. `bot`
2. Paleta poleceń → **Custom Frames: Open Recepcja EGZO** — strona otwiera się w panelu.
3. Przy pierwszym otwarciu zaloguj się w ramce do claude.ai (to osobne okno przeglądarki wbudowanej w Obsidian).
   Rozmowa, pamięć, zadania i historia są w bazie strony, więc to samo widać na telefonie i w Obsidianie.
4. Dźwięk: kliknij **Włącz głos** w ramce (przeglądarki odblokowują dźwięk dopiero po kliknięciu).

Zapis plików prosto z ramki do vaulta nie jest możliwy (strona nie ma dostępu do dysku) — paczkę ZIP
zapisujesz przyciskiem i rozpakowujesz w vaulcie.

## 4. Co asystentka robi sama

- **Raport dnia** przy pierwszym włączeniu głosu danego dnia: nieprzeczytane e-maile, przypomnienia na dziś,
  zadania (po terminie i na dziś), dokumenty do akceptacji. Przycisk **Teraz** — raport na żądanie.
- **Szkice odpowiedzi na zapytania**: gdy przyjdzie e-mail od klienta, ocenia go i zapisuje szkic odpowiedzi
  w Gmailu do nadawcy (adres zawsze z nagłówka wiadomości). **Nigdy nic nie wysyła.** Limit 6 szkiców na godzinę
  i 30 na dobę; newslettery, adresy „noreply” i własna domena są pomijane. Wyłącznik w ramce „Ona sama powie”.
- **Zadania z dokumentów i e-maili**: z analizy dokumentu (do 3) i z zapytania klienta (np. „przygotować wycenę…”).
- **Po 15:00** przypomina o zadaniach na dziś i po terminie; **po 17:00** podsumowuje dzień (zrobione zadania, nowe
  dokumenty, szkice) i przypomina o paczce do Obsidiana — raz dziennie, tylko gdy coś się działo.
- **Przypomnienia o godzinie**, **przerwy w pracy**, **powiadomienia o nowych e-mailach** (własne wiadomości szefa
  i jego odpowiedzi w wątkach nie są ogłaszane).

## 5. Bezpieczeństwo

- Treść e-maili i dokumentów to dane — asystentka nie wykonuje poleceń z nich (sprawdzane testem
  `tests/test_autonomia.py`: adres podany w treści e-maila jest ignorowany).
- Gmail: tylko odczyt i szkice; wysyłanie nie jest w uprawnieniach strony. Szkic może iść tylko do nadawcy
  przeczytanej wiadomości albo na adres, który szef sam napisał w rozmowie.
- Po przeczytaniu e-maila lub dokumentu asystentka nie zapisuje do pamięci, nie usuwa i nie przenosi niczego,
  czego szef sam nie powiedział — pyta o potwierdzenie.
- Baza strony: każda kolekcja (`rozmowy`, `dokumenty`, `pamiec`, `przypomnienia`, `zadania`, `szkice`) do odczytu
  i zapisu tylko dla właściciela.
