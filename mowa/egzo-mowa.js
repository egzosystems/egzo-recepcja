/* EGZO MOWA 1.0 — biblioteka mówienia asystentki: głos neuronowy w przeglądarce + gotowe kwestie
   + zsynchronizowane usta z prawdziwych klatek wideo. Jedno źródło prawdy, używane przez stronę
   i przez każdą kolejną umiejętność (maile, czat, przypomnienia…).

   const mowa = EgzoMowa.utworz({
     bazaGlosu: 'voice/', bazaUst: 'lip/', canvas: document.getElementById('lipCanvas'),
     wideo: () => ({ el: aktywneWideo, klip: 'idle' | null }),   // klip, na którym wolno rysować usta
     czekajNaSpoczynek: async () => {},                          // strona przechodzi do pozy mówienia
     napis: tekst => {},                                         // napisy (pusty tekst = schowaj)
   });
   await mowa.wlacz();                 // w kliknięciu (odblokowuje dźwięk na telefonach)
   await mowa.powiedz('Dzień dobry.'); // cała kwestia, usta same się ruszają
   const s = mowa.strumien(); s.dodaj(tekstDotąd); await s.zakoncz(całość);   // odpowiedź z czatu
   const p = await mowa.przygotuj(tekst); …; await mowa.powiedz(tekst, {przygotowane: p});
   mowa.stop(); mowa.zajeta; mowa.on('mowi', bool => …); mowa.on('stan', s => …); mowa.on('postep', p => …);
   EgzoMowa.liczba(125) → 'sto dwadzieścia pięć'; EgzoMowa.mowione('12,5%') → tekst do czytania.
   Szczegóły: docs/mowa.md */
