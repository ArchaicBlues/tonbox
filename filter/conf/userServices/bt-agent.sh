#!/bin/bash
# Headless Bluetooth agent (NoInputNoOutput)

# Ensure XDG_RUNTIME_DIR is set (required for dbus)
export XDG_RUNTIME_DIR=/run/user/1000

# Start bluetoothctl agent interactively (persistent)
exec /usr/bin/bt-agent -c NoInputNoOutput
