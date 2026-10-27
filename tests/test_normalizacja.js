// Test zamiany tekstu na mowę (bez przeglądarki): node tests/test_normalizacja.js
// Każda para: tekst z czatu → dokładnie to, co ma przeczytać głos. Plus granice zdań (całość i strumień).
require('../mowa/egzo-mowa.js');
const M = globalThis.EgzoMowa;
const P = [
  ['Termin mija 15.11.2026, szefie.', 'Termin mija piętnastego listopada dwa tysiące dwudziestego szóstego roku, szefie.'],
  ['Dziś jest 3.12.', 'Dziś jest trzeci grudnia.'],
  ['Dziś mamy 28.10.2026 r.', 'Dziś mamy dwudziestego ósmego października dwa tysiące dwudziestego szóstego roku'],
  ['Spotkanie 2026-11-15 o 14:30.', 'Spotkanie piętnastego listopada dwa tysiące dwudziestego szóstego roku o czternastej trzydzieści.'],
  ['Do 15.11 proszę o odpowiedź.', 'Do piętnastego listopada proszę o odpowiedź.'],
  ['Spotkanie 3 listopada o 10.', 'Spotkanie trzeciego listopada o dziesiątej.'],
  ['Od 8:00 do 16:00 jestem w biurze.', 'Od ósmej do szesnastej jestem w biurze.'],
  ['Zadzwoń o 9:05.', 'Zadzwoń o dziewiątej zero pięć.'],
  ['Przed 17:00 wyślę.', 'Przed siedemnastą wyślę.'],
  ['Między 14:00 a 16:00.', 'Między czternastą a szesnastą.'],
  ['w godz. 8-16', 'w godzinach od ósmej do szesnastej'],
  ['Godz. 10', 'godzina dziesiąta'],
  ['Kwota: 1 250,50 zł brutto.', 'Kwota: tysiąc dwieście pięćdziesiąt złotych pięćdziesiąt groszy brutto.'],
  ['Wartość: 99,99 zł.', 'Wartość: dziewięćdziesiąt dziewięć złotych dziewięćdziesiąt dziewięć groszy.'],
  ['Za 1 zł.', 'Za jeden złoty.'],
  ['Za 2 zł i 22 zł oraz 5 zł.', 'Za dwa złote i dwadzieścia dwa złote oraz pięć złotych.'],
  ['To kosztuje do 2 zł.', 'To kosztuje do dwóch złotych.'],
  ['Budżet 15 tys. zł.', 'Budżet piętnaście tysięcy złotych.'],
  ['Około 3,5 mln zł.', 'Około trzech i pół miliona złotych.'],
  ['Mamy 1 000 000 zł obrotu.', 'Mamy milion złotych obrotu.'],
  ['Faktura na kwotę 4 920,00 zł.', 'Faktura na kwotę cztery tysiące dziewięćset dwadzieścia złotych.'],
  ['Telefon: +48 600 123 456.', 'Telefon: plus czterdzieści osiem, sześćset, sto dwadzieścia trzy, czterysta pięćdziesiąt sześć.'],
  ['Tel. 600-123-456', 'telefon sześćset, sto dwadzieścia trzy, czterysta pięćdziesiąt sześć'],
  ['Mój numer 600123456.', 'Mój numer sześćset, sto dwadzieścia trzy, czterysta pięćdziesiąt sześć.'],
  ['Biuro (22) 123 45 67.', 'Biuro dwadzieścia dwa, sto dwadzieścia trzy, czterdzieści pięć, sześćdziesiąt siedem.'],
  ['Rabat 12,5% i 3%.', 'Rabat dwanaście i pół procent i trzy procent.'],
  ['Terrarium 120x60x50 cm.', 'Terrarium sto dwadzieścia na sześćdziesiąt na pięćdziesiąt centymetrów.'],
  ['Rozmiar 60 x 45 x 45 cm, szkło 4 mm.', 'Rozmiar sześćdziesiąt na czterdzieści pięć na czterdzieści pięć centymetrów, szkło cztery milimetry.'],
  ['Waga 1,5 kg, 2 kg, 5 kg.', 'Waga półtora kilograma, dwa kilogramy, pięć kilogramów.'],
  ['To jest 0,5 l.', 'To jest pół litra.'],
  ['Wymiar 2,05 m na 30 cm.', 'Wymiar dwa przecinek zero pięć metra na trzydzieści centymetrów.'],
  ['Temperatura 25°C.', 'Temperatura dwadzieścia pięć stopni Celsjusza.'],
  ['Plik ma 25 MB.', 'Plik ma dwadzieścia pięć megabajtów.'],
  ['Zostało 15 min.', 'Zostało piętnaście minut'],
  ['Za 2 godz. wracam.', 'Za dwie godziny wracam.'],
  ['min. 5 sztuk', 'minimum pięć sztuk'],
  ['Od 2 do 4 sztuk, 3 szt. w magazynie.', 'Od dwóch do czterech sztuk, trzy sztuki w magazynie.'],
  ['Dostawa 5-7 dni.', 'Dostawa pięć do siedmiu dni.'],
  ['Do 2 tygodni.', 'Do dwóch tygodni.'],
  ['5 osób, 22 osoby, 12 osób.', 'pięć osób, dwadzieścia dwie osoby, dwanaście osób.'],
  ['Masz 2 nowe wiadomości i 3 nowe maile.', 'Masz dwie nowe wiadomości i trzy nowe mejle.'],
  ['Mam 1 fakturę i 1 zamówienie.', 'Mam jedną fakturę i jedno zamówienie.'],
  ['1 osoba, 1 okno, 1 dzień, 1 imię', 'jedna osoba, jedno okno, jeden dzień, jedno imię'],
  ['W 2025 r. było 1500 zamówień.', 'W dwa tysiące dwudziestym piątym roku było tysiąc pięćset zamówień.'],
  ['Rok 2026.', 'Rok dwa tysiące dwudziesty szósty.'],
  ['Np. e-mail od Jana, m.in. PDF i SMS.', 'na przykład imejl od Jana, między innymi pe de ef i es em es.'],
  ['OK, zrobię to ok. 5 dni.', 'okej, zrobię to około pięciu dni.'],
  ['ul. Długa 5, nr 12.', 'ulica Długa pięć, numer dwanaście.'],
  ['Gmail i Excel w Wordzie, WhatsApp.', 'Dżimejl i Ekscel w Łordzie, Łotsap.'],
  ['NIP i VAT, faktura PDF, KRS, BHP.', 'nip i vat, faktura pe de ef, ka er es, be ha pe.'],
  ['Napisz na biuro@egzosystems.com albo wejdź na www.egzosystems.pl.', 'Napisz na biuro małpa egzosystems kropka kom albo wejdź na egzosystems kropka pe el.'],
  ['**Ważne:** sprawdź `plik.pdf` 👍', 'Ważne: sprawdź plik kropka pe de ef'],
  ['- pierwszy punkt\n- drugi punkt', 'pierwszy punkt. drugi punkt'],
  ['Spółka EGZO SYSTEMS sp. z o.o.', 'Spółka egzo sistems spółka z o o'],
  ['Zamówienie nr 2026/11/15.', 'Zamówienie numer dwa tysiące dwadzieścia sześć łamane przez jedenaście łamane przez piętnaście.'],
  ['Szefie, o 14:00 dzwoni pani Anna, numer 512 345 678.', 'Szefie, o czternastej dzwoni pani Anna, numer pięćset dwanaście, trzysta czterdzieści pięć, sześćset siedemdziesiąt osiem.'],
  ['Czy mam je od razu przekazać do akceptacji?', 'Czy mam je od razu przekazać do akceptacji?'],
];
const Z = [
  ['Np. e-mail od Jana. Termin 15.11.2026, szefie! Mam 2,5 tys. zł? J. Kowalski dzwonił o 14:30. W 2026 r. Potem ul. Długa 5. Koniec',
   ['Np. e-mail od Jana.', 'Termin 15.11.2026, szefie!', 'Mam 2,5 tys. zł?', 'J. Kowalski dzwonił o 14:30.', 'W 2026 r.', 'Potem ul. Długa 5.', 'Koniec']],
  ['Do 15. listopada. Dobrze?', ['Do 15. listopada.', 'Dobrze?']],
];
let ok = true, n = 0;
for (const [a, b] of P) {
  const r = M.mowione(a), r2 = M.mowione(r); n++;
  if (r !== b) { ok = false; console.log('BŁĄD  ', JSON.stringify(a), '\n   jest:   ', r, '\n   ma być: ', b); }
  else if (r2 !== r) { ok = false; console.log('BŁĄD (druga zamiana zmienia tekst)', JSON.stringify(a), '→', r2); }
  else if (/\d/.test(r)) { ok = false; console.log('BŁĄD (zostały cyfry)', r); }
}
for (const [t, exp] of Z) {
  const a = M.zdania(t); n++;
  if (JSON.stringify(a) !== JSON.stringify(exp)) { ok = false; console.log('BŁĄD zdania', a); }
  // strumień: tekst dopływa po kilka znaków — te same zdania, nic nie ginie
  let done = 0; const acc = [];
  for (let k = 3; k <= t.length; k += 5) { const [z, d] = M.zdaniaGotowe(t.slice(0, k), done); done = d; acc.push(...z); }
  const [z, d] = M.zdaniaGotowe(t, done); acc.push(...z); done = d; acc.push(...M.zdania(t.slice(done)));
  n++; if (JSON.stringify(acc) !== JSON.stringify(exp)) { ok = false; console.log('BŁĄD strumień', acc); }
}
console.log(`przykładów ${n}`); console.log('WYNIK:', ok ? 'OK' : 'NIE ZALICZONY'); process.exit(ok ? 0 : 1);
