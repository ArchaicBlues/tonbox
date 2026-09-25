//Equalizer
require('./funcEqualizer')();
const fsPromises = require('fs/promises');
const fs = require ('fs');;
const path = require('path');

const { exec } = require('child_process');
const { spawn } = require('child_process');

//https://www.npmjs.com/package/radio-browser
REC_MAX_RADIO_RECORDINGS = 6 //bzw. 6-1=5
const RadioBrowser = require('radio-browser');
const https = require("https");
const http = require("http");

//für ffmpegReckorder und Titel Evaluierung
const EventEmitter = require("events");
const emitter = new EventEmitter();
const titelRef = { value: "" };

const streamCache = new Map();
let radioFfmpegProc = null;
let radioPwPlayProc = null;
//radio Recording, see radioFavorites.ejs, Array of json!
global.scheduledRadioRecJobs = [];
global.activeRecordings = {};


global.history = { "button" : [
  /*{ name:constants.HISTORY_DEFAULT_NAME, url:constants.HISTORY_DEFAULT_URL, rec:??}*/
]}


global.recState = { "recordings" : [
  { url:constants.REC_DEFAULT_HTTP, rec:constants.REC_DEFAULT_REC, pid:constants.REC_DEFAULT_PID, err:constants.REC_DEFAULT_NO_ERR},
  { url:constants.REC_DEFAULT_HTTP, rec:constants.REC_DEFAULT_REC, pid:constants.REC_DEFAULT_PID, err:constants.REC_DEFAULT_NO_ERR},
  { url:constants.REC_DEFAULT_HTTP, rec:constants.REC_DEFAULT_REC, pid:constants.REC_DEFAULT_PID, err:constants.REC_DEFAULT_NO_ERR},
  { url:constants.REC_DEFAULT_HTTP, rec:constants.REC_DEFAULT_REC, pid:constants.REC_DEFAULT_PID, err:constants.REC_DEFAULT_NO_ERR},
  { url:constants.REC_DEFAULT_HTTP, rec:constants.REC_DEFAULT_REC, pid:constants.REC_DEFAULT_PID, err:constants.REC_DEFAULT_NO_ERR}
]}

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
var radioTransfer=false

global.radioSearch = {}
global.radioFound = {}

var radioRec = []
global.stationCount = 0
global.radioPlayIndex = -1
global.intervalRadio = null
const ffmpegTempNameByUrl = new Map();
let activeFfmpegRecorderUrl = "";
let latestRadioSearchToken = 0;

//var possibleTags = "Available genre i.e :<br><br>" + "70s,80s,90s,disco,pop,musica romantica,rock,oldies, live, synth,90er,dance,eurodance,hiphop,rap,electronic,electronica,electropop,hits,house,<br>top40charts,jazz, blues, ska,classic rock,hard rock,heavy metal,metal,pop rock,punk,punk soft rock, classic hits,easy listening,hits,wacken radio bob,pop rock,punk, economy ...";
var recordingPID = "";


class RecordingSession {
  constructor(url, stationName, outputDir, fallbackFn) {
    this.url = url;
    this.stationName = stationName;
    this.outputDir = outputDir;
    this.fallbackFn = fallbackFn;

    this.process = null;
    this.interval = null;

    this.lastSize = 0;
    this.lastActivity = Date.now();
    this.stderrData = "";
    this.accessForbidden = false;

    // 👉 NEU: Hard timeout für "kein Audio"
    this.noDataTimeoutMs = 15000; // minimum 
  }

  start() {
    console.log("▶ streamripper start:", this.url);

    this.process = spawn("streamripper", [
      this.url,
      "-d",
      this.outputDir
    ]);

    this.process.stdout.on("data", data => {
      this.lastActivity = Date.now();
      //console.log(`[${this.url}] ${data.toString()}`);
    });

    this.process.stderr.on("data", data => {
      const text = data.toString();
      this.stderrData += text;
      if (/access forbidden|403|forbidden|access denied/i.test(text)) {
        this.accessForbidden = true;
      }
      console.log(`[${this.url} ERR] ${text}`);
    });

    this.process.on("close", code => {
      console.log(`❌ streamripper closed (${this.url}) code=${code}`);
      if (this.accessForbidden || /access forbidden|403|forbidden|access denied/i.test(this.stderrData)) {
        this.failover();
      } else {
        this.cleanup();
      }
    });

    this.process.on("error", err => {
      console.error(`❌ spawn error (${this.url})`, err);
      this.failover();
    });

    this.startMonitor();

    return this;
  }

  startMonitor() {
    this.interval = setInterval(() => {

      try {
        const entries = fs.readdirSync(this.outputDir, { withFileTypes: true });

        let size = 0;

        for (const e of entries) {
          if (e.isFile()) {
            const stat = fs.statSync(path.join(this.outputDir, e.name));
            size += stat.size;
          }
        }

        const now = Date.now();

        const growing = size > this.lastSize;
        const hasRecentActivity = (now - this.lastActivity) < this.noDataTimeoutMs;
        const noActivityTooLong = (now - this.lastActivity) > this.noDataTimeoutMs;

        if (growing) {
          //console.log(`📈 streamripper writing (${this.url})`);
          this.lastActivity = now;
        }

        this.lastSize = size;

        // ❌ HARD FAIL CONDITION
        if (noActivityTooLong) {
          console.log(`💀 NO DATA detected → killing streamripper (${this.url})`);

          this.failover();
        }

      } catch (err) {
        console.error("monitor error:", err);
      }

    }, 3000);
  }

  failover() {
    this.cleanup();

    if (this.fallbackFn) {
      console.log("🔁 switching to ffmpeg:", this.url);
      this.fallbackFn(this.url, this.stationName);
    }
  }

  cleanup() {
    this.stopMonitor();

    if (this.process && !this.process.killed) {
      this.process.kill("SIGTERM");
    }
  }

  stopMonitor() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}



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

