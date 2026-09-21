//for request from server to client without using ESM only version 2.6.1. possible
//defines
global.constants = require('./defines.js')
require('./funcsystem.js')();
//var { settings } = require('./funcsystem.js')
//youtube
require('./funcYoutube.js')();
//slideshow 
require('./funcSlideshow.js')();
//rss news feed
//require('./funcNewsFeed.js')();
//radio
require('./funcRadio.js')();
//Audio-Conversion
require('./funcAudio')();
//Discogs API
require('./funcAudioDiscogs')();
//Music Database images & audio
require('./funcMusicDatabase')();
//HTTP Live Streaming
require('./funcHLS')();
//Equalizer
require('./funcEqualizer')();
const fs = require("fs");
const dns = require("dns");
// Prefer IPv4 for outgoing connections: some radio stream hosts (e.g. radiohost.de)
// publish both A and AAAA records, and this Pi's IPv6 route is intermittently flaky,
// causing sporadic UND_ERR_CONNECT_TIMEOUT on fetch() even though IPv4 works fine.
dns.setDefaultResultOrder("ipv4first");

//CD DVD
require('./funcCD')();

const { Readable } = require('stream');

//in order to update progress at frontend (recording, conversion, analyzing etc.) see here:
//https://www.woolha.com/tutorials/node-js-sse-server-sent-events-example-javascript-client
const SSE = require('./funcSSE');

//musiksuche
//https://www.npmjs.com/package/search-music


global.rememberDB = "";
global.sseData = "";
global.quit_HLS = false
global.systemReady = false

const path = require('path')
//Upload: für eigene Images die in DISCOGS nicht vorhanden sind https://code-boxx.com/upload-files-nodejs-express/
var fileUpload = require('express-fileupload')

// express is a module that can be used to create more than one application.
// The real difference between require('express') and express() is that 
// require('express') allows you to have access to any public functions or properties 
// exposed by module.exports.
var express = require('express');
var bodyParser = require('body-parser') //https://qastack.com.de/programming/24330014/bodyparser-is-deprecated-express-4

var app = express();
app.use(fileUpload());
app.use(bodyParser.json());
app.use(express.json());

// set the view engine to ejs
// EJS als Anzeige-Engine für unsere Express-Anwendung festlegen. 
app.set('view engine', 'ejs');
const urlencodedParser = bodyParser.urlencoded({ extended: true })
//Statische Files (images) müssen in EJS in diesem Verzeichnis plaziert werden 
app.use(express.static("public"));

//generic needs
const { exec, spawn } = require('child_process');

// Global wrapper for exec to promisify shell commands
global.execCmd = function(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                reject(err);
            } else {
                resolve(stdout);
            }
        });
    });
};

function fireAndForget(promise, label) {
    if (promise && typeof promise.catch === 'function') {
        promise.catch((err) => {
            console.log(label + ": " + err)
            logging(label + ": " + err)
        })
    }
}

global.allTracks = [];
global.trackIndex = 0
global.trackState = "done"
global.trackIntervalObj = null
global.musicDir = ""
global.helpData = "not available"
global.sysData = "not available, try update with F5"

var newsFeedSelect = " "
//let ytObj = ""
//---------------------------------
//proStatus.stat wird auf dem Server abgefragt / gesetzt an den entsprechenden Stellen
//proStatus.text wird über footer.ejs angezeigt
//proStatus.marquee (Lauftext) wird über header.ejs angezeigt
global.procStatus = {
    //Bit 0 PROC_STAT_DIGI_ON 01 
            //Konfiguration nicht starten, wenn Digitalisierung ON 
            //Recording Radio nicht starten wenn Digitalisierung ON
    //Bit 1 PROC_STAT_REC_ON 02  
            //Konfiguration nicht starten, wenn Recording Radio ON 
            //Digitalisierung nicht starten wenn Recording Radio ON
    stat: 0,
    text: "ok",
    marquee: ""

};
//---------------------------------

global.webLinks = [{ url: "https://audionautix.com/free-music/blues/", name: "FreeMusic" },
{ url: "https://archive.org", name: "InternetArchive" }]

var ip_config_events = 0
//var ip_config = false
var ip_config_events = 0
var ipConfigTimer = ""


// function addPassword(name,email,hash){
//     this.name = name;
//     this.email = email;
//     this.hash = hash
// }
// function showProc(){
//     console.log("procStatus.stat="+procStatus.stat)
//     console.log(recState)
//     console.log("free="+storage.Music.free+"  myUSBCapture:"+usbState.usbaudiocapture+" devMusic="+devMusic)
// }



async function ping() {
    try {
        var stdout = await execCmd("ping -c 1 archaicblues.de  >&1")
        if (stdout.match("errors")) {
            await logging("ping " + settings.ip + " false")
            return false;
        }
        //check if ip reached router
        result = await execCmd("ip addr | grep " + settings.ip + " >&1")
        await logging("grep ip result:" + result)
        if (!result) {
            return false
        }
        await logging("got the ip !")
        return true
    }
    catch (err) {
        logging("ping: " + err)
        return false
    }
}

async function ipConfig() {
    try {
        if (ip_config_events === 0){
            await doLAN(false)        
            ipConfigTimer = setInterval(ipConfig, 1000)
        }
        if (++ip_config_events < constants.IP_CONFIG_ELAPSED_EVENTS) {
            console.log("ping...")
            // if (!ip_config) {
            //     var s = "wait ip config ..." + ip_config_events
            //     await logging(s)
            //     return
            // }
            // else {
                if (ping_required) {
                    if (!ping()) {
                        console.log("wait ping ..." + ip_config_events)
                        await logging("wait ping ..." + ip_config_events)
                        return
                    }
                }
            // }
            clearInterval(ipConfigTimer)
            ping_required = false
            console.log("wait ping: configureTonbox")
            await configureTonbox()
            console.log("wait ping: startWebApp")
            startWebApp()
        }
    }
    catch (err) {
        logging(err)
        console.log("wait ping.. " + err)
    }
}


function startWebApp() {
    execCmd("ip addr >&1")
        .then((result) => {
            logging(result)
        })
        .catch((err) => {
            console.log("startWebApp ip addr: " + err)
            logging("startWebApp ip addr: " + err)
        })

     app.listen(8000, settings.ip, function (err) {
        if (err) {
            console.log("app.listen:" + err)
            logging("ERROR = " + err)
        }
        else {
            console.log("nodeJS server listen on " + settings.ip + ":8000")
            console.log("__dirname=" + __dirname)
            logging("listen on " + settings.ip + ":8000")
            global.systemReady = true
            startPowerUpAudio()

            //console.log('Plattform:', os.platform());
        }
    })
}

async function showVideo(res, uri) {
    await stopMusicPlay(constants.AUDIO_MPV)
    console.log("showVideo " + uri)
    procStatus.text = ""
    //checkAudioAC3(res,uri)
    var cmd = "ffprobe " + uri + " 2>&1 >/dev/null | grep Stream >&1"
    console.log(cmd)
    try{
        result = await execCmd(cmd)
        if (result.match("Video: h264")){
            if (result.match("ac3")){
                console.log("ac3 need to convert: "+subdir[x]+" in "+dirs[i])
                await convertAC3(uri)
                res.render('pages/showVideo', {pageInfo:pageInfo,vol:volumeAudioOut,btDevice: bluez,recording: getScheduledJobsWithoutTimeout(),
                    pState: procStatus,vidsrc: uri, convert: true,})
            } else
            res.render('pages/showVideo', {pageInfo:pageInfo,vol:volumeAudioOut,btDevice: bluez,recording: getScheduledJobsWithoutTimeout(),
                pState: procStatus,vidsrc: uri, convert: false, settings:settings,})
         }else{
            //no video stream
            await execCmd("rm " + uri)
            procStatus.text = "no video stream detected in "+uri
            res.render('pages/showVideo', {pageInfo:pageInfo,vol:volumeAudioOut, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: allTracks, dir: 0, settings:settings, indexStart: 0, loc: rememberDB, vidsrc: uri, convert: false, })
        }
    }
    catch(err){
        console.log(err)
        res.render('pages/showVideo', {pageInfo:pageInfo,vol:volumeAudioOut, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: allTracks, dir: 0, settings:settings, indexStart: 0, loc: rememberDB, vidsrc: uri, convert: false,  })
    }
}


/*
    Wenn Client eine Aktion macht wird die aktuelle Zeit Ta festgehalten.
    Wenn das logout Interval abgefeuert wird, wird die vergangene Zeit berechnet 
    Tv = aktuelle Zeit - Ta
    Ist Tv > 1h dann auto logout/record stop
*/
const MS_TIME_60000 = 60000 //every minute
const MS_TIME_600000 = 600000 //every hour
//var clientActionTime = Date.now()
const timeoutObj = 0//setInterval(autoLogout,MS_TIME_60000);todo


//sw update check********************************************
app.get("/api/version", (req, res) => {
    console.log("version check")
    try {
        const version = fs.readFileSync(
            "/home/pi/ArchaicNodeEJS/current/VERSION",
            "utf8"
        );

        res.json({
            status: "ok",
            version: version.trim()
        });

    } catch (e) {
        res.json({
            status: "error",
            version: "unknown"
        });
    }
});

app.get("/health", (req, res) => {
    try {
        // -----------------------
        // UPDATE STATE (source of truth)
        // -----------------------
        let update = "idle";

        if (fs.existsSync("help/update_status")) {
            update = fs.readFileSync("help/update_status", "utf8").trim();
        }
        const systemReady = update === "installed" && global.systemReady === true;
        res.json({
            status: "ok",
            update,
            systemReady
        });
    } catch (err) {
        res.status(500).json({
            status: "error",
            update: "unknown",
            uptime: process.uptime()
        });
    }
});
/***********************************************    */





// index page
//Es ist wichtig zu beachten, dass res.render() in einem Ansichten-Ordner nach der Ansicht sucht. 
//Wir müssen also nur pages/index definieren, da der vollständige Pfad views/pages/index lautet.
app.get('/', function (req, res) {
    endSlideShow()

    //clientActionTime=Date.now()
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    setInitialPage(res)
});


app.post('/storage', urlencodedParser, function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    if (req.body.Back) {
        setInitialPage(res)
        return
    }
    if (req.body.Mount) {
        createUSB(req.body.Mount, res);
        return;
    }
    if (req.body.Create) {
        createUSB(req.body.Create, res);
        return;
    }
    if (req.body.Overwrite) {
        createUSB(req.body.Overwrite, res);
        return;
    }
    if (req.body.createSD) {
        fireAndForget(checkMediaServerOnSD(""), "checkMediaServerOnSD")
        getBlockdevice(res, "sys")
        return;
    }
    if (req.body.SDcard) {
        fireAndForget(checkSD(), "checkSD")
        setInitialPage(res)
        return;
    }
    setInitialPage(res)
});

