
// Volume Slider 0 ... 100
// Web Audio API Gain 0.0 ... 1.0
// RPI Server Pipewire ohne DAC ab 50, sonst zu leise
// RPI Server Pipewire mit DAC ab ??, sonst zu leise
//console.clear();
var oldTrack = ""
var volumeSliderPos = 0
var fileExt = ".mp3"
var eqModalWinOpen = false;
var oldCurrentFilterNum = -1
var currentFilterNum = 4
var eqSlider = {}
var platformDevice = "Mobile"
var radioPlaying = false

function setDebugMessage(msg, isError) {
    const tag = document.getElementById("debug");
    if (!tag) return;
    tag.style.color = isError ? "#ff5555" : "#5dd39e";
    tag.textContent = msg || "";
}

function getFilenameParts(filename) {
    const idx = (filename || "").lastIndexOf(".");
    if (idx <= 0) {
        return { base: filename || "", ext: "" };
    }
    return {
        base: filename.slice(0, idx),
        ext: filename.slice(idx)
    };
}

function isValidRenameBaseName(baseName) {
    if (!baseName) return false;
    if (!/^[a-zA-Z0-9.-]+$/.test(baseName)) return false;
    if (/^-|-$/.test(baseName)) return false;
    return true;
}

function buildTrackButtonLabel(trackName) {
    if (audioOut.match("HTTP")) {
        return "🎵" + trackName;
    }
    return "🎵" + trackName + '<i class="bi bi-play-fill"></i>';
}

async function requestRenameOnServer(index, currentName, newName) {
    try {
        const response = await fetch("/showMusicWorld", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                Rename: String(index),
                NewName: newName,
                check: dirType + "=" + currentName
            })
        });
        return response.ok;
    } catch (err) {
        console.error("Rename request failed:", err);
        return false;
    }
}

async function renameTrackByIndex(index, buttonPrefix) {
    const currentName = btracks[index];
    if (currentName === undefined) {
        setDebugMessage("Rename failed: track index not found", true);
        return;
    }

    const parts = getFilenameParts(currentName);
    if (!parts.ext) {
        alert("Datei kann nicht umbenannt werden: keine Dateiendung gefunden.");
        return;
    }

    const typedBase = window.prompt("Neuer Dateiname (ohne Extension):", parts.base);
    if (typedBase === null) return;

    const nextBase = typedBase.trim();
    if (!isValidRenameBaseName(nextBase)) {
        alert("Ungültiger Dateiname. Erlaubt sind nur a-z, A-Z, 0-9, Punkt und Bindestrich.");
        return;
    }

    const newName = nextBase + parts.ext;
    if (newName === currentName) return;

    const exists = btracks.some((item, i) => i !== index && item.toLowerCase() === newName.toLowerCase());
    if (exists) {
        alert("Dateiname existiert bereits.");
        return;
    }

    const ok = await requestRenameOnServer(index, currentName, newName);
    if (!ok) {
        setDebugMessage("Rename failed on server", true);
        alert("Umbenennen auf dem Server fehlgeschlagen.");
        return;
    }

    btracks[index] = newName;

    if (buttonPrefix) {
        const button = document.getElementById(buttonPrefix + index);
        if (button) {
            if (buttonPrefix === "vb") {
                button.textContent = "🎵" + newName;
            } else {
                button.innerHTML = buildTrackButtonLabel(newName);
            }
        }
    }

    if (typeof videoPlaying !== "undefined" && videoPlaying === currentName) {
        videoPlaying = newName;
    }

    setDebugMessage("Renamed: " + currentName + " -> " + newName, false);
}

function showAudioRenameButton(index) {
    if (!dirType.match("Audio")) return;
    const tag = document.getElementById("audioRename");
    if (!tag) return;
    tag.innerHTML = `
        <button class="btn-modern" type="button" onclick="renameTrackByIndex(${index}, 'r')">
            Rename
        </button>
    `;
}

// Safe initialization of global variables
if (typeof dirType === 'undefined') {
    var dirType = "";
}
dirType = String(dirType || "").replace(/\\"/g, "").replace(/^"+|"+$/g, "");
if (typeof audioOut === 'undefined') {
    var audioOut = "";
}
if (typeof audioTag === 'undefined') {
    var audioTag = false;
}
if (typeof modalWin === 'undefined') {
    var modalWin = false;
}

if (dirType.match("dirMain") || dirType.match("Video")) {
    //every *.ejs file declares if an audio element exist; negation here for specific dirs
    modalWin = false //equalizer
    audioTag = false //audio element
}

console.log("audioWeb.js")
console.log("audioOut=" + audioOut + ", dirType=" + dirType)
console.log("audioTag=" + audioTag + ", modalWin=" + modalWin)

//notify user if browser doesn't support Web Audio API
var webAudioApi = true
//document.write(navigator.userAgent); 
if (navigator.userAgent.match("SamsungBrowser/27")) {
    webAudioApi = false
    console.log("Web Audio API not supported1");
}
if (navigator.userAgent.match("Chrome/125")) {
    webAudioApi = false
    console.log("Web Audio API not supported2");
}

if (navigator.userAgent.match("Firefox")) {
    if ('webkitAudioContext' in window || 'AudioContext' in window) {
        console.log('Web Audio API should be ok');
    } else {
        webAudioApi = false
        console.log('Web Audio API may not be enabled')
    }
}

if (!webAudioApi) {
    //mediaElement.volume = 0;
    console.log("web volume NULL")
}
setTimeout(getVolumeSettings, 2000); //wait til DOM loaded

if (dirType != "none"){
    if (modalWin) {
        getEqData()
    }
    //checkMarquee called every 4s
    marqueeObj = setInterval(checkMarquee, 4000)
}

//interval func !
function checkMarquee() {
    console.log("checkMarquee")
    if (eqModalWinOpen) return //no marquee if equalizer modal win is open
    try {
        //console.log(audioOut)
        //console.log("check marquee")
        const resp = fetch('/getMarquee')
            .then(resp => resp.json())
            .then(data => {
                //console.log("marquee=" + JSON.stringify(data))
                if (data)
                    loadMarquee(JSON.stringify(data))
                else
                    loadMarquee("")
            });
    } catch (err) {
        console.log("post=" + err)
    }
}
function loadMarquee(track) {
    let marq = document.getElementById("marquee-container")
    if (track != oldTrack) {
        // marq.innerHTML='<div class="holder"><div class="news">'+track+'</div></div>'
        marq.innerHTML = '<div class="marquee">' + track + '</div>'
        oldTrack = track
        console.log("loadMarquee(" + track + ")")
    }
}
function resetMarquee() {
    let marq = document.getElementById("marquee-container")
    marq.innerHTML = ''
    console.log("reset Marquee")
}


async function setReverb(state) {
    console.log("reverb(" + state + ")")
        mediaElement.pause();//stop frequency bars
        audioPlaying = false

    try {
        const res = await fetch('/equalizer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reverb: state })
        });

        const data = await res.json();
        console.log("Server response:", data);
    } catch (err) {
        console.error("Reverb failed:", err);
    }
}

function getVolumeSettings() {
    console.log("getVolumeSettings()")
    fetch('/get_volume_settings')
        .then(response => response.json())
        .then(data => {
            volumeSliderPos = data
            console.log("volumeSliderPos=" + volumeSliderPos)
            sl = document.getElementById('vol')
            if (sl) {
                if (audioOut.match("HTTP")) {
                    sl.value = data * 0.5
                    if (audioTag) {
                        data *= 0.5
                        data /= 50; //match volumeWEB(): gain = sliderPos/50
                        if (webAudioApi && audioOut.match("HTTP") && audioTag && audioCtx && vGain && vGain.gain && typeof vGain.gain.setValueAtTime === 'function') {
                            vGain.gain.setValueAtTime(data, audioCtx.currentTime);
                        } else if (mediaElement) {
                            mediaElement.volume = data;
                        }
                    }
                }
                else {
                    sl.value = 80 + data * 0.15
                    console.log("set slider")
                }
                console.log("getVolumeSettings=" + data + ": set SliderPos=" + sl.value)
            }
        });
}