function rejectScheduledRecordingForUrl(url, stationName, reason) {
  const jobsToCancel = scheduledRadioRecJobs.filter(job => job.radioUrl === url);
  for (const job of jobsToCancel) {
    if (job.startTimer) clearTimeout(job.startTimer);
    if (job.stopTimer) clearTimeout(job.stopTimer);
  }
  scheduledRadioRecJobs = scheduledRadioRecJobs.filter(job => job.radioUrl !== url);

  delete activeRecordings[url];
  ffmpegTempNameByUrl.delete(url);

  const displayName = stationName || url;
  procStatus.text = `Recording rejected (${displayName}): ${reason}`;
  console.log(procStatus.text);
}


async function ffmpegRecorder(url, stationName) {
  if (activeFfmpegRecorderUrl && activeFfmpegRecorderUrl !== url) {
    rejectScheduledRecordingForUrl(url, stationName, "another ffmpeg recorder is already running");
    return false;
  }

  //const date = formatDate(Date.now());
  const filename = "temp.mp3";
  ffmpegTempNameByUrl.set(url, procStatus.marquee || stationName || "temp.mp3");

  const outputDir = `/home/pi/ArchaicNodeEJS/Radio/${stationName}`;
  await fsPromises.mkdir(outputDir, { recursive: true });

  const fullpath = path.join(outputDir, filename);

  console.log("ffmpeg start:", fullpath);

  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner",
    "-loglevel", "error",
    "-reconnect", "1",
    "-reconnect_at_eof", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "30",
    "-rw_timeout", "30000000",
    "-i", url,
    "-vn",
    "-c:a", "libmp3lame",
    "-b:a", "192k",
    "-f", "mp3",
    "-y",
    fullpath
  ]);

  activeFfmpegRecorderUrl = url;
  activeRecordings[url] = ffmpeg;

  console.log("PID:", ffmpeg.pid);

  const handler = async (newTitle) => {

    console.log("title change:", newTitle);
    ffmpegTempNameByUrl.set(url, newTitle || stationName || "temp.mp3");

    const safeTitle = newTitle
      .replace(/[\/\\?%*:|"<>]/g, "-")
      .trim();

    try {
      await fsPromises.rename(
        fullpath,
        path.join(outputDir, safeTitle + ".mp3")
      );
    } catch (e) {
      console.error("rename failed:", e);
    }

    ffmpeg.kill("SIGTERM");

    emitter.off("titleChange", handler);

    ffmpegRecorder(url, stationName);
  };

  emitter.on("titleChange", handler);

  ffmpeg.on("close", () => {
    if (activeFfmpegRecorderUrl === url) {
      activeFfmpegRecorderUrl = "";
    }
  });

  ffmpeg.on("error", err => {
    if (activeFfmpegRecorderUrl === url) {
      activeFfmpegRecorderUrl = "";
    }
    console.error("ffmpeg error:", err);
  });

  return true;
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


function set_radioRec(y){
  var i=0; for (i in radioSearch){
    if (recState.recordings[y].url == radioSearch[i].url){
      radioRec[i]=true
      console.log("radioRec[" + i + "]=true")
      // addRadioHistory(y)
      return true
    }
  }
  console.log("program error!!!!!!!!")
  return false //this should never happen!
}

async function execMoveDir(dir,stationName){
  try{
    let cmd = ""
    let info = await execCmd("stat -c %s " + dir + "/incomplete")
    if (info){
      await execCmd("mv " + dir + "/incomplete/* " + dir + "/.; rm -rf " + dir + "/incomplete")
    }
    
    info = await execCmd("ls " + dir + " >&1")
    if (info){ 
      //check if any song exist in dir
      var any = info.split("\n"); any.pop() //last line always empty
      if (any) {
        var targetDir = dir.replace(/\\/g,"")
        targetDir = targetDir.replace(/ /g,"")
        targetDir = targetDir.replace(".","_")   

        //check Sonderzeichen oder Unbekannte Tracks
        for (n in any){
          var track = any[n].replace(/ /g,String.fromCharCode(92,32)) //"\ "
          track = track.replace(/\'/g,String.fromCharCode(92,39)) //"\'"
          track = track.replace(/\(/g,String.fromCharCode(92,40)) //"\("
          track = track.replace(/\)/g,String.fromCharCode(92,41)) //"\)"
          //ignore low file size
          info = await execCmd("stat -c %s "+dir+"/"+track+" >&1")
          info = info.slice(0,-1) //delete "\n"
          if (info > 512000){ //wenn > 500kB dann behalten
            var targetTrack = stationName
            if (/^\s*-\s*\.(aac|acc|mp3)$/.test(any[n])){ //wenn stream name z.B. "-.mp3"
              console.log("found continues track!")
              const i = any[n].lastIndexOf(".");
              if (i>=0) {
                targetTrack += any[n].slice(i) 
                targetTrack = await cleanFilenameNoPromise("",targetTrack);
              }
            }
            else
              targetTrack = await cleanFilenameNoPromise("",any[n]);
            
            if (track != targetTrack){
              cmd += "mv " + dir + "/" + track + " " + dir + "/" + targetTrack + ";"
              console.log(cmd)
              await execCmd(cmd)
            }
          }else 
            await execCmd("rm "+dir+"/"+track)
        }
        //check if nothing to transfer
        info = await execCmd("ls "+dir+" >&1")
        if (!info) return
        //check if targetDir exist
        cmd = "ls " + devMusic + "/Radio >&1" 
        info = await execCmd(cmd)
        var target = targetDir.replace("Radio/","")
        if (info.match(target)){
          //targetDir exist, move only content
          cmd = "mv -f " + dir + "/*.* " + devMusic + "/" + targetDir + "/."
        }else {
          //new dir, move complete dir, reject special char
          cmd = "mv " + dir + " " + devMusic + "/Radio/" + target
        }
        console.log(cmd)
        await execCmd(cmd)  

        info = info.split("\n")
        // if (info.length > 3)
        //   addRadioHistory(urlIndex)
      } 
    }
  }catch(err){
    console.log(err)
  }
}

module.exports = function(){
  //lokale Variablen in Modulen können nicht in anderen Modulen verändert werden
  //https://stackoverflow.com/questions/23897429/node-import-object-array-from-another-js-file/23897512
  this.getfuncRadioVar = function(d,i){
    switch (d) {
      case "recState":
        if(i==-1){
          return(recState);
        }
        return (recState.recordings[i]);

      case "recStateUrl":
        if (i>constants.REC_MAX_RADIO_RECORDINGS) return "programming error"
        return (recState.recordings[i].url);

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

      // case "recStatus":
      //   return (recStatus)
    
      case "recordingPID":
        recordingPID = ""
        var i=0; for (i in recState.recordings){
          if (recState.recordings[i].pid != ""){
            recordingPID += recState.recordings[i].pid + " "
          }
        }      
        if (!recordingPID) {
          recordingPID=""
        }
        //console.log("PIDs:" + recordingPID)
        return (recordingPID)

      case "recButtonPid":
        //console.log("recButtonPid " + i + "\n")
        //console.log(JSON.stringify(history) + "\n")
        for(var x=0; x<history.button.length; x++){
          if(i == history.button[x].url) {
            for (var y=0; y<constants.REC_MAX_RADIO_RECORDINGS; y++){
              if (recState.recordings[y].url == history.button[x].url)
                return recState.recordings[y].pid
            }
          }
        }
        return ""
      
      default:
        return ""
    }
  },
  this.setfuncRadioAD = function(){
    //während einer Schallplattenaufnahme / Analyse läuft ein SSE-Prozess der nicht über Home / Login / Register / etc. gestört werden soll
    //Siehe auch header.ejs
    recState.recordings[0].url = "ADrecords"
    recState.recordings[0].rec = "ADrecords"
    recState.recordings[0].pid = "ADrecords"
  },
  this.resetfuncRadioAD = function(){
    //während einer Schallplattenaufnahme / Analyse läuft ein SSE-Prozess der nicht über Home / Login / Register / etc. gestört werden soll
    //Siehe auch header.ejs
    recState.recordings[0].url = "http"
    recState.recordings[0].rec = "false"
    recState.recordings[0].pid = ""
  },
  this.consolePlotRec = function(){
    for(i in recState.recordings){
      console.log("recState.recordings[" + i + "]= " + recState.recordings[i].url + " - " + recState.recordings[i].rec + " - " + recState.recordings[i].pid + " - " + recState.recordings[i].err)
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
  this.addRadioFavorit = async function (index,res){
    if (history.button.length >= constants.HISTORY_MAX_BUTTONS) {
      loadRadioHistory(res)
      return
    }
    for (let i=0;i<history.button.length;i++){
      if (history.button[i].url === radioFound[index].url) {
        //already in history
        loadRadioHistory(res)
        return
      }
    }
    history.button.push({"name": radioFound[index].name, 
      "url":radioFound[index].url,
      "engine":radioFound[index].engine,
      "rec":"false"})
    await writeHistory()
    loadRadioHistory(res)
  },
  // this.addRadioHistory = function(idx){
  //   if (history.button.length >= constants.HISTORY_MAX_BUTTONS)
  //     return
  //   var i=0; for (i in history.button){
  //     if (history.button[i].url === recState.recordings[idx].url) 
  //       //already in history
  //       return
  //   }
  //   var id
  //   var i=0; 
  //   for (i in radioSearch){
  //     if (radioSearch[i].url === recState.recordings[idx].url){
  //       id = i
  //       break;
  //     }
  //   }
  //   history.button.push({"name": radioSearch[id].name, "url":recState.recordings[idx].url, "rec":"true"})
  //   writeHistory()
  // },
  this.writeHistory = async function(){
    var data=JSON.stringify(history)
    await fs.writeFileSync('help/radioHistory.txt', data, function (err) {
      if (err) {
        procStatus.text = "could not write radioHistory.txt"
        console.log(procStatus.text)
        return
      }
      // if (set)
      //   history.button[0].rec = "true";
      console.log("newHistory: " + data + ' saved!');
    }); 
  },
  this.loadRadioHistory = async function(res){
    try{
      let present = false
      try {
        await fsPromises.access('help/radioHistory.txt')
        present = true
      } catch (accessErr) {
        present = false
      }

      if (!present) {
        console.log("help/radioHistory.txt doesn't exist")
        if (res){
          let d = await getRadioRecords()          
          console.log("radioDirs="+d[0])
          res.render('pages/radioFavorites', {pageInfo:"My Radio", 
            btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
            pState:procStatus,
            settings:settings,
            bRec:getRadioRec(),
            vol:volumeAudioOut,settings:settings,
            play:-1,
            settings:settings,
            rh:history,
            basetracks:"",
            radioDirs:d,
            currentRadioDir:""
          });
          return
       }
      }else{
        let data = await fsPromises.readFile('help/radioHistory.txt','utf8')
        if(data.length > 0){
          history = JSON.parse(data)
          for (h in history.button) history.button[h].rec = constants.REC_DEFAULT_REC
          for (h in history.button){
            for (r in recState.recordings){
              if (history.button[h].url === recState.recordings[r].url){
                history.button[h].rec = recState.recordings[r].rec
                break
              }
            }
          }
        }
        if (res){
          let dirs = await getRadioRecords()
          res.render('pages/radioFavorites', {pageInfo:"My Radio", 
            btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
            pState:procStatus,
            rh:history,
            bRec:getRadioRec(),
            settings:settings,
            vol:volumeAudioOut,settings:settings,
            play:radioPlayIndex,
            radioDirs:dirs,currentRadioDir:"",
            basetracks:""
          });
        }
      }
    }catch(err){
      console.log("loadRadioHistory " + err)
    }
  },
  this.getScheduledJobsWithoutTimeout = function(){
    //Node's Timeout objects contain circular references internally:
    //Circular structures cannot be JSON.stringified.
    const safeScheduledJobs = scheduledRadioRecJobs.map(job => ({
      jobId: job.jobId,
      radioUrl: job.radioUrl,
      startTime: job.startTime,
      stopTime: job.stopTime
    }));
    return safeScheduledJobs
  },  
  this.getHistoryPid = function(buttonNum){
    for (h in history.button){
      for (r in recState.recordings){
        if (history.button[h].url === recState.recordings[r].url){
          return recState.recordings[r].pid 
        }
      }
    }
    return "-1"
  },
  this.removeHistory = async function(indexStr, res){
    index = parseInt(indexStr)
    for (i=index; i<history.button.length-1; i++){
      history.button[i] = history.button[i+1]
      // history.button[i].rec = history.button[i+1].rec
      // history.button[i].url = history.button[i+1].url
    }
    history.button.pop()
    await writeHistory()
    await loadRadioHistory(res)
  },
  this.nextRec = function(){
    if (recState.recordings[0].pid == 0) return 0
    if (recState.recordings[1].pid == 0) return 1
    if (recState.recordings[2].pid == 0) return 2
    if (recState.recordings[3].pid == 0) return 3
    if (recState.recordings[4].pid == 0) return 4
    return constants.REC_MAX_RADIO_RECORDINGS
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
      await playStream(index,"radio")
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
  this.playStream = async function (index,fav) {
    // return new Promise((resolve, reject) => {
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
      let url = ""
      if (fav === "favorites"){
        url = history.button[index].url
        console.log("PlayStream url="+url+" engine="+history.button[index].engine)
        if (history.button[index].engine === "mpv"){
          await playMPV(url);
          if (!intervalRadio)
          intervalRadio = setInterval(getMetadata, constants.META_DATA_INTERVAL)
        } else if (history.button[index].engine === "ffmpeg"){
          await playFfmpegLocal(url);
        } else {
          console.log("playStream: unbekannte engine, ueberspringe Wiedergabe:", history.button[index].engine)
        }
      }else{
        url = radioFound[index].url
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
  this.radioHistoryPlay = async function(index,res){
    try{      
      let dirs = await getRadioRecords()
      res.render('pages/radioFavorites', {pageInfo:"My Radio", 
        btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
        pState:procStatus,
        rh:history,
        bRec:getRadioRec(),
        settings:settings,
        vol:volumeAudioOut,settings:settings,
        play:radioPlayIndex,
        radioDirs:dirs,currentRadioDir:"",
        basetracks:""
      });
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
      await playStream(index,"favorites")
      if (!intervalRadio)
      intervalRadio = setInterval(getMetadata, constants.META_DATA_INTERVAL)
      await writeSettings()
    }
    catch(err){
      console.log(err)
      stopMetadata()
    }    
  },
  this.radioHistoryStop = async function (res){
      let d = await getRadioRecords()
      res.render('pages/radioFavorites', {pageInfo:"My Radio", 
        btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
        pState:procStatus,
        rh:history,
        bRec:getRadioRec(),
        settings:settings,
        vol:volumeAudioOut,settings:settings,
        play:radioPlayIndex,
        radioDirs:d,currentRadioDir:"",
        basetracks:""
      });
  },
  this.checkJobSchedule = function(start,stop,url){
    if (scheduledRadioRecJobs.length > 0){
      for (let i in scheduledRadioRecJobs){
        if (scheduledRadioRecJobs[i].radioUrl === url){ //&&
            //(scheduledRadioRecJobs[i].startTime === start) &&
            //(scheduledRadioRecJobs[i].stopTime === stop)){
          return true //already scheduled, no doublettes allowed
        }
      }
    }
    return false
  },
  this.scheduleRadioRecording = async function(req,res){
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    if (scheduledRadioRecJobs.length >= constants.REC_MAX_RADIO_RECORDINGS) {
      return res.json({ success: false, message: "Maximum number of scheduled recordings reached." });
    }
    const { radioUrl, startTime, stopTime } = req.body;
    console.log(radioUrl)
    if (!radioUrl) 
        return res.json({ success: false })
    if (checkJobSchedule(startTime,stopTime,radioUrl)){
        return res.json({ success: true });
    }
    let stationName = "_nonsens_"
    for (let i in history.button){
      if (history.button[i].url === radioUrl){
        stationName = history.button[i].name
        stationName = await cleanFilename("",stationName)
        break;
      }
    }

    const now = Date.now();
    const jobId = Date.now() + "_" + Math.random();
    const startDelay = ((startTime === "0") || (startTime < (now+60000))) ? 500 : (startTime - now);
    const startTimer = setTimeout(() => {
        console.log("recStart:", radioUrl);
        startRadioRecording(radioUrl, stationName);
    }, startDelay);

    const stopTimer = setTimeout(() => {
        console.log("recStop:", radioUrl);
        stopRadioRecording(radioUrl, stationName);
    }, stopTime - now);

    scheduledRadioRecJobs.push({
        jobId,
        radioUrl,
        startTime,
        stopTime,
        stationName,
        startTimer,
        stopTimer
    });
    for (i in scheduledRadioRecJobs)
      console.log(scheduledRadioRecJobs[i])
    res.json({ success: true });
  },
  this.startRadioRecording = async function(url,stationName) {
    await execCmd("mkdir /home/pi/ArchaicNodeEJS/Radio/ 2>/dev/null")
    const session = new RecordingSession(
      url,
      stationName,
      "/home/pi/ArchaicNodeEJS/Radio/",
      ffmpegRecorder
    ).start();

    activeRecordings[url] = session;
  },
  this.stopRadioRecording = async function(url,outDir) {
    // cancel any pending schedule timers for this recording
    const jobsToCancel = scheduledRadioRecJobs.filter(job => job.radioUrl === url && (!outDir || job.stationName === outDir));
    if (jobsToCancel.length) {
      for (const job of jobsToCancel) {
        if (job.startTimer) clearTimeout(job.startTimer);
        if (job.stopTimer) clearTimeout(job.stopTimer);
      }
      // scheduledRadioRecJobs = scheduledRadioRecJobs.filter(job => !(job.radioUrl === url && (!outDir || job.stationName === outDir)));
    }

    const session = activeRecordings[url];
    if (!session) {
      console.log("No active session for:", url);
      return;
    }

    const target = session.process || session;
    if (target && typeof target.kill === "function") {
      target.kill("SIGTERM");   // sauber stoppen
    } else {
      console.log("No killable process found for:", url);
    }

    if (activeRecordings[url]) {
      const sessionOutputDir = session.outputDir ? session.outputDir : "Radio";
      const sessionName = session.stationName ? session.stationName.toString().trim() : "";
      delete activeRecordings[url];
      if (activeFfmpegRecorderUrl === url) {
        activeFfmpegRecorderUrl = "";
      }
      scheduledRadioRecJobs = scheduledRadioRecJobs.filter(job => !(job.radioUrl === url && (!outDir || job.stationName === outDir)));

      let candidateDir = null;
      const expectedDirName = outDir && outDir.toString().trim() ? outDir.toString().trim() : sessionName;
      const rootDir = sessionOutputDir;

      const pathExists = async (p) => {
        try {
          await fsPromises.access(p);
          return true;
        } catch (e) {
          return false;
        }
      };

      if (expectedDirName) {
        const exactDir = path.join(rootDir, expectedDirName);
        if (await pathExists(exactDir)) {
          candidateDir = exactDir;
        }
      }

      if (!candidateDir) {
        try {
          const allDirs = await fsPromises.readdir(rootDir, { withFileTypes: true });
          const expectedClean = expectedDirName ? await cleanFilenameNoPromise("", expectedDirName) : "";
          // only allow exact cleaned-name matches to avoid cross-station mixups
          for (const entry of allDirs) {
            if (!entry.isDirectory()) continue;
            const entryClean = await cleanFilenameNoPromise("", entry.name);
            if (expectedClean && entryClean === expectedClean) {
              candidateDir = path.join(rootDir, entry.name);
              break;
            }
          }

          // very conservative fallback: only if exactly one subdir exists and no recording remains active
          if (!candidateDir) {
            const dirEntries = allDirs.filter(e => e.isDirectory());
            if (dirEntries.length === 1 && Object.keys(activeRecordings).length === 0) {
              candidateDir = path.join(rootDir, dirEntries[0].name);
              console.log('Conservative fallback candidateDir chosen:', candidateDir);
            }
          }
        } catch (err) {
          console.log('Error searching Radio directories:', err);
        }
      }

      if (!candidateDir) {
        console.log('Could not find recording directory for', url, 'expected', expectedDirName, 'under', rootDir);
        ffmpegTempNameByUrl.delete(url);
        return;
      }

      const destBase = path.join(devMusic, "Radio", path.basename(candidateDir));
      try {
        const moveFileSafe = async (srcPath, destPath) => {
          try {
            await fsPromises.rename(srcPath, destPath);
          } catch (err) {
            if (err && err.code === "EXDEV") {
              await fsPromises.copyFile(srcPath, destPath);
              await fsPromises.unlink(srcPath);
              return;
            }
            throw err;
          }
        };

        await fsPromises.mkdir(destBase, { recursive: true });
        const entries = await fsPromises.readdir(candidateDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "incomplete" && entry.isDirectory()) {
            const incompleteDir = path.join(candidateDir, "incomplete");
            const incompleteFiles = await fsPromises.readdir(incompleteDir, { withFileTypes: true });
            for (const fileEntry of incompleteFiles) {
              if (!fileEntry.isFile()) continue;
              let destName = fileEntry.name;
              if (fileEntry.name === "temp.mp3") {
                const fallbackName = ffmpegTempNameByUrl.get(url) || sessionName || "temp.mp3";
                destName = /\.(mp3|aac|ogg)$/i.test(fallbackName) ? fallbackName : `${fallbackName}.mp3`;
              }
              const safeName = await cleanFilenameNoPromise("", destName);
              const srcPath = path.join(incompleteDir, fileEntry.name);
              const destPath = path.join(destBase, safeName);
              await moveFileSafe(srcPath, destPath);
            }
          } else if (entry.isFile()) {
            const safeName = await cleanFilenameNoPromise("", entry.name);
            const srcPath = path.join(candidateDir, entry.name);
            const destPath = path.join(destBase, safeName);
            if (!destPath || !srcPath)
              console.log ("Error: srcPath or destPath is undefined for", entry.name, "in", candidateDir);
            await moveFileSafe(srcPath, destPath);
          }
        }
        await fsPromises.rm(candidateDir, { recursive: true, force: true });
        ffmpegTempNameByUrl.delete(url);
      } catch (err) {
        ffmpegTempNameByUrl.delete(url);
        console.log('Error moving recorded files:', err);
      }
    }
  },
  // this.radioRecording = function(buttonNum,res){
  //   procStatus.stat |= constants.PROC_STAT_REC_ON
  //   var idx=nextRec()
  //   var url = radioFound[buttonNum].url
  //   if (idx < constants.REC_MAX_RADIO_RECORDINGS) {
  //       console.log("record url=" + url)
  //       if (ifAlreadyRecording(url)) {
  //         procStatus.text = "recording " + url + " already active"
  //         console.log(procStatus.text)
  //         doRender(idx,res,"list")
  //         return;
  //       }
  //       console.log("start recording url:" + url)
  //       //---------------------------
  //       if(url.match(".ts")||url.match(".mpd")||url.match(".ism")||url.match(".f4m")){
  //         procStatus.text = "Segmented streams cannot be recorded: "+url;
  //         res.render('pages/radioStation', {pageInfo:pageInfo,
  //             dat: stationCount, search:radioUserSearch, rd:radioFound,
  //             btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
  //             pState: procStatus, rec: getRadioRec(),
  //             settings:settings,
  //             vol: volumeAudioOut,
  //             settings:settings,
  //             play: radioPlayIndex,
  //         });
  //         return
  //       }
  //       if(url.match(".m3u8")){
  //         procStatus.text = url + " no track split, will record"
  //       }
  //       recordUrl(idx,url)
  //       //wait 'til process has been started, than getRecordingPID
  //       setTimeout(getRecordingPID,constants.REC_WAIT_PROCESS_START,url,"list",idx)
  //       setTimeout(doRender,constants.REC_WAIT_PROCESS_START+500,idx,res,"list")
  //       //---------------------------
  //   }else{
  //     procStatus.text = "max. recordings reached"
  //     console.log(procStatus.text)
  //       res.render('pages/radioStation', {pageInfo:pageInfo,
  //           dat: stationCount, search:radioUserSearch, rd:radioFound,
  //           btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
  //           pState: procStatus, rec: getRadioRec(),
  //           settings:settings,
  //           vol: volumeAudioOut,
  //           settings:settings,
  //           play: radioPlayIndex,
            
  //       });
  //   }
  // },
  this.recordUrl = async function(idx,url){
    // wenn für die Aufnahme "fadecut benutzt wird, dann muss zuvor ein Profile File erstellt werden in /home/pi/.fadecut
    // "fadecut -d 1 -p fadecutProfile -r"
    // hier wird "streamripper" benutzt: "streamripper " + url + " -d " + devMusic + "/Radio"
    // Radiostreams können nicht direkt auf USB Speicher plaziert werden (ERROR) !
    const { dirname } = require('path');
    const appDir = dirname(require.main.filename);
    if (url.match(".m3u8")){
      let rn = url.replace(/[^a-z0-9]/gi, ""); 
      cmd = "mkdir -p Radio/m3u8;mkdir -p Radio/m3u8/incomplete; ffmpeg -i "+url+" -c copy Radio/m3u8/incomplete/"+rn+".aac"
    }
    else
      cmd = "streamripper " + url + " -d " + appDir + "/Radio/"
    console.log(cmd)
    exec(cmd, (error, stdout, stderr) => {
      if (idx != "history"){
        //wenn Process nicht vom Benutzer abgebrochen wurde
        if (recState.recordings[idx].err != constants.REC_KILL_ERR){
          if (error) {
            var checkErr = error.message
            if (checkErr.search("Terminated") >=0 )
              return
            console.error(`recordUrl error: ${error.message}`);
            recState.recordings[idx].err=constants.REC_PROCESS_ERR
            recState.recordings[idx].rec=constants.REC_DEFAULT_REC

            procStatus.text=error
            recState.recordings[idx].rec=constants.REC_DEFAULT_REC
            return;
          }
          if (stderr) {
            console.error(`recordUrl stderr: ${stderr}`);
            //if not stopped by user
            if (`${stderr}` != "Terminated") {
              recState.recordings[idx].err=constants.REC_PROCESS_ERR
              recState.recordings[idx].rec=constants.REC_DEFAULT_REC
              procStatus.text="HTTP 403 - access forbidden"
            }
            return;
          }
        }
      } else {//"history"
          if (error) {
            console.error(`recordUrl error2: ${error.message}`);
            procStatus.text=error
            return;
          }
          if (stderr) {
            console.error(`recordUrl stderr: ${stderr}`);
            //if not stopped by user
            if (`${stderr}` != "Terminated") {
              procStatus.text="HTTP 403 - access forbidden"
            }
          }
      }
    });
  },
  this.ifAlreadyRecording = function(url){
    console.log("ifAlreadyRecording " + url)
    if (url === constants.REC_DEFAULT_HTTP) return false
    for (var i=0; i<constants.REC_MAX_RADIO_RECORDINGS; i++){
      if (url === recState.recordings[i].url){
        if (recState.recordings[i].rec === "true") return true
        return false
      } 
    }
    return false
  },
  this.getRecordingPID = async function(url,select,idx){
    if (idx != "history"){
      if (recState.recordings[idx].err){
        console.log("problem=" + recState.recordings[idx].err)
        return
      }
    }
    x=nextRec()
    console.log("next rec index = " + x)
    try{
      let state = await execCmd('pgrep -x streamripper >&1')
      if (!state) {
        state = await execCmd('pgrep -x ffmpeg >&1')
        if (!state){
          console.log("getRecordingPID error: "+ err);
          recState.recordings[x].err=constants.REC_PID_ERR
          procStatus.text = "getRecordingPID error"
          return
        }
      }
      recState.recordings[x].err=constants.REC_DEFAULT_NO_ERR
      recState.recordings[x].url=url
      recState.recordings[x].rec="true"

      var i = 0;
      var y = 0
      //if a favorite radio history recording button
      if (select === "history"){
        for (i in  history.button){
          if (history.button[i].url === url){
            history.button[i].rec = "true"
            y=i
            break;
          }
        }
      }
      var d = state.split("\n")
      for (i in d){
        if (d[i]){
          //check if already tracked
          var tracked=false
          for(n in recState.recordings){
            if (recState.recordings[n].pid == d[i]){
              tracked=true;
              break;
            }
          }
          if (!tracked) {
            recState.recordings[x].pid=d[i]
            if (select == "history") 
              history.button[y].pid = d[i]
          }
        }
      }
      consolePlotRec()
      // console.log(history)
      getfuncRadioVar("recordingPID")
    }catch(err){
      console.log("getRecordingPID error: "+ err);
      recState.recordings[x].err=constants.REC_PID_ERR
      procStatus.text = "getRecordingPID error"
    }
  },
  this.doRenderRadio = function (res){
    res.render('pages/radioStation', {pageInfo:pageInfo,dat:getfuncRadioVar("stationCount",-1), 
    search:getfuncRadioVar("searchtxt",0), 
    btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
    rd:radioFound,
    pState:procStatus,rec:getRadioRec(), 
    settings:settings, 
    vol:volumeAudioOut,
    settings:settings, 
    play:radioPlayIndex
    });

  },
  this.doRender = async function(url,res,select){
    if (select === "history"){
      var i=0; for (i in history.button){
        if (history.button[i].url === url) {
          break;
        }
      }
      console.log("i=" + i + " pid=" + history.button[i].pid)
      let d = await getRadioRecords()
      res.render('pages/radioFavorites', {pageInfo:"My Radio", 
        btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
        pState:procStatus,
        rh:history,
        bRec:getRadioRec(),
        settings:settings,
        vol:volumeAudioOut,settings:settings,
        play:radioPlayIndex,
        radioDirs:d,currentRadioDir:"",
        basetracks:""
      });
      return
    }

    res.render('pages/radioStation', {pageInfo:pageInfo,dat:stationCount, 
      search:radioUserSearch, rd:radioFound,
      btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), //steht oben rechts im HTML Header wenn != 0
      pState:procStatus, //steht unten im HTML footer
      rec:getRadioRec(), //steuert Farbe des "Start recording" Buttons (max.5)
      vol:volumeAudioOut,settings:settings,
      play:radioPlayIndex
    }); 
  },
  this.killRecPID = async function(idx,select,res){
    try{
      if (idx === null){
        console.log("killRecPID idx Error " + idx)
        return
      } 
      var pidStr="0"
      var recIndex
      if (select === "list") {
        //idx entspricht radioSearch[i].url und radioRec Index
        var i=-1
        for (r in recState.recordings){
          if (recState.recordings[r].url === radioSearch[idx].url){
            i=r
            break
          }
        }
        if (i < 0) return
        //tell recordUrl() not to use error in recState! 
        recState.recordings[i].err = constants.REC_KILL_ERR
        pidStr = recState.recordings[i].pid
        recIndex=i
      } else {
        if (select === "history") {
          //idx entspricht buttNum Index
          if (idx <= history.button.length){
            for (r in recState.recordings){
              if (history.button[idx].url === recState.recordings[r].url){
                if (recState.recordings[r].rec === "false") return
                else {
                  pidStr=recState.recordings[r].pid 
                  recIndex = r
                  break
                }
              }
            }
          }else{
            console.log("killRecPID idx history Error " + idx)
          }
        }else {
          //idx entspricht pid string
          for (r in recState.recordings){
            if (recState.recordings[r].pid === idx){
              recIndex = r
            }
          }
          pidStr = idx
        }
      } 
      
      var pid = parseInt(pidStr)
      if (pid != 0){
        //console.log("kill pid=" + pid)
        await execCmd("kill " + pid)
//        await addRadioHistory(recIndex)
        await doRadioTransfer(recIndex)
        await doRenderRadio(res)
      } 
      else
        procStatus.text="killRecPID() invalid PID"
    }catch(err){
      resetRec(recIndex)
      //res....
    }
  },
  this.resetRec = function(idx){
    if (idx === "all"){
      for (var i=0; i<constants.REC_MAX_RADIO_RECORDINGS; i++){
        recState.recordings[i].rec = constants.REC_DEFAULT_REC
        recState.recordings[i].pid = constants.REC_DEFAULT_PID
        recState.recordings[i].url = constants.REC_DEFAULT_HTTP
      }
      return
    }
    recState.recordings[idx].rec = constants.REC_DEFAULT_REC
    recState.recordings[idx].pid = constants.REC_DEFAULT_PID
    recState.recordings[idx].url = constants.REC_DEFAULT_HTTP
  },
  this.killAllRec = function(){
    console.log("killAllRec PID(s):\n" + recordingPID)
    exec("sudo killall streamripper", (error, stdout, stderr) => {})
    recordingPID = ""
    resetRec("all")
  },
  this.getRadioRec = function(){
    //Vorbelegung
    for (i=0; i<constants.REC_MAX_RADIO_RECORDINGS; i++){
      radioRec[i]=false
    }
    for (var y=0; y<constants.REC_MAX_RADIO_RECORDINGS; y++) {
      if (recState.recordings[y].pid != 0){
        if (!set_radioRec(y)) 
          console.log("program error!!!!!!!!")
      }    
    }
    return radioRec
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
    await stopMusicPlay(constants.AUDIO_ALL)
    track = track.split("=")
    let cmd = ""
    //DUMMY: Audio/Video library playback disabled in this BASIS build - Radio
    //playback (Radio, My Radio) stays real, everything else just re-renders.
    if (!String(track[0] || "").match("Radio")){
      showMusicDir(rememberDB, res)
      return
    }
    try{
      if (track[0].match("Radio")){
        ext = getPrgSyntax(allTracks[track[1]])
        //show Laufleiste
        procStatus.marquee = allTracks[track[1]]
        trackIndex = track[1]
        musicDir = devMusic+"/"+rememberDB
        if (settings.mediaOut != "HTTP live streaming") {
          if (ext.match("pw-play")){
            await playTrack2AudioJack("start")
            let d = await getRadioRecords()
            res.render('pages/radioFavorites', {pageInfo:"My Radio", 
              btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
              pState:procStatus,
              rh:history,
              bRec:getRadioRec(),
              settings:settings,
              vol:volumeAudioOut,settings:settings,
              play:radioPlayIndex,
              radioDirs:d,currentRadioDir:"",
              basetracks:allTracks
            });
            return
          } else {
            cmd = ext + " " + devMusic+"/"+rememberDB +"/"+allTracks[track[1]]
            console.log(cmd)
            exec(cmd, (error, stdout, stderr) => {})
            trackIndex = track[1];
          }
        }
        else { //HTTP live streaming
          console.log(" to do !!!!!1")
        }
      }
      if (track[0].match("Audio") || track[0].match("Radio/"))// || track[0].match("Radio"))
        cmd = "ls " + devMusic + "/" + rememberDB + " >&1"
      else 
        cmd = "ls " + devADrecords + "/" + rememberDB + "/audio >&1"
      console.log(cmd)
      var stdout = await execCmd(cmd);
      if (stdout)
      {
        allTracks = stdout.split("\n");
        allTracks.pop()
        var ext = "ignore"
        if (track[1]){
          for (let i=0; i<allTracks.length; i++){
              if (await normalize(allTracks[i]) === await normalize(track[1])){
                  trackIndex = i;
                  break;
              }
          }
          console.log("found at pos " + trackIndex + ", " + track[1])
          if (track[0].match("ADrecords"))
            musicDir = devADrecords + "/" + rememberDB + "/audio";
          else
            musicDir = devMusic+"/"+rememberDB
          ext = getPrgSyntax(track[1])
        }
        if ((ext != "ignore") && !delUser){
          if (ext.match("mp4")){
              var vidsrc = musicDir
              console.log("src="+vidsrc)
              procStatus.marquee = vidsrc
              res.render('pages/showMusicWorld',{pageInfo:pageInfo,settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:allTracks, dirMain:0, indexStart:0, loc:rememberDB,vidsrc:vidsrc,vol:volumeAudioOut})         
          } 
          else 
          {
            if (settings.mediaOut.match("HTTP")){
                showMusicDir(rememberDB,res)
            }
            else { //Line out
              //show Laufleiste
              if (ext.match("pw-play")){
                await playTrack2AudioJack("start")
                procStatus.marquee = track[1]
                res.render('pages/showMusicWorld',{pageInfo:pageInfo, settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:allTracks, dirMain:0, indexStart:trackIndex, loc:rememberDB, vidsrc:"0",vol:volumeAudioOut})         
                return
              } else {
                cmd = ext + " " + musicDir +"/"+track[1]
                console.log(cmd)
                exec(cmd, (error, stdout, stderr) => {})
              }
            }
          }
        } 
        else
        { 
          //check if dir
          stdout = await execCmd("ls " + devMusic + "/" + rememberDB +" >&1")
          if (stdout){
              showMusicDir(rememberDB,res)
          } else{
            if (rememberDB.match("Radio/"))
              removeRadioSubdir(res,rememberDB)         //remove empty dir !
          }
        }
      }
      else{
        if (rememberDB.match("Radio/")) //wenn Unterverzeichns vorhanden
          removeRadioSubdir(res,rememberDB)         //remove empty dir !
        else
          showMusicDir(rememberDB,res)
      }
    }
    catch(err){
      console.log(err)
      showMusicDir(rememberDB,res)
    }
  },
  this.getAllTracks = async function (dir){
    //DUMMY: Audio/Video library browsing disabled in this BASIS build - Radio
    //directory browsing (My Radio) stays real, everything else returns empty.
    if (!String(dir || "").match(/^Radio/)) {
      allTracks = []
      return false
    }
    //list subdirs
    var cmd = "ls " + devMusic + "/" + dir + " >&1"
    console.log(cmd)
    var data = await execCmd(cmd)
    if (data){
      all = data.toString();
      //console.log(all);
      allTracks = all.split("\n");
      if (allTracks.length > 1) 
        allTracks.pop()
      trackIndex++ //um 1 erhöhen wegen Abfragemechanismus in showMusicWorld.ejs
      return true
    }
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
  this.doRadioTransfer = async function(recIndex){
    try{
      if (radioTransfer) return
      let data = ""
      data = await execCmd("ls Radio >&1")
      if (data){
        console.log("doRadioTransfer...")
        var dirs = data.split("\n"); dirs.pop()
        for (d in dirs){
          if (dirs[d]){
            var dir = dirs[d].replace(/ /g,String.fromCharCode(92,32) ) //"\ "
            dir = dir.replace(/\'/g,String.fromCharCode(92,39)) //"\'"
            dir = dir.replace(/\(/g,String.fromCharCode(92,40)) //"\("
            dir = dir.replace(/\)/g,String.fromCharCode(92,41)) //"\)"
            value = await execMoveDir("Radio/"+dir,dir)
            console.log(value)
          }
        }
        await execCmd("rm -rf Radio/*")
        resetRec(recIndex);
      }
    }catch(err){
      console.log("doRadioTransfer:" + err)
    }
  },
  this.deleteTrack = async function (res,tracks){
    //DUMMY: Audio/Video library delete disabled in this BASIS build - Radio
    //delete (My Radio) stays real, everything else just re-renders.
    if (!String(rememberDB || "").match(/^Radio/)){
      showMusicDir(rememberDB, res)
      return
    }
    const baseDir = path.resolve(devMusic, rememberDB);
    const deleteNamedTrack = async (rawName) => {
      const trackName = (rawName || "").replaceAll("🎵", "").trim();
      if (!trackName) return;

      const filePath = path.resolve(baseDir, trackName);
      if (!(filePath === baseDir || filePath.startsWith(baseDir + path.sep))) {
        console.log("deleteTrack rejected path outside target dir:", rawName);
        return;
      }

      try {
        await fsPromises.unlink(filePath);
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    };

    if (tracks.match("DeleteAudio")){
      tracks = tracks.replace("DeleteAudio ","")
      tracks = tracks.split(",")
      if (tracks.length > 0){
        await deleteNamedTrack(tracks[0]);
      }
      //check if dir empty
      let dat = await execCmd("ls " + devMusic + "/" + rememberDB +" >&1")
      if (dat){
          showMusicDir(rememberDB,res)
      } else{
        if (rememberDB.match("Radio/"))
          removeRadioSubdir(res,rememberDB)         //remove empty dir !
      }
      return
    }
    
    if (tracks.match("DeleteRadio")){
      tracks = tracks.replace("DeleteRadio ","")
      tracks = tracks.split(",")
      if (tracks.length > 0){
        for (i in tracks){
          await deleteNamedTrack(tracks[i]);
        }
      }
      showRadioDir(rememberDB.replace("Radio/",""),res)
    }
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
  this.removeRadioSubdir = async function (res, dirOverride){
    try{
      const relativeDir = (dirOverride && dirOverride.toString().trim())
        ? dirOverride.toString().trim()
        : rememberDB;
      const radioRoot = path.resolve(devMusic, "Radio");
      const targetDir = path.resolve(devMusic, relativeDir);

      if (!(targetDir === radioRoot || targetDir.startsWith(radioRoot + path.sep))) {
        console.log("removeRadioSubdir rejected non-Radio path:", relativeDir);
        return;
      }

      await fsPromises.rm(targetDir, {
        recursive: true,
        force: true,
      });

      if (res) {
        ledGreen("On")
        pageInfo = "My Radio"
        rememberDB = "Radio/Favorites"
        loadRadioHistory(res);
//        showMusicDir("Radio",res)
      }
    }
    catch(err){
      console.log(err)
    }
  },
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
  this.getRadioRecords = async function (){
    cmd = "ls " + devMusic + "/Radio >&1" 
    let d =  await execCmd(cmd)
    d=d.split("\n"); d.pop()
    return d
  },
  this.showRadioDir = async function(dir,res){
    let tracks = await getRadioDir(dir)
    tracks = tracks.split("\n"); tracks.pop()
    allTracks = tracks;
    if (tracks.length === 0){
      //delete dir
      await fsPromises.rm(path.resolve(devMusic, rememberDB), { recursive: true, force: true })
      //update History

    }
    let d = await getRadioRecords()
    console.log("radioDir="+d)
    res.render('pages/radioFavorites', {pageInfo:"My Radio", 
      btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
      pState:procStatus,
      settings:settings,
      bRec:getRadioRec(),
      vol:volumeAudioOut,settings:settings,
      play:-1,
      settings:settings,
      rh:history,
      basetracks:allTracks,
      radioDirs:d,currentRadioDir:dir
    });
  },
  this.getRadioDir = async function(dir){
    const quote = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
    let tracks = await execCmd("ls " + quote(devMusic+"/Radio/"+dir) + " >&1")
    return tracks
  },
  this.setInitialPage = async function(res){
    await loadRadioHistory("")
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
