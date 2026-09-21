const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require("fs");
const constants = require('./defines.js');

// const { DISCOGS_RESULT_STATE_IN_ADRECORDS } = require('./defines.js');
// const { Console } = require('node:console');
//Equalizer
require('./funcEqualizer.js')();
require('./funcAudioDiscogs.js')();

let mplayer = null;
let trackNr = 1;
global.maxCDtracks = 0;
global.cdInfo = "";
global.currentCDTrack = 1;
global.cdripping = false
global.blkCDdev=""
global.discInfo = {
        type: "Unknown",
        filesystem: null,
        files: {},
        tracks: 0
      };
const audioExts = [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"];
/*
  CD / DVD check per
  udevadm info --query=property --name=/dev/sr0 | grep ID_CDROM_MEDIA
  ID_CDROM_MEDIA=1
  ID_CDROM_MEDIA_AUDIO=1 / oder: ID_CDROM_MEDIA_DVD=1
  etc. Anzahl Tracks wird auch ausgegeben...
*/

const util = require("util");
const execAsync = util.promisify(exec);

//check Dateisystem (Audio-CDs fallen nicht daraunter, Daten-CDs / DVDs ja)
async function runBlkid(dev) {
    try {
        // timeout in milliseconds
        const { stdout } = await execAsync(`sudo blkid ${dev}`, { timeout: 3000 });
        console.log(stdout);
        return stdout;
    } catch (err) {
        if (err.killed) {
            console.error("blkid timed out!");
            return "timeout"
        }
        return null;
    }
}
function getAudioSize(dir) {
    let total = 0;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            total += getAudioSize(fullPath);
        } else {
            const ext = path.extname(file).toLowerCase();
            if (audioExts.includes(ext)) {
                total += stat.size;
            }
        }
    }
    return total;
}
function run(cmd) {
    console.log(cmd)
    return new Promise((resolve) => {
        exec(cmd, (err, stdout) => {
            if (err) {
              console.log(err)
              return resolve("");
            }
            resolve(stdout.trim());
        });
    });
}

function normalizeCdparanoiaStatus(line) {
  const msg = String(line || "").trim();
  if (!msg) return "";

  // Keep useful progress messages, drop low-level SCSI spam.
  if (/^outputting to track\d+\.cdda\.wav$/i.test(msg)) return msg;
  if (/^Ripping erfolgreich beendet\.?$/i.test(msg)) return msg;
  if (/^Checking for MMC style command set/i.test(msg)) return "Checking CD drive...";
  if (/^Verifying CDDA command set/i.test(msg)) return "Verifying Audio CD command set...";
  if (/^Attempting to set cdrom to full speed/i.test(msg)) return "Preparing drive speed...";

  if (/No such device|Transport error|scsi_read error|Sense key:/i.test(msg)) {
    return "CD read error. Please check disc/drive and try again.";
  }

  return "";
}
function listFilesRecursive(dir) {
    let results = [];

    const list = fs.readdirSync(dir);
    list.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat && stat.isDirectory()) {
            results = results.concat(listFilesRecursive(fullPath));
        } else {
            results.push(fullPath);
        }
    });

    return results;
}

function resetCdInfoState() {
  cdInfo = {
    tracks: [],
    images: [],
    discogsTitel: "empty",
    status: ""
  };
  maxCDtracks = 0;
  currentCDTrack = 0;
}

function buildDataDiscTracklist() {
  const discRoot = path.resolve("disc");
  const files = Array.isArray(discInfo && discInfo.files) ? discInfo.files : [];
  const mp3Files = files
    .filter(filePath => path.extname(String(filePath || "")).toLowerCase() === ".mp3")
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));

  return {
    tracks: mp3Files.map((filePath, index) => {
      const relativePath = path.relative(discRoot, filePath);
      const displayName = relativePath || path.basename(filePath);
      return {
        track: index + 1,
        title: displayName,
        path: relativePath || path.basename(filePath)
      };
    }),
    images: [],
    discogsTitel: "Data Disc"
  };
}

