# Ruchy asystentki (polecenia i samodzielne)

## Katalog

`RUCHY_KAT` w stronie (`index.html`): każdy ruch ma opis i listę wariantów (plików). Za każdym razem gra inny wariant
(losowo, nigdy ten sam dwa razy z rzędu). Brakujące pliki są pomijane: lista `PLIKI_RUCHOW` mówi, które klipy są
w danej wersji strony; ruch bez żadnego pliku jest dla Claude „niedostępny”.

| ruch | polecenia (przykłady) | sama |
|---|---|---|
| powitanie, pomachaj | „przywitaj się”, „pomachaj” | tak |
| wstan | „wstań” | tak |
| odwroc_sie | „odwróć się”, „obróć się”, „pokaż się od tyłu” | — |
| klaszcz | „zaklaszcz”, „brawo” | — |
| aaa | „otwórz szeroko buzię”, „powiedz aaa” | — |
| przeciagnij_sie | „przeciągnij się” | tak |
| nogi_na_biurku, pochyl_sie, podaj_kartke | „połóż nogi na biurku”, „pochyl się”, „podaj mi kartkę” | — |
| czytanie | „poczytaj” | — |

Polecenia idą przez czat: Claude wywołuje narzędzie `wykonaj_ruch` (kilka ruchów = kilka wywołań, najwyżej 4),
odpowiada krótkim potwierdzeniem, ruch rusza po nim.

## Przejścia bez szwu

- **Przedłużenia pętli z Higgsfield** (Seedance 2.5, tryb `video_extension` od pierwszych 10 s pętli): klip zaczyna się
  w klatce 239 pętli (`ZPETLI`). Gdy pętla dojdzie do tej klatki w ciągu 2,5 s — czyste cięcie; inaczej krótkie
  przenikanie podobnych póz. Po klipie pętla wraca od tej samej klatki.
- **Klipy w innej pozie/stroju** (`miekko`): wejście i wyjście przez przenikanie.
- Usta nakładane są tylko na pętlę; w trakcie ruchu mowa gra bez nakładki.

## Rusza się sama

Ramka „Ona sama powie” → **Rusza się sama** (często ≈ 4 min / czasem ≈ 10 min / rzadko ≈ 25 min, ±30%).
Tylko gdy strona jest widoczna, nic nie mówi, nie ma rozmowy ani zdarzeń, a szef nic nie klikał przez ten czas.
Losuje spośród ruchów oznaczonych `sama`.

## Jak dodać ruch

1. Higgsfield → Seedance 2.5, tryb `video_extension` (forward), źródło: wideo pętli (pierwsze 10 s), 720p,
   prompt: „Continue the shot seamlessly. Static locked-off camera, same woman… ends in exactly the same seated pose
   holding the document as at the start.”
2. Plik `egzo-ruch-NAZWA_RRRR-MM-DD.mp4` do `media/`, wpis w `RUCHY_KAT` i w `PLIKI_RUCHOW`.
3. Polecenia dla Claude: zdanie „Ruchy:” w osobowości.
