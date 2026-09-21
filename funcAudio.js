//Discogs API
require('./funcAudioDiscogs')();
//Equalizer
require('./funcEqualizer')();
//zum speichern von versteckten Dateien
const os = require('os');
const path = require('path');
const constants = require('./defines.js');


const { exec, execSync } = require('child_process');
const { spawn } = require("child_process");

const fsPromises = require('fs/promises');
const fs = require ('fs');

global.progressInfo="";
// var oldCaptureData = "";
var allWAVSize = 0;
global.convert_ac3_active = false

//discogs
global.recAD={recordingsStop:constants.AD_RECORDING_STOPPED}
global.mp3Select={in: "", out: ""}
global.playAUX = false

global.recVideo={recording:false, title:""}
global.videoRecording = null;
global.videoView = null
global.videoAudio = null
global.videoStreamClients = new Set()


var recStoptimeID = null
var mp3Progress = {encodeStr: " ", percent: "(0%)", running: false}
var monitorLevel = " "

var loudness = []
var loudnessTimes=[]
var oldThreshold = 0
var newThreshold = 0
var oldLength = 0

var silenceTimeCnt=0
global.watchSilencePtr = 0

//gramocli => 1 block = 100ms
var gramoBlocks = []

var videoConvertInfo = []
var videoConvertInfoIndex = 0
var ffmpegDeviceInfo = null


