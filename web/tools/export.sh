#!/bin/zsh
# Re-export the Kyoto v2 courtyard from Unity into web/public/kyoto.
#
#   web/tools/export.sh [unity-project]
#
# Runs Assets/Editor/WebExport.cs in batch mode (meshes, baked light, PNG
# pictures), then packs the pictures as WebP. Batch mode cannot open a project
# the editor already has open: either pass a copy of the project (with its
# Library), or run "Inbox Zero > Kyoto v2 > Export For Web" from the open
# editor and then this script with --pack-only.
#
# The sky is separate (Unity imports the panorama clamped): web/tools/sky.py.
set -e
HERE=${0:A:h}
OUT=$HERE/../public/kyoto
UNITY=/Applications/Unity/Hub/Editor/6000.6.8f1/Unity.app/Contents/MacOS/Unity
mkdir -p $OUT/tex $OUT/audio
if [[ $1 != --pack-only ]]; then
  PROJECT=${1:-$HERE/../../unity}
  WEB_OUT=$OUT $UNITY -batchmode -projectPath "$PROJECT" -executeMethod InboxZero.EditorTools.WebExport.Run -quit -logFile $OUT/export.log
  grep -E "error CS|Exception" $OUT/export.log | sort -u | head
fi
cd $OUT/png
for f in *.png; do
  n=${f%.png}
  [[ $n == Sky ]] && continue                      # see sky.py
  case $n in
    Ground_Splat) cwebp -quiet -lossless $f -o ../tex/$n.webp ;;
    Water_Normal) cwebp -quiet -q 92 $f -o ../tex/$n.webp ;;
    *) cwebp -quiet -q 84 -alpha_q 95 $f -o ../tex/$n.webp ;;
  esac
done
RES=$HERE/../../unity/Assets/Resources
cwebp -quiet -q 88 $RES/Kyoto/Brush.png -o ../tex/Brush.webp
cwebp -quiet -q 90 $RES/Kyoto/Letter_Washi.png -o ../tex/Letter_Washi.webp
cwebp -quiet -q 92 -alpha_q 100 $RES/Logo.png -o ../tex/Logo.webp
cp $RES/Audio/*.wav ../audio/
tail -1 ../export-report.txt
