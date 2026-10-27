#!/usr/bin/env bash
# Obróbka klipów z Veo do silnika recepcji.
#
#   tools/clips.sh pingpong WEJŚCIE.mp4 WYJŚCIE.mp4
#       Pętla tam-i-z-powrotem (przód + wstecz), zawsze bez szwu. Do ujęć spoczynkowych.
#
#   tools/clips.sh stitch KLIP.mp4 DOMKNIĘCIE.mp4 KLATKA_STARTU_DOMKNIĘCIA PRZENIKANIE_S WYJŚCIE.mp4
#       Klip + końcówka innego klipu, która wraca do kadru bazowego.
#       Klatkę startu i jakość szwu podaje tools/find_join.py.
#       Przykład (przyjęcie pliku): clips.sh stitch veo-04.mp4 veo-02.mp4 193 0.5 media/egzo-przyjecie.mp4
#
#   tools/clips.sh poster KLIP.mp4 WYJŚCIE.jpg
#       Pierwsza klatka jako kadr bazowy / poster.
#
# Wszystkie wyjścia: H.264, bez dźwięku, 24 kl/s, faststart (szybki start w przeglądarce).
set -euo pipefail
ENC=(-an -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -movflags +faststart)

case "${1:-}" in
  pingpong)
    in=$2; out=$3
    n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$in")
    ffmpeg -v error -y -i "$in" -filter_complex \
      "[0:v]split[f][r];[r]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[rv];[f]trim=end_frame=$((n-1)),setpts=PTS-STARTPTS[fw];[fw][rv]concat=n=2:v=1[o]" \
      -map "[o]" "${ENC[@]}" "$out" ;;
  stitch)
    clip=$2; tail=$3; from=$4; fade=$5; out=$6
    dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$clip")
    off=$(python3 -c "print(round($dur-$fade,3))")
    ffmpeg -v error -y -i "$clip" -i "$tail" -filter_complex \
      "[0:v]setpts=PTS-STARTPTS,fps=24[a];[1:v]trim=start_frame=$from,setpts=PTS-STARTPTS,fps=24[b];[a][b]xfade=transition=fade:duration=$fade:offset=$off,format=yuv420p[o]" \
      -map "[o]" "${ENC[@]}" "$out" ;;
  poster)
    ffmpeg -v error -y -i "$2" -frames:v 1 -q:v 3 "$3" ;;
  *)
    sed -n '2,17p' "$0"; exit 1 ;;
esac
echo "gotowe: ${@: -1}"
