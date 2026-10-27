#!/usr/bin/env python3
"""Szuka najlepszego miejsca sklejenia dwóch klipów (koniec A -> fragment B).

Użycie:
  python3 tools/find_join.py klipA.mp4 klipB.mp4 [--a-from SEK] [--b-to SEK]

Porównuje klatki z końcówki klipu A z klatkami klipu B (w skali szarości 160x90)
i wypisuje pary o najmniejszej różnicy. Kolumna "twarz" to różnica w okolicy głowy,
bo tam ghosting przy przenikaniu widać najbardziej.
Orientacyjnie: <2 = cięcie bez przenikania, 3-5 = przenikanie 0,3-0,5 s, >6 = widoczny szew.
"""
import argparse, subprocess
import numpy as np

W, H = 160, 90

def frames(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf", f"scale={W}:{H},format=gray", "-f", "rawvideo", "-"],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(float)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("a"); ap.add_argument("b")
    ap.add_argument("--a-from", type=float, default=None, help="szukaj w A od tej sekundy (domyślnie ostatnie 3 s)")
    ap.add_argument("--b-to", type=float, default=None, help="szukaj w B do tej sekundy (domyślnie cały klip)")
    ap.add_argument("--fps", type=float, default=24)
    ap.add_argument("--top", type=int, default=8)
    a = ap.parse_args()
    A, B = frames(a.a), frames(a.b)
    a0 = int(a.a_from * a.fps) if a.a_from is not None else max(0, len(A) - int(3 * a.fps))
    b1 = int(a.b_to * a.fps) if a.b_to is not None else len(B)
    face = lambda x: x[0:35, 60:100]
    res = []
    for i in range(a0, len(A)):
        for j in range(0, b1):
            res.append((np.abs(A[i] - B[j]).mean(), np.abs(face(A[i]) - face(B[j])).mean(), i, j))
    res.sort()
    print("różnica  twarz   klatkaA (s)      klatkaB (s)")
    for d, f, i, j in res[:a.top]:
        print(f"{d:6.2f}  {f:6.2f}   {i:4d} ({i/a.fps:5.2f})   {j:4d} ({j/a.fps:5.2f})")

if __name__ == "__main__":
    main()
