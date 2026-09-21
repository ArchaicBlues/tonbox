//PARTIAL DUMMY MODULE: this file mixes generic audio-output/system plumbing
//used by the kept Radio/System features with the Vinyl/Tape/Video/CD capture
//pipeline, which is reduced to no-ops as part of the BASIS build. Kept real:
//killVideoCapture, killplayAux, setLineOutMute, stopMusicPlay, streamVideo,
//startPowerUpAudio, setAudioEnvironment, createEqSliderJson (these are
//load-bearing for Radio/System or run unconditionally at server boot).
//Everything else (Vinyl/Tape/Video capture, CD-via-AUX conversion, MP3
//conversion, loudness/silence analysis) stays reachable but performs no
//real action anymore.

require('./funcAudioDiscogs')();
require('./funcEqualizer')();
const os = require('os');
const path = require('path');
const constants = require('./defines.js');

const { exec } = require('child_process');
const fsPromises = require('fs/promises');
const fs = require('fs');

global.progressInfo = "";
global.convert_ac3_active = false

global.recAD = { recordingsStop: constants.AD_RECORDING_STOPPED, evaluatedState: "", side: "", type: "", medium: "" }
global.mp3Select = { in: "", out: "" }
global.playAUX = false

global.recVideo = { recording: false, title: "" }
global.videoRecording = null;
global.videoView = null
global.videoAudio = null
global.videoStreamClients = new Set()