function validateTrackData(filenamesArray, titlesObject) {
  const errors = [];
  
  // Check 1: Length match
  if (filenamesArray.length !== Object.keys(titlesObject).length) {
    errors.push(`Length mismatch: ${filenamesArray.length} files vs ${Object.keys(titlesObject).length} titles`);
    return { valid: false, errors };
  }

  // Check 2: Iterate and validate each track
  for (let i = 0; i < filenamesArray.length; i++) {
    const filename = filenamesArray[i];
    const title = titlesObject[i];
    
    if (!title) {
      errors.push(`Missing title for index ${i}`);
      continue;
    }

    // Extract track number from filename (e.g., "A1-..." → 1)
    const match = filename.match(/^[A-Z](\d+)-/);
    if (!match) {
      errors.push(`Invalid filename format: ${filename}`);
      continue;
    }

    const trackNum = parseInt(match[1]);
    const expectedIndex = trackNum - 1; // A1 → index 0
    
    if (expectedIndex !== i) {
      errors.push(`Track number mismatch at index ${i}: filename has A${trackNum} (expects A${i + 1})`);
    }

    // Check 3: Fuzzy title match (normalize and compare)
    const filenameTitle = filename
      .split('-')[1]           // Extract "BluesForSixNights.wav"
      .replace('.wav', '')     // "BluesForSixNights"
      .replace(/([A-Z])/g, ' $1')  // "Blues For Six Nights"
      .trim();
    
    const normalizedObj = title.toLowerCase().replace(/[?!]/g, '');
    const normalizedFile = filenameTitle.toLowerCase();
    
    if (normalizedObj !== normalizedFile) {
      errors.push(`Title mismatch at ${i}: file="${filenameTitle}" vs object="${title}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : ['All valid ✓']
  };
}




function getCaptureInputDevice() {
  let inputDevice = "default"
  if (usbState && usbState.usbaudiocapture) {
    const dev = String(usbState.usbaudiocapture)
    if (!dev.match("nok")) {
      inputDevice = "plughw:" + dev
    }
  }
  return inputDevice
}

function getFfmpegDeviceInfo() {
  if (ffmpegDeviceInfo !== null) {
    return ffmpegDeviceInfo
  }
  try {
    ffmpegDeviceInfo = execSync("ffmpeg -hide_banner -devices 2>/dev/null", { encoding: "utf8" })
  } catch (err) {
    ffmpegDeviceInfo = ""
  }
  return ffmpegDeviceInfo
}

function ffmpegHasInputDevice(name) {
  const info = getFfmpegDeviceInfo()
  return info.match(new RegExp("\\\\b" + name + "\\\\b"))
}

function getCaptureCommands(outFile) {
  const inputDevice = getCaptureInputDevice()
  const commands = {
    recordCmd: "",
    backend: "arecord"
  }

  if (ffmpegHasInputDevice("pulse")) {
    commands.recordCmd = "ffmpeg -f pulse -i default -ar 44100 -ac 2 -f wav " + outFile
    commands.backend = "ffmpeg-pulse"
    return commands
  }

  if (ffmpegHasInputDevice("alsa")) {
    commands.recordCmd = "ffmpeg -f alsa -i " + inputDevice + " -ar 44100 -ac 2 -f wav " + outFile
    commands.backend = "ffmpeg-alsa"
    return commands
  }

  // Fallback when ffmpeg lacks Pulse/ALSA input support: record directly via arecord.
  commands.recordCmd = "arecord -D " + inputDevice + " -f S16_LE -r 44100 -c 2 -t wav " + outFile
  return commands
}

function getLoudnessCommand(captureBackend) {
  // Preferred: this command is verified to work reliably on this system.
  if (ffmpegHasInputDevice("pulse")) {
    return "/usr/bin/ffmpeg -hide_banner -nostdin -f pulse -i default -af ebur128 -f null - 2>ad/lautheit.log"
  }

  const inputDevice = getCaptureInputDevice()

  if (captureBackend === "ffmpeg-alsa") {
    return "/usr/bin/ffmpeg -hide_banner -nostdin -f alsa -i " + inputDevice + " -af ebur128 -f null - 2>ad/lautheit.log"
  }

  // No compatible ffmpeg live input backend available for loudness monitoring.
  return ""
}

async function ensureLoudnessLog(file) {
  try {
    try {
      const st = await fsPromises.stat("ad/lautheit.log")
      if (st.size > 0) {
        return true
      }
    } catch (err) {}

    console.log("ensureLoudnessLog: generate from " + file)
    await execCmd("/usr/bin/ffmpeg -hide_banner -nostdin -i " + file + " -af ebur128 -f null - 2>ad/lautheit.log")

    const st2 = await fsPromises.stat("ad/lautheit.log")
    return st2.size > 0
  } catch (err) {
    console.log("ensureLoudnessLog failed: " + err)
    return false
  }
}


function timeToMs(t) {
  const [h, m, s] = t.split(":");
  const [sec, ms] = s.split(".");
  return (
    parseInt(h) * 3600000 +
    parseInt(m) * 60000 +
    parseInt(sec) * 1000 +
    parseInt(ms)
  );
}

/*
Ein Track muß >= 60sec sein: min_track_blocks = 600
a) suche „trackCount“ Ruhezeiten über „“ffmpeg“ : cut Anfangsruhezeit, Enderuhezeit (wenn > 5s)
b) gramocli: wenn „trackCount“ gefunden wurde, check Durations zwischen den Tracks (Bedingung < 10s)
c) wenn „trackCount nicht gefunden wurde: benutze den 2ten Threshold für die Bedingung „trackCount-1“
d) check Aufnahmedauer mit Ende des letzten Tracks, wenn Aufnahmedauer > 30s ab Ende des letzten Tracks, modify: add last Track
d) Modify all.wav.tracks wenn (StartTrackx+1) - (EndTrackx) > 60s: Inject!
e) gramocli mit modifiziertem „all.wav.tracks“ starten
*/
async function processWav(){
  clearInterval(watchSilencePtr)
  console.log("processWav...")
  recAD.evaluatedState = constants.REC_START_ANALYZER
  SSEIntervalTyp = constants.SSE_PROCESS_WAV

  if (recAD.medium != "AUX"){
    if (!discogsResult.sideA[0] && !discogsResult.sideB[0] && 
      !discogsResult.sideC[0] && !discogsResult.sideD[0]&&
      !discogsResult.sideE[0] && !discogsResult.sideF[0]){
      setAudioCaptureInfo(" - WARNING! NO tracknames found!")
    }else{
      //Anzahl Tracks speichern für die Plattenseite
      //Boolean removes:"",null,undefined,0,false
      switch(recAD.side){
        case 'A': recAD.trackCount = Object.values(discogsResult.sideA).filter(Boolean).length; 
                  adjustRenameState.discSide = Object.values(discogsResult.sideA).filter(Boolean)
                  break;
        case 'B': recAD.trackCount = Object.values(discogsResult.sideB).filter(Boolean).length; 
                  adjustRenameState.discSide = Object.values(discogsResult.sideB).filter(Boolean)
                  break;
        case 'C': recAD.trackCount = Object.values(discogsResult.sideC).filter(Boolean).length; 
                  adjustRenameState.discSide = Object.values(discogsResult.sideC).filter(Boolean)
                  break;
        case 'D': recAD.trackCount = Object.values(discogsResult.sideD).filter(Boolean).length; 
                  adjustRenameState.discSide = Object.values(discogsResult.sideD).filter(Boolean)
                  break;
        case 'E': recAD.trackCount = Object.values(discogsResult.sideE).filter(Boolean).length; 
                  adjustRenameState.discSide = Object.values(discogsResult.sideE).filter(Boolean)
                  break;
        case 'F': recAD.trackCount = Object.values(discogsResult.sideF).filter(Boolean).length;
                  adjustRenameState.discSide = Object.values(discogsResult.sideF).filter(Boolean)
                  break;
        default:  recAD.trackCount = 1
                  adjustRenameState = ""
      }
      if (adjustRenameState.discSide.length > 1) {
        for (let i=0; i<adjustRenameState.discSide.length; i++){
          adjustRenameState.discSide[i] = recAD.side+(i+1)+"-"+await cleanFilenameNoPromise("",adjustRenameState.discSide[i])
        }
      }
    }
  }
  /*
Usage: ./gramocli -i <infile.wav> -s <100..600> -f <filter0 filter1 ..> -p <0|1|2> -o <out.wav>]
     <filter>
     0 - simple median filter
     1 - simple mean filter
     2 - conditional median filter
     3 - double median filter
     4 - conditional median filter II
     5 - RMS filter
     -p Option:
     0 - process split: generate all.tracks.wav only
     1 - process:split with user's all.wav.tracks than start filter process
     2 - process split: generate all.tracks.wav than start filter process
  */
  try {
    progressInfo = " "
    oldCaptureData = " ";
    await setAudioCaptureInfo(" - check peaks ")
    let spikes = await checkSpikes()
    if (spikes > constants.MAX_PEAKS){
      console.log(" zu viele Übersteuerungen detektiert: "+spikes)
      stopLautheit(" zu viele Übersteuerungen detektiert: "+spikes)
      return
    }
    await setAudioCaptureInfo(" - splitting tracks ")
    await checkContinuesSilence(-30)
    var threshold = constants.SILENCE_FACTOR_INIT
    recAD.oldTrackCount=0
    recAD.number_of_tracks=0
    let success = 0; 
    for (let i=0; i<20; i++){
      //generate all.tracks.wav only
      let cmd = "./gramocli -i ad/all.wav -s "+threshold+" -f 0 -p 0 -o ad/song.wav"
      console.log(cmd)
      await startGramocli(cmd)
      success = await checkGramoTracks()
      await setAudioCaptureInfo(" - found "+recAD.number_of_tracks+" of "+ recAD.trackCount)
      console.log(" - found "+recAD.number_of_tracks+" of "+ recAD.trackCount)
      if(success) 
        break;
      if (recAD.number_of_tracks < recAD.oldTrackCount) {
        threshold -=50
        await startGramocli("./gramocli -i ad/all.wav -s "+threshold+" -f 0 -p 0 -o ad/song.wav")
        success = await checkGramoTracks()
        await setAudioCaptureInfo(" - found "+recAD.number_of_tracks+" of "+ recAD.trackCount)
        break;
      }
      threshold+=50
      if (threshold > constants.SILENCE_FACTOR_MAX)
        break;
      recAD.oldTrackCount = recAD.number_of_tracks
    }
    if (!success && recAD.medium != "AUX"){
      /*-----------d e e p S p l i t---------------------------------*/
       await setAudioCaptureInfo(" - start deepSplit ")
      if (!await getGramoTracks()){
        initiateRecEnd("No track in all.wav.tracks")
        return
      }
      if (!await deepSplit()){
        if (recAD.medium != "AUX"){
          if (!recAD.type.match("33rpm") && (adjustRenameState.discSide.length > 1)){
            //single, ignore previous result
            adjustRenameState.discSide.pop()
            recAD.trackCount = adjustRenameState.discSide.length
          } else{
            initiateRecEnd(" deepSplit failed!")
            return
          }
        }
      }
      await generateNewTrackBlocks()
      //all.wav.tracks muss vorhanden sein!
      cmd = "./gramocli -i ad/all.wav -s " + threshold + " -f 0 -p 1 -o ad/song.wav > ad/o.txt"
      console.log(cmd)
      await execCmd(cmd)
      await saveNumOfTracks()
      await setAudioCaptureInfo(" - found "+recAD.number_of_tracks+" of "+ recAD.trackCount)
      await workOnTracks() //vol adjust, renaming, moving..
    }
    else{
      if (!success && recAD.medium === "AUX"){
        //CD Lesefehler nicht korrigierbar

        return
      }
      console.log("split with given all.wav.tracks, start filter process")
      cmd = "./gramocli -i ad/all.wav -s " + threshold + " -f 0 -p 1 -o ad/song.wav > ad/o.txt"
      console.log(cmd)
      await execCmd(cmd)
      SSEIntervalTyp = constants.SSE_ADJUST_RENAME
      await setAudioCaptureInfo(" - all Tracks found, work on tracks ")
      await workOnTracks() //vol adjust, renaming, moving..
    }
  }catch (err) {
    try {
      await fsPromises.stat("ad/o.txt")
      let result = await execCmd("cat ad/o.txt | grep 'sucessful'")
      if (result) {
        await execCmd("rm ad/o.txt")
        await workOnTracks() //vol adjust, renaming, moving..
        return
      }else console.log("gramocli error..")
    } catch (statErr) {}
    initiateRecEnd(" "+err)
  }
}


async function processTapeWav(){
  console.log("processTapeWav...")
  SSEIntervalTyp = constants.SSE_PROCESS_WAV
  /*
  Usage: ./gramocli -i <infile.wav> -s <100..600> -f <filter0 filter1 ..> -p <0|1|2> -o <out.wav>]
     <filter>
     0 - simple median filter
     1 - simple mean filter
     2 - conditional median filter
     3 - double median filter
     4 - conditional median filter II
     5 - RMS filter
     -p Option:
     0 - process split: generate all.wav.tracks only
     1 - process:split with user's all.wav.tracks than start filter process
     2 - process split: generate all.wav.tracks than start filter process
  */
  try {
    console.log("Analyzer active, wait...")
    progressInfo = " "
    oldCaptureData = " ";
    await setAudioCaptureInfo(" - cutting silence end")
    await cutSilenceEnd("ad/allTape.wav")
    await setAudioCaptureInfo(" - splitting tracks")
    cmd = "./gramocli -i ad/allTape.wav -s 300 -f 0 -p 2 -o ad/song.wav"
    console.log(cmd)
    var datum = await startGramocli(cmd)
    console.log("gramocli finished: " + datum)
    await saveNumOfTracks()
    if (recAD.number_of_tracks == 0){
      await execCmd("lame -b 320 --disptime 2 --nohist ad/allTape.wav")
      let cmd = "mv ad/allTape.mp3 "+devMusic+"/Audio/"+recAD.tapename+".mp3"
      console.log(cmd)
      await execCmd(cmd)
    }
    else 
      await songRecognitionProcess()
    setTimeout(initiateRecEnd,4000, "see Audio for "+ recAD.tapename+"*")
  }catch (err) {
    
    if (String(err).match("allTape.wav.tracks")) {
      await cutSilenceEnd("ad/allTape.wav")
      await execCmd("lame -b 320 --disptime 2 --nohist ad/allTape.wav")
      let cmd = "mv ad/allTape.mp3 "+devMusic+"/Audio/"+recAD.tapename+".mp3"
      console.log(cmd)
      await execCmd(cmd)
   }
   initiateRecEnd(" "+err)
  }
}


async function saveAllTape(){
  try{  
      await execCmd("lame -b 320 --disptime 2 --nohist ad/allTape.wav")
      await execCmd("mv ad/allTape.mp3 "+devMusic+"/Audio/"+recAD.tapename+".mp3")
      await execCmd("rm ad/*; rm ad_copy/*")
      initiateRecEnd(" 10s silence detected, initiate recording stop")  }
  catch(err){
    console.log("saveAllTape() - " + err)
    initiateRecEnd("saveAllTape() - " + err)  
  }
}

async function saveNumOfTracks(){
  recAD.number_of_tracks = 0
  try {
    let fn = "ad/all.wav.tracks"
    if (recAD.medium.match("Tape")) fn = "ad/allTape.wav.tracks" 
    var result = await execCmd("cat "+fn+" | grep Number_of_tracks >&1")
    if (result){
      result = result.split("=")
      recAD.number_of_tracks = Number(result[1])
    }
  }
  catch(err){
    console.log("saveNumOfTracks " + err)
  }
}



function startGramocli(cmd){
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {  
      //Command failed kommt auch dann, wenn gramocli ordentlich beendet wurde..hier sollte / muss gramocli nachgebessert werden
      let fn = "ad/all.wav.tracks"
      if(recAD.medium.match("Tape")) fn = "ad/allTape.wav.tracks"
      exec("ls "+fn+" >&1", (error, stdout, stderr) => {
            if (!stdout.match(fn))
            reject("Error command failed: no "+fn)
          else  
            resolve("ok")
      })
    })
  })
}


module.exports = function(required){
  this.killVideoCapture = function(){
    if (videoView) {
      const old = videoView;
      videoView = null; // sofort nullen, damit req.on("close") ins Leere läuft
      old.kill("SIGINT");
    }
    if (videoAudio) {
      const old = videoAudio;
      videoAudio = null; // sofort nullen, damit req.on("close") ins Leere läuft
      old.kill("SIGINT");
    }
    if (videoRecording) {
      videoRecording.stdin.write("q");
      const old = videoRecording;
      videoRecording = null; // sofort nullen, damit req.on("close") ins Leere läuft
      old.kill("SIGINT");
    }
  },
  this.killplayAux = async function (){
      exec("pkill pw-loopback",(err, stdout, stderr) => {})
      playAUX = false
      await setLineOutMute(false)
  },
  //eq10 wird bei playAudioCapture immer physisch auf die Hardware geroutet (Aux-Passthrough).
  //Im HTTP-Modus kommt zusätzlich der Browser-Stream (/captureStream) dazu, damit beide nicht
  //gleichzeitig hörbar sind wird hier der physische Line-Out stumm-/freigeschaltet.
  this.setLineOutMute = async function(mute){
    try{
      //eq10's Ziel-Hardwaresink ist je nach Board/PipeWire-Konfiguration nicht immer eindeutig
      //(siehe node.target in filter/conf/pipewire/tonboxFilter.conf, kann vom tatsächlich
      //aktiven Sink abweichen), daher werden hier vorsichtshalber alle physischen ALSA-Sinks
      //gemutet/entmutet; eq10 selbst (der virtuelle EQ-Sink) bleibt unberührt.
      let sinks = await execCmd("pactl list short sinks");
      for (let line of sinks.split("\n")) {
        if (line.includes("alsa_output")) {
          let sink = line.split(/\s+/)[1];
          await execCmd("pactl set-sink-mute " + sink + " " + (mute ? "1" : "0"))
          console.log("setLineOutMute(" + mute + ") -> " + sink)
        }
      }
    }catch(err){
      console.log("setLineOutMute:" + err)
    }
  },
  this.playAudioCapture = async function(res){
    await checkUsbAudioCapture()
    try{
      if(playAUX){ //toggle wenn EIN dann AUS
        // stopMusicPlay(constants.AUDIO_ALL) //mpv etc.
        exec("pkill pw-loopback",(err, stdout, stderr) => {})
        playAUX = false
        await setLineOutMute(false)
        if (res)
          return setInitialPage(res);
        return
      }
      let sources = await execCmd("pactl list short sources");
      let source = null;
      for (let line of sources.split("\n")) {
          if (line.includes("alsa_input.usb") &&
              !line.includes("Webcam") &&
              !line.includes(".monitor")) 
          {
              source = line.split(/\s+/)[1];
              break;
          }
      }
      if (!source){ 
        if (res)
                res.render('pages/playAudioCapture', {pageInfo:pageInfo,
          btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
          pState: procStatus, rec: getRadioRec(),
          settings:settings,
          vol: volumeAudioOut,
      });

//          return setInitialPage(res);
        return
      }

      //Wenn AUS dann EIN
      await stopMusicPlay(constants.AUDIO_ALL) //mpv etc.
      playAUX = true
      /*
                        mpv
                        │
      USB-Mikrofon ──► pw-loopback
                        │
                        ▼
                      eq10 (Standard-Sink)
                        │
                        ▼
                      DAC        
      */
      let cmd = "pw-loopback --capture " + source +" --playback eq10"
      console.log(cmd)
      execCmd(cmd)
      ledGreen("Off")
      //HTTP-Modus: nur der Browser-Stream (/captureStream) soll hörbar sein, Line-Out stumm.
      //Line-Out-Modus: wie gehabt über die Hardware hörbar.
      await setLineOutMute(settings.mediaOut && settings.mediaOut.match("HTTP") ? true : false)
      if (res)
      res.render('pages/playAudioCapture', {pageInfo:pageInfo,
          btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
          pState: procStatus, rec: getRadioRec(),
          settings:settings,
          vol: volumeAudioOut,
      });
    } catch(err) {
        console.log(err);
        procStatus.text = err.toString();
        if (res)
          setInitialPage(res);
    }
  },
  this.checkAllWav = function(){
    return new Promise((resolve, reject) => {
      fs.stat('ad/all.wav',(err, stat) => {
        if (err) {
          procStatus.text = "sendConversionStatus, ad/all.wav doesn't exist " + err;
          console.log(procStatus.text);
          // reject(err)
          resolve("ok") //Antwort zum client muss trotzdem gesendet werden
        } else{
          var wavSize = stat.size / 1024 / 1024; // MB
          var wavTime = wavSize / constants.AD_MIB_MIN_STEREO;

          setAudioCaptureInfo(
              " - all.wav - Size=" + wavSize.toFixed(2) +
              " MB, Time=" + wavTime.toFixed(2) + " min"
          );
          procStatus.text = "done";
          resolve("ok")
        }
      })
    })
  },
  this.sendCaptureStatus = async function(res){
    try{
      await checkAllWav()
      res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:getAudioCaptureSize(),audioInfo:progressInfo,discogs:discogsResult, pside:recAD.side, userSave:adjustRenameState.userCheck, getPara:false,  vol:settings.jackVolume, settings:settings})
    }catch(err){
      console.log(err)
      res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:err + " " + getAudioCaptureSize(),audioInfo:progressInfo,discogs:discogsResult, pside:recAD.side, userSave:adjustRenameState.userCheck, getPara:false,  vol:settings.jackVolume, settings:settings})
    }
  },
  this.startConversion = function(){
    let cmd = "mv -f ad/* ad_copy/.; rm -f ad/.*;"
    if (recAD.medium != "CD"){
      //start continues loudness detetection metering thru recording
      cmd += "/usr/bin/ffmpeg -f pulse -i default -af ebur128 -f null - 2>ad/lautheit.log"
    }
    console.log(cmd)
    exec(cmd, (error, stdout, stderr) => {})

    //recording with ffmpeg
    let fn = "ad/all.wav"
    if (recAD.medium.match("Tape")) 
      fn = "ad/allTape.wav"
    recAD.recordingStop = constants.AD_RECORDING_ACTIVE
    //exec("ffmpeg -i input.mp3 -codec:a libmp3lame -b:a 192k -write_xing 1 output.mp3", (error, stdout, stderr) => {})
    exec("/usr/bin/ffmpeg -f pulse -i default -ar 44100 -ac 2 -f wav "+fn, (error, stdout, stderr) => {
      if (error) {
         //wenn process gekilled wird 
        if (recAD.recordingStop==constants.AD_RECORDING_STOP_IN_PROCESS){
          console.log("conversion stopped\n" + error.message);
          //read file status
          fs.stat(fn,(err, stat) => {
            if (err) {
              console.log("startConversion, "+fn+" doesn't exist " + err)
            } else {
              setAudioCaptureInfo(" - recording stopped. Size: " + stat.size.toString() + "bytes");
              console.log(progressInfo);
              recAD.recordingStop = constants.AD_RECORDING_STOPPED;
            }
          })
        } else{
          if (recAD.recordingStop == constants.AD_RECORDING_STOPPED){
            console.log("recordingStop"+error);
            procStatus.text = "start A/D Conversion error, missing USB input?"
          }
          else  
            console.log("startConversion(): " + error.message);
        }
        return
      } 
      if (stderr) {
        if (recAD.recordingStop == constants.AD_RECORDING_STOPPED){
          console.error(`start Conversion stderr: ${stderr}`);
          procStatus.text = "start Conversion error, missing USB input?"
          return
        }
      }
      console.log("start conversion via USB audio capture device - ",cmd);
    })
    setTimeout(startLautheit,4000)
  },
  this.getAudioCaptureSize = function(){
    //wait 'til recording process generated the "all.wav" file
    setTimeout(getAllSize,1000)
    //return the old value 
    return allWAVSize;
  },
  this.getAllSize = async function(){
    let fn = "ad/all.wav"
    if (recAD.medium && recAD.medium.match("Tape")) 
      fn = "ad/allTape.wav"
    fs.stat(fn,(err, stat) => {
      if (err) return "getAllSize ad/all*.wav doesn't exist"
      let MB = stat.size / 1024 /1024
      allWAVSize = " Size=" + MB.toString() + " MB";
    })
  }
  this.stopAudioRecording = function(){
    stopADconversion()
    initiateRecEnd(".. stop received")
    console.log("received stop recording.. ")
    if (recAD.medium === "Tape"){
      if (what.match("Tape")){
        progressInfo = ""
        processTapeWav() //ends also SSE
        return
      } 
      // if (recAD.silenceDetection){
        saveAllTape()
      //   return
      // }
    }
    startWavAnalyzer()
  },
  this.stopADconversion = async function(){
    if (!recAD)
      SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
    else 
      SSEIntervalTyp = constants.SSE_INACTIVE
    console.log("log=" + SSEIntervalTyp)
    exec("sudo killall ffmpeg 2>/dev/null; sudo killall arecord 2>/dev/null; sudo killall cdparanoia 2>/dev/null", (error, stdout, stderr) => {})  
    //stopping the recording process comes back as an error in "startConversion"
    recAD.recordingStop=constants.AD_RECORDING_STOP_IN_PROGRESS; 
    progressInfo = "A/D conversion stopped"
    procStatus.text = progressInfo;
    procStatus.stat &= ~constants.PROC_STAT_DIGI_ON;
    if (recStoptimeID) clearTimeout(recStoptimeID)
    generateCoverImg("")
  },
  this.startWavAnalyzer = function(){
    console.log("startWavAnalyzer...")
    fs.access("ad/all.wav", fs.constants.R_OK, (err) => {
      if(err){
        procStatus.text = "startWavAnalyzer ad/all.wav doesn't exist, access problem"
        console.log(procStatus.text)
        discogsResult.state = constants.DISCOGS_RESULT_STATE_EMPTY
      }
      else{
        processWav()
      }
    })
  },
  this.audioCapture = async function(res){
    await checkUsbAudioCapture()

    if (usbState.usbaudiocapture === constants.USB_NOK)
      procStatus.text="USB audio capture device not found";
    checkAllWav(res)
  },
  this.audioMP3Capture = function(){
    progressInfo = "no mp3"
    cmd = "ls ad/*.mp3 >&1"
    exec(cmd, (error, stdout, stderr) => {
        progressInfo = stdout
    });
  },
  this.setAudioCaptureInfo = async function(txt){
    //txt darf keine Sonderzeichen enthalten, da ".match(...)" regular expression nutzt
    //SSE Prozess-Ausgabe wird nicht visualisiert, wenn linefeed gesendet wird
    txt.replace(/"\n"/g, " ")
    if (recAD.medium === "AUX"){
      //damit keine Info verloren geht, falls all.wav sehr kurz ist
      if (setSSEIntervalPtr) cdInfo.status = txt
      else cdInfo.status += " " + txt
      return
    }
    //damit keine Info verloren geht, falls all.wav sehr kurz ist
    if (setSSEIntervalPtr) progressInfo = txt
    else progressInfo += (" " + txt)
  },
  this.resetAD = function(){
    exec("mv ad/all.wav ad/x.x; rm public/images/image*.*; rm ad/all.*; rm ad/*.wav; mv ad/x.x ad/all.wav; rm upload/* 2>/dev/null", (error, stdout, stderr) => { })
  },
  //convert WAV to MP3 and save in ../mediaServer/Music/Audio
  this.wav2mp3 = function(res){
    if (mp3Select.in && mp3Select.out && !mp3Progress.running){
      console.log("start converting " + mp3Select.in + " to mp3, wait...")

      //---------------------
      if (SSEIntervalTyp.match(constants.SSE_NONE_CLEAR_INTERVAL)){
        SSEIntervalTyp = constants.SSE_WAV2MP3;
      }
      //---------------------

      //redirect stderr to stdout, "tee" to redirect to a file and the screen.
      var cmd = "lame -b 320 --disptime 2 --nohist " + mp3Select.in + " --out-dir /tmp 2>&1 | tee help/lame.txt"
      mp3Progress.running = true
      exec(cmd, (error, stdout, stderr) => {
        if (error){
          console.log("lame error, " + error)
          mp3Progress.running = false
          res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:"convert to mp3 failed, possible no WAV file found",audioInfo:progressInfo,discogs:discogsResult, recAD: recAD, userSave:adjustRenameState.userCheck, getPara: false,  vol:settings.jackVolume, settings:settings})
          return
        }
        // if (stderr) { //if done !
          console.error(`wav2mp3: ${stderr}`);
          procStatus.text = "done"
          console.log("stdout=" + stdout);
          console.log("converting WAV to MP3 done")

          SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL;

          exec("mv /tmp/*.mp3 " + mp3Select.out, (error, stdout, stderr) => {
            mp3Progress.running = false
          })
        // }
      }); 
    }else console.log("no file selected or still running")
    res.render('pages/showADrecords',{pageInfo:pageInfo, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:allTracks, dir:0, baseimages:allCovers,settings:settings,indexStart:0,vol:volumeAudioOut, })         
  },
  this.checkVolume = function(dat){
    return new Promise((resolve, reject) => {
      var leftDB, rightDB, maxDBleft, maxDBright;
      cmd = "ffmpeg -hide_banner -i ad/left.wav -filter:a volumedetect -f null /dev/null"
      exec(cmd, (error, stdout, stderr) => {
        if (error){
          console.log("check volume left, " + error)
          setAudioCaptureInfo(" - check volume left, " + error)
          dat.maxDBleft=0
          dat.maxDBright=0
          reject(error)
        }else{
          leftDB = getffmpeg(stderr,"mean_volume: ")
          maxDBleft = getffmpeg(stderr,"max_volume: ")
        }
        cmd = "ffmpeg -hide_banner -i ad/right.wav -filter:a volumedetect -f null /dev/null"
        exec(cmd, (error, stdout, stderr) => {
          if (error){
            console.log("check volume right, " + error)
            setAudioCaptureInfo(" - check volume right, " + error)
            dat.maxDBleft=0
            dat.maxDBright=0
            reject(error)
          }else{
            rightDB = getffmpeg(stderr,"mean_volume: ")
            maxDBright = getffmpeg(stderr,"max_volume: ")
          }
          //check extrem scratches
          if(maxDBright > -1.0){
            if (rightDB < -21.0)
              maxDBright=-21-(rightDB)
            else
              maxDBright = 0
          }
      
          if(maxDBleft > -1.0){
            if (leftDB < -21.0)
              maxDBleft=-21-(leftDB)
            else
              maxDBleft = 0
          }     
          dat.maxDBleft=maxDBleft
          dat.maxDBright=maxDBright
          resolve()     
        })
      })
    })
  },
  this.adjustTrackVolume = async function(filename){
    try{
      var vol = ""
      //1 split channels
      console.log("adjustTrackVolume process " + filename)
      //setAudioCaptureInfo(" adjust volume: split stereo channels of " + filename)
      cmd = "ffmpeg -hide_banner -i ad/" + filename + " -filter_complex '[0:a]channelsplit=channel_layout=stereo:channels=FL[left]' -map '[left]' -y ad/left.wav; \
      ffmpeg -hide_banner -i ad/" + filename + " -filter_complex '[0:a]channelsplit=channel_layout=stereo:channels=FR[right]' -map '[right]' -y ad/right.wav"
      console.log(cmd)
      await execCmd(cmd)
      //2 check volume
      let channelVol = {maxDBleft:0,maxDBright:0}
      await checkVolume(channelVol)//object is pointer!
      //3 eventually increase volume of channels
      if (channelVol.maxDBleft){
        console.log(" increase channel left " + Math.abs(channelVol.maxDBleft) + "dB, channel right " + Math.abs(channelVol.maxDBright)) + "dB of " + filename
        vol = "volume=" + Math.abs(channelVol.maxDBleft) + "dB"
        cmd = "ffmpeg -hide_banner -i ad/left.wav -filter:a " + "'" + vol + "' -y ad/left++.wav"
        await execCmd(cmd)
      }
      if (channelVol.maxDBright){
        await setAudioCaptureInfo(" - increase volume right:" + Math.abs(channelVol.maxDBright) + "dB & left:" + Math.abs(channelVol.maxDBleft) + "dB - ")
        vol = "volume=" + Math.abs(channelVol.maxDBright) + "dB"
        if (vol.match("NaN")) vol = "volume=0dB" //something went wrong !?
        cmd = "ffmpeg -hide_banner -i ad/right.wav -filter:a " + "'" + vol + "' -y ad/right++.wav"
        await execCmd(cmd)
      }
      //4 merge 2 mono tracks back to stereo
      cmd = 'ffmpeg -i ad/left++.wav -i ad/right++.wav -filter_complex "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]" -map "[a]" -y ad/' + filename
      await execCmd(cmd)
      console.log("Volume of " + filename + " increased")
      await execCmd("rm ad/right*; rm ad/left*")
      if (adjustRenameState.current >= 10)
        var filename = "song"+(adjustRenameState.current).toString()+".wav"
      else
        var filename = "song0"+(adjustRenameState.current).toString()+".wav"
      return true
    }catch(err) { 
      initiateRecEnd("!"+err)
      return false
    }
  },
  this.renameVinylTrack = async function(increment){
      if (increment) adjustRenameState.current++
      if (adjustRenameState.current > 1){
        if (adjustRenameState.current <= recAD.number_of_tracks)
        {
          var trackname = "song0"+(adjustRenameState.current).toString()+".wav"
          let result = false
          result = await adjustTrackVolume(trackname)
          if (!result)
            console.log("failed at adjustTrackVolume")
          let cmd = "mv ad/"+trackname + " ad/"+adjustRenameState.discSide[adjustRenameState.current-1]+".wav"
          console.log(cmd)
          await execCmd(cmd)
          await renameVinylTrack(true)
        }else{
          if (adjustRenameState.current > recAD.trackCount)
          {
            if (!await saveADrecords("vinyl"))    
              initiateRecEnd(" - "+procStatus.text)
            else
              initiateRecEnd(" saved in ADrecords")  
          }
          else{
            console.log("- nicht gespeichert")
            initiateRecEnd(progressInfo + " end Rename tracks, do not save")
           }
        }
      }else{
        adjustRenameState.discTracks = recAD.trackCount
        if (recAD.trackCount > 1){
          adjustRenameState.current = 1 //init
          var trackname = "song0"+(adjustRenameState.current).toString()+".wav"
          await adjustTrackVolume(trackname)
          let cmd = "mv ad/"+trackname + " ad/"+adjustRenameState.discSide[adjustRenameState.current-1]+".wav"
          await execCmd(cmd)
          await renameVinylTrack(true) //rekursive call
        }
        else{
          var trackname = "song.wav"
          await adjustTrackVolume(trackname)
          adjustRenameState.discSide[adjustRenameState.current] = await cleanFilenameNoPromise("", adjustRenameState.discSide[adjustRenameState.current]);
          let cmd = "mv ad/"+trackname + " ad/"+adjustRenameState.discSide[adjustRenameState.current]+".wav"
          console.log(cmd)
          try{
            await execCmd(cmd)
          }catch(err){
            console.log(err)
            procStatus.text = "renameVinylTrack, " + err
            initiateRecEnd("renameVinylTrack, " + err)
            return
          }
          if (!await saveADrecords("vinyl"))    
            initiateRecEnd(" - "+procStatus.text)
          else
            initiateRecEnd(" saved in ADrecords")
        }
      }
  },
  this.renameCDtracks = async function(increment){
    if (increment) adjustRenameState.current++
    var trackname =""
    if (adjustRenameState.current > 1){
      if (adjustRenameState.current <= recAD.number_of_tracks)
      {
        if (adjustRenameState.current <= 9)
          trackname = "song0"+(adjustRenameState.current).toString()+".wav"
        else           
          trackname = "song"+(adjustRenameState.current).toString()+".wav"

        let result = false
        result = await adjustTrackVolume(trackname)
        if (!result)
          console.log("failed at adjustTrackVolume")
        let cmd = "mv ad/"+trackname + " ad/"+escapeTrack(cdInfo.tracks[adjustRenameState.current-1].title+".wav")
        console.log(cmd)
        await execCmd(cmd)
        await renameCDtracks(true)
      }else{
        if (adjustRenameState.current > recAD.trackCount)
        {
          if (!await saveADrecords("CD"))    
            initiateRecEnd(" - "+procStatus.text)
          else
            initiateRecEnd(" saved in ADrecords")  
        }
        else{
          console.log("- nicht gespeichert")
          initiateRecEnd(progressInfo + " end Rename tracks, do not save")
          }
      }
    }else{
      adjustRenameState.current = 1 //init
      var trackname = "song0"+(adjustRenameState.current).toString()+".wav"
      await adjustTrackVolume(trackname)
      let cmd = "mv ad/"+trackname + " ad/"+escapeTrack(cdInfo.tracks[adjustRenameState.current-1].title+".wav")
      console.log(cmd)
      await execCmd(cmd)
      await renameCDtracks(true) //rekursive call
    }
  },
  this.adjustVolume = function(filename){
    //1 split channels
    console.log("adjustVolume " + filename)
    cmd = "ffmpeg -hide_banner -i ad/" + filename + " -filter_complex '[0:a]channelsplit=channel_layout=stereo:channels=FL[left]' -map '[left]' -y ad/left.wav >/dev/null 2>&1; \
    ffmpeg -hide_banner -i ad/" + filename + " -filter_complex '[0:a]channelsplit=channel_layout=stereo:channels=FR[right]' -map '[right]' -y ad/right.wav >/dev/null 2>&1"
    
    exec(cmd, (error, stdout, stderr) => {
      if (error){
        initiateRecEnd("split channels, " + error)
        return 
      }
      //2 check volume
      var leftDB, rightDB, maxDBleft, maxDBright;
      cmd = "ffmpeg -hide_banner -i ad/left.wav -filter:a volumedetect -f null  >/dev/null 2>&1"
      exec(cmd, (error, stdout, stderr) => {
        if (error){
          console.log("split channels, " + error)
          initiateRecEnd("split channels, " + error)
          return 
        }
        //console.log("stderr=" + stderr)
        leftDB = getffmpeg(stderr,"mean_volume: ")
        maxDBleft = getffmpeg(stderr,"max_volume: ")
        console.log("left mean_volume=" + leftDB + "dB");
        if (maxDBleft == 0) setAudioCaptureInfo("left="+leftDB+"dB, **WARNING** check overdrive - ")
        else setAudioCaptureInfo("left="+leftDB+"dB - ")
        

        cmd = "ffmpeg -hide_banner -i ad/right.wav -filter:a volumedetect -f null  >/dev/null 2>&1"
        exec(cmd, (error, stdout, stderr) => {
          if (error){
            console.log("split channels, " + error)
            initiateRecEnd("split channels, " + error)
            return
          }
          //console.log("stderr=" + stderr)
          rightDB = getffmpeg(stderr,"mean_volume: ")
          maxDBright = getffmpeg(stderr,"max_volume: ")
          console.log("right mean_volume=" + rightDB + "dB");
          if (maxDBright == 0) setAudioCaptureInfo("right="+rightDB+"dB, **WARNING** check overdrive - ")
          else setAudioCaptureInfo("right="+rightDB+"dB - ")

          //check extrem scratches
          if(maxDBright > -1.0){
            if (rightDB < -21.0)
              maxDBright=-21-(rightDB)
            else
              maxDBright = 0
          }

          if(maxDBleft > -1.0){
            if (leftDB < -21.0)
              maxDBleft=-21-(leftDB)
            else
              maxDBleft = 0
          }
        

          //3 eventually increase volume of channels
          console.log("increase left " + Math.abs(maxDBleft) + "dB, right " + Math.abs(maxDBright))
          vol = "volume=" + Math.abs(maxDBleft) + "dB"
          cmd = "ffmpeg -hide_banner -i ad/left.wav -filter:a " + "'" + vol + "' -y ad/left++.wav >/dev/null 2>&1"
          exec(cmd, (error, stdout, stderr) => {
            if (error){
              initiateRecEnd("increase volume tracks left, " + error)
              return
            } 
            vol = "volume=" + Math.abs(maxDBright) + "dB"
            cmd = "ffmpeg -hide_banner -i ad/right.wav -filter:a " + "'" + vol + "' -y ad/right++.wav  >/dev/null 2>&1"
            exec(cmd, (error, stdout, stderr) => {
              if (error){
                initiateRecEnd("increase volume tracks right, " + error)
                return 
              } 
              setAudioCaptureInfo(" " + filename + ": increased volume right:" + Math.abs(maxDBright) + "dB & left:" + Math.abs(maxDBleft) + "dB - " )

              //4 merge 2 mono tracks back to stereo
              cmd = 'ffmpeg -i ad/left++.wav -i ad/right++.wav -filter_complex "[0:a][1:a]join=inputs=2:channel_layout=stereo[a]" -map "[a]" -y ad/' + filename+" >/dev/null 2>&1"
              exec(cmd, (error, stdout, stderr) => {
                if (error){
                  initiateRecEnd("do mono tracks to stereo, " + error)
                  return
                } 
                console.log("ok increased")
                exec("rm ad/left*;rm ad/right*", (error, stdout, stderr) => {})
              })
            })
          })
        })
      })
    })
  },
  this.getffmpeg = function(dat,find){
    let pos = dat.indexOf(find)
    //console.log("pos=" + pos);
    let txt = dat.slice(pos+find.length);
    //console.log("txt=" + txt)       
    pos = txt.indexOf("dB")
    let db = txt.substring(0,pos)
    return parseFloat(db);
  },
  this.audioGetProcessWavState = function(){
    cmd = "ls ad/*.wav >&1"
    exec(cmd, (error, stdout, stderr) => {
      if (stdout){
        //remove line feeds
        var data=String(stdout).replace(/\r?\n|\r/g, ' - ')
        progressInfo = data
        console.log("processWav:" + data)        
      }
    })
  },
  this.doRecording = async function(res,plattentyp,page){
    /*
      startConversion() endet über watchLautheit() => stopADconversion() 
      => stopAudioRecording() startet Analyzer => startWavAnalyzer()
    */
    try{
      if (usbState.usbaudiocapture === constants.USB_NOK) {
        procStatus.text="USB Audio Capture Device not installed"
        setInitialPage(res)
        return
      }
      //CD converiosn via Player AUX => Receiver => LineOut => USB Audio Capture etc
      if (page === "captureAux"){
        killplayAux()
        recAD.medium="AUX"
        recAD.type="CD"
        recAD.evaluatedState = constants.REC_RECORDING

        procStatus.stat |= constants.PROC_STAT_DIGI_ON;
        await startConversion()
        //--------------------------------------------
        //Client öffnet eine SSE-Streamroute (siehe /funcSSE) für Prozessupdates
        sseData = " "
        SSEIntervalTyp = constants.SSE_CD_RIPPING//constants.SSE_AD_CONVERSION
        let fini = await calcRecEnd(constants.AD_MAX_AUX_CONVERSION_TIME)
        await setAudioCaptureInfo("ends up at " + fini)
        console.log(progressInfo)
        cdInfo.status="start capture USB-Audio.. " //recordModal
        res.render('pages/cddvd', {pageInfo:progressInfo,recAD:recAD,
              btDevice: bluez, 
              pState: procStatus, recording: getScheduledJobsWithoutTimeout(),
              settings:settings,
              vol: volumeAudioOut,
              tracks: cdInfo,
              currentTrack: 0,
              discInfo:discInfo,
              hasCdDrive: !!(blkCDdev && String(blkCDdev).trim()),
              usbAudioCaptureDetected: !!(usbState && usbState.usbaudiocapture && String(usbState.usbaudiocapture).toLowerCase() !== String(constants.USB_NOK).toLowerCase() && String(usbState.usbaudiocapture).toLowerCase() !== "nok")
          });  
        return
      }

      if (page === "audioCaptureTape"){
        recAD.medium="Tape"
        var time = parseInt(recAD.stoptime);
        //time+=2 //2 Minuten dazu wegen Bandvorspann
        if ((time < constants.AD_MIN_CONVERSION_TIME) || (time > constants.AD_MAX_TAPE_CONVERSION_TIME)){
          procStatus.text = "Die Stopzeit muss > 0 and <= " + constants.AD_MAX_TAPE_CONVERSION_TIME + " Minuten sein"
          setInitialPage(res)
          return    
        }

        let future = "Automatischer Aufnahme stop: "
        if (time){
          let fini = await calcRecEnd(time) 
          future += fini
        }
        console.log(future)
        // //Client öffnet eine SSE-Streamroute (siehe /funcSSE) für Prozessupdates
        procStatus.stat |= constants.PROC_STAT_DIGI_ON;

        doTape(res,true)
        setTimeout(startConversion,2000)
        return
      }
      //Vinyl conversion
      recAD.medium="Disc"
      //check if selected disc side already in devADrecords
      let result = await checkVinylRecExist()
      if (result == constants.DISCOGS_RESULT_STATE_IN_ADRECORDS){
        procStatus.text = discogsResult.info + " "+recAD.side+" im Plattenschrank vorhanden"
        console.log (procStatus.text)
        res.redirect("/")
        return
      }
      if (plattentyp.match("33rpm")) recAD.stoptime = constants.AD_MAX_LP_CONVERSION_TIME
      else recAD.stoptime = constants.AD_MAX_EP_CONVERSION_TIME
      if (!recAD.side){
        procStatus.text="could not evaluate record side !"
        console.log (procStatus.text)
        setInitialPage(res)
        return
      }

      recAD.medium="Disc"
      recAD.evaluatedState = constants.REC_RECORDING
      //Client öffnet eine SSE-Streamroute (siehe /funcSSE) für Prozessupdates
      procStatus.stat |= constants.PROC_STAT_DIGI_ON;
      await startConversion()
      //--------------------------------------------
      sseData = " "
      SSEIntervalTyp = constants.SSE_AD_CONVERSION
      let fini = await calcRecEnd(parseInt(recAD.stoptime)) 
      await setAudioCaptureInfo("ends up at " + fini)
      console.log(progressInfo)
      res.render('pages/audioCapture', {pageInfo:progressInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:getAudioCaptureSize(),audioInfo:progressInfo,discogs:discogsResult, pside:recAD.side, userSave:adjustRenameState.userCheck, getPara:false,  vol:settings.jackVolume, settings:settings})
      //--------------------------------------------


      var str = scheduledRadioRecJobs
      console.log("ADrecords:"+str)
    }
    catch(err){
      console.log(err)
      pageInfo="Capture Vinyl"
      discogsResult.state = constants.DISCOGS_RESULT_STATE_EXIST
      audioCapture(res)
      rememberDB="audioCapture"
    }
  },
  this.checkVinylRecExist = async function(){
    try{
      var cmd = "ls " + devADrecords + "/ADrecords/" + discogsResult.info + "/audio/ >&1"
      //console.log(cmd)
      var stdout = await execCmd(cmd)
      if (stdout){
        let disc = {}
        switch (recAD.side){
          case "A": disc = discogsResult.sideA;break;
          case "B": disc = discogsResult.sideB;break;
          case "C": disc = discogsResult.sideC;break;
          case "D": disc = discogsResult.sideD;break;
          case "E": disc = discogsResult.sideE;break;
          case "F": disc = discogsResult.sideF;break;
          default: disc = discogsResult.sideA;break;
        }
        let data = stdout.split("\n")
        data.pop()
        let result = validateTrackData(data, disc)
        return result
        // if (result.valid)
        //   discogsResult.state = constants.DISCOGS_RESULT_STATE_IN_ADRECORDS
        // else
        //   discogsResult.state = constants.DISCOGS_RESULT_STATE_EMPTY
      } 
      else
        discogsResult.state = constants.DISCOGS_RESULT_STATE_EXIST
      return discogsResult.state
    }
    catch(err){
      console.log(err)
      return discogsResult.state
    }
  },
  this.getRecordTime = async function(res){
    try {
      let dat = await execCmd("ffprobe -i ad_copy/all.wav 2>&1 | grep Duration >&1")
      dat = String(dat)
      console.log("getRecordTime: " + dat)
      procStatus.text = "all.wav: " + dat
    } catch (err) {
      procStatus.text = "getRecordTime: " + err
      console.log(procStatus.text)
    }

    if ("type" in recAD){
      if (recAD.medium.match("Disc"))
        res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus,audioInfo:getAudioCaptureSize(),discogs:discogsResult, recAD: recAD, userSave:adjustRenameState.userCheck, getPara: false,  vol:settings.jackVolume, settings:settings})
      else 
        doTape(res,false)
    }else
      doTape(res,false)
  },
  this.songRecognition = async function(res, result){
    try{
        //Client öffnet eine SSE-Streamroute (siehe /funcSSE) für Prozessupdates
        //res.render('pages/audioCaptureStop', {pageInfo:pageInfo,page:"audioCaptureTape", settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, audioInfo:progressInfo, stoptime:" ", recAD: recAD, getPara: true,   ip:settings.ip, sysdir:settings.installDir})
        recAD.oldCaptureData = " "
        SSEIntervalTyp = constants.SSE_PROCESS_WAV //change SSE data lookup
        console.log("*** Client öffnet eine SSE-Streamroute (siehe /funcSSE) für SSE_PROCESS_WAV Prozessupdates ***")
        await doTape(res,false)
        if (!result)
          processTapeWav()
        else{
          progressInfo = "Titel exist !"
          setTimeout(initiateRecEnd,4000,"Titel exist !")
        }
    }
    catch(err){
      console.log("songRecognition "+err)
      doTape(res,false)
    }
  },
  this.resetMP3select = function(){
      //remember for mp3 conversion ../mediaServer/ADrecords/filename.wav to ../mediaServer/Music/Audio/filename.mp3
      mp3Select.in = ""
      mp3Select.out = ""
  },
  this.getLameInfo = async function (res){
    try{
      let data = await fsPromises.readFile('help/lame.txt','utf8')
      var info = data.split("\n")
      if (info.length >= 6){
        mp3Progress.encodeStr = info[2]
        var s = info[6].search("%")
        while (s >= 0){
          mp3Progress.percent = info[6].substring(s-4,s+2)
          info[6] = info[6].substring(s+3,info[6].length)
          s = info[6].search("%")
        }
        return mp3Progress.encodeStr + "  " + mp3Progress.percent
      }
      return("getLameInfo err")
    }catch(err){
      console.log("getLameInfo err " + err)
      return "getLameInfo err " + err
    }
  },
  this.analyzeAllwav = async function (res,discSide){
    recAD.medium = "Disc"
    var result = await checkVinylRecExist()
    if (result != constants.DISCOGS_RESULT_STATE_IN_ADRECORDS){
      recAD.oldCaptureData = " "
      SSEIntervalTyp = constants.SSE_PROCESS_WAV //change SSE data lookup
      console.log("*** Client öffnet eine SSE-Streamroute (siehe /funcSSE) für SSE_PROCESS_WAV Prozessupdates ***")
      progressInfo = ""  //Inhalt für modal win client
      audioCapture(res)
      recAD.oldCaptureData = " "
      processWav()
      return true    
    }
    procStatus.text="Plattenseite bereits im Plattenschrank"
    //correct viewing
    var help = discogsResult.state = constants.DISCOGS_RESULT_STATE_IN_ADRECORDS
    discogsResult.state = constants.DISCOGS_RESULT_STATE_EXIST
    res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, 
      recSide:recSide, page:"normal", 
      storage:storage, 
      btDevice:bluez, 
      recording:getScheduledJobsWithoutTimeout(), 
      pState:procStatus,
      audioInfo:"all.wav",//getAudioCaptureSize(),
      discogs:discogsResult, 
      recAD: recAD, 
      userSave:adjustRenameState.userCheck, 
      getPara:false, 
       vol:settings.jackVolume, 
      settings:settings})
    discogsResult.state = help
    return false
  },
  this.getAudioCaptureInfo = function (){
    return progressInfo
  },
  this.checkAllWav = async function (res){
    //see https://audiomass.co/ 
    //https://stackoverflow.com/questions/4468157/how-can-i-create-a-waveform-image-of-an-mp3-in-linux
    try{
      result = await execCmd("ls ad/all.wav >&1")
      if (!result) {
        procStatus.text =""
        if (usbState.usbaudiocapture.match("nok")) procStatus.text = "No USB Audio Capture Device found"
        if (res) {
          res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, 
          recording:getScheduledJobsWithoutTimeout(), 
          pState:procStatus,audioInfo:"none",
          discogs:discogsResult, recAD: recAD, userSave:adjustRenameState.userCheck, 
          getPara:true,  vol:volumeAudioOut, settings:settings})
        }
        return
      }
      if (res) 
        res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, 
        recording:getScheduledJobsWithoutTimeout(), 
        pState:procStatus,audioInfo:"all.wav",
        discogs:discogsResult, recAD: recAD, userSave:adjustRenameState.userCheck, 
        getPara:true,  vol:volumeAudioOut, settings:settings})
        return
  }catch(err){
      console.log(err)
      procStatus.text = err
      if (res) res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, 
        recording:getScheduledJobsWithoutTimeout(), 
        pState:procStatus,audioInfo:progressInfo,
        discogs:discogsResult, recAD: recAD, userSave:adjustRenameState.userCheck, 
        getPara:true,  vol:volumeAudioOut, settings:settings})
    }
  },
  this.checkAudioAC3 = function(p){
      var cmd = "ffmpeg -i "+p+" >&1"
      console.log(cmd)
      var vidInfo = exec(cmd, (error, stdout, stderr) => {
        if (vidInfo.match("ac3")) 
          res.render('pages/showVideo', {pageInfo:pageInfo,vol:volumeAudioOut, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
            pState:procStatus, basetracks:allTracks, dir:0, settings:settings, indexStart:0, loc:rememberDB,
            vidsrc:uri, convert:true,})         
        else
          res.render('pages/showVideo', {pageInfo:pageInfo,vol:volumeAudioOut, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:allTracks, dir:0, settings:settings, indexStart:0, loc:rememberDB,vidsrc:uri,convert:true,})         
    })
  },
  this.convertAC3 = async function(uri){
    var cmd = "ffmpeg -y -i " + uri + " -acodec mp3 -vcodec copy "
    //we must use new file, since ffmpeg cannot write and read same file at the same time
    let newUri = uri.split("/")
    var nuri = ""
    var i=0; 
    for (i in newUri) {
      if (i < newUri.length-1) 
        nuri += newUri[i]+"/" 
    }
    newUri = newUri[newUri.length-1].split(".")

    cmd +=nuri+newUri[0]+"z."+newUri[1]
    console.log(cmd)
    convert_ac3_active = true
    procStatus.text = "Aktiv: " + cmd
    try{
      await execCmd(cmd) 
      await execCmd("rm "+uri)
      procStatus.text = "conversion ok"
      convert_ac3_active = false
      procStatus.text = ""
    }
    catch(err){
        console.log(err)
    }
  },
  this.convertMP4A = async function(uri){
    var n = uri.split(".mp4")
    var cmd = "ffmpeg -i " + uri + " -c:a libmp3lame -b:a 128k -write_xing 1 " + n[0]+"a.mp4" 
    //we must use new file, since ffmpeg cannot write and read same file at the same time
    let newUri = uri.split("/")
    var nuri = ""
    var i=0; 
    for (i in newUri) {
      if (i < newUri.length-1) 
        nuri += newUri[i]+"/" 
    }
    newUri = newUri[newUri.length-1].split(".")

    cmd +=nuri+newUri[0]+"z."+newUri[1]
    console.log(cmd)
    convert_ac3_active = true
    procStatus.text = "Aktiv: " + cmd
    try{
      await execCmd(cmd) 
      await execCmd("rm "+uri)
      procStatus.text = "conversion ok"
      convert_ac3_active = false
      procStatus.text = ""
    }
    catch(err){
        console.log(err)
    }
  },
  this.createEqSliderJson = async function(){
      //remove eventually old stuff on old place
      await execCmd("rm -f eqSlider.json")
      //create eqSlider.json
      //Es gilt aus den Filtern 0,1,2,3 also "Clear.txt", "Neutral.txt", "Warm.txt", "Bass.txt" die Sliderpositionen u bestimmen,
      //da diese in audioWeb.js und videoWeb.js benötigt werden
      const slData = {
        "f40Hz": [0,0,0,0,0],
        "f121Hz": [0,0,0,0,0],
        "f547Hz": [0,0,0,0,0],
        "f674Hz": [0,0,0,0,0],
        "f818Hz": [0,0,0,0,0],
        "f1503Hz": [0,0,0,0,0],
        "f1605Hz": [0,0,0,0,0],
        "f1722Hz": [0,0,0,0,0],
        "f4160Hz": [0,0,0,0,0],
        "f12000Hz": [0,0,0,0,0],
      };
      let x = ""
      for (a=0; a<5; a++){
        switch (a){  
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
        if (x){
          x = x.split("Gain")
          for (i in x){
            if (i > 0){
              let n = x[i].split("dB")
              n = parseFloat(n)
              let sl = await gainToSliderVal(n)
              switch (i){
                case '1': slData["f40Hz"][a]=sl; break;
                case '2': slData["f121Hz"][a]=sl; break;
                case '3': slData["f547Hz"][a]=sl; break;
                case '4': slData["f674Hz"][a]=sl; break;
                case '5': slData["f818Hz"][a]=sl; break;
                case '6': slData["f1503Hz"][a]=sl; break;
                case '7': slData["f1605Hz"][a]=sl; break;
                case '8': slData["f1722Hz"][a]=sl; break;
                case '9': slData["f4160Hz"][a]=sl; break;
                case '10': slData["f12000Hz"][a]=sl; break;
              }
            }
          }
        }
      }
      slData.preset = Number(settings.filterIndex);

      const jsonString = JSON.stringify(slData, null, 2);
      //console.log(jsonString);
      await fsPromises.writeFile('filter/eqSlider.json', jsonString)//, function (err) {if (err) console.log(err)});
      console.log("createEqSliderJson")
  },
  this.setAudioEnvironment = async function (){
    try{
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
      /*
        pipeWire ist der moderne Audio- (und Video-) Server in Linux 
        pipwire-pulse ist Nachfolger von ehemals PulseAudio
        wirePlumber ist der Session Manager für PipeWire.
         - verwaltet Geräte (z. B. Lautsprecher, Headset, HDMI) erkennt und zuordnet,
         - Richtlinien (Policies) anwendet — z. B. „wenn Kopfhörer eingesteckt → Ausgabe dahin umschalten“,
         - Clients (Programme) mit den passenden Audio-Devices verbindet.
          Ohne einen Session-Manager wie WirePlumber würde PipeWire zwar laufen, aber nichts tun, weil niemand 
          festlegt, welche Geräte oder Regeln gelten.
      */

      //get hw devices / DAC has prio / needs ~/.asoundrc
      var inf = await execCmd("aplay -l | grep card >&1")

      console.log(inf)
      if (inf.match("card 1:")){
        //card 1 muß DAC sein!
        //nur für libao, sox, mpg123 die ALSA Backend standardmäßig nutzen (funktioniert nicht da nur innerhalb dieses shell Prozesses)

        //~/.asoundrc needed for mpv 
        data = 'pcm.!default\n {\n type asym playback.pcm\n {\n type plug\n slave.pcm "output"\n }\n capture.pcm\n {\n type plug\n slave.pcm "input"\n }\n }\n pcm.output\n {\n type hw\n card 1\n }\n ctl.!default\n {\n type hw\n card 1 \n }\n'
        let filePath = path.join(os.homedir(), '.asoundrc');
        await fs.writeFileSync(filePath, data);

        //pipewire
        //setze richtige DAC Bezeichnung für pipewire filter graph "props" ohne Reverb:
        inf = await execCmd("pw-cli ls Node | grep alsa_output | sort | uniq >&1")
        inf = inf.split("\n")
        let full = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox.txt >&1")
        let nodeT = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox.txt | grep node.target >&1")
        let nodeName = inf[0]
        if (!nodeName.includes("soc"))
          nodeName = inf[1]
        full = full.replace(nodeT,nodeName+"\n")
        //console.log(full)
        filePath = path.join(os.homedir(), '/.config/pipewire/pipewire.conf.d/tonbox.txt');
        await fs.writeFileSync(filePath, full);
        //... mit Reverb:
        full = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox_All.txt >&1")
        nodeT = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox_All.txt | grep node.target >&1")
        full = full.replace(nodeT,nodeName+"\n")
        //console.log(full)
        filePath = path.join(os.homedir(), '/.config/pipewire/pipewire.conf.d/tonbox_All.txt');
        await fs.writeFileSync(filePath, full);
      } else {
        await execCmd("rm ~/.asoundrc")
        //pipewire
        //setze richtige DAC Bezeichnung für pipewire filter graph "props" ohne Reverb:
        inf = await execCmd("pw-cli ls Node | grep alsa_output | sort | uniq >&1")
        inf = inf.split("\n")
        let full = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox.txt >&1")
        let nodeT = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox.txt | grep node.target >&1")
        let nodeName = inf[0]
        if (nodeName.includes("soc"))
          nodeName = inf[1]
        full = full.replace(nodeT,nodeName+"\n")
        //console.log(full)
        filePath = path.join(os.homedir(), '/.config/pipewire/pipewire.conf.d/tonbox.txt');
        await fs.writeFileSync(filePath, full);
        //setze richtige DAC Bezeichnung für pipewire filter graph "props" mit Reverb:
        full = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox_All.txt >&1")
        nodeT = await execCmd("cat ~/.config/pipewire/pipewire.conf.d/tonbox_All.txt | grep node.target >&1")
        full = full.replace(nodeT,nodeName+"\n")
        //console.log(full)
        filePath = path.join(os.homedir(), '/.config/pipewire/pipewire.conf.d/tonbox_All.txt');
        await fs.writeFileSync(filePath, full);
      }

      // //reload default filter graph
      settings.reverb = "off" 
      await execCmd("bashScript/./conv.sh off")

      await execCmd("systemctl --user restart pipewire wireplumber")
      let r = await execCmd("systemctl --user status pipewire | grep 'active (running)'")
      if (r) console.log("pipewire is running")
      else {
        procStatus.text="pipewire failed! Check tonboxFilter.conf"
        console.log(procStatus.text)
      }
      await pipewireAudioInit()
      await submitFilter('MyEQ')
    }
    catch(err){
      procStatus.text="setAudioEnvironment: " + err
      console.log(procStatus.text)
    }
  },
  this.monitorLevel = function (res,page,action){
    if (action === "start"){
      sseData = " "
      SSEIntervalTyp = constants.SSE_MONITOR_LEVEL
      
      //--------------------------------------------
      //Client öffnet eine SSE-Streamroute (siehe /funcSSE) für Prozessupdates
      //res.render('pages/monitorLevel', {pageInfo:pageInfo, page:page, settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, audioInfo:progressInfo, ip:settings.ip, sysdir:settings.installDir})
      if (page.match("audioCaptureTape")){
        doTape(res,false)
      }else{
        res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, 
          recording:getScheduledJobsWithoutTimeout(), 
          pState:procStatus,audioInfo:progressInfo,
          discogs:discogsResult, recAD: recAD, userSave:adjustRenameState.userCheck, 
          getPara:true,  vol:volumeAudioOut, settings:settings})
      }
    }else{
      stopMonitorLevel(res,page)
    }

  },
  this.getMonitorLevel = function (){
      var cmd = "arecord -D plughw:"+usbState.usbaudiocapture+" -f S16_LE -qd 1 ad/rec.waw && sox ad/rec.waw -n stat 2>&1"
      exec(cmd, (error, stdout, stderr) => {
        if (error && SSEIntervalTyp.match(constants.SSE_MONITOR_LEVEL)) {
          procStatus.text = error
          console.log(error)
          monitorLevel = error
        } else{
          var audioInputLevel = stdout.split("\n")
          if (audioInputLevel[3]){
            var d = audioInputLevel[3].split(":")
            monitorLevel = d[1]     
          }    
        }
      })  
      //console.log("monitorLevel="+monitorLevel)
      return monitorLevel
  },
  this.stopMonitorLevel = function(res,page){
    SSEIntervalTyp = constants.SSE_INACTIVE
    exec("rm -f /tmp/rec.*", (error, stdout, stderr) => {})
    if (page.match("audioCaptureTape")){
      doTape(res,false)
    }else{
      res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, 
      recording:getScheduledJobsWithoutTimeout(), 
      pState:procStatus,audioInfo:progressInfo,
      discogs:discogsResult, recAD: recAD, userSave:adjustRenameState.userCheck, 
      getPara:true,  vol:volumeAudioOut, settings:settings})
    }
    setTimeout(stopML,2000)
  },
  this.stopML = function (){
    SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
  },
  this.stopMusicPlay = async function(proc){
    await killMplayer()
    stopMetadata()
    procStatus.marquee = ""; 

    clearTrackInterval()
    radioPlayIndex = -1


    exec("pgrep mpv", (err, stdout, stderr) => {
      if (!err) {
        exec("sudo killall mpv",(err, stdout, stderr) => {})
      }
    })
    exec("pgrep chromium", (err, stdout, stderr) => {
      if (!err) {
        exec("sudo killall chromium",(err, stdout, stderr) => {})
      }
    })
    trackState = "done"

    // Kill any leftover pw-play instances
    exec("pgrep pw-play", (err, stdout, stderr) => {
      if (!err) {
        exec("sudo killall pw-play",(err, stdout, stderr) => {})
      }
    })
  },
	this.deepSplit = async function(){
		try{
      /*
        Tracksplitting über "gramocli" war nicht ausreichend.
        Es gilt "all.wav.tracks" neu zu generieren über die Ruhezeiten zwischen den Tracks.
        gramoBlocks enthält Start- und Endzeiten der Tracks => 1 Block=100ms
        loudnessTimes enthält Ruhezeiten zwischen den Tracks (+ Ruhezeit am Ende) in Sekunden. D.h. 173.624sec entsprechen 1736 Blocks
      */
      //generiere Start- / Endzeiten der Tracks über Gapzeiten
      let loudnessBlocks=[]
      loudnessBlocks.push([]);//loudnessBlocks[0]=[]
      //Track start unkown
      loudnessBlocks[0][0] = 0 
      //Track end
      loudnessBlocks[0][1] = loudnessTimes[0].blockstart
      for (i in loudnessTimes){
        if (i==0) continue;
        loudnessBlocks[i] = [];   // create row first
        //Track start
        loudnessBlocks[i][0] = loudnessTimes[i-1].blockend
        //Track end
        loudnessBlocks[i][1] = loudnessTimes[i].blockstart
      }

      let newGramoBlocks = []
      if ((recAD.trackCount) === loudnessTimes.length){
        //Anzahl der Ruhezeiten zwischen den Tracks stimmt mit geforderten überein 
        for (i in loudnessTimes){
          //prüfe Übereinstimmung der Startzeitpunkte (1 Block = 100ms)  
          let d = Math.abs(gramoBlocks[i][1] - loudnessTimes[i].blockstart)
          if ((d < 5)){//500ms differenz
            newGramoBlocks.push(gramoBlocks[i])
          }
          else{
            //alle Anderen gramoBlocks könnten ungültig sein
            newGramoBlocks.push(loudnessBlocks[i])
          }
        }
        gramoBlocks = newGramoBlocks
        console.log(gramoBlocks)
        return true
      } 
      console.log("Deep split failed="+gramoBlocks)
      return false
		}
		catch(err){
			console.log(err)
      return false
		}
	},
  this.getGramoTracks = async function(){
    var data = await execCmd("cat ad/all.wav.tracks | grep '# Track'")	
    //create required blocks
    for (let i=0; i<recAD.trackCount;i++){
      gramoBlocks.push([]);
      // gramoBlocks[i] = [];  // create row
      gramoBlocks[i][0] = 0
      gramoBlocks[i][1] = 0
    }
    if (data){
      data = data.split("blocks")
      for (var i=1; i<data.length; i++){
        gramoBlocks[i-1] = data[i].split("to")
      }
      for (let i = 0; i < gramoBlocks.length; i++) {
        let val = gramoBlocks[i][1];
        if (typeof val === "string" && val.includes("-")) {
          let p = val.indexOf("-");
          gramoBlocks[i][0] = Number(gramoBlocks[i][0]);
          gramoBlocks[i][1] = Number(val.slice(0, p));
        }
      }
      return true
    }
    return false
  },
	this.generateNewTrackBlocks = async function(){
		try{
			var allWavTracks = "#deepSplit\n\n"
			allWavTracks += "[Tracks]\n\n"				
			allWavTracks += "Number_of_tracks="+recAD.trackCount+"\n\n"	
			var n = ""
			for (var i=0; i<gramoBlocks.length; i++){
				var a = i + 1
				if (i < 9)
					n = "0"+a.toString()
				else 
					n = a.toString()

				allWavTracks += "# Track " + n + " - blocks " + gramoBlocks[i][0] + " to " + gramoBlocks[i][1] + "\n"
				allWavTracks += "Track"+ n + "start="+getTstr(gramoBlocks[i][0])+"\n"
				allWavTracks += "Track"+ n + "end="+getTstr(gramoBlocks[i][1])+"\n\n"
			}
      console.log("generateNewTrackBlocks:\n"+allWavTracks)
			await fs.writeFileSync("ad/all.wav.tracks", allWavTracks)
		}
		catch(err){
			console.log(err)
		}
	},
  this.getTstr = function(block){
		var TMin = Math.trunc(Number(block) / 600)
		var TSec = (Math.trunc(Number(block) % 600))/10
		return ("0:"+TMin+":"+TSec)
	},
	this.workOnTracks = async function(){
    await execCmd("rm -f public/images/helpDB/coverImg*")
    adjustRenameState.current = 0
    wait = 0;
    if (recAD.medium === "AUX"){
      adjustRenameState.current = 0
      renameCDtracks(false)
      return
    }
    var side = [];
    switch (recAD.side){
      case "A":
        side = Object.values(discogsResult.sideA)
        if (side.length === 0){
          adjustRenameState.userCheck = true
          initiateRecEnd("   Keine Titelbezeichnung der Tracks gefunden")
          return
        }
      break;

      case "B":
        side = Object.values(discogsResult.sideB)
        if (side.length === 0){
          adjustRenameState.userCheck = true
          initiateRecEnd("   Keine Titelbezeichnung der Tracks gefunden")
          return
        }
      break;

      case "C":
        side = Object.values(discogsResult.sideC)
        if (side.length === 0){
          adjustRenameState.userCheck = true
          initiateRecEnd("   Keine Titelbezeichnung der Tracks gefunden")
          return
        }
      break;

      case "D":
        side = Object.values(discogsResult.sideD)
        if (side.length === 0){
          adjustRenameState.userCheck = true
          initiateRecEnd("   Keine Titelbezeichnung der Tracks gefunden")
          return
        }
      break;

      case "E":
        side = Object.values(discogsResult.sideE)
        if (side.length === 0){
          adjustRenameState.userCheck = true
          initiateRecEnd("   Keine Titelbezeichnung der Tracks gefunden")
          return
        }
      break;

      case "F":
        side = Object.values(discogsResult.sideF)
        if (side.length === 0){
          adjustRenameState.userCheck = true
          initiateRecEnd("   Keine Titelbezeichnung der Tracks gefunden")
          return
        }
      break;

      default:
        initiateRecEnd("LP side not available - done")
        return
    }
    await renameVinylTrack(false)
	},
  this.generateCoverImg = async function(del) {
    try{
      if (del){
        await execCmd("rm -f public/images/helpDB/*")
      }
      //Schallplatten & CDs
      if (devADrecords != "nok"){
        //list by name
        var stdout = await execCmd("ls -1 " + devADrecords + " | sort")
        allTracks = stdout.split("\n");
        if (allTracks.length > 1){
          allTracks.pop()
          for (var i=0; i<allTracks.length; i++){
            stdout = await execCmd("ls public/images/helpDB/ | grep coverImg"+i+".jpg || true")
            if (!stdout.match("coverImg"+i+".jpg")){ //wenn nicht vorhanden
              var cmd = "convert " + devADrecords+"/"+allTracks[i]+"/image/image1.jpg -resize 30%  public/images/helpDB/coverImg"+i+".jpg"
              await execCmd(cmd+ " || true")
              //console.log("coverImg"+i+".jpg")
            }
          }
        }
      } else
        console.log("devADrecords failed")
    }
    catch(err){
      console.log(err)
    }
  },
  this.convertImproperVideos = async function(/*res*/){
    videoConvertInfoIndex = 0
    try{
      var dirs = await execCmd("ls "+devHome+"/Pictures >&1")
      if (dirs){ 
        dirs = dirs.split("\n")
        dirs.pop()
        console.log(dirs)
        for (i in dirs){
          videoConvertInfo.push("check Pictures/" + dirs[i])
          var subdir = await execCmd("ls "+devHome+"/Pictures/"+dirs[i]+" >&1")
          if (subdir){
            subdir = subdir.split("\n")
            subdir.pop()
            //console.log(subdir)
            for (x in subdir){
              if (SSEIntervalTyp.match(constants.SSE_INACTIVE)) 
                break;
              if (subdir[x].match(".flv") || subdir[x].match(".MTS") || subdir[x].match(".MPG") || 
                  subdir[x].match(".FLV") || subdir[x].match(".mts") || subdir[x].match(".mpg")){
                console.log("found " + subdir[x]+" in "+dirs[i])
                if (subdir[x].match(".flv.mp4")){
                  console.log("rename "+subdir[x]+" in "+dirs[i])
                  newName = subdir[x].split(".flv.mp4")
                  var cmd = "mv "+devHome+"/Pictures/"+dirs[i]+"/"+subdir[x]+" "+devHome+"/Pictures/"+dirs[i]+"/"+newName[0]+".mp4"
                  await execCmd(cmd)
                }else{
                  videoConvertInfo.push("video need to convert: "+subdir[x]+" in "+dirs[i])
                  console.log("video need to convert: "+subdir[x]+" in "+dirs[i]);
                  var cmd = await checkFileout(devHome+"/Pictures/"+dirs[i]+"/"+subdir[x], "new.mp4")
                  videoConvertInfo.push("ffmpeg.log")
                  await execCmd(cmd)
                  await execCmd("rm "+devHome+"/Pictures/"+dirs[i]+"/"+subdir[x])
                  //change extension 
                  var nt = subdir[x].split(".")
                  var n = nt[0]+".mp4" 
                  await execCmd("mv new.mp4 "+devHome+"/Pictures/"+dirs[i]+"/"+n)
                }
              }
              if (subdir[x].match(".mp4")){
                //check if not audio codec "ac3"
                var cmd = "ffprobe " + devHome+"/Pictures/"+dirs[i]+"/"+subdir[x] + " 2>&1 >/dev/null | grep Stream >&1"
                console.log(cmd)
                var result = await execCmd(cmd)
                if (result.match("Video: h264")){
                  if (result.match("ac3")){
                    videoConvertInfo.push("ac3 need to convert: "+subdir[x]+" in "+dirs[i])
                    console.log("ac3 need to convert: "+subdir[x]+" in "+dirs[i])
                    await convertAC3(devHome+"/Pictures/"+dirs[i]+"/"+subdir[x])
                  }
                }
              }
            }
          }
        }
      }

      videoConvertInfo.push("check Music/Video")
      var vids = await execCmd("ls "+devMusic+"/Video >&1")
      if (!vids) 
        videoConvertInfo.push("Ende")//res.redirect("../system")
      vids = vids.split("\n")
      vids.pop()
      console.log(vids)
      for (i in vids){
        if (SSEIntervalTyp.match(constants.SSE_INACTIVE)) 
          break;

        vids[i] = escapeTrack(vids[i])
        if (vids[i].match(".mp4")){
            //check if not audio codec "ac3"
          var cmd = "ffprobe " + devMusic+"/Video/"+vids[i] + " 2>&1 >/dev/null | grep Stream >&1"
          console.log(cmd)
          var result = await execCmd(cmd)
          if (result.match("Video: h264")){
            if (result.match("ac3")){
              videoConvertInfo.push("ac3 need to convert: "+ vids[i])
              console.log("ac3 need to convert: "+ vids[i])
              await convertAC3(devMusic+"/Video/"+vids[i])
            }
          }
        }
      }
      videoConvertInfo.push("Ende")
    }
    catch(err){
      console.log(err)
      videoConvertInfo.push("Ende: " + err)
    }
  },
  this.getVideoConversionData = function(){
    if (videoConvertInfo.length > videoConvertInfoIndex){
      progressInfo = videoConvertInfo[videoConvertInfoIndex] + " +++ "
      if (videoConvertInfo[videoConvertInfoIndex].match("Ende")){
        progressInfo+=" ok, "
        SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
      }
      videoConvertInfoIndex++
    }
    else progressInfo = "."
  },
  this.streamVideo = function(path, range, res) {

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

    /*
     * ---------------------------------------------------------
     * Kein Range-Header
     * ---------------------------------------------------------
     *
     * Einige DLNA-TVs beginnen mit einem normalen GET.
     */

if (!range) {
    console.log("streamVideo: kein Range -> kompletter Stream");
    console.log("========== VIDEO GET/STREAM ==========");
    console.log("file:", videoPath);
    console.log("method:", res.req?.method);
    console.log("headers:", res.req?.headers);
    console.log("======================================");

    res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": videoSize,
        "Accept-Ranges": "bytes"
    });

    const videoStream = fs.createReadStream(videoPath);

    let bytesSent = 0;

    videoStream.on("data", chunk => {
        bytesSent += chunk.length;
    });

    videoStream.on("end", () => {
        console.log("VIDEO STREAM END");
        console.log("Bytes gesendet:", bytesSent);
    });

    videoStream.on("error", err => {
        console.log("VIDEO STREAM ERROR:", err);
    });

    res.on("finish", () => {
        console.log("HTTP RESPONSE FINISHED");
    });

    res.on("close", () => {
        console.log("HTTP RESPONSE CLOSED");
        console.log("Bytes gesendet:", bytesSent);
    });

    videoStream.pipe(res);
    return;
}

    /*
     * ---------------------------------------------------------
     * Range vorhanden
     * ---------------------------------------------------------
     */
    console.log("streamVideo: Range vorhanden");
    console.log("========== VIDEO GET/STREAM ==========");
    console.log("file:", videoPath);
    console.log("method:", res.req?.method);
    console.log("headers:", res.req?.headers);
    console.log("======================================");

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
        "Content-Range":
            `bytes ${start}-${end}/${videoSize}`,

        "Accept-Ranges": "bytes",

        "Content-Length":
            contentLength,

        "Content-Type":
            "video/mp4"
    };

    console.log(
        `streamVideo: ${start}-${end}/${videoSize}`
    );

    res.writeHead(206, headers);

    const videoStream =
        fs.createReadStream(videoPath, {
            start: start,
            end: end
        });

    videoStream.pipe(res);
},
  // this.streamVideo = function(filePath,range,res){
  //   /*Create a function for the /video endpoint. You need to make sure there is a range header. 
  //   Otherwise, you won’t be able to tell the client what part of the video you want to send back. 
  //   The if statements handles this, returning a 400 Error alerting the client that it needs a range header:*/
  //   //const range = req.headers.range;
  //   if (!range) {
  //       const ext = path.extname(filePath).toLowerCase();
  //       const mimeByExt = {
  //         ".mp4": "video/mp4",
  //         ".mpeg": "video/mpeg",
  //         ".mpg": "video/mpeg",
  //         ".mov": "video/quicktime",
  //         ".avi": "video/x-msvideo",
  //         ".mts": "video/mp2t"
  //       };
  //       const stat = fs.statSync(filePath);
  //       res.writeHead(200, {
  //         "Content-Type": mimeByExt[ext] || "application/octet-stream",
  //         "Content-Length": stat.size,
  //         "Accept-Ranges": "bytes"
  //       });
  //       fs.createReadStream(filePath).pipe(res);
  //       return;
  //   }
  //     const videoPath = filePath;
  //     const videoSize = fs.statSync(filePath).size;
  //   const CHUNK_SIZE = 10 ** 6;//1MB
  //   //parse the starting byte from the range header
  //   const rangeMatch = /bytes=(\d+)-?(\d*)/.exec(range);
  //   if (!rangeMatch) {
  //     res.writeHead(416, { "Content-Range": `bytes */${videoSize}` });
  //     res.end();
  //     return;
  //   }
  //   const start = Number(rangeMatch[1]);
  //   if (!Number.isFinite(start) || start < 0 || start >= videoSize) {
  //     res.writeHead(416, { "Content-Range": `bytes */${videoSize}` });
  //     res.end();
  //     return;
  //   }
  //   if (!start) { //first chunk start=0  
  //     //TBD: do this if NOT HTTP
  //     startVidLineOut(videoPath)
  //   }
  //   //Subtract one from the videoSize in the end chunk because that is the last byte. 
  //   //If there are 100 bytes in a video, then the 99th byte is the last.
  //   //Calculate the ending byte that you’ll send back.
  //   const end = Math.min(start + CHUNK_SIZE, videoSize - 1);
  //   const contentLength = end - start + 1;
  //   const headers = {
  //       "Content-Range": `bytes ${start}-${end}/${videoSize}`,
  //       "Accept-Ranges": "bytes",
  //       "Content-Length": contentLength,
  //       "Content-Type": "video/mp4",
  //   };
  //   //write a response for the request, using 206 as the status, indicating sending partial content. 
  //   res.writeHead(206, headers);
  //   const videoStream = fs.createReadStream(videoPath, { start, end });
  //   videoStream.pipe(res);
  // },
  // this.startVidLineOut = function(videoPath){
  //   if (!settings.mediaOut.match("HTTP")){      
  //     console.log("mpv --no-video " + videoPath)     
  //     exec("sudo killall mpv; mpv --no-video " + videoPath, (error, stdout, stderr) => {
  //       /*kommt erst zurück wenn fertig oder killed*/
  //       if (error){
  //         //procStatus.marquee = error
  //       }
  //     })  
  //   }
  // },
  this.doAudioYT = function(ytID){
    let id = ytID.split("=")
    if (id[1].match("stop")){
      exec("sudo killall mpv", (error, stdout, stderr) => {})
      return
    }
    let url = "https://www.youtube.com/embed/"+id[1]+"?v="+id[1]
    let cmd = "sudo killall mpv; mpv --no-video " + "'" + url +"'"
    console.log(cmd)
    exec(cmd, (error, stdout, stderr) => {
      /*kommt erst zurück wenn fertig oder killed*/
      if (error){
          //procStatus.marquee = error
      }
    })  
  },
  this.doTape = async function(res,sse){
    await checkUsbAudioCapture()
    let info = " "
    try {
      if (fs.existsSync("ad/allTape.wav")) {
        info = "allTape.wav"
      }
    } catch(err) {
      console.log("Error checking ad/allTape.wav: " + err)
    }
    if (sse){
      //--------------------------------------------
      console.log("*** Client öffnet eine SSE-Streamroute (siehe /funcSSE) für SSE_AD_CONVERSION Prozessupdates ***")
      sseData = " "
      SSEIntervalTyp = constants.SSE_AD_CONVERSION
    }
    res.render('pages/audioCaptureTape', {pageInfo:pageInfo,audioInfo:info, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus })
  },
  this.doVideo = async function(res,rec,videoTitle){
    await checkUsbVideoCapture()
    if (usbState.usbvideocapture === constants.USB_NOK){
      console.log("USB video capture device not found");
      res.render('pages/captureVideo', {pageInfo:pageInfo,btDevice: bluez,recording: getScheduledJobsWithoutTimeout(),
                  pState: procStatus, recording: rec})
      return
    }

    procStatus.text = ""
    await stopMusicPlay(constants.AUDIO_MPV)
    //Zugriffsrechte auf dev/video0 setzen, ohne sudeo
    await execCmd("sudo setfacl -m u:pi:rw /dev/video0")
    try{
      if (videoView) {
        const old = videoView;
        videoView = null; // sofort nullen, damit req.on("close") ins Leere läuft
        old.kill("SIGINT");
      }
      if (videoAudio) {
        const old = videoAudio;
        videoAudio = null; // sofort nullen, damit req.on("close") ins Leere läuft
        old.kill("SIGINT");
      }
      if (!rec) {
        recVideo.recording=false
        recVideo.title=""
      }else{
        if (!recVideo.title){ //stop video rec, show viedo view
          if (videoRecording) {
            videoRecording.stdin.write("q");
            const old = videoRecording;
            videoRecording = null; // sofort nullen, damit req.on("close") ins Leere läuft
            old.kill("SIGINT");
            rec = false
            recVideo.recording=false
            rememberDB = "Video"
            pageInfo = "Video"
            //Hauptverzeichnis
            trackIndex = -1
            showMusicDir("Video", res)
            return
          }
        }else        
          recVideo.recording=rec
      }
      res.render('pages/captureVideo', {pageInfo:pageInfo,btDevice: bluez,recording: getScheduledJobsWithoutTimeout(),
        pState: procStatus, recording: rec})
    }
    catch(err){
        console.log(err)
        procStatus.text = "doVideo "+err
        setInitialPage(res)
    }   
  },
  // this.viewVideo = function(res){
  //   if (res && typeof res.redirect === "function") {
  //     res.redirect("/vhs-stream")
  //     return
  //   }
  // },
  this.startVideoRecording = function(recordFile) {
    if (videoRecording) {
        console.log("Video recording läuft bereits.");
        return;
    }

    const args = [
        "-f", "v4l2",
        "-standard", "PAL",
        "-video_size", "720x576",
        "-input_format", "yuyv422",
        "-framerate", "25",
        "-i", "/dev/video0",

        "-f", "alsa",
        "-thread_queue_size", "8192",
        "-i", "hw:2",

        "-filter_complex",
        "[0:v]split=2[live][rec];" +
        "[live]fps=15,format=yuvj422p[liveout];" +
        "[rec]format=yuv420p[recordout]",

        // =========================
        // OUTPUT 1: Live-MJPEG
        // =========================
        "-map", "[liveout]",
        "-c:v", "mjpeg",
        "-q:v", "7",
        "-f", "mpjpeg",
        "pipe:1"
    ];

    // =========================
    // OUTPUT 2: Aufnahme
    // =========================

    if (recordFile) {

        args.push(
            "-map", "[recordout]",
            "-map", "1:a",

            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",

            "-c:a", "aac",
            "-b:a", "192k",

            "-movflags", "+faststart",

            "-y",
            recordFile
        );
    }

    console.log("Starte Video FFmpeg:");
    console.log("/usr/bin/ffmpeg " + args.join(" "));
    videoRecording = spawn("/usr/bin/ffmpeg", args);

    videoRecording.stdout.on("data", data => {
      for (const res of videoStreamClients) {

            if (!res.writableEnded) {
                res.write(data);
            }
        }
    });

    videoRecording.stderr.on("data", data => {
        console.log("videoRecording FFmpeg:", data.toString());
    });

    videoRecording.on("error", err => {
        console.error("videoRecording FFmpeg Fehler:", err);
        videoRecording = null;
        recVideo.recording = false;
        recVideo.title = null;
      recVideo.recordFile = "";
    });

    videoRecording.on("close", code => {
        console.log(
            "videoRecording FFmpeg beendet. Exit-Code:",
            code
        );
        videoRecording = null;
        recVideo.recording = false;
        recVideo.title = null;
        recVideo.recordFile = "";

      for (const res of videoStreamClients) {

            if (!res.writableEnded) {
                res.end();
            }
        }
      videoStreamClients.clear();
    });
  },
  this.songRecognitionProcess = async function(){
    if ("type" in recAD){
      let tracks = await execCmd("ls ad/song*.wav >&1")
      tracks = tracks.split("\n"); tracks.pop()
      await setAudioCaptureInfo(" - " + tracks.length+" songs detected, start mp3 conversion")
      let z=0
      for (i in tracks){
        tracks[i] = tracks[i].replace(".wav","")
        await execCmd("lame -b 320 --disptime 2 --nohist "+tracks[i]+".wav")
        await setAudioCaptureInfo(" - identify track")
        let info = await execCmd("./songrec audio-file-to-recognized-song "+tracks[i]+".mp3 >&1");
        let parsedInfo = JSON.parse(info);  // Parse the text to JSON if it's in string format
        if ("track" in parsedInfo && tracks.length > 1){
          let t = parsedInfo.track.title+"-"+parsedInfo.track.subtitle
          t=t.replace(/[^a-zA-Z0-9\.\-]/g, "")
          await setAudioCaptureInfo(" "+t)
          let cmd = "mv "+tracks[i]+".mp3 "+devMusic+"/Audio/"+recAD.tapename+"_"+t+".mp3"
          console.log(cmd)
          await execCmd(cmd)
        }else{
          console.log(tracks[i]+": no song recognition")
          await setAudioCaptureInfo(" - transfer Trackname="+recAD.tapename+"-C"+z)
          let cmd = "mv "+tracks[i]+".mp3 "+devMusic+"/Audio/"+recAD.tapename+"-C"+z+".mp3"
          console.log(cmd)
          await execCmd(cmd)
          z++
        }
      }
      await execCmd("mv -f ad/* ad_copy/.")
    }
  },
  this.calcRecEnd = async function(time){
      time = 60000 * time
      console.log("msec=" + time)
      if (!Number.isInteger(time)) 
        time = 60000*constants.AD_MAX_LP_CONVERSION_TIME
      recStoptimeID = setTimeout(stopAudioRecording, time)
      let now = new Date()
      today = new Date(now.getTime() + time + 30000) //1/2 min more til process ends
      d = today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
      h = today.getHours()
      m = today.getMinutes()
      return(d + " " + h +":"+m)
  },
  this.audioTapeExist = async function(inf){
    try{
      if (inf.match("record")){
        let r = await execCmd("ls "+devMusic+"/Audio | grep "+recAD.tapename+"- >&1")
        return r
      }else{
        let tracks = await execCmd("ls "+devMusic+"/Audio >&1")
        tracks = tracks.split("\n"); tracks.pop()
        for (i in tracks){
          if (tracks[i].match(recAD.tapename+"-")) return true
        }
        return false
      }
    }
    catch(err){
      console.log("audioTapeExist() " + err)
    }
  },
  this.audioTapeAnalyze = async function(res){
    recAD.medium="Tape"
    let result = await audioTapeExist("analyze")
    songRecognition(res, result)
    return
  },
  this.audioTapeRecord = async function(res){
    await execCmd("rm -rf ad/*; rm -rf ad_copy/*")
    let result = await audioTapeExist("record")
    if (!result)    
      doRecording(res, true, "audioCaptureTape")
    else{
      procStatus.text = "Der Titel existiert bereits in mediaServer/Music/Audio"
      doTape(res,false)
    }
  },
  this.Mp4Mp3 = async function(title,res){
    rememberDB = "Video"
    trackIndex = -1
    try{
      let title2 = title.replace(/\..*$/, "");
      let result = await execCmd("ls "+devMusic+"/audio >&1")
      if (result.match(title2)){
        console.log("MP4Mp3("+title+") already converted")
        procStatus.text = "MP4Mp3("+title+") already converted, see Audio"
        showMusicDir("Video", res)
      }
      else {
        let cmd = "ffmpeg -i " + devMusic + "/Video/" +title +" -b:a 192K -vn " + devMusic+ "/Audio/" + title2+".mp3"
        console.log(cmd)
        await execCmd(cmd)
        console.log("MP4MP3 converted")
        procStatus.text = "MP4Mp3("+title+") converted, see Audio"
        showMusicDir("Video", res)
      }
    }catch(err){
        console.log("MP4MP3: "+err)
        procStatus.text = "MP4MP3: "+err
        showMusicDir("Video", res)
    }
  },
  this.Mp4Delete = async function (track,res){
    let cmd = "rm -rf "+devMusic+"/Video/"+track
    console.log(cmd)
    await execCmd(cmd)
    showMusicDir("Video", res)
  },
  this.checkGramoTracks = async function(){
    /*
      ...
      # Track 1 - blocks 0 to 5561 - length: 0:09:16.200
      Track01start=0:00:00.000
      Track01end=0:09:16.200

      # Track 2 - blocks 5576 to 7119 - length: 0:02:34.400
      Track02start=0:09:17.600
      Track02end=0:11:52.000
      ...
    */
    try{
      let s = await execCmd("cat ad/all.wav.tracks | grep 'start=0:' >&1");s = s.split("\n");s.pop()
      const startTimes = s.map(t => timeToMs(t.split("=")[1]));
      //check ob aufsteigende Startzeiten
      const valid = startTimes.every((t,i) => i === 0 || t > startTimes[i-1]);
      if (!valid) 
        return false
      await saveNumOfTracks()
      console.log("found "+recAD.number_of_tracks)
      if (recAD.trackCount === recAD.number_of_tracks) 
        return true
      return false 
    }catch(err){
        console.log("checkGramoTracks: "+err)
        return false
    }
  },
  this.checkContinuesSilence = async function(th){
    try{
      loudnessTimes = []
      let r = await execCmd("ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ad/all.wav >&1")
      r = r.split("\n")
      recAD.recTime = r[0]

      await ensureLoudnessLog("ad/all.wav")

      //Many exec() wrappers truncate stdout because of the maxBuffer limit (default ≈200KB in Node).
      //So you do not receive the whole file, even though the file itself has 16372 lines.
      //This is a very common issue with child_process.exec.
      let log = await fsPromises.readFile("ad/lautheit.log","utf8")
      // let log = JSON.parse(dat)
      const THRESHOLD = th; //je kleiner je lauter
      let inSilence = false;
      let start = null;
      //const regex = /t:\s*([\d.]+).*?M:\s*(-?[\d.]+)/;
      const regex = /t:\s*([\d.]+).*?M:\s*(-?\d+\.?\d*)/;
      const lines = log.split("\n");   // log = ffmpeg stderr output
      let oldStart = 0
      let oldEnd = 0
      let old = false
      let push = false
      let lastSilenceStart = null
      let lastSilenceEnd = null
      let lineNum = 0
      for (const line of lines) {
        if (!procStatus.stat) break;
        const match = line.match(regex);
        if (!match) continue;
        const t = parseFloat(match[1]);
        if (t < 10) continue; //ignore first 10s 
        lastSilenceEnd = t
        const m = parseFloat(match[2]);
        // silence start
        if (!inSilence && m < THRESHOLD) {
          inSilence = true;
          start = t;
          if (old){
            if ((start - oldStart) > 10){ // a track should be > 10s
              push = true
            }else{
              oldStart = start
              oldEnd = t
            }
          }
          lastSilenceStart = t
      }
      // silence end
      if (inSilence && m >= THRESHOLD) {
        if (push && ((oldEnd-oldStart) >= 2.0) && ((oldEnd-oldStart) < 6.0)) {
          loudnessTimes.push({
            start: oldStart,
            end: oldEnd,
            diff: oldEnd-oldStart,
            blockstart: Math.floor(oldStart*10),
            blockend: Math.floor(oldEnd*10)
          });
          old = false
          push = false
        }
        if (((t-start) >= 2.0) && ((t-start) < 6.0)){ //silence gap length
          loudnessTimes.push({
            start: start,
            end: t,
            diff: t-start,
            blockstart: Math.floor(start*10),
            blockend: Math.floor(t*10)
          });
        }else{
          if ((start - oldStart) > 10){ // a track should be > 10s
            oldStart = start
            oldEnd = t
            old = true
          }
        }
        inSilence = false;
        start = null;
      }
      }
      if (lastSilenceStart !== null && lastSilenceEnd !== null) {
        loudnessTimes.push({
          start: lastSilenceStart,
          end: lastSilenceEnd,
          diff: lastSilenceEnd-lastSilenceStart,
          blockstart: Math.floor(lastSilenceStart*10),
          blockend: Math.floor(lastSilenceEnd*10),
        });
      }

      console.log("Gaps="+loudnessTimes.length + "for threshold="+th)

      if (loudnessTimes.length === recAD.trackCount)
        return
      if (loudnessTimes.length > recAD.trackCount){
        oldThreshold = th
        newThreshold = th + 1
        oldLength = loudnessTimes.length
        return await checkContinuesSilence(newThreshold)
      }else{
        //if (loudnessTimes.length < oldLength)
        return
      }
      //console.log(JSON.stringify(loudnessTimes, null, 2));
    }
    catch(err){
      console.log(err)
      return constants.SILENCE_FACTOR_INIT
    }
  },
  this.startLautheit = function(){
    let f = 'ad/all.wav'
    if (recAD.medium.match("Tape"))
      f = 'ad/allTape.wav'
    fs.stat(f,(err, stat) => { 
      if (err) {
            procStatus.text = "waitRecEnd()," + err
            stopLautheit("ad/all.wav missing")
            if (recStoptimeID) clearTimeout(recStoptimeID)
            return
      }
      else{
        silenceTimeCnt = 0
        loudness = []
        silenceTime = []
        recAD.peaks=0
        console.log("start watchLautheit()")
        clearInterval(watchSilencePtr)
        watchSilencePtr = setInterval(watchLautheit,constants.SILENCE_INTERVAL_500MS)
      }
    })
  },
  this.stopLautheit = function(msg){
      console.log(msg)
      clearInterval(watchSilencePtr)
      stopADconversion()
      if (recStoptimeID) clearTimeout(recStoptimeID)
      initiateRecEnd(msg)
  },
  this.watchLautheit = function(){
    /* 
    loudness.log meter interpretation:
    Field 	      Meaning	          Explanation
    ----------------------------------------------------------------------
    t	            Time	            Current timestamp in seconds
    TARGET	      Target loudness	  Broadcast standard (usually -23 LUFS)
    M	Momentary   loudness	        ~400 ms window loudness
    S	Short-term  loudness	        ~3 second window loudness
    I	Integrated  loudness	        Overall loudness since start
    LRA	Loudness  Range	            Dynamic range of the audio
    */
    exec("tail -n 1 ad/lautheit.log >&1",(error, stdout, stderr) => {
      if (error) {
          console.error(`Fehler: ${error.message}`);
          stopLautheit(`Fehler: ${error.message}`)
          return;
      }
      if (stderr) {
          console.error(`stderr: ${stderr}`);
          stopLautheit(`stderr: ${stderr}`)
          return;
      }

      const line = stdout;
      const match = line.match(/t:\s*([\d.]+).*M:\s*(-?[\d.]+)/);
      if (match) {
        const t = parseFloat(match[1]);
        const m = parseFloat(match[2]);
        if (t > constants.REC_IGNORE_START_SILENCE_10s) { 
          loudness.push({time:t,momentary:m})
          if (m < constants.SILENCE_DETECTION_35dB){ //je kleiner je leiser
            console.log("M:"+ m + " at time="+t);
            if (++silenceTimeCnt > constants.REC_STOP_SILENCE_10s){
              console.log("stop recording thru watchLautheit()")
              clearInterval(watchSilencePtr)
              if (recStoptimeID) clearTimeout(recStoptimeID)
              stopAudioRecording() //starts analyzing: processwav()
            }
          }else{
            silenceTimeCnt = 0
            if (m >= -0.1){
              //Übersteuerung, peaks
              console.log("recAD.peaks="+recAD.peaks)
              if (++recAD.peaks > constants.MAX_PEAKS){
                console.log(" too many detected peaks " +recAD.peaks)
                stopLautheit(" too many detected peaks " +recAD.peaks)
              }
            }
          }
        }
      }
    })
  },
  this.checkSpikes = async function(){
    try{
      await execCmd("rm -f ad/p*; mv ad/all.wav ad/p0.wav;rm -f ad/dat.txt;touch ad/dat.txt")
      //detect Peaks
      await execCmd("rm -f ad/silence.log;\
        ffmpeg -i ad/p0.wav -af silencedetect=n=-0.1dB:d=0.9,ametadata=print:file=ad/silence.log -f null -")
      let r = await execCmd("cat ad/silence.log | grep silence_end >&1")
      r = r.split("silence_end=");
      var e=[],d=c=0
      for (let i=1; i<r.length; i++){
        let x = r[i].split("\n")
        e[i-1] = x[0]
      }
      console.log("detected peaks:"+e.length)
      var peaks = e.length

      var d=c=0
      if(!peaks){
        await execCmd("mv ad/p0.wav ad/all.wav; rm -f ad/dat.txt; rm -f ad/silence.log")
        return 0
      }else {
        if (peaks > constants.MAX_PEAKS) {
          await execCmd("mv ad/p0.wav ad/all.wav; rm -f ad/dat.txt; rm -f ad/silence.log")
          return peaks
        }
      }
      await setAudioCaptureInfo(" - detected peaks:"+e.length)
      for (let z=0; z<peaks; z++){
        console.log(e)
        let v1=parseFloat(e[0]) - 0.04
        let v2=parseFloat(e[0]) + 0.01
        v1=v1.toString()
        v2=v2.toString()
        c++
        let cmd = "ffmpeg -i ad/p"+d+".wav -ss 0 -t "+v1+" -c copy -y ad/p"+c+".wav"
        //console.log(cmd)
        await execCmd(cmd);
        let t = "file p"+c+".wav"
        cmd = "echo "+ "'"+t + "'" + " >> ad/dat.txt"
        //console.log(cmd)
        await execCmd(cmd)
        c++
        cmd = "ffmpeg -i ad/p"+d+".wav -ss "+v2+" -c copy -y ad/p"+c+".wav"
        //console.log(cmd)
        await execCmd(cmd)

        d=c; e=[]
        cmd = "rm -f ad/silence.log; ffmpeg -y -i ad/p"+d+".wav -af silencedetect=n=-0.1dB:d=0.9,ametadata=print:file=ad/silence.log -f null -"
        //console.log(cmd)
        await execCmd(cmd)
        r = await execCmd("cat ad/silence.log | grep silence_end >&1")
        r = r.split("silence_end=");
        for (let i=1; i<r.length; i++){
          let x = r[i].split("\n")
          e[i-1] = x[0]
        }
        await setAudioCaptureInfo(" - remain peaks:"+e.length)
      }

      //alle ungeraden parts müssen verbunden werden + der letzte part
      t = "file p"+c+".wav"
      await execCmd("echo "+ "'"+t + "'" + " >> ad/dat.txt")

      console.log("build new all.wav")
      await setAudioCaptureInfo(" - build new all.wav" )

      await execCmd("ffmpeg -f concat -safe 0 -i ad/dat.txt -c copy ad/all.wav")
      console.log("erased peaks")
      await execCmd("rm -f ad/p*.wav;rm -f ad/dat.txt; rm -f ad/silence.log")
      await execCmd("mv ad/p0.wav ad/all.wav; rm -f ad/dat.txt; rm -f ad/silence.log")
      return peaks
    }
    catch(err){
      console.log(err)
      await execCmd("mv ad/p0.wav ad/all.wav; rm -f ad/dat.txt; rm -f ad/silence.log")
      return 0
    }
  },
  this.cutSilenceEnd = async function(f){
    //detect silence > 10sec && <= -30dB
    let cmd ="ffmpeg -i "+f+" -af silencedetect=noise=-30dB:d=10 -f null - 2>ad/tapesilence.inf"
    console.log(cmd)
    await execCmd(cmd)
    let s = await execCmd("cat ad/tapesilence.inf | grep silence_start >&1")
    s=s.split("\n")
    let ss=x=[], n=0
    for (i in s){
      if(s[i].match("silence_start:")){
        x=s[i].split("silence_start:")
        ss[n++]=x[1]
      }
    }
    //console.log(f+" silence_start="+ss)
    let e = await execCmd("cat ad/tapesilence.inf | grep silence_end >&1")
    e=e.split("\n")
    let se=[]
    n=0
    for (i in e){
      if(e[i].match("silence_end:")){
        x=e[i].split("silence_end:")
        x=x[1].split("|")
        if (!isNaN(Number(x[0])))
          se[n]=x[0]
        else 
          se[n]=se[n-1]
        n++
      }
    }
    //console.log(f+" silence_end="+se)
    //check real start (ignore peaks)
    let j = 0//index of real start of ss item
    for (let i=1;i<ss.length; i++){
      let d = Math.abs(se[i-1]-ss[i])
      if (d > 20){ //less 20s
        console.log("not sure of real start")
        j = i
      }
    }
    console.log("silence cut start 'til end at "+ss[j])
    if (ss[j]){
      cmd = "ffmpeg -i ad/allTape.wav -to "+ss[j]+" -c copy ad/out.wav;mv ad/out.wav ad/allTape.wav"
      console.log(cmd)
      await execCmd(cmd)
      console.log("cut done")
    }
  },
  this.startPowerUpAudio = async function(){
    //funktioniert nur wenn LINE-OUT in system eingestellt worden ist
    if (settings.mediaOut === "HTTP live streaming")
      return
      // if (powerStart) return
      // powerStart=true
      await stopMusicPlay()

      if (settings.powerUpSoundURL){//} && settings.mediaOut.match("0")){
        console.log("startPowerUpAudio: "+settings.powerUpSoundURL)
        procStatus.marquee = ""
        submitFilter('My-Eq')

        //start play music
        exec(settings.powerUpSoundURL, (error, stdout, stderr) => {
          procStatus.marquee = ""
        })

        let match = settings.powerUpSoundURL.match(/https?:\/\/\S+/);
        let url = match ? match[0] : null;
        if(url){
          //Radio
          url = url.trim().replace(/['"]+$/, '');
          console.log(url);
          if (!intervalRadio)
          intervalRadio = setInterval(getMetadata, constants.META_DATA_INTERVAL)
        }else{
          //fill metadata of audio || ADrecords || radio subdir favorites direct
          procStatus.marquee = path.basename(settings.powerUpSoundURL)
          let inf = path.dirname(settings.powerUpSoundURL)
          inf = inf.split("mediaServer/")
          console.log(inf[1])
          
          if (inf[1].match("Audio")){
            let dir = "Audio" //to do 
            await getAllTracks(dir) // for continues play one after the other
          }
        }
      }
  }

  // this.emailMP3= async function (email,track,res){
  //   console.log(email + " - " + rememberDB + "/" + track)
  //   try {

  //     await validateEmail(email)

  //     var trackpath = devADrecords + "/ADrecords/" + rememberDB + "/Audio/" + track
  //     var cmd = "lame -b 320 --disptime 2 --nohist " + trackpath + " --out-dir help"
  //     console.log(cmd)
  //     await execCmd(cmd)
  //     let s = track.split(".")
  //     var mp3path = "help/" + s[0] + ".mp3"
  //     await sendEmailMp3(email,'echo "This mail, has been sent from MAX MEDIA Server. Enjoy the mp3 !" | mail -s ' + mp3path + ' ' + email + ' -A ' + mp3path + '--content-type=audio/mpeg ' + email )
  //     await execCmd("rm -f help/*.mp3")
  //     showMusicAD(res, "")
  //   }catch(err){
  //     procStatus.text = err;
  //     console.log(err)
  //   }
  // },
  // this.validatestreamMP3 = async function(res,target,em){
  //   try{
  //       procStatus.text = ""
  //       await validateEmail(em)
  //       var a = target.split("|")
  //       var cmd = 'echo "This mail, has been sent from Tonbox Server. Enjoy the mp3 !" | \
  //       mail -s ' + a[2] + ' -A ' + devMusic+"/"+a[0]+"/" + allTracks[a[1]] + ' ' + em 
  //       console.log(cmd)
  //       await sendEmailMp3(em,cmd)
  //       procStatus.text = "email send !"
  //       showMusicDir(rememberDB,res)
  //   }
  //   catch(err){
  //     console.log(err)
  //     procStatus.text = err
  //     var d = dirCheck(rememberDB)
  //     if (d){
  //         if (d == constants.DIR_RADIO_SUB){
  //             //subdir within ../Radio/
  //             rememberDB = "Radio"
  //             showMusicDir("Radio",res)
  //             return
  //           }
  //         else {
  //             if (d == constants.DIR_AUDIO_SUB){
  //                 //subdir within ../Audio/
  //                 rememberDB = "Audio"
  //                 showMusicDir("Audio",res)
  //                 return
  //             }
  //         }
  //     }
   //   }
  // },
  // this.transferMP3Mail = async function (res,src){
  //   try {
  //     var stdout = await execCmd('sudo cat /etc/ssmtp/ssmtp.conf >&1')
  //     if (stdout){
  //       if (stdout.match("mailhub")){
  //         /*
  //         root=postmaster
  //         mailhub=securesmtp.t-online.de:587
  //         AuthUser=<name>
  //         AuthPass=<pass>
  //         UseSTARTTLS=YES
  //         hostname=tonbox
  //         FromLineOverride=YES
  //         */
  //         var result = stdout.split("\n")
  //         var r = result[1].split("=")
  //         r = r[1].split(":")
  //         stdout = await execCmd("ping -c 1 " + r[0])
  //         if (stdout.match("1 received")){
  //           r = result[2].split("=")
  //           if (r[0].match("AuthUser") && (r[1].length > 5)){
  //             r = result[3].split("=")
  //             if (r[0].match("AuthPass") && (r[1].length > 5)){
  //               var s = src[1].split("\"")
  //               var x = Number(s[1])
  //               if (Number.isInteger(x)){
  //                   var t = allTracks[x]
  //                   if (t.match(".mp3") || t.match(".MP3") || t.match(".ogg") || t.match(".OGG")){ 
  //                       var d = src[0].split("\"")
  //                       res.render('pages/emailMusic', {btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, target:d[1] +"|"+s[1]+"|"+t})
  //                       return
  //                   }//else could be subdir
  //                   procStatus.text = "send email: no audio MP3 / OGG file"
  //                   return
  //               }
  //             }
  //           }
  //         }
  //       }      
  //     }
  //     procStatus.text = "Mail Transfer Agent Problem. Korrekt konfiguriert?"
  //   }
  //   catch(err){
  //     console.log(err)
  //     procStatus.text = err
  //   }
  // },
}