app.get('/entry', function (req, res) {
    endSlideShow()
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    ledGreen("Off")
    fireAndForget(killplayAux(), "killplayAux")
    killVideoCapture()
    switch(req.query.src) {
        case "radio":
        ledGreen("On")
        pageInfo = "Radio"
        rememberDB = "Radio/Suchen"
        res.render('pages/radioStation', {pageInfo:pageInfo,
            dat: stationCount, search:radioUserSearch, rd:radioFound,
            btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
            pState: procStatus, rec: getRadioRec(),
            settings:settings,
            vol: volumeAudioOut,
            play: radioPlayIndex,
        });
        break;

        case "radioFavorites":
        ledGreen("On")
        pageInfo = "My Radio"
        rememberDB = "Radio/Favorites"
        loadRadioHistory(res);
        break;

        case "cdmob":
        if (cdripping)
        {
            //if (!checkRipping()) break;
            procStatus.text = "cd capture / ripping on going ..."
            pageInfo = "Radio"
            rememberDB = "Radio/Suchen"
            res.render('pages/radioStation', {pageInfo:pageInfo,
                dat: stationCount, search:radioUserSearch, rd:radioFound,
                btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
                pState: procStatus, rec: getRadioRec(),
                settings:settings,
                vol: volumeAudioOut,
                play: radioPlayIndex,
            });
            return
        }
        pageInfo="cd";
        rememberDB = "cd"
        //check if device is present
        fireAndForget(checkCDdrive(res), "checkDisc")
        break;

        case "vinyl":
        pageInfo="Vinyl"
        fireAndForget(showMusicAD(res, ""), "showMusicAD")
        break;

        case "captureVinyl":
        pageInfo="Capture Vinyl"
        discogsResult.state = constants.DISCOGS_RESULT_STATE_EXIST
        fireAndForget(audioCapture(res), "audioCapture")
        rememberDB="audioCapture"
        break;

        case "captureTape":
        pageInfo="Capture Tape"
        procStatus.text = "USB Audio Capture Device: " + usbState.usbaudiocapture
        rememberDB="audioCaptureTape"
        fireAndForget(doTape(res,false), "doTape")
        break;

        case "playAudioCapture":
        pageInfo="play Audio Capture"
        procStatus.text = "USB Audio Capture Device: " + usbState.usbaudiocapture
        rememberDB="playAudioCapture"
        fireAndForget(playAudioCapture(res), "playAudioCapture")
        break;

        case "captureVideo":
        pageInfo="Capture Video"
        procStatus.text = "USB Video Capture Device: " + usbState.usbaudiocapture
        rememberDB="captureVideo"
        fireAndForget(doVideo(res,false), "doVideo")
        break;

        case "audio":
        rememberDB = "Audio"
        pageInfo = "Audio"
        //Hauptverzeichnis
        trackIndex = -1
        showMusicDir("Audio", res)
        var vol = 80+settings.jackVolume*0.15
        vol = Math.round(vol)
        setCardVolume(vol)
        break;

        case "shutdown":
        shutdownSystem()
        break;

        case "video":
        rememberDB = "Video"
        pageInfo = "Video"
        fireAndForget(stopMusicPlay(constants.AUDIO_ALL), "stopMusicPlay")
        //Hauptverzeichnis
        trackIndex = -1
        showMusicDir("Video", res)
        break;

        case "gallery":
        pageInfo="Galery"
        rememberDB = "Pictures"
        showPicDir(res)
        break;

        default:
        setInitialPage(res);
    }
});

app.post('/entry', urlencodedParser, function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    procStatus.text = ""
    SSEIntervalTyp = constants.SSE_INACTIVE
    //kill eventually a running slide show
    endSlideShow()
    execCmd("sudo killall ffmpeg")
    if (req.body.StopPlayx) {
        stopMusicPlay(constants.AUDIO_ALL)
    }
    let b = JSON.stringify(req.body)
    progressInfo = " "; sseData = ""

    ledGreen("Off")
    switch (b) {
        case '{"Radio":""}':
            ledGreen("On")
            pageInfo = "Radio"
            rememberDB = "Radio/Suchen"
            res.render('pages/radioStation', {pageInfo:pageInfo,
                dat: stationCount, search:radioUserSearch, rd:radioFound,
                btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
                pState: procStatus, rec: getRadioRec(),
                settings:settings,
                vol: volumeAudioOut,
                settings:settings,
                play: radioPlayIndex,
            });
        break;

        case '{"CD":""}':
            stopMusicPlay(constants.AUDIO_ALL)
            rememberDB = "cd"
            res.render('pages/cddvd', {pageInfo:pageInfo,recAD:recAD,
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
        break;

        case '{"Web-Links":""}':
            pageInfo="Web Links"
            res.render('pages/entryLinks', { settings:settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, weblinks: webLinks, webshow: -1 })
            break;

        default:
            pageInfo=""
            setInitialPage(res)
    }
});


app.get('/audioProcessWav', function (req, res) {
    res.render('pages/audioProcessWav', { btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: "extract tracks from all.wav in progress", audioInfo: progressInfo, discogs: discogsResult, tracks: "", ip: settings.ip, sysdir: settings.installDir })
});

app.post('/audioProcessWav', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));

    if (req.body.Filter) {
        res.redirect('../audioProcessWav')
        return
    }

    initiateRecEnd("ended by user")
    if (!req.body || req.body.Back) {
        killProc("gramocli")
        res.render('pages/audioCapture', {pageInfo:pageInfo, settings:settings, silenceFacor: silenceFactor, recSide: recSide, page: "normal", storage: storage, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: "stop playing", audioInfo: progressInfo, discogs: discogsResult, recAD: recAD, userSave: adjustRenameState.userCheck, getPara: false,   vol: settings.jackVolume, settings:settings })
        return
    }

    setInitialPage(res)
})


app.post('/reverb', urlencodedParser, function (req, res) {
    procStatus.text = ""
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    setReverb(req.body, res)
})

//modal window and volume only, no equalizer.ejs !
app.post('/equalizer', urlencodedParser, function (req, res) {
    procStatus.text = ""
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));

    if (req.body.SaveFilter) {
        saveFilter(req.body.SaveFilter)
    }

    if (req.body.setVolumeSettings) {
        setVolumeSettings(req.body.setVolumeSettings)
    }

    if (req.body.filter) {
        submitFilter(req.body.filter)
    }
    sendHLS(res, "")
})

app.post('/audioCaptureTape', urlencodedParser, function (req, res) {
    procStatus.text = ""
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    if (usbState.usbaudiocapture == constants.USB_NOK){
        procStatus.text = "No USB capture device connected"
        setInitialPage(res)
        return
    }

    if (!req.body || req.body.Back) {
        //add JSON KeyPair
        pageInfo = ""
        if (recStoptimeID) clearTimeout(recStoptimeID)
        setInitialPage(res)
        return
    }

    if (req.body.MonitorLevel) {
        monitorLevel(res,'audioCaptureTape',req.body.MonitorLevel)
        return
    }


    if (req.body.Analyze) {
        console.log("Analyze Tape ")
        progressInfo = ""
        fireAndForget(audioTapeAnalyze(res), "audioTapeAnalyze")
        return
    }


    if (req.body.Auto) {
        if (!availableSpace("Music", 1073741824)) {//1GB
            procStatus.text = "no free storage of 1GB available"
            doTape(res,false)
            return
        }
        if (req.body.tapename){
            recAD = req.body
            recAD.medium = "Tape"
            if (!procStatus.stat) {
                progressInfo = ""
                fireAndForget(audioTapeRecord(res), "audioTapeRecord")
            }else{
                procStatus.text = "Failure: stop radio recording process first"
                fireAndForget(doTape(res,false), "doTape")
            }
        }
        else{
            if (usbState.usbaudiocapture == "nok") {
                procStatus.text="USB Audio Capture Device not installed"
                setInitialPage(res)
                return
            }
            procStatus.text = "no titel given"
            fireAndForget(doTape(res,false), "doTape")
        }
        return
    }
    if (req.body.RecordingStop) {
        fireAndForget(stopADconversion(), "stopADconversion")
        progressInfo = ""  
        fireAndForget(doTape(res,false), "doTape")
        return
    }
    res.redirect("../audioCaptureTape")
})


app.post('/captureVideo', urlencodedParser, function (req, res) {
    procStatus.text = ""
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    const action = req.body && req.body.action ? String(req.body.action) : "";
    if (req.body.Back) {
        setInitialPage(res)
        return
    }

    if (usbState.usbvideocapture && usbState.usbvideocapture === "ok"){

        if (action === "ViewVideo" || req.body.viewVideo) {
            console.log("View Video Capture ")
            fireAndForget(doVideo(res,false, ""), "doVideo")
            return
        }


        if (action === "RecVideo" || req.body.recVideo) {
            console.log("Capture Video ")
            progressInfo = ""
            const videoTitle = String(req.body.videoTitle || "").trim()
            const videoFileName = path.extname(path.basename(videoTitle)) ? path.basename(videoTitle) : path.basename(videoTitle) + ".mp4"
            const videoRecordFile = path.join(devMusic, "Video", videoFileName)
            recVideo.title = videoTitle
            recVideo.recordFile = videoRecordFile
            recVideo.stopTitle = ""
            fireAndForget(doVideo(res, true, videoRecordFile), "doVideo")
            return
        }

        if (action === "StopRec") {
            console.log("View Video Capture ")
            recVideo.stopTitle = recVideo.recordFile || recVideo.title
            recVideo.title = ""
            fireAndForget(doVideo(res,true, ""), "doVideo")
            return
        }
    }
    setInitialPage(res)
})

app.get("/video-audio", (req, res) => {
    res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
        "Connection": "close"
    });

    videoAudio = spawn("/usr/bin/ffmpeg", [
        "-f", "alsa",
        "-i", "hw:2",
        "-c:a", "libmp3lame",
        "-b:a", "128k",
        "-f", "mp3",
        "pipe:1"
    ]);

    videoAudio.stdout.pipe(res);

    videoAudio.stderr.on("data", data => {
        console.error("FFmpeg AUDIO:", data.toString().trim());
    });

    req.on("close", () => {
        // if (!ffmpeg.killed) {
        //     ffmpeg.kill("SIGINT");
        // }
    });

    videoAudio.on("close", () => {
        if (!res.writableEnded) {
            res.end();
        }
    });
});
app.get("/video-recording-stream", (req, res) => {
    res.writeHead(200, {
        "Content-Type": "multipart/x-mixed-replace; boundary=ffmpeg",
        "Cache-Control": "no-cache",
        "Connection": "close",
        "Pragma": "no-cache"
    });
    if (!(videoStreamClients instanceof Set)) {
        videoStreamClients = new Set();
    }
    videoStreamClients.add(res);
    console.log(
        "Video Stream Client verbunden:",
        videoStreamClients.size
    );

    if (!videoRecording) {
        startVideoRecording(recVideo.recordFile || recVideo.title);
    }
    req.on("close", () => {
        videoStreamClients.delete(res);
        console.log(
            "Video Stream Client getrennt:",
            videoStreamClients.size
        );

        /*
         * FFmpeg NICHT sofort beenden.
         *
         * Besonders wichtig während einer Aufnahme.
         */
    });
});
app.get("/video-view-stream", (req, res) => {

    res.writeHead(200, {
        "Content-Type": "multipart/x-mixed-replace; boundary=ffmpeg",
        "Cache-Control": "no-cache",
        "Connection": "close",
        "Pragma": "no-cache"
    });

    videoView = spawn("/usr/bin/ffmpeg", [
        "-f", "v4l2",
        "-standard", "PAL",
        "-video_size", "720x576",
        "-input_format", "yuyv422",
        "-i", "/dev/video0",
        "-vf", "fps=15",
        "-f", "mpjpeg",
        "-q:v", "7",
        "pipe:1"
    ]);

    videoView.stdout.on("data", data => {
        res.write(data);
    });

    videoView.stderr.on("data", data => {
        console.error("FFmpeg:", data.toString());
    });

    videoView.on("error", err => {
        console.error("FFmpeg spawn error:", err);
        if (!res.headersSent) {
            res.status(500).end("ffmpeg start failed");
            return;
        }
        if (!res.writableEnded) {
            res.end();
        }
    });

    req.on("close", () => {
        //
    });

    videoView.on("close", () => {
        if (!res.writableEnded) {
            res.end();
        }
    });
});

app.post('/songRecognitionProcess', urlencodedParser, function (req, res) {
    procStatus.text = ""
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    setInitialPage(res)
})



app.get('/audioCapture', function (req, res) {
    res.render('pages/audioCapture', {pageInfo:pageInfo, settings:settings, silenceFacor: silenceFactor, recSide: recSide, page: "normal", storage: storage, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, audioInfo: getAudioCaptureSize(), discogs: discogsResult, recAD: recAD, userSave: adjustRenameState.userCheck, getPara: false,   vol: settings.jackVolume, settings:settings })
});