module.exports = function (required) {
  this.killVideoCapture = function () {
    if (videoView) {
      const old = videoView;
      videoView = null;
      old.kill("SIGINT");
    }
    if (videoAudio) {
      const old = videoAudio;
      videoAudio = null;
      old.kill("SIGINT");
    }
    if (videoRecording) {
      videoRecording.stdin.write("q");
      const old = videoRecording;
      videoRecording = null;
      old.kill("SIGINT");
    }
  },
  this.killplayAux = async function () {
    exec("pkill pw-loopback", (err, stdout, stderr) => { })
    playAUX = false
    await setLineOutMute(false)
  },
  this.setLineOutMute = async function (mute) {
    try {
      let sinks = await execCmd("pactl list short sinks");
      for (let line of sinks.split("\n")) {
        if (line.includes("alsa_output")) {
          let sink = line.split(/\s+/)[1];
          await execCmd("pactl set-sink-mute " + sink + " " + (mute ? "1" : "0"))
          console.log("setLineOutMute(" + mute + ") -> " + sink)
        }
      }
    } catch (err) {
      console.log("setLineOutMute:" + err)
    }
  },
  this.playAudioCapture = async function (res) {
    procStatus.text = "Play USB feature disabled in this BASIS build"
    if (res) {
      res.render('pages/playAudioCapture', {
        pageInfo: pageInfo,
        btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
        pState: procStatus, rec: getRadioRec(),
        settings: settings,
        vol: volumeAudioOut,
      });
    }
  },
  this.sendCaptureStatus = async function (res) {
    if (res) res.render('pages/audioCapture', { pageInfo: pageInfo, settings: settings, silenceFacor: silenceFactor, recSide: recSide, page: "normal", storage: storage, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: "", audioInfo: progressInfo, discogs: discogsResult, pside: recAD.side, userSave: adjustRenameState.userCheck, getPara: false, vol: settings.jackVolume, settings: settings })
  },
  this.startConversion = function () {
    //no-op
  },
  this.getAudioCaptureSize = function () {
    return ""
  },
  this.getAllSize = async function () {
    //no-op
  },
  this.stopAudioRecording = function () {
    //no-op
  },
  this.stopADconversion = async function () {
    SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
    procStatus.stat &= ~constants.PROC_STAT_DIGI_ON;
  },
  this.startWavAnalyzer = function () {
    //no-op
  },
  this.audioCapture = async function (res) {
    procStatus.text = "Vinyl capture feature disabled in this BASIS build"
    if (res) {
      res.render('pages/audioCapture', {
        pageInfo: pageInfo, settings: settings, silenceFacor: silenceFactor, recSide: recSide, page: "normal", storage: storage, btDevice: bluez,
        recording: getScheduledJobsWithoutTimeout(),
        pState: procStatus, audioInfo: "none",
        discogs: discogsResult, recAD: recAD, userSave: adjustRenameState.userCheck,
        getPara: true, vol: volumeAudioOut, settings: settings
      })
    }
  },
  this.audioMP3Capture = function () {
    //no-op
  },
  this.setAudioCaptureInfo = async function (txt) {
    progressInfo = String(txt || "")
  },
  this.resetAD = function () {
    //no-op
  },
  this.wav2mp3 = function (res) {
    if (res) res.render('pages/showADrecords', { pageInfo: pageInfo, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: [], dir: 0, baseimages: [], settings: settings, indexStart: 0, vol: volumeAudioOut })
  },
  this.checkVolume = function (dat) {
    //no-op
  },
  this.adjustTrackVolume = async function (filename) {
    //no-op
  },
  this.renameVinylTrack = async function (increment) {
    //no-op
  },
  this.renameCDtracks = async function (increment) {
    //no-op
  },
  this.adjustVolume = function (filename) {
    //no-op
  },
  this.getffmpeg = function (dat, find) {
    return ""
  },
  this.audioGetProcessWavState = function () {
    //no-op
  },
  this.doRecording = async function (res, plattentyp, page) {
    procStatus.text = "Recording feature disabled in this BASIS build"
    if (page === "captureAux") {
      if (res) return checkCDdrive(res);
      return
    }
    if (page === "audioCaptureTape") {
      if (res) return doTape(res, false)
      return
    }
    if (res) return audioCapture(res)
  },
  this.checkVinylRecExist = async function () {
    return false
  },
  this.getRecordTime = async function (res) {
    if (res) res.render('pages/audioCapture', { pageInfo: pageInfo, settings: settings, silenceFacor: silenceFactor, recSide: recSide, page: "normal", storage: storage, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, audioInfo: progressInfo, discogs: discogsResult, recAD: recAD, userSave: adjustRenameState.userCheck, getPara: false, vol: settings.jackVolume, settings: settings })
  },
  this.songRecognition = async function (res, result) {
    if (res) return doTape(res, false)
  },
  this.resetMP3select = function () {
    mp3Select.in = ""
    mp3Select.out = ""
  },
  this.getLameInfo = async function (res) {
    return "."
  },
  this.analyzeAllwav = async function (res, discSide) {
    procStatus.text = "Vinyl capture feature disabled in this BASIS build"
    if (res) {
      res.render('pages/audioCapture', {
        pageInfo: pageInfo, settings: settings, silenceFacor: silenceFactor,
        recSide: recSide, page: "normal",
        storage: storage,
        btDevice: bluez,
        recording: getScheduledJobsWithoutTimeout(),
        pState: procStatus,
        audioInfo: "none",
        discogs: discogsResult,
        recAD: recAD,
        userSave: adjustRenameState.userCheck,
        getPara: false,
        vol: settings.jackVolume,
        settings: settings
      })
    }
    return false
  },
  this.getAudioCaptureInfo = function () {
    return progressInfo
  },
  this.checkAllWav = async function (res) {
    if (res) {
      res.render('pages/audioCapture', {
        pageInfo: pageInfo, settings: settings, silenceFacor: silenceFactor, recSide: recSide, page: "normal", storage: storage, btDevice: bluez,
        recording: getScheduledJobsWithoutTimeout(),
        pState: procStatus, audioInfo: "none",
        discogs: discogsResult, recAD: recAD, userSave: adjustRenameState.userCheck,
        getPara: true, vol: volumeAudioOut, settings: settings
      })
    }
  },
  this.checkAudioAC3 = function (p) {
    //no-op
  },
  this.convertAC3 = async function (uri) {
    //no-op: video conversion disabled in this BASIS build
  },
  this.convertMP4A = async function (uri) {
    //no-op
  },
  this.createEqSliderJson = async function () {
    await execCmd("rm -f eqSlider.json")
    const slData = {
      "f40Hz": [0, 0, 0, 0, 0],
      "f121Hz": [0, 0, 0, 0, 0],
      "f547Hz": [0, 0, 0, 0, 0],
      "f674Hz": [0, 0, 0, 0, 0],
      "f818Hz": [0, 0, 0, 0, 0],
      "f1503Hz": [0, 0, 0, 0, 0],
      "f1605Hz": [0, 0, 0, 0, 0],
      "f1722Hz": [0, 0, 0, 0, 0],
      "f4160Hz": [0, 0, 0, 0, 0],
      "f12000Hz": [0, 0, 0, 0, 0],
    };
    let x = ""
    for (a = 0; a < 5; a++) {
      switch (a) {
        case 0:
          x = await execCmd("cat filter/Clear.txt  >&1"); break;
        case 1:
          x = await execCmd("cat filter/Neutral.txt  >&1"); break;
        case 2:
          x = await execCmd("cat filter/Warm.txt  >&1"); break;
        case 3:
          x = await execCmd("cat filter/Bass.txt  >&1"); break;
        case 4:
          x = await execCmd("cat filter/MyEQ.txt  >&1"); break;
        default: break;
      }
      if (x) {
        x = x.split("Gain")
        for (i in x) {
          if (i > 0) {
            let n = x[i].split("dB")
            n = parseFloat(n)
            let sl = await gainToSliderVal(n)
            switch (i) {
              case '1': slData["f40Hz"][a] = sl; break;
              case '2': slData["f121Hz"][a] = sl; break;
              case '3': slData["f547Hz"][a] = sl; break;
              case '4': slData["f674Hz"][a] = sl; break;
              case '5': slData["f818Hz"][a] = sl; break;
              case '6': slData["f1503Hz"][a] = sl; break;
              case '7': slData["f1605Hz"][a] = sl; break;
              case '8': slData["f1722Hz"][a] = sl; break;
              case '9': slData["f4160Hz"][a] = sl; break;
              case '10': slData["f12000Hz"][a] = sl; break;
            }
          }
        }
      }
    }
    slData.preset = Number(settings.filterIndex);

    const jsonString = JSON.stringify(slData, null, 2);
    await fsPromises.writeFile('filter/eqSlider.json', jsonString)
    console.log("createEqSliderJson")
  },
  this.setAudioEnvironment = async function () {
    try {
      //turn video off
      await execCmd("sudo chmod 000 /dev/video*")
      let data = await fsPromises.readFile('.settings.conf', 'utf8');
      if (data.length > 10) {
        let s = JSON.parse(data)
        if ("warning" in s) {
          delete s.warning;
          s.reverb = "off"
        }

        if (s.gateway !== undefined) settings.gateway = s.gateway
        if (s.ip !== undefined) settings.ip = s.ip
        if (s.installDir !== undefined) settings.installDir = s.installDir
        if (s.mediaOut !== undefined) settings.mediaOut = s.mediaOut
        if (s.sysAudioOut !== undefined) settings.sysAudioOut = s.sysAudioOut
        if (s.jackVolume !== undefined) settings.jackVolume = volumeAudioOut = s.jackVolume
        if (s.ssid !== undefined) settings.ssid = s.ssid
        if (s.pass !== undefined) settings.pass = s.pass
        if (s.powerUpSoundIndex !== undefined) settings.powerUpSoundIndex = s.powerUpSoundIndex
        if (s.powerUpSoundURL !== undefined) settings.powerUpSoundURL = s.powerUpSoundURL
        settings.reverb = (s.reverb !== undefined ? s.reverb : settings.reverb)
        if (s.youtubeKey !== undefined) settings.youtubeKey = s.youtubeKey
        if (s.discogsUserToken !== undefined) settings.discogsUserToken = s.discogsUserToken
        if (s.admin !== undefined) settings.admin = s.admin
        else {
          settings.admin = "0"
        }
        if (s.filterIndex !== undefined) settings.filterIndex = s.filterIndex
        data = JSON.stringify(settings)
        await fsPromises.writeFile('.settings.conf', data)
      }


      await createEqSliderJson()
      data = 'pcm.!default\n {\n type asym playback.pcm\n {\n type plug\n slave.pcm "output"\n }\n capture.pcm\n {\n type plug\n slave.pcm "input"\n }\n }\n pcm.output\n {\n type hw\n card 0\n }\n ctl.!default\n {\n type hw\n card 0 \n }\n'
      let filePath = path.join(os.homedir(), '.asoundrc');
      await fs.writeFileSync(filePath, data);

      //get hw devices / DAC has prio / needs ~/.asoundrc
      var inf = await execCmd("aplay -l | grep card >&1")

      console.log(inf)
      if (inf.match("card 1:")) {
        data = 'pcm.!default\n {\n type asym playback.pcm\n {\n type plug\n slave.pcm "output"\n }\n capture.pcm\n {\n type plug\n slave.pcm "input"\n }\n }\n pcm.output\n {\n type hw\n card 1\n }\n ctl.!default\n {\n type hw\n card 1 \n }\n'
        let filePath = path.join(os.homedir(), '.asoundrc');
        await fs.writeFileSync(filePath, data);

        inf = await execCmd("pw-cli ls Node | grep alsa_output | sort | uniq >&1")
        inf = inf.split("\n")
        let full = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox.txt >&1")
        let nodeT = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox.txt | grep node.target >&1")
        let nodeName = inf[0]
        if (!nodeName.includes("soc"))
          nodeName = inf[1]
        full = full.replace(nodeT, nodeName + "\n")
        filePath = path.join(os.homedir(), '/.config/pipewire/pipewire.conf.d/tonbox.txt');
        await fs.writeFileSync(filePath, full);
        full = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox_All.txt >&1")
        nodeT = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox_All.txt | grep node.target >&1")
        full = full.replace(nodeT, nodeName + "\n")
        filePath = path.join(os.homedir(), '/.config/pipewire/pipewire.conf.d/tonbox_All.txt');
        await fs.writeFileSync(filePath, full);
      } else {
        await execCmd("rm ~/.asoundrc")
        inf = await execCmd("pw-cli ls Node | grep alsa_output | sort | uniq >&1")
        inf = inf.split("\n")
        let full = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox.txt >&1")
        let nodeT = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox.txt | grep node.target >&1")
        let nodeName = inf[0]
        if (nodeName.includes("soc"))
          nodeName = inf[1]
        full = full.replace(nodeT, nodeName + "\n")
        filePath = path.join(os.homedir(), '/.config/pipewire/pipewire.conf.d/tonbox.txt');
        await fs.writeFileSync(filePath, full);
        full = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox_All.txt >&1")
        nodeT = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox_All.txt | grep node.target >&1")
        full = full.replace(nodeT, nodeName + "\n")
        filePath = path.join(os.homedir(), '/.config/pipewire/pipewire.conf.d/tonbox_All.txt');
        await fs.writeFileSync(filePath, full);
      }

      settings.reverb = "off"
      await execCmd("bashScript/./conv.sh off")

      await execCmd("systemctl --user restart pipewire wireplumber")
      let r = await execCmd("systemctl --user status pipewire | grep 'active (running)'")
      if (r) console.log("pipewire is running")
      else {
        procStatus.text = "pipewire failed! Check tonboxFilter.conf"
        console.log(procStatus.text)
      }
      await pipewireAudioInit()
      await submitFilter('MyEQ')
    }
    catch (err) {
      procStatus.text = "setAudioEnvironment: " + err
      console.log(procStatus.text)
    }
  },
  this.monitorLevel = function (res, page, action) {
    if (action === "start") {
      SSEIntervalTyp = constants.SSE_INACTIVE
    }
    if (page && page.match("audioCaptureTape")) {
      if (res) doTape(res, false)
    } else {
      if (res) res.render('pages/audioCapture', {
        pageInfo: pageInfo, settings: settings, silenceFacor: silenceFactor, recSide: recSide, page: "normal", storage: storage, btDevice: bluez,
        recording: getScheduledJobsWithoutTimeout(),
        pState: procStatus, audioInfo: progressInfo,
        discogs: discogsResult, recAD: recAD, userSave: adjustRenameState.userCheck,
        getPara: true, vol: volumeAudioOut, settings: settings
      })
    }
  },
  this.getMonitorLevel = function () {
    return "0"
  },
  this.stopMonitorLevel = function (res, page) {
    SSEIntervalTyp = constants.SSE_INACTIVE
    if (page && page.match("audioCaptureTape")) {
      if (res) doTape(res, false)
    } else {
      if (res) res.render('pages/audioCapture', {
        pageInfo: pageInfo, settings: settings, silenceFacor: silenceFactor, recSide: recSide, page: "normal", storage: storage, btDevice: bluez,
        recording: getScheduledJobsWithoutTimeout(),
        pState: procStatus, audioInfo: progressInfo,
        discogs: discogsResult, recAD: recAD, userSave: adjustRenameState.userCheck,
        getPara: true, vol: volumeAudioOut, settings: settings
      })
    }
  },
  this.stopML = function () {
    SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
  },
  this.stopMusicPlay = async function (proc) {
    await killMplayer()
    stopMetadata()
    procStatus.marquee = "";

    clearTrackInterval()
    radioPlayIndex = -1

    exec("pgrep mpv", (err, stdout, stderr) => {
      if (!err) {
        exec("sudo killall mpv", (err, stdout, stderr) => { })
      }
    })
    exec("pgrep chromium", (err, stdout, stderr) => {
      if (!err) {
        exec("sudo killall chromium", (err, stdout, stderr) => { })
      }
    })
    trackState = "done"

    exec("pgrep pw-play", (err, stdout, stderr) => {
      if (!err) {
        exec("sudo killall pw-play", (err, stdout, stderr) => { })
      }
    })
  },
  this.deepSplit = async function () {
    return false
  },
  this.getGramoTracks = async function () {
    return false
  },
  this.generateNewTrackBlocks = async function () {
    //no-op
  },
  this.getTstr = function (block) {
    return ""
  },
  this.workOnTracks = async function () {
    //no-op
  },
  this.generateCoverImg = async function (del) {
    //no-op: Vinyl cover thumbnail generation disabled in this BASIS build
  },
  this.convertImproperVideos = async function () {
    //no-op
  },
  this.getVideoConversionData = function () {
    progressInfo = "."
  },
  this.streamVideo = function (path, range, res) {
    const videoPath = path;
    let stat;

    try {
      stat = fs.statSync(videoPath);
    } catch (err) {
      console.log("streamVideo stat error:", err);
      res.writeHead(404);
      res.end();
      return;
    }

    const videoSize = stat.size;

    if (!range) {
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": videoSize,
        "Accept-Ranges": "bytes"
      });

      const videoStream = fs.createReadStream(videoPath);
      videoStream.pipe(res);
      return;
    }

    const CHUNK_SIZE = 10 ** 6;

    const match = range.match(/bytes=(\d+)-(\d*)/);

    if (!match) {
      res.writeHead(416, {
        "Content-Range": `bytes */${videoSize}`
      });
      res.end();
      return;
    }

    const start = Number(match[1]);
    let end;

    if (match[2]) {
      end = Number(match[2]);
    } else {
      end = Math.min(
        start + CHUNK_SIZE - 1,
        videoSize - 1
      );
    }

    if (start >= videoSize || start > end) {
      res.writeHead(416, {
        "Content-Range": `bytes */${videoSize}`
      });
      res.end();
      return;
    }

    end = Math.min(end, videoSize - 1);
    const contentLength = end - start + 1;

    const headers = {
      "Content-Range": `bytes ${start}-${end}/${videoSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": contentLength,
      "Content-Type": "video/mp4"
    };

    res.writeHead(206, headers);

    const videoStream = fs.createReadStream(videoPath, { start: start, end: end });
    videoStream.pipe(res);
  },
  this.doAudioYT = function (ytID) {
    //no-op
  },
  this.doTape = async function (res, sse) {
    if (res) res.render('pages/audioCaptureTape', { pageInfo: pageInfo, audioInfo: " ", btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus })
  },
  this.doVideo = async function (res, rec, videoTitle) {
    if (res) res.render('pages/captureVideo', { pageInfo: pageInfo, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus })
  },
  this.startVideoRecording = function (recordFile) {
    //no-op
  },
  this.songRecognitionProcess = async function () {
    //no-op
  },
  this.calcRecEnd = async function (time) {
    return ""
  },
  this.audioTapeExist = async function (inf) {
    return false
  },
  this.audioTapeAnalyze = async function (res) {
    if (res) return doTape(res, false)
  },
  this.audioTapeRecord = async function (res) {
    if (res) return doTape(res, false)
  },
  this.Mp4Mp3 = async function (title, res) {
    rememberDB = "Video"
    trackIndex = -1
    procStatus.text = "MP3 conversion disabled in this BASIS build"
    if (res) showMusicDir("Video", res)
  },
  this.Mp4Delete = async function (track, res) {
    procStatus.text = "Delete disabled in this BASIS build"
    if (res) showMusicDir("Video", res)
  },
  this.checkGramoTracks = async function () {
    return false
  },
  this.checkContinuesSilence = async function (th) {
    //no-op
  },
  this.startLautheit = function () {
    //no-op
  },
  this.stopLautheit = function (msg) {
    //no-op
  },
  this.watchLautheit = function () {
    //no-op
  },
  this.checkSpikes = async function () {
    return 0
  },
  this.cutSilenceEnd = async function (f) {
    //no-op
  },
  this.startPowerUpAudio = async function () {
    if (settings.mediaOut === "HTTP live streaming")
      return
    await stopMusicPlay()

    if (settings.powerUpSoundURL) {
      console.log("startPowerUpAudio: " + settings.powerUpSoundURL)
      procStatus.marquee = ""
      submitFilter('My-Eq')

      exec(settings.powerUpSoundURL, (error, stdout, stderr) => {
        procStatus.marquee = ""
      })

      let match = settings.powerUpSoundURL.match(/https?:\/\/\S+/);
      let url = match ? match[0] : null;
      if (url) {
        url = url.trim().replace(/['"]+$/, '');
        console.log(url);
        if (!intervalRadio)
          intervalRadio = setInterval(getMetadata, constants.META_DATA_INTERVAL)
      }
    }
  }
}