// //Mehrfach CD Pack in cdInfo.Tracks[n].titel starten mit: CD1 => "1-...", CD2 => "2-"..etc 
// //Benutzer muß die Reihenfolge der zu rippenden CDs im Pack einhalten
// //D.h. man kann schauen ob eine CD1 mit Titel "1-..." bereits gerippt worden ist in ADrecords 
// //Note: Eine CD hat keine Information des Tracktitels !
// async function rewriteCDinfo(){
//   let anzCD = 0;
//   for (const track of cdInfo.tracks) {
//       if (/^[1-5]-1\s/.test(track.title)) {
//           anzCD++;
//       }
//   }
//   if (anzCD <= 1) return;

//   const libFiles = fs.readdirSync(devADrecords + "/" + discogsResult.info + "/audio/")
//       .filter(f => f.endsWith(".wav"))
//       .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
//   console.log(libFiles);  
//   //check what is in lib  
//   let libsize = []
//   if (libFiles.length > 0){
//     for (i in libFiles){
//       libsize[i] = fs.statSync(devADrecords + "/" + discogsResult.info + "/audio/" + libFiles[i]).size
//     }
//   }
//   const rippFiles = fs.readdirSync("ad/")
//   console.log(rippFiles);  
//   //check what has been ripped  
//   let rippsize = []
//   if (rippFiles.length > 0){
//     for (i in rippFiles){
//       rippsize[i] = fs.statSync("ad/" + rippFiles[i]).size
//     }
//   }
//   console.log(cdInfo.tracks)
//   //cdInfo.tracks darf nur den Inhalt einer CD enthalten
//   //check ab wann sich die wav-Größe ändert, dann ist es die nächste CD
//   for (i in libsize){
//     const size1 = libsize[i];
//     const size2 = rippsize[i + 1];
//     //berücksichtige Lesefehler, die zu kleinen Abweichungen führen können
//     if (Math.abs(size1 - size2) <= 100) {
//         console.log("Dateien sind größenmäßig gleich (±100 Bytes).");
//     } else {
//       console.log("Dateien unterscheiden sich.");
//       //Es ist wichtig das der Benutzer die CD's in aufsteigender Folge rippt, sonst stimmt die Zuordnung nicht mehr
//       if (anzCD > 1 && anzCD <= 2){
//         //lösche alle tracks beginnend mit "1-"
//         cdInfo.tracks = cdInfo.tracks.filter(track => 
//             !track.title.startsWith("1-")
//         );
//       }
//       if (anzCD > 2 && anzCD <= 3){
//         //lösche alle tracks beginnend mit "2-" und 
//         for (j in cdInfo.tracks){
//           if (cdInfo.tracks[j].title.startsWith("2-")) {
//             cdInfo.tracks.shift();
//             j--; // Adjust index after removal
//           }
//         }
//       }
//       if (anzCD > 3 && anzCD <= 4){
//         //lösche alle tracks beginnend mit "3-" und 
//         for (j in cdInfo.tracks){
//           if (cdInfo.tracks[j].title.startsWith("3-")) {
//             cdInfo.tracks.shift();
//             j--; // Adjust index after removal
//           }
//         }
//       }
//       if (anzCD > 4 && anzCD <= 5){
//         //lösche alle tracks beginnend mit "4-" und 
//         for (j in cdInfo.tracks){
//           if (cdInfo.tracks[j].title.startsWith("4-")) {
//             cdInfo.tracks.shift();
//             j--; // Adjust index after removal
//           }
//         }
//       }
//       break; // Exit the loop after finding the first size difference
//     }
//   }
// }