(function (global) {
'use strict';

/* NORMALIZACJA-START */
/* ---------- Tekst do czytania (model Mai czyta tylko litery) ----------
   Liczby, daty, godziny, kwoty, telefony, jednostki, skróty, skrótowce i słowa obce → polskie słowa.
   Zasady odmiany: liczebnik w dopełniaczu po „do/od/około/bez/dla/z/u/spośród/ponad…”; jednostka po liczbie
   w formie zgodnej z liczbą (1 złoty, 2 złote, 5 złotych; ułamek → dopełniacz l.poj.: 1,5 metra).
   Sprawdzane testem: tests/test_normalizacja.js (przykłady) i tests/test_wymowa.py (rozpoznawanie mowy Whisperem). */
const N_J=['zero','jeden','dwa','trzy','cztery','pięć','sześć','siedem','osiem','dziewięć','dziesięć','jedenaście','dwanaście','trzynaście','czternaście','piętnaście','szesnaście','siedemnaście','osiemnaście','dziewiętnaście'];
const N_D=['','','dwadzieścia','trzydzieści','czterdzieści','pięćdziesiąt','sześćdziesiąt','siedemdziesiąt','osiemdziesiąt','dziewięćdziesiąt'];
const N_S=['','sto','dwieście','trzysta','czterysta','pięćset','sześćset','siedemset','osiemset','dziewięćset'];
// dopełniacz (do pięciu, od dwóch…)
const G_J=['zera','jednego','dwóch','trzech','czterech','pięciu','sześciu','siedmiu','ośmiu','dziewięciu','dziesięciu','jedenastu','dwunastu','trzynastu','czternastu','piętnastu','szesnastu','siedemnastu','osiemnastu','dziewiętnastu'];
const G_D=['','','dwudziestu','trzydziestu','czterdziestu','pięćdziesięciu','sześćdziesięciu','siedemdziesięciu','osiemdziesięciu','dziewięćdziesięciu'];
const G_S=['','stu','dwustu','trzystu','czterystu','pięciuset','sześciuset','siedmiuset','ośmiuset','dziewięciuset'];
// liczebniki porządkowe: rodzaj męski mianownik / dopełniacz (daty: piętnasty, piętnastego), żeński (godziny: czternasta, czternastej, czternastą)
const O_J=['zerowy','pierwszy','drugi','trzeci','czwarty','piąty','szósty','siódmy','ósmy','dziewiąty','dziesiąty','jedenasty','dwunasty','trzynasty','czternasty','piętnasty','szesnasty','siedemnasty','osiemnasty','dziewiętnasty'];
const O_D=['','','dwudziesty','trzydziesty','czterdziesty','pięćdziesiąty','sześćdziesiąty','siedemdziesiąty','osiemdziesiąty','dziewięćdziesiąty'];
const O_S=['','setny','dwusetny','trzechsetny','czterechsetny','pięćsetny','sześćsetny','siedemsetny','osiemsetny','dziewięćsetny'];
// odmiana porządkowego: końcówka -y/-i → przypadek (m: mianownik, g: dopełniacz m., f: ż. mianownik, fg: ż. dopełniacz/miejscownik, fi: ż. narzędnik)
function ordForm(w,c){
  if(c==='m') return w;
  const soft=/i$/.test(w), stem=w.slice(0,-1);
  if(c==='g') return stem+(soft?'iego':'ego');
  if(c==='f') return stem+(soft?'ia':'a');
  if(c==='fg') return stem+(soft?'iej':'ej');
  if(c==='fi') return stem+(soft?'ią':'ą');
  if(c==='l') return stem+(soft?'im':'ym');
  if(c==='n') return stem+(soft?'ie':'e');
  return w;
}
function under1000(x,g){ const J=g?G_J:N_J, D=g?G_D:N_D, S=g?G_S:N_S, r=[];
  if(x>=100){ r.push(S[Math.floor(x/100)]); x%=100; }
  if(x>=20){ r.push(D[Math.floor(x/10)]); x%=10; if(x) r.push(g&&x===1?'jeden':J[x]); } else if(x||!r.length) r.push(g&&x===1&&r.length?'jeden':J[x]);
  return r.join(' '); }
// rzeczowniki żeńskie (po liczbie: jedna, dwie): tematy słów
const ZENSKIE=/^(osob|sztuk|godzin|minut|sekund|faktur|wiadomoś|ofert|paczk|płyt|stron|rzecz|spraw|notatk|umow|firm|ton[ay]?$|dob[ay]$|wersj|częś|kopi|rozmow|szafk|półk|szuflad|desk|listw|zmian|poprawk|uwag|prośb|opcj|propozycj|wycen|dostaw|przesyłk|wizyt|rat[ay]?$|kwot|pozycj|noc|kobiet|pani|klientk|sesj|lekcj|reklamacj|wpłat|płatnoś|transakcj|kategori|zakładk|kart|lini|tras|drog|książk|figurk|butelk|puszk|lamp|kamer|drukark|maszyn|frezark|pił|wiertark|krawędz|tablic|płytk|ściank|wnęk|szyb|ścian|klatk|skrzyn|kostk|część|tygodniówk|zaliczk|faktur|fotografi|dziewczyn|córk|siostr|połow|godzin|ćwiartk)/i;
const zenska=w=>ZENSKIE.test(w||'');
// liczba w rodzaju żeńskim: …jeden → jedna (tylko samo 1), …dwa → dwie (poza 12)
function numZ(n,txt){ if(n===1) return 'jedna'; if(n%10===2&&n%100!==12) return txt.replace(/dwa$/,'dwie'); return txt; }
// forma rzeczownika po liczbie: [1, 2–4, 5+] (12–14 → 5+)
function formaPo(n,f){ if(n===1) return f[0]; const a=n%10, b=n%100; return a>=2&&a<=4&&(b<12||b>14)?f[1]:f[2]; }
const RZEDY=[[1e9,['miliard','miliardy','miliardów'],'miliarda','miliardów'],[1e6,['milion','miliony','milionów'],'miliona','milionów'],[1e3,['tysiąc','tysiące','tysięcy'],'tysiąca','tysięcy']];
function numPL(n,g){
  n=Math.floor(Math.abs(n));
  if(n>=1e12) return String(n).split('').map(c=>N_J[+c]).join(' ');
  if(n<1000) return under1000(n,g);
  for(const [v,f,g1,gp] of RZEDY){ if(n>=v){ const t=Math.floor(n/v), rest=n%v;
    const tw=t===1?(g?g1:f[0]):under1000(t,g)+' '+(g?gp:formaPo(t,f));
    return rest?tw+' '+numPL(rest,g):tw; } }
  return under1000(n,g);
}
// porządkowy (do 2099 w latach: dwa tysiące dwudziesty szósty)
function ordPL(n,c){
  const parts=[];
  if(n>=1000){ const t=Math.floor(n/1000); n%=1000;
    if(!n) return ordForm(t===1?'tysięczny':numPL(t)+'tysięczny',c);   // rzadkie
    parts.push(t===1?'tysiąc':numPL(t*1000)); }
  if(n>=100){ const s=Math.floor(n/100); n%=100; if(!n){ parts.push(ordForm(O_S[s],c)); return parts.join(' '); } parts.push(N_S[s]); }
  if(n>=20){ const d=Math.floor(n/10), j=n%10; parts.push(ordForm(O_D[d],c)); if(j) parts.push(ordForm(O_J[j],c)); }
  else parts.push(ordForm(O_J[n],c));
  return parts.join(' ');
}
const MIES=['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
// jednostki: [1, 2–4, 5+, ułamek (dopełniacz l.poj.)]
const JEDN={
  'zł':['złoty','złote','złotych','złotego'],'pln':['złoty','złote','złotych','złotego'],
  'gr':['grosz','grosze','groszy','grosza'],'€':['euro','euro','euro','euro'],'eur':['euro','euro','euro','euro'],
  '$':['dolar','dolary','dolarów','dolara'],'usd':['dolar','dolary','dolarów','dolara'],
  'mm':['milimetr','milimetry','milimetrów','milimetra'],'cm':['centymetr','centymetry','centymetrów','centymetra'],
  'm':['metr','metry','metrów','metra'],'km':['kilometr','kilometry','kilometrów','kilometra'],
  'm2':['metr kwadratowy','metry kwadratowe','metrów kwadratowych','metra kwadratowego'],'m²':['metr kwadratowy','metry kwadratowe','metrów kwadratowych','metra kwadratowego'],
  'm3':['metr sześcienny','metry sześcienne','metrów sześciennych','metra sześciennego'],'m³':['metr sześcienny','metry sześcienne','metrów sześciennych','metra sześciennego'],
  'cm2':['centymetr kwadratowy','centymetry kwadratowe','centymetrów kwadratowych','centymetra kwadratowego'],
  'kg':['kilogram','kilogramy','kilogramów','kilograma'],'g':['gram','gramy','gramów','grama'],'t':['tona','tony','ton','tony'],
  'l':['litr','litry','litrów','litra'],'ml':['mililitr','mililitry','mililitrów','mililitra'],
  'szt':['sztuka','sztuki','sztuk','sztuki'],'szt.':['sztuka','sztuki','sztuk','sztuki'],
  'h':['godzina','godziny','godzin','godziny'],'godz':['godzina','godziny','godzin','godziny'],'godz.':['godzina','godziny','godzin','godziny'],
  'min':['minuta','minuty','minut','minuty'],'min.':['minuta','minuty','minut','minuty'],'s':['sekunda','sekundy','sekund','sekundy'],
  'mies':['miesiąc','miesiące','miesięcy','miesiąca'],'mies.':['miesiąc','miesiące','miesięcy','miesiąca'],
  'tys':['tysiąc','tysiące','tysięcy','tysiąca'],'tys.':['tysiąc','tysiące','tysięcy','tysiąca'],
  'mln':['milion','miliony','milionów','miliona'],'mld':['miliard','miliardy','miliardów','miliarda'],
  '°c':['stopień Celsjusza','stopnie Celsjusza','stopni Celsjusza','stopnia Celsjusza'],'°':['stopień','stopnie','stopni','stopnia'],
  'w':['wat','waty','watów','wata'],'kw':['kilowat','kilowaty','kilowatów','kilowata'],'kwh':['kilowatogodzina','kilowatogodziny','kilowatogodzin','kilowatogodziny'],
  'mb':['megabajt','megabajty','megabajtów','megabajta'],'gb':['gigabajt','gigabajty','gigabajtów','gigabajta'],'kb':['kilobajt','kilobajty','kilobajtów','kilobajta'],
  'km/h':['kilometr na godzinę','kilometry na godzinę','kilometrów na godzinę','kilometra na godzinę'],
  'r.':['rok','lata','lat','roku'],'%':['procent','procent','procent','procent'],
  'v':['wolt','wolty','woltów','wolta'],'hz':['herc','herce','herców','herca'],'khz':['kiloherc','kiloherce','kiloherców','kiloherca'],
  'mah':['miliamperogodzina','miliamperogodziny','miliamperogodzin','miliamperogodziny']
};
// dopełniacz l.mn. jednostki (po liczebniku w dopełniaczu: do pięciu złotych, od dwóch metrów)
const JEDN_GPL={'złoty':'złotych','grosz':'groszy','euro':'euro','dolar':'dolarów','sztuka':'sztuk','godzina':'godzin','minuta':'minut','sekunda':'sekund','tona':'ton','procent':'procent','rok':'lat','kilowatogodzina':'kilowatogodzin','miliamperogodzina':'miliamperogodzin'};
const unitGenPl=f=>JEDN_GPL[f[0]]||f[2];
const JEDN_Z=new Set(['sztuka','godzina','minuta','sekunda','tona','kilowatogodzina','miliamperogodzina']);
// skróty (z kropką lub bez) → słowa
const SKROTY=[
  [/\bnp\./gi,'na przykład'],[/\bm\.\s?in\./gi,'między innymi'],[/\bitd\./gi,'i tak dalej'],[/\bitp\./gi,'i tym podobne'],
  [/\btj\./gi,'to jest'],[/\btzn\./gi,'to znaczy'],[/\btzw\./gi,'tak zwany'],[/\bwg\b\.?/gi,'według'],[/\bws\./gi,'w sprawie'],
  [/\bdot\./gi,'dotyczy'],[/\bzob\./gi,'zobacz'],[/\bpw\./gi,'pod wezwaniem'],[/\bul\./gi,'ulica'],[/\bal\./gi,'aleja'],[/\bpl\.(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ])/g,'plac'],
  [/\bos\.(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ])/g,'osiedle'],[/\btel\./gi,'telefon'],[/\btel\b/gi,'telefon'],[/\bkom\.(?=\s*[\d+(:])/gi,'komórka'],[/\bnr\b\.?/gi,'numer'],
  [/(?<!\d\s?)\bgodz\.(?!\s*\d)/gi,'godzina'],[/(?<!\d\s?)\bmin\./gi,'minimum'],[/\bmaks\.|\bmax\./gi,'maksymalnie'],[/\bpn\.(?=\s|$)/g,'poniedziałek'],[/\bwt\.(?=\s|$)/g,'wtorek'],
  [/\bśr\.(?=\s|$)/g,'środa'],[/\bczw\.(?=\s|$)/g,'czwartek'],[/\bpt\.(?=\s|$)/g,'piątek'],[/\bsob\.(?=\s|$)/g,'sobota'],[/\bndz\.|\bnd\.(?=\s|$)/g,'niedziela'],
  [/\bsp\.\s?z\s?o\.\s?o\./gi,'spółka z o o'],[/\bs\.\s?c\./gi,'spółka cywilna'],[/\bS\.A\./g,'es a'],[/\bp\.\s?s\./gi,'post scriptum'],
  [/\bpkt\b\.?/gi,'punkt'],[/\bstr\./gi,'strona'],[/\bwz\.|\bw\.z\./gi,'wzór'],[/\bzał\./gi,'załącznik'],[/\bpoz\./gi,'pozycja'],
  [/\bproc\./gi,'procent'],[/\bjw\./gi,'jak wyżej'],[/\bb\.\s?d\./gi,'brak danych'],[/\bwył\./gi,'wyłącznie'],[/\bwzgl\./gi,'względnie'],
  [/\bmgr\b\.?/gi,'magister'],[/\binż\./gi,'inżynier'],[/\bdr\b\.?(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ])/g,'doktor'],[/\bprof\./gi,'profesor'],[/\bp\.(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż])/g,'pan'],
  [/\bdn\.(?=\s*\d)/gi,'dnia'],[/\bok\.(?=\s*\d)/gi,'około'],[/\bok\.(?=\s+[a-ząćęłńóśźż])/g,'około'],[/\bw\.(?=\s|$)/g,'wieku']
];
// słowa obce i nazwy własne: zapis → wymowa (całe słowa, bez wielkości liter)
const OBCE={
  'e-mail':'imejl','e-maila':'imejla','e-mailem':'imejlem','e-maile':'imejle','e-maili':'imejli','e-mailu':'imejlu','e-mailach':'imejlach','e-mailowy':'imejlowy',
  'email':'imejl','emaila':'imejla','emailem':'imejlem','emaile':'imejle','emaili':'imejli','emailu':'imejlu',
  'mail':'mejl','maila':'mejla','mailem':'mejlem','maile':'mejle','maili':'mejli','mailu':'mejlu','mailach':'mejlach','mailowy':'mejlowy','mailowo':'mejlowo','mailing':'mejling',
  'gmail':'dżimejl','gmaila':'dżimejla','gmailu':'dżimejlu','gmailem':'dżimejlem','outlook':'autluk','outlooku':'autluku',
  'excel':'ekscel','excela':'ekscela','excelu':'ekscelu','excelem':'ekscelem','word':'łord','worda':'łorda','wordzie':'łordzie','powerpoint':'pałerpojnt',
  'google':'gugl','googla':'gugla','googlu':'guglu','youtube':'jutub','facebook':'fejsbuk','facebooka':'fejsbuka','facebooku':'fejsbuku',
  'whatsapp':'łotsap','whatsappie':'łotsapie','messenger':'mesendżer','messengerze':'mesendżerze',
  'iphone':'ajfon','iphone\'a':'ajfona','windows':'łindołs','windowsie':'łindołsie','mac':'mek','macbook':'mekbuk',
  'online':'onlajn','offline':'oflajn','newsletter':'niusleter','feedback':'fidbek','deadline':'dedlajn','deadline\'u':'dedlajnu',
  'ok':'okej','okay':'okej','okey':'okej','sorry':'sori','weekend':'łikend','weekendu':'łikendu','weekendzie':'łikendzie','weekendem':'łikendem','weekendy':'łikendy','weekendów':'łikendów','weekendach':'łikendach','weekendowy':'łikendowy',
  'zoom':'zum','zoomie':'zumie','teams':'tims','teamsach':'timsach','slack':'slak','dropbox':'dropboks','onedrive':'łandrajw','drive':'drajw',
  'claude':'klod','claude\'a':'kloda','chatgpt':'czat dżi pi ti',
  'notion':'nołszyn','canva':'kanwa','wifi':'łifi','wi-fi':'łifi','bluetooth':'blutuf',
  'systems':'sistems','software':'softłer','hardware':'hardłer','backup':'bekap','update':'apdejt','password':'pasłord',
  'leasing':'lizing','leasingu':'lizingu','manager':'menedżer','team':'tim','meeting':'miting','call':'kol',
  'pdf-a':'pe de efa','pdf-ie':'pe de efie','pdfa':'pe de efa','pdfie':'pe de efie','jpg':'jot peg','jpeg':'jot peg','png':'pe en gie','csv':'ce es fał',
  'www':'wu wu wu','http':'ha te te pe','https':'ha te te pe es','.pl':'kropka pe el','.com':'kropka kom'
};
// skrótowce czytane jak słowa (reszta wielkimi literami: literowanie)
const SLOWA_SKROTOWCE=new Set(['NIP','VAT','PESEL','REGON','ZUS','NATO','PIT','CIT','RODO','GUS','KRUS','PIN','EGZO','PEFRON','PFRON','NBP','UNESCO','ONZ','LOT','PEKAO','ORLEN','IKEA','OBI','LIDL','ALDI','NASA','FIFA','UEFA','COVID','LED','RAM','ROM','ZOO','SEJF','PILNE','UWAGA','NOWE','HIT','TOP','BOSS']);
const LITERY={A:'a',Ą:'ą',B:'be',C:'ce',Ć:'cie',D:'de',E:'e',Ę:'ę',F:'ef',G:'gie',H:'ha',I:'i',J:'jot',K:'ka',L:'el',Ł:'eł',M:'em',N:'en',Ń:'eń',O:'o',Ó:'o',P:'pe',Q:'ku',R:'er',S:'es',Ś:'eś',T:'te',U:'u',V:'fał',W:'wu',X:'iks',Y:'igrek',Z:'zet',Ź:'ziet',Ż:'żet'};
const SKROTOWCE_WYM={OK:'okej',AI:'a i',IT:'aj ti',USB:'u es be',CEO:'si i oł',HR:'ha er',PR:'pi ar',SEO:'seo',URL:'u er el',API:'a pe i',UI:'u i',TV:'te fał',PC:'pe ce',GPS:'gie pe es',DVD:'de fał de',CD:'ce de',SMS:'es em es',MMS:'em em es',PDF:'pe de ef',CRM:'ce er em',FAQ:'ef a ku',BHP:'be ha pe',KRS:'ka er es',NFZ:'en ef zet',USA:'u es a',UE:'u e',PKO:'pe ka o',PKP:'pe ka pe',PKS:'pe ka es',PZU:'pe zet u',DHL:'de ha el',DPD:'de pe de',GLS:'gie el es',UPS:'u pe es',OLX:'o el iks',AGD:'a gie de',RTV:'er te fał',LPG:'el pe gie',ID:'aj di',QR:'ku er',XL:'iks el',XXL:'iks iks el',SUV:'es u fał',MDF:'em de ef',OSB:'o es be',PCV:'pe ce fał',PVC:'pe fał ce',HDF:'ha de ef',CNC:'ce en ce',UV:'u fał',RGB:'er gie be',LCD:'el ce de',SSD:'es es de',HDD:'ha de de',CV:'ce fał',VIP:'wip',B2B:'bi tu bi',B2C:'bi tu si',ASAP:'ejsap',FYI:'ef y aj',PS:'post scriptum'};
function literuj(s){ return s.split('').map(c=>LITERY[c]||c.toLowerCase()).join(' '); }
// granice słów z polskimi literami (\b w JS zna tylko ASCII)
const L_='A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźżÀ-ž';
const W0=`(?<![${L_}\\d])`, W1=`(?![${L_}\\d])`;
for(let i=0;i<SKROTY.length;i++){ const [re,w]=SKROTY[i]; SKROTY[i]=[new RegExp(re.source.replace(/^\\b|(?<=^\(\?<!\\d\\s\?\))\\b/,W0),re.flags),w]; }
// przyimki, po których liczebnik idzie w dopełniaczu / narzędniku / miejscowniku
const PRZ_GEN=new RegExp(`(?:^|[\\s(,])(do|od|około|bez|dla|z|ze|u|spośród|wśród|ponad|powyżej|poniżej|blisko|koło|zamiast|oprócz|według|sprzed|obok|wokół|podczas|w ciągu|w wysokości|w kwocie|kosztem|brakuje|nie ma|mniej niż|więcej niż)\\s*$`,'i');
const PRZ_NARZ=/(?:^|[\s(,])(przed|za|nad|pod|między|pomiędzy)\s*$/i;
const PRZ_MIEJSC=/(?:^|[\s(,])(o|po|przy)\s*$/i;
const KONTEKST_TEL=/(tel\.?|telefon\w*|numer\w*|nr|kom\.?|komórk\w*|zadzwoń|dzwoń|kontakt\w*|infolinia|faks|fax|sms\w*|whatsapp|pod numer\w*)[\s:.]*$/i;
const cyfry=x=>x.split('').map(c=>N_J[+c]).join(' ');
const grupaTel=x=>x[0]==='0'?cyfry(x):numPL(+x);
// ułamek dziesiętny: 1,5 → półtora; 2,5 → dwa i pół; inaczej „przecinek”
function ulamek(a,fr,gen,fem){ const n=+a;
  if(fr==='5'){ if(n===0) return 'pół'; if(n===1) return fem?'półtorej':'półtora'; return (gen?numPL(n,true):(fem?numZ(n,numPL(n)):numPL(n)))+' i pół'; }
  return (gen?numPL(n,true):numPL(n))+' przecinek '+(fr[0]==='0'?cyfry(fr):numPL(+fr)); }
// narzędnik (z dwoma klientami, przed pięcioma minutami) — do 99
function numNarz(n,fem){ const J1={1:'jednym',2:fem?'dwiema':'dwoma',3:'trzema',4:'czterema'};
  const u=x=>J1[x]||G_J[x].replace(/u$/,'oma');
  if(n<20) return u(n); const d=G_D[Math.floor(n/10)].replace(/u$/,'oma'), j=n%10; return j?d+' '+(j===1?'jeden':u(j)):d; }
const GEN_PL=/^(dni|tygodni|miesięcy|lat|osób|sztuk|godzin|minut|sekund|złotych|groszy|procent|stopni|razy|zamówień|zadań|maili|mejli|e-maili|dokumentów|klientów|tysięcy|milionów|metrów|centymetrów|kilogramów)$|(ów|ych|ich|eń|ań)$/i;
// liczba 1 przed słowem: jeden / jedna / jedną / jedno (rzeczownik lub przymiotnik obok)
function jeden(word,fem){ if(!word||/^(na|do|i|w|we|z|ze|o|od|za|po|to|jest|są|lub|albo|a|czy|oraz|razy|x|raz|dzień|dnia)$/i.test(word)) return 'jeden';
  if(/(?:mię|zwierzę|cielę|źrebię)$/.test(word)) return 'jedno'; if(/[ęą]$/.test(word)&&!/się$/.test(word)) return 'jedną';
  if(fem||/a$/.test(word)) return 'jedna'; if(/(?:e|o|um)$/.test(word)) return 'jedno'; return 'jeden'; }
function spokenPL(t){
  if(!t) return '';
  let s=String(t);
  const pre=(str,off)=>str.slice(Math.max(0,off-40),off);
  // 1) wygląd tekstu: Markdown, linki, emotikony, punktory
  s=s.replace(/```[\s\S]*?```/g,' ').replace(/`([^`]*)`/g,'$1').replace(/!\[[^\]]*\]\([^)]*\)/g,' ')
     .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g,'$1').replace(/^\s{0,3}#{1,6}\s*/gm,'').replace(/^\s*[-*•·▪►]\s+/gm,'').replace(/^\s*(\d+)[.)]\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ*_\[„"])/gm,'')
     .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g,(m,a,b)=>a||b).replace(/(^|\s)[*_]([^*_\n]+)[*_](?=[\s.,!?;:]|$)/g,'$1$2')
     .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{2B50}\u{2705}]/gu,'')
     .replace(/([^.!?:;,\s])\s*\r?\n+\s*/g,'$1. ').replace(/\r?\n+/g,' ');
  // 2) adresy e-mail, strony, pliki
  const dom=d=>d.split('.').map(x=>({com:'kom',pl:'pe el',eu:'e u',org:'org',net:'net',io:'i o',de:'de e',uk:'u ka'}[x.toLowerCase()]||x)).join(' kropka ');
  s=s.replace(/([\w.+-]+)@([\w-]+(?:\.[\w-]+)+)/g,(m,u,d)=>u.replace(/[._-]/g,c=>({'.':' kropka ','_':' podkreślnik ','-':' myślnik '}[c]))+' małpa '+dom(d))
     .replace(/https?:\/\/(?:www\.)?([\w-]+(?:\.[\w-]+)+)(?:\/[^\s,;)]*)?/gi,(m,d)=>dom(d))
     .replace(/(?<![\w@])www\.([\w-]+(?:\.[\w-]+)+)(?:\/[^\s,;)]*)?/gi,(m,d)=>dom(d))
     .replace(/(?<![\w@.\/-])([a-z0-9][\w-]*(?:\.[\w-]+)*\.(?:pl|com|eu|net|org|io|de|uk|info|shop|store))(?![\w-]|\.[a-z])(?:\/[^\s,;)]*)?/gi,(m,d)=>dom(d))
     .replace(/([\wąćęłńóśźżĄĆĘŁŃÓŚŹŻ-]+)\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|zip|csv|txt|md|mp4|mp3|wav|html?)(?![\w])/gi,(m,f,e)=>f+' kropka '+({pdf:'pe de ef',doc:'dok',docx:'doks',xls:'iks el es',xlsx:'iks el es iks',ppt:'pe pe te',pptx:'pe pe te iks',jpg:'jot peg',jpeg:'jot peg',png:'pe en gie',zip:'zip',csv:'ce es fał',txt:'te iks te',md:'em de',mp4:'em pe cztery',mp3:'em pe trzy',wav:'ław',html:'ha te em el',htm:'ha te em el'}[e.toLowerCase()]));
  // 3) skróty
  for(const [re,w] of SKROTY) s=s.replace(re,w);
  // 4) wymiary i ułamki zwykłe: 120x60x50 → 120 na 60 na 50; 2026/11/15 → łamane przez
  s=s.replace(/(\d)\s*[x×]\s*(?=\d)/g,'$1 na ').replace(/(\d)\s*\/\s*(?=\d)/g,'$1 łamane przez ');
  // 4b) kody i liczby z separatorami
  s=s.replace(/(?<![\d-])(\d{2})-(\d{3})(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ])/g,(m,a,b)=>`${grupaTel(a)}, ${grupaTel(b)}`)   // 00-950 Warszawa
   .replace(/(?<![\d,.-])\d{2,4}(?:-\d{2,4}){3,}(?![\d-])/g,m=>m.split('-').map(grupaTel).join(', '))   // NIP 123-456-78-90
   .replace(/(?<![\d,.])(\d{1,3})((?:\.\d{3})+)(?=(?:,\d{1,2})?\s*(?:zł|PLN|€|EUR|USD|\$|złot|tys))/g,(m,a,b)=>a+b.replace(/\./g,''))   // 1.200 zł
   .replace(/(?<![\d,.])(\d+)\s*[x×](?![\d${L_}])/g,(m,n)=>`${n} ${+n===1?'raz':'razy'}`)   // 2x → dwa razy
   .replace(new RegExp(`(?<![${L_}\\d])([A-Z])(\\d{1,3})(?![\\d${L_}])`,'g'),(m,l,n)=>literuj(l)+' '+n);   // Q4, A4
  // 5) telefony
  s=s.replace(/(\+\s?\d{2})[\s-]?(\d{3})[\s-]?(\d{3})[\s-]?(\d{3})(?![\d]|[,.]\d)/g,(m,p,a,b,c)=>` plus ${numPL(+p.replace(/\D/g,''))}, ${grupaTel(a)}, ${grupaTel(b)}, ${grupaTel(c)}`)
     .replace(/(\+\s?\d{2})[\s-]?\(?(\d{2})\)?[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})(?![\d]|[,.]\d)/g,(m,p,a,b,c,d)=>` plus ${numPL(+p.replace(/\D/g,''))}, ${[a,b,c,d].map(grupaTel).join(', ')}`)
     .replace(/(?<![\d,.])\(?(\d{2})\)?[\s-](\d{3})[\s-](\d{2})[\s-](\d{2})(?![\d]|[,.]\d)/g,(m,a,b,c,d)=>[a,b,c,d].map(grupaTel).join(', '))
     .replace(/(?<![\d,.])(\d{3})-(\d{3})-(\d{3})(?![\d]|[,.]\d)/g,(m,a,b,c)=>[a,b,c].map(grupaTel).join(', '))
     .replace(/(?<![\d,.])(\d{3}) (\d{3}) (\d{3})(?![\d]|[,.]\d|\s*(?:zł|PLN|tys|mln|osób|sztuk|szt|kg|m|cm|%))/g,(m,a,b,c,off,str)=>KONTEKST_TEL.test(pre(str,off))||/^[4-8]/.test(a)?[a,b,c].map(grupaTel).join(', '):m)
     .replace(/(?<![\d,.])(\d{9})(?![\d]|[,.]\d)/g,(m,x,off,str)=>KONTEKST_TEL.test(pre(str,off))||/^[4-8]/.test(x)?[x.slice(0,3),x.slice(3,6),x.slice(6)].map(grupaTel).join(', '):m);
  // 6) separatory tysięcy (1 250 000, 1 250,50)
  s=s.replace(/(?<![\d,.])(\d{1,3})((?:[   ]\d{3})+)(?![\d])/g,(m,a,b)=>a+b.replace(/[   ]/g,''));
  // 7) daty i lata
  const przyp=(p)=>{ if(/(?:^|\s)(jest|to|był|była|będzie|wypada|przypada)\s*$/i.test(p)) return 'm';
    const w=/(?:^|\s)(?:(\S+)\s+)?(poniedziałek|wtorek|środa|czwartek|piątek|sobota|niedziela),?\s*$/i.exec(p);   // „Dziś środa, 28 października” — mianownik; „w środę…” nie pasuje
    return w&&!/^(w|we|od|do|na|przed|po|za)$/i.test(w[1]||'')?'m':'g'; };
  const data=(D,M,Y,p,rokSlowo)=>ordPL(D,przyp(p))+' '+MIES[M-1]+(Y?' '+ordPL(Y,'g')+' roku':'');
  // zakresy dat: 28.10–30.10, 3–5 listopada
  s=s.replace(/(?<![\d,.])(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s*[-–—]\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?![\d])(?:\s*(?:r\.|roku))?/g,(m,d1,m1,y1,d2,m2,y2,off,str)=>{
    if(+m1<1||+m1>12||+m2<1||+m2>12||+d1<1||+d1>31||+d2<1||+d2>31) return m; const Y=y2||y1;
    return (/od\s*$/i.test(pre(str,off))?'':'od ')+ordPL(+d1,'g')+(m1===m2&&!y1?'':' '+MIES[m1-1])+' do '+ordPL(+d2,'g')+' '+MIES[m2-1]+(Y?' '+ordPL(+Y,'g')+' roku':''); });
  s=s.replace(new RegExp(`${W0}(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\.?\\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)`,'gi'),(m,a,b,mi,off,str)=>
    +a>=1&&+b<=31&&+a<+b?(/od\s*$/i.test(pre(str,off))?'':'od ')+ordPL(+a,'g')+' do '+ordPL(+b,'g')+' '+mi.toLowerCase():m);
  s=s.replace(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g,(m,y,mo,d,off,str)=>{ const M=+mo,D=+d; if(M<1||M>12||D<1||D>31) return m; return data(D,M,+y,pre(str,off)); });
  s=s.replace(/(?<![\d,.])(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?:\s*(?:r\.|roku)(?=[\s,.;:!?)]|$))?(?![\d])/g,(m,d,mo,y,off,str)=>{
    const D=+d, M=+mo; if(D<1||D>31||M<1||M>12) return m; return data(D,M,y.length===2?2000+(+y):+y,pre(str,off)); });
  s=s.replace(/(?<![\d,.])(\d{1,2})\.(\d{1,2})(?=[\s,;:!?)]|\.(?:\s|$)|$)/g,(m,d,mo,off,str)=>{
    const D=+d, M=+mo; if(D<1||D>31||M<1||M>12) return m; return data(D,M,0,pre(str,off)); });
  s=s.replace(new RegExp(`${W0}(\\d{1,2})\\.?\\s+(stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)(?:\\s+(\\d{4})(?:\\s*(?:r\\.|roku)${W1})?)?`,'gi'),(m,d,mi,y,off,str)=>{
    const D=+d; if(D<1||D>31) return m; return ordPL(D,przyp(pre(str,off)))+' '+mi.toLowerCase()+(y?' '+ordPL(+y,'g')+' roku':''); });
  // lata: „w 2025 r.” → w … dwudziestym piątym roku; „od 2025 r.” → od … dwudziestego piątego roku; „rok 2026” → rok … dwudziesty szósty
  s=s.replace(new RegExp(`${W0}(w|we|po|z|ze|od|do|sprzed|przed|około)\\s+((?:19|20)\\d\\d)(?:\\s*(r\\.|roku|rokiem))?${W1}`,'gi'),(m,p,y,r)=>{
    const c=/^(w|we|po)$/i.test(p)?'l':/^przed$/i.test(p)?'l':'g';
    if(!r&&!/^(w|we)$/i.test(p)) return m;   // „od 2025” bez „roku” — może być kwota
    return p+' '+ordPL(+y,c)+' '+(/^przed$/i.test(p)?'rokiem':(c==='l'?'roku':'roku')); });
  s=s.replace(new RegExp(`${W0}(rok|roku|rocznik|rocznika)\\s+((?:19|20)\\d\\d)${W1}`,'gi'),(m,r,y)=>r+' '+ordPL(+y,/^roku$|^rocznika$/i.test(r)?'g':'m'));
  s=s.replace(/(?<![\d,.])((?:19|20)\d\d)\s*r\.(?=[\s,;:!?)]|$)/g,(m,y)=>ordPL(+y,'m')+' rok');
  s=s.replace(new RegExp(`(?<![\\d,.])((?:19|20)\\d\\d)\\s+(rok|roku|rokiem)${W1}`,'g'),(m,y,r)=>ordPL(+y,r==='rok'?'m':r==='roku'?'g':'l')+' '+r);
  // 8) godziny
  const godz=(h,mi,p)=>{ const H=+h, M=+mi; if(H>24||M>59) return null;
    const c=PRZ_NARZ.test(p)||/(?:^|[\s(,])na\s*$/i.test(p)?'fi':(PRZ_GEN.test(p)||PRZ_MIEJSC.test(p))?'fg':'f';
    const hw=H===0?'zero':ordPL(H,c);
    return hw+(M?' '+(M<10?'zero '+N_J[M]:numPL(M)):''); };
  s=s.replace(new RegExp(`${W0}(o|godz\\.|w\\s+godz\\.|w\\s+godzinach|godzinach)\\s+(\\d{1,2})[:.](\\d{2})\\s*[-–—]\\s*(\\d{1,2})[:.](\\d{2})(?![\\d])`,'gi'),(m,p,h,mi,h2,mi2)=>{
    const a=godz(h,mi,' od '), b=godz(h2,mi2,' do '); if(!a||!b) return m; return (/godzinach|w\s+godz/i.test(p)?'w godzinach ':'')+'od '+a+' do '+b; });
  s=s.replace(/(?<![\d,.])(\d{1,2}):(\d{2})(?:\s*[-–—]\s*(\d{1,2}):(\d{2}))?(?![\d])/g,(m,h,mi,h2,mi2,off,str)=>{
    let p=pre(str,off); if(/między\s+\S+(?:\s+\S+)?\s+a\s*$/i.test(p)) p=' między ';
    const a=godz(h,mi,p); if(!a) return m; if(h2==null) return a;
    const b=godz(h2,mi2,' do '); if(!b) return a; return PRZ_GEN.test(p)||/od\s*$/i.test(p)?a+' do '+b:'od '+godz(h,mi,' od ')+' do '+b; });
  s=s.replace(new RegExp(`${W0}(godzina|godzinie|godziny|godz\\.|o|od|do)\\s+(\\d{1,2})\\.(\\d{2})(?![\\d])`,'gi'),(m,p,h,mi)=>{ const a=godz(h,mi,' '+p.replace('godz.','o')+' '); return a?p.replace(/godz\./i,'o')+' '+a:m; });
  s=s.replace(new RegExp(`${W0}(w\\s+godzinach|w\\s+godz\\.?|godzinach|godz\\.?|godziny)\\s+(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})(?![\\d])`,'gi'),(m,p,a,b)=>+a<=24&&+b<=24?(/^w/i.test(p)?'w godzinach ':'')+'od '+ordPL(+a,'fg')+' do '+ordPL(+b,'fg'):m);
  s=s.replace(new RegExp(`${W0}(o|około|przed|po|od|do)\\s+(?:godz(?:inie|\\.)\\s*|godziny\\s+)(\\d{1,2})(?![\\d]|[.,:]\\d)`,'gi'),(m,p,h)=>+h<=24?p+' '+ordPL(+h,/^przed$/i.test(p)?'fi':'fg'):m);
  s=s.replace(new RegExp(`${W0}godz\\.\\s*(\\d{1,2})(?![\\d]|[.,:]\\d)`,'gi'),(m,h)=>+h<=24?'godzina '+ordPL(+h,'f'):m);
  s=s.replace(new RegExp(`${W0}(o)\\s+(\\d{1,2})(?=\\s*(?:$|[.;!?]|,(?!\\d)|\\s+(?:rano|wieczorem|po południu|w nocy|jutro|dzisiaj|dziś)))`,'gi'),(m,p,h)=>+h<=24?p+' '+ordPL(+h,'fg'):m);
  // 9) kwoty i jednostki
  s=s.replace(/(\$|€)\s?(\d+(?:[.,]\d+)?)/g,(m,u,n)=>n+' '+u);
  const UNIT=`(zł|PLN|gr|€|EUR|\\$|USD|mm|cm2|cm|m2|m²|m3|m³|km\\/h|km|kg|kWh|kW|kHz|Hz|mAh|ml|szt\\.?|godz\\.?|min\\.?|mies\\.?|tys\\.?|mln|mld|°C|°|MB|GB|kB|%|h|m|g|l|t|s|W|V)`;
  s=s.replace(new RegExp(`(?<![\\d,.])(?:(\\d+)\\s*[-–—]\\s*)?(\\d+)(?:,(\\d+))?\\s?${UNIT}(?![${L_}\\d²³])(?:\\s+(tys\\.?|mln|mld)(?![${L_}]))?(?:\\s*(zł|PLN|€|EUR)(?![${L_}]))?`,'g'),(m,od,a,fr,u,mult,cur,off,str)=>{
    let key=u.toLowerCase(); if(/^(szt|godz|min|mies|tys)$/.test(key)) key+='.';
    const f=JEDN[key]; if(!f) return m;
    const p=pre(str,off), n=+a;
    if(od!=null&&+od<n&&!fr&&!mult){   // 24–28°C → od dwudziestu czterech do dwudziestu ośmiu stopni Celsjusza
      const curF=cur?JEDN[cur.toLowerCase()]||JEDN['zł']:null, fz=JEDN_Z.has(f[0]);
      return (/od\s*$/i.test(p)?'':'od ')+(fz&&+od===1?'jednej':numPL(+od,true))+' do '+(fz&&n===1?'jednej':numPL(n,true))+' '+(/^(tys\.|mln|mld)$/.test(key)?unitGenPl(f)+(curF?' '+unitGenPl(curF):''):unitGenPl(f)); }
    const pre2=od!=null?numPL(+od)+', ':'';
    const gen=PRZ_GEN.test(p);
    const zen=JEDN_Z.has(f[0]);
    const liczba=(x,fem)=>{ const t=gen?numPL(x,true):numPL(x); return fem&&!gen?numZ(x,t):(fem&&gen&&x===1?'jednej':t); };
    const forma=(x,F)=>gen?(x===1?F[3]:unitGenPl(F)):formaPo(x,F);
    // 12,50 zł → dwanaście złotych pięćdziesiąt groszy
    if((key==='zł'||key==='pln')&&fr&&fr.length===2&&!mult){ const zl=JEDN['zł'], gr=JEDN.gr, g=+fr;
      return pre2+liczba(n)+' '+forma(n,zl)+(g?' '+liczba(g)+' '+forma(g,gr):''); }
    const curF=cur?JEDN[cur.toLowerCase()]||JEDN['zł']:null;
    if(/^(tys\.|mln|mld)$/.test(key)){   // 15 tys. zł → piętnaście tysięcy złotych
      const head=fr?ulamek(a,fr,gen)+' '+f[3]:liczba(n)+' '+forma(n,f);
      return pre2+head+(curF?' '+(gen?unitGenPl(curF):curF[2]):''); }
    if(mult){ const mf=JEDN[mult.toLowerCase().replace(/\.?$/,'.')]||JEDN[mult.toLowerCase()];
      const head=fr?ulamek(a,fr,gen)+' '+mf[3]:liczba(n)+' '+forma(n,mf);
      return pre2+head+' '+(gen?unitGenPl(f):f[2])+(curF?' '+(gen?unitGenPl(curF):curF[2]):''); }
    if(fr) return pre2+ulamek(a,fr,gen,zen)+' '+f[3];
    return pre2+liczba(n,zen)+' '+forma(n,f); });
  s=s.replace(new RegExp(`${W0}(zł|PLN)${W1}`,'g'),'złotych');
  // 10) pozostałe ułamki i liczby (z odmianą po przyimku i rodzajem żeńskim rzeczownika obok)
  s=s.replace(new RegExp(`(?<![\\d])(\\d+),(\\d+)(?![\\d])(?=(?:\\s+([${L_}]+))?)`,'g'),(m,a,b,w,off,str)=>ulamek(a,b,PRZ_GEN.test(pre(str,off)),zenska(w)));
  s=s.replace(/(?<![\d])(\d+)\.(\d+)(?![\d])/g,(m,a,b)=>numPL(+a)+' kropka '+numPL(+b));
  s=s.replace(new RegExp(`(?<![\\d,.])(\\d{1,2})\\.\\s+(?=([a-ząćęłńóśźż]+))`,'g'),(m,n,w,off,str)=>{ const fz=zenska(w)||/a$/.test(w);
    const c=/(?:^|[\s(,])(w|we|o|po|przy)\s*$/i.test(pre(str,off))?(fz?'fg':'l'):fz?'f':/(?:e|o|ie)$/.test(w)?'n':'m'; return ordPL(+n,c)+' '; });   // 3. raz → trzeci raz
  s=s.replace(new RegExp(`(?<![\\d])(\\d+)(?:\\s*[-–—]\\s*(\\d+))?(?![\\d])(\\s+([${L_}]+(?:-[${L_}]+)?))?(?=(?:\\s+([${L_}]+))?)`,'g'),(m,a,b,sp,word,word2,off,str)=>{
    const p=pre(str,off), nomer=/(numer|nr|punkt|strona|stronie|pozycja|pozycji|pokój|lokal|rozdział|paragraf|art\.|artykuł|krok|etap|wersja|faza|opcja|wariant|klasa|piętro|sala|tydzień|dzień)\s*$/i.test(p);
    // dopełniacz po przyimku, gdy rzeczownik obok też jest w dopełniaczu (około trzech tygodni; ale „około trzy tygodnie” jak w tekście)
    const funkcyjne=/^(do|i|lub|albo|a|czy|oraz|na|razy)$/i.test(word||'');
    const gen=!nomer&&PRZ_GEN.test(p)&&(!word||funkcyjne||GEN_PL.test(word)||(+a===1&&/(?:a|u|y|i|ej)$/.test(word))), fem=!nomer&&(zenska(word)||(/(?:e|ie|ych|ich)$/i.test(word||'')&&zenska(word2)));
    if(!nomer&&b==null&&word&&/(?:ami|mi)$/.test(word)&&+a<100&&+a>1) return numNarz(+a,fem)+sp;   // z dwoma klientami
    if(!nomer&&b==null&&+a===1&&word&&/(?:^|[\s(,])(z|ze|przed|za|nad|pod|między)\s*$/i.test(p)&&/(?:em|iem|ą)$/.test(word)) return (/ą$/.test(word)?'jedną':'jednym')+sp;   // z jednym klientem
    const L=x=>{ const t=numPL(+x,gen);
      if(+x===1&&!gen&&word) return jeden(word,fem);
      return fem&&!gen?numZ(+x,t):(fem&&gen&&+x===1?'jednej':t); };
    if(b!=null&&+b>+a){   // zakres: „5–7 dni” → od pięciu do siedmiu dni; „w 2–3 tygodnie” → w dwa, trzy tygodnie
      const odDo=(!word||GEN_PL.test(word)||gen)&&!(word2&&/e$/.test(word2)&&!GEN_PL.test(word2));
      if(odDo&&!/(?:^|[\s(,])(w|we|na|za|po|przez|co)\s*$/i.test(p)) return (/od\s*$/i.test(p)||gen?'':'od ')+(fem&&+a===1?'jednej':numPL(+a,true))+' do '+(fem&&+b===1?'jednej':numPL(+b,true))+(sp||'');
      const LZ=x=>fem?numZ(+x,numPL(+x)):numPL(+x); return LZ(a)+', '+LZ(b)+(sp||''); }
    if(b!=null) return L(a)+', '+L(b)+(sp||'');
    return L(a)+(sp||''); });
  // 10b) „szefie”: model skraca akcentowane „e” po „sz” — Whisper słyszał „szafie/czafie” (3/18 rozpoznań);
  // wydłużone „ee” (akcent na tę sylabę i tak pada) daje 13/18 i nadal brzmi jak „szefie” (pomiar 28.10.2026)
  s=s.replace(new RegExp(`(?<![${L_}])([Ss])zef(?=(?:ie|a|em|owi|owa|owej|ową|ów|owie|ostwo|ostwa|uniu)?(?![${L_}]))`,'g'),'$1zeef');
  // 11) skrótowce i słowa obce
  s=s.replace(new RegExp(`[${L_}][${L_}\\d'’.-]*[${L_}\\d]|[${L_}]`,'g'),w=>{
    const tail=/[.-]+$/.exec(w); const core=tail?w.slice(0,-tail[0].length):w, low=core.toLowerCase().replace(/’/g,'\''), tl=tail?tail[0].replace(/-+/g,' '):'';
    if(OBCE[low]!=null){ const r=OBCE[low]; return (/^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]/.test(core)?r[0].toUpperCase()+r.slice(1):r)+tl; }
    if(SKROTOWCE_WYM[core]) return SKROTOWCE_WYM[core]+tl;
    if(/^[A-ZĄĆĘŁŃÓŚŹŻ]{2,5}$/.test(core)&&!SLOWA_SKROTOWCE.has(core)){ const vow=/[AĄEĘIOÓUY]/.test(core); if(!vow||core.length<=3) return literuj(core)+tl; }
    if(/^[A-ZĄĆĘŁŃÓŚŹŻ]{2,}$/.test(core)) return core.toLowerCase()+tl;
    if(/^[A-ZĄĆĘŁŃÓŚŹŻ]{2,5}-[a-ząćęłńóśźż]+$/.test(core)){ const [A,B]=core.split('-'); return (SKROTOWCE_WYM[A]||(SLOWA_SKROTOWCE.has(A)?A.toLowerCase():literuj(A)))+B+tl; }   // PDF-a → pe de efa
    return w; });
  // 12) znaki
  s=s.replace(/\s*[–—]\s*/g,', ').replace(/([^\s\d])-(?=[^\s\d])/g,'$1 ').replace(/\s+-\s+/g,', ').replace(/&/g,' i ').replace(/\+/g,' plus ')
     .replace(/=/g,' równa się ').replace(/±/g,' plus minus ').replace(/~/g,' około ').replace(/[→⇒]/g,', ').replace(/#/g,' ').replace(/@/g,' małpa ')
     .replace(/%/g,' procent').replace(/°/g,' stopni').replace(/[()[\]{}]/g,', ').replace(/["„”“«»]/g,'').replace(/[*_\\|<>^]/g,' ').replace(/\//g,' ')
     .replace(/\s+([,.!?;:])/g,'$1').replace(/([,;:])(?:\s*,)+/g,'$1').replace(/^[\s,.]+/,'').replace(/,\s*([.!?])/g,'$1').replace(/\.\s*\./g,'.').replace(/\s+/g,' ').trim();
  return s;
}
/* NORMALIZACJA-END */
/* Granice zdań: kropka po skrócie („np.”, „ul.”, „tel.”), w dacie („15.11.2026”), po inicjale („J. Kowalski”)
   ani po liczbie przed małą literą („15. listopada”) nie kończy zdania. Wspólne dla całej kwestii i dla czatu
   dopływającego kawałkami (wtedy granica na samym końcu dotychczasowego tekstu czeka na ciąg dalszy). */
const SKR_NIE=new Set(['np','ul','al','tel','nr','godz','ok','dr','prof','mgr','inż','pl','os','św','tzw','tj','tzn','wg','ws','dot','zob','pkt','str','poz','zał','sp','ds','im','gen','ks','red','wyd','pn','wt','śr','czw','pt','sob','ndz','nd','dn','ob','tow','kom','proc','wsp','jw','ul','pw','tys','mln','mld','gr','szt','godz','mies','m.in','b.d','sp. z o.o','o.o','in','s.c','p']);
const SKR_MOZE=new Set(['itd','itp','r','w','zł','min','cm','mm','km','kg','l','m','h','s']);
function granicaZdania(t,i,koniec){
  let j=i; while(j<t.length&&/[.!?…]/.test(t[j])) j++; const punct=t.slice(i,j);
  while(j<t.length&&/["”»)\]]/.test(t[j])) j++;
  if(j>=t.length) return koniec?j:0;                 // koniec tekstu: w strumieniu czekamy na ciąg dalszy
  if(!/\s/.test(t[j])) return -1;                    // „15.11”, „egzo.pl”, „3.5” — nie granica
  let k=j; while(k<t.length&&/\s/.test(t[k])) k++;
  if(/[!?…]/.test(punct)||punct.length>=3) return k;
  if(/\n/.test(t.slice(j,k))) return k;
  if(k>=t.length) return koniec?k:0;
  const next=t[k], duza=/[A-ZĄĆĘŁŃÓŚŹŻ"„«]/.test(next);
  const przed=t.slice(Math.max(0,i-12),i), slowo=(/(?:^|[\s(])((?:[a-ząćęłńóśźż]\.)+[a-ząćęłńóśźż]+|[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+|\d+)$/.exec(przed)||[])[1]||'';
  const low=slowo.toLowerCase();
  if(SKR_NIE.has(low)) return -1;
  if(/^[A-ZĄĆĘŁŃÓŚŹŻ]$/.test(slowo)&&duza) return -1;              // inicjał: J. Kowalski
  if(/^\d+$/.test(slowo)&&/(?:^|\n)[ \t]*\d+$/.test(t.slice(0,i))) return -1;   // „1. Zadzwonić…” — punkt listy, nie koniec zdania
  if(/^\d+$/.test(slowo)||SKR_MOZE.has(low)) return duza?k:-1;      // „w 2026. Potem” — tak; „15. listopada” — nie
  return k;
}
function sentences(t,koniec=true){
  const out=[]; let start=0;
  for(let i=0;i<t.length;i++){ if(!/[.!?…]/.test(t[i])) continue;
    const e=granicaZdania(t,i,koniec);
    if(e>0){ const s=t.slice(start,e).trim(); if(s) out.push(s); start=e; i=e-1; }
    else { while(i+1<t.length&&/[.!?…]/.test(t[i+1])) i++; } }
  const rest=t.slice(start).trim(); if(rest) out.push(rest);
  return out;
}
// strumień: zdania zakończone pewną granicą od pozycji `od` → [zdania, nowa pozycja]
function zdaniaGotowe(t,od){
  const out=[]; let start=od;
  for(let i=od;i<t.length;i++){ if(!/[.!?…]/.test(t[i])) continue;
    const e=granicaZdania(t,i,false);
    if(e===0) break;
    if(e>0){ const s=t.slice(start,e).trim(); if(s) out.push(s); start=e; i=e-1; }
    else { while(i+1<t.length&&/[.!?…]/.test(t[i+1])) i++; } }
  return [out,start];
}
function pauseAfter(t){ return /[?!]["”»]?$/.test(t)?.32:/[.…]["”»]?$/.test(t)?.26:/[,;:]$/.test(t)?.12:.18; }
function trimSilence(pcm,sr){
  let peak=0; for(let i=0;i<pcm.length;i++) peak=Math.max(peak,Math.abs(pcm[i]));
  const th=peak*.02, pad=Math.round(sr*.025); let a=0, b=pcm.length-1;
  while(a<b&&Math.abs(pcm[a])<th) a++; while(b>a&&Math.abs(pcm[b])<th) b--;
  a=Math.max(0,a-pad); b=Math.min(pcm.length,b+pad*2);
  const out=pcm.slice(a,b);
  const f=Math.min(out.length>>1,Math.round(sr*.006));
  for(let i=0;i<f;i++){ const g=i/f; out[i]*=g; out[out.length-1-i]*=g; }
  return {pcm:out,offset:a/sr};
}

/* ---------- Głoski → otwarcie ust ---------- */
const VOWELS='aąeęioóuy';
// głoski z liter: dwuznaki i zmiękczenia (ci, si, zi, ni, dzi + samogłoska → jedna głoska)
function phonesFromChars(chars,dur){
  const units=[]; let i=0;
  const items=[]; for(let k=0;k<chars.length;k++){ if(chars[k]==='_'){ if(items.length) items[items.length-1].d+=dur[k]; else items.push({c:' ',d:dur[k]}); } else items.push({c:chars[k],d:dur[k]}); }
  while(i<items.length){
    const c=items[i].c, n=items[i+1]?.c||'', n2=items[i+2]?.c||'';
    let ph=c, d=items[i].d, take=1;
    const di=c+n;
    if(c==='d'&&(n==='ż'||n==='ź'||n==='z')){ ph=di; take=2; if(n==='z'&&n2==='i'&&VOWELS.includes(items[i+3]?.c||'')){ ph='dź'; take=3; } }
    else if(['sz','cz','rz','ch'].includes(di)){ ph=di; take=2; }
    else if('csznd'.includes(c)&&n==='i'&&VOWELS.includes(n2)&&n2!=='i'){ ph={c:'ć',s:'ś',z:'ź',n:'ń'}[c]||c; take=2; }
    for(let k=1;k<take;k++) d+=items[i+k].d;
    units.push({p:ph,d}); i+=take;
  }
  return units;
}
function visClass(p){
  if(p===' '||/^[.,!?;:…"”»-]$/.test(p)) return 'SIL';
  if(p==='a') return 'A'; if(p==='e'||p==='ę') return 'E'; if(p==='i'||p==='j') return 'I'; if(p==='y') return 'Y';
  if(p==='o'||p==='ą') return 'O'; if(p==='u'||p==='ó'||p==='ł') return 'U';
  if('mbp'.includes(p)) return 'MBP'; if(p==='f'||p==='w') return 'FV';
  if(['sz','cz','rz','ż','dż'].includes(p)) return 'SH';
  if(['s','z','c','dz','ś','ź','ć','dź'].includes(p)) return 'S';
  if(p==='l') return 'L'; if(p==='r') return 'R'; if(p==='k'||p==='g') return 'KG'; if(p==='ch'||p==='h') return 'CH';
  return 'TDN';
}
const LIP_FPS=25;
// docelowe otwarcie ust (0 = zamknięte, 1 = najszerzej w bibliotece) dla klasy głoski
// spółgłoski między samogłoskami wyraźnie przymykają usta (pomiar: inaczej sylaby się zlewają)
const OPEN_T={A:1,O:.85,E:.72,Y:.62,U:.55,I:.5,SH:.42,S:.28,L:.42,R:.42,TDN:.32,KG:.42,CH:.45,FV:.22,MBP:0};
// strojenie doboru klatek (wyniki pomiarów: tests/test_realizm.py)
const CFG={skok:.08, zostan:.03, roznica:.25, wygladz:0, przenik:.2, fala:true};
function lipTargets(m,offset,total,pcm){
  const n=Math.max(1,Math.ceil(total*LIP_FPS)), tg=new Float32Array(n);
  const sr=m.sampleRate, hop=Math.round(sr/LIP_FPS), env=new Float32Array(n);
  for(let i=0;i<n;i++){ let a=0; const s=i*hop, e=Math.min(pcm.length,s+hop); for(let k=s;k<e;k++) a+=pcm[k]*pcm[k]; env[i]=Math.sqrt(a/Math.max(1,e-s)); }
  const srt=Array.from(env).sort((a,b)=>a-b), p95=srt[Math.floor(.95*(n-1))]||1; for(let i=0;i<n;i++) env[i]=Math.min(1,env[i]/p95);
  if(!m.dur||!m.chars){ for(let i=0;i<n;i++) tg[i]=env[i]<.12?0:Math.min(1,.25+env[i]*.8); return tg; }
  const fr=m.hop/sr, units=phonesFromChars(m.chars,m.dur); let t=-offset; const seg=[];
  for(const u of units){ const t0=t,t1=t+u.d*fr; t=t1; seg.push({v:visClass(u.p),p:u.p,t0,t1}); }
  const envAt=tm=>env[Math.max(0,Math.min(n-1,Math.floor(tm*LIP_FPS)))];
  if(CFG.fala){
    // ruch warg jako gładka fala: punkt w środku każdej głoski (samogłoska = szczyt, spółgłoska = dołek),
    // pauzy domknięte; między punktami przejście kosinusowe (bez schodków i bez przestrzelenia)
    const K=[[-1,0]];
    for(const s of seg){ const c=(s.t0+s.t1)/2;
      if(s.v==='SIL'){ const long=(s.t1-s.t0)>(/[.,!?;:…]/.test(s.p)?.07:.16);
        if(long){ K.push([s.t0+Math.min(.04,(s.t1-s.t0)/3),0]); K.push([s.t1-Math.min(.04,(s.t1-s.t0)/3),0]); } else K.push([c,.3*(.75+.45*envAt(c))]); }
      else K.push([c,Math.min(1,(OPEN_T[s.v]??.5)*(.75+.45*envAt(c)))]); }
    K.push([total+1,0]); K.sort((a,b)=>a[0]-b[0]);
    let q=0;
    for(let i=0;i<n;i++){ const tm=(i+.5)/LIP_FPS; while(q<K.length-2&&K[q+1][0]<=tm) q++;
      const [ta,va]=K[q],[tb,vb]=K[q+1], u=tb>ta?Math.min(1,Math.max(0,(tm-ta)/(tb-ta))):0;
      tg[i]=va+(vb-va)*(1-Math.cos(Math.PI*u))/2; }
  } else for(let i=0;i<n;i++){
    const tm=(i+.5)/LIP_FPS, g=seg.find(s=>tm>=s.t0&&tm<s.t1);
    let o;
    if(!g) o=0;
    else if(g.v==='SIL') o=(g.t1-g.t0)>(/[.,!?;:…]/.test(g.p)?.07:.16)?0:.3;
    else o=OPEN_T[g.v]??.5;
    tg[i]=Math.min(1,o*(.75+.45*env[i]));        // głośniej = szerzej
  }
  // krótkie głoski (krótsze niż krok ust 40 ms) nie mogą wypaść między krokami: m/b/p zawsze domyka usta,
  // samogłoski otwarte zawsze się otwierają; tym krokom dajemy większą wagę przy doborze klatek
  const wt=new Float32Array(n).fill(1);
  for(const s of seg){ if(s.v!=='MBP'&&s.v!=='A'&&s.v!=='O') continue;
    const i=Math.round((s.t0+s.t1)/2*LIP_FPS-.5); if(i<0||i>=n) continue;
    if(s.v==='MBP'){   // domknięte usta przez całą głoskę (przy wolniejszym tempie m/b/p trwa 2 kroki ust)
      const a0=Math.max(0,Math.ceil(s.t0*LIP_FPS-.5)), a1=Math.min(n-1,Math.floor(s.t1*LIP_FPS-.5));
      for(let k=Math.min(a0,i);k<=Math.max(a1,i);k++){ tg[k]=0; wt[k]=3; } }
    else { tg[i]=Math.max(tg[i],OPEN_T[s.v]*(.75+.45*env[i])); wt[i]=2; } }
  if(CFG.wygladz>0){   // bezwładność warg: wygładzenie celu, kroki przypięte (m/b/p, a/o) bez zmian
    const w=CFG.wygladz, s=Float32Array.from(tg);
    for(let i=1;i<n-1;i++) if(wt[i]<2) s[i]=(1-2*w)*tg[i]+w*(tg[i-1]+tg[i+1]);
    tg.set(s); }
  tg.wt=wt;
  return tg;
}

/* ---------- Brzmienie wypowiedzi: pauzy przy przecinkach i intonacja pytań (pomiary: tests/test_glos.py) ----------
   Model robi przy przecinkach pauzy do 0,5 s (naturalnie 0,15–0,25 s) — skracamy cichy środek pauzy i tyle samo
   czasu odejmujemy głoskom, więc usta dalej trafiają. Pytania tak/nie bez „czy” model czyta płasko jak
   stwierdzenie — podnosimy ton na ostatniej sylabie (pytania „co/gdzie/jak…” po polsku opadają — bez zmian). */
const GLOS={pauzaMax:.24, pauzaCel:.2, wznies:1.12, wzniesCzas:.36};
// barwa: filtry po syntezie (górnoprzepustowy + [typ, częstotliwość, wzmocnienie dB, Q]); do wyboru w ustawieniach
const BARWY={
  miekka:{n:'Miękka (dotychczasowa)',hp:80,g:1.1,f:[['lowshelf',220,3],['peaking',3400,-4,1.4],['highshelf',9500,2.5]]},
  ciepla:{n:'Ciepła, bliżej',hp:70,g:1.15,f:[['lowshelf',180,5],['peaking',300,1.5,.8],['peaking',3200,-5,1.2],['highshelf',9000,1]]},
  wyrazna:{n:'Wyraźna, jaśniejsza',hp:90,g:1.05,f:[['lowshelf',220,2],['peaking',2600,2,1],['peaking',4200,-2,2],['highshelf',8500,4]]},
  aksamitna:{n:'Aksamitna, ciemniejsza',hp:80,g:1.2,f:[['lowshelf',250,4],['peaking',2800,-6,.9],['highshelf',7000,-2]]}
};
function skrocPauzy(m,pcm,offset){
  if(!m.dur||!m.chars) return {pcm,dur:m.dur};
  const sr=m.sampleRate, hop=m.hop, off=Math.round(offset*sr), ch=m.chars, du=Float32Array.from(m.dur), n=ch.length, pre=new Float64Array(n+1);
  for(let k=0;k<n;k++) pre[k+1]=pre[k]+du[k];
  let peak=0; for(let i=0;i<pcm.length;i++) peak=Math.max(peak,Math.abs(pcm[i])); const th=peak*.04;
  const cuts=[];
  for(let k=0;k<n;k++){
    if(!',;:'.includes(ch[k])) continue;
    let j=k+1; while(j<n&&'_ '.includes(ch[j])) j++;
    const L=(pre[j]-pre[k])*hop/sr; if(L<=GLOS.pauzaMax) continue;
    const R=Math.round((L-GLOS.pauzaCel)*sr), s0=pre[k]*hop-off, s1=pre[j]*hop-off, a=Math.round((s0+s1-R)/2), b=a+R;
    if(a<0||b>pcm.length) continue;
    let e=0; for(let i=a;i<b;i++) e+=pcm[i]*pcm[i]; if(Math.sqrt(e/R)>th) continue;   // tylko cisza
    cuts.push([a,b]);
    let rest=R/hop; for(let q=k;q<j&&rest>0;q++){ const t=Math.min(du[q],rest); du[q]-=t; rest-=t; }
  }
  if(!cuts.length) return {pcm,dur:du};
  const out=new Float32Array(pcm.length-cuts.reduce((s,[a,b])=>s+b-a,0)); let w=0,r=0;
  for(const [a,b] of cuts){ out.set(pcm.subarray(r,a),w); w+=a-r; r=b; }
  out.set(pcm.subarray(r),w);
  return {pcm:out,dur:du};
}
const PYT_SZCZEG=/^(co|kto|kogo|komu|kim|czym|czego|gdzie|kiedy|jak|jaki|jaka|jakie|jakiego|jakim|jaką|jakich|dlaczego|czemu|ile|ilu|który|która|które|którego|której|którym|skąd|dokąd|odkąd|czyj|czyja|czyje|po co|na co|o co|o czym|w czym|z czym|od czego|do czego|z kim|o której|o kim|za ile)(?![a-ząćęłńóśźż])/i;
function pytanieTakNie(t){ t=String(t||'').trim(); if(!/\?["”»]?$/.test(t)) return false;
  const ost=t.split(/[,–—]/).pop().trim();   // „…, dobrze?” / „…, prawda?” — dopowiedzenie zawsze wznosi
  if(/^(dobrze|prawda|tak|zgoda|pasuje|okej|ok)(?![a-ząćęłńóśźż])/i.test(ost)) return true;
  const g=t.replace(/^(sze+f(ie|owo)|panie|pani)(\s+[A-ZĄĆĘŁŃÓŚŹŻ]\S*)?\s*,\s*/i,'');   // bez wołacza na początku
  if(/^czy(?![a-ząćęłńóśźż])/i.test(g)||/^czy(?![a-ząćęłńóśźż])/i.test(ost)) return false;   // „czy…” model już wznosi
  return !PYT_SZCZEG.test(g)&&!PYT_SZCZEG.test(ost); }
// wyższy ton na ostatniej sylabie: przyspieszenie odtwarzania od początku ostatniej sylaby do środka ostatniej
// samogłoski (czasy głosek z modelu), potem trzymane do końca; zwraca, o ile wcześniej kończy się dźwięk
function intonacja(src,start,T,rise,m,offset){
  if(!rise||T<.4) return 0;
  const r=GLOS.wznies; let a=T-GLOS.wzniesCzas, b=T-GLOS.wzniesCzas*.4;
  if(m&&m.dur&&m.chars){ const sr=m.sampleRate, hop=m.hop; let t=-(offset||0), v0=-1, v1=-1;
    for(let k=0;k<m.chars.length;k++){ const t1=t+m.dur[k]*hop/sr; if('aąeęioóuy'.includes(m.chars[k])){ v0=t; v1=t1; } t=t1; }
    if(v0>0&&v1<=T+.05){ a=Math.max(0,v0-.08); b=Math.min(T,(v0+v1)/2); } }
  if(b-a<.04) b=Math.min(T,a+.08);
  src.playbackRate.setValueAtTime(1,start+a); src.playbackRate.linearRampToValueAtTime(r,start+b);
  return (b-a)*(1-2/(1+r))+(T-b)*(1-1/r);
}

function utworz(opt){
  const o=Object.assign({bazaGlosu:'voice/',bazaUst:'lip/',canvas:null,glos:'mai',tempo:.9,wysokosc:1.05,
    wideo:()=>null, czekajNaSpoczynek:async()=>{}, napis:()=>{}, wyprzedzenie:.04, wersjaDanych:'1'}, opt||{});   // wersjaDanych: zmień po przebudowie kwestii/ust (omija starą pamięć przeglądarki)
  const zd={}; const emit=(n,...a)=>(zd[n]||[]).slice().forEach(f=>{ try{ f(...a); }catch(e){ console.error(e); } });
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const hasTTS='speechSynthesis' in global;
  const voice={on:false,v:null,rate:o.tempo,pitch:o.wysokosc,list:[],engine:'neural',neural:o.glos,barwa:o.barwa||'miekka'};
  const neural={state:'off',worker:null,ctx:null,ready:null,pending:new Map(),seq:0,chain:null};
  const setState=s=>{ neural.state=s; emit('stan',s); };
  let sayTok=0, subTimer=null, mowi=false;
  const napis=t=>{ clearTimeout(subTimer); o.napis(t||''); };

  /* ----- model neuronowy w osobnym wątku ----- */
  function neuralInit(){
    if(neural.ready) return neural.ready;
    setState('loading');
    neural.ready=new Promise((res,rej)=>{
      let w; try{ w=new Worker(o.bazaGlosu+'tts-worker.js?v='+o.wersjaDanych); }catch(e){ setState('failed'); rej(e); return; }
      neural.worker=w;
      w.onmessage=e=>{
        const m=e.data||{};
        if(m.type==='progress') emit('postep',{zaladowano:m.loaded,razem:m.total,zPamieci:!!m.cached});
        else if(m.type==='ready'){ setState('ready'); res(); }
        else if(m.type==='error'&&m.id==null){ setState('failed'); rej(new Error(m.message)); }
        else if(m.id!=null){ const p=neural.pending.get(m.id); neural.pending.delete(m.id); if(p) (m.type==='audio'?p.res(m):p.rej(new Error(m.message))); }
      };
      w.onerror=ev=>{ setState('failed'); rej(new Error(ev.message||'Wątek głosu nie wystartował.')); };
      w.postMessage({type:'init',voice:voice.neural});
    });
    neural.ready.catch(()=>{ neural.ready=null; });
    return neural.ready;
  }
  // „, ” przed zdaniem: model dostaje rozbieg i wyraźnie wymawia pierwsze słowo (pomiar Whisperem: 4/24 → 10–12/24
  // rozpoznanych pierwszych słów, np. „Spotkanie” zamiast „Pokanie”); cichy początek i tak obcina trimSilence
  const ROZBIEG=', ';
  function synthNeural(text,ids){ const id=++neural.seq; if(ids) ids.push(id); return new Promise((res,rej)=>{ neural.pending.set(id,{res,rej}); neural.worker.postMessage({type:'speak',id,text:voice.neural==='mai'?ROZBIEG+text:text,rate:voice.rate,noise:voice.szum,noiseW:voice.szumDl}); }); }
  // łańcuch brzmienia: ciepły dół, przygaszona ostrość, delikatne „powietrze”, łagodna kompresja
  function voiceChain(ctx,dest){
    if(neural.chain&&!dest) return neural.chain;
    const B=BARWY[voice.barwa]||BARWY.miekka;
    const f=(type,freq,gain,q)=>{const n=ctx.createBiquadFilter();n.type=type;n.frequency.value=freq;if(gain!=null)n.gain.value=gain;if(q!=null)n.Q.value=q;return n;};
    const nodes=[f('highpass',B.hp,null,.7),...B.f.map(x=>f(x[0],x[1],x[2],x[3]))];
    const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-20; comp.ratio.value=2.5; comp.attack.value=.008; comp.release.value=.15; comp.knee.value=6;
    const out=ctx.createGain(); out.gain.value=B.g;
    nodes.forEach((n,i)=>n.connect(nodes[i+1]||comp)); comp.connect(out); out.connect(dest||ctx.destination);
    if(!dest){ neural.chain=nodes[0]; neural.chainOut=out; }
    return nodes[0];
  }

  /* ----- gotowe kwestie (nagrane z góry tym samym głosem) ----- */
  const lib={idx:null,pcm:null,loading:null};
  function loadLibrary(){
    if(lib.loading) return lib.loading;
    lib.loading=(async()=>{
      const [idx,buf]=await Promise.all([fetch(o.bazaGlosu+'frazy.json?v='+o.wersjaDanych).then(r=>{if(!r.ok) throw new Error('frazy');return r.json();}),fetch(o.bazaGlosu+'frazy.wav?v='+o.wersjaDanych).then(r=>{if(!r.ok) throw new Error('frazy');return r.arrayBuffer();})]);
      const dv=new DataView(buf); let p=12;
      while(p<dv.byteLength-8){
        const id=String.fromCharCode(dv.getUint8(p),dv.getUint8(p+1),dv.getUint8(p+2),dv.getUint8(p+3)), sz=dv.getUint32(p+4,true);
        if(id==='data'){ lib.pcm=new Int16Array(buf.slice(p+8,p+8+sz)); break; }
        p+=8+sz+(sz&1);
      }
      lib.idx=idx; lib.zd=null;
    })().catch(e=>{ lib.loading=null; throw e; });
    return lib.loading;
  }
  function libChunks(text){
    if(!lib.idx||!lib.pcm||voice.neural!=='mai') return null;   // gotowe kwestie nagrane głosem Mai
    if(!lib.zd){ lib.zd=new Map(); for(const L of Object.values(lib.idx.lines)) for(const c of L) if(!lib.zd.has(c.text)) lib.zd.set(c.text,c); }
    // cała kwestia (tekst jak w stronie) albo jedno zdanie po zamianie na mowę (strumień czatu, raport)
    const L=lib.idx.lines[text]||(lib.zd.has(text)?[lib.zd.get(text)]:null); if(!L) return null;
    return L.map(c=>{ const s=lib.pcm.subarray(c.off,c.off+c.len), f=new Float32Array(c.len); for(let i=0;i<c.len;i++) f[i]=s[i]/32768;
      return {pcm:f,dur:Float32Array.from(c.dur),chars:[...c.chars],hop:lib.idx.hop,sampleRate:lib.idx.sampleRate,pre:c.pre,text:c.text,ms:0}; });
  }

  /* ----- silnik mowy: dźwięk rusza, gdy cała wypowiedź gotowa; zdania na osi czasu karty dźwiękowej ----- */
  const eng={tok:0,pend:[],busy:false,ready:[],open:false,hold:true,endAt:0,last:'',live:0,waiters:[],stats:[],sources:[],ids:[]};
  function speechDone(){ if(!eng.open&&!eng.pend.length&&!eng.busy&&!eng.ready.length&&eng.live===0){ const w=eng.waiters.splice(0); w.forEach(f=>f()); } }
  function waitSpeech(){ return new Promise(r=>{ eng.waiters.push(r); speechDone(); }); }
  function enqueueSpeech(text){ if(!text.trim()) return; eng.pend.push(text); pumpSpeech(); }
  async function pumpSpeech(){
    if(eng.busy) return; eng.busy=true; const tok=eng.tok;
    while(eng.pend.length&&tok===eng.tok){
      const text=eng.pend.shift();
      // zdanie, które jest gotową kwestią (np. „Już, szefie!”) — gra z biblioteki, bez liczenia
      const lc=libChunks(text);
      if(lc){ eng.ready.push(...lc.map(c=>({...c}))); flushSpeech(); continue; }
      let m;
      try{ m=await synthNeural(text,eng.ids); }catch(e){ continue; }
      if(tok!==eng.tok) break;
      m.text=text; eng.ready.push(m); flushSpeech();
    }
    if(tok===eng.tok){ eng.busy=false; flushSpeech(); speechDone(); }
  }
  function flushSpeech(){
    if(eng.hold){
      const buffered=eng.ready.reduce((a,m)=>a+m.pcm.length/m.sampleRate,0);
      // start dopiero gdy wszystko gotowe (albo zapas ≥ 6 s mowy przy długich odpowiedziach)
      if((!eng.open&&!eng.pend.length&&!eng.busy)||buffered>=6) eng.hold=false; else return;
    }
    while(eng.ready.length) scheduleSpeech(eng.ready.shift());
    speechDone();
  }
  function scheduleSpeech(m){
    const ctx=neural.ctx; if(!ctx) return;
    const sr=m.sampleRate, tr0=trimSilence(m.pcm,sr), sp=skrocPauzy(m,tr0.pcm,tr0.offset+(m.pre||0));
    const tr={pcm:sp.pcm,offset:tr0.offset}; if(sp.dur) m={...m,dur:sp.dur};
    const buf=ctx.createBuffer(1,tr.pcm.length,sr); buf.copyToChannel(tr.pcm,0);
    const s=ctx.createBufferSource(); s.buffer=buf; s.connect(voiceChain(ctx));
    const now=ctx.currentTime, cont=eng.endAt>now-.05, gap=cont?pauseAfter(eng.last):0;
    const start=Math.max(now+.06, eng.endAt+gap);
    eng.stats.push({gap:+(start-Math.max(eng.endAt,now)).toFixed(3),late:eng.endAt>0&&cont===false&&eng.stats.length>0&&eng.last?+(now-eng.endAt).toFixed(3):0,synthMs:Math.round(m.ms||0),sec:+buf.duration.toFixed(2),lib:!m.ms});
    const krocej=intonacja(s,start,buf.duration,pytanieTakNie(m.text),m,tr.offset+(m.pre||0));
    s.start(start); eng.endAt=start+buf.duration-krocej; eng.last=m.text||''; eng.live++;
    lip.segs.push({t0:start,dur:buf.duration,tl:lipTimeline(m,tr.offset+(m.pre||0),buf.duration,tr.pcm,start),glowa:ruchGlowy(tr.pcm,sr,buf.duration,pytanieTakNie(m.text))});
    if(lip.segs.length>16) lip.segs.shift();
    s.onended=()=>{ eng.live--; const i=eng.sources.indexOf(s); if(i>=0) eng.sources.splice(i,1); speechDone(); };
    eng.sources.push(s);
  }
  function stopSpeech(){
    if(neural.worker&&eng.ids.length) neural.worker.postMessage({type:'cancel',ids:eng.ids.slice()});
    eng.ids=[]; eng.tok++; eng.pend=[]; eng.ready=[]; eng.busy=false; eng.open=false; eng.hold=true; eng.endAt=0; eng.last='';
    for(const s of eng.sources){ try{ s.onended=null; s.stop(); }catch(e){} }
    eng.sources=[]; eng.live=0; lip.segs=[]; speechDone();
    if(hasTTS) speechSynthesis.cancel();
  }
  const neuralOn=()=>voice.on&&voice.engine==='neural'&&neural.state==='ready'&&!!neural.ctx;

  async function prepareSpeech(text){
    if(!(voice.on&&voice.engine==='neural')) return null;
    const lc=libChunks(text); if(lc) return lc;
    if(neural.state!=='ready') return null;
    const out=[];
    for(const s of sentences(spokenPL(text))){ try{ const m=await synthNeural(s); m.text=s; out.push(m); }catch(e){ return null; } }
    return out;
  }
  async function say(text,prepared){
    stopSpeech(); const tok=++sayTok;
    napis(text);
    const fin=()=>{ if(tok===sayTok) subTimer=setTimeout(()=>o.napis(''),600); };
    if(voice.on&&voice.engine==='neural'&&neural.ctx){
      if(!lib.idx){ try{ await Promise.race([loadLibrary(),wait(5000)]); }catch(e){} if(tok!==sayTok) return; }
      const chunks=prepared||libChunks(text);
      if(chunks||neural.state==='ready'){
        await o.czekajNaSpoczynek(); if(tok!==sayTok) return;
        eng.open=false;
        if(chunks){ eng.ready.push(...chunks.map(c=>({...c}))); flushSpeech(); }
        else sentences(spokenPL(text)).forEach(enqueueSpeech);
        await waitSpeech(); fin(); return;
      }
    }
    if(voice.on&&hasTTS&&speechSynthesis.getVoices().length){
      const u=new SpeechSynthesisUtterance(text); u.lang='pl-PL'; if(voice.v) u.voice=voice.v; u.rate=voice.rate; u.pitch=voice.pitch;
      await new Promise(r=>{ u.onend=r; u.onerror=r; speechSynthesis.speak(u); }); fin(); return;
    }
    subTimer=setTimeout(()=>{ if(tok===sayTok) o.napis(''); },Math.max(2200,text.length*70));
  }
  // odpowiedź dopływająca kawałkami (czat): zdania liczone w trakcie, dźwięk rusza, gdy całość gotowa
  function speechStream(){
    stopSpeech(); const tok=++sayTok; let done=0, prev='';
    if(neuralOn()){ eng.open=true; o.czekajNaSpoczynek(); }
    // reszta tekstu po już przeczytanych zdaniach — także gdy końcowy tekst jest przycięty albo zmieniony (np. trim())
    const reszta=full=>{ const base=prev.slice(0,done); if(full.startsWith(base)) return full.slice(done);
      const t=base.trim(); const i=t?full.indexOf(t):0; return i>=0?full.slice(i+t.length):full.slice(Math.min(done,full.length)); };
    return {
      dodaj(full){ if(tok!==sayTok) return; napis(full); if(!neuralOn()) return;
        if(prev&&!full.startsWith(prev.slice(0,done))){ const r=reszta(full); done=full.length-r.length; }
        prev=full;
        const [zd,nowy]=zdaniaGotowe(full,done); done=nowy;
        for(const z of zd) for(const s of sentences(spokenPL(z))) enqueueSpeech(s); },
      async zakoncz(full){ if(tok!==sayTok) return; napis(full);
        if(neuralOn()){ const rest=reszta(full).trim(); if(rest) sentences(spokenPL(rest)).forEach(enqueueSpeech); eng.open=false; flushSpeech(); await waitSpeech(); }
        else await say(full);
        if(tok===sayTok) subTimer=setTimeout(()=>o.napis(''),600); }
    };
  }

  /* ----- usta: prawdziwe klatki dolnej części twarzy, wyrównane do kadru bazowego -----
     Każda klatka ust ma POZĘ GŁOWY, z której pochodzi. Wklejamy tylko usta z klatek o pozie bliskiej
     obrazowi na ekranie — płaskie przekształcenie nie odda obrotu głowy w przestrzeni, więc usta z innej
     pozy byłyby krzywe (do 10°); przy bliskiej pozie błąd kąta < 1°. */
  const POSE_FREE=6, POSE_W=.03, POSE_MAX=16, K_CAND=64;
  // żuchwa: broda z wideo opuszcza się razem z otwieraniem ust (różnica otwarcia nakładka − wideo)
  const JAW_PX=5, JAW_Y0=227, JAW_CHIN=268, JAW_K=.35;
  // głowa i brwi przy mówieniu (układ kadru bazowego): kiwnięcia z rytmu głośności, lekkie kołysanie, brwi przy pytaniach
  const HEAD={dyMax:2.6, rot:.0075, brow:1.6, pivot:[585,300], k:.3, gain:3.4};
  // płótna pomocnicze nakładki: rysowane procesorem (bez synchronizacji z kartą graficzną przy każdej warstwie)
  const PL_CPU=o.plotnoCPU!==undefined?!!o.plotnoCPU:!(typeof location!=='undefined'&&/plotno=gpu/.test(location.search));
  const ctx2d=cv=>cv.getContext('2d',{willReadFrequently:PL_CPU});
  const oddaj=()=>new Promise(r=>{ if(globalThis.scheduler&&scheduler.yield) scheduler.yield().then(r); else { const ch=new MessageChannel(); ch.port1.onmessage=()=>r(); ch.port2.postMessage(0); } });
  const lip={img:null,lib:null,tory:{},segs:[],alpha:0,cur:-1,last:null,canvas:o.canvas,ctx:o.canvas?o.canvas.getContext('2d'):null,ready:null,fixes:0,frame:-1,diag:{n:0,off:0,maxOff:0}};
  lip.ready=(async()=>{ try{
    const [libj,track]=await Promise.all([fetch(o.bazaUst+'usta-klatki.json?v='+o.wersjaDanych).then(r=>r.json()),fetch(o.bazaUst+'usta-tor.json?v='+o.wersjaDanych).then(r=>r.json())]);
    const img=new Image(); img.src=o.bazaUst+'usta-klatki.webp?v='+o.wersjaDanych; await img.decode();
    lip.fps=track.fps||24;
    for(const k in track) if(Array.isArray(track[k])&&Array.isArray(track[k][0])) lip.tory[k]=track[k];   // tor dla każdego klipu (idle, kolejne pozy…)
    lip.track=lip.tory.idle;
    // lista klatek ust: prawdziwe (kafelek w swojej pozie) + wirtualne (kafelek z korektą, wpasowany w pozę kotwicy)
    const fr=libj.frames, V=libj.wirtualne||[], nR=fr.length, nE=nR+V.length;
    lip.etile=new Int16Array(nE); lip.emat=new Array(nE).fill(null); lip.open=new Float32Array(nE); lip.next=new Int16Array(nE); lip.real=new Uint8Array(nE);
    for(let e=0;e<nR;e++){ lip.etile[e]=e; lip.open[e]=fr[e].open; lip.next[e]=libj.next[e]; lip.real[e]=fr[e].kopia?0:1; }
    V.forEach((v,i)=>{ const e=nR+i; lip.etile[e]=v[0]; lip.emat[e]=v.slice(2,8); lip.open[e]=fr[v[0]].open; lip.next[e]=v[8]>=0?nR+v[8]:-1; });
    { let mi=0; for(let e=1;e<nR;e++) if(lip.real[e]&&lip.open[e]<lip.open[mi]) mi=e; lip.closed=mi; }
    // otwarcie ust w samym wideo (z najbliższej klatki biblioteki z tej samej klatki pętli)
    if(lip.tory.idle){ const n=lip.tory.idle.length, vo=new Float32Array(n).fill(-1);
      fr.forEach((f,e)=>{ if(!f.kopia&&f.i<n) vo[f.i]=f.open; });
      for(let j=0;j<n;j++) if(vo[j]<0){ let a=j,b=j; while(a>0&&vo[a]<0) a--; while(b<n-1&&vo[b]<0) b++; vo[j]=vo[a]>=0?vo[a]:Math.max(0,vo[b]); }
      lip.vopen=vo; }
    // maska warstwy żuchwy (w układzie kadru bazowego): od linii ust w dół do szyi, miękkie brzegi
    { const X=500,Y=JAW_Y0-6,W=164,H=118, m=document.createElement('canvas'); m.width=W; m.height=H; const x=ctx2d(m), id=x.createImageData(W,H);
      for(let yy=0;yy<H;yy++) for(let xx=0;xx<W;xx++){ const rx=X+xx, ry=Y+yy;
        const top=Math.min(1,Math.max(0,(ry-(JAW_Y0-2))/10)), bot=Math.min(1,Math.max(0,(JAW_CHIN+30-ry)/22)), side=Math.min(1,Math.max(0,(74-Math.abs(rx-582))/16));
        id.data[(yy*W+xx)*4+3]=Math.round(255*top*bot*side); }
      x.putImageData(id,0,0); lip.jawMask={c:m,X,Y,W,H}; lip.jawCanvas=document.createElement('canvas'); lip.jawCanvas.width=240; lip.jawCanvas.height=200; ctx2d(lip.jawCanvas); lip.jaw=0; }
    const maska=(X,Y,W,H,fn)=>{ const m=document.createElement('canvas'); m.width=W; m.height=H; const x=ctx2d(m), id=x.createImageData(W,H);
      for(let yy=0;yy<H;yy++) for(let xx=0;xx<W;xx++) id.data[(yy*W+xx)*4+3]=Math.round(255*Math.max(0,Math.min(1,fn(X+xx,Y+yy))));
      x.putImageData(id,0,0); return {c:m,X,Y,W,H}; };
    const cl=v=>Math.max(0,Math.min(1,v));
    // głowa: twarz z włosami, miękkie brzegi (tło przy włosach przesuwa się o ułamek piksela — niewidoczne), wygaszenie na szyi
    lip.headMask=maska(462,26,256,300,(x,y)=>{ const e=((x-588)/118)**2+((y-172)/142)**2; return cl((1-e)/.3)*cl((305-y)/35); });
    // brwi: pas nad linią oczu (oczy w układzie twarzy: (567,155) i (640,172)), bez powiek
    const oko=x=>155+(x-567)*.233;
    lip.browMask=maska(512,84,184,96,(x,y)=>{ const L=oko(x); return cl((y-(L-54))/10)*cl(((L-8)-y)/8)*cl((80-Math.abs(x-602))/18); });
    lip.headCanvas=document.createElement('canvas'); lip.headCanvas.width=320; lip.headCanvas.height=360;
    lip.browCanvas=document.createElement('canvas'); lip.browCanvas.width=230; lip.browCanvas.height=140; ctx2d(lip.browCanvas);
    lip.hd=0; lip.hr=0; lip.hb=0;
    const PL=track.poza&&track.poza.idle, PT=libj.poza;
    if(PL&&PT&&PT.length===nR){
      // odległość pozy: każda klatka ust × każda klatka pętli; dla każdej klatki pętli K najbliższych klatek ust
      // liczone porcjami (≤ 12 ms) z oddaniem wątku między porcjami — strona nie zamiera przy wczytaniu;
      // K najbliższych przez wstawianie do krótkiej posortowanej listy zamiast sortowania całej biblioteki (ta sama kolejność co sort stabilny)
      const nL=PL.length, nT=nE, Dm=new Float32Array(nT*nL);
      const poseOf=e=>e<nR?(lip.real[e]?PT[e]:null):PL[V[e-nR][1]];   // wirtualna ma pozę swojej kotwicy; kopie tylko przez wirtualne
      const pz=Array.from({length:nT},(_,t)=>poseOf(t));
      const k=Math.min(K_CAND,nT), cand=new Int16Array(nL*k), clen=new Uint8Array(nL), bD=new Float32Array(k), bI=new Int16Array(k);
      let tq=performance.now();
      for(let j=0;j<nL;j++){ const Q=PL[j]; let n=0;
        for(let t=0;t<nT;t++){ const P=pz[t]; let dd=1e6;
          if(P){ let s=0; for(let d=0;d<P.length;d++){ const x=P[d]-Q[d]; s+=x*x; } dd=Math.sqrt(s); }
          Dm[t*nL+j]=dd;
          if(n<k||dd<bD[k-1]){ let p=n<k?n++:k-1; while(p>0&&bD[p-1]>dd){ bD[p]=bD[p-1]; bI[p]=bI[p-1]; p--; } bD[p]=dd; bI[p]=t; } }
        let c=0; for(let q=0;q<n;q++){ if(q>=6&&bD[q]>POSE_MAX) break; cand[j*k+q]=bI[q]; c++; } clen[j]=c;
        if(performance.now()-tq>12){ await oddaj(); tq=performance.now(); } }
      lip.D=Dm; lip.nL=nL; lip.K=k; lip.cand=cand; lip.clen=clen;
    }
    lip.lib=libj; lip.img=img;
    rozgrzej();
  }catch(e){ lip.img=null; } })();
  // rozgrzanie kompilatora JS: pierwsze wywołania doboru ust są kilkanaście razy wolniejsze — robimy je zawczasu, w tle
  async function rozgrzej(){
    try{ const chars=Array.from('_d_z_i_ę_k_u_j_ę_,_ _m_a_m_ _t_o_ _o_d_ _r_a_z_u_.'), dur=Float32Array.from(chars,(_,i)=>3+(i*7)%6), sr=22050, hop=256;
      const total=dur.reduce((a,b)=>a+b,0)*hop/sr, pcm=new Float32Array(Math.ceil(total*sr)); for(let i=0;i<pcm.length;i++) pcm[i]=Math.sin(i*.05)*(.3+.3*Math.sin(i*.0007));
      const m={type:'rozgrzewka',id:0,pcm,dur,chars,hop,ms:0,sampleRate:sr};   // ten sam kształt i typy co wynik syntezy (wspólne dane kompilatora)
      for(let r=0;r<5;r++){ await oddaj(); const tg=lipTargets(m,0,total,pcm), js=lip.cand?Int16Array.from({length:tg.length},(_,i)=>(i*3)%lip.nL):null; lipSelect(tg,js); }
    }catch(e){}
  }
  const poseCost=(f,j)=>{ const d=lip.D[f*lip.nL+j]; return d>POSE_FREE?(d-POSE_FREE)*POSE_W:0; };
  // dokładny czas WYŚWIETLANEJ klatki wideo (requestVideoFrameCallback), inaczej currentTime
  function videoTime(v){
    if(v.requestVideoFrameCallback&&!v.__mowaRvfc){ v.__mowaRvfc=true; const cb=(now,md)=>{ v.__mowaMT=md.mediaTime; v.__mowaAt=performance.now(); v.requestVideoFrameCallback(cb); }; v.requestVideoFrameCallback(cb); }
    if(v.__mowaMT!=null&&!v.paused&&performance.now()-v.__mowaAt<150&&Math.abs(v.__mowaMT-v.currentTime)<.3) return v.__mowaMT;
    return v.currentTime;
  }
  // które klatki pętli będą na ekranie w kolejnych krokach ust (od chwili `start` karty dźwiękowej)
  function predictFrames(start,n){
    const L=lip.nL, fps=lip.fps, dur=L/fps, w=o.wideo()||{}, now=neural.ctx.currentTime;
    const base=(w.klip==='idle'&&w.el?videoTime(w.el):0)+(start-now);   // inna scena → pętla zacznie od początku
    const js=new Int16Array(n);
    for(let i=0;i<n;i++){ let tt=(base+(i+.5)/LIP_FPS)%dur; if(tt<0) tt+=dur; js[i]=Math.min(L-1,Math.floor(tt*fps)); }
    return js;
  }
  // wybór klatek (Viterbi): koszt = różnica otwarcia + odejście od pozy na ekranie + skok między nienastępującymi klatkami
  /* Dobór klatek ust (Viterbi). Koszt przejścia g→f: 0 dla kolejnej klatki nagrania, „zostań” dla tej samej,
     inaczej skok + różnica·|otwarcie(g) − otwarcie(f)|. Minimum po poprzednich klatkach liczone transformatą odległości
     (dwa przebiegi po klatkach posortowanych według otwarcia) — O(K) zamiast O(K²) na krok: ok. 10× szybciej. */
  function lipSelect(tg,js){
    const S=CFG.skok, Z=CFG.zostan, A=CFG.roznica;
    if(Z>S) return lipSelectRef(tg,js);
    const T=tg.length, open=lip.open, nx=lip.next, nE=open.length, wt=tg.wt||new Float32Array(T).fill(1);
    const pose=!!(lip.cand&&js), k=pose?lip.K:nE;
    if(!pose&&!lip.allReal) lip.allReal=Int16Array.from({length:nE},(_,i)=>i).filter(e=>lip.real[e]);
    const setAt=t=>pose?lip.cand.subarray(js[t]*k,js[t]*k+lip.clen[js[t]]):lip.allReal;
    // kolejność według otwarcia dla każdego zbioru kandydatów (zbiory są stałe dla klatki pętli) — liczona raz
    if(!lip.cordT||lip.cordT.length!==(pose?lip.nL:1)*k){ lip.cordT=new Int16Array((pose?lip.nL:1)*k); lip.cordOk=new Uint8Array(pose?lip.nL:1); }
    const ordAt=t=>{ const j=pose?js[t]:0, set=setAt(t), b=j*k, ord=lip.cordT.subarray(b,b+set.length);
      if(!lip.cordOk[j]){ const ix=Array.from({length:set.length},(_,q)=>q).sort((a,c)=>open[set[a]]-open[set[c]]||a-c); ord.set(ix); lip.cordOk[j]=1; } return ord; };
    const iP=lip.iPrev&&lip.iPrev.length===nE?lip.iPrev:(lip.iPrev=new Int32Array(nE).fill(-1)), iN=lip.iNext&&lip.iNext.length===nE?lip.iNext:(lip.iNext=new Int32Array(nE).fill(-1));
    const states=new Int16Array(T*k), back=new Int16Array(T*k), jv=new Float64Array(k), ja=new Int32Array(k);
    let prev=setAt(0), cost=new Float64Array(k), nc=new Float64Array(k); states.set(prev,0);
    for(let q=0;q<prev.length;q++){ const f=prev[q]; cost[q]=wt[0]*Math.abs(open[f]-tg[0])+(pose?poseCost(f,js[0]):(f===lip.closed?0:.05)); }
    let ordPrev=ordAt(0);
    for(let t=1;t<T;t++){
      const cur=setAt(t), ordCur=ordAt(t), nP=prev.length, nC=cur.length; states.set(cur,t*k);
      for(let r=0;r<nP;r++){ const g=prev[r]; if(iP[g]<0) iP[g]=r; const h2=nx[g]; if(h2>=0&&(iN[h2]<0||cost[r]<cost[iN[h2]])) iN[h2]=r; }
      // przebieg rosnący: min(cost − A·o) po klatkach o otwarciu ≤ x; malejący: min(cost + A·o) po ≥ x
      let p=0, m=Infinity, am=-1;
      for(let u=0;u<nC;u++){ const q=ordCur[u], x=open[cur[q]];
        while(p<nP){ const r=ordPrev[p], o2=open[prev[r]]; if(o2>x) break; const v=cost[r]-A*o2; if(v<m||(v===m&&r<am)){ m=v; am=r; } p++; }
        jv[q]=am>=0?m+A*x:Infinity; ja[q]=am; }
      p=nP-1; m=Infinity; am=-1;
      for(let u=nC-1;u>=0;u--){ const q=ordCur[u], x=open[cur[q]];
        while(p>=0){ const r=ordPrev[p], o2=open[prev[r]]; if(o2<x) break; const v=cost[r]+A*o2; if(v<m||(v===m&&r<am)){ m=v; am=r; } p--; }
        if(am>=0){ const v=m-A*x; if(v<jv[q]||(v===jv[q]&&am<ja[q])){ jv[q]=v; ja[q]=am; } } }
      const wtt=wt[t], tgt=tg[t], jt=pose?js[t]:0;
      for(let q=0;q<nC;q++){ const f=cur[q]; let best=jv[q]+S, bi=ja[q];
        let r=iP[f]; if(r>=0){ const v=cost[r]+Z; if(v<best||(v===best&&r<bi)){ best=v; bi=r; } }
        r=iN[f]; if(r>=0){ const v=cost[r]; if(v<best||(v===best&&r<bi)){ best=v; bi=r; } }
        nc[q]=best+wtt*Math.abs(open[f]-tgt)+(pose?poseCost(f,jt):0); back[t*k+q]=bi; }
      for(let r=0;r<nP;r++){ const g=prev[r]; iP[g]=-1; if(nx[g]>=0) iN[nx[g]]=-1; }
      const x=cost; cost=nc; nc=x; prev=cur; ordPrev=ordCur;
    }
    let q=0; for(let r=1;r<prev.length;r++) if(cost[r]<cost[q]) q=r;
    const out=new Int16Array(T); for(let t=T-1;t>=0;t--){ out[t]=states[t*k+q]; q=back[t*k+q]; }
    return out;
  }
  function lipSelectRef(tg,js){   // wersja wzorcowa O(T·K²) — do testu zgodności szybkiej wersji
    const T=tg.length, open=lip.open, nx=lip.next, wt=tg.wt||new Float32Array(T).fill(1);
    const step=(cur,prev,cost,nc,back,t,pose,k)=>{
      for(let q=0;q<cur.length;q++){ const f=cur[q]; let best=1e9,bi=0;
        for(let r=0;r<prev.length;r++){ const g=prev[r]; const c=cost[r]+(nx[g]===f?0:(g===f?CFG.zostan:CFG.skok+CFG.roznica*Math.abs(open[g]-open[f]))); if(c<best){best=c;bi=r;} }
        nc[q]=best+wt[t]*Math.abs(open[f]-tg[t])+(pose?poseCost(f,js[t]):0); back[t*k+q]=bi; }
    };
    const pose=!!(lip.cand&&js), k=pose?lip.K:open.length;
    const all=Int16Array.from({length:open.length},(_,i)=>i).filter(e=>lip.real[e]);
    const setAt=t=>pose?lip.cand.subarray(js[t]*k,js[t]*k+lip.clen[js[t]]):all;
    let prev=setAt(0); const states=new Int16Array(T*k), back=new Int16Array(T*k);
    let cost=new Float32Array(k), nc=new Float32Array(k); states.set(prev,0);
    for(let q=0;q<prev.length;q++){ const f=prev[q]; cost[q]=wt[0]*Math.abs(open[f]-tg[0])+(pose?poseCost(f,js[0]):(f===lip.closed?0:.05)); }
    for(let t=1;t<T;t++){ const cur=setAt(t); states.set(cur,t*k); step(cur,prev,cost,nc,back,t,pose,k); const x=cost; cost=nc; nc=x; prev=cur; }
    let q=0; for(let r=1;r<prev.length;r++) if(cost[r]<cost[q]) q=r;
    const out=new Int16Array(T); for(let t=T-1;t>=0;t--){ out[t]=states[t*k+q]; q=back[t*k+q]; }
    return out;
  }
  function lipTimeline(m,offset,total,pcm,start){
    if(!lip.lib) return new Int16Array(Math.max(1,Math.ceil(total*LIP_FPS))).fill(-1);
    const tg=lipTargets(m,offset,total,pcm), js=lip.cand&&start!=null?predictFrames(start,tg.length):null;
    const tl=lipSelect(tg,js); tl.js=js; tl.tg=tg; return tl;
  }
  // najbardziej zamknięte usta wśród klatek o pozie zgodnej z klatką pętli j
  function closedAt(j){ const k=lip.K, b=j*k; let best=lip.cand[b]; for(let q=1;q<lip.clen[j];q++){ const g=lip.cand[b+q]; if(lip.open[g]<lip.open[best]) best=g; } return best; }
  // zabezpieczenie przy rysowaniu: gdy wideo odjechało od przewidywania (przycięcie, przewinięcie),
  // klatkę ust z daleka w pozie zamieniamy na najbliższą w pozie o podobnym otwarciu
  function poseFix(f,j){
    if(f<0||!lip.cand||j<0) return f;
    const k=lip.K, b=j*k, lim=Math.max(POSE_MAX,lip.D[lip.cand[b+lip.clen[j]-1]*lip.nL+j])+3;   // granica doboru + zapas na ±1 klatkę
    if(lip.D[f*lip.nL+j]<=lim) return f; let best=lip.cand[b], bc=1e9;
    for(let q=0;q<lip.clen[j];q++){ const g=lip.cand[b+q], c=Math.abs(lip.open[g]-lip.open[f])+poseCost(g,j); if(c<bc){bc=c;best=g;} }
    lip.fixes++; return best;
  }
  function glowaAt(t){
    for(const s of lip.segs){ if(t>=s.t0&&t<s.t0+s.dur&&s.glowa){ const pos=(t-s.t0)*LIP_FPS, k=Math.min(s.glowa.dy.length-1,Math.floor(pos)), k2=Math.min(s.glowa.dy.length-1,k+1), f=pos-Math.floor(pos), g=s.glowa;
      return {dy:g.dy[k]*(1-f)+g.dy[k2]*f, r:g.rot[k]*(1-f)+g.rot[k2]*f, b:g.br[k]*(1-f)+g.br[k2]*f}; } }
    return null;
  }
  function lipFrameAt(t){
    for(const s of lip.segs){ if(t>=s.t0&&t<s.t0+s.dur){ const pos=(t-s.t0)*LIP_FPS, k=Math.floor(pos), kk=Math.min(s.tl.length-1,k);
      return {a:s.tl[kk], b:s.tl[Math.min(s.tl.length-1,k+1)], f:pos-k, j:s.tl.js?s.tl.js[kk]:-1, cel:s.tl.tg?s.tl.tg[kk]:-1}; } }
    return null;
  }
  function drawLipTile(c,e,alpha,x0,y0,T){
    c.imageSmoothingEnabled=true; c.imageSmoothingQuality='high';
    const L=lip.lib, tw=L.tileW, th=L.tileH, t=lip.etile[e], sx=(t%L.cols)*tw, sy=Math.floor(t/L.cols)*th, m=lip.emat[e];
    c.setTransform(T[0],T[1],T[2],T[3],T[4],T[5]); c.globalAlpha=alpha;
    if(m){ c.translate(x0,y0); c.transform(m[0],m[1],m[2],m[3],m[4],m[5]); c.drawImage(lip.img,sx,sy,tw,th,0,0,tw,th); }   // przeniesione usta: korekta do tej pozy
    else c.drawImage(lip.img,sx,sy,tw,th,x0,y0,tw,th);
  }
  // macierze 2×3 w zapisie canvas [a,b,c,d,e,f]: (x,y) → (a·x + c·y + e, b·x + d·y + f)
  const mul=(p,q)=>[p[0]*q[0]+p[2]*q[1],p[1]*q[0]+p[3]*q[1],p[0]*q[2]+p[2]*q[3],p[1]*q[2]+p[3]*q[3],p[0]*q[4]+p[2]*q[5]+p[4],p[1]*q[4]+p[3]*q[5]+p[5]];
  const inv=T=>{ const [A,B,C,D,E,F]=T, det=A*D-B*C; return [D/det,-B/det,-C/det,A/det,(C*F-D*E)/det,(B*E-A*F)/det]; };
  // warstwa z wideo: wycinek (maska w układzie twarzy) przekształcony X w układzie twarzy i położony z ruchem głowy:
  // M = T' · X · T⁻¹  (T: kadr bazowy → klatka, T' = T · ruch głowy)
  function drawLayer(c,v,T,Tp,X,Mk,cv,R){
    const tq=performance.now(), pr=lip.prof||(lip.prof={});
    try{ return drawLayer0(c,v,T,Tp,X,Mk,cv,R); } finally{ const k=Mk===lip.browMask?'brwi':'zuchwa'; pr[k]=(pr[k]||0)*.9+(performance.now()-tq)*.1; }
  }
  function drawLayer0(c,v,T,Tp,X,Mk,cv,R){
    const M=mul(mul(Tp,X),inv(T)), [A,B,C,D,E,F]=Tp, x=cv.getContext('2d');
    let bx0=1e9,by0=1e9,bx1=-1e9,by1=-1e9;
    for(const XX of [Mk.X,Mk.X+Mk.W]) for(const YY of [Mk.Y,Mk.Y+Mk.H]){ const u=A*XX+C*YY+E, q=B*XX+D*YY+F; bx0=Math.min(bx0,u); by0=Math.min(by0,q); bx1=Math.max(bx1,u); by1=Math.max(by1,q); }
    bx0=Math.floor(bx0)-2; by0=Math.floor(by0)-2; const bw=Math.min(cv.width,Math.ceil(bx1-bx0)+4), bh=Math.min(cv.height,Math.ceil(by1-by0)+4);
    x.globalCompositeOperation='copy'; x.setTransform(M[0],M[1],M[2],M[3],M[4]-bx0,M[5]-by0);
    const sx=Math.max(v.x,bx0-12), sy=Math.max(v.y,by0-14), sw=Math.min(bw+24,v.x+v.cv.width-sx), sh=Math.min(bh+28,v.y+v.cv.height-sy);
    if(sw>0&&sh>0) x.drawImage(v.cv,sx-v.x,sy-v.y,sw,sh,sx,sy,sw,sh);
    x.globalCompositeOperation='destination-in'; x.setTransform(A,B,C,D,E-bx0,F-by0); x.drawImage(Mk.c,Mk.X,Mk.Y);
    x.globalCompositeOperation='source-over'; x.setTransform(1,0,0,1,0,0);
    c.setTransform(1,0,0,1,0,0); c.globalAlpha=1; c.drawImage(cv,0,0,bw,bh,bx0-R.x,by0-R.y,bw,bh);
  }
  // ruch głowy w układzie twarzy: obrót wokół szyi + przesunięcie w pionie
  function headMatrix(dy,r){ const [Px,Py]=HEAD.pivot, co=Math.cos(r), si=Math.sin(r); return [co,si,-si,co,Px-(co*Px-si*Py),Py-(si*Px+co*Py)+dy]; }
  // przebieg ruchu głowy dla wypowiedzi (25 kroków/s): kiwnięcia = szybka obwiednia głośności − wolna (akcenty),
  // lekkie kołysanie, przy pytaniu tak/nie na końcu broda w górę i uniesione brwi
  function ruchGlowy(pcm,sr,total,pyt){
    const n=Math.max(1,Math.ceil(total*LIP_FPS)), hop=Math.round(sr/LIP_FPS), e=new Float32Array(n);
    for(let i=0;i<n;i++){ let a=0; const s=i*hop, t=Math.min(pcm.length,s+hop); for(let k=s;k<t;k++) a+=pcm[k]*pcm[k]; e[i]=Math.sqrt(a/Math.max(1,t-s)); }
    const srt=Array.from(e).sort((a,b)=>a-b), p95=srt[Math.floor(.95*(n-1))]||1; for(let i=0;i<n;i++) e[i]=Math.min(1.2,e[i]/p95);
    const sm=(a,k)=>{ const o=new Float32Array(a.length); for(let i=0;i<a.length;i++){ let s=0,c=0; for(let j=Math.max(0,i-k);j<=Math.min(a.length-1,i+k);j++){ s+=a[j]; c++; } o[i]=s/c; } return o; };
    const fast=sm(e,2), slow=sm(e,12), dy=new Float32Array(n), rot=new Float32Array(n), br=new Float32Array(n);
    const emph=Array.from(fast).map((v,i)=>v-slow[i]), es=[...emph].sort((a,b)=>a-b), p92=es[Math.floor(.92*(n-1))]||.2;
    const ph=Math.random()*6.28, fade=i=>Math.min(1,i/8,(n-1-i)/8);
    for(let i=0;i<n;i++){
      dy[i]=Math.max(-.3,Math.min(1,emph[i]*HEAD.gain))*HEAD.dyMax*fade(i);
      rot[i]=HEAD.rot*Math.sin(2*Math.PI*(i/LIP_FPS)/3.3+ph)*fade(i);
      br[i]=emph[i]>p92&&p92>.05?.45*HEAD.brow:0;
    }
    if(pyt){ const q=Math.min(n,Math.round(.6*LIP_FPS)); for(let k=0;k<q;k++){ const i=n-1-k, w=1-k/q; dy[i]-=.9*w; br[i]=Math.max(br[i],HEAD.brow*Math.min(1,w*1.6)); } }
    return {dy:sm(dy,1),rot,br:sm(br,2)};
  }
  /* ----- płótno głowy: głowa, brwi, żuchwa i usta rysowane BEZ ruchu głowy na małym płótnie nad głową;
     kiwnięcie i kołysanie robi przekształcenie CSS tego płótna (kompozytor/karta graficzna, tanio 60×/s).
     Zawartość przerysowywana tylko przy zmianie (nowa klatka wideo, usta, żuchwa, brwi) — ok. 25×/s. ----- */
  function hcInit(){
    if(lip.hc||!lip.tory.idle||!lip.headMask) return lip.hc;
    const M=lip.headMask, W=(o.canvas&&o.canvas.width)||1280, H=(o.canvas&&o.canvas.height)||720;
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    for(const tr of lip.tory.idle){ const [A,B,C,D,E,F]=tr[5];
      for(const X of [M.X,M.X+M.W]) for(const Y of [M.Y,M.Y+M.H]){ const u=A*X+C*Y+E, q=B*X+D*Y+F; x0=Math.min(x0,u); y0=Math.min(y0,q); x1=Math.max(x1,u); y1=Math.max(y1,q); } }
    const R={x:Math.max(0,Math.floor(x0)-16),y:Math.max(0,Math.floor(y0)-16)}; R.w=Math.min(W,Math.ceil(x1)+16)-R.x; R.h=Math.min(H,Math.ceil(y1)+16)-R.y;
    const cv=document.createElement('canvas'); cv.width=R.w; cv.height=R.h; cv.setAttribute('aria-hidden','true');
    cv.style.cssText=`position:absolute;inset:auto;left:${R.x/W*100}%;top:${R.y/H*100}%;width:${R.w/W*100}%;height:${R.h/H*100}%;pointer-events:none;transform-origin:0 0`;
    const par=o.canvas&&o.canvas.parentNode; if(par) par.insertBefore(cv,o.canvas.nextSibling);
    const mk=document.createElement('canvas'); mk.width=R.w; mk.height=R.h;
    const V={x:Math.max(0,R.x-32),y:Math.max(0,R.y-32)}; V.cv=document.createElement('canvas'); V.cv.width=Math.min(W,R.x+R.w+32)-V.x; V.cv.height=Math.min(H,R.y+R.h+32)-V.y;
    V.ctx=ctx2d(V.cv); V.t=-1; ctx2d(mk);
    lip.hc={cv,ctx:ctx2d(cv),R,W,H,V,mask:mk,maskT:null,key:'',css:'',G:[1,0,0,1,R.x,R.y],skala:1,skalaT:0};
    return lip.hc;
  }
  // maska głowy w układzie klatki (przeliczana tylko, gdy tor przesunie się o > 0,7 px)
  function hcMask(T){
    const hc=lip.hc, m=hc.maskT;
    if(m&&Math.abs(m[4]-T[4])<.7&&Math.abs(m[5]-T[5])<.7&&Math.abs(m[0]-T[0])<.002&&Math.abs(m[1]-T[1])<.002) return hc.mask;
    const x=hc.mask.getContext('2d'); x.setTransform(1,0,0,1,0,0); x.clearRect(0,0,hc.R.w,hc.R.h);
    x.setTransform(T[0],T[1],T[2],T[3],T[4]-hc.R.x,T[5]-hc.R.y); x.drawImage(lip.headMask.c,lip.headMask.X,lip.headMask.Y); x.setTransform(1,0,0,1,0,0);
    const M=lip.headMask; let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    for(const X of [M.X,M.X+M.W]) for(const Y of [M.Y,M.Y+M.H]){ const u=T[0]*X+T[2]*Y+T[4]-hc.R.x, q=T[1]*X+T[3]*Y+T[5]-hc.R.y; x0=Math.min(x0,u); y0=Math.min(y0,q); x1=Math.max(x1,u); y1=Math.max(y1,q); }
    x0=Math.max(0,Math.floor(x0)-1); y0=Math.max(0,Math.floor(y0)-1); hc.box=[x0,y0,Math.min(hc.R.w,Math.ceil(x1)+1)-x0,Math.min(hc.R.h,Math.ceil(y1)+1)-y0];
    hc.maskT=T.slice(); return hc.mask;
  }
  const usta0=tr=>!!tr&&lip.alpha>=.02;
  function lipFrame(){
    requestAnimationFrame(lipFrame);
    lip.tick=(lip.tick||0)+1;
    const t0=performance.now(); lipDraw(); const dt=performance.now()-t0;
    lip.koszt=(lip.koszt||0)*.95+dt*.05; if(!lip.wolne&&lip.koszt>7) lip.wolne=true; else if(lip.wolne&&lip.koszt<3) lip.wolne=false;
  }
  function lipDraw(){
    lip.t0d=performance.now();
    // „mówi” = jest dźwięk teraz albo za chwilę (krótkie pauzy między zdaniami się nie liczą)
    const ct=neural.ctx?neural.ctx.currentTime:0, gra=eng.live>0&&lip.segs.some(s=>ct<s.t0+s.dur+.25);
    if(gra!==mowi){ mowi=gra; emit('mowi',mowi); }
    if(!lip.img) return;
    const hc=hcInit(); if(!hc) return;
    const w=o.wideo()||{}, v=w.el, track=w.klip&&lip.tory[w.klip];
    let speaking=false, fa=lip.closed, fb=lip.closed, ff=0, pj=-1;
    if(track&&lip.segs.length&&neural.ctx){
      const x=lipFrameAt(ct+o.wyprzedzenie);   // obraz wyprzedza dźwięk o 40 ms
      if(x&&x.a>=0){ speaking=true; fa=x.a; fb=x.b; ff=x.f; pj=x.j; lip.celNow=x.cel; }
      else if(lip.segs.some(s=>ct<s.t0+s.dur+.25)) speaking=true;
    }
    const vt=track&&v?videoTime(v):0, fi=track&&v?Math.min(track.length-1,Math.max(0,Math.round(vt*lip.fps))):-1, tr=fi>=0?track[fi]:null;
    lip.frame=fi;
    if(pj>=0&&fi>=0){ let d=Math.abs(pj-fi); d=Math.min(d,lip.nL-d); const g=lip.diag; g.n++; g.off+=d; g.maxOff=Math.max(g.maxOff,d); }   // trafność przewidywania klatki
    if(!tr||tr[3]<.6) speaking=false;
    lip.alpha+=((speaking?1:0)-lip.alpha)*(speaking?.4:.15);
    // ruch głowy (sprężyna: płynne wejście i powrót po wypowiedzi)
    const gh=(track&&w.klip==='idle'&&neural.ctx)?glowaAt(ct+o.wyprzedzenie):null;
    lip.hd+=((gh?gh.dy:0)-lip.hd)*HEAD.k; lip.hr+=((gh?gh.r:0)-lip.hr)*HEAD.k; lip.hb+=((gh?gh.b:0)-lip.hb)*HEAD.k;
    if(!tr||tr[3]<.6||w.klip!=='idle'){ lip.hd=lip.hr=lip.hb=0; }
    // pomiar płynności podczas mowy: gdy mimo trybu oszczędnego animacja ma < 32 kl/s, wyłącz ruch głowy (zostają usta, żuchwa, brwi)
    if(usta0(tr)){ const now0=performance.now(); if(lip.tPrev){ const d=now0-lip.tPrev; if(d<250){ lip.fpsN=(lip.fpsN||0)+1; lip.fpsS=(lip.fpsS||0)+d; } }
      lip.tPrev=now0; if(lip.fpsN>=90){ if(lip.wolne&&lip.fpsS/lip.fpsN>31.5&&!lip.bezGlowy){ lip.bezGlowy=true; emit('jakosc',{ruchGlowy:false}); } lip.fpsN=lip.fpsS=0; } } else lip.tPrev=0;
    if(lip.bezGlowy){ lip.hd=lip.hr=0; }
    const ruch=!!tr&&(Math.abs(lip.hd)>.06||Math.abs(lip.hr)>.0004), brwi=!!tr&&lip.hb>.12, usta=!!tr&&lip.alpha>=.02;
    // przekształcenie CSS płótna = ruch głowy w układzie klatki (Hf = T·H·T⁻¹), w pikselach płótna
    let G=[1,0,0,1,hc.R.x,hc.R.y];
    if(ruch){ const Hf=mul(mul(tr[5],headMatrix(lip.hd,lip.hr)),inv(tr[5])), R=hc.R; G=[Hf[0],Hf[1],Hf[2],Hf[3],Hf[0]*R.x+Hf[2]*R.y+Hf[4],Hf[1]*R.x+Hf[3]*R.y+Hf[5]]; }
    hc.G=G;
    const now=performance.now(); if(now-hc.skalaT>500){ hc.skala=(hc.cv.offsetWidth||hc.R.w)/hc.R.w; hc.skalaT=now; }
    const s=hc.skala, css=ruch?`matrix(${G[0].toFixed(5)},${G[1].toFixed(5)},${G[2].toFixed(5)},${G[3].toFixed(5)},${((G[4]-hc.R.x)*s).toFixed(3)},${((G[5]-hc.R.y)*s).toFixed(3)})`:'none';
    if(css!==hc.css){ hc.cv.style.transform=css; hc.css=css; }
    if(!ruch&&!brwi&&!usta){ if(hc.key!==''){ hc.ctx.setTransform(1,0,0,1,0,0); hc.ctx.clearRect(0,0,hc.R.w,hc.R.h); hc.key=''; } lip.cur=usta?lip.cur:lip.cur; return; }
    // usta
    if(!speaking){ fa=fb=lip.cur>=0?lip.cur:lip.closed; ff=0; }
    if(w.klip==='idle'&&lip.cand&&fi>=0){
      if(speaking&&pj<0){ fa=fb=closedAt(fi); ff=0; }   // krótka pauza między zdaniami: zamknięte usta w tej samej pozie
      else { fa=poseFix(fa,fi); fb=poseFix(fb,fi); }
    }
    // żuchwa: docelowe opuszczenie brody = różnica otwarcia (nakładka − wideo), z bezwładnością mięśni
    const oNow=lip.open[fa]*(1-ff)+(fb>=0?lip.open[fb]:lip.open[fa])*ff, vo=lip.vopen&&w.klip==='idle'?lip.vopen[fi]:0;
    const jawT=usta?Math.max(-1,Math.min(1,oNow-vo))*JAW_PX*lip.alpha:0;
    lip.jaw+=(jawT-lip.jaw)*JAW_K;
    // przejście: klatki kolejne w nagraniu — twardo jak w wideo (24 kl/s); skok — krótkie przenikanie na końcu kroku
    let fx=0; if(fb!==fa){ const nat=lip.next[fa]===fb; fx=nat?(ff>=.5?1:0):Math.min(1,Math.max(0,(ff-(1-CFG.przenik))/CFG.przenik)); fx=fx*fx*(3-2*fx); }
    if(fx>=.999){ fa=fb; fx=0; }
    lip.cur=fa; lip.ffLast=fx; lip.fbLast=fb;
    // pobranie klatki wideo (głowa, żuchwa, brwi) — najdroższa operacja; na wolnym urządzeniu co druga klatka wideo
    // (warstwa spóźnia się wtedy najwyżej o 1 klatkę pętli spoczynkowej, gdzie ruch to ułamek piksela)
    const V=hc.V, potrzebaWideo=ruch||brwi||Math.abs(lip.jaw)>.15; let vk=Math.round(vt*1000);
    if(potrzebaWideo&&V.t!==vk&&V.t>=0&&lip.wolne&&((lip.vSkip=(lip.vSkip||0)+1)&1)) vk=V.t;
    // przerysowanie tylko przy zmianie (na wolnym urządzeniu najwyżej co drugą klatkę ekranu)
    const key=[potrzebaWideo?vk:0,ruch?1:0,usta?fa:-1,usta?fb:-1,Math.round(fx*12),Math.round(lip.jaw*8),brwi?Math.round(lip.hb*10):0,Math.round(lip.alpha*12)].join(',');
    { const pr=lip.prof||(lip.prof={}); pr.przed=(pr.przed||0)*.95+(performance.now()-lip.t0d)*.05; pr.n=(pr.n||0)+1; }
    if(key===hc.key||(lip.wolne&&lip.tick%2&&hc.key!=='')) return;
    hc.key=key; { const pr=lip.prof; pr.rys=(pr.rys||0)+1; }
    const c=hc.ctx, R=hc.R, T=tr[5], To=[T[0],T[1],T[2],T[3],T[4]-R.x,T[5]-R.y];
    // jedno pobranie klatki wideo na przerysowanie (dekodowanie wideo → piksele jest najdroższe); głowa, żuchwa i brwi biorą z kopii
    const tv=performance.now();
    if(potrzebaWideo&&V.t!==vk){ V.ctx.globalCompositeOperation='copy'; V.ctx.drawImage(v,V.x,V.y,V.cv.width,V.cv.height,0,0,V.cv.width,V.cv.height); V.t=vk;
      const pr=lip.prof||(lip.prof={}); pr.wideo=(pr.wideo||0)*.9+(performance.now()-tv)*.1; pr.nw=(pr.nw||0)+1; }
    c.setTransform(1,0,0,1,0,0); c.globalAlpha=1; c.globalCompositeOperation='source-over'; c.clearRect(0,0,R.w,R.h);
    if(ruch){   // głowa: kopia wideo bez przekształcania + maska (miękkie brzegi)
      const tq=performance.now();
      const mk=hcMask(T), [bx,by,bw,bh]=hc.box;
      c.drawImage(V.cv,R.x-V.x+bx,R.y-V.y+by,bw,bh,bx,by,bw,bh);
      c.save(); c.beginPath(); c.rect(bx,by,bw,bh); c.clip();
      c.globalCompositeOperation='destination-in'; c.drawImage(mk,bx,by,bw,bh,bx,by,bw,bh); c.restore(); c.globalCompositeOperation='source-over';
      const pr=lip.prof||(lip.prof={}); pr.glowa=(pr.glowa||0)*.9+(performance.now()-tq)*.1;
    }
    if(brwi) drawLayer(c,V,T,T,[1,0,0,1,0,-lip.hb],lip.browMask,lip.browCanvas,R);
    if(usta){
      if(Math.abs(lip.jaw)>.15){ const sj=lip.jaw/(JAW_CHIN-JAW_Y0); drawLayer(c,V,T,T,[1,0,0,1+sj,0,-sj*JAW_Y0],lip.jawMask,lip.jawCanvas,R); }
      const L=lip.lib;
      drawLipTile(c,fa,lip.alpha,L.x0,L.y0,To);
      if(fb!==fa&&fx>.02) drawLipTile(c,fb,lip.alpha*fx,L.x0,L.y0,To);   // przejście do następnej prawdziwej klatki
    }
    c.globalAlpha=1; c.setTransform(1,0,0,1,0,0);
  }
  // zrzut nakładki tak, jak ją widać (płótno głowy z jego przekształceniem) — do testów i podglądu
  // bezRuchu: bez przekształcenia ruchu głowy (ocena samych ust: ostrość kafelka bez przesunięcia o ułamek piksela)
  function zrzutNakladki(ctx,sx,sy,w,h,dx,dy,bezRuchu){
    const hc=lip.hc; if(!hc) return; const G=bezRuchu?[1,0,0,1,hc.R.x,hc.R.y]:hc.G;
    ctx.save(); ctx.beginPath(); ctx.rect(dx,dy,w,h); ctx.clip();
    ctx.setTransform(1,0,0,1,dx-sx,dy-sy); ctx.transform(G[0],G[1],G[2],G[3],G[4],G[5]); ctx.drawImage(hc.cv,0,0); ctx.restore();
  }
  requestAnimationFrame(lipFrame);

  /* ----- interfejs ----- */
  function glosySystemowe(){ voice.list=hasTTS?speechSynthesis.getVoices().filter(v=>/^pl/i.test(v.lang)):[]; return voice.list; }
  const api={
    powiedz:(tekst,o2)=>say(String(tekst||''),o2&&o2.przygotowane||undefined),
    strumien:speechStream,
    przygotuj:t=>prepareSpeech(t).catch(()=>null),
    stop(){ sayTok++; stopSpeech(); },
    on(n,f){ (zd[n]=zd[n]||[]).push(f); return ()=>{ zd[n]=(zd[n]||[]).filter(x=>x!==f); }; },
    get zajeta(){ return eng.live>0||eng.busy||eng.pend.length>0||eng.ready.length>0; },
    get mowi(){ return mowi; },
    get wlaczona(){ return voice.on; },
    get stan(){ return neural.state; },
    get silnik(){ return voice.engine; },
    get glos(){ return voice.neural; },
    // w kliknięciu: kontekst audio (odblokowuje dźwięk), gotowe kwestie od razu, model w tle
    async wlacz(){
      try{ neural.ctx=neural.ctx||new (global.AudioContext||global.webkitAudioContext)(); await neural.ctx.resume(); }catch(e){}
      voice.on=true;
      const model=voice.engine==='neural'&&neural.state!=='ready'?neuralInit():Promise.resolve();
      model.then(()=>{ setTimeout(()=>{ if(neural.state==='ready') synthNeural('Dzień dobry.').catch(()=>{}); },1500); }).catch(()=>{});   // rozgrzewka po cichu
      let biblioteka=false; try{ await loadLibrary(); biblioteka=true; }catch(e){}
      return {biblioteka,model};
    },
    wylacz(){ voice.on=false; api.stop(); napis(''); },
    // przełączenie na syntezator systemu (gdy model nie wstał); false = brak polskich głosów
    naSystem(){ if(hasTTS&&glosySystemowe().length){ voice.engine='system'; if(!voice.list.includes(voice.v)) voice.v=voice.list[0]||null; return true; } return false; },
    ustawGlos(nazwa){
      if(nazwa==='mai'||nazwa==='gosia'){
        voice.engine='neural';
        if(nazwa!==voice.neural){ voice.neural=nazwa; neural.worker?.terminate(); neural.worker=null; neural.ready=null; setState('off');
          if(voice.on) return neuralInit(); }
        return Promise.resolve();
      }
      voice.engine='system'; voice.v=nazwa||null; return Promise.resolve();
    },
    ustaw(p){ if(p.tempo!=null) voice.rate=p.tempo; if(p.wysokosc!=null) voice.pitch=p.wysokosc; if(p.szum!==undefined) voice.szum=p.szum; if(p.szumDl!==undefined) voice.szumDl=p.szumDl;
      if(p.barwa&&BARWY[p.barwa]&&p.barwa!==voice.barwa){ voice.barwa=p.barwa; try{ neural.chainOut&&neural.chainOut.disconnect(); }catch(e){} neural.chain=null; neural.chainOut=null; } },
    barwy:()=>Object.fromEntries(Object.entries(BARWY).map(([k,v])=>[k,v.n])),
    get barwa(){ return voice.barwa; },
    glosySystemowe,
    gotoweUsta:()=>lip.ready,
    // dla testów i diagnostyki
    wnetrze:{eng,neural,lip,lib,voice,lipFrameAt,zrzutNakladki,glowaAt,ruchGlowy,headMatrix,head:HEAD,poseFix,predictFrames,videoTime,lipShapeAt:t=>{ const x=lipFrameAt(t); return x?x.a:null; },lipTimeline,lipTargets,lipSelect,lipSelectRef,skrocPauzy,pytanieTakNie,intonacja,glos:GLOS,barwy:BARWY,voiceChain,cfg:CFG,openT:OPEN_T,trimSilence,phonesFromChars,synthNeural,loadLibrary}
  };
  if(hasTTS) speechSynthesis.addEventListener?.('voiceschanged',()=>emit('glosy',glosySystemowe()));
  return api;
}

global.EgzoMowa={utworz,liczba:numPL,porzadkowy:ordPL,mowione:spokenPL,zdania:sentences,zdaniaGotowe,wersja:'1.1'};
})(typeof window!=='undefined'?window:globalThis);
