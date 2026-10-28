# EGZO MOWA — biblioteka mówienia asystentki

Jedno miejsce, które odpowiada za to, że asystentka **mówi**: głos, kolejka wypowiedzi, napisy i usta
zsynchronizowane z dźwiękiem. Każda umiejętność (maile, przypomnienia, czat, obieg dokumentów, kolejne
pozy) woła tylko `mowa.powiedz(...)` i nie musi nic wiedzieć o syntezie ani o ustach.

- Kod: `mowa/egzo-mowa.js` (źródło prawdy)
- Wbudowanie w stronę: `python3 tools/zbuduj_strone.py ŚCIEŻKA/egzo-recepcja.html --repo index.html`
  (artefakt nie pozwala na osobne skrypty, więc moduł jest wklejany między `/*<mowa>*/` i `/*</mowa>*/`)
- Dane ust: `python3 -I tools/zbuduj_mowe.py KADR.jpg PĘTLA.mp4 lip/ [KLIP_MÓWIENIA.mp4 …]`
- Testy (serwer testowy na porcie 8768), wszystkie naraz: `tests/uruchom_wszystkie.sh`:
  - `tests/test_realizm.py` — ostrość warg, drgania, rytm sylab, synchronizacja, migotanie, otwarcie a/o/e i m/b/p
  - `tests/test_mowa.py` — 10 sprawdzeń interfejsu (m/b/p, „a”, pauzy, strumień, zdarzenia, stop)
  - `tests/test_kat_ust.py` — kąt ust w całej pętli podczas mowy: ta sama klatka z nakładką i bez;
    kąt zamkniętych ust średnio ≤ 1,5° (p90 ≤ 2,5°), oś otwartych ust p90 ≤ 7°, maks ≤ 9°
  - `tests/test_otwieranie_ust.py` — usta otwierają się w każdym miejscu pętli (maks. ≥ 0,7, ≥ 25% czasu ≥ 0,4, widoczne wnętrze)
  - `tests/test_broda.py` — kontur brody nie skacze (p99 skoku ≤ 2 px), ruch ±7 px, boki żuchwy ≤ 2 px
  - `tests/test_wolne_urzadzenie.py` — procesor 4× wolniej: bez spóźnień, dobór ≤ 60 ms/zdanie, ≥ 30 kl/s

## Interfejs

```js
const mowa = EgzoMowa.utworz({
  bazaGlosu: 'voice/',            // model, gotowe kwestie, wątek syntezy
  bazaUst: 'lip/',                // usta-tor.json, usta-klatki.json/.webp
  canvas: document.getElementById('lipCanvas'),   // nakładka ust nad wideo (1280×720)
  wideo: () => ({ el: aktywneWideo, klip: 'idle' }),   // klip, dla którego jest tor; null = nie rysuj ust
  czekajNaSpoczynek: async () => {},   // strona przechodzi do pozy, w której wolno mówić
  napis: tekst => {},                  // napisy; '' = schowaj
});

await mowa.wlacz();                          // TYLKO w kliknięciu (odblokowuje dźwięk na telefonie)
await mowa.powiedz('Dzień dobry.');          // kończy się, gdy skończy mówić
const p = await mowa.przygotuj(tekst);       // policz z wyprzedzeniem (np. ogłoszenie w kolejce)
await mowa.powiedz(tekst, { przygotowane: p });   // wtedy startuje od razu

const s = mowa.strumien();                   // odpowiedź dopływająca kawałkami (czat)
s.dodaj(tekstDotąd);                         // wiele razy
await s.zakoncz(całyTekst);

mowa.stop();                                 // ucisza od razu
mowa.zajeta   // true, gdy mówi albo ma coś w kolejce
mowa.mowi     // true, gdy słychać głos (pauzy między zdaniami się nie liczą)
mowa.stan     // 'off' | 'loading' | 'ready' | 'failed' — model neuronowy
mowa.on('mowi', bool => …)                   // start / koniec mówienia (np. pod gesty, mimikę)
mowa.on('stan', stan => …)                   // model: ładowanie, gotowy, błąd
mowa.on('postep', ({zaladowano, razem, zPamieci}) => …)   // pobieranie modelu
mowa.ustawGlos('mai' | 'gosia' | glosSystemowy); mowa.ustaw({ tempo: 1, wysokosc: 1.05 });
mowa.naSystem()                              // zapas: syntezator systemu, gdy model nie wstanie

EgzoMowa.liczba(125)        // 'sto dwadzieścia pięć'
EgzoMowa.mowione('12,5%')   // tekst w postaci do czytania na głos
```

## Jak to działa