function setVolumeSettings(val) {
    value = Math.round(val)
    var xhr = new XMLHttpRequest();
    console.log("setVolumeSettings(" + val + ")=" + value)
    xhr.open("POST", "/equalizer", true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send("setVolumeSettings=" + value);
}


//change pipewire volume
function volumeRPI(val) {
    var value = parseFloat(val)
    console.log("volumeRPI(" + val + ")=" + value)
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/set_volume_pw=" + value, true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send();
    // value = (value-80)/0.15
    // value = Math.round(value)
    // setTimeout(setVolumeSettings,100,value)
}

function volumeWEB(val) {
    var value = parseFloat(val)
    value = val / 50 //sonst zu laut bzw. Verzerrung
    console.log("volumeWEB(" + val + ")=" + value + " audioTag=" + audioTag + " webAudioApi=" + webAudioApi)
    if (audioTag) {
        if (webAudioApi && audioCtx && vGain && vGain.gain && typeof vGain.gain.setValueAtTime === 'function') {
            vGain.gain.setValueAtTime(value, audioCtx.currentTime);
        } else if (mediaElement) {
            mediaElement.volume = value;
        }
    }
    if (dirType.match("Video") && webAudioApi) {
        var vi = document.getElementById("myVideo");
        vi.volume = value;
    }
    //jackVolume is stored as a canonical 0..100 value (see getVolumeSettings(),
    //which reads it back as slider position = jackVolume*0.5); val is already
    //the 0..50 slider position, so it must be scaled back up before saving,
    //otherwise the slider jumps to half its position on the next page load
    setVolumeSettings(val * 2)
}


//Reverb (Web Audio equivalent of the PipeWire convolver used for Line-Out,
//see bashScript/conv.sh): fetches the same impulse-response file and inserts
//a ConvolverNode at the tail of the EQ chain, toggled by toggleReverb().
//Declared at top level (not inside initAudio()/initVideo()'s own blocks) so it
//is available regardless of whether the page has an <audio> or a <video> tag.
var reverbConvolver = null
var reverbMakeupGain = null
var reverbEnabled = false
var reverbTailNode = null
var reverbDestNode = null
//full-wet convolution (no dry blend) smears the signal's transient energy across the
//reverb tail, so even with an IR-normalized ConvolverNode it plays back noticeably
//quieter than the dry signal; this makeup gain compensates so ON/OFF loudness match.
var REVERB_MAKEUP_DB = 6

function loadReverbNode(ctx) {
    return fetch('/filter/reverbIR.wav')
        .then(r => r.arrayBuffer())
        .then(buf => ctx.decodeAudioData(buf))
        .then(decoded => {
            var node = ctx.createConvolver()
            node.buffer = decoded
            node.normalize = true
            return node
        })
}

function initReverbForChain(ctx, tailNode, destNode) {
    reverbTailNode = tailNode
    reverbDestNode = destNode
    reverbMakeupGain = ctx.createGain()
    reverbMakeupGain.gain.setValueAtTime(Math.pow(10, REVERB_MAKEUP_DB / 20), ctx.currentTime)
    reverbEnabled = (typeof currentReverb !== 'undefined') && currentReverb === "on"
    tailNode.connect(destNode) //start dry; swapped in below once the IR has loaded, if needed
    loadReverbNode(ctx).then(node => {
        reverbConvolver = node
        reverbConvolver.connect(reverbMakeupGain)
        if (reverbEnabled) applyReverbRouting(true)
    }).catch(err => console.error("reverb IR load failed:", err))
}

function applyReverbRouting(enabled) {
    reverbEnabled = enabled
    if (!reverbConvolver || !reverbTailNode || !reverbDestNode || !reverbMakeupGain) return
    try { reverbTailNode.disconnect(reverbDestNode) } catch (e) {}
    try { reverbTailNode.disconnect(reverbConvolver) } catch (e) {}
    try { reverbMakeupGain.disconnect(reverbDestNode) } catch (e) {}
    if (enabled) {
        reverbTailNode.connect(reverbConvolver)
        reverbMakeupGain.connect(reverbDestNode)
    } else {
        reverbTailNode.connect(reverbDestNode)
    }
}

videoElement = document.querySelector("video")
if (videoElement) {
    oldsrc = ""
    oldbuttonID = ""
    oldButtonX = ""
    oldButtonObj = ""

    volumeSliderPos = 0
    currentFilterNum = 4 // entspricht MyEQ.txt on rpi
    videoPlaying = ""
    changedEQ = false
    oldCurrentFilterNum = -1
    console.log("start..")

    nextButtonEV = false
    playEv = true
    basetracksLength = 0;
    initVideo()
    //console.log(btracks)

    //document.getElementById("convert").innerHTML = ""


    let codeBlock = ""
    for (i in btracks) {
        //if (i == 0) console.log(btracks[0])
        //btracks[i]=btracks[i].replace(",","")
        //if (i == 0) console.log(btracks[0])
        codeBlock += '<button class="btn-modern" id=' + '"vb' + i + '"' +
            ' name="check"' +
            ' type="button" onclick="PlayVideox(' + i + ')">' + '🎵' + btracks[i] + '</button>'
    }
    //console.log(codeBlock)
    document.getElementById("videobutt").innerHTML = codeBlock

    videoElement.addEventListener('volumechange', (event) => {
        //0.0....1.0
        console.log("Volume changed:" + videoElement.volume);
        let val = videoElement.volume * 50
        let volSliderID = document.getElementById("vol")
        volSliderID.value = val
        setVolumeSettings(val)
    });
    videoElement.addEventListener('pause', function () {
        console.log("video pause detected")
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "/killMpv", true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send();
    })
    videoElement.addEventListener('play', () => {
        console.log("video play detected")
    })
    videoElement.addEventListener('ended', () => {
        console.log("video ended detected")
    })


    function initVideo() {
        console.log("initVideo()")
        radioPlaying = false

        document.getElementById("rename").innerHTML = ""
        document.getElementById("convert").innerHTML = ""
        document.getElementById("delete").innerHTML = ""

        //presents audio processing graph, built from audio modules linked together, each represented by an AudioNode
        //The AudioNode interface is a generic interface for representing an audio processing module: e.g. an HTML <audio>
        audioCtx = new AudioContext();

        // Feed the HTMLMediaElement into it 
        sourceNode = audioCtx.createMediaElementSource(videoElement);
        analyser = audioCtx.createAnalyser();

        vGain = audioCtx.createGain();
        vGain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        pass40 = audioCtx.createBiquadFilter()
        pass40.type = "peaking"
        pass40.frequency.value = 40
        pass40.Q.value = 0.7

        pass121 = audioCtx.createBiquadFilter()
        pass121.type = "peaking"
        pass121.frequency.value = 121
        pass121.Q.value = 0.7

        pass547 = audioCtx.createBiquadFilter()
        pass547.type = "peaking"
        pass547.frequency.value = 547
        pass547.Q.value = 2.1

        pass674 = audioCtx.createBiquadFilter()
        pass674.type = "peaking"
        pass674.frequency.value = 674
        pass674.Q.value = 0.72

        pass818 = audioCtx.createBiquadFilter()
        pass818.type = "peaking"
        pass818.frequency.value = 818
        pass818.Q.value = 2.82

        pass1503 = audioCtx.createBiquadFilter()
        pass1503.type = "peaking"
        pass1503.frequency.value = 1503
        pass1503.Q.value = 1.64

        pass1605 = audioCtx.createBiquadFilter()
        pass1605.type = "peaking"
        pass1605.frequency.value = 1605
        pass1605.Q.value = 4.95

        pass1722 = audioCtx.createBiquadFilter()
        pass1722.type = "peaking"
        pass1722.frequency.value = 1722
        pass1722.Q.value = 2.75

        pass4160 = audioCtx.createBiquadFilter()
        pass4160.type = "peaking"
        pass4160.frequency.value = 4160
        pass4160.Q.value = 1.62

        pass12000 = audioCtx.createBiquadFilter()
        pass12000.type = "peaking"
        pass12000.frequency.value = 12000
        pass12000.Q.value = 0.7

        sourceNode.connect(pass40)
        pass40.connect(pass121)
        pass121.connect(pass547)
        pass547.connect(pass674)
        pass674.connect(pass818)
        pass818.connect(pass1503)
        pass1503.connect(pass1605)
        pass1605.connect(pass1722)
        pass1722.connect(pass4160)
        pass4160.connect(pass12000)
        initReverbForChain(audioCtx, pass12000, vGain)
        vGain.connect(audioCtx.destination)
        vGain.connect(analyser)
    }

    function PlayVideox(id) {
        let cmp3 = document.getElementById("convert")
        let ren = document.getElementById("rename")
        let del = document.getElementById("delete")
        const wasPlaying = !!videoPlaying;

        if (wasPlaying) {
            videoElement.currentTime = 0;
            videoElement.pause()
            videoElement.src = ""
            videoPlaying = ""
            ren.innerHTML = ""
            cmp3.innerHTML = ""
            del.innerHTML = ""
            if (!audioOut.match("HTTP")) {
                try {
                    const response = fetch("/showMusicWorld", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ StopPlayx: "StopPlayx" })
                    });
                } catch (err) {
                    console.log("StopPlayx:" + err)
                }
            }
            return;
        } else {
            ren.innerHTML = `
                <button class="btn-modern"
                        type="button"
                        onclick="renameTrackByIndex(${id}, 'vb')">
                Rename
                </button>
            `;

            cmp3.innerHTML = `
                <button class="btn-primary"
                        name="convert"
                        type="submit"
                        value="${btracks[id]}">
                Convert to Audio
                </button>&nbsp;
            `;

            del.innerHTML = `
                <button class="btn-danger"
                        name="delete"
                        type="submit"
                        value="${btracks[id]}">
                Delete Video
                </button>
            `;

            if (!audioOut.match("HTTP"))
                setTimeout(PlayVideo, 500, id) //try to sync line out with browser's audio of the video 
            else
                PlayVideo(id)

            const convertBtn = cmp3.querySelector('button[name="convert"]');
            if (convertBtn) {
                convertBtn.addEventListener('click', function () {
                    console.log("Conversion in progress !")
                    cmp3.innerHTML = 'Conversion in progress...';
                    window.location.href = '/showMusicWorld?convert=' + encodeURIComponent(btracks[id]);
                }, { once: true });
            }
        }
    }

    function PlayVideo(id) {
        videoElement.src = "Video/" + btracks[id]
        console.log("PlayVideox(" + btracks[id] + ")")
        videoPlaying = btracks[id]
    }
}



