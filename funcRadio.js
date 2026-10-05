//Equalizer
require('./funcEqualizer')();
const fsPromises = require('fs/promises');
const fs = require ('fs');;
const path = require('path');

const { exec } = require('child_process');
const { spawn } = require('child_process');

//https://www.npmjs.com/package/radio-browser
const RadioBrowser = require('radio-browser');
const https = require("https");
const http = require("http");

//für Titel Evaluierung (Metadaten / Laufleiste)
const EventEmitter = require("events");
const emitter = new EventEmitter();

const streamCache = new Map();
let radioFfmpegProc = null;
let radioPwPlayProc = null;

global.recSide = ["A","B","C","D","E","F"] //Plattenseite
global.silenceFactor = ["350","100","200","300","400","450","500","550","600"] //Trennung tracks in all.wav
global.searchtxt = "nothing";
global.radioUserSearch ={
  country:'DE, Germany',
  genre:'',
  station:'',
  bitrate: 192
}
global.radioContent = ""
global.volumeAudioOut = "90"

global.radioSearch = {}
global.radioFound = {}

global.stationCount = 0
global.radioPlayIndex = -1
global.intervalRadio = null
let latestRadioSearchToken = 0;

//var possibleTags = "Available genre i.e :<br><br>" + "70s,80s,90s,disco,pop,musica romantica,rock,oldies, live, synth,90er,dance,eurodance,hiphop,rap,electronic,electronica,electropop,hits,house,<br>top40charts,jazz, blues, ska,classic rock,hard rock,heavy metal,metal,pop rock,punk,punk soft rock, classic hits,easy listening,hits,wacken radio bob,pop rock,punk, economy ...";


/****************************** */
/****************************** */
function formatDate(ts) {
    const d = new Date(ts);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0"); // months 0-11
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");

    return `${day}.${month}.${year}_${hours}:${minutes}`;
}

function classifyUrl(url) {
  const u = url.toLowerCase();

  // Browser-required
  if (
    u.includes("rndfnk.com") ||
    u.includes("ard.de") ||
    u.includes("swr.de") ||
    u.includes("dispatcher.")// ||
//    /(token|sid|cid|tvf)=/.test(u)
  ) {
    return "chromium";
  }

  // Direct streams
  if (
    /\.(mp3|aac|ogg|pls|m3u)(\?|$)/.test(u) ||
    /:\d+\//.test(u)
  ) {
    return "mpv";
  }

  // Unknown → try mpv first
  return "try";
}

async function isValidCandidate(url) {
  if (!url || typeof url !== "string") 
    return false;
  if (url.match("live365") || url.match("accuradio") || url.match("tuneIn")) {
    // if (url.match("mp3"))
    //   console.log("found mp3")
    if (url.match("mp3") || url.match("ogg") || url.match("acc"))
      return true; 
    return false; //else API required
  }
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}


// function isLikelyStream(url) {
//   return (
//     // file-based streams
//     /\.(mp3|aac|m4a|ogg|opus|flac|wav|m3u8?|pls|xspf)(\?|$)/i.test(url) ||

//     // known path-based streams
//     /\/(stream|live|radio|listen|audio)(\/|$|\?)/i.test(url) ||

//     // query-based streams
//     /format=mp3|codec=aac|type=stream/i.test(url) ||

//     // 🔥 NEW: Shoutcast/Icecast-style naked endpoints
//     /:\d+\/?;?$/.test(url)
//   );
// }
function isDefinitelyBad(url) {
  if (!url) return true;
  if (typeof url !== "string") return true;
  if (url.startsWith("javascript:")) return true;
  if (url.startsWith("data:")) return true;
  if (url.includes(" ")) return true;
  return false;
}

