#!/bin/bash
set -e

APP="/home/pi/ArchaicNodeEJS"
WORKDIR="/home/pi/update_tmp"

echo "================================="
echo " Tonbox Update - Apply Script"
echo "================================="

echo "Copying update files..."

# Kopiere update_tmp nach Arch..   SAFER: keine node_modules überschreiben
echo "RSYNC START"
rsync -a --delete \
  --exclude "node_modules" \
  --exclude ".git" \
  "$WORKDIR"/ "$APP"/
echo "RSYNC DONE"

echo "Stop Tonbox.service..."
systemctl --user stop Tonbox.service
sleep 2
cd "$APP"
pwd

echo "Preparing Node/NPM environment..."
export NVM_DIR="/home/pi/.nvm"
export PATH="$NVM_DIR/versions/node/v21.6.1/bin:$PATH"
export XDG_RUNTIME_DIR="/run/user/1000"
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/1000/bus"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
fi

echo "Using node: $(command -v node) $(node --version 2>/dev/null || true)"
echo "Using npm: $(command -v npm) $(npm --version 2>/dev/null || true)"

echo "Installing dependencies..."
if [ -f package-lock.json ]; then
    echo "start npm ci.."
    rm -rf node_modules
    npm ci --unsafe-perm || {
        echo "npm ci failed, falling back to npm install"
        npm install --unsafe-perm
    }
    #npm rebuild
    else
    echo "start npm install.."
    npm install
fi

echo "Program / Lib installation..."

# youtube download immer neu initialisieren, da youtube öfters Änderungen vornimmt
sudo wget -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

if node -e "require.resolve('icy')" 2>/dev/null; then
    echo "icy ist installiert"
else
    echo "install icy"
    npm install icy 
fi

if node -e "require.resolve('socket.io')" 2>/dev/null; then
    echo "socket.io ist installiert"
else
    echo "install socket.io"
    npm install socket.io
fi

echo "Installing system packages..."

# needed for MP4MP3
sudo add-apt-repository -y ppa:jonathonf/ffmpeg-4 || true
sudo apt update
sudo apt install -y libfdk-aac2

# needed for some radio Urls
sudo apt install -y chromium-browser

# needed for cdplayer
sudo apt install -y mplayer

# bluetooth
sudo apt install -y pipewire-audio-client-libraries libspa-0.2-bluetooth bluez bluez-tools 
sudo apt install -y pi-bluetooth bluez bluez-firmware

# I2C für UPV (unterbrechungsfreie Stromversorgung) CW2
sudo apt remove -y i2c-tools || true

sudo chown pi:pi "$APP"/filter/*

# WICHTIG: immer im APP ROOT
cd "$APP"

echo "Initializing services..."
sudo systemctl daemon-reload
systemctl --user enable Tonbox.service
systemctl --user enable pipewire wireplumber  

# pi must have access to audio cdrom etc
sudo usermod -aG audio,cdrom pi

echo "Configuring hostname and mDNS..."
sudo apt install -y avahi-daemon libnss-mdns avahi-utils

#setfacl udev Regel setzen für access auf dev/video0 
sudo apt install -y acl 

sudo hostnamectl set-hostname tonbox
sudo systemctl enable avahi-daemon
sudo systemctl start avahi-daemon

echo "Fixing permissions..."
chown -R pi:pi "$APP" || true

echo "Reloading systemd..."
sudo systemctl daemon-reload

echo "Reloading user systemd daemon..."
systemctl --user daemon-reload || true

echo "Restarting Tonbox service..."
if ! systemctl --user restart Tonbox.service; then
    echo "Restart failed, trying start..."
    systemctl --user start Tonbox.service
fi

echo "Cleanup..."
rm -rf "$WORKDIR"

echo "================================="
echo " UPDATE SUCCESSFUL"
echo "================================="