mediaElement = document.getElementById("myAudio")
if (mediaElement) {
    resetMarquee()
    var oldsrc = ""
    var oldbuttonID = ""
    var oldButtonX = ""
    var oldButtonObj = ""

    volumeSliderPos = 0
    currentFilterNum = 4 // entspricht MyEQ.txt on rpi
    var audioPlaying = false
    changedEQ = false
    oldCurrentFilterNum = -1
    console.log("start..")

    nextButtonEV = false
    playEv = true

    //console.log("dirType=" + dirType + "  audioOut="+audioOut)

    if (!(dirType.match("Radio") && (dirType.length <= 5))) {
        if (dirType.match("ADrecords")) {
            //wird nur für Laufleiste (marquee) benutzt 
            console.log(btracks)
            if (btracks[0].match("wav")) {
                fileExt = ".wav"
            }
            else {
                fileExt = ".mp3"
            }
        }
        if (dirType.includes("Audio") || dirType.match("Radio/")) {
            //Dateiendung muss ".mp3", darf nicht .MP3 oder .wav etc. sein !"
            //console.log(btracks)

            //console.log("btracks[3]="+btracks[3])
            fileExt = ".mp3"
        }

        if (dirType.includes("Audio") || dirType.match("Radio/") || dirType.match("ADrecords/")) {
            var codeBlock = ""
            if (currentRadioDir) codeBlock ='<h6 class="section-title text-center">'+ currentRadioDir +'</h6>'
            if (audioOut.match("HTTP")) {
                    for (i in btracks) {
                        btracks[i] = btracks[i].replace(",", "")
                        codeBlock += '<button class="btn-modern" id=' + '"r' + i + '"' +
                            ' type="button" onclick="PlayMusic(\'r' + '\',' + i + ')">' +
                            '🎵' + btracks[i] + '</button>'
                    }
                    document.getElementById("butt").innerHTML = codeBlock
            }
            else {
                for (i in btracks) {
                    btracks[i] = btracks[i].replace(",", "")
                    codeBlock += '<button class="btn-modern" id=' + '"r' + i + '"' +
                        ' type="button" onclick="PlayBars(\'r' + '\',' + i + ')">' +
                        '🎵' + btracks[i] + '<i class="bi bi-play-fill"></i></button>'
                }
                document.getElementById("butt").innerHTML = codeBlock
            }
        }else{
            if (dirType.match("myUSB")){
                var codeBlock = ""
                let new_btracks = []
                for (i in btracks) {
                    new_btracks[i] = btracks[i].replace(",", "")
                    const basename = new_btracks[i].split("/").pop();
                    new_btracks[i] = basename
                }
                if (audioOut.match("HTTP")) {
                        for (i in btracks) {
                            codeBlock += '<button class="btn-modern" id=' + '"r' + i + '"' +
                                ' type="button" onclick="PlayMusic(\'r' + '\',' + i + ')">' +
                                '🎵' + new_btracks[i] + '</button>'
                        }
                        document.getElementById("myUSB").innerHTML = codeBlock
                }
                else {
                    for (i in btracks) {
                        codeBlock += '<button class="btn-modern" id=' + '"r' + i + '"' +
                            ' type="button" onclick="PlayBars(\'r' + '\',' + i + ')">' +
                            '🎵' + new_btracks[i] + '<i class="bi bi-play-fill"></i></button>'
                    }
                    document.getElementById("myUSB").innerHTML = codeBlock
                }
            }        
        }
    }

    if (audioOut.match("HTTP"))
        initAudio()
    else{
        initDiscrete()
    }

    if (dirType.includes("Audio") || dirType.match("ADrecords") ){//|| dirType.match("Radio/")) {
        if (audioOut.match("HTTP")) {
            //progress bar---------------------------------------
            // const audio = document.getElementById('audio');
            // const playBtn = document.getElementById('playBtn');
            const progress = document.getElementById('progress');
            const currentTimeLabel = document.getElementById('currentTime');
            const durationLabel = document.getElementById('duration');
            // Update progress bar as audio plays
            mediaElement.addEventListener('timeupdate', () => {
                progress.value = mediaElement.currentTime;
                currentTimeLabel.textContent = formatTime(mediaElement.currentTime);
            });
            // Set up duration once metadata is loaded
            mediaElement.addEventListener('loadedmetadata', () => {
                progress.max = mediaElement.duration;
                console.log("progress max:" + progress.max)
                durationLabel.textContent = formatTime(mediaElement.duration);
            });
            // Allow seeking via progress bar
            progress.addEventListener('input', () => {
                console.log("progress:" + progress.value)
                mediaElement.currentTime = progress.value;
            });
        }
    }
    


    mediaElement.addEventListener('play', () => {
        console.log("play ev")
        //debug2(" - play EV")
        //console.log("duration="+mediaElement.duration)
        nextButtonEV = true; //event allowed...next track 
        playEv = true //pause now allowed

        if (!audioOut.match("HTTP")) {
            if (platformDevice === "iOS"){
                mediaElement.muted = true //für Apple 
                //debug2(" - mediaElement.muted = true")
            }
        }
    })
    mediaElement.addEventListener('loadeddata', () => {
        //console.log("loadeddata ev")
        //console.log("duration="+mediaElement.duration)
    })
    // mediaElement.addEventListener('pause', () => {
    //     console.log("pause ev")
    //     resetMarquee()
    // })
    mediaElement.addEventListener('error', (e) => {
        const errorCode = e.target.error.code;
        const errorMessage = e.target.error.message;
        console.error(`Media Error (${errorCode}): ${errorMessage}`);

        if (errorCode === MediaError.MEDIA_ERR_NETWORK) {
            console.log('Network error - check CORS permissions');
        }
    });

    mediaElement.addEventListener('loadedmetadata', () => {
        console.log('Audio metadata loaded successfully');
    });

    mediaElement.play().catch(playError => {
        console.error('Playback failed:', playError);
    });

    mediaElement.addEventListener('ended', () => {
        console.log("ended ev")
        audioPlaying = false
        //mediaElement.pause()
        oldButtonObj = document.getElementById(oldButtonID + oldButtonX)
        oldButtonObj.style.backgroundColor = 'black';
        if (nextButtonEV) {
            if (oldButtonX < (basetracksLength - 1)) {
                oldButtonX++;
                const nextButton = document.getElementById(oldButtonID + oldButtonX)
                console.log("nextButton..")
                nextButton.click()
            }
        }
    })


    // Convert seconds to mm:ss format
    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }



    function PlayMusic(id, x) {
        console.log("PlayMusic(" + id + "," + x + ") received")
        track = btracks[x]
        showAudioRenameButton(x)
        console.log(track)
        size = btracks.length
        loadMarquee(track)
        http = true
        basetracksLength = size;
        let buttonID = document.getElementById(id + x)
        console.log("audioPlaying=" + audioPlaying)
        if (audioPlaying && oldButtonX) {
            if (oldButtonX == x) {
                console.log("oldButtonX == x")
                if (!playEv) return
                console.log("PlayMusic Stop:" + id + x + ", " + track + ", size=" + size + ", t=" + mediaElement.currentTime)

                mediaElement.pause();
                buttonID.innerHTML = '🎵' + track
                buttonID.style.backgroundColor = 'black';
            }
            else {
                console.log("oldButtonX != x")
                oldButtonObj = document.getElementById(oldButtonID + oldButtonX)
                //Wenn eine Suche vollzogen worden ist stimmen die Buttons nicht mehr
                if (oldButtonObj) {
                    oldButtonObj.style.backgroundColor = 'black';
                    mediaElement.pause();
                }
            }
            audioPlaying = false
            console.log("pause - currentTime=" + mediaElement.currentTime)
        } else {
            console.log("mediaElement.duration=" + mediaElement.duration)
            console.log("oldButtonX=" + oldButtonX)
            if (oldButtonObj) {
                oldButtonObj = document.getElementById(oldButtonID + oldButtonX)
                oldButtonObj.style.backgroundColor = 'black';
            }
            // if ((oldButtonX != x) || !mediaElement.duration){
            //            if (!mediaElement.duration){
            console.log("PlayMusic:" + id + x + ", " + track + ", size=" + size + ", t=" + mediaElement.currentTime)
            nextButtonEV = false; //don't allow 'ended' event action while loading
            mediaElement.setAttribute('src', id + x);
            mediaElement.load()
            oldButtonID = id
            oldButtonX = x;
            //play() darf nicht unterbrochen werden über pause() solange das play event nicht gekommen ist 
            //https://developer.chrome.com/blog/play-request-was-interrupted?hl=de
            playEv = false
            console.log("duration=" + mediaElement.duration)
            buttonID.style.backgroundColor = 'green';
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().then(() => {
                    mediaElement.play();
                });
            } else {
                mediaElement.play();
            }
            audioPlaying = true
            visuBars()
        }
    }

    //https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio
    function PlayBars(id, x) {
        console.log("PlayBars(" + id + "," + x + ")")
        let track = btracks[x]
        showAudioRenameButton(x)
        let size = btracks.length
        loadMarquee(track)
        http = false
        basetracksLength = size;
        buttonID = document.getElementById(id + x)
        //console.log("audioPlaying="+audioPlaying+", playEv="+playEv)
        if (!audioPlaying) {
            if (!playEv) return
            //gleiche src laden schlägt fehlt!!
            if (oldsrc != (id + x)) {
                //console.log("media loading...oldsrc="+oldsrc+". src="+id+x)
                oldsrc = id + x
                nextButtonEV = false; //don't allow 'ended' event action while loading
                //start web audio without speakers to show bars only
                mediaElement.setAttribute('src', id + x);
                mediaElement.load()
            }
            //mediaElement.currentTime=0;
            if (dirType.match("Radio/")) {
                StartPlayRadioDir(x)
            } else {
                StartPlayx(track)
            }
            oldButtonID = id
            oldButtonX = x;
            buttonID.style.backgroundColor = 'green';
            if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().then(() => {
                    mediaElement.play();
                });
            } else {
                mediaElement.play();
            }
            audioPlaying = true
            visuBars()
        } else {
            resetMarquee()
            //console.log("pause")
            // mediaElement.pause();
            //mediaElement.currentTime=0;

            if (oldButtonX && (oldButtonX != x)) {
                console.log("oldButtonX:" + oldButtonX + " x:" + x)
                oldButtonObj = document.getElementById(oldButtonID + oldButtonX)
                oldButtonObj.style.backgroundColor = 'black'
            } else {
                buttonID.innerHTML = track
                buttonID.style.backgroundColor = 'black';
            }
            StopPlayx()
        }
    }


    function StartPlayRadioDir(index) {
        console.log("StartPlayRadioDir(" + index + ")")
        try {
            const response = fetch("/radioFavorites", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Streamx: index })//+fileExt})
            });
            console.log("POST Streamx: " + index)
        } catch (err) {
            console.log("StartPlayRadioDir:" + err)
        }
    }

    function StartPlayx(track) {
        console.log("StartPlayx(" + track + ")")
        if (dirType.match("myUSB")){
            try {
                const response = fetch("/myUSB", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ Play: track })
                });
                //console.log("POST check:"+dirType+"="+track+fileExt)
            } catch (err) {
                console.log("StartPlayx:" + err)
            }
            return
        }

        try {
            const response = fetch("/showMusicWorld", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ check: dirType + "=" + track })//+fileExt})
            });
            //console.log("POST check:"+dirType+"="+track+fileExt)
        } catch (err) {
            console.log("StartPlayx:" + err)
        }
    }


    function StopPlayx() {
        mediaElement.pause();//stop frequency bars
        audioPlaying = false
        console.log("StopPlayx")
        if (dirType.match("myUSB")){
            try {
                const response = fetch("/myUSB", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ StopPlay: "StopPlay" })
                });
                //console.log("POST check:"+dirType+"="+track+fileExt)
            } catch (err) {
                console.log("StopPlayx:" + err)
            }
            return
        }

        try {
            const response = fetch("/showMusicWorld", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ StopPlayx: "StopPlayx" })
            });
        } catch (err) {
            console.log("StopPlayx:" + err)
        }
    }

    function Stop() {
        resetMarquee()
        console.log("Stop()")
        if (audioPlaying) {
            if (audioOut.match("HTTP")) {
                audioPlaying = false
                mediaElement.pause();
            }
            else {
                audioPlaying = false
                //stop pw-play on rpi server
                try {
                    const response = fetch("/entry", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ StopPlayx: "StopPlayx" })
                    });
                } catch (err) {
                    console.log("post=" + err)
                }
                //refresh web page to get rid of marquee (Laufschrift)
                window.location.reload()
            }
        }
    }

    function initAudio() {
        console.log("initAudio()")
        radioPlaying = false

        if (!webAudioApi) {
            canvas = document.querySelector(".visualizer");
            console.log(canvas)
            canvasCtx = canvas.getContext("2d");
            canvas.setAttribute("width", 300);
            canvasCtx.font = "14px Arial";
            canvasCtx.fillStyle = "red";
            canvasCtx.fillText("Browser unterstützt nicht die Web Audio API", 10, 50)
            return
        }
        canvas = document.querySelector(".visualizer");
        console.log(canvas)
        canvasCtx = canvas.getContext("2d");
        canvas.setAttribute("width", 300);
        canvasCtx.fillStyle = "black";
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        canvasCtx.fillStyle = "red";
        canvasCtx.fillRect(0, canvas.height / 2, canvas.width, 2);

        //presents audio processing graph, built from audio modules linked together, each represented by an AudioNode
        //The AudioNode interface is a generic interface for representing an audio processing module: e.g. an HTML <audio>
        audioCtx = new AudioContext();
        audioCtx.resume();

        // Feed the HTMLMediaElement into it 
        sourceNode = audioCtx.createMediaElementSource(mediaElement);
        analyser = audioCtx.createAnalyser();

        vGain = audioCtx.createGain();
        vGain.gain.setValueAtTime(0.25, audioCtx.currentTime);

        // const EQ_BANDS = [40,121,547,674,818,1503,1605,1722,4160,12000];
        // let previous = sourceNode;
        // EQ_BANDS.forEach((freq, i) => {
        //     const filter = audioCtx.createBiquadFilter();

        //     filter.type = (i === EQ_BANDS.length - 1) ? "highshelf" : "peaking";
        //     filter.frequency.value = freq;
        //     filter.Q.value = 1.41;
        //     filter.gain.value = 0;

        //     previous.connect(filter);
        //     previous = filter;
        // });

        // previous.connect(analyser);
        // analyser.connect(vGain);
        // vGain.connect(audioCtx.destination);

        
        pass40 = audioCtx.createBiquadFilter()
        pass40.type = "peaking"
        pass40.frequency.value = 40
        pass40.Q.value = 0.7

        pass121 = audioCtx.createBiquadFilter()
        pass121.type = "peaking"
        pass121.frequency.value = 121
        pass121.Q.value = 0.7

        pass547 = audioCtx.createBiquadFilter()
        pass547.type = "peaking"
        pass547.frequency.value = 547
        pass547.Q.value = 2.1

        pass674 = audioCtx.createBiquadFilter()
        pass674.type = "peaking"
        pass674.frequency.value = 674
        pass674.Q.value = 0.72

        pass818 = audioCtx.createBiquadFilter()
        pass818.type = "peaking"
        pass818.frequency.value = 818
        pass818.Q.value = 2.82

        pass1503 = audioCtx.createBiquadFilter()
        pass1503.type = "peaking"
        pass1503.frequency.value = 1503
        pass1503.Q.value = 1.64

        pass1605 = audioCtx.createBiquadFilter()
        pass1605.type = "peaking"
        pass1605.frequency.value = 1605
        pass1605.Q.value = 4.95

        pass1722 = audioCtx.createBiquadFilter()
        pass1722.type = "peaking"
        pass1722.frequency.value = 1722
        pass1722.Q.value = 2.75

        pass4160 = audioCtx.createBiquadFilter()
        pass4160.type = "peaking"
        pass4160.frequency.value = 4160
        pass4160.Q.value = 1.62

        pass12000 = audioCtx.createBiquadFilter()
        pass12000.type = "peaking"
        pass12000.frequency.value = 12000
        pass12000.Q.value = 0.7

        sourceNode.connect(pass40)
        pass40.connect(pass121)
        pass121.connect(pass547)
        pass547.connect(pass674)
        pass674.connect(pass818)
        pass818.connect(pass1503)
        pass1503.connect(pass1605)
        pass1605.connect(pass1722)
        pass1722.connect(pass4160)
        pass4160.connect(pass12000)
        initReverbForChain(audioCtx, pass12000, analyser)
        // 🔊 Audio
        analyser.connect(vGain)
        // 📊 Analyzer VOR Gain!
        vGain.connect(audioCtx.destination)
    }

    // function initDiscrete(index, song) {
    //     console.log("initDiscrete()")
    //     radioPlaying = false
    //     if (!webAudioApi) {
    //         canvas = document.querySelector(".visualizer");
    //         console.log(canvas)
    //         canvasCtx = canvas.getContext("2d");
    //         canvas.setAttribute("width", 300);
    //         canvasCtx.font = "14px Arial";
    //         canvasCtx.fillStyle = "red";
    //         canvasCtx.fillText("Browser unterstützt nicht die Web Audio API", 10, 50)
    //         return
    //     }


    //     // Set up canvas context for visualizer
    //     canvas = document.querySelector(".visualizer");
    //     canvas.width = 300;
    //     canvasCtx = canvas.getContext("2d");
    //     console.log("c.w=" + canvas.width + ", c.h=" + canvas.height)
    //     canvasCtx.fillStyle = "black";
    //     canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    //     canvasCtx.fillStyle = "red";
    //     canvasCtx.fillRect(0, canvas.height / 2, canvas.width, 2);

    //     audioCtx = new AudioContext();
    //     sourceNode = audioCtx.createMediaElementSource(mediaElement);
    //     analyser = audioCtx.createAnalyser();
    //     vGain = audioCtx.createGain();

    //     // 🎯 Gain auf 0 (Line-Out Modus)
    //     vGain.gain.value = 0.01; //kaum hörbar aber wichtig für iOS, damit Visualizer funktioniert

    //     // 🔊 Audio-Pfad
    //     sourceNode.connect(vGain);
    //     vGain.connect(audioCtx.destination);

    //     // 📊 Analyse separat (parallel!)
    //     sourceNode.connect(analyser);           
    // }
    function initDiscrete(index, song) {
        console.log("initDiscrete()")
        radioPlaying = false
        if (!webAudioApi) {
            canvas = document.querySelector(".visualizer");
            console.log(canvas)
            canvasCtx = canvas.getContext("2d");
            canvas.setAttribute("width", 300);
            canvasCtx.font = "14px Arial";
            canvasCtx.fillStyle = "red";
            canvasCtx.fillText("Browser unterstützt nicht die Web Audio API", 10, 50)
            return
        }


        // Set up canvas context for visualizer
        canvas = document.querySelector(".visualizer");
        canvas.width = 300;
        canvasCtx = canvas.getContext("2d");
        console.log("c.w=" + canvas.width + ", c.h=" + canvas.height)
        canvasCtx.fillStyle = "black";
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
        canvasCtx.fillStyle = "red";
        canvasCtx.fillRect(0, canvas.height / 2, canvas.width, 2);

        audioCtx = new AudioContext();
        // Feed the HTMLMediaElement into it 
        track = audioCtx.createMediaElementSource(mediaElement);
        analyser = audioCtx.createAnalyser();
        vGain = audioCtx.createGain();
        vGain.gain.value = 0
        track.connect(analyser).connect(vGain).connect(audioCtx.destination);
    }}



