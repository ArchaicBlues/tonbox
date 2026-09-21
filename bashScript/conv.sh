#!/bin/bash
# eq10 immer aktiv
# conv_on/off
CONV_ON=$1   # "on" oder "off"
TARGET=~/.config/pipewire/pipewire.conf.d

if [ "$CONV_ON" = "on" ]; then
    # Convolver aktiv
    cp "$TARGET/tonbox_All.txt" "$TARGET/tonboxFilter.conf"
elif [ "$CONV_ON" = "off" ]; then
    # ohne Convolver
    cp "$TARGET/tonbox.txt" "$TARGET/tonboxFilter.conf"
else
    echo "Usage: $0 [on|off]"
fi

