#!/usr/bin/env node

import { execSync, spawn } from "child_process";
import fetch from "node-fetch";

// === CONFIG ===
const CD_DEVICE = "/dev/sr0";
const USER_AGENT = "RpiCDPlayer/1.0 (yourmail@example.com)";

// === Hilfsfunktionen ===
function getDiscId() {
  try {
    const output = execSync(`cd-discid ${CD_DEVICE}`).toString().trim();
    const discid = output.split(" ")[0];
    return discid;
  } catch (err) {
    console.error("Fehler: CD konnte nicht gelesen werden:", err.message);
    process.exit(1);
  }
}

async function fetchTrackInfo(discid) {
  const url = `https://musicbrainz.org/ws/2/discid/${discid}?fmt=json&inc=artists+recordings`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT }
  });

  if (!res.ok) throw new Error(`MusicBrainz HTTP error ${res.status}`);

  const data = await res.json();

  if (!data.media || !data.media[0].tracks) return null;

  return data.media[0].tracks.map((t, i) => ({
    track: i + 1,
    title: t.title,
    length: t.length // in ms
  }));
}

// === MPlayer-Steuerung ===
class MPlayerController {
  constructor() {
    this.proc = null;
  }

  start(track = 1) {
    if (this.proc) this.stop();

    this.proc = spawn("mplayer", ["-slave", "-quiet", `cdda://${track}`, "-ao", "alsa"]);
    this.proc.stdout.on("data", (data) => {});
    this.proc.stderr.on("data", (data) => {});
    this.proc.on("exit", () => { this.proc = null; });
  }

  stop() {
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
    }
  }

  pause() {
    if (this.proc) this.proc.stdin.write("pause\n");
  }

  seek(seconds) {
    if (this.proc) this.proc.stdin.write(`seek ${seconds} 0\n`);
  }
}

// === MAIN ===
(async () => {
  const discid = getDiscId();
  console.log("DiscID:", discid);

  const tracks = await fetchTrackInfo(discid);
  if (!tracks) {
    console.error("Keine Trackinformationen von MusicBrainz gefunden.");
    process.exit(1);
  }

  console.log(JSON.stringify({ discid, tracks }, null, 2));

  // Beispiel: MPlayer starten
  const player = new MPlayerController();
  console.log("Starte Track 1...");
  player.start(1);

  // Steuerung nach 10 Sekunden (Beispiel)
  setTimeout(() => { console.log("Pause"); player.pause(); }, 10000);
  setTimeout(() => { console.log("Stop"); player.stop(); }, 20000);
})();
