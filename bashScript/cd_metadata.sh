#!/bin/bash
# cd_metadata.sh - liest Audio-CD und gibt JSON mit Trackinfos aus

CD_DEVICE="$1"

# Prüfen ob das Laufwerk existiert
if [ ! -b "$CD_DEVICE" ]; then
    echo "Fehler: Kein CD-Laufwerk gefunden unter $CD_DEVICE"
    exit 1
fi

# Installierte Tools prüfen
for cmd in cd-discid curl jq; do
    if ! command -v $cmd &>/dev/null; then
        echo "Bitte installieren: $cmd"
        exit 1
    fi
done

# 1. Disc-ID berechnen
DISCID=$(cd-discid "$CD_DEVICE" | awk '{print $1}')
TRACKS=$(cd-discid "$CD_DEVICE" | awk '{for(i=2;i<=NF;i++) print $i}')

# 2. Daten von MusicBrainz abfragen
# MusicBrainz URL für DiscID-Abfrage
URL="https://musicbrainz.org/ws/2/discid/$DISCID?fmt=json"

JSON=$(curl -s "$URL")

# Prüfen ob Antwort OK
if [ -z "$JSON" ] || echo "$JSON" | grep -q 'error'; then
    echo "Keine Informationen in MusicBrainz gefunden. Gib Tracks nur als Nummern aus."
    # Fallback JSON
    i=1
    echo -n '{ "tracks": ['
    for t in $TRACKS; do
        echo -n "{\"track\": $i, \"title\": \"Track $i\"}"
        [ $i -lt ${#TRACKS[@]} ] && echo -n ","
        i=$((i+1))
    done
    echo "]}"
    exit 0
fi

# 3. JSON mit Tracknamen erstellen
# MusicBrainz liefert z.B. json -> releases[0].mediums[0].tracks
# Wir nehmen den ersten Release und erste Medium
TRACK_JSON=$(echo "$JSON" | jq '.releases[0].media[0].tracks | map({track: .position, title: .title})')

# Ausgabe final als JSON
echo "{\"discid\": \"$DISCID\", \"tracks\": $TRACK_JSON}"