function loadMyEQ() {
    if (oldCurrentFilterNum != currentFilterNum) {
        console.log("loadMyEQ")
        oldCurrentFilterNum = currentFilterNum;
        eqSlider.f40Hz[4] = eqSlider.f40Hz[currentFilterNum]
        eqSlider.f121Hz[4] = eqSlider.f121Hz[currentFilterNum]
        eqSlider.f547Hz[4] = eqSlider.f547Hz[currentFilterNum]
        eqSlider.f674Hz[4] = eqSlider.f674Hz[currentFilterNum]
        eqSlider.f818Hz[4] = eqSlider.f818Hz[currentFilterNum]
        eqSlider.f1503Hz[4] = eqSlider.f1503Hz[currentFilterNum]
        eqSlider.f1605Hz[4] = eqSlider.f1605Hz[currentFilterNum]
        eqSlider.f1722Hz[4] = eqSlider.f1722Hz[currentFilterNum]
        eqSlider.f4160Hz[4] = eqSlider.f4160Hz[currentFilterNum]
        eqSlider.f12000Hz[4] = eqSlider.f12000Hz[currentFilterNum]
    }
    changedEQ = true
}

function eqGain(string, type) {
    console.log("eqGain="+string)
    if (!webAudioApi)
        return
    //string == slider position 1..100  
    var value = parseFloat(string)
    loadMyEQ()
    if (audioOut.match("HTTP")) { //WEb Audio API
        var gainDb = sliderValToGain(value);
        value /= 100.0;
        if (type != 'vGain')
            value *= 10.0
        console.log("eqGain=" + value + ", type=" + type)
        switch (type) {
            case 'vGain':
                if (audioCtx && vGain && vGain.gain && typeof vGain.gain.setValueAtTime === 'function') {
                    vGain.gain.setValueAtTime(value, audioCtx.currentTime);
                }
                console.log("vGain=" + value)
                break;
            case '40Gain':
                pass40.gain.value = gainDb;
                eqSlider.f40Hz[4] = value * 10
                break;
            case '121Gain':
                pass121.gain.value = gainDb;
                eqSlider.f121Hz[4] = value * 10
                break;
            case '547Gain':
                pass547.gain.value = gainDb;
                eqSlider.f547Hz[4] = value * 10
                break;
            case '674Gain':
                pass674.gain.value = gainDb;
                eqSlider.f674Hz[4] = value * 10
                break;
            case '818Gain':
                pass818.gain.value = gainDb;
                eqSlider.f818Hz[4] = value * 10
                break;
            case '1503Gain':
                pass1503.gain.value = gainDb;
                eqSlider.f1503Hz[4] = value * 10
                break;
            case '1605Gain':
                pass1605.gain.value = gainDb;
                eqSlider.f1605Hz[4] = value * 10
                break;
            case '1722Gain':
                pass1722.gain.value = gainDb;
                eqSlider.f1722Hz[4] = value * 10
                break;
            case '4160Gain':
                pass4160.gain.value = gainDb;
                eqSlider.f4160Hz[4] = value * 10
                break;
            case '12000Gain':
                pass12000.gain.value = gainDb;
                eqSlider.f12000Hz[4] = value * 10
                break;
        }
    } else {
        //Line-Out, Pipewire filtergraph on RPI
        newVal = value
        console.log("slider value=" + value)
        switch (type) {
            case '40Gain':
                var slider = document.getElementById("40Hz");
                eqSlider.f40Hz[4] = value
                slider.onchange = function () {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", "/eq1=" + newVal, true);
                    xhr.send();
                }
                break;

            case '121Gain':
                var slider = document.getElementById("121Hz");
                eqSlider.f121Hz[4] = value
                slider.onchange = function () {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", "/eq2=" + newVal, true);
                    xhr.send();
                }
                break;

            case '547Gain':
                var slider = document.getElementById("547Hz");
                eqSlider.f547Hz[4] = value
                slider.onchange = function () {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", "/eq3=" + newVal, true);
                    xhr.send();
                }
                break;

            case '674Gain':
                var slider = document.getElementById("674Hz");
                eqSlider.f674Hz[4] = value
                slider.onchange = function () {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", "/eq4=" + newVal, true);
                    xhr.send();
                }
                break;

            case '818Gain':
                var slider = document.getElementById("818Hz");
                eqSlider.f818Hz[4] = value
                slider.onchange = function () {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", "/eq5=" + newVal, true);
                    xhr.send();
                }
                break;

            case '1503Gain':
                var slider = document.getElementById("1503Hz");
                eqSlider.f1503Hz[4] = value
                slider.onchange = function () {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", "/eq6=" + newVal, true);
                    xhr.send();
                }
                break;

            case '1605Gain':
                var slider = document.getElementById("1605Hz");
                eqSlider.f1605Hz[4] = value
                slider.onchange = function () {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", "/eq7=" + newVal, true);
                    xhr.send();
                }
                break;

            case '1722Gain':
                var slider = document.getElementById("1722Hz");
                eqSlider.f1722Hz[4] = value
                slider.onchange = function () {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", "/eq8=" + newVal, true);
                    xhr.send();
                }
                break;

            case '4160Gain':
                var slider = document.getElementById("4160Hz");
                eqSlider.f4160Hz[4] = value
                slider.onchange = function () {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", "/eq9=" + newVal, true);
                    xhr.send();
                }
                break;

            case '12000Gain':
                var slider = document.getElementById("12000Hz");
                eqSlider.f12000Hz[4] = value
                slider.onchange = function () {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", "/eq10=" + newVal, true);
                    xhr.send();
                }
                break;
        }
    }
}

