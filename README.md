# Tonbox

Tonbox is a Node.js/Express web application that turns a Raspberry Pi into a
networked audio/media center: Its is a comprehensive media handler. 
It processes audio, video, and images. 
Suitable for
• Targeted music search radio, video
• Analog music data restoration
• Modernization of older tube radios or receivers
• Media show consisting of pictures and videos on TV all
Controlled from a browser on your local network.

This is the free **Basis** build: a small number of hardware/format-heavy
features (USB media library, vinyl / video capture, ..)
are present in the UI but intentionally disabled as no-ops, marked with
`BASIS build` comments in the source.

## Prerequisites

- Raspberry Pi (tested on Raspberry Pi OS / Debian 12 "bookworm", `aarch64`)
- Node.js (tested with v21; install via [nvm](https://github.com/nvm-sh/nvm) is recommended)
- System packages used by various features:
  ```
  sudo apt install ffmpeg mpv alsa-utils bluez cd-discid imagemagick pipewire wireplumber
  ```

## Installation

```bash
git clone https://github.com/<your-user>/tonbox.git
cd tonbox
npm install
node server.js
```

Then open `http://tonbox.local:8000` in a browser

On first start there is no `.settings.conf` yet — the app runs with built-in
defaults. Configure WiFi, audio output, a YouTube Data API key (optional, for
YouTube playback) and a Discogs user token (optional, for vinyl metadata
lookups) from the web UI; this writes `.settings.conf` in the project
directory, which is git-ignored and never shared.

## Running as a systemd service (autostart on boot)

A ready-made unit file is provided at
[filter/conf/userServices/Tonbox.service](filter/conf/userServices/Tonbox.service).
It assumes the default `pi` user and an install path of
`/home/pi/tonbox` — adjust `WorkingDirectory` and the `node` binary path in
`ExecStart` if yours differ, then:

```bash
mkdir -p ~/.config/systemd/user
cp filter/conf/userServices/Tonbox.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now Tonbox.service
```


## License

MIT — see [LICENSE](LICENSE).
