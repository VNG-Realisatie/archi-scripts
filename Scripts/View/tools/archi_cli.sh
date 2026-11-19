#!/usr/bin/env bash
# Run a jArchi script in Archi's command line (no window) on a scratch copy of a model, next to an open Archi.
#
# Usage: Scripts/View/tools/archi_cli.sh <script.ajs> [model.archimate] [out dir]
#   model:   default Scripts/View/test/model/view-test.archimate; copied, never changed in place (a model in the
#            out dir is used as it is: a later step on a copy)
#   out dir: default a new temporary folder; gets the copy (as the script saves it), <script>.console.txt and
#            <script>.log (the run's log file, its path from the line after the last "Log file:")
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
copy="$(realpath "$out")/$(basename "$model")"
[ "$model" = "$copy" ] || cp "$model" "$copy"   # a model already in the out dir is the copy (a later step on it)

status=0
GDK_BACKEND=x11 GTK_THEME=Adwaita SWT_GTK3=1 GTK_IM_MODULE=ibus GTK_OVERLAY_SCROLLING=0 UBUNTU_MENUPROXY=0 \
  "$archi/Archi" -application com.archimatetool.commandline.app -consoleLog -nosplash \
  --loadModel "$copy" --script.runScript "$script" > "$out/$(basename "$script" .ajs).console.txt" 2>&1 || status=$?
log=$(sed -n '/^Log file:$/{n;p}' "$out/$(basename "$script" .ajs).console.txt" | tail -1)   # the path on the line after
[ -n "$log" ] && cp "$log" "$out/$(basename "$script" .ajs).log"
echo "$out"
exit $status