function debug(msg) {
    document.getElementById("debug").innerText = msg
}
function debug2(msg) {
    document.getElementById("debug2").innerText += msg
}

function drawBars() {
    //console.log("drawBars")
    drawVisual = requestAnimationFrame(drawBars);
    analyser.getByteFrequencyData(dataArray);
    //debug("Debug Value: " + dataArray[0]);
    canvasCtx.fillStyle = "rgb(0, 0, 0)";
    canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

    const barWidth = (WIDTH / bufferLength) * 1.0;//2.5
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i];
        const hue = i / analyser.frequencyBinCount * 360;
        canvasCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        canvasCtx.fillRect(
            x,
            HEIGHT - barHeight / 2,
            barWidth,
            barHeight / 2
        );

        x += barWidth + 1;
    }
    canvasCtx.lineTo(WIDTH, HEIGHT / 2);
    canvasCtx.stroke();
};
function visuBars() {
    if (!webAudioApi) return;
    analyser.fftSize = 256;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    WIDTH = canvas.width;
    HEIGHT = canvas.height;
    drawBars()
};


//Equalizer
//---------
function getEqData(retriesLeft) {
    if (retriesLeft === undefined) retriesLeft = 3;
    console.log("fetch eqSlider.json");

    fetch('/filter/eqSlider.json')
        .then(response => {
            console.log("HTTP Status:", response.status);

            if (!response.ok) {
                throw new Error("HTTP Fehler: " + response.status);
            }

            return response.json();
        })
        .then(data => {
            //guard against an empty/partial response (e.g. server still busy
            //switching HTTP/Line-Out right after /system), which would otherwise
            //leave the sliders at their static HTML default (looks "centered")
            if (!data || typeof data.preset === "undefined" || !data.f40Hz) {
                throw new Error("eqSlider.json response incomplete");
            }
            let idx = data.preset
            //idx.toString()
            console.log("filterIndex="+idx)
            delete data.preset;
            eqSlider = data;
//            console.log("eqSlider.f40Hz =", eqSlider.f40Hz);
            setEq(idx);
            const fIndexEl = document.getElementById("fIndex"+idx);
            if (fIndexEl) {
                fIndexEl.checked = true;
            }
        })
        .catch(error => {
            console.error("Fehler beim Laden von eqSlider:", error);
            if (retriesLeft > 0) {
                //server is likely still busy applying the HTTP/Line-Out switch
                //(wpctl/amixer calls); retry shortly instead of leaving the
                //sliders stuck at their default positions until a manual reload
                setTimeout(() => getEqData(retriesLeft - 1), 800);
            }
        });
}
// function getEqData() {
//     console.log("fetch eqSlider.json")
//     fetch("/eqSlider.json")
//         .then(response => response.json())
//         .then(data => {
//             eqSlider = data
//             console.log("eqSlider.f40Hz="+eqSlider.f40Hz)
//             setEq(4) //MyEQ default
//         })
//         /*
//             Mit response.ok kannst du HTTP-Fehler wie 404 abfangen.
//             .catch() fängt Netzwerkfehler oder manuell geworfene Fehler (throw) ab.
//             Du kannst die Fehlermeldung in der Konsole ausgeben und zusätzlich im UI anzeigen 
//             (z. B. über ein <div id="errorBox"></div>).
//         */
//         .catch(error => {
//             console.error("Fehler beim Laden von eqSlider:", error);
//             // hier kannst du auch eine Nachricht anzeigen, z. B. im DOM:
//             const msgBox = document.getElementById("errorBox");
//             if (msgBox) {
//                 msgBox.textContent = "⚠️ EQ-Daten konnten nicht geladen werden!";
//             }
//         });
// }



