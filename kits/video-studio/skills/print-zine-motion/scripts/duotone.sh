#!/usr/bin/env bash
# Print any clip in two inks (ink #0F0F10 -> paper #FAF8F5), no audio.
# usage: duotone.sh <in.mp4> <out.mp4> [lift]
#   lift: "light" (default) for bright footage, "dark" for footage shot on a dark background.
in="$1"; out="$2"; lift="${3:-light}"
if [[ -z "$in" || -z "$out" ]]; then echo "usage: duotone.sh <in> <out> [light|dark]"; exit 1; fi
if [[ "$lift" == dark ]]; then
  curve="0/0 0.08/0.35 0.2/0.75 0.5/0.95 1/1"
else
  curve="0/0 0.35/0.12 0.7/0.62 0.9/0.95 1/1"
fi
ffmpeg -v error -y -i "$in" -vf "format=gray,curves=all='$curve',format=rgb24,geq=r='15+(250-15)*r(X,Y)/255':g='15+(248-15)*g(X,Y)/255':b='16+(245-16)*b(X,Y)/255',format=yuv420p" \
  -an -c:v libx264 -crf 16 "$out" && echo "wrote $out"