async function testMPV(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const mpv = spawn("mpv", [
      "--no-video",
      "--ao=null",
      "--idle=no",
      "--ytdl=no",
      // Kein Browser-UA-Spoofing: manche (v.a. aeltere SHOUTcast v1) Server
      // blocken einen Browser-UA und liefern eine HTML-Statusseite statt
      // Audio, was diese Probe faelschlich scheitern liesse. mpvs eigener
      // Standard-UA wird von SHOUTcast/Icecast als normaler Player erkannt.
      "--http-header-fields=Icy-MetaData: 1,Accept: */*",
      "--demuxer-lavf-o=icy=1",
      url
    ]);

    let timer = null;
    let settled = false;
    let sawAudio = false;

    function done(result) {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      try { mpv.kill("SIGKILL"); } catch (_) {}
      resolve(result);
    }

    const inspectOutput = (d) => {
      const s = d.toString();
      if (s.includes("(+) Audio") || s.includes("AO:")) {
        sawAudio = true;
        done(true);
      }
      if (
        s.includes("Failed to open") ||
        s.includes("Errors when loading file") ||
        s.includes("HTTP Error 401") ||
        s.includes("Unauthorized")
      ) {
        done(false);
      }
    };

    mpv.stdout.on("data", inspectOutput);
    mpv.stderr.on("data", inspectOutput);

    mpv.on("exit", (code) => {
      if (sawAudio && (code === 0 || code === null)) {
        done(true);
      } else {
        done(false);
      }
    });

    mpv.on("error", () => {
      console.log("mpv error on url:", url);
      done(false);
    });

    timer = setTimeout(() => {
      timer = null;
      done(false);
    }, timeoutMs);
  });
}


async function testFfmpeg(url, timeoutMs = 6000) {
  return new Promise((resolve) => {
    // Kein Browser-UA-Spoofing, siehe testMPV() weiter oben - selbe Begruendung.
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "info",
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-i", url,
      "-t", "3",
      "-vn",
      "-f", "null",
      "-"
    ]);

    let timer = null;
    let settled = false;

    function done(result) {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      try { ffmpeg.kill("SIGKILL"); } catch (_) {}
      resolve(result);
    }

    const inspectOutput = (d) => {
      const s = d.toString();
      if (/Stream #\d+:\d+.*Audio:/.test(s)) {
        done(true);
      }
      if (
        s.includes("Invalid data found") ||
        s.includes("Server returned 4") ||
        s.includes("Server returned 5") ||
        s.includes("Connection refused")
      ) {
        done(false);
      }
    };

    ffmpeg.stderr.on("data", inspectOutput);

    ffmpeg.on("exit", () => done(false));
    ffmpeg.on("error", () => done(false));

    timer = setTimeout(() => done(false), timeoutMs);
  });
}

async function validateStation(stationsToValidate = radioFound) {
  const source = Array.isArray(stationsToValidate) ? stationsToValidate : [];

  const results = await mapLimit(source, 5, async (station) => {
    if (isDefinitelyBad(station.url)) return null;

    const engine = await probeStream(station.url);
    if (engine === "failed") return null;

    return {
      countryCode: station.countrycode,
      language: station.language,
      name: station.name,
      state: station.state,
      url: station.url,
      engine: engine
    };
  });

  return results.filter(Boolean);
}

async function mapLimit(items, limit, fn) {
  const results = [];
  const executing = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);

    if (limit <= items.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);

      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(results);
}

function getCache(url) {
  return streamCache.get(url);
}

function setCache(url, value) {
  streamCache.set(url, value);
}

async function probeStream(url) {
  const cached = streamCache.get(url);
  if (cached !== undefined) {
    return cached;
  }

  try {
    // MPV ist die primäre Wahrheit
    const mpvOk = await testMPV(url);

    if (mpvOk) {
      streamCache.set(url, "mpv");
      return "mpv";
    }

    console.log("MPV failed, trying ffmpeg:", url);

    // Nur als Fallback: manche Streams kann mpv nicht direkt oeffnen,
    // ffmpeg aber schon (z.B. exotischere Container/Codecs). Headless
    // Chromium wurde hier frueher als letzter Fallback verwendet, gibt auf
    // diesem Geraet aber nachweislich nie echten Ton aus - daher ffmpeg.
    const ffmpegOk = await testFfmpeg(url);

    if (ffmpegOk) {
      streamCache.set(url, "ffmpeg");
      return "ffmpeg";
    }
    streamCache.set(url, "failed");
    return("failed")
  } catch (err) {
    console.error("probeStream error:", url, err);
    streamCache.set(url, "failed");
    return "failed";
  }
}

// async function probeStream(url) {
//   const cached = streamCache.get(url);
//   if (cached !== undefined) return cached;

//   const ok = await testWithMPV(url);

//   streamCache.set(url, ok);
//   return ok;
// }
// async function probeStream(url) {
//   const cached = getCache(url);
//   if (cached !== undefined) return cached;
//   try {
//     const result = await Promise.race([
//       testMPV(url),
//       testChromiumHttp(url)
//     ]);