function sliderValToGain(n) {
    //mirrors sliderValtoGain() in funcEqualizer.js: slider 0..100 -> -9..+9 dB, 50 => 0 dB
    if (n > 50) return (n - 50) * 9 / 50
    else return -9 + n * 9 / 50
}

function setEq(i) {
    //[0]=>Clear, [1]=>Neutral, [2]=>Warm, [3]=>Bass, [4]=>myEQ
    console.log("setEq(" + i + ")")
    currentFilterNum = i
    const setSliderValue = (id, value) => {
        const el = document.getElementById(id)
        if (el) {
            el.value = value
        }
    }
    //adjust slider visu
    setSliderValue("40Hz", eqSlider.f40Hz[i])
    setSliderValue("121Hz", eqSlider.f121Hz[i])
    setSliderValue("547Hz", eqSlider.f547Hz[i])
    setSliderValue("674Hz", eqSlider.f674Hz[i])
    setSliderValue("818Hz", eqSlider.f818Hz[i])
    setSliderValue("1503Hz", eqSlider.f1503Hz[i])
    setSliderValue("1605Hz", eqSlider.f1605Hz[i])
    setSliderValue("1722Hz", eqSlider.f1722Hz[i])
    setSliderValue("4160Hz", eqSlider.f4160Hz[i])
    setSliderValue("12000Hz", eqSlider.f12000Hz[i])
    console.log("eqSlider.f12000Hz[" + i + "]=" + eqSlider.f12000Hz[i])
    if (audioOut.match("HTTP") && webAudioApi) {
        pass40.gain.value = sliderValToGain(eqSlider.f40Hz[i]) //dB
        pass121.gain.value = sliderValToGain(eqSlider.f121Hz[i])
        pass547.gain.value = sliderValToGain(eqSlider.f547Hz[i])
        pass674.gain.value = sliderValToGain(eqSlider.f674Hz[i])
        pass818.gain.value = sliderValToGain(eqSlider.f818Hz[i])
        pass1503.gain.value = sliderValToGain(eqSlider.f1503Hz[i])
        pass1605.gain.value = sliderValToGain(eqSlider.f1605Hz[i])
        pass1722.gain.value = sliderValToGain(eqSlider.f1722Hz[i])
        pass4160.gain.value = sliderValToGain(eqSlider.f4160Hz[i])
        pass12000.gain.value = sliderValToGain(eqSlider.f12000Hz[i])
    }
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/equalizer", true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    switch (i) {
        case 0:
            xhr.send("filter=Clear");
            break;
        case 1:
            xhr.send("filter=Neutral");
            break;
        case 2:
            xhr.send("filter=Warm");
            break;
        case 3:
            xhr.send("filter=Bass");
            break;
        case 4:
            xhr.send("filter=MyEQ");
            break;
    }
}


