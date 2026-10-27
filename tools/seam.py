#!/usr/bin/env python3
"""Sklejanie klipów z interpolacją ruchu zamiast przenikania.

Każdy segment to (plik, klatka_od, klatka_do[, "rev"]). Między kolejnymi segmentami
wstawiane są klatki pośrednie wyliczone przez ffmpeg minterpolate (kompensacja ruchu),
więc twarz przesuwa się do nowej pozycji zamiast nakładać się dwa razy jak przy przenikaniu.

Przykład (powitanie + domknięcie + wejście w pętlę bazową w klatce 265):
  python3 tools/seam.py media/egzo-powitanie.mp4 \\
      source-clips/veo-03-powitanie.mp4:0:240 \\
      source-clips/veo-02-czytanie-rozmowa.mp4:184:240 \\
      media/egzo-idle.mp4:265:266 --last-segment-is-target

--last-segment-is-target: ostatni segment służy tylko jako cel interpolacji (nie trafia do
wyniku), dzięki czemu klip kończy się dokładnie klatką pętli bazowej.
"""
import argparse, os, subprocess, tempfile, shutil

FPS = 24
ENC = ["-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]

def run(*a):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *a], check=True)

def extract(seg, outdir):
    path, a, b, *rest = seg
    os.makedirs(outdir)
    vf = f"trim=start_frame={a}:end_frame={b},setpts=PTS-STARTPTS"
    if "rev" in rest:
        vf += ",reverse"
    run("-i", path, "-vf", vf + f",fps={FPS},scale=1280:720", "-start_number", "0", os.path.join(outdir, "%05d.png"))
    return sorted(os.listdir(outdir))

def morph(png_a, png_b, n, outdir):
    """n klatek pośrednich między png_a i png_b (bez samych końców)."""
    os.makedirs(outdir)
    for i, p in enumerate([png_a, png_b, png_b]):
        shutil.copy(p, os.path.join(outdir, f"k{i}.png"))
    src_fps = FPS / (n + 1)
    run("-framerate", f"{src_fps}", "-i", os.path.join(outdir, "k%d.png"),
        "-vf", f"minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
        "-start_number", "0", os.path.join(outdir, "m%05d.png"))
    frames = sorted(f for f in os.listdir(outdir) if f.startswith("m"))
    return [os.path.join(outdir, f) for f in frames[1:n + 1]]

def parse(s):
    parts = s.split(":")
    return (parts[0], int(parts[1]), int(parts[2]), *parts[3:])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("segments", nargs="+", help="plik:od:do[:rev][:cut]  (cut = bez klatek pośrednich przed segmentem)")
    ap.add_argument("--morph-frames", type=int, default=12, help="klatki pośrednie na szew (12 = 0,5 s)")
    ap.add_argument("--last-segment-is-target", action="store_true")
    a = ap.parse_args()
    tmp = tempfile.mkdtemp()
    try:
        segs = [parse(s) for s in a.segments]
        seq = []
        dirs = []
        for i, s in enumerate(segs):
            d = os.path.join(tmp, f"s{i}")
            dirs.append((d, extract(s, d)))
        for i, (d, files) in enumerate(dirs):
            target_only = a.last_segment_is_target and i == len(dirs) - 1
            if i > 0 and "cut" not in segs[i][3:]:
                prev_d, prev_files = dirs[i - 1]
                seq += morph(os.path.join(prev_d, prev_files[-1]), os.path.join(d, files[0]),
                             a.morph_frames, os.path.join(tmp, f"m{i}"))
            if not target_only:
                seq += [os.path.join(d, f) for f in files]
        lst = os.path.join(tmp, "all")
        os.makedirs(lst)
        for k, p in enumerate(seq):
            os.symlink(p, os.path.join(lst, f"{k:05d}.png"))
        run("-framerate", str(FPS), "-i", os.path.join(lst, "%05d.png"), *ENC, a.out)
        print(f"gotowe: {a.out} ({len(seq)} klatek, {len(seq)/FPS:.2f} s)")
    finally:
        shutil.rmtree(tmp)

if __name__ == "__main__":
    main()