module.exports = function(required){
  this.isUsbAudioCaptureDetected = function () {
    if (usbState.usbaudiocapture === constants.USB_NOK) {
      console.log("isUsbAudioCaptureDetected false")
      return false
    }
    console.log("isUsbAudioCaptureDetected true")
    return true
  },
  this.hasCdDriveDetected = function() {
    if (blkCDdev === undefined || blkCDdev === null) return false;
    let r = !!(blkCDdev && String(blkCDdev).trim());
    console.log("hasCdDriveDetected=true:"+r)
    return r
  },
  this.cdDvd = async function(action, tr, res){
    try {
      if (action != "tracklist"){
        await checkCDdrive("")
        if (!blkCDdev){
          procStatus.text = "No CD device detected"
          return res.json({ success: false, error: "No CD device !" });
        }
      }
      console.log("cdDVD action = " + action)
      procStatus.text = ""
      switch(action){
        case "eject":
            resetCdInfoState()
            discInfo = {
                type: "Unknown",
                filesystem: null,
                files: {},
                tracks: 0
            };
            trackNr = 0;
            await killMplayer()
            await execCmd("sudo umount disc")
            await execCmd("eject /dev/"+blkCDdev)
            return res.json({ success: true });
        break;

        case "tracklist":
          if (discInfo && discInfo.type === "Data Disc") {
            cdInfo = buildDataDiscTracklist();
            maxCDtracks = cdInfo.tracks.length;
            return res.json(JSON.stringify(cdInfo));
          }
          await searchDiscogs(res)       
        return
 
        case "playTrack":
            trackNr = parseInt(tr, 10) || 1;
            if (discInfo && discInfo.type === "Data Disc") {
              const trackEntry = Array.isArray(cdInfo && cdInfo.tracks) ? cdInfo.tracks[trackNr - 1] : null;
              if (!trackEntry) {
                return res.json({ success: false, error: "Track not found", currentTrack: currentCDTrack });
              }
              return mplayerPlay(trackNr, blkCDdev, res, trackEntry.path || trackEntry.title);
            }
            // fall through to play
        case "play":
          if (trackNr == 0) trackNr = 1;
         //anlaufen der CD abwarten
          if (discInfo && discInfo.type === "Data Disc") {
            const trackEntry = Array.isArray(cdInfo && cdInfo.tracks) ? cdInfo.tracks[trackNr - 1] : null;
            if (!trackEntry) {
              return res.json({ success: false, error: "Track not found", currentTrack: currentCDTrack });
            }
            return mplayerPlay(trackNr, blkCDdev, res, trackEntry.path || trackEntry.title);
          }
          setTimeout(startCDPlay, 1000, trackNr, blkCDdev, res)
          return
        // case "pause":
        //   if (mplayer)
        //     mplayer.stdin.write("pause\n");
        //   return res.json({ success: true, currentTrack: trackNr });

        case "stop":
          await killMplayer()
          trackNr = 0;
        return res.json({ success: true, currentTrack: trackNr });

        case "prev":
        if (discInfo && discInfo.type === "Data Disc") {
          if (trackNr > 1) {
            trackNr--;
          }
          const prevEntry = Array.isArray(cdInfo && cdInfo.tracks) ? cdInfo.tracks[trackNr - 1] : null;
          if (!prevEntry) {
            return res.json({ success: false, currentTrack: trackNr });
          }
          return mplayerPlay(trackNr, blkCDdev, res, prevEntry.path || prevEntry.title);
        }
        if (trackNr > 1) {
          trackNr--;
          setTimeout(startCDPlay, 1000, trackNr, blkCDdev, res)
          return
        }
        return res.json({ success: false, currentTrack: trackNr  });

        case "next":
        if (discInfo && discInfo.type === "Data Disc") {
          if (trackNr < maxCDtracks) trackNr++;
          else trackNr = 1
          const nextEntry = Array.isArray(cdInfo && cdInfo.tracks) ? cdInfo.tracks[trackNr - 1] : null;
          if (!nextEntry) {
            return res.json({ success: false, currentTrack: trackNr });
          }
          return mplayerPlay(trackNr, blkCDdev, res, nextEntry.path || nextEntry.title);
        }
        if (trackNr < maxCDtracks) trackNr++;
        else trackNr = 1
        setTimeout(startCDPlay, 1000, trackNr, blkCDdev, res)
        return
      }
    } catch (err) {  
      // Check if the error message contains "umount"
      if (err.message && err.message.includes("umount")) {
          await execCmd("eject /dev/" + blkCDdev);
      }else {
        console.error("Error in cdDvd function:", err);
        procStatus.text = "Error handling CD action."
      }
      return res.json({ success: false, error: err.message });
    }
  },
  this.startCDPlay = function (track,blkCDdev,res){
    if (mplayer){
      return res.json({ success: false, currentTrack: trackNr  });
    }
    mplayerPlay(track, blkCDdev, res)
  },
  this.mplayerPlay = async function(track, blkCDdev, res, filePath = "") {
    try {
      await stopMusicPlay(constants.AUDIO_ALL)

      let started = false;
      currentCDTrack = track;
      if (filePath) {
        const resolvedPath = path.resolve("disc", filePath);
        console.log("Play data disc track=" + track + "/" + maxCDtracks + " path=" + resolvedPath)
        mplayer = spawn("mplayer", [
          "-cache", "4096",
          "-cache-min", "20",
          "-nolirc",
          "-ao", "pulse",
          resolvedPath
        ], { stdio: ['ignore', 'pipe', 'pipe']});
      } else {
        console.log("Play CD track="+track+"/"+maxCDtracks)
        const cmd = `mplayer -cache 4096 -cache-min 20 -nolirc -ao pulse -cdda speed=4 cdda://${track}-${maxCDtracks} -cdrom-device /dev/${blkCDdev}`;
        console.log(cmd)
        // Use shell: true - so Node executes the pipe properly
        mplayer = spawn(cmd, { shell: true,stdio: ['ignore', 'pipe', 'pipe']});
      }

      // Detect actual playback start
      mplayer.stdout.on('data', data => {
        //console.log("stdout:"+data.toString())
        let output = data.toString()
        const match = output.match(/Track\s+(\d+)/i);
        if (match) {
          currentCDTrack = parseInt(match[1]);
          const jetzt = new Date();
          const minute = jetzt.getMinutes().toString().padStart(2, '0');
          const sekunde = jetzt.getSeconds().toString().padStart(2, '0');
          console.log(minute+":"+sekunde+"  "+ "MPlayer ist jetzt bei Track:", currentCDTrack);
        }
        if (!started){
          if (output.includes("Starting playback")) {
            started = true;
            console.log(`▶ Track ${track} started`);
          }
        }
      });
      mplayer.stderr.on('data', d => {
        if (d.toString().includes('Starting playback')) {
          console.log('▶ Playback started (stderr)');
        }
      });
      // Detect end of THIS track
      mplayer.on('exit', (code, signal) => {
        console.log("track ended ");
      });

      mplayer.on('close', code => {
        console.log("MPlayer closed:", code);
        mplayer = null;
      });

      mplayer.on('error', err => console.error("MPlayer start error:", err));

      res.json({ success: true, currentTrack: track  });
    } catch (err) {
      console.error("Error in mplayerPlay:", err);
      res.json({ success: false, error: "Error starting CD playback." });
      //return false;
    }
  },
  this.killMplayer = async function() {
    try{
      if (mplayer) {
        mplayer.kill('SIGKILL');
        mplayer = null;
        let state = await execCmd("pgrep mplayer >&1");
        if (state) {
          console.log ("kill mplayer")
          await execCmd("sudo killall mplayer");
        }
      }
      // state = await execCmd("pgrep cdparanoia >&1")
      // if (state) {
      //   console.log ("kill cdparanoia")
      //   await execCmd("sudo killall cdparanoia")
      // }
    }catch{
      //
    }
  },
  this.checkCDdrive = async function(res){
    try{
      //check if device is present
      blkCDdev = await execCmd("lsblk | grep sr || true")
      blkCDdev = blkCDdev.trim().split(" ")[0];
      await checkUsbAudioCapture()
      if (!blkCDdev){
        procStatus.text = "No CD device detected"
        resetCdInfoState()
        discInfo = {
                type: "Unknown",
                filesystem: null,
                files: {},
                tracks: 0
              };      
      }else{
        discInfo = await detectDisc("/dev/"+blkCDdev)
        if (cdInfo.discogsTitel === "empty" && discogsResult.info){
          cdInfo.discogsTitel = discogsResult.info
        }
        if (discInfo && discInfo.type === "Data Disc") {
          cdInfo = buildDataDiscTracklist();
          maxCDtracks = cdInfo.tracks.length;
        }
      }
      if(res){
        if (!hasCdDriveDetected() && isUsbAudioCaptureDetected()){
          //let me hear what USB-Audio-capture sounds like
          playAudioCapture("")
        }
        res.render('pages/cddvd', {pageInfo:pageInfo,recAD:recAD,
            btDevice: bluez, 
            pState: procStatus, recording: getScheduledJobsWithoutTimeout(),
            settings:settings,
            vol: volumeAudioOut,
            tracks: cdInfo,
            currentTrack: 0,
          discInfo:discInfo,
          hasCdDrive: hasCdDriveDetected(),
          usbAudioCaptureDetected: isUsbAudioCaptureDetected()
        });
      }
    }catch(err){
      console.log(err)
    }
  },
  this.checkCDRipping = async function(){
    let result = await execCmd("pgrep cdparanoia >&1")
    return result
  },
  this.captureCD = async function(res){
    try {
      //check CD available
      let cdDeviceRaw = await execCmd("lsblk | grep sr || true")
      if (!cdDeviceRaw){
        procStatus.text = "No CD device detected"
        res.render('pages/cddvd', {pageInfo:pageInfo,recAD:recAD,
            btDevice: bluez, 
            pState: procStatus, recording: getScheduledJobsWithoutTimeout(),
            settings:settings,
            vol: volumeAudioOut,
            tracks: cdInfo,
            currentTrack: 0,
          discInfo:discInfo,
          hasCdDrive: hasCdDriveDetected(),
          usbAudioCaptureDetected: isUsbAudioCaptureDetected()
        });
        return   
      }
      //check storage space
      if (!availableSpace("ADrecords", 1073741824)) {//1GB 
          procStatus.text = "not enough data storage found"
          pageInfo="cd";
          rememberDB = "cd"
          res.render('pages/cddvd', {pageInfo:pageInfo,recAD:recAD,
              btDevice: bluez, 
              pState: procStatus, recording: getScheduledJobsWithoutTimeout(),
              settings:settings,
              vol: volumeAudioOut,
              tracks: cdInfo,
              currentTrack: 0,
              discInfo:discInfo,
              hasCdDrive: hasCdDriveDetected(),
              usbAudioCaptureDetected: isUsbAudioCaptureDetected()
          });
          return
      }

      blkCDdev = cdDeviceRaw.trim().split(" ")[0];
      maxCDtracks = await execCmd("udevadm info --query=property --name=/dev/"+blkCDdev+" | grep ID_CDROM_MEDIA_TRACK_COUNT")
      maxCDtracks = maxCDtracks.trim().split("=")[1];
      if (maxCDtracks === undefined) {
        procStatus.text = "No disc"
        res.render('pages/cddvd', {pageInfo:pageInfo,recAD:recAD,
            btDevice: bluez, 
            pState: procStatus, recording: getScheduledJobsWithoutTimeout(),
            settings:settings,
            vol: volumeAudioOut,
            tracks: cdInfo,
            currentTrack: 0,
          discInfo:discInfo,
          hasCdDrive: hasCdDriveDetected(),
          usbAudioCaptureDetected: isUsbAudioCaptureDetected()
        });
        return
      }

      sseData = " "
      SSEIntervalTyp = constants.SSE_CD_RIPPING
      procStatus.text = "Disc ripping started in the background. Wait... 10 min !"
      res.render('pages/cddvd', {pageInfo:pageInfo,recAD:recAD,
          btDevice: bluez, 
          pState: procStatus, recording: getScheduledJobsWithoutTimeout(),
          settings:settings,
          vol: volumeAudioOut,
          tracks: cdInfo,
          currentTrack: 0,
          discInfo:discInfo,
          hasCdDrive: hasCdDriveDetected(),
          usbAudioCaptureDetected: isUsbAudioCaptureDetected()
      });

      cdripping = true
      recAD.type = "CD"
      recAD.medium = "CD"
      await startRipping()
      //await rewriteCDinfo()
      if (!await saveADrecords("cd")){
        console.log("save CD records failed!")
        cdripping = false
      }
      await generateCoverImg("")
      initiateRecEnd("done!")
    } catch (err) {
      console.log("captureCD: " + err)
      cdripping = false
      procStatus.text = "captureCD failed: " + (err && err.message ? err.message : String(err))
      if (res && !res.headersSent) {
        res.render('pages/cddvd', {pageInfo:pageInfo,recAD:recAD,
            btDevice: bluez,
            pState: procStatus, recording: getScheduledJobsWithoutTimeout(),
            settings:settings,
            vol: volumeAudioOut,
            tracks: cdInfo,
            currentTrack: 0,
          discInfo:discInfo,
          hasCdDrive: hasCdDriveDetected(),
          usbAudioCaptureDetected: isUsbAudioCaptureDetected()
        });
      }
      initiateRecEnd(" " + (err && err.message ? err.message : String(err)))
    }
  },
  this.checkCDRecExist = async function(cdNum){
    const albumDir = devADrecords + "/" + discogsResult.info
    const audioDir = albumDir + "/audio/"
    const normalizedCdNum = String(cdNum || "").trim()

    if (!normalizedCdNum || normalizedCdNum === "all") {
      if (fs.existsSync(albumDir)) {
        procStatus.text = discogsResult.info + " already present in Vinyl"
        return true
      }
      return false
    }

    const requestedPrefix = normalizedCdNum + "-"
    const cmd = "ls " + JSON.stringify(audioDir) + " 2>/dev/null || true"
    let current = await execCmd(cmd)
    current = current.split("\n").filter(Boolean)

    const exists = current.some((trackTitle) => String(trackTitle).startsWith(requestedPrefix))
    if (exists) {
      procStatus.text = discogsResult.info + " already present in Vinyl"
      return true
    }

    return false
  },
  this.startRipping = function(startTrack = 1, retryDepth = 0){
    return new Promise((resolve, reject) => {
        const targetDir = '/home/pi/ArchaicNodeEJS/ad';
        const STALL_MS = 3 * 60 * 1000;
        const CHECK_INTERVAL_MS = 15000;
        const MAX_RESTART_DEPTH = 20;

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const maxTrack = parseInt(maxCDtracks, 10) ||
          (cdInfo && Array.isArray(cdInfo.tracks) ? cdInfo.tracks.length : 0);
        const start = parseInt(startTrack, 10) || 1;
        if (maxTrack > 0 && start > maxTrack) {
          cdInfo.status = "CD ripping finished (no remaining tracks)";
          resolve("Success");
          return;
        }

        const args = ['-B', '-v'];
        if (blkCDdev) {
          args.push('-d', `/dev/${blkCDdev}`);
        }
        if (start > 1 && maxTrack > 0) {
          args.push(`${start}-${maxTrack}`);
        }

        const child = spawn('cdparanoia', args, { cwd: targetDir });
        if (!cdInfo || typeof cdInfo !== 'object') {
          cdInfo = { tracks: [] };
        }

        cdInfo.status = start > 1
          ? "CD ripping resumed at track " + start + "..."
          : "CD ripping started...";
        console.log("CD ripping started with: cdparanoia " + args.join(' '));

        let currentStatus = cdInfo.status;
        let stalledRestart = false;
        let stalledTrack = 0;
        let currentTrackNo = 0;
        let currentTrackFile = "";
        let lastTrackSize = -1;
        let lastProgressTs = Date.now();
        let done = false;

        const finish = (fn, value) => {
          if (done) return;
          done = true;
          if (watchPtr) clearInterval(watchPtr);
          fn(value);
        };

        const updateTrackProgress = (trackNo) => {
          currentTrackNo = trackNo;
          currentTrackFile = path.join(targetDir, "track" + String(trackNo).padStart(2, '0') + ".cdda.wav");
          lastTrackSize = -1;
          lastProgressTs = Date.now();
        };

        const watchPtr = setInterval(() => {
          if (done || !currentTrackFile) return;
          fs.stat(currentTrackFile, (err, stat) => {
            if (done || err || !stat) return;
            const size = Number(stat.size) || 0;
            if (size > lastTrackSize) {
              lastTrackSize = size;
              lastProgressTs = Date.now();
              return;
            }

            if ((Date.now() - lastProgressTs) >= STALL_MS) {
              stalledRestart = true;
              stalledTrack = currentTrackNo;
              cdInfo.status = "Stall at track " + stalledTrack + ", retry from track " + (stalledTrack + 1);
              console.log("CD stall detected for " + currentTrackFile + ", restarting...");
              try { child.kill('SIGKILL'); } catch (e) {}
              exec("sudo killall cdparanoia >/dev/null 2>&1", () => {});
            }
          });
        }, CHECK_INTERVAL_MS);

        child.stderr.on('data', (data) => {
          const chunk = data.toString();
          console.log("cdparanoia output:", chunk);

          const lines = chunk.split(/[\r\n]+/);
          for (const line of lines) {
            const trackMatch = line.match(/outputting to track(\d+)\.cdda\.wav/i);
            if (trackMatch && trackMatch[1]) {
              updateTrackProgress(parseInt(trackMatch[1], 10));
            }

            const normalized = normalizeCdparanoiaStatus(line);
            if (!normalized) continue;
            if (normalized !== currentStatus) {
              currentStatus = normalized;
              cdInfo.status = currentStatus;
            }
          }
        });

        child.on('error', (err) => {
          console.error("Prozess-Fehler:", err);
          cdInfo.status = "CD ripping failed: " + (err.message || String(err));
          procStatus.text = cdInfo.status
          console.log("CD ripping failed: " + (err.message || String(err)));
          finish(reject, err);
        });

        child.on('close', async (code) => {
          if (done) return;

          if (stalledRestart) {
            const nextTrack = (stalledTrack || start) + 1;
            if (maxTrack > 0 && nextTrack <= maxTrack && retryDepth < MAX_RESTART_DEPTH) {
              cdInfo.status = "Retry CD ripping from track " + nextTrack + "...";
              console.log("Retry startRipping(" + nextTrack + ", " + (retryDepth + 1) + ")");
              try {
                await startRipping(nextTrack, retryDepth + 1);
                finish(resolve, "Success");
              } catch (err) {
                // Best effort: skip one more track instead of aborting whole CD run.
                const skipTrack = nextTrack + 1;
                if (maxTrack > 0 && skipTrack <= maxTrack && retryDepth < MAX_RESTART_DEPTH) {
                  cdInfo.status = "Retry failed at track " + nextTrack + ", continue from track " + skipTrack + "...";
                  console.log("Retry fallback startRipping(" + skipTrack + ", " + (retryDepth + 1) + ")");
                  try {
                    await startRipping(skipTrack, retryDepth + 1);
                    finish(resolve, "Success");
                    return;
                  } catch (err2) {
                    console.log("Retry fallback failed: " + err2);
                  }
                }

                cdInfo.status = "CD ripping partial success; stalled near track " + (stalledTrack || start);
                procStatus.text = cdInfo.status;
                finish(resolve, "PartialSuccess");
              }
              return;
            }

            if (maxTrack > 0 && nextTrack > maxTrack) {
              cdInfo.status = "CD ripping finished (last track stalled)";
              finish(resolve, "Success");
              return;
            }

            cdInfo.status = "CD ripping partial success; stalled and no restart range available";
            procStatus.text = cdInfo.status;
            finish(resolve, "PartialSuccess");
            return;
          }

          if (code === 0) {
            console.log("Ripping erfolgreich beendet.");
            cdInfo.status = "ok done";
            finish(resolve, "Success");
          } else {
            console.error(`Ripping abgebrochen mit Code: ${code}`);
            cdInfo.status = "CD ripping failed (code " + code + ")";
            console.log("CD ripping failed (code " + code + ")");
            finish(reject, new Error("Error Code: " + code));
          }
        });
    });
  },
  this.getCDstatus = function(){
    if (recAD.medium === "AUX"){
        cdInfo.status = getAudioCaptureSize()
    }
    if (cdInfo.status)
      return cdInfo.status
    else
      return "."
  },
  this.saveUserInfoCD = async function (res,cdNum, artist, title, tracks, images){
    clearDiscogsResult();
    discogsResult.info = await cleanFilenameNoPromise(" ", artist+"-"+title)
    cdInfo = {
      tracks: [],//{track:1,title: "1-1 Nothing found"}],
      images: [],//'/images/Tonbox.jpg'],
      discogsTitel: discogsResult.info
    }
    for (i in tracks){
      tracks[i] = await cleanFilenameNoPromise(" ", tracks[i])
      cdInfo.tracks[i]={"title":cdNum+"-"+i+" "+tracks[i]}
    }
    if (images[0] != ""){
      for (i in images)
        cdInfo.images[i]=images[i]
        discogsResult.image[i]=images[i]
    }else{
      await generateImage(300,300,discogsResult.info) //placed in  help/image1.jpg
      cdInfo.images[0]="image1.jpg"
      discogsResult.image[0]="image1.jpg"
    }
    captureCD(res)
  },
  this.generateImage = async function(b,h,title){
    await execCmd("rm help/*.jpg")
    let cmd = "convert -size "+b+"x"+h+" xc:black -fill white -gravity center -pointsize 10 -font DejaVu-Sans-Bold -annotate 0 " + title +" help/image1.jpg"
    console.log(cmd)
    await execCmd(cmd)
  },
  this.detectDisc = async function(dev) {
    let result = {
        type: "Unknown",
        filesystem: null,
        files: {},
        tracks: 0
    };
    // Check filesystem
    const blkid = await runBlkid(dev);
    if (blkid){
      if (blkid != "timeout"){
          if (blkid.includes("iso9660"))
              result.filesystem = "ISO9660";
          if (blkid.includes("udf"))
              result.filesystem = "UDF";
          return result;
      }
    }
    // Proboblay Audio-CD
    const audioCheck = await run("cdparanoia -Q -d /dev/sr0 2>&1");
    const trackMatches = audioCheck.match(/^\s*\d+\./gm);
    if (trackMatches) {
        result.type = "Audio CD";
        result.tracks = trackMatches.length;
        result.filesystem = "Audio-CD"
        maxCDtracks = trackMatches.length;
        return result;
    }else{
      cdInfo = ""
      maxCDtracks = 0
      procStatus.text = "no CD track found"
    }

    // Try mounting
    await run("mkdir -p disc");
    await run("sudo mount " + dev + " disc");
    if (fs.existsSync("disc")) {
        const allFiles = [];

        function scan(dir) {
            const entries = fs.readdirSync(dir);
            for (let entry of entries) {
                const full = path.join(dir, entry);
                if (fs.statSync(full).isDirectory()) {
                    scan(full);
                } else {
                    allFiles.push(full);
                }
            }
        }
        scan("disc");
        result.files = listFilesRecursive("disc") 
        const files = fs.readdirSync("disc");

        if (files.length === 0) {
            // Laufwerk leer
            result.type = "Unknown";
        } else if (files.includes("VIDEO_TS") || files.includes("video_ts")) {
            result.type = "Video DVD";
        } else {
            result.type = "Data Disc";
        }
    }else
      procStatus.text = "No disc !"

    return result;
  },
  this.moveCDAudiodata = async function(res){
    sseData = " "
    SSEIntervalTyp = constants.SSE_CD_RIPPING
    res.json({ status: "started" })

    try {
      let list = await execCmd("ls disc >&1")
      if (list){
        list = list.split("\n"); list.pop()
        const size = getAudioSize("disc");
        console.log("Audio size:", size/1024/1024, "MB");
        for (let i = 0; i < list.length; i++) {
            const file = list[i];
            const ext = path.extname(file).toLowerCase();

            if (audioExts.includes(ext)) {
                const src = path.join(__dirname, "disc", file);
                const dest = path.join(devMusic, "Audio", path.basename(file));

                if (fs.existsSync(dest)) {
                    console.log(`Skipping existing file: ${file}`);
                    continue;
                }

                fs.copyFileSync(src, dest);
                console.log(`Copied: ${file}`);
            }
        }
      }
      initiateRecEnd("move to vinyl ... done!")
    } catch(err) {
      console.log("moveCDAudiodata error:", err)
      initiateRecEnd(" move failed: " + err)
    }
  }
}

