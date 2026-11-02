#!/usr/bin/env bash
# Run a jArchi script in Archi's command line (no window) on a scratch copy of a model, next to an open Archi.
#
# Usage: Scripts/View/tools/archi_cli.sh <script.ajs> [model.archimate] [out dir]
#   model:   default Scripts/View/test/model/view-test.archimate; copied, never changed in place
#   out dir: default a new temporary folder; gets the copy (as the script saves it) and console.txt
#   ARCHI_HOME: the Archi folder, default ~/Tools/Archi
# Prints the out dir; the exit code is Archi's.
#
# The display settings are those of Archi.sh (the user's Archi): without GDK_BACKEND=x11 GTK runs on Wayland
# at another dpi, text measures smaller and every element size differs from a run in the user's Archi.
set -euo pipefail

script=$(realpath "$1")
root=$(cd "$(dirname "$0")/../../.." && pwd)
model=$(realpath "${2:-$root/Scripts/View/test/model/view-test.archimate}")
out=${3:-$(mktemp -d)}
archi=${ARCHI_HOME:-$HOME/Tools/Archi}

mkdir -p "$out"
cp "$model" "$out/"
copy="$out/$(basename "$model")"

status=0
GDK_BACKEND=x11 GTK_THEME=Adwaita SWT_GTK3=1 GTK_IM_MODULE=ibus GTK_OVERLAY_SCROLLING=0 UBUNTU_MENUPROXY=0 \
  "$archi/Archi" -application com.archimatetool.commandline.app -consoleLog -nosplash \
  --loadModel "$copy" --script.runScript "$script" > "$out/console.txt" 2>&1 || status=$?
echo "$out"
exit $status