app.post('/audioCapture', urlencodedParser, async function (req, res) {
    try{
        procStatus.text = ""
        console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));

        if (req.body.recordingStop) {
            stopADconversion()
            procStatus.stat &= ~constants.PROC_STAT_DIGI_ON;
            progressInfo = ""  
            audioCapture(res)
            return
        }

        if (req.body.Discogs) {
            discogsInput(res)
            return
        }

        if (usbState.usbaudiocapture == constants.USB_NOK){
            procStatus.text = "No USB capture device connected"
            setInitialPage(res)
            return
        }

        recAD = req.body
        //generates recAD.Auto, recAD.Format etc !
        sseData = "";
        setRecSide()

        if (!req.body || req.body.Back) {
            if (recStoptimeID) clearTimeout(recStoptimeID)
            setInitialPage(res)
            return
        }

        if (req.body.userSave === "ADrecords") {
            if (!saveADrecords("vinyl"))
                console.log("saveADrecords failed !")
            setInitialPage(res)
            return
        }

        if (req.body.Analyze) {
            analyzeAllwav(res,req.body.side)
            return
        }

        if (req.body.UploadImage) { //filter out the errors so that they will not be output to your console. In more detail: 2 represents the error descriptor, which is where errors are written to. By default they are printed out on the console.
            checkNewImages(res)
            return
        }

        if (req.body.CheckExist) {
            recAD.medium = "Disc"
            const result = await checkVinylRecExist()
            res.json({ exists: result === constants.DISCOGS_RESULT_STATE_IN_ADRECORDS })
            return
        }

        //client pressed F5 (resend)
        // if (SSEIntervalTyp == constants.SSE_AD_CONVERSION) {
        //     res.render('pages/audioCaptureStop', {pageInfo:pageInfo,page:"audioCapture", settings:settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: "", audioInfo: progressInfo, stoptime: 0, recAD: recAD, getPara: false,   setting: settings, ip: settings.ip, sysdir: settings.installDir })
        //     return
        // }

        if (recAD.Auto) {
            if (!availableSpace("ADrecords", 275184000)) { //ca. 26min WAV
                procStatus.text = "no data storage found. Try USB initialization"
                return res.redirect("../audioCapture")
            }

            if ((discogsResult.state != constants.DISCOGS_RESULT_STATE_EXIST) && (discogsResult.state != constants.DISCOGS_RESULT_STATE_IN_ADRECORDS)) {
                procStatus.text = "No track naming possible, no valid discogs data"
                /*
                Server now returns a JSON error for fetch-based Auto recording start
                When the error text is set to No track naming possible, no valid discogs data:
                If request is JSON, server responds with HTTP 409 and JSON payload including redirect: /
                Non-JSON requests still use setInitialPage as before
                */
                if (req.is('application/json')) {
                    return res.status(409).json({
                        ok: false,
                        reason: "discogs-invalid",
                        message: procStatus.text,
                        redirect: "/"
                    })
                }
                setInitialPage(res)
                return
            }

            if (!procStatus.stat){
                stopMusicPlay(constants.AUDIO_ALL)
                doRecording(res, req.body.type, "audioCapture")
                return
            }
            else{
                procStatus.text = "another captureAudio process is still running, stop it first"
                res.redirect("/")
            }
            return
        }

        if (req.body.MonitorLevel) {//convert wav and save mp3
            monitorLevel(res,'audioCapture',req.body.MonitorLevel)
            return
        }

        if (req.body.killPlay) {
            stopMusicPlay(constants.AUDIO_ALL)
            res.redirect('../audioCapture')
            return
        }

        //should never come here
        setInitialPage(res)
    }
    catch(err){
        console.log(err)
        setInitialPage(res)
    }
})


app.get('/showADrecords', function (req, res) {
    procStatus.text = ""
    res.render('pages/showADrecords', { btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: allTracks, dir: 0, baseimages: allCovers, settings:settings, indexStart: -1, vol: volumeAudioOut })
})

app.post('/showADrecords', urlencodedParser, function (req, res) {
    procStatus.text = ""
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));

    if (!req.body || req.body.Back) {
        pageInfo="Vinyl"
        showMusicAD(res, "")
        return
    }

    if (req.body.StopPlayx) {
        //audio out on 3,5mm jack
        stopMusicPlay(constants.AUDIO_ALL)
        //selectMusicDBtrack(rememberDB,res,-1)
        res.render('pages/showADrecords', { btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: allTracks, dir: 0, baseimages: allCovers, settings:settings, indexStart: -1,vol: volumeAudioOut,  })
    }

    // if (req.body.SucheDir) {
    //     showSearchADrecords(res, req.body.SucheDir)
    //     return
    // }
    if (req.body.DirBack) {
        pageInfo="Music"
        setInitialPage(res)
        progressInfo = " "
        // discogsResult.state = constants.DISCOGS_RESULT_STATE_EXIST
        // audioCapture(res)
        return
    }

    if (req.body.User) {
        res.render('pages/trackImageUpload', {pageInfo:pageInfo, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, audioInfo: progressInfo, discogs: discogsResult, image: "only" })
        return
    }

    // if (req.body.emailMP3) {
    //     if (req.body.emailMP3[1].match("wav")) {
    //         emailMP3(req.body.emailMP3[0], req.body.emailMP3[1], res)
    //         return
    //     }
    // }


    if (req.body.check) {
        trackIndex = 0
        if (req.body.check.match(".wav") || req.body.check.match(".WAV") || req.body.check.match(".MP3") || req.body.check.match(".mp3")) {
            //Track
            stopMusicPlay(constants.AUDIO_MPV)
            playADRecord(res, req.body.check)
        } else {
            //Verzeichnis
            resetMP3select(false)
            pageInfo="Vinyl"
            selectMusicDBtrack(req.body.check, res, -1)
            rememberDB = req.body.check
            return
        }
    }
})


app.get("/cddvd", (req, res) => {
    if (req.body.query){
        discogsSearchItem.Title = req.body.query;
        if (discogsSearchItem.Title === "empty"){
            discogsDone(res,"disc")
            return
        }
    }
    let t = 0
    if (req.body.track) 
        t = req.body.track
    cdDvd(req.body.action, t, res)
});

