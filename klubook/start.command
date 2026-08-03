#!/bin/bash
# Dvojklikom spustí appku lokálne a otvorí ju v prehliadači.
cd "$(dirname "$0")" || exit 1
PORT=4173
echo "1. ŠK Košice — appka beží na http://localhost:$PORT"
echo "Zatvorením tohto okna sa server ukončí."
( sleep 1 && open "http://localhost:$PORT" ) &
python3 -m http.server "$PORT"
