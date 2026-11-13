#!/bin/sh
# contact sheet: sheet.sh <dir> <out.jpg> [cols]
cols=${3:-4}
ffmpeg -v error -y -pattern_type glob -i "$1/*.png" -vf "scale=480:-1,drawbox=c=white@0:t=0,tile=${cols}x$(( ( $(ls $1/*.png | wc -l) + cols - 1 ) / cols )):padding=6:color=gray" -frames:v 1 "$2"
