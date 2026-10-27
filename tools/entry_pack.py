#!/usr/bin/env python3
"""Paczka wejść: przejścia z każdej pełnej sekundy pętli bazowej do jej klatki 0.

Segment k (k = 1..N-1) zaczyna się w czasie k * SEG sekund paczki i trwa SEG sekund:
interpolacja ruchu od klatki pętli w k-tej sekundzie do klatki 0 pętli (= kadr bazowy,
od którego startują klipy). Segment 0 jest pusty (klatka 0 sama w sobie jest celem).

Silnik czeka na najbliższą pełną sekundę pętli, przełącza się na segment paczki
(identyczna klatka, więc bez przenikania), a po SEG sekundach startuje klip.

Użycie: python3 tools/entry_pack.py media/egzo-idle.mp4 media/egzo-wejscia.mp4
"""
import os, shutil, subprocess, sys, tempfile

FPS = 24
SEG_FRAMES = 12  # 0,5 s
ENC = ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
       "-g", "12", "-keyint_min", "12", "-sc_threshold", "0", "-movflags", "+faststart"]

def run(*a):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *a], check=True)

def main(src, out):
    tmp = tempfile.mkdtemp()
    try:
        fr = os.path.join(tmp, "idle"); os.makedirs(fr)
        run("-i", src, "-start_number", "0", os.path.join(fr, "%05d.png"))
        n_idle = len(os.listdir(fr))
        seconds = n_idle // FPS
        target = os.path.join(fr, "00000.png")
        allf = os.path.join(tmp, "all"); os.makedirs(allf)
        idx = 0
        for k in range(seconds):
            src_png = os.path.join(fr, f"{k*FPS:05d}.png")
            if k == 0:
                seg = [target] * SEG_FRAMES
            else:
                md = os.path.join(tmp, f"m{k}"); os.makedirs(md)
                for i, p in enumerate([src_png, target, target]):
                    shutil.copy(p, os.path.join(md, f"k{i}.png"))
                run("-framerate", str(FPS / SEG_FRAMES), "-i", os.path.join(md, "k%d.png"),
                    "-vf", f"minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
                    "-start_number", "0", os.path.join(md, "m%05d.png"))
                ms = sorted(f for f in os.listdir(md) if f.startswith("m"))
                # klatki 1..SEG_FRAMES-1 to przejście, ostatnia = cel
                seg = [os.path.join(md, f) for f in ms[1:SEG_FRAMES]] + [target]
            for p in seg:
                os.symlink(p, os.path.join(allf, f"{idx:05d}.png")); idx += 1
        run("-framerate", str(FPS), "-i", os.path.join(allf, "%05d.png"), *ENC, out)
        print(f"gotowe: {out} ({seconds} segmentów po {SEG_FRAMES} klatek)")
    finally:
        shutil.rmtree(tmp)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