app.post('/cddvd/editor-images', async function (req, res) {
    try {
        if (!req.files) {
            return res.status(400).json({ ok: false, error: 'No files uploaded' });
        }

        const pickFile = (entry) => {
            if (!entry) return null;
            return Array.isArray(entry) ? entry[0] : entry;
        };

        const file1 = pickFile(req.files.image1);
        const file2 = pickFile(req.files.image2);

        if (!file1 && !file2) {
            return res.status(400).json({ ok: false, error: 'No editor images provided' });
        }

        const imagesDir = path.join(__dirname, 'public', 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        const dest1 = path.join(imagesDir, 'image1.jpg');
        const dest2 = path.join(imagesDir, 'image2.jpg');
        try { fs.unlinkSync(dest1); } catch (e) {}
        try { fs.unlinkSync(dest2); } catch (e) {}

        const moveFile = (upload, target) => new Promise((resolve, reject) => {
            upload.mv(target, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        const convertToJpg = async (upload, dest, idx) => {
            const tmp = path.join(imagesDir, `editor_upload_${idx}_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
            await moveFile(upload, tmp);
            try {
                await execCmd("convert " + JSON.stringify(tmp) + " -auto-orient -strip -quality 92 " + JSON.stringify(dest) + " >&1");
            } catch (err) {
                fs.copyFileSync(tmp, dest);
            } finally {
                try { fs.unlinkSync(tmp); } catch (e) {}
            }
        };

        if (file1) await convertToJpg(file1, dest1, 1);
        if (file2) await convertToJpg(file2, dest2, 2);

        const uploaded = [];
        if (fs.existsSync(dest1)) uploaded.push('public/images/image1.jpg');
        if (fs.existsSync(dest2)) uploaded.push('public/images/image2.jpg');

        if (!cdInfo || typeof cdInfo !== 'object') {
            cdInfo = { tracks: [], images: [], discogsTitel: 'empty' };
        }
        cdInfo.images = uploaded.slice();

        if (!discogsResult || typeof discogsResult !== 'object') {
            return res.status(500).json({ ok: false, error: 'discogsResult not available' });
        }
        discogsResult.image = [];
        for (let i = 0; i < uploaded.length; i++) {
            discogsResult.image[i] = uploaded[i];
        }

        return res.json({ ok: true, images: uploaded });
    } catch (err) {
        console.log('editor image upload failed: ' + err);
        return res.status(500).json({ ok: false, error: 'editor image upload failed' });
    }
});

app.post('/cddvd', urlencodedParser, async function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    procStatus.text = ""
    if (req.body.action === "save" || req.body.saveEntry || req.body.Save) {
        return res.status(400).json({ error: "Save action is disabled on CD/DVD page" });
    }
    if (req.body.Back)
        return setInitialPage(res)
    if (req.body.query || req.body.queryArtist){
        discogsSearchItem.Artist = req.body.queryArtist;
        discogsSearchItem.Title = " "//req.body.query;
        discogsSearchItem.discType = ""
    }
    let track = 0
    if (req.body.track) {
        track = req.body.track
    }
    if (!req.body.query) stopMusicPlay()

    if (cdripping){
        procStatus.text = "cd ripping on going ..."
        pageInfo = "Radio"
        rememberDB = "Radio/Suchen"
        res.render('pages/radioStation', {pageInfo:pageInfo,
            dat: stationCount, search:radioUserSearch, rd:radioFound,
            btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
            pState: procStatus, rec: getRadioRec(),
            settings:settings,
            vol: volumeAudioOut,
            play: radioPlayIndex,
        });
        return
    }

    if (req.body.move){
        moveCDAudiodata(res)       
        return
    }

    if (req.body.capture){
        const submittedDiscTitle = String(req.body.discTitle || "").trim();
        if (submittedDiscTitle) {
            if (!cdInfo || typeof cdInfo !== "object") {
                cdInfo = { tracks: [], images: [], discogsTitel: "empty" };
            }
            cdInfo.discogsTitel = submittedDiscTitle;
            if (typeof cleanFilenameNoPromise === "function") {
                discogsResult.info = await cleanFilenameNoPromise(" ", submittedDiscTitle);
            } else {
                discogsResult.info = submittedDiscTitle;
            }
        }
        const selectedDisc = String(req.body.selectedDisc || "all").trim();
      //check if already present
        if (await checkCDRecExist(selectedDisc)){
            if (req.is('application/json')) {
                res.status(409).json({
                    ok: false,
                    reason: 'cd-recording-exists',
                    message: 'CD recording already exists',
                    closeModal: true
                });
            } else {
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
            return
      }
      

        if (req.body.tracklistJson) {
            try {
                const parsedTracklist = JSON.parse(req.body.tracklistJson);
                if (Array.isArray(parsedTracklist) && parsedTracklist.length > 0) {
                    cdInfo.tracks = parsedTracklist;
                }
            } catch (err) {
                console.log("Invalid tracklistJson for CD capture: " + err);
            }
        } else {
            if (selectedDisc !== "all" && cdInfo && Array.isArray(cdInfo.tracks)) {
                const selectedTracks = cdInfo.tracks.filter((t) => String(t.disc) === selectedDisc);
                if (selectedTracks.length > 0) {
                    cdInfo.tracks = selectedTracks;
                }
            }
        }

        if (cdInfo){
            maxCDtracks=cdInfo.tracks.length
            if (maxCDtracks > 0)
            {
//                if (discogsSearchItem.Title && discogsSearchItem.Artist){
                if (!discogsResult.cd.length){
                    //keine discogsInfo, client nutzte editor!
                    //die Info wird für spätere Prozesse benutzt, da es auch für "Vinyl" gilt..
                    discogsResult.info = cdInfo.discogsTitel
                    discogsResult.cd = {}
                    for (let i = 0; i < cdInfo.tracks.length; i++) {
                        const t = cdInfo.tracks[i] || {}
                        discogsResult.cd[i] = t.title || t.titel || ""
                    }
                }
                captureCD(res)
                return
            //     }
            }
            // if (discogsSearchItem.Title && discogsSearchItem.Artist && req.body.tracklistJson){
            //     captureCD(res)
            //     return
            // }
        }
        if (maxCDtracks != 0){  
            procStatus.text = "missing info of disc"
            res.render('pages/cdInput', {
                btDevice: bluez, 
                recording: getScheduledJobsWithoutTimeout(),
                pState: procStatus, 
                rec: getRadioRec(),
                settings:settings,
                maxTitel: maxCDtracks
            });
            return //next see post '/cdinput
        }else{
            checkCDdrive(res)
            return
        }
    }
    if (req.body.action === "captureAux") {
        const submittedDiscTitle = String(req.body.discTitle || "").trim();
        if (submittedDiscTitle) {
            if (!cdInfo || typeof cdInfo !== "object") {
                cdInfo = { tracks: [], images: [], discogsTitel: "empty" };
            }
            cdInfo.discogsTitel = submittedDiscTitle;
            if (typeof cleanFilenameNoPromise === "function") {
                discogsResult.info = await cleanFilenameNoPromise(" ", submittedDiscTitle);
            } else {
                discogsResult.info = submittedDiscTitle;
            }
        }
        const selectedDisc = String(req.body.selectedDisc || "all").trim();
        if (req.body.tracklistJson) {
            try {
                const parsedTracklist = JSON.parse(req.body.tracklistJson);
                if (Array.isArray(parsedTracklist) && parsedTracklist.length > 0) {
                    cdInfo.tracks = parsedTracklist;
                }
            } catch (err) {
                console.log("Invalid tracklistJson for AUX capture: " + err);
            }
        } else if (selectedDisc !== "all" && cdInfo && Array.isArray(cdInfo.tracks)) {
            const selectedTracks = cdInfo.tracks.filter((t) => String(t.disc) === selectedDisc);
            if (selectedTracks.length > 0) {
                cdInfo.tracks = selectedTracks;
            }
        }

        if (!availableSpace("ADrecords", 1073741824)) {//1 GB
            procStatus.text = "no data space left... need 1 GB"
            return res.redirect("../cddvd")
        }
        if (cdInfo.tracks.length > 1){
            if (!discogsResult.cd.length){
                //keine discogsInfo, client nutzte editor!
                //die Info wird für spätere Prozesse benutzt, da es auch für "Vinyl" gilt..
                discogsResult.info = cdInfo.discogsTitel
                discogsResult.cd = {}
                for (let i = 0; i < cdInfo.tracks.length; i++) {
                    const t = cdInfo.tracks[i] || {}
                    discogsResult.cd[i] = t.title || t.titel || ""
                }
            }

            stopMetadata()
            stopMusicPlay(constants.AUDIO_ALL)
            recAD.type = "CD"
            recAD.medium = "AUX"
            //rewriteCDinfo()
            recAD.trackCount = cdInfo.tracks.length
            doRecording(res, "none", "captureAux")
            return
        }
        procStatus.text = "no cdInfo !"
        setInitialPage(res)
        return

        //test
        //startWavAnalyzer()
    }
    cdDvd(req.body.action, req.body.track, res)
})

app.post('/cdInput', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    procStatus.text = ""
    //need for captureCD(res): discogsResult.info, discogsResult.image[], cdInfo.tracks[].titel
    //calls also captureCD(res):
    saveUserInfoCD(res,req.body.cdNumber, req.body.artist,req.body.discTitle,req.body.tracks,req.body.images)
})

app.post('/playAudioCapture', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    procStatus.text = ""
    if (req.body.Back){
      if (playAUX){
        killplayAux()
      }
      rememberDB="Radio/Suchen"
      setInitialPage(res)
    }
})

app.get("/showMusicWorld", (req, res) => {
    const video = req.query.convert;
    if (req.query.src === "Mediatheken"){
        pageInfo = "Mediatheken"
        res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"", settings:settings, searchYouTube: searchYouTube, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), 
        pState: procStatus, yttitle:ytTitle, ytVideoId:ytVideoId, ytFound: ytFound, mediathekSearchItem: ""})
        //rememberDB = req.body.check
        return
    }
    if (req.query.src === "myUSB"){
        pageInfo = "myUSB"
        rememberDB = "myUSB"
        res.render('pages/usbAudio',{
            pageInfo:pageInfo,settings:settings, 
            btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
            pState:procStatus, basetracks:myUSB, dirMain:0, 
            indexStart:0, loc:rememberDB,vol:volumeAudioOut
        })         
        return
    }
    Mp4Mp3(video,res)
});


app.post('/myUSB', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    procStatus.text = ""
    if (req.body.Back) {
        if (req.body.Back === "Back") {
            setInitialPage(res)
            return
        }
    }
    if (req.body.Play){
        playUsbAudio(res,req.body.Play)
        return
    }
    if (req.body.StopPlay){
        stopMusicPlay(constants.AUDIO_ALL)
    }
    res.render('pages/usbAudio',{
        pageInfo:pageInfo,settings:settings, 
        btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
        pState:procStatus, basetracks:myUSB, dirMain:0, 
        indexStart:0, loc:rememberDB,vol:volumeAudioOut
    })         
})


app.post('/showMusicWorld', urlencodedParser, async function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    procStatus.text = ""

    // if (typeof req.body.check === "string") {
    //     const parts = req.body.check.split("=")
    //     if (parts.length >= 2) {
    //         const rawScope = parts.shift()
    //         const scope = String(rawScope || "").replace(/"/g, "").trim()
    //         const track = parts.join("=")
    //         req.body.check = scope + "=" + track
    //         if (scope) {
    //             rememberDB = scope
    //         }
    //     }
    // }

    if (req.body === "") {
        res.render('pages/showMusicWorld',{pageInfo:pageInfo, settings:settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: allTracks, dirMain: 0, dir: 0, indexStart: 0, loc: rememberDB, vidsrc: "0", vol: volumeAudioOut })
        return
    }
    if (req.body.Back) {
        if (req.body.Back === "Back") {
            setInitialPage(res)
            return
        }
        // if (req.body.Back === "dirMain") {
        //     if (rememberDB.match("Music Media")){
        //         setInitialPage(res)
        //         return
        //     }
        //     if ((rememberDB.length > 6) && !rememberDB.match("Radio/Suchen")) {
        //         //subdir, go back
        //         rememberDB = "Radio"
        //         pageInfo = "Radio"
        //         showMusicDir("Radio", res)
        //         return
        //     }
        //     pageInfo="Music"
        //     setInitialPage(res)
        //     return
        // }
        if (req.body.Back.match("Delete")){
            deleteTrack(res, req.body.Back)
            return
        }
        setInitialPage(res)
    }

    if (req.body.subdir) {
        if (rememberDB.match("Radio")) {
            pageInfo = "Radio"
            rememberDB = "Radio/" + req.body.subdir
            showMusicDir("Radio/" + req.body.subdir, res)
            return
        }
        if (rememberDB.match("Audio")) {
            pageInfo = "Audio"
            showMusicDir("Audio", res)
            return
        }
        if (rememberDB.match("videoplay")) {
            let sel = { "ckeck": "video" }
            pageInfo = "Video"
            rememberDB = "Video"
            playMusic(res, sel, false)
            return
        }
    }

    if (req.body.StopPlayx) {
        stopMusicPlay(constants.AUDIO_ALL)
        if (rememberDB == "videoplay") {
            res.render('pages/showMusicWorld',{pageInfo:pageInfo, settings:settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: allTracks, dirMain: 0, dir: 0, indexStart: trackIndex, loc: "Video", vidsrc: "0", vol: volumeAudioOut})
        } else
            res.redirect("../radioFavorites")//showMusicDir(rememberDB, res)//setInitialPage(res)
        return
    }
    // if (req.body.Favorites) {
    //     pageInfo = "Radio"
    //     rememberDB = "Radio/Favorites"
    //     loadRadioHistory(res)
    //     return
    // }

    // if (req.body.Radiostation) {
    //     pageInfo = "Radio"
    //     rememberDB = "Radio/Suchen"
    //     res.render('pages/radioStation', {pageInfo:pageInfo,
    //         dat: stationCount, search:radioUserSearch, rd:radioFound,
    //         btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
    //         pState: procStatus, rec: getRadioRec(),
    //         settings:settings,
    //         vol: volumeAudioOut,
    //         settings:settings,
    //         play: radioPlayIndex,
    //     });
    //     return
    // }

    if (req.body.delete) {
        Mp4Delete(req.body.delete,res)
        return
    }


    // //check email send
    // var src = JSON.stringify(req.body)
    // src = src.split(":")
    // if (src[0].match("Radio") || src[0].match("Audio")) {
    //     transferMP3Mail(res, src)
    //     return
    // }
    if (req.body.uploadAudio) {
        console.log("uploadAudio")
        uploadMedia(res,req.files,"Audio")
//        res.redirect("/")
        return
    }
    if (req.body.uploadVideo) {
        console.log("uploadVideo")
        if (req.files){
            if (req.files.upfile.name.match(".mp4") || req.files.upfile.name.match(".MP4")) {
                uploadMedia(res,req.files,"Video")
                return
            }
        }
        procStatus.text = "upload error: only mp4 files allowed"
        res.redirect("/")
        return
    }
    // if (req.body.check.match("Audio")) //{
    //     rememberDB = "Audio"
    //     if (req.body.check.length <= 5) {
    //         pageInfo = "Audio"
    //         //Hauptverzeichnis
    //         trackIndex = -1
    //         showMusicDir(req.body.check, res)
    //         var vol = 80+settings.jackVolume*0.15
    //         vol = Math.round(vol)
    //         setCardVolume(vol)
    //         // playMusic(res,sel,delUser)
    //         return
    //     }
    // }else
    // if (req.body.check.match("Video")) {
    //     rememberDB = "Video"
    //     pageInfo = "Video"
    //     if (req.body.check.length <= 5) {
    //         stopMusicPlay(constants.AUDIO_ALL)
    //         //Hauptverzeichnis
    //         trackIndex = -1
    //         showMusicDir(req.body.check, res)
    //         return
    //     }
    //     if (req.body.check.match(".mp4") || req.body.check.match(".MP4")) {
    //         var uri = devMusic + "/" + req.body.check
    //         console.log("enter " + uri)
    //         res.render('pages/showMusicWorld',{pageInfo:pageInfo, settings:settings,
    //             btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus,
    //             basetracks: allTracks,
    //             dirMain: 0,
    //             dir: 0,
    //             indexStart: -1,
    //             loc: "Video",
    //             vol: volumeAudioOut,
    //             vidsrc: uri,
    //             vol: ""
    //         })
    //         rememberDB = "videoplay"
    //         return
    //     }
    // }else
    // if (req.body.check.match("YouTube")) {
    //     pageInfo = "Mediatheken"
    //     res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"", settings:settings, searchYouTube: searchYouTube, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), 
    //     pState: procStatus, yttitle:ytTitle, ytVideoId:ytVideoId, ytFound: ytFound, mediathekSearchItem: ""})
    //     rememberDB = req.body.check
    //     return
    // }else
    // if (req.body.check.match("Radio")) {
    //     pageInfo = "Radio"
    //     let dir = req.body.check
    //     dir = dir.split("=")
    //     rememberDB = dir[0]
    // }


    trackIndex = -1
    var delUser = false
    if ((req.body.Delete != void 0) || (req.body.Rename != void 0)) {
        if (req.body.Delete != void 0)
            var n = req.body.Delete
        else var n = req.body.Rename
        n = parseInt(n)
        if (n >= 0 && allTracks[0]) {
            var track = allTracks[n]
            track = escapeTrack(track)
            if (req.body.Delete != void 0) {
                var cmd = "rm -f " + devMusic + "/" + rememberDB + "/" + track
            } else {
                const requestedName = String(req.body.NewName || "").trim()
                const originalExt = path.extname(track)
                const requestedBase = requestedName.replace(/\.[^.]+$/, "")
                const cleanBase = await cleanFilenameNoPromise("", requestedBase)
                const newName = cleanBase + originalExt
                const srcPath = devMusic + "/" + rememberDB + "/" + track
                const dstPath = devMusic + "/" + rememberDB + "/" + newName
                var cmd = "mv -f " + JSON.stringify(srcPath) + " " + JSON.stringify(dstPath)
            }
            console.log(cmd)
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error(error)
                    procStatus.text = stderr + "  Note: Das Verzeichnis wird automatisch gelöscht, wenn es leer ist"
                    res.render('pages/showMusicWorld',{pageInfo:pageInfo, settings:settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: allTracks, dirMain: 0, dir: 0, indexStart: trackIndex, loc: rememberDB, vidsrc: "0", vol: volumeAudioOut})
                    return
                }

                if (req.body.Delete != void 0)
                    delUser = true
                playMusic(res, req.body.check, delUser)
                //return
            })
        } else {
            res.render('pages/showMusicWorld',{pageInfo:pageInfo, settings:settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: allTracks, dirMain: 0, dir: 0, indexStart: 0, loc: rememberDB, vidsrc: "0", vol: volumeAudioOut })
        }
    } else {
        playMusic(res, req.body.check, delUser)
    }
})

// app.post('/emailMusic', urlencodedParser, function (req, res) {
//     console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
//     if (req.body.Back == "Back") {
//         showMusicDir(rememberDB, res)
//         return
//     }
//     if (req.body.Send) {
//         validatestreamMP3(res, req.body.Send, req.body.email)
//         return
//     }
//     showMusicDir(rememberDB, res)
// })


app.get('/sseEndTape', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    rememberDB="audioCaptureTape"
    doTape(res,false)
})

app.get('/sseEndDisc', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    audioCapture(res)
})

app.post('/discogsResult', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    if (req.body.ok) {
        audioCapture(res)
        return;
    }
    if (req.body.upload) {
        res.render('pages/trackImageUpload', {pageInfo:pageInfo, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, audioInfo: progressInfo, discogs: discogsResult, image: "all" })
        return;
    }
    discogsInput(res)
})

app.post('/trackImageUpload', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    if (!req.body || req.body.Back) {
        saveTracknames(req.body,"edit")
        progressInfo = " "
        audioCapture(res)
        return
    }

    if (req.body.Delete) {
        clearDiscogsResult()
        discogsInput(res)
        return
    }

    if (!req.body.SubmitImage) {
        getImageFilesFromUser(req, res)
        return
    } 


    // //console.log("Upload: " + JSON.stringify(req.files));
    // //https://github.com/richardgirges/express-fileupload/tree/master/example#basic-file-upload
    // //uploaded file & destination
    // if (req.files) {
    //     getImageFilesFromUser(req, res)
    //     return
    // } else
    //     res.render('pages/audioCapture', {pageInfo:pageInfo, settings:settings, silenceFacor: silenceFactor, recSide: recSide, page: "normal", storage: storage, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: "all.wav: " + getAudioCaptureSize(), audioInfo: progressInfo, discogs: discogsResult, recAD: recAD, userSave: adjustRenameState.userCheck, getPara: true,   vol: settings.jackVolume, settings:settings })
})


app.post('/discogsInput', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    if (req.body.editInfo){
        //res.render('pages/trackImageUpload', {pageInfo:pageInfo, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, audioInfo: progressInfo, discogs: discogsResult, image: "all" })
        res.render('pages/audioUpload', {pageInfo:pageInfo, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, audioInfo: progressInfo, discogs: discogsResult, image: "all" })
        return;
    }
    if (req.body.Artist) 
        discogsSearchItem.Artist = req.body.Artist;
    if (req.body.Title) {
        discogsSearchItem.Title = req.body.Title;
        discogsSearchItem.discType = "Vinyl";
        searchDiscogs(res)
        return;
    }
    setInitialPage(res)
})




// app.post('/dlna', urlencodedParser, function (req, res) {
//     res.redirect('/');
// })

app.post('/rssfeednews', urlencodedParser, function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))

    if (req.body.rssfeed == "") {
        res.redirect('/');
    } else {
        if (newsFeedSelect == "Newsfeed-Reader All") {
            checkActualNews(req.body.rssfeed, res)
        } else {
            checkEcoNews(req.body.rssfeed, res)
        }
    }
})

app.post('/rssfeed', urlencodedParser, function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    if (req.body.Back || (req.body.rssfeed == "")) {
        setInitialPage(res)
        return
    }


    if (newsFeedSelect == "Newsfeed-Reader All") {
        checkActualNews(req.body.rssfeed, res)
    } else {
        checkEcoNews(req.body.rssfeed, res)
    }
})

app.post('/youtube', urlencodedParser, function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))

    if ("ytsearch" in req.body){
        if (req.body.ytsearch) 
            searchYouTube = req.body.ytsearch
        ytSearch(searchYouTube, res).catch(console.error);
        ytObj = searchYouTube
        return
    }

    if (req.body.mediatheksearch) {
        res.render('pages/youtube', {pageInfo:pageInfo, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, mediathekSearchItem: req.body.mediatheksearch })
    }

    if (req.body.url && req.body.title) {
        if (devMusic != "nok") {
            if (req.body.dlMP4) {
                if (SSEIntervalTyp.match(constants.SSE_INACTIVE)) {
                    set_ytMP4(1)
                    downloadYT(req.body.url, res, req.body.title)
                    return
                }
            }
            if (req.body.dlMP3) {
                set_ytMP4(0)
                downloadYTconvertMp3(req.body.url, "", "Yes")
                procStatus.text = ""
                SSEIntervalTyp = constants.SSE_DL_RUNNING
                res.render('pages/dlProgress', { btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, progress: " ", ip: settings.ip, sysdir: settings.installDir })
            }
            else
                setInitialPage(res)
        }
        else
            setInitialPage(res)
        return
    }

    if (!req.body || req.body.Back) {
        setInitialPage(res)
        return
    }

    res.render('pages/youtube', {pageInfo:pageInfo, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, mediathekSearchItem: "" })
})

app.post('/youtubeselect', urlencodedParser, function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    stopMusicPlay(constants.AUDIO_ALL)
    pageInfo="Mediatheken"

    if (req.body.Back && !req.body.ytsearch) {
        if (req.body.Back.match("youtube")) {
            res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"", settings:settings, searchYouTube: searchYouTube, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), 
            pState: procStatus, yttitle:ytTitle, ytVideoId:ytVideoId, ytFound: ytFound, mediathekSearchItem: ""})
            return
        }
        pageInfo="Music"
        //setInitialPage(res)
        setInitialPage(res)
        return
    }

    if (req.body.mediatheksearch) {
        res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"", settings:settings, searchYouTube: searchYouTube, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, yttitle: "", ytFound: 0, mediathekSearchItem: req.body.mediatheksearch })

    }

    if (req.body.url && req.body.title) {
        if (devMusic != "nok") {
            if (req.body.dlMP4) {
                if (SSEIntervalTyp.match(constants.SSE_INACTIVE)) {
                    set_ytMP4(1)
                    downloadYT(req.body.url, res, req.body.title)
                    return
                }
            }
            if (req.body.dlMP3) {
                set_ytMP4(0)
                downloadYTconvertMp3(req.body.url, "", "Yes")
                procStatus.text = ""
                SSEIntervalTyp = constants.SSE_DL_RUNNING
                res.render('pages/dlProgress', { btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, progress: " ", ip: settings.ip, sysdir: settings.installDir })
            }
            else
                setInitialPage(res)
        }
        else
            setInitialPage(res)
        return
    }

    if (req.body.video) {
        res.redirect(ytUrl[req.body.video])
        return
    }
    if (req.body.convert) {
        console.log("Youtube2MP3=" + ytUrl[req.body.convert])
        set_ytMP4(0)
        res.render('pages/email', { btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, progress: " " })

        indexYT = req.body.convert
        return
    }
    if (req.body.download) {
         if (SSEIntervalTyp.match(constants.SSE_NONE_CLEAR_INTERVAL)) {
            var item = req.body.download.split(",")
            var title = item[1].replace(/[^a-zA-Z0-9\.\-]/g, "")
            title = escapeTrack(title)
            set_ytMP4(1)
            downloadYT(ytUrl[item[0]], res, title)
            return
        }
        else
            setInitialPage(res)
        return
    }

    if ("ytsearch" in req.body){
        if (req.body.ytsearch) 
            searchYouTube = req.body.ytsearch
        ytSearch(searchYouTube, res).catch(console.error);
        ytObj = searchYouTube
        return
    }

    procStatus.text = "keinen Wert gefunden"
    setInitialPage(res)
})


app.post('/dlProgress', urlencodedParser, function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    if (!req.body || req.body.Back) {
        killProc("yt-dlp")
        SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
        removePart()
        rememberDB="Video"
        let data = fs.readFileSync('help/listRadio.txt',"utf8")
            // if (err) {
            //     console.error(err)
            //     res.render('pages/showMusicWorld',{pageInfo:pageInfo, settings:settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: allTracks, dirMain: 0, dir: 0, indexStart: 0, loc: "Video", vidsrc: "0", vol: settings.jackVolume})
            // }
            // else {
                all = data.toString();
                allTracks = all.split("\n");
                if (allTracks.length > 1) allTracks.pop()
                trackIndex++ //um 1 erhöhen wegen Abfragemechanismus in showMusicWorld.ejs
                let sel = {"ckeck":"video"}
                playMusic(res,sel,false)
                trackIndex--
//            }
        return
    }
    let sel = {"ckeck":"video"}
    playMusic(res,sel,false)
})

app.post('/videoConvertProgress', urlencodedParser, function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    if (!req.body || req.body.Back) {
        SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
    }
    setInitialPage(res)

})

app.post('/showVideo', urlencodedParser, function (req, res) {
    console.log("rememberDB="+rememberDB + "\n*** Url: " + req.url + ", body:" + JSON.stringify(req.body))
    procStatus.text = ""
    stopMusicPlay(constants.AUDIO_MPV)
    if (req.body.ConvertAC3) {
        if (!convert_ac3_active) convertAC3(req.body.ConvertAC3)
        else procStatus.text = "convertAC3 ist bereits aktiv"
    }
    showPicSubDir(res, rememberSubDir, "")
})



// app.post('/email', urlencodedParser, function (req, res) {
//     console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
//     if (req.body.Back == "Back") {
//         res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"", settings:settings, searchYouTube: searchYouTube, btDevice: bluez, 
//         recording: getScheduledJobsWithoutTimeout(), pState: procStatus, yttitle: ytTitle, ytVideoId:ytVideoId})
//         return
//     }
//     if ((req.body.email) || (req.body.Save == "Yes")) {
//         if (SSEIntervalTyp.match(constants.SSE_DL_RUNNING)) {
//             res.render('pages/dlProgress', { btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, progress: " ", ip: settings.ip, sysdir: settings.installDir })
//             return
//         }
//         if (req.body.Save) {
//             if (!availableSpace("Music", 10240)) {
//                 res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"", settings:settings, searchYouTube: searchYouTube, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: "kein gültiger Speicherplatz: Eventuell in Konfiguration USB Speicher trennen & initialisieren! ", yttitle: ytTitle})
//                 return
//             }
//         }
//         //console.log("email is " + req.body.email + ", converting " + ytUrl[indexYT])
//         downloadYTconvertMp3(ytUrl[indexYT], indexYT, req.body.email, req.body.Save)
//         procStatus.text = ""
//         SSEIntervalTyp = constants.SSE_DL_RUNNING
//         res.render('pages/dlProgress', { btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, progress: " ", ip: settings.ip, sysdir: settings.installDir })
//         return
//     }
//     procStatus.text = "not saved, no valid email"
//     res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"", settings:settings, searchYouTube: searchYouTube, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), 
//     pState: procStatus, yttitle: ytTitle, ytVideoId:ytVideoId, mediathekSearchItem: ""})
// })


app.post('/radioStation', urlencodedParser, async function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    endSlideShow()
    pageInfo = "Radio"

    // if (req.body.BackSearch) {
    //     setInitialPage(res)
    //     return
    // }

    if (req.body.Favorites) {
        pageInfo = "Radio Recordings"
        rememberDB = "Radio/Favorites"
        loadRadioHistory(res)
        return
    }

    if (req.body.AddFav) {
        pageInfo = "Radio Recordings"
        rememberDB = "Radio/Favorites"
        addRadioFavorit(req.body.AddFav,res)
        return
    }

    if (req.body.Playx) {
        radioPlay(req.body.Playx, res)
        return
    }
    if (req.body.StopPlayx) {
        stopMusicPlay(constants.AUDIO_ALL)
        showResultAgain(res)
        return
    }
    if (req.body.NextStations != null) {
        const requestedOffset = Number.parseInt(req.body.NextStations, 10);
        const currentOffset = Number.parseInt(req.body.currentOffset, 10);
        let nextOffset = Number.isFinite(requestedOffset) ? requestedOffset : 0;
        if (!Number.isFinite(requestedOffset) && Number.isFinite(currentOffset)) {
            nextOffset = currentOffset;
        }

        if (nextOffset < 0) {
            nextOffset = 0;
        }

        if ((!Array.isArray(radioFound) || radioFound.length <= nextOffset) && typeof loadRadioSearch === "function") {
            await loadRadioSearch();
        }

        const totalStations = Array.isArray(radioFound) ? radioFound.length : 0;
        if (totalStations === 0) {
            doRenderRadioStation(res, -1);
            return;
        }

        if (nextOffset >= totalStations) {
            nextOffset = totalStations;
        }

        // Cumulative mode: keep already visible stations and append the next 50.
        const visibleCount = nextOffset === 0
            ? Math.min(totalStations, 50)
            : Math.min(totalStations, Math.max(50, nextOffset + 50));

        const pageStations = radioFound.slice(0, visibleCount).map((station, idx) => ({
            ...station,
            idx
        }));

        res.render('pages/radioStation', {pageInfo:pageInfo,
            dat: totalStations, search:radioUserSearch, rd:pageStations,
            btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
            pState: procStatus, rec: getRadioRec(),
            settings:settings,
            vol: volumeAudioOut,
            play: radioPlayIndex,
            stationOffset: 0,
            hasMoreStations: visibleCount < totalStations,
            nextOffset: visibleCount
        });
        return;
    }
    if (Object.keys(req.body.country)) {
        let l = req.body.country
        if (l.match(",")){
            l = l.split(",")[0].trim()
        } 
        let g = req.body.genre
        if (g.match(",")){
             g = g.split(",")[0].trim()
        }
        retrieveRadiodata(res, l.toLowerCase(), g.toLowerCase(), req.body.station, req.body.bitrate)
        return
    }

    doRenderRadioStation(res, -1)
});


app.post('/radioFavorites', urlencodedParser, function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    pageInfo="Radio"
    endSlideShow()
    if (!req.body || req.body.Back) {
        if (req.body.Back.match("Delete")){
            deleteTrack(res,req.body.Back)
            return
        }
        if (req.body.Back === "track"){
            pageInfo = "Radio Favorit Records"
            rememberDB = "Radio/Favorites"
            loadRadioHistory(res)
            return
        }
        pageInfo = "Radio"
        rememberDB = "Radio/Suchen"
        res.render('pages/radioStation', {pageInfo:pageInfo,
            dat: stationCount, search:radioUserSearch, rd:radioFound,
            btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
            pState: procStatus, rec: getRadioRec(),
            settings:settings,
            vol: volumeAudioOut,
            settings:settings,
            play: radioPlayIndex,
        });
        return
    }

    if (req.body.stoprec) { 
        let jobId = req.body.stoprec;
        if (scheduledRadioRecJobs.length > 0){
            for (let i in scheduledRadioRecJobs){
                if (scheduledRadioRecJobs[i].jobId === jobId){
                    stopRadioRecording(scheduledRadioRecJobs[i].radioUrl,scheduledRadioRecJobs[i].stationName)
                }
            }
        }
        return res.json({ success: true });
    }
    if (req.body.Remove) {
        killRecPID(req.body.Remove, "history", "")
        setTimeout(removeHistory, 500, req.body.Remove, res)
        return
    }

    if (req.body.Streamx != null) { //will allow index 0
        radioHistoryPlay(req.body.Streamx, res)
        return
    }
    if (req.body.Playx != null) { //will allow index 0
        radioPlay(req.body.Playx, res)
        return
    }
    if (req.body.StopPlayx) {
        stopMusicPlay(constants.AUDIO_ALL)
        radioHistoryStop(res)
        return
    }
    if (req.body.radioDir) {
        rememberDB = "Radio/"+req.body.radioDir //see later showMusicWorld.js
        showRadioDir(req.body.radioDir, res)
        return
    }

    showMusicDir("Radio", res)
})


app.post('/scheduleRecording', (req, res) => {
    scheduleRadioRecording(req,res)
});


app.post('/picvids', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));

    //kill eventually running slide show
    endSlideShow()
    rememberDB = "Pictures"
    procStatus.text = ""
    quit_HLS = true

    if (req.body.DirBack) {
        setInitialPage(res);
        return
    }

    if (req.body.show) {
        if (req.body.show.match(".mp4") || req.body.show.match(".MP4")) {
            var uri = devHome + "/Pictures/" + req.body.show
            showVideo(res, uri)
            return
        }
        pageInfo=req.body.show
        showPicSubDir(res, req.body.show, "")
        return
    }

    if ((req.files) && (req.body.targetDir)) {
        uploadPics(res, req.body.targetDir, req.files)
        return
    }
    if (req.body.Rename) {
        if (req.body.Name)
            renamePicDir(req.body.Rename, req.body.Name, res)
        else {
            procStatus.text = "kein Verzeichnisname angegeben"
            showPicDir(res)
        }
        return
    }
    if (req.body.Create) {
        createPicDir(res, req.body.Create)
        return
    }
    if (req.body.Entfernen) {
        deletePicDir(req.body.Entfernen, res)
        return
    }

    showPicDir(res)
})


app.post('/picDir', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));

    //kill eventually running slide show
    endSlideShow()
    procStatus.text = ""
    quit_HLS = true
    if (req.body.DirBack){
        if (rememberSubDir){
            rememberSubDir = ''
            showPicDir(res)
        }
        else
            res.redirect("/")
            return
        }

    // if (req.body.mediaTest) {
    //     stopMusicPlay(constants.AUDIO_ALL)
    //     playMediaShow(mediaList, req.body.pauseTime)
    //     setInitialPage(res) //mediaShow(res,req.body.pauseTime)
    //     return
    // }
    if (req.body.mediaShow) {
        stopMusicPlay(constants.AUDIO_ALL)
        mediaShow(res,req.body.pauseTime)
//        prepareSlideshow(req.body.slideShow, req, res)
        return
    }
    //show a pic or a video
    if (req.body.show) {
        if (req.body.show.match(/\./)) {
            var p = req.body.show.split("/")
            p.pop()
            var dir = ""
            var i = 0; for (i in p) {
                if (p[i])
                    dir += p[i] + "/"
            }
            if (req.body.show.match(".jpg") ||
                req.body.show.match(".JPG") ||
                req.body.show.match(".JPEG") ||
                req.body.show.match(".jpeg") ||
                req.body.show.match(".png") ||
                req.body.show.match(".PNG") ||
                req.body.show.match(".bmp") ||
                req.body.show.match(".BMP")) {
                var bigpath = devHome + "/Pictures/" + req.body.show
                showPicSubDir(res, dir, bigpath)
                return
            } else {
                var uri = devHome + "/Pictures/" + req.body.show
                if (req.body.show.match("Videoformat wandeln")) {
                    var mp4File = req.body.show.substr(0, req.body.show.length - 21)
                    convertVideo(res, dir, mp4File)
                    return
                }
                //stopMusicPlay(constants.AUDIO_ALL)
                showVideo(res, uri)
                return
            }
        } else {
            showPicSubDir(res, req.body.show, "")
            return
        }
    }

    if (req.body.backward || req.body.forward) {
        const current = req.body.backward || req.body.forward
        const rel = current.replace(/^\/+/, '')
        const folder = rel.includes('/') ? rel.substring(0, rel.lastIndexOf('/')) : (rememberSubDir || '')
        const file = rel.split('/').pop()
        let list = Array.isArray(slideDirs) ? slideDirs.filter(item => item && item.trim() !== '') : []
        let mediaList = []
        for (item in list){
            //remove mp4 for pics
            if (!list[item].match(".mp4")) mediaList.push(list[item])
        }
        if (mediaList.length > 0 && file) {
            const index = mediaList.indexOf(file)
            if (index >= 0) {
                let nextIndex = req.body.forward
                    ? (index + 1) % mediaList.length
                    : (index - 1 + mediaList.length) % mediaList.length
                let target = folder ? folder + '/' + mediaList[nextIndex] : mediaList[nextIndex]
                let dir = folder.split("/")

                //const bigpath = devHome + '/Pictures/' + target
                showPicSubDir(res, dir[dir.length-1], target)
                return
            }
        }
    }

    if (req.body.Delete) { //pic
        deletePicVidItem(req.body.Delete, res)
        return
    }
    if (req.body.Entfernen) { //dir!
        deletePicVidItem(req.body.Entfernen, res)
        return
    }

    if (req.body.Rotate) {
        const rotatePath = String(req.body.Rotate || '').trim();
        const normalizedRotatePath = rotatePath.startsWith('/') ? rotatePath : (rotatePath.startsWith('home/') ? '/' + rotatePath : rotatePath);
        rotateSlide(normalizedRotatePath, res)
        return
    }

    if (req.files) {
        uploadPics(res, req.files)
        return
    }
    if (req.body.Rename) {
        if (req.body.Name) {
            //renamePicDir(req.body.Rename,req.body.Name,res)
            if (req.body.Name.isArray)
                var newName = req.body.Name[0];
            else
                var newName = req.body.Name;
            renamePicVidDir(req.body.Rename, newName, res)
        }
        else {
            // console.log("rename path=" + path[path.length-2])
            procStatus.text = "kein Verzeichnisname angegeben"
            showPicSubDir(res, rememberSubDir, "")
        }
        return
    }
    if (req.body.Create) {
        let dirs = req.body.Dir.split("/")
        if (dirs.length < constants.MAX_PIC_SUBDIRS)
            createPicDir(res, req.body.Create)
        else {
            procStatus.text = "Anzahl Sub-Verzeichniss erreicht"
            showPicSubDir(res, rememberSubDir, "")

        }
        return
    }

    if (req.body.Back) {
        pageInfo="Galery"
        console.log("rememberSubDir=" + rememberSubDir)
        var d = req.body.Back.split("/")
        var nextDir = ""
        if (d.length > 1) {
            for (n in d) {
                if (d[n])
                    if (n < (d.length - 1))
                        nextDir += d[n] + "/"
            }
            nextDir = nextDir.substring(0, nextDir.length - 1)
            nextDir = nextDir.replace(":", "")
            showPicSubDir(res, nextDir, "")
            return
        } else {
            rememberSubDir = ""
            showPicDir(res)
            return
        }
    }
    procStatus.text = "kein Verzeichnis angegeben"
    if (rememberSubDir)
        showPicSubDir(res, rememberSubDir, "")
    else
        showPicDir(res)
})


app.post('/mediaShow', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    if (req.body.Back) {
        console.log("rememberSubDir=" + rememberSubDir)
        showPicDir(res)
        return
    }

    // if(req.body.Pause){
    //     console.log("received mediaShow Pause")
    // }
    // procStatus.text = "kein Verzeichnis angegeben"
    // if (rememberSubDir)
    //     showPicSubDir(res, rememberSubDir, "")
    // else
    showPicDir(res)
})

app.post('/slideButton', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));

    //kill eventually running slide show
    endSlideShow()

    if (!req.body || req.body.Back) {
        showPicDir(res)
        return
    }

    if ((req.files) && (req.body.targetDir)) {
        uploadPics(res, req.body.targetDir, req.files)
        return
    }

    if ((req.body.old) && (req.body.new)) {
        renamePicDir(req.body.old, req.body.new, res)
        return
    }
    res.redirect('/')
})



app.post('/videoShow', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));

    if (!req.body || req.body.Back) {
        setInitialPage(res)
        return
    }
    var uri = req.body.slideShow //??
    showVideo(res, uri)
})

app.get('/stoprec', function (req, res) {
    //    //clientActionTime=Date.now()
    endSlideShow()
    killAllRec()
    doRadioTransfer("all")
    doRenderRadio(res)
    procStatus &=~constants.PROC_STAT_REC_ON //delete Bit
});


app.get('/system', function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    if (fs.existsSync("help/tonbox_update_finished")) {
        fs.unlinkSync("help/tonbox_update_finished");
        return res.redirect("/");
    }
    if (!procStatus.stat){
        stopMusicPlay(constants.AUDIO_ALL)
        doSystem(res)
    }else{
        procStatus.text = "Abgelehnt: ein recording Prozess läuft"
        setInitialPage(res);

    }
});

app.post('/system', urlencodedParser, async function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    if (fs.existsSync("help/tonbox_update_finished")) {
        fs.unlinkSync("help/tonbox_update_finished");
        return res.redirect("/");
    }

    if (req.body.sys == "restart") {
        //siehe auch /etc/systemd/system/Tonbox.service
        res.send("Server wird neu gestartet...");
        process.exit(0);
        return
    }

    if (req.body.sys == "UPDATE") {
        updateTonbox(res)
        return
    }

    if (req.body.sys == "CHECKTV") {
        checkTV(res)
        return
    }

    if (req.body.pass && req.body.SSID) {
        wifiConfigUser(res, req.body.SSID, req.body.pass)
        return
    }

    if (req.body.mediaSet) 
        setSoundDevice(req)

    procStatus.text = ""

    writeMediaSettings(req.body.mediaSet)
    if (req.body.Back) {
        setInitialPage(res);
        return
    }

    if (req.body.sys == "Back") {
        switch (rememberDB) {
            case "Radio":
                console.log("TBD: return to Radio")
                //...
                //return
                break;
            case "Audio":
                console.log("TBD: return to Audio")
                //...
                //return
                break;
            case "Video":
                console.log("TBD: return to Vidio")
                //...
                //return
                break;
            case "Radio/Suchen":
                res.render('pages/radioStation', {pageInfo:pageInfo,
                    dat: stationCount, search:radioUserSearch, rd:radioFound,
                    btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
                    pState: procStatus, rec: getRadioRec(),
                    settings:settings,
                    vol: volumeAudioOut,
                    settings:settings,
                    play: radioPlayIndex, 
                });
                return;
            case "Radio/Favorites":
                loadRadioHistory(res)
                return;
            case "audioCapture":
                audioCapture(res)
                return;                
            case "showMusicWorld":
                setInitialPage(res)
                return;

            default:
                console.log("return back unkown")
                break;
        }
        setInitialPage(res);
        return
    }
    if (req.body.sys == "UMOUNT") {
        try {
            await umountUSB()
        } catch (err) {
            console.log("UMOUNT error:", err)
        }
        doSystem(res)
        return
    }
    if (req.body.sys == "INIT") {
        try {
            await getBlockdevice("")
        } catch (err) {
            console.log("INIT error:", err)
        }
        doSystem(res)
        return;
    }

    if (req.body.setting) {
        doSettings(res,req.body.setting)
        return
    }

    if (req.body.sys == "REBOOT") {
        rebootSystem()
        return;
    }
    if (req.body.sys == "SHUTDOWN") {
        shutdownSystem()
    }
    if (req.body.MP4codecs) {
        procStatus.text = ""
        SSEIntervalTyp = constants.SSE_VIDEO_CONVERSION
        res.render('pages/videoConvertProgress', {pageInfo:pageInfo, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, progress: " ", ip: settings.ip, sysdir: settings.installDir })
        convertImproperVideos()
        return
    }
    res.redirect("../system")
})

app.post('/systemSettings', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    configSettings(res, req.body)
})

app.post('/apiKeySet', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    validateAPI(req.body.youtubeKey, req.body.discogsUserToken, res)
})

app.get('/howto', function (req, res) {
    console.log("rememberDB="+rememberDB + " " + req.url + ", body:" + JSON.stringify(req.body))
    res.render('pages/howto', {pageInfo:pageInfo, sysdir: settings.installDir, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: "" });
    //pipewireAudioInit()
});

app.post('/howto', urlencodedParser, function (req, res) {
    console.log(rememberDB + "*** Url: " + req.url + " body:" + JSON.stringify(req.body));
    setInitialPage(res);
})


app.get('/radio', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send("Missing url parameter");
  }

  console.log("Proxying stream:", targetUrl);

    const setCommonHeaders = () => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("X-Content-Type-Options", "nosniff");
    };

    const transcodeToMp3 = (url) => {
        console.log("Transcoding stream to MP3 for browser compatibility:", url);
        setCommonHeaders();
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Transfer-Encoding", "chunked");

        const ffmpeg = spawn('ffmpeg', [
            '-hide_banner',
            '-loglevel', 'error',
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '5',
            '-user_agent', 'Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
            '-headers', 'Accept: */*\r\n',
            '-i', url,
            '-vn',
            '-acodec', 'libmp3lame',
            '-b:a', '128k',
            '-f', 'mp3',
            'pipe:1'
        ]);

        ffmpeg.stdout.pipe(res);

        ffmpeg.stderr.on('data', (data) => {
            console.error("ffmpeg radio transcode:", data.toString());
        });

        ffmpeg.on('error', (err) => {
            console.error("ffmpeg spawn failed:", err);
            if (!res.headersSent) {
                res.sendStatus(502);
            }
        });

        ffmpeg.on('close', (code) => {
            if (code !== 0) {
                console.error("ffmpeg exited with code", code);
            }
            if (!res.writableEnded) {
                res.end();
            }
        });

        req.on('close', () => {
            if (!ffmpeg.killed) {
                ffmpeg.kill('SIGTERM');
            }
        });
    };

  const connectTimeoutController = new AbortController();
  const connectTimeoutId = setTimeout(() => connectTimeoutController.abort(), 5000);

  try {
        const response = await fetch(targetUrl, {
            redirect: 'follow',
            signal: connectTimeoutController.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (X11; Linux) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
                'Accept': '*/*'
            }
        });
        // Headers arrived, so this is no longer a connect-phase hang; let the
        // stream itself run indefinitely instead of aborting it later.
        clearTimeout(connectTimeoutId);

        if (!response.ok) {
            console.error("Upstream stream request failed:", response.status, response.statusText, "- trying ffmpeg fallback");
            return transcodeToMp3(targetUrl);
        }

        const contentType = (response.headers.get("content-type") || "").toLowerCase();
        const needsTranscode = contentType.includes("audio/aac") || contentType.includes("audio/aacp");

        if (needsTranscode) {
            return transcodeToMp3(targetUrl);
        }

        setCommonHeaders();
        res.setHeader("Content-Type", contentType || "audio/mpeg");
        res.setHeader("Transfer-Encoding", "chunked");

    if (!response.body) {
      return res.sendStatus(500);
    }

    // 🔥 WebStream → Node Stream
    const nodeStream = Readable.fromWeb(response.body);

    nodeStream.pipe(res);
    console.log("stream "+targetUrl)
    } catch (err) {
        clearTimeout(connectTimeoutId);
        console.error("Stream error:", err, "- trying ffmpeg fallback");
        return transcodeToMp3(targetUrl);
  }
});

//lokale USB-Audio-Capture (pw-loopback -> eq10) zusätzlich per HTTP an den Browser streamen,
//damit playAudioCapture.ejs den Ton auch über volumeWEB()/die Web-Audio-Kette abspielen kann
app.get('/captureStream', function (req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Transfer-Encoding", "chunked");

    const ffmpeg = spawn('/usr/bin/ffmpeg', [
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'pulse',
        '-i', 'eq10.monitor',
        '-ac', '2',
        '-acodec', 'libmp3lame',
        '-b:a', '128k',
        '-f', 'mp3',
        'pipe:1'
    ]);

    ffmpeg.stdout.pipe(res);

    ffmpeg.stderr.on('data', (data) => {
        console.error("ffmpeg captureStream:", data.toString());
    });

    ffmpeg.on('error', (err) => {
        console.error("ffmpeg captureStream spawn failed:", err);
        if (!res.headersSent) {
            res.sendStatus(502);
        }
    });

    ffmpeg.on('close', (code) => {
        if (code !== 0) {
            console.error("ffmpeg captureStream exited with code", code);
        }
        if (!res.writableEnded) {
            res.end();
        }
    });

    req.on('close', () => {
        if (!ffmpeg.killed) {
            ffmpeg.kill('SIGTERM');
        }
    });
});

//---------------------------------------
app.use(function (req, res, next) {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Type", "text/css");
    //console.log("app-use:",`${req.method} ${req.url}`)
    next();
})


app.get("/views/bootstrap.min.css", function routeHandler(req, res) {
    //console.log("app-get:", `${req.method} ${req.url}`)
    var p = __dirname + req.url
    console.log("read " + p)
    sendHLS(res, p)
});



//Video HLS
//https://masteringjs.io/tutorials/express/app-get
//Handle any GET request whose URL starts with '/0'
app.get(/^\/0/i, function routeHandler(req, res) {
    console.log("app-get:", `${req.method} ${req.url}`)
    var p = __dirname + "/chunks" + req.url
    sendHLS(res, p)
});


// app.get(["/undefined"], function routeHandler(req, res) {
//     console.log("app-get:", `${req.method} ${req.url}`)
//     console.log("undefined URL")
//     setInitialPage(res);
//     return
// })


// app.get("/css/style.css", function routeHandler(req, res) {
//     //console.log("app-get:", `${req.method} ${req.url}`)
//     p = settings.installDir + "/ArchaicNodeEJS/views/css/style.css"
//     //console.log(p)
//     sendHLS(res, p)
//     return
// })
// app.get("/glass-theme.css", function routeHandler(req, res) {
//     //console.log("app-get:", `${req.method} ${req.url}`)
//     p = settings.installDir + "/ArchaicNodeEJS/views/css/glass-theme.css"
//     //console.log(p)
//     sendHLS(res, p)
//     return
// })
app.get("/modern.css", function routeHandler(req, res) {
    //console.log("app-get:", `${req.method} ${req.url}`)
    p = settings.installDir + "/ArchaicNodeEJS/views/css/modern.css"
    //console.log(p)
    sendHLS(res, p)
    return
})
app.get("/button.css", function routeHandler(req, res) {
    //console.log("app-get:", `${req.method} ${req.url}`)
    p = settings.installDir + "/ArchaicNodeEJS/views/css/button.css"
    //console.log(p)
    sendHLS(res, p)
    return
})

app.get("/scripts/audioWeb.js", function routeHandler(req, res) {
    //console.log("app-get:", `${req.method} ${req.url}`)
    p = settings.installDir + "/ArchaicNodeEJS/public/scripts/audioWeb.js"
    //console.log(p)
    sendHLS(res, p)
    return
})

app.get("/scripts/cdControls.js", function routeHandler(req, res) {
    //console.log("app-get:", `${req.method} ${req.url}`)
    p = settings.installDir + "/ArchaicNodeEJS/public/scripts/cdControls.js"
    //console.log(p)
    sendHLS(res, p)
    return
})

app.get("/update", function routeHandler(req, res) {
    //console.log("app-get:", `${req.method} ${req.url}=`+update)
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*'});
    res.end(update, 'utf-8');
    return
})
app.get("/resetUpdate", function routeHandler(req, res) {
    //console.log("app-get:", `${req.method} ${req.url}=`+update)
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*'});
    update = "false"
    res.end(update, 'utf-8');
    return
})


app.get("/filter/eqSlider.json", function routeHandler(req, res) {
    //console.log("app-get:", `${req.method} ${req.url}`)
    p = settings.installDir + "/ArchaicNodeEJS/filter/eqSlider.json"
    console.log(p)
    sendHLS(res, p)
    return
})

//same impulse-response file the PipeWire convolver (bashScript/conv.sh) uses for
//Line-Out reverb, served so the browser's Web Audio ConvolverNode can match it
//for the HTTP streaming path (see initAudio()/initVideo() in audioWeb.js)
var reverbIRBuffer = null
app.get("/filter/reverbIR.wav", function routeHandler(req, res) {
    try {
        if (!reverbIRBuffer) {
            reverbIRBuffer = fs.readFileSync("/home/pi/.config/pipewire/pipewire.conf.d/WireGrind_44x16x2-80dB_2.0s_20w_15m_0150Hz_036p_0100Hz_100p_00R.wav")
        }
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'audio/wav',
            'Content-Length': reverbIRBuffer.length,
            'Cache-Control': 'public, max-age=86400'
        })
        res.end(reverbIRBuffer)
    } catch (err) {
        console.log("reverbIR:", err)
        res.sendStatus(404)
    }
    return
})


app.get("/public/scripts/videoWeb.js", function routeHandler(req, res) {
    //console.log("app-get:", `${req.method} ${req.url}`)
    p = settings.installDir + "/ArchaicNodeEJS/public/scripts/videoWeb.js"
    //console.log(p)
    sendHLS(res, p)
    return
})

app.get("/sse-ready", function routeHandler(req, res) {
    const typ = String(SSEIntervalTyp || constants.SSE_NONE_CLEAR_INTERVAL)
    const active = (
        typ !== constants.SSE_NONE_CLEAR_INTERVAL &&
        typ !== constants.SSE_INACTIVE
    )
    res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
    })
    res.end(JSON.stringify({ active, typ }), 'utf-8')
})


app.get("/funcSSE", function routeHandler(req, res) {
   //console.log("app-get:", `${req.method} ${req.url}`+ " SSEIntervalTyp="+SSEIntervalTyp)
   //Server-Sent-Events to Web Frontend Handling
   //Sobald der Browser bzw. der Client eine HTML-Seite mit einer Event-Source aufzieht [siehe index(cpy).ejs)]
   //ist die Event-Stream-Route geöffnet und man kann Text-Events senden ohne das man im Browser immer F5 drücken muss
   //um z.B. ein Update eines andauernden Prozesses (recording, analyzing etc.) zu visualisieren

   //    if (req.url.search(settings.installDir + "/ArchaicNodeEJS/funcSSE") >= 0) {
        //console.log("funcSSE Url: " + req.url)
        const sse = SSE(res);
        var data = "none"
        if (SSEIntervalTyp){
            if (SSEIntervalTyp.match(constants.SSE_WAV2MP3)) {
                sseData = getLameInfo()
                data = sseData
            }
            else
            if (SSEIntervalTyp.match(constants.SSE_DL_RUNNING)) {
                sseData = "start download ..."
                data = sseData
            }
            else
            if (SSEIntervalTyp.match(constants.SSE_VIDEO_CONVERSION)) {
                sseData = "start searching incompatibel video ..."
                data = sseData
            }
            
            if(setSSEIntervalPtr){
                clearInterval(SSEIntervalPtr)
            }
            if (SSEIntervalTyp.match(constants.SSE_AD_CONVERSION) || SSEIntervalTyp.match(constants.SSE_PROCESS_WAV)
                || SSEIntervalTyp.match(constants.SSE_CD_RIPPING)) {
                SSEIntervalPtr = setInterval(sendSSE, constants.SSE_INTERVAL, sse)
                setSSEIntervalPtr = true
            }
            else if (SSEIntervalTyp.match(constants.SSE_DL_RUNNING)) {
                setSSEIntervalPtr = true
                SSEIntervalPtr = setInterval(sendSSE, constants.SSE_DL_INTERVAL, sse)
            }
            else if (SSEIntervalTyp.match(constants.SSE_MONITOR_LEVEL)) {
                setSSEIntervalPtr = true
                SSEIntervalPtr = setInterval(sendSSE, constants.SSE_MONITOR_LEVEL_INTERVAL, sse)
            }
            else if (SSEIntervalTyp.match(constants.SSE_VIDEO_CONVERSION)) {
                setSSEIntervalPtr = true
                SSEIntervalPtr = setInterval(sendSSE, constants.SSE_MONITOR_LEVEL_INTERVAL, sse)
            }
            console.log("set SSE Interval " + SSEIntervalTyp)
        }
        sse.write(data)
        return
//    }
})


app.get(["/*"], function routeHandler(req, res) {
    //console.log("**********req.url="+req.url)
    if (req.url.search("/imagelist") >= 0) {
        sendMediaList(res)
        return
    }
    if (req.url.search("/mediaShow/") >= 0) {
        const nodePath = require('path')
        const cleanUrl = req.url.split("?")[0]
        const mediaRelPath = decodeURIComponent(cleanUrl.replace("/mediaShow/", ""))
        const basePath = nodePath.resolve(mediaPath)
        const filePath = nodePath.resolve(nodePath.join(basePath, mediaRelPath))

        if (!filePath.startsWith(basePath)) {
            res.writeHead(403)
            res.end()
            return
        }

        const ext = nodePath.extname(filePath).toLowerCase()
        if (ext === ".mp4" || ext === ".mpg" || ext === ".mpeg" || ext === ".mov" || ext === ".avi" || ext === ".mts") 
        {
        // console.log("p=" + filePath + " " + req.headers.range)
        // console.log("******** TV REQUEST ********");
        // console.log("URL:", req.url);
        // console.log("Method:", req.method);
        // console.log("Headers:", req.headers);
        // console.log("Range:", req.headers.range);
        // console.log("User-Agent:", req.headers["user-agent"]);
        // console.log("*****************************");

        // if (req.method === "HEAD") {
        //     const stat = fs.statSync(filePath);

        //     console.log("******** DLNA HEAD ********");
        //     console.log("file:", filePath);
        //     console.log("size:", stat.size);
        //     console.log(
        //         "DLNA ContentFeatures:",
        //         req.headers["getcontentfeatures.dlna.org"]
        //     );
        //     console.log("HEAD RESPONSE VOR writeHead:", res.getHeaders());
        //     res.writeHead(200, {
        //         "Content-Type": "video/mp4",
        //         "Content-Length": stat.size,
        //         "Accept-Ranges": "bytes",
        //         "contentFeatures.dlna.org":
        //             "DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000",
        //         "transferMode.dlna.org": "Streaming"
        //     });

        //     res.end();
        //     return;
        // }
        streamVideo(filePath, req.headers.range, res)
        return
        }

        const mimeByExt = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".bmp": "image/bmp",
            ".gif": "image/gif",
            ".webp": "image/webp"
        }

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === "ENOENT") {
                    res.writeHead(404)
                    res.end()
                    return
                }
                res.writeHead(500)
                res.end("Server error")
                return
            }

            res.writeHead(200, {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": mimeByExt[ext] || "application/octet-stream",
                "Content-Length": content.length
            })
            res.end(content)
        })
        return
    }

    var p;
    if (req.url.search("coverImg") >= 0) {
        console.log("**********req.url="+req.url)
        sendCoverHLS(req.url, res)
        return
    }

    if (req.url.search("image") >= 0) {
        console.log("**********req.url="+req.url)
        sendAllImgHLS(req.url, res)
        return
    }

    if (req.url.search("/Video") >= 0) {
        console.log("**********req.url="+req.url)
        console.log("read " + req.url)
        let path = req.url
        if(!req.url.match(devMusic))
            path = devMusic+req.url
        streamVideo(path, req.headers.range, res)
        return
    }

    if (req.url.search("/mpv=") >= 0) {
        console.log("read " + req.url)
        //let path = devMusic+req.url
        doAudioYT(req.url)
        sendHLS(res,"")
        return
    }

    if (req.url.search("/favicon.ico") >= 0) {
//        console.log("send favicon.ico")
        sendHLS(res, settings.installDir + "/ArchaicNodeEJS/public/images/favicon.ico")
        return
    }

    if (req.url.search("/Pictures") >= 0) {
        console.log("**********req.url="+req.url)
        if (req.url.match(".mp4")){
            let path = req.url
            streamVideo(path, req.headers.range, res)
        }else{
            let path = req.url
            path=path.split("?")
            //sendHLS(res,path[0])
            sendHomeImgHLS(res,path[0])
        }
        return
    }

    //Pictures
    if (req.url.search("/p") >= 0) {
        console.log("**********req.url="+req.url)
        //extract number
        p = req.url.search("-")
        var dir = ""
        var n = 0      
        if (p < 0) {
            n = req.url.substr(2, req.url.length)
        } else {
            n = req.url.substr(2, p - 2)
            dir = req.url.substr(p + 1, req.url.length)
        }
        var i = Number(n)
        if (quit_HLS) quitHLS(res)
        else sendPicHLS(i, dir, res)
        return
    }


    //  "/rx":Radio/Audio  
    if (req.url.search("/r") >= 0) {
        //console.log("funcSSE Url: " + req.url)
        //extract number
        var x = req.url.split("r")
        x = x[1]
        if (x < allTracks.length){
            if (pageInfo.match("myUSB")){
                if (!musicDir.match("myUSB")) {
                    sendHLS(res,"")
                    return;
                }
                p = allTracks[x]
            }else{
                p = devMusic + "/" + rememberDB + "/" + allTracks[Number(x)];
            }
        } else {
            console.log("Error allTracks.length")
            p = settings.installDir + "/ArchaicNodeEJS/public/images/Tonbox.jpg"//irgendetwas senden
        }
        console.log(x+":"+p)
        streamMP3(req, res, p)
        return
    }

    //  "/ax":ADrecords 
    if (req.url.search("/a") >= 0 && !req.url.match("/audioWeb.js")) {
        //extract number
        n = req.url.search("_") //play one after the other
        var x = 0, y = 0
        if (n >= 0) {
            x = req.url.substr(2, n - 2)
            y = req.url.substr(n + 1, req.url.length)

        } else {
            x = req.url.substr(2, req.url.length)
        }
        trackIndex = Number(x) + Number(y)
        if (trackIndex >= (allTracks.length))
            trackIndex = 1
        else if (trackIndex < 0) trackIndex = 0
        p = devADrecords + "/"+ rememberDB + "/audio/" + allTracks[trackIndex];
            streamMP3(req, res, p)
        return
    }

    if (req.url.match("/get_volume_settings")) {
//        console.log("app-get:", `${req.method} ${req.url}`)
        getVolume(res)
        return
    }
    if (req.url.match("/set_volume_pw")) {
        //console.log("app-get:", `${req.method} ${req.url}`)
        res.writeHead(200);
        res.end()
        setCardVolume((req.url).substring(15, req.url.length))
        return
    }
    if (req.url.match("/eq")) {
        p = settings.installDir + "/ArchaicNodeEJS/public/images/Tonbox.jpg"
        sendHLS(res, p) //must send something anyway
        setEqualizerFilter(req.url)
        return
    }
    if (req.url.match("/Video")) {
        //console.log("stream " + req.url)
        var path = devMusic+req.url
        streamVideo(path, req.headers.range, res)
        return
    }

    if (req.url.match("/killMpv")){
        stopMusicPlay(constants.AUDIO_MPV)
        sendHLS(res,"")
        return
    }

    if (req.url.includes("/getMarquee")) {
        //console.log("/getMarquee="+procStatus.marquee)
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        });
        res.end(JSON.stringify(procStatus.marquee), 'utf-8');
        return;
    }

    if (req.url.match("/cdplayerStatus")){//line out
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ currentTrack: currentCDTrack }), 'utf-8');  
        return
    }

    console.log("no adequate get info of " + req.url + ", send default")
    p = settings.installDir + "/ArchaicNodeEJS/public/images/Tonbox.jpg"
    sendHLS(res, p)
})

setTimeout(ipConfig,1000)

