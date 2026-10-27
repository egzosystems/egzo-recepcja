# EGZO MOWA — biblioteka mówienia asystentki

Jedno miejsce, które odpowiada za to, że asystentka **mówi**: głos, kolejka wypowiedzi, napisy i usta
zsynchronizowane z dźwiękiem. Każda umiejętność (maile, przypomnienia, czat, obieg dokumentów, kolejne
pozy) woła tylko `mowa.powiedz(...)` i nie musi nic wiedzieć o syntezie ani o ustach.

- Kod: `mowa/egzo-mowa.js` (źródło prawdy)
- Wbudowanie w stronę: `python3 tools/zbuduj_strone.py ŚCIEŻKA/egzo-recepcja.html --repo index.html`
  (artefakt nie pozwala na osobne skrypty, więc moduł jest wklejany między `/*<mowa>*/` i `/*</mowa>*/`)
- Dane ust: `python3 -I tools/zbuduj_mowe.py KADR.jpg PĘTLA.mp4 lip/ [KLIP_MÓWIENIA.mp4 …]`
- Testy: `python3 tests/test_mowa.py` (10 sprawdzeń, serwer testowy na porcie 8768)

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
   przesunięcie) z kadru bazowego do tej klatki. Klatki biblioteki są wyrównane do kadru bazowego **tą samą
   metodą** (ECC na okolicy ust i brody), więc po narysowaniu z tym przekształceniem usta mają dokładnie kąt
   twarzy — nie przekrzywiają się, gdy ona przechyla głowę.

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