function saveMyEQ() {
    var data = JSON.stringify(eqSlider)
    changedEQ = false
    console.log("save myEQ on RPI")
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/equalizer", true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    //save eqSlider.json and MyEQ.txt on rpi
    xhr.send("SaveFilter=" + data);
    console.log("eqdata=" + data)
}

function openEq() {
    document.getElementById('eqModel').style.display = 'block';
    console.log("eqModalWinOpen = true")
    eqModalWinOpen = true;
}


if (modalWin) {
    findex0obj = document.getElementById("fIndex0")
    findex0obj.addEventListener('change', () => {
        setEq(0)
    })
    findex1obj = document.getElementById("fIndex1")
    findex1obj.addEventListener('change', () => {
        setEq(1)
    })
    findex2obj = document.getElementById("fIndex2")
    findex2obj.addEventListener('change', () => {
        setEq(2)
    })
    findex3obj = document.getElementById("fIndex3")
    findex3obj.addEventListener('change', () => {
        setEq(3)
    })
    findex4obj = document.getElementById("fIndex4")
    findex4obj.addEventListener('change', () => {
        console.log("clicked eq 4")
        setEq(4)
    })

    // When the user clicks X of the modal, close it
    span = document.getElementsByClassName("close-btn")[0];
    span.onclick = function () {
        eqModal.style.display = "none";
        console.log("eqModalWinOpen = false")
        eqModalWinOpen = false;
        if (changedEQ)// && !audioOut.match("HTTP"))
            saveMyEQ()
    }

    // window.onclick = function (event) {
    //     console.log("event=" + event)
    //     const selectionModal = document.getElementById('selectionModal');
    //     const eqModal = document.getElementById('eqModel');

    //     // Prüfen, ob der Klick genau auf den dunklen Hintergrund (das Modal-Overlay) ging
    //     if (event.target === selectionModal) {
    //         selectionModal.style.display = "none";
    //     }

    //     if (event.target === eqModal) {
    //         eqModal.style.display = "none";
    //         if (changedEQ)// && !audioOut.match("HTTP"))
    //             saveMyEQ()
    //     }
    // };


const eqModal = document.getElementById('eqModel');

eqModal.addEventListener("click", function (event) {
    if (event.target === eqModal) {
        eqModal.style.display = "none";
        eqModalWinOpen = false;
        console.log("eqModalWinOpen = false")
        if (changedEQ) saveMyEQ();
    }
});


if (dirType === "Radio"){
    const selectionModal = document.getElementById('selectionModal');
    selectionModal.addEventListener("click", function (event) {
        if (event.target === selectionModal) {
            selectionModal.style.display = "none";
        }
    });
} 


    // function openModal(fIndex) {
    //     modal = document.getElementById("eqModel");
    //     console.log("openModal(" + fIndex + ")")
    //     modal.style.display = "flex";
    //     changedEQ = false
    //     console.log("fIndex"+fIndex)
    //     document.getElementById("fIndex"+ fIndex).click()
    //     setEq(fIndex)
    //     console.log("set Eq(" + fIndex + ")")
    // }


    // // global machen
    // window.openModal = openModal;
}

