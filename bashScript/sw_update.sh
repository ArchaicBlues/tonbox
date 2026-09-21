#!/bin/bash
set -e

URL="https://archaicblues.de/tonboxUpdate.tar.gz"

WORKDIR="/home/pi/update_tmp"
ARCHIVE="$WORKDIR/update.tar.gz"

echo "================================="
echo " Tonbox Update - Download Phase"
echo "================================="

rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"

echo "Downloading..."
wget -O "$ARCHIVE" "$URL"

echo "Validating archive..."
if ! gunzip -c "$ARCHIVE" | tar t > /dev/null; then
    echo "ERROR: invalid archive"
    exit 1
fi

echo "Extracting..."
tar -xf "$ARCHIVE" -C "$WORKDIR"

echo "Files extracted to $WORKDIR"

#bei der Übertragung wird das ausführbare Dateienattribut gelöscht, deswegen:
#chmod +x bashScript/*.sh
#chmod +x gramocli
#chmod +x songrec 
#lösche u.U. alte Daten
#rm -f views/*OLD*; rm -f views/*copy*; 
#rm -f views/*HTTP*; rm -f views/*.txt; rm -f views/*.log


#
# APPLY STARTEN
#
if [ ! -f "$WORKDIR/bashScript/sw_apply_update.sh" ]; then
    echo "ERROR: sw_apply_update.sh not found"
    find "$WORKDIR" | head -50
    exit 1
fi

echo "Starting apply phase..."
bash "$WORKDIR/bashScript/sw_apply_update.sh"
echo "installed" > /home/pi/ArchaicNodeEJS/help/update_status