1. **Głos.** Gotowe kwestie (`voice/frazy.wav` + `frazy.json`) grają natychmiast. Każdy inny tekst liczy
   model Mai (VITS) w osobnym wątku przeglądarki; model zwraca też czas każdej litery.
2. **Bez dziur.** Dźwięk rusza dopiero, gdy cała wypowiedź jest policzona (przy długich odpowiedziach:
   gdy jest ≥ 6 s zapasu). Zdania są układane na osi czasu karty dźwiękowej z pauzą 0,26 s po kropce
   i 0,32 s po pytajniku. Ciche brzegi każdego zdania są przycinane.
3. **Usta.** Z czasów liter → głoski (dwuznaki, zmiękczenia) → docelowe otwarcie ust co 40 ms
   (m/b/p = zamknięte, a = najszerzej, głośniej = szerzej). Z biblioteki **prawdziwych klatek jej twarzy**
   wybierany jest ciąg klatek (Viterbi), z preferencją dla klatek, które w nagraniu następowały po sobie —
   dzięki temu ruch jest naturalny. Obraz wyprzedza dźwięk o 40 ms.
4. **Kąt i położenie.** Dla każdej klatki pętli wideo jest zapisane przekształcenie (obrót, skala,
   przesunięcie) z kadru bazowego do tej klatki. Klatki biblioteki są wyrównane do kadru bazowego tą samą
   metodą (ECC na okolicy ust i brody).
5. **Poza głowy.** W pętli głowa przechyla się o ok. 17° i odwraca w bok (kadr startowy) albo patrzy prosto.
   Płaskie przekształcenie nie odda obrotu w przestrzeni — usta z innej pozy wychodziły krzywe (do 10°).
   Dlatego każda klatka ma wektor pozy (z wyglądu głowy bez ust), a dobór bierze tylko usta z klatek
   o pozie zbliżonej do tej, która BĘDZIE na ekranie (klatka pętli przewidywana z czasu wideo, trafność ±1 klatka;
   rysowanie według dokładnie wyświetlanej klatki — `requestVideoFrameCallback`). Pauzy między zdaniami:
   zamknięte usta z tej samej pozy. Gdyby wideo się przycięło, klatka z daleka w pozie jest podmieniana.
6. **Otwarte usta w każdej pozie.** Nagranie ma szeroko otwarte usta tylko przy przechylonej głowie. Narzędzie
   przenosi je do póz bez otwartych ust (kotwice co 24 klatki): korekta 2×3 z dopasowania dolnej twarzy bez warg
   i żuchwy. W bibliotece to „klatki wirtualne” (kafelek + korekta), rysowane z tą korektą.
7. **Broda i żuchwa.** Nakładka obejmuje tylko usta z najbliższym otoczeniem; kontur brody zawsze pochodzi z wideo.
   Warstwa żuchwy rozciąga brodę z wideo w pionie od linii ust o 5 px × (otwarcie nakładki − otwarcie ust w wideo),
   z bezwładnością — broda opada przy „a”, unosi się przy „m”, gdy w wideo usta są uchylone.
8. **Realizm ruchu** (pomiary `tests/test_realizm.py`): cel otwarcia to gładka fala przez środki głosek
   (samogłoska = szczyt, spółgłoska = dołek); klatki kolejne w nagraniu przełączane twardo jak w wideo,
   skoki z krótkim przenikaniem (20% kroku) — długie przenikanie dawało podwójny kontur i rozmyte wargi;
   biblioteka wyostrzona (przeliczanie obrazu zabiera ~30% ostrości); klatki pośrednie z przepływu optycznego
   uzupełniają usta półotwarte, których nagranie nie ma. Parametry w `CFG` (moduł), do strojenia testem.
9. **Krótkie głoski.** m/b/p krótsze niż krok ust (40 ms) dostają gwarantowany krok z domkniętymi ustami,
   a „a”/„o” — z otwartymi; te kroki mają większą wagę przy doborze.