//     setCache(url, result);
//     return result;

//   } catch (e) {
//     setCache(url, false);
//     return false;
//   }
// }
/************************************** */


module.exports = function(){
  //lokale Variablen in Modulen können nicht in anderen Modulen verändert werden
  //https://stackoverflow.com/questions/23897429/node-import-object-array-from-another-js-file/23897512
  this.getfuncRadioVar = function(d,i){
    switch (d) {
      case "radioName":
        if(i==-1){
          return(" ");
        }
        return(radioFound[i].name)

      case "radioCountry":
        if(i==-1){
          return(" ");
        }
        return(radioFound[i].countryCode)

      case "radioUrl":
        if(i==-1){
          return(" ");
        }
        return(radioFound[i].url)

        case "stationCount":
        return(stationCount);

      default:
        return ""
    }
  },
  this.retrieveRadiodata = async function(res,countryCode,genre,station,bitrate) {
    const searchToken = ++latestRadioSearchToken;
    radioFound = {}
    console.log("search country="+countryCode+" genre="+genre+" station="+station+" bitrate="+bitrate)
    if (countryCode === "all") countryCode = ""
    radioUserSearch.country = countryCode
    radioUserSearch.genre = genre
    radioUserSearch.station = station
    radioUserSearch.bitrate = bitrate
    fs.writeFile('help/radioUserSearch.json', JSON.stringify(radioUserSearch), function (err) {});
    const stations = await RadioBrowser.searchStations({
        countrycode: radioUserSearch.country,
        tag: radioUserSearch.genre,
        name: radioUserSearch.station,
        bitrateMin: radioUserSearch.bitrate,
        bitrateMax: 320,
        limit: 1000,
        order: "clickcount",
        reverse: true
      });

    const allCandidates = stations.map(s => ({
      name: s.name,
      state: s.state,
      url: s.url_resolved,
      language: s.language,
      countrycode: s.countrycode
    }));
    //gleiche Urls löschen, nur eine Base Url
    // Erklärung:
    //   radioFound.map(item => [item.url, item])
    //   Baut ein Array von [url, object] Paaren auf.
    //   new Map(...)
    //   Ein Map kann nur einen Eintrag pro Key haben.
    //   Wenn mehrere Objekte dieselbe url haben, überschreibt das letzte die vorherigen.
    //   Array.from(...values())
    //   Extrahiert die Objekte wieder als Array.
    const uniqueByUrl = Array.from(new Map(allCandidates.map(item => [item.url, item])).values());
    console.log("found " + uniqueByUrl.length + " stations");

    // Stage 1: validate the first page before rendering it.
    const firstStageCandidates = uniqueByUrl.slice(0, 50);
    const firstStage = await validateStation(firstStageCandidates);
    radioFound = firstStage;
    stationCount = uniqueByUrl.length;

    res.render('pages/radioStation', {pageInfo:pageInfo,dat:stationCount, search:radioUserSearch,
      rd:radioFound, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(),
      pState:procStatus, rec:getRadioRec(),settings:settings,vol:volumeAudioOut,play:radioPlayIndex,
      stationOffset:0, hasMoreStations:(firstStageCandidates.length < stationCount), nextOffset:firstStageCandidates.length});

    // Stage 2: full validation in background
    setImmediate(async () => {
      try {
        const validated = await validateStation(uniqueByUrl);
        if (searchToken !== latestRadioSearchToken) {
          console.log("skip outdated background validation result");
          return;
        }

        radioFound = validated;
        stationCount = radioFound.length;
        console.log("found valid Stations " + radioFound.length + " stations");
        procStatus.text = "Radiostation validation complete: " + radioFound.length + " valid stations";

        const data = JSON.stringify(radioFound);
        fs.writeFile('help/radioSearch.json', data, function (err) {});
      } catch (err) {
        console.log("background validateStation error", err);
      }
    });
  },
  this.getScheduledJobsWithoutTimeout = function(){
    //DUMMY: Radio recording ("Add My Radio" / scheduled recordings) disabled
    //in this BASIS build - no jobs are ever scheduled, header REC badge stays off.
    return []
  },
  this.radioPlay = async function(index,res){
    try{      
      radioPlayIndex=index
      res.render('pages/radioStation', {pageInfo:pageInfo,dat:getfuncRadioVar("stationCount"),
        search:getfuncRadioVar("searchtxt",-1), 
        rd:radioFound,
        btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), //steht oben rechts im HTML Header wenn != 0
        pState:procStatus, //steht unten im HTML footer
        rec:getRadioRec(), //steuert Farbe des Rec Start Buttons (max.5)
        settings:settings,
        vol:volumeAudioOut,settings:settings,
        play:index, //steuert Farbe des Play Buttons (max.1)
        
      })
      await stopMusicPlay(constants.AUDIO_ALL)
      
      //--------------
      /*
        PipeWire hat zwei gleichzeitige Verbindungen vom selben mpv-Output zur Filter-Input-Stage!
        Also läuft derselbe Audiostream doppelt, leicht phasenverschoben → das klingt nach Hall oder Chorus-Effekt.
        siehe "pw-link -l" während mpv spielt. Deswegen:
      */
      exec("pgrep mpv", (err, stdout, stderr) => {
        if (!err) {
          exec("sudo killall mpv; systemctl --user restart pipewire",(err, stdout, stderr) => {})
        }
      })
      //--------------

      settings.powerUpSoundIndex = index
      await playStream(index)
      if (!intervalRadio)
        intervalRadio = setInterval(getMetadata, constants.META_DATA_INTERVAL)
      await writeSettings()
    }
    catch(err){
      console.log(err)
      stopMetadata()
    }
  },
  this.playMPV = function(url) {
    console.log("play MPV "+url)
    settings.powerUpSoundURL = "mpv --cache=yes --cache-secs=15 --demuxer-readahead-secs=5 --display-tags=* >help/metadata.txt "+url
    writeSettings()
    const out = fs.openSync('help/metadata.txt', 'w');
    // spawn mpv and monitor short failures; retry once with larger cache if it dies quickly
    const spawnMpv = (cacheSecs, readaheadSecs) => {
      const mpv = spawn("mpv", [
        "--cache=yes",
        `--cache-secs=${cacheSecs}`,
        `--demuxer-readahead-secs=${readaheadSecs}`,
        "--ytdl=no",
        // Kein Browser-UA-Spoofing, siehe testMPV() weiter oben.
        "--http-header-fields=Icy-MetaData: 1,Accept: */*",
        "--demuxer-lavf-o=icy=1",
        "--display-tags=*",
        url
      ], { stdio: ["ignore", out, out] });
      mpv._startTime = Date.now();
      return mpv;
    };

    let triedRetry = false;
    let mpv = spawnMpv(15, 5);
    mpv.on('exit', (code, signal) => {
      const runMs = Date.now() - (mpv._startTime || Date.now());
      if (!triedRetry && runMs < 3000) {
        // died within 12s — try one retry with bigger buffers
        triedRetry = true;
        console.log('mpv exited quickly, retrying with larger cache/readahead');
        mpv = spawnMpv(30, 10);
        // attach a no-op exit handler to the new process (we don't loop)
        mpv.on('exit', (c, s) => console.log('mpv retry exited', c, s));
      } else {
        console.log('mpv exited', code, signal);
      }
    });
    return mpv;
  },
  this.playFfmpegLocal = function(url) {
    console.log("play ffmpeg (local) "+url)
    settings.powerUpSoundURL = "ffmpeg -i '"+url+"' -f wav pipe:1 | pw-play -"
    writeSettings()

    // Kein Browser-UA-Spoofing, siehe testMPV() weiter oben. Dieser Pfad
    // ersetzt das frühere playChromium(): Headless Chromium gibt auf diesem
    // Geraet nachweislich nie echten Ton ueber PipeWire aus, ffmpeg->pw-play
    // dagegen schon.
    const ffmpeg = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel", "error",
      "-reconnect", "1",
      "-reconnect_streamed", "1",
      "-reconnect_delay_max", "5",
      "-i", url,
      "-vn",
      "-f", "wav",
      "pipe:1"
    ], { stdio: ["ignore", "pipe", "pipe"] });

    const pwplay = spawn("pw-play", ["-"], { stdio: ["pipe", "ignore", "ignore"] });
    // Ohne diesen Handler wirft ein Schreibversuch auf das bereits
    // geschlossene stdin von pw-play (z.B. beim Stoppen/Senderwechsel) ein
    // unhandled 'error'-Event (EPIPE) und reisst den ganzen Node-Prozess mit.
    pwplay.stdin.on('error', () => {});
    ffmpeg.stdout.pipe(pwplay.stdin);

    radioFfmpegProc = ffmpeg;
    radioPwPlayProc = pwplay;

    ffmpeg.stderr.on('data', (data) => {
      console.error("ffmpeg radio (local) transcode:", data.toString());
    });

    ffmpeg.on('error', (err) => console.log('ffmpeg (radio local) spawn failed:', err));
    pwplay.on('error', (err) => console.log('pw-play (radio local) spawn failed:', err));

    ffmpeg.on('exit', (code, signal) => {
      // code 255 = ffmpeg per SIGTERM beendet (normaler Stop/Senderwechsel),
      // kein echter Fehler - siehe server.js /radio Fallback.
      if (!(signal === 'SIGTERM' || (code === 255 && !signal))) {
        console.log('ffmpeg (radio local) exited', code, signal);
      }
      if (radioFfmpegProc === ffmpeg) radioFfmpegProc = null;
      try { pwplay.kill('SIGTERM'); } catch (_) {}
    });
    pwplay.on('exit', () => {
      if (radioPwPlayProc === pwplay) radioPwPlayProc = null;
    });

    return ffmpeg;
  },
  this.stopRadioFfmpeg = function() {
    if (radioFfmpegProc) {
      try { radioFfmpegProc.kill('SIGTERM'); } catch (_) {}
      radioFfmpegProc = null;
    }
    if (radioPwPlayProc) {
      try { radioPwPlayProc.kill('SIGTERM'); } catch (_) {}
      radioPwPlayProc = null;
    }
  },
  this.playStream = async function (index) {
    try{
      // Ein aktiver BT-Stream hat Vorrang: eine neu gestartete lokale
      // Radio-Wiedergabe soll dann gar nicht erst kurz hoerbar werden,
      // statt erst beim naechsten doMonitorBT()-Tick (bis zu 1.5s) wieder
      // gestoppt zu werden.
      if (await isBtStreamActive()) {
        console.log("playStream: BT-Stream aktiv, lokale Wiedergabe wird nicht gestartet")
        procStatus.text = "Bluetooth-Stream aktiv - Radio wird nicht gestartet"
        return false;
      }
      let url = radioFound[index].url
      console.log("PlayStream url="+url+" engine="+radioFound[index].engine)
      if (radioFound[index].engine === "mpv"){
        await playMPV(url);
        if (!intervalRadio)
        intervalRadio = setInterval(getMetadata, constants.META_DATA_INTERVAL)
      } else if (radioFound[index].engine === "ffmpeg"){
        await playFfmpegLocal(url);
      } else {
        console.log("playStream: unbekannte engine, ueberspringe Wiedergabe:", radioFound[index].engine)
      }
      return true;
    } catch (err){
      console.log("playStream err="+err)
      return false;
    }
  },
  this.resolvePls = function(plsUrl, callback) {
    const client = plsUrl.startsWith('https') ? https : http;
    client.get(plsUrl, (res) => {
        let data = '';

        res.on('data', chunk => data += chunk);

        res.on('end', () => {
            const match = data.match(/File1=(.*)/);
            if (match) {
                callback(match[1].trim());
            } else {
                console.log("No stream URL found in PLS");
            }
        });

    }).on('error', err => {
        console.error("PLS fetch error:", err.message);
    });
  },
  this.getMetadata = async function(){
    try {
      const content = await execCmd("cat help/metadata.txt >&1");
      if (!content) return;
      let name = "";
      let title = "";
      for (const line of content.split("\n")) {
        if (line.startsWith(" icy-name:")) {
          name = line.replace("icy-name:", "").trim();
        }
        if (line.startsWith(" icy-title:")) {
          title = line.replace("icy-title:", "").trim();
        }
      }
      let oldName = procStatus.marquee;
      if (name || title) {
        procStatus.marquee = `${name} - ${title}`;
        if (oldName !== procStatus.marquee) {
          emitter.emit("titleChange", procStatus.marquee);
          console.log("emit "+procStatus.marquee)
        }
      }
    } catch (e) {
      //console.log("help/metadata.txt not found or unreadable:", e.message);
    }
  },
  this.stopMetadata = async function(){
    console.log("stopMetadata")
    clearInterval(intervalRadio); 
    await execCmd("rm -f help/metadata.txt")
  },
  this.getRadioRec = function(){
    //DUMMY: Radio recording disabled in this BASIS build - no recordings are
    //ever active.
    return []
  },
  this.playUsbAudio = async function(res,track) {
    //DUMMY: myUSB playback disabled in this BASIS build - call received, no
    //audio is played.
    await stopMusicPlay(constants.AUDIO_ALL)
    pageInfo = "myUSB"
    rememberDB = "myUSB"
    res.render('pages/usbAudio',{
        pageInfo:pageInfo,settings:settings, 
        btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
        pState:procStatus, basetracks:myUSB, dirMain:0, 
        indexStart:0, loc:rememberDB,vol:volumeAudioOut
    })         
  }, 
  this.playMusic = async function(res,track,delUser) {
    //DUMMY: Audio/Video library playback disabled in this BASIS build - call
    //received, no track is played.
    await stopMusicPlay(constants.AUDIO_ALL)
    showMusicDir(rememberDB, res)
  },
  this.getAllTracks = async function (dir){
    //DUMMY: Audio/Video library browsing disabled in this BASIS build.
    allTracks = []
    return false
  },
	this.showMusicDir = async function(dir,res) {
    try{
      let result = await this.getAllTracks(dir)
      if (result){
        res.render('pages/showMusicWorld',{pageInfo:pageInfo, settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:allTracks, dirMain:0, indexStart:trackIndex, loc:dir, vidsrc:"0",vol:volumeAudioOut})
        trackIndex--
      }else{
        //Radio und Youtube zulassen, wenn kein "mediaServer"-Verzeichnis gefunden wurde
        res.render('pages/showMusicWorld',{pageInfo:pageInfo, settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:"", dirMain:0, indexStart:0, loc:dir, vidsrc:"0",vol:volumeAudioOut})
      }
    }
    catch(err){
      console.log(err)
      setInitialPage(res)
    }
	},
  this.normalize = async function(str) {
    return str
        .normalize("NFC")
        .replace(/[’]/g, "'")
        .trim();
  },
  this.playTrack2AudioJack = async function(state){ //interval func
    //console.log("playTrack2AudioJack trackState="+trackState+", state="+state)
    //trackstate "done": das Musikstück ist bis zum Ende gespielt worden
    //                   das nächste in der allTracks-Liste kann gespielt werden    
    //trackstate "kill": Abbruch / Stop 
    //trackstate "run":  ein Musikstück wird gerade gespielt 
    if (state == "start"){
      trackIntervalObj = setInterval(playTrack2AudioJack,2000,"interval")
      console.log("playTrack2AudioJack start")
      trackState = "done"
    }
    if (trackState == "kill"){
      stopMusicPlay(constants.AUDIO_PW)
      clearTrackInterval()//setTimeout(clearTrackInterval,250)
      return
    }

    if (pwPlay && (trackState == "run")){//} && trackIntervalCount > 2) {
      //console.log("playTrack2AudioJack run")
      var result = await execCmd("pgrep pw-play >&1")//wpctl status | grep pw-play >&1")
      if (!result){
        trackState = "done" //see playTrack2AudioJack
        trackIndex++
      }
      return
    }

    if (trackIndex >= allTracks.length)
    {
          trackState = "fini"
          procStatus.text = ""
          clearTrackInterval()
          if (pwPlay) 
            stopMusicPlay(constants.AUDIO_PW)
          return
    }


    if (trackState == "done"){
      //trackstate now "done", end of song play 
      var m = allTracks.length - 1
      console.log("*** trackState=" + trackState + " max.trackIndex=" + m + " trackIndex=" + trackIndex)

      var songLoc = ""
      var track = allTracks[trackIndex]
      if (musicDir.match("myUSB")){
        songLoc = allTracks[trackIndex]
      }else {
        if (musicDir === devADrecords + "/ADrecords")
          songLoc = musicDir + "/" + rememberDB + "/audio/" + allTracks[trackIndex]
        else 
          songLoc = musicDir +"/" + allTracks[trackIndex]
        //could be a directory!
        if (track){
          if (!track.match(/\./)){
            clearTrackInterval() //no .mpr, .wav ...
            console.log("clear playTrack2AudioJack")
            return
          }
        }
      }
      songLoc = escapeTrack(songLoc)
      if (pwPlay) {
        //play track thru Equalizer's filterGraph
        procStatus.marquee= track    
        trackState = "run"
        pwPlayEq(songLoc)  
      }
      else{
        //without equalizer
        //check wav, ogg or mp3
        var ext = getPrgSyntax("") //aplay or mpv command
        if (ext == "ignore"){
          //not supported
          clearTrackInterval()//setTimeout(clearTrackInterval,250)
          return
        }
        var cmd = ext + " " + songLoc
        console.log(cmd)
        //aplay or mpv ...
        trackState = "run"
        procStatus.marquee= track
        exec(cmd, (error, stdout, stderr) => {
          //aplay oder mpv player kommt hier zurück wenn Track fertig gespielt
            if (error){
              var msg = ext + " play " + error
              console.log(msg)
              procStatus.text = msg
              clearTrackInterval()
              procStatus.marquee= ""
              return
            }
            if (stderr){
              if (stderr.match("Playing")) 
                return
              //track has been played or killed by user
              console.error(`ext: ${stderr}`);
              if (trackState == "kill") {
                clearTrackInterval()//setTimeout(clearTrackInterval,250)
                return
              }
              if (allTracks.length == trackIndex)
              {
                trackState = "kill"
                clearTrackInterval()//setTimeout(clearTrackInterval,250)
                return
              }
              trackState = "done"
            }
            trackIndex++              
        })
      }
    }
  },
  this.clearTrackInterval = function(){
    clearInterval(trackIntervalObj)
    trackIntervalObj = null
  },
  this.getPrgSyntax = function(what){
    var data = ""
    if (what) data = what
    else data = allTracks[trackIndex]
    var ext="ignore"
    if (!data) return ext
    // if ((data.search(/.wav/) > 0) || (data.search(/.WAV/) > 0)) 
    //    ext= "aplay -D "+settings.sysAudioOut 
    //else
    if ((data.search(/.ogg/) > 0) || (data.search(/.OGG/) > 0) 
      || (data.search(/.mp3/) > 0) || (data.search(/.MP3/) > 0) 
      || (data.search(/.wav/) > 0) || (data.search(/.WAV/) > 0)) 
    return("pw-play");//"mpv --audio-device=alsa/"+settings.sysAudioOut
    if ((data.search(/.aac/) > 0) || (data.search(/.AAC/) > 0)) 
      return("mpv --audio-device=alsa/"+settings.sysAudioOut)
    return ext
  },
  this.deleteTrack = async function (res,tracks){
    //DUMMY: Audio/Video library delete disabled in this BASIS build.
    showMusicDir(rememberDB, res)
  },

  // this.deleteAuRa = function (res,track){
  //   console.log("delete " + track)
  //   track = escapeTrack(track)
  //   var cmd = "sudo rm " + devMusic + "/" + rememberDB + "/" + track
  //   exec(cmd, (error, stdout, stderr) => {
  //     if (error || stderr)
  //       console.log(error + " " +stderr)
  //     else{
  //       var delIndex = -1
  //       //update allTracks
  //       var i=0; for (i in allTracks){
  //         if (allTracks[i] === track){
  //           delIndex=i
  //           break;
  //         }
  //       }
  //       if (delIndex >=0)
  //         allTracks.splice(delIndex,1)
  //     }
  //     showMusicDir(rememberDB,res)
  //   })
  // },
  this.escapeTrack = function(track){
    //Der Löschbefehl (z.B.) "rm" erwartet keine Blanks und special Chars wie "(" und ")" etc.
    track =track.replace(/ /g,String.fromCharCode(92,32) ) //"\ "
    track=track.replace(/'/g,String.fromCharCode(92,39))    //"\'"
    track=track.replace(/&/g,String.fromCharCode(92,38))    //"\&"
    track=track.replace("(",String.fromCharCode(92,40))    //"\("
    track=track.replace(")",String.fromCharCode(92,41))    //"\)"
    track=track.replace(/;/g,String.fromCharCode(92,59) ) //"\;"
    return track
  },
  this.dirCheck = function(dir){
    if (dir.match("Radio/")) return true;
    if (dir.match("Audio/")) return true;
    if (dir.match("Video/")) return true;
    return false

    if (((dir).search(/Radio/) >=0) && 
    ((dir).search(".mp3") < 0 )  &&  
    ((dir).search(".MP3") < 0 )  &&  
    ((dir).search(".ogg") < 0 )  &&  
    ((dir).search(".OGG") < 0 )  &&  
    ((dir).search(".WAV") < 0 )  &&  
    ((dir).search(".wav") < 0 )){
        if (dir.length > 6) return 0 //radio subdir
        return 1 //radio base dir, needed for correct "back" command
    }
    if (((dir).search(/Audio/) >=0) && 
    ((dir).search(".mp3") < 0 )  &&  
    ((dir).search(".MP3") < 0 )  &&  
    ((dir).search(".ogg") < 0 )  &&  
    ((dir).search(".OGG") < 0 )  &&  
    ((dir).search(".WAV") < 0 )  &&  
    ((dir).search(".wav") < 0 )){
      if (dir.length > 6) return 0 //audio subdir
      return 1 //audio base dir, needed for correct "back" command
    }
    if (((dir).search(/Video/) >=0) && 
    ((dir).search(".mp4") < 0 )  &&  
    ((dir).search(".MP4") < 0 )){
      if (dir.length > 6) return 1 
      return 0 //audio base dir, needed for correct "back" command
    }
  },
  this.nextMusicTrack = function(){
    //der nächste trackIndex muss bereits gesetzt sein
    //check ob innerhalb allTracks[] beendet / ob ein Verzeichnis / ob Musikdatei
    if (trackIndex >= (allTracks.length)) 
        trackIndex = 1 //start at the beginning of allTracks[]
    if (!dirCheck(devMusic+"/"+rememberDB+"/"+allTracks[trackIndex]))
      return true //aktuell ok
    //aktuell ist ein Verzeichnis vorhanden, jetzt können mehrere Verzeichnisse hintereinander liegen
    for (i=trackIndex;i<=allTracks.length;i++){        
      if (!dirCheck(devMusic+"/"+rememberDB+"/"+allTracks[i])){
        //Verzeichnisse können nicht übersprungen werden in showMusicWorld.ejs
        //Verzeichnisse sollten daher am Ende von allTracks[] plaziert werden. 
        //Bei der Implementierung von Verzeichnissen, diese mit letzem Alphabet Buchstaben beginnen (z.B XJazz90_1WGMC-FM")
        trackIndex = 1
        return true
      }
    }
    trackIndex = 1
    return false //nur Verzeichnisse vorhanden!
  },
  this.showResultAgain = function (res){
    res.render('pages/radioStation', {pageInfo:pageInfo,dat:stationCount, search:radioUserSearch,  
      rd:radioFound, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
      pState:procStatus, rec:getRadioRec(),
      settings:settings,
      vol:volumeAudioOut,
      settings:settings, 
      play:radioPlayIndex
    });   
  },
  this.loadRadioSearch = async function(){
    try {
      const data = await fsPromises.readFile('help/radioSearch.json','utf8');
      if (data.length <= 0) return;
      radioSearch = JSON.parse(data);
      stationCount = radioSearch.length;
      radioFound = radioSearch;
    } catch (err) {
      console.log(err)
    }
  },
  this.stopPlayActions = function (){
    if (trackIntervalObj){
      stopMusicPlay(constants.AUDIO_ALL)
      clearTrackInterval()
    }
  },
  this.setRecSide = function(){
    var i = 0
    for (i in recSide){
      if (recSide[i] === recAD.side){
        recSide[i] = recSide[0]
        recSide[0] = recAD.side
        break
      }
    }
  },
  this.convertVideoM4A = async function(p){
    n = p.split(".m4a")
    var cmd = "ffmpeg -i " + p + " -c:av copy -f mp4 " + n[0] + ".mp4"
    try{
      await execCmd(cmd)
      await execCmd("rm " + p)
      await sendHLS(res, n[0] + ".mp4") 

    }
    catch(err){
      console.log(err)
    }
  },
  this.setInitialPage = async function(res){
    await loadRadioSearch() //fill radioFound {}
    await loadYouTubeSearch()
    pageInfo = "Radio"
    rememberDB = "Radio/Suchen"
    
    ledGreen("On")
    res.render('pages/radioStation', {pageInfo:pageInfo,
        dat: stationCount, search:radioUserSearch, rd:radioFound,
        btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
        pState: procStatus, rec: getRadioRec(),
        settings:settings,
        vol: volumeAudioOut,
        play: radioPlayIndex,
    });
  }
}