//Line-Out
function PlayRadioBars(id, i, stat, name) {
    console.log("PlayRadioBars: " + id + "," + i + "," + stat + " " + name)

    //GET Anfrage an Server senden. Dieser setzt CORS Header...
    const proxyUrl = "/radio?url=" + encodeURIComponent(stat);
    //...kommt wieder hierher zurück und reicht die proxyUrl an das mediaElement weiter
    mediaElement.setAttribute('src', proxyUrl);
    if (dirType != "Radio/"){
        showStationName = document.getElementById("Station")
        let country = rd[i].countryCode ? rd[i].countryCode : ""
        let state = rd[i].state ? rd[i].state : ""
        showStationName.innerHTML = country + " " + state + "<br>" + rd[i].name
    }
    if (!radioPlaying) {
        console.log("start pw-play on rpi server")
        try {
            const response = fetch("/radioStation", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Playx: i })
            });
        } catch (err) {
            console.log("post=" + err)
        }
        oldButtonObj = document.getElementById(id + i)
        oldButtonObj.style.backgroundColor = 'green'; // Keep green or rely on class if preferred, user said it was OK
        // if (audioCtx && audioCtx.state === 'suspended') {
        //     audioCtx.resume().then(() => {
        //         mediaElement.play();
        //         console.log("mediaElement.play()")
        //     });
        // } else {
        //     mediaElement.play();
        //     console.log("suspended ? mediaElement.play()")
        // }
        mediaElement.play();
        radioPlaying = true
        visuBars()
    } else {
        console.log("radio stop")
        // Get the CSS variable value
        const glassBg = getComputedStyle(document.documentElement).getPropertyValue('--glass-bg');
        // Apply it to your button
        oldButtonObj.style.backgroundColor = glassBg;        
        mediaElement.pause();
        radioPlaying = false
        // clearInterval(marqueeObj)
        // resetMarquee()
        try {
            const response = fetch('/radioStation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ StopPlayx: "StopPlayx" })
            });
        } catch (err) {
            console.log("post=" + err)
        }
    }
}
function PlayRadioBarsFav(id, i, stat, name) {
    console.log("PlayRadioBarsFav: " + id + "," + i + "," + stat + " " + name)

    //GET Anfrage an Server senden. Dieser setzt CORS Header...
    const proxyUrl = "/radio?url=" + encodeURIComponent(stat);
    //...kommt wieder hierher zurück und reicht die proxyUrl an das mediaElement weiter
    mediaElement.setAttribute('src', proxyUrl);
    if (dirType != "Radio/"){
        showStationName = document.getElementById("Station")
        let country = rd[i].countryCode ? rd[i].countryCode : ""
        let state = rd[i].state ? rd[i].state : ""
        showStationName.innerHTML = country + " " + state + "<br>" + rd[i].name
    }
    if (!radioPlaying) {
        console.log("start pw-play on rpi server")
        try {
            const response = fetch("/radioFavorites", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ Playx: i })
            });
        } catch (err) {
            console.log("post=" + err)
        }
        oldButtonObj = document.getElementById(id + i)
        oldButtonObj.style.backgroundColor = 'green'; // Keep green or rely on class if preferred, user said it was OK
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                mediaElement.play();
            });
        } else {
            mediaElement.play();
        }
        radioPlaying = true
        visuBars()
    } else {
        console.log("radio stop")
        // Get the CSS variable value
        const glassBg = getComputedStyle(document.documentElement).getPropertyValue('--glass-bg');
        // Apply it to your button
        oldButtonObj.style.backgroundColor = glassBg;        
        mediaElement.pause();
        radioPlaying = false
        // clearInterval(marqueeObj)
        // resetMarquee()
        try {
            const response = fetch('/radioFavorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ StopPlayx: "StopPlayx" })
            });
        } catch (err) {
            console.log("post=" + err)
        }
    }
}

//------------------------------
//HTTP
async function PlayRadio(id, url, name) {
    console.log("PlayRadio: " + id + ", " + url + ", " + name)

    if (!radioPlaying) {
        //GET Anfrage an Server senden. Dieser setzt CORS Header...
        const proxyUrl = "/radio?url=" + encodeURIComponent(url);
        console.log(proxyUrl)
        //...kommt wieder hierher zurück und reicht die proxyUrl an das mediaElement weiter
        mediaElement.crossOrigin = "anonymous";
        mediaElement.setAttribute('src', proxyUrl);
        mediaElement.load()

        showStationName = document.getElementById("Station")
        showStationName.innerHTML = name
        console.log("play "+proxyUrl)
        oldButtonObj = document.getElementById(id)// + i)
        // oldButtonObj.style.backgroundColor = 'green'; 
        oldButtonObj.innerHTML = '<i class="bi bi-stop-fill"></i>'

 // WICHTIG: Warte auf 'canplay' oder 'loadedmetadata'
        await new Promise((resolve) => {
            const onCanPlay = () => {
                mediaElement.removeEventListener('canplay', onCanPlay);
                console.log("onCanPlay Ev received !!!!!!!")
                //debug("onCanPlay Ev received !!!!!!!")
                resolve();
            };
            mediaElement.addEventListener('canplay', onCanPlay, { once: true });
            // Fallback: Timeout nach 5 Sekunden
            setTimeout(resolve, 5000);
        });

        // // Jetzt den AudioContext erzeugen (oder neu aufbauen)
        // if (audioCtx) {
        //     await audioCtx.close();   // alten Kontext schließen
        // }
        // audioCtx = new AudioContext();
        // sourceNode = audioCtx.createMediaElementSource(mediaElement);
        // analyser = audioCtx.createAnalyser();
        // vGain = audioCtx.createGain();

        // // 🎯 Gain auf 0 (Line-Out Modus)
        // vGain.gain.value = 0.01; //kaum hörbar aber wichtig für iOS, damit Visualizer funktioniert

        // // 🔊 Audio-Pfad
        // sourceNode.connect(vGain);
        // vGain.connect(audioCtx.destination);

        // // 📊 Analyse separat (parallel!)
        // sourceNode.connect(analyser);           


        
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                mediaElement.play();
            });
        } else {
            mediaElement.play();
        }
        radioPlaying = true
        visuBars()
    } else {
        console.log("radioPlaying true, set to false")
        oldButtonObj.style.backgroundColor = '';
        oldButtonObj.innerHTML = '<i class="bi bi-play-fill"></i>'
        mediaElement.pause();
        radioPlaying = false
    }
}


if (dirType.includes("Audio")) {
    document.getElementById("searchbutton").addEventListener('click', function () {
        let search = document.getElementById("searchtext");
        console.log("searchtext=" + search.value);
        var regex = new RegExp(search.value, 'i');
        document.getElementById("butt").innerHTML = ""
        let codeBlock = ""
        if (audioOut.match("HTTP")) {
            for (i in btracks) {
                if (btracks[i].match(regex)) {
                    //nur Buttons darstellen, die den Suchbegriff inne haben
                    codeBlock += '<button class="btn-modern" id=' + '"r' + i + '"' +
                        ' type="button" onclick="PlayMusic(\'r' + '\',' + i + ')">' +
                        '🎵' + btracks[i] + '</button>'
                }
            }
        } else {
            for (i in btracks) {
                if (btracks[i].match(regex)) {
                    codeBlock += '<button class="btn-modern" id=' + '"r' + i + '"' +
                        ' type="button" onclick="PlayBars(\'r' + '\',' + i + ')">' +
                        '🎵' + btracks[i] + '<i class="bi bi-play-fill"></i></button>'
                }
            }
        }
        //codeBlock += '</div>';
        document.getElementById("butt").innerHTML = codeBlock
        console.log(codeBlock)
        //StopPlayx()
        resetMarquee()
        oldsrc = ""
        oldbuttonID = ""
        oldButtonX = ""
        oldButtonObj = ""
    });
}

if (dirType.match("Video")) {
    console.log("ok Video")
    document.getElementById("searchbutton").addEventListener('click', function () {
        let search = document.getElementById("searchtext");
        console.log("searchtext=" + search.value);
        let codeBlock = ""
        var regex = new RegExp(search.value, 'i');
        document.getElementById("videobutt").innerHTML = ""
        for (i in btracks) {
            //btracks[i]=btracks[i].replace(",","")
            if (btracks[i].match(regex)) {
                codeBlock += '<button class="btn-modern" id=' + '"vb' + i + '"' +
                    ' name="check"' +
                    ' type="button" onclick="PlayVideox(' + i + ')">' + btracks[i] + '</button>'
            }
        }
        document.getElementById("videobutt").innerHTML = codeBlock
    })
}

console.log("dirType:" + dirType)
if (dirType.includes("Audio") || dirType.match("Video")) {
    document.getElementById('searchtext').addEventListener('keydown', function (event) {
        console.log("received a KEY")
        if (event.key === 'Enter') {
            console.log("received ENTER")
            event.preventDefault(); // verhindert z. B. Form-Submit
            document.getElementById('searchbutton').click(); // ✅ Simulate button click
        }
    });
}


document.addEventListener('click', function (event) {
    const menuToggle = document.getElementById('menu-toggle');
    const mainMenu = document.getElementById('main-menu-bar');

    // ⛔ menu not present on this page
    if (!menuToggle || !mainMenu) return;

    if (menuToggle.checked) {
        if (!mainMenu.contains(event.target)) {
            menuToggle.checked = false;
        }
    }
});

function setPlatformDevice(dev){
    platformDevice = dev
}