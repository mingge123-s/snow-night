#!/bin/bash
# Usage: assemble.sh <framesRoot> <out.mp4> [x264 preset] [crf]
set -e
F=$1; OUT=$2; PRESET=${3:-slow}; CRF=${4:-16}
E=/home/ubuntu/work/video/edit
X=0.33333333
seq_in() { echo "-framerate 30 -i $F/$1/f%04d.jpg"; }
cap() { echo "-loop 1 -framerate 30 -t 25.9 -i $E/cap_$1.png"; }
ffmpeg -v error -y \
  $(seq_in hook) $(seq_in curve) $(seq_in pile) $(seq_in sky) $(seq_in storm) $(seq_in end) \
  $(cap hook) $(cap curve) $(cap pile) $(cap sky) $(cap storm) $(cap end) \
  -i $E/track.wav \
  -filter_complex "
  [0:v]format=gbrp,setsar=1[a0];[1:v]format=gbrp,setsar=1[a1];[2:v]format=gbrp,setsar=1[a2];[3:v]format=gbrp,setsar=1[a3];[4:v]format=gbrp,setsar=1[a4];[5:v]format=gbrp,setsar=1[a5];
  [a0][a1]xfade=transition=fade:duration=$X:offset=3.16667[x1];
  [x1][a2]xfade=transition=fade:duration=$X:offset=9.33333[x2];
  [x2][a3]xfade=transition=fade:duration=$X:offset=14.0[x3];
  [x3][a4]xfade=transition=fade:duration=$X:offset=19.66667[x4];
  [x4][a5]xfade=transition=fade:duration=$X:offset=22.33333[x5];
  [6:v]format=rgba,fade=in:st=0.35:d=0.5:alpha=1,fade=out:st=2.85:d=0.3:alpha=1[c0];
  [7:v]format=rgba,fade=in:st=3.65:d=0.35:alpha=1,fade=out:st=9.0:d=0.3:alpha=1[c1];
  [8:v]format=rgba,fade=in:st=9.85:d=0.35:alpha=1,fade=out:st=13.7:d=0.3:alpha=1[c2];
  [9:v]format=rgba,fade=in:st=14.5:d=0.35:alpha=1,fade=out:st=19.35:d=0.3:alpha=1[c3];
  [10:v]format=rgba,fade=in:st=20.1:d=0.3:alpha=1,fade=out:st=22.05:d=0.3:alpha=1[c4];
  [11:v]format=rgba,fade=in:st=22.9:d=0.45:alpha=1[c5];
  [x5][c0]overlay=shortest=1[o0];[o0][c1]overlay[o1];[o1][c2]overlay[o2];[o2][c3]overlay[o3];[o3][c4]overlay[o4];[o4][c5]overlay,
  fade=in:st=0:d=0.3,fade=out:st=25.45:d=0.38,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]" \
  -map "[v]" -map 12:a -t 25.8333 -r 30 -c:v libx264 -preset $PRESET -crf $CRF -profile:v high -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 192k -movflags +faststart "$OUT"