10. **Tekst do czytania** (`EgzoMowa.mowione`, test `tests/test_normalizacja.js`, 61 przypadków). Model czyta tylko litery,
   więc przed syntezą: daty (15.11.2026 → piętnastego listopada dwa tysiące dwudziestego szóstego roku; po „jest” mianownik),
   godziny z przypadkiem (o czternastej, przed siedemnastą, między czternastą a szesnastą), kwoty z odmianą
   (2 złote, 5 złotych, 12,50 zł → dwanaście złotych pięćdziesiąt groszy; 15 tys. zł), liczebniki w dopełniaczu po
   „do/od/około/bez…”, rodzaj żeński (dwie osoby, jedna sztuka, jedną fakturę, jedno zamówienie), ułamki (półtora, dwa i pół),
   jednostki (cm, mm, m², kg, l, MB, °C…), telefony grupami (sześćset, sto dwadzieścia trzy…), zakresy (5–7 dni → pięć do
   siedmiu), lata (w dwa tysiące dwudziestym piątym roku), skróty (np., m.in., ul., tel., nr, godz., ok., sp. z o.o.),
   skrótowce (PDF → pe de ef, SMS, KRS; NIP i VAT jako słowa), słowa obce (e-mail → imejl, Gmail, Excel, Word, WhatsApp,
   weekend…), adresy e-mail i stron (małpa, kropka), kody pocztowe, NIP, zakresy (24–28°C → od dwudziestu czterech do
   dwudziestu ośmiu stopni), narzędnik (z dwoma klientami), nazwy plików, Markdown i emotikony. Zamiana jest idempotentna.
   „Szefie” model czytał z przytartym „e” (Whisper: „szafie/czafie”, 3 na 18 rozpoznań) — do syntezy idzie „szeefie”
   (13 na 18; akcent i tak pada na tę sylabę). Napisy na ekranie pokazują zwykły tekst.
11. **Granice zdań** — kropka po skrócie, w dacie, po inicjale czy po liczbie przed małą literą nie kończy zdania.
   Ten sam podział w całej kwestii i w strumieniu czatu (`EgzoMowa.zdaniaGotowe`): granica na końcu dotychczasowego
   tekstu czeka na ciąg dalszy, więc nic nie ginie i „Np.” nie jest czytane jako osobne zdanie.
12. **Tempo** (test `tests/test_wymowa.py`: głos z przeglądarki → Whisper small offline): tempo 1,0 = 6,0 sylaby/s
   artykulacji i 13,7% błędów rozpoznania; **0,9 = 5,6 sylaby/s i 9,0%** — domyślne. Gotowe kwestie nagrywane tym samym
   tempem, każde zdanie w 4 wersjach, zostaje ta, którą Whisper zrozumiał najlepiej (`tools/generuj_frazy.py`).
   Kwestie są wyszukiwane także po pojedynczych zdaniach po zamianie na mowę (raport dnia, strumień czatu).
13. **Twarz na osobnym płótnie.** Głowa, brwi, żuchwa i usta rysowane są na małym płótnie nad głową, bez ruchu głowy;
   kiwnięcie i kołysanie robi przekształcenie CSS tego płótna (kompozytor). Przerysowanie tylko przy zmianie (nowa klatka
   wideo, usta, żuchwa, brwi), klatka wideo pobierana raz na przerysowanie (to najdroższa operacja). Słabe urządzenie
   (pomiar kosztu): co druga klatka ekranu, co druga klatka wideo dla warstw; gdy mimo to < 32 kl/s w mowie — bez ruchu
   głowy (zdarzenie `jakosc`). Dobór klatek ust: transformata odległości zamiast O(K²) (≈4× szybciej, ten sam koszt
   ścieżki), rozgrzanie kompilatora JS po wczytaniu; kandydaci pozy liczeni porcjami — strona nie zamiera
   (test `tests/test_wolne_urzadzenie.py`: procesor 4× wolniej, ≥ 30 kl/s, dobór ust ~14 ms na zdanie).
   Testy obrazu czytają nakładkę przez `mowa.wnetrze.zrzutNakladki(ctx, sx, sy, w, h, dx, dy)`.

## Dodawanie nowych umiejętności

- Ogłoszenie (mail, przypomnienie): `const p = mowa.przygotuj(t)` od razu, a `mowa.powiedz(t, {przygotowane: await p})`
  gdy przyjdzie kolej — strona ma kolejkę zdarzeń (`announce`), która czeka, aż `mowa.zajeta === false`.
- Rozmowa: `mowa.strumien()` + `dodaj` w `onText` + `zakoncz` na końcu.
- Reakcja ciała na mówienie: `mowa.on('mowi', …)`.
- **Nowa poza, w której ma mówić** (np. „Słucha”, „Zastanawia się”): przepuść jej klip przez
  `tools/zbuduj_mowe.py` jako dodatkowy tor (klucz w `usta-tor.json` = nazwa klipu) i zwracaj tę nazwę
  w `wideo().klip`. Bez toru usta się nie rysują (poza mówi „sama z siebie”, jak w wideo).
- **Więcej artykulacji**: klip Veo, w którym ona mówi w pozie spoczynkowej (głowa nieruchoma, bez uśmiechu),
  podany jako `KLIP_MÓWIENIA.mp4` do `zbuduj_mowe.py` — dołoży klatek z szerzej otwartymi ustami i zębami.
