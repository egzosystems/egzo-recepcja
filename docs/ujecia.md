# Lista ujęć i prompty do Veo

Generator: Gemini → Flow → Veo 3.1, tryb klatek.

**Ustawienia dla każdego klipu**
- Pierwsza **i ostatnia** klatka: `media/egzo-poster_2026-10-27.jpg`
- Proporcje 16:9, długość 6–8 s
- Dźwięk tylko w ujęciach z mową (02, 10, 14); w pozostałych i tak go usuwamy

**Dopisek na końcu każdego promptu** (stały):

```
She holds the white sheet of paper in her right robotic hand at the start and at the end of the clip. Locked-off static camera, no zoom, no cuts. Photorealistic, warm gold practical lighting, shallow depth of field. Face, hair bun, black-gold robotic body, EGZO lizard logo on the wall and the four tray labels stay unchanged. The final frame is identical to the first frame.
```

## Status

| Nr | Ujęcie | Status | Plik |
|---|---|---|---|
| 01 | Pozycja bazowa | ✅ pętla tam-i-z-powrotem | `media/egzo-idle_2026-10-27.mp4` |
| 02 | Powitanie / mowa | ✅ sklejone z domknięciem | `media/egzo-powitanie_2026-10-27.mp4` |
| 03 | Słuchanie | do zrobienia | |
| 04 | Przyjęcie pliku | ✅ obieg 1: 30 s z Veo, analiza cofnięta od 25 s + domknięcie | `media/egzo-obieg-1_2026-10-27.mp4` |
| 05 | Odczyt dokumentu | ✅ zawarte w 04 (od 10,4 s) | |
| 06 | Analiza | ✅ zawarte w 04 (od 21,2 s) | |
| 07 | Przeglądanie | do zrobienia | |
| 08 | Segregowanie (W TRAKCIE) | **następne** | |
| 09 | Potwierdzenie | do zrobienia | |
| 10 | Wyjaśnienie | do zrobienia | |
| 11 | Wprowadzanie danych | do zrobienia | |
| 12 | Odkładanie (DO AKCEPTACJI) | **następne** | |
| 13 | Powrót do pozycji | zbędne, jeśli klipy kończą się kadrem bazowym | |
| 14 | Zakończenie / propozycja | do zrobienia | |
| 15 | Pozycja końcowa | używa 01 | |

Wskazówka: klipy 20 s, w których jedna czynność płynnie przechodzi w następną (jak 04+05), dają najbardziej naturalny efekt, bo nie ma między nimi szwu.

Kolejność „następnych” odpowiada obiegowi dokumentu: przyjęcie → odczyt → analiza → segregowanie → odłożenie do akceptacji.

## Prompty (część zmienna)

### 05 Odczyt dokumentu
```
She lifts the sheet in her right hand to chest height, steadies it with her left hand and reads it carefully. Her eyes visibly scan the lines from left to right and move down the page, with a small nod of understanding. Then she lowers the sheet back to the starting position and looks into the lens.
```

### 06 Analiza
```
She glances at the sheet, then raises her left robotic hand to her chin and thinks: eyes drift up and slightly to the side, a small focused frown, lips pressed together. After a moment her face relaxes into a subtle confident smile, her left hand returns to the desk and she looks back into the lens.
```

### 08 Segregowanie
```
She leans slightly forward and with her left hand takes a sheet from the top of the stack she holds, places it neatly into the tray labelled W TRAKCIE directly in front of her, and taps the edge of the stack in that tray to align it. Then she sits back upright into the starting pose, still holding the paper in her right hand.
```

### 12 Odkładanie do folderu
```
She turns slightly to her left side of the desk (screen right), reaches with her left hand and places a single sheet into the tray labelled DO AKCEPTACJI, smoothing it flat with two fingers. She turns back to face the lens and settles into the starting pose.
```

### 03 Słuchanie
```
Attentive listening, as if someone across the desk is talking to her: a slight head tilt, eyebrows lifting gently, two slow small nods, natural blinks, a hint of a smile. Minimal body movement.
```

### 09 Potwierdzenie
```
She raises the index finger of her left hand in a small "got it" gesture, gives one short decisive nod and a warm smile, then lowers the hand back to the desk.
```

### 10 Wyjaśnienie (z mową)
```
She explains something calmly to the viewer, speaking in Polish in a friendly professional tone, with relaxed gestures of her left hand at desk height. Lips move naturally with the speech. She finishes with a small nod.
```

### 11 Wprowadzanie danych
```
She turns her torso toward the computer monitor on screen left, places her left hand on the keyboard and types a short line while looking at the screen, then turns back toward the lens.
```

### 14 Zakończenie / propozycja (z mową)
```
She looks into the lens and offers a suggestion with an open left palm, speaking briefly in Polish with a friendly expression, then returns the hand to the desk.
```

### 07 Przeglądanie
```
She leafs through the two or three sheets she is holding, flipping each page with the fingers of her left hand, paper bending realistically, eyes following each page.
```

## Jeśli klip nie wraca do pozycji

1. `python3 tools/find_join.py nowy.mp4 source-clips/veo-02-czytanie-rozmowa_2026-10-27.mp4 --b-to 9`
2. Weź najlepszą parę i sklej: `tools/clips.sh stitch nowy.mp4 source-clips/veo-02-... KLATKA 0.5 media/egzo-xxx_DATA.mp4`
3. W `index.html` ustaw `byId.<ujęcie>.src` i `exitAt` (klatka pętli bazowej najbliższa końcowi klipu, zwykle 265/24).
