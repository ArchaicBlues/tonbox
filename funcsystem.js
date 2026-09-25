const { spawn, exec } = require("child_process");
const constants = require('./defines.js');
const fsPromises = require('fs/promises');
const fs = require ('fs');
const path = require("path");
const detectTV = require('./funcDLNA.js');


global.settings = {
        //gateway notwendig wenn die IP geändert wird
        "gateway":constants.IP_GATEWAY_DEFAULT,
        //Zugriff über http://ip:8000
        "ip": constants.IP_DEFAULT,
        //Verzeichnisort von ArchaicNodeEJS
        "installDir": "/home/pi",
        //HTTP live streaming (Internet) oder Card Number "0","1","2" max.möglich
        "mediaOut":"0",
        //Audio Device
        "sysAudioOut":"sysdefault:CARD=Headphones",
        //Lautstärke LineOut, Headphone
        "jackVolume":"90",
        "ssid": "",
        "pass": "",
        "powerUpSoundIndex": "",//index of radioSearch or allTracks[]
        "powerUpSoundURL": "",  //medium oder URL
        "admin":"0",
        "reverb": "off",
        "filterIndex":"4",//MyEQ
        "youtubeKey":"",
        "discogsUserToken":"",
        "myUSB": ""
    },

global.update = "false"

//mountpoints
global.devADrecords = "nok"
global.devHome = "nok"
global.devMusic = "nok"
//size of all "/dev/sd*"
allDev = [];


global.blkd = {}
global.usbState = {
    usbstore: constants.USB_STORE_DIFF,
    usbmedium1:constants.USB_NOK, 
    usbmedium1MP:"",//mountpoint 
    usbmedium2:constants.USB_NOK,
    usbmedium2MP:"",//mountpoint 
    usbmedium3:constants.USB_NOK,
    usbmedium3MP:"",//mountpoint 
    usbvideocapture:constants.USB_NOK,
    usbaudiocapture:constants.USB_NOK,
    usbCDROM:constants.USB_NOK
}
global.myUSB = [];

global.storage = {
    "All":{
        "status":constants.USB_NOK,
        "size":"0G",
        "use":"0%",
        "free":"0",
    },
    "Home":{
        "status":constants.USB_NOK,
        "size":"0G",
        "use":"0%",
        "free":"0"
    },
    "Music":{
        "status":constants.USB_NOK,
        "size":"0G",
        "use":"0%",
        "free":"0"
    },
    "ADrecords":{
        "status":constants.USB_NOK,
        "size":"0G",
        "use":"0%",
        "free":"0"
    },
    "System":{
        "status":"unknown",
        "size":"unknown",
        "use":"unknown",
        "free":"unknown"
    }
}
global.datA=[]
global.datM=[]
global.datH=[]
global.usbSubdir=[]
//show progress / status
global.SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL;
global.SSEIntervalPtr;
global.setSSEIntervalPtr = false
global.audioInfo = []
global.mixerControls = []
//wifi
global.wifiStatus = {}
global.gateway = ""
global.ipList = []//0:gateway,1:etho,2:wlan0,
global.ip_config = false
global.ping_required = true
global.pageInfo = ""
global.resultTVPlayable = []
global.tvNum = 0; //index of global.resultTVPlayable
//global.swUpdateState = "unkown"
//for time justage between playing video and audio out RPI Line-Out
//calculation see videoWeb.js

var SDcardMediaServer=constants.SD_CARD_MEDIASERVER_NOK



/**************************  DEBUGGER hält wenn Schreibzyklus auf Variable stattfindet  **************************/
// Object.defineProperty(global, "settings", {
//     get() {
//         return settings;

//     },
//     set(value) {
//         debugger; // VS Code hält hier an
//         console.log(value);
//         //settings.mediaOut = value;
//     }
// });
/******************** */

/*
  Bluetooth-Handling (bluetoothctl) wird außerhalb von nodejs bewerkstelligt
  see /etc/systemd/system/Tonbox.service und bt-agent.service
  Hier wird nur geschaut ob ein bluetooth stream aktiv ist. Wenn ja, 
  sollte in der Hauptzeile das Bluetooth Zeichen erscheinen
*/

//let constants = require('./defines.js');

global.bluez = ""
global.monSys = {temp:"",space:""}

// Bluetooth-Audio kommt beim Verbinden mit ungedaempftem PipeWire-Volume
// (100%) an, wird aber gegenueber dem Radiostream trotzdem als sehr leise
// wahrgenommen (Handy-eigene Medienlautstaerke/AVRCP bzw. Referenzpegel).
// Deshalb wird jeder aktive BT-Sink-Input software-seitig auf diesen Wert
// verstaerkt (Unity-Gain = 100%). Bei Bedarf anpassen, falls zu leise/laut.
const BT_VOLUME_BOOST_PERCENT = 150

// Liefert alle gerade aktiv streamenden (nicht "corked"/pausierten)
// Bluetooth-Sink-Inputs. "Verbunden" (device.api=bluez5) reicht nicht: ein
// Bluetooth-Geraet kann verbunden sein, ohne gerade Audio zu senden (z.B.
// Musik auf dem Handy pausiert).
async function getActiveBtSinkInputs() {
  try {
    const raw = await execCmd("pactl -f json list sink-inputs 2>/dev/null")
    const items = JSON.parse(raw)
    return items.filter(si => si.properties && si.properties["device.api"] === "bluez5" && si.corked === false)
  } catch (err) {
    return []
  }
}

// Global, damit auch funcRadio.js vor dem Start einer lokalen Wiedergabe
// pruefen kann, ob gerade ein BT-Stream Vorrang haben sollte.
global.isBtStreamActive = async function() {
  const active = await getActiveBtSinkInputs()
  return active.length > 0
}

async function boostBtVolume(activeBtSinkInputs) {
  for (const si of activeBtSinkInputs) {
    const currentPercent = parseInt(si.volume && si.volume["front-left"] && si.volume["front-left"].value_percent) || 100
    if (currentPercent !== BT_VOLUME_BOOST_PERCENT) {
      await execCmd("pactl set-sink-input-volume " + si.index + " " + BT_VOLUME_BOOST_PERCENT + "%").catch(() => {})
    }
  }
}

async function doMonitorBT() {
  try{
    // .catch() statt try/catch-Reject: execCmd() wirft eine Rejection, wenn
    // "ls" nichts findet (Geraet getrennt) - ohne das faengt der aeussere
    // catch das ab, BEVOR die Zuweisung passiert, und bluez bleibt fuer
    // immer auf dem letzten "verbunden"-Wert stehen (nie wieder "").
    bluez = await execCmd("ls help/btDevice 2>/dev/null").catch(() => "")
    if (bluez) {
      const activeBtSinkInputs = await getActiveBtSinkInputs()
      if (activeBtSinkInputs.length > 0) {
        await boostBtVolume(activeBtSinkInputs)
        //console.log("doMonitorBT(): BT-Stream aktiv, stopMusicPlay")
        stopMusicPlay(constants.AUDIO_ALL)
      }
    }
  }catch(err){
    //console.log(err)
  } 
}
async function monitorTemperatur() {
     monSys.temp = await execCmd("vcgencmd measure_temp")
    //{ temp: "temp=51.6'C\n", space: '871G\n' }
    // Behält nur Ziffern und Punkte, entfernt alles andere
    const t = monSys.temp.match(/-?\d+(\.\d+)?/);
    if(t[0]>=80.0) {
        procStatus.text = "*** CPU-Temperatur zu hoch! Power down in 5 Sekunden ! ***"
        return
    }
    if(t[0]>74){ 
        if (!procStatus.text.includes("Power down")){
            if (!procStatus.text.includes("automatischer Shutdown bei 80"))
                procStatus.text += "*** WARNUNG: CPU Temperatur > 74° automatischer Shutdown bei 80° ***"
        }
    }
}
async function monitorFreeSpace() {
    monSys.space = await execCmd("df -h "+devMusic+" | awk 'NR==2 {print $4}'")
    console.log(monSys)
    // Behält nur Ziffern und Punkte, entfernt alles andere
    const s = Number(monSys.space.match(/-?\d+(\.\d+)?/));
    if(s <= 1) {
        if (!procStatus.text.includes("*** WARNUNG: Speicherplatz < 1G ! ***"))
            procStatus.text += "*** WARNUNG: Speicherplatz < 1G ! ***"
    }
}


function initStorage(){
    usbState.usbmedium1=constants.USB_NOK
    usbState.usbmedium2=constants.USB_NOK
    usbState.usbmedium3=constants.USB_NOK
    usbState.usbmedium1MP=""
    usbState.usbmedium2MP=""
    usbState.usbmedium3MP=""
    devADrecords = "nok"
    devHome = "nok"
    devMusic = "nok"
    storage.Home.status = "nok"
    storage.Home.size = "0G"
    storage.Home.use = "0%"
    storage.Home.free = "0"
    storage.Music.status = "nok"
    storage.Music.size = "0G"
    storage.Music.use = "0%"
    storage.Music.free = "0"
    storage.ADrecords.status = "nok"
    storage.ADrecords.size = "0G"
    storage.ADrecords.use = "0%"
    storage.ADrecords.free = "0"
    datA = []; datM=[]; datH=[]
}


async function mountDEV(dev, mountpoint){
    return new Promise((resolve, reject) => {
        //mount with user rights!
        exec("id >&1", (error, stdout, stderr) => {
            var id = stdout.split(" ")
            var uid = id[0]
            var p = uid.search("=")
            uid = uid.replace("(","-")
            var p2 = uid.search("-")
            uid = uid.substr(p+1,p2-4)
            var gid = id[1]
            p = gid.search("=")
            gid = gid.replace("(","-")
            p2 = gid.search("-")
            gid = gid.substr(p+1,p2-4)
            var cmd = 'sudo mount -t vfat -o gid='+gid+",uid="+uid+' /dev/' + dev + ' ' + mountpoint + ' -o umask=000'
            console.log(cmd)
            exec(cmd, (error, stdout, stderr) => {
                if (error || stderr) {
                        console.log(error + " " + stderr)
                        reject(error)
                }
                else {
                    resolve("ok")
                }
            })
        })
    })
}

async function checkDevMediaServer(mountpoint){
    if (mountpoint.length <= 2) {
        return "root"
    }
    usbSubdir = []
    console.log("checkDevMediaServer " + mountpoint)
    let stdout = await execCmd('ls ' + mountpoint + ' >&1')
    if (stdout.match("mediaServer")){
        stdout = await execCmd('ls '+ mountpoint + '/mediaServer/ >&1')
        if (stdout){
            usbSubdir = stdout.split("\n")
            usbSubdir.pop()
            if (usbSubdir.length > 0)
                setMedia(constants.USB_OK,mountpoint)
            else
                setMedia(constants.USB_EMPTY,mountpoint)
            return "ok"
        }
    }
    if (stdout.length > 0){
        setMedia(constants.USB_NOT_EMPTY,mountpoint)
        return("notEmpty")
    }
    else{
        setMedia(constants.USB_EMPTY,mountpoint)
        return "ok"
    }
}


function checkSubdir(sdir,mountpoint){
    return new Promise((resolve, reject) => {
        if (sdir === "Music") {
            exec("ls " + devMusic + " >&1", (error, stdout, stderr) => {
                if ((stdout.search("Radio") < 0) || (stdout.search("Audio") < 0) || (stdout.search("Video") < 0)){
                    console.log("missing dir in " + devMusic)
                    resolve("ok")
                }
                else{
                    setMedia(constants.USB_OK,devMusic)
                    resolve("ok")
                }
            })
        }else
        if (sdir === "Home") {
            devHome=mountpoint+"/mediaServer/Home"
            exec("ls " + devHome + " >&1", (error, stdout, stderr) => {
                if (stdout.search("Pictures") < 0) {
                    console.log("missing dir in " + devHome); 
                    resolve("ok")
                }
                else{
                    setMedia(constants.USB_OK,devHome)
                    resolve("ok")
                }
            })            
        }
    })
}  


function getFreeMedia(){
    if (usbState.usbmedium1 === constants.USB_NOK) return "usbmedium1"
    if (usbState.usbmedium2 === constants.USB_NOK) return "usbmedium2"
    if (usbState.usbmedium3 === constants.USB_NOK) return "usbmedium3"
    return ""
}

function setMedia(status,mountpoint){
    if (mountpoint.match("usbmedium1")){
        usbState.usbmedium1=status;
        usbState.usbmedium1MP=mountpoint;
        return;
    }
    if (mountpoint.match("usbmedium2")){
        usbState.usbmedium2=status;
        usbState.usbmedium2MP=mountpoint;
        return;
    }
    if (mountpoint.match("usbmedium3")){
        usbState.usbmedium3=status;
        usbState.usbmedium3MP=mountpoint;
        return;
    }
}

function checkAll(){
    if (devADrecords != constants.USB_NOK){ 
        var media = ""
        if (devADrecords.match("usbmedium1")) media ="usbmedium1"  
            else if (devADrecords.match("usbmedium2")) media ="usbmedium2"  
                else if (devADrecords.match("usbmedium3")) media ="usbmedium3"  
        if (devADrecords.match(media+"/mediaServer") && 
            devMusic.match(media+"/mediaServer") && 
            devHome.match(media+"/mediaServer")){
            console.log("all Tonboxdirs on one USB storage device detected")
            //hat Priorität!
            usbState.usbmedium1=constants.USB_NOK
            usbState.usbmedium2=constants.USB_NOK
            usbState.usbmedium3=constants.USB_NOK
            usbState.usbmedium1MP=devADrecords
            usbState.usbmedium2MP=devMusic
            usbState.usbmedium3MP=devHome
            if (media === "usbmedium1") usbState.usbmedium1 = constants.USB_OK
            else if (media === "usbmedium2") usbState.usbmedium2 = constants.USB_OK
            else if (media === "usbmedium3") usbState.usbmedium3 = constants.USB_OK
            return true
        }
    } else
        return false
}

const checkDev = async (res) => {
    var i=0, dev = "";
    try{
        for (i in blkd.blockdevices){
            if (!blkd.blockdevices[i].name.match("sr") && blkd.blockdevices[i].size != "0B"){ 
                var media = getFreeMedia()
                if (blkd.blockdevices[i].hasOwnProperty("children")){
                    dev = blkd.blockdevices[i].children[0].name                
                    if (dev.match("sd")){
                        var mp = ""
                        for (n in blkd.blockdevices[i].children){
                            mp = blkd.blockdevices[i].children[n].mountpoints[0]
                            let result = await mountCheck(mp,dev,media)
                            console.log(result)
                        }
                    }
                } 
                else {
                    dev = blkd.blockdevices[i].name
                    mp = blkd.blockdevices[i].mountpoints[0]
                    let result = await mountCheck(mp,dev,media)
                    console.log(result)
                }
            }
        }
        await checkStorage(res)   
    }
    catch(err){
        console.log("checkDev: " + err)
        checkStorage(res)   
    }
}

const mountCheck = async (mp,dev,media) => {
    try{
        if (!mp){
            //if not mounted...
            mp = "/home/pi/media/"+media
            //try to mount
            if (media){
                await execCmd("mkdir -p ~/media/usbmedium1;\
                                mkdir -p ~/media/usbmedium2;\
                                mkdir -p ~/media/usbmedium3")
                await mountDEV(dev,mp)
            }
            else{
                procStatus.text="Media exceeds !"
                console.log(procStatus.text)
            }
        }
        //check if storage belongs to mediaServer")
        let result = await checkDevMediaServer(mp) //sets usbSubdir
        if (!result.match("notEmpty")){
            if (usbSubdir.length > 0){
                for (m in usbSubdir){
                    if (usbSubdir[m].match("ADrecords")) {
                        devADrecords=mp+"/mediaServer/ADrecords"
                    }
                    if (usbSubdir[m].match("Music")) {
                        devMusic=mp+"/mediaServer/Music"
                        await checkSubdir("Music",mp)
                    }                
                    if (usbSubdir[m].match("Home")) {
                        devHome=mp+"/mediaServer/Home"
                        await checkSubdir("Home",mp)
                    }                
                }
            }
        }
        await generateCoverImg("deleteOld")
        return result 
    }
    catch(msg){
        console.log(err)
        if (msg.match("not empty"))
            console.log(mp+" could be myUSB !")
        return msg
    }
}


const readTree = async (res) => {
    try{
        if (devHome.match("nok") && devMusic.match("nok") && devADrecords.match("nok")){
            //no "mediaServer" dir on usb data device found
            //USB Speicher hat immer Vorrang gegenüber SD-Karte (wo auch das OS drauf ist)
            //Wenn USB-Speicher existiert und "empty" ist, dann Benutzer fragen, ob initialisiert werden soll..
            //check if "mediaServer" on SD-Card"

            //check if any USB empty
            if (usbState.usbmedium1.match("empty") || usbState.usbmedium2.match("empty")
             || usbState.usbmedium3.match("empty")){
                setInitPage(res)
                return
            }

            var result = await execCmd("ls ../mediaServer >&1")
            console.log("mediaServer on SD-Card:",result)
            if (result.match("err")){
                console.log("kein USB-Verzeichnis <mediaServer>")
                SDcardMediaServer = constants.SD_CARD_MEDIASERVER_NOK
            }
            else {
                if (result.match("ADrecords")) devADrecords="/home/pi/mediaServer/ADrecords"
                if (result.match("Music")) devMusic="/home/pi/mediaServer/Music"
                if (result.match("Home")) devHome="/home/pi/mediaServer/Home"
                console.log("devADrecords:"+ devADrecords + "  devMusic:" + devMusic + "  devHome:" + devHome)
                SDcardMediaServer = constants.SD_CARD_MEDIASERVER_OK
                await generateCoverImg("deleteOld")
            }
        }else{
            //Only some of the 3 dirs were found on USB storage (e.g. just devMusic on
            //a single USB stick) - fill in the rest from the SD-card's mediaServer
            //folder (creating it if needed) instead of leaving them "nok", which would
            //make the block below treat the whole media server as broken.
            if (devADrecords.match("nok") || devMusic.match("nok") || devHome.match("nok")){
                if (devADrecords.match("nok")){
                    devADrecords = "/home/pi/mediaServer/ADrecords"
                    await execCmd("mkdir -p " + devADrecords)
                }
                if (devMusic.match("nok")){
                    devMusic = "/home/pi/mediaServer/Music"
                    await execCmd("mkdir -p " + devMusic + "/Audio " + devMusic + "/Radio " + devMusic + "/Video")
                }
                if (devHome.match("nok")){
                    devHome = "/home/pi/mediaServer/Home"
                    await execCmd("mkdir -p " + devHome + "/Pictures")
                }
                console.log("filled missing mediaServer dirs from SD-Card - devADrecords:"+devADrecords+" devMusic:"+devMusic+" devHome:"+devHome)
            }
            //get dir tree of each mountpoint
            var dH=""; var dM=""; var dA="";
            if (devHome.match("/mediaServer"))
                dH = devHome
            if (devMusic.match("/mediaServer"))
                dM = devMusic
            if (devADrecords.match("/mediaServer"))
                dA = devADrecords
            await execCmd("rm -f help/dirH.txt;rm -f help/dirM.txt;rm -f help/dirA.txt;")
            if (dH) {
                await execCmd("tree " + dH + " -d -L 2 -o help/dirH.txt")
                await readData("dirH.txt")   
            }
            if (dM) {
                await execCmd("tree " + dM + " -d -L 3 -o help/dirM.txt")
                await readData("dirM.txt")
            }
            if (dA){ 
                await execCmd("tree " + dA + " -d -L 2 -o help/dirA.txt")
                await readData("dirA.txt")
            }
            if (dH && dM && dA){
                SDcardMediaServer = constants.SD_CARD_MEDIASERVER_OK
                await generateCoverImg("del")
            }
            else
                SDcardMediaServer = constants.SD_CARD_MEDIASERVER_NOK
        }
        if (res)
        await setInitPage(res)
    }catch(err){
        procStatus.txt = "readTree " + err
        console.log(procStatus.txt);
        if (res)
        res.render('pages/storage',{pageInfo:pageInfo,btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, 
            storage:storage, devHome:devHome, devMusic:devMusic, devADrecords:devADrecords, 
            treeH:"", treeM:"", treeA:"", usbState:usbState, SDcardMediaServer:SDcardMediaServer, storeSD:""})
    }
}


const readTreeSDCard = async (res) => {
    //get dir tree of each 
    try{        
        await execCmd("rm -f help/dirH.txt;rm -f help/dirM.txt;rm -f help/dirA.txt;")
        await execCmd("tree " + devHome + " -d -L 2 -o help/dirH.txt")
        await execCmd("tree " + devMusic + " -d -L 3 -o help/dirM.txt")
        await execCmd("tree " + devADrecords + " -d -L 2 -o help/dirA.txt")
        await readData("dirA.txt")
        await readData("dirH.txt")   
        await readData("dirM.txt")
        var result = await execCmd("df -h ../mediaServer >&1")
        result = result.split("\n")
        result = result[1].split(" ")
        storage.ADrecords.size = storage.Music.size = storage.Home.size = result[3] 
        storage.ADrecords.use = storage.Music.use = storage.Home.use = result[4]
        storage.ADrecords.free = storage.Music.free = storage.Home.free = result[8]
    }catch(err){
        console.log("readTreeSDcard " + err);
    }
}

function readData(f){
    return new Promise((resolve, reject) => {
        var dat = []
        fs.readFile('help/'+f, 'utf8', (err, data) => {
            if (err) 
                console.log(err)
            else {
                switch (f){
                    case "dirH.txt":
                        datH = data.split("\n")
                        var i=0; for (i in datH) datH[i] = datH[i].replace(/ /g,"&nbsp")
                        break;

                    case "dirM.txt":
                        datM = data.split("\n")
                        var i=0; for (i in datM) datM[i] = datM[i].replace(/ /g,"&nbsp")
                        break;

                    case "dirA.txt":
                        datA = data.split("\n")
                        var i=0; for (i in datA) datA[i] = datA[i].replace(/ /g,"&nbsp")
                        break;

                    default:
                        reject("wrong case switch in readData()")
                        break;
                }
            }
            resolve("ok")
        })
    })
}


// async function readData(f) {
//     try {
//         const data = await execCmd("cat help/" + f, " >&1");
//         let lines = data.split("\n");lines.pop()
        
//         // Verarbeitet die Leerzeichen zu &nbsp;
//         lines = lines.map(line => line.replace(/ /g, "&nbsp;"));

//         // Optional: Falls du die Daten basierend auf dem Dateinamen 
//         // in spezifische Variablen speichern willst:
//         return {
//             fileName: f,
//             content: lines
//         };
//     } catch (err) {
//         console.error("Fehler beim Lesen:", err);
//         throw err; // Reicht den Fehler an den Aufrufer weiter
//     }
// }

async function setInitPage(res){
    try{
        await loadRadioHistory("")
        await loadRadioSearch() //fill radioFound {}
        await loadYouTubeSearch()
        if((devHome != "nok") && (devMusic != "nok") && (devADrecords != "nok")){
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
        var data = await execCmd ("ls /home/pi/ >&1")
        if (data.match("mediaServer")) 
            SDcardMediaServer = constants.SD_CARD_MEDIASERVER_OK

        if (SDcardMediaServer === constants.SD_CARD_MEDIASERVER_NOK){
            var storeSD = await execCmd("df -h | grep mmcblk >&1")
            if (res) 
                res.render('pages/storage',{pageInfo:pageInfo,btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, 
                storage:storage, devHome:devHome, devMusic:devMusic, devADrecords:devADrecords, 
                treeH:datH, treeM:datM, treeA:datA, usbState:usbState, SDcardMediaServer:SDcardMediaServer,storeSD:storeSD})
            return
        }
        if (res) 
            res.render('pages/storage',{pageInfo:pageInfo,btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, 
            storage:storage, devHome:devHome, devMusic:devMusic, devADrecords:devADrecords, 
            treeH:datH, treeM:datM, treeA:datA, usbState:usbState, SDcardMediaServer:SDcardMediaServer,storeSD:""})
    }
    catch(err){
        console.log(err)
    }
}


/*
Die EnvironmentVariable wird hier nur für die aktuelle Sitzung gesetzt.
Für eine systemweite Nutzung muss diese in /proc/self/environ gesetzt werden
pi:~ $cat /proc/self/environ | tr '\0' '\n'
SHELL=/bin/bash
NVM_INC=" + settings.installDir + "/ArchaicNodeEJS.nvm/versions/node/v16.13.2/include/node
NO_AT_BRIDGE=1
PWD=/home/pi
LOGNAME=pi
XDG_SESSION_TYPE=tty
MOTD_SHOWN=pam
HOME=/home/pi
LANG=en_GB.UTF-8
...
*/
module.exports = function(required){
    this.monitorSystem = function(){
        setInterval(doMonitorBT, 1500);
        setInterval(monitorTemperatur, 15000);
        setInterval(monitorFreeSpace, 20000);
    },
    this.ledOrange = function(turn){
        if(turn==="On"){
            ledOn(constants.LED22_ORANGE)
            ledOn(constants.LED23_ORANGE)
            ledOn(constants.LED24_ORANGE)
            ledOn(constants.LED25_ORANGE)
            console.log('LED orange ist AN');
        }else{
            ledOff(constants.LED22_ORANGE)
            ledOff(constants.LED23_ORANGE)
            ledOff(constants.LED24_ORANGE)
            ledOff(constants.LED25_ORANGE)
            console.log('LED orange ist AUS');
        }
    },
    this.ledGreen = function(turn){
        if(turn==="On"){
            ledOn(constants.LED17_GREEN)
            ledOn(constants.LED27_GREEN)
            console.log('LED green ist AN');
        }else{
            ledOff(constants.LED17_GREEN)
            ledOff(constants.LED27_GREEN)
            console.log('LED green ist AUS');
        }
    },
    this.ledOn = function(num) {
        rpio.write(num, rpio.HIGH);
    },
    this.ledOff = function(num) {
        rpio.write(num, rpio.LOW);
    },
    //this.dataTree = "not available",
    this.checkUsbCDROM = async function (){
      try{
        var info = await execCmd("lsblk -l | grep sr0 >&1")
        if (info)
        {
            usbState.usbCDROM=constants.USB_OK
        }else{
            usbState.usbCDROM=constants.USB_NOK
            procStatus.text="USB CDROM device not found";
            console.log("USB CDROM device not found");
        }
        }catch(err){
            
        }
    },
    this.checkUsbVideoCapture = async function (){
        try{
            var info = await execCmd("sudo lsusb")
            if (info.match("Video Capture") || info.match("DVD EZMaker"))
            {
                usbState.usbvideocapture=constants.USB_OK
            }else{
                usbState.usbvideocapture=constants.USB_NOK
                console.log("USB video capture device not found");
            }
        }catch(err){
            console.log(err)
            usbState.usbvideocapture=constants.USB_NOK
        }
    },
    this.checkUsbAudioCapture = async function (){
        try{
        var dat = await execCmd("arecord -l >&1")
            dat = dat.split("\n"); dat.pop()
            usbState.usbaudiocapture = ""
            var found = false
            for (i in dat){
                if (dat[i].match("card")){
//                    usbState.usbaudiocapture += dat[i]
                    found = true
                    let match = dat[i].match(/card\s+(\d+)/);
                    if (match) {
                        const cardNumber = match[1];
                        console.log(cardNumber);
                        usbState.usbaudiocapture=cardNumber+"," //needed for plughw 1,0
                    }
                    match = dat[i].match(/device\s+(\d+)/);
                    if (match) {
                        const cardDevice = match[1];
                        console.log(cardDevice);
                        usbState.usbaudiocapture+=cardDevice
                    }
                    break;
                }
            }
            console.log("arecord -l ="+usbState.usbaudiocapture)
            if (found){
                //nur ein Input Device kann benutzt werden !
                //Benutzer sollte alle Anderen entfernen
                process.env.AUDIODRIVER="alsa";
                var pos1 = dat[1].search("card ")
                var card = dat[1].slice(pos1+5,pos1+6)
                pos1 = dat[1].search("device ")
                var device = dat[1].slice(pos1+7,pos1+8)
                process.env.AUDIODEV="hw:"+card+","+ device   
                console.log(dat[1]+" will be used")
            }
            else
            {
                usbState.usbaudiocapture=constants.USB_NOK
            }
        }
        catch(err){
            console.log("checkUsbAudioCapture="+err)
        }
    },
    this.getBlockdevice = async function(res){
        await checkUsbAudioCapture()
        await checkUsbVideoCapture()
        await checkUsbCDROM()
        try{
        var inf = await execCmd('lsblk -J >&1')
        blkd = JSON.parse(inf)
        await checkDev(res)
        }catch(err){console.log(err)}
    },
    this.checkStorage =async function (res){
        await storageEvaluation()
        //---------------------
        //check if an usb stick (status = 'data') exist with audio data
        //if so, than show up new MEDIA as "myUSB"
        //User shall allow work with "myUSB" as same as LIBRARY "Audio"
        settings.myUSB = "" //for side menu info
        
        if (usbState.usbmedium1 === 'data'){
            scanDirectory(usbState.usbmedium1MP)
            .then(result => {
                if (result) {
                    settings.myUSB = 'data'
//                    readTree(res)
                }
            })
        }else
        if (usbState.usbmedium2 === 'data'){
            scanDirectory(usbState.usbmedium2MP)
            .then(result => {
                if (result) {
                    settings.myUSB = 'data'
//                    readTree(res)
                }
            })
        }else
        if (usbState.usbmedium3 === 'data'){
            scanDirectory(usbState.usbmedium3MP)
            .then(result => {
                if (result) {
                    settings.myUSB = 'data'
//                    readTree(res)
                }
            })
        }
        readTree(res)
    },
    this.getStorage = function (res){

    },
    this.storageEvaluation = async function(){
        try{
            //for size check / emptiness
            console.log("storageEvaluation")
            var stdout = await execCmd('df -h | grep /dev/sd >&1 || true')
            if (stdout){
                console.log(stdout)
                let d = stdout.split("\n")
                let e = []
                var index = 0
                if (d[0].match("sd")){
                    var i=0; 
                    for (i in d) {
                        e = d[i].split(" ")
                        for (n in e) {
                            if (e[n] != "") 
                                //allDev[index++] = e[n]
                                allDev.push(e[n])
                        }
                    }
                }
                stdout = await execCmd('df -h >&1')
                var storX = stdout.split("\n")
                var store = []

                var p = devHome.search("/mediaServer/Home")
                var sub = devHome.substr(0,p)
                var x = 0
                var i=0; 
                for (i in allDev){
                    if (allDev[i] === sub){
                        x=i
                        break;
                    }
                }
                sub += "/mediaServer"
                //check if all subdirs in one storage / mountpoint
                if (devHome.match(sub) && devMusic.match(sub) && devADrecords.match(sub))
                {
                    storage.Music.status = storage.Home.status = storage.ADrecords.status = sub
                    storage.Music.size = storage.Home.size = storage.ADrecords.size = allDev[x-4]
                    storage.Music.use = storage.Home.use = storage.ADrecords.use = allDev[x-3]
                    storage.Music.free = storage.Home.free = storage.ADrecords.free = allDev[x-2]
                }else{
                    var p = devHome.search("/mediaServer/Home")
                    if (p>=0){
                        //get mountpoint
                        var mp = devHome.substr(0,p)
                        var i=0; for (i in storX){
                            if (storX[i].match(mp)) {
                                    var storY = storX[i].split(" ")
                                    for (n in storY) if (storY[n] != "") store.push(storY[n])
                                    storage.Home.status = devHome
                                    storage.Home.size = store[1]
                                    storage.Home.use = store[2]
                                    storage.Home.free = store[3]
                                    break;
                                }
                            }
                    }

                    p = devMusic.search("/mediaServer/Music")
                    if (p>=0){
                        //get mountpoint
                        var mp = devMusic.substr(0,p)
                        var i=0; for (i in storX){
                            if (storX[i].search(mp) >= 0) {
                                var storY = storX[i].split(" ")
                                store = []
                                for (n in storY) if (storY[n] != "") store.push(storY[n])
                                storage.Music.status = devMusic//getUSBState(m)
                                storage.Music.size = store[1]
                                storage.Music.use = store[2]
                                storage.Music.free = store[3]
                                break;
                            }
                        }
                    }

                    p = devADrecords.search("/mediaServer")
                    if (p>=0){
                        //get mountpoint
                        var mp = devADrecords.substr(0,p)
                        var i=0; for (i in storX){
                            if (storX[i].search(mp) >= 0) {
                                var storY = storX[i].split(" ")
                                store = []
                                for (n in storY) if (storY[n] != "") store.push(storY[n])
                                storage.ADrecords.status = devADrecords
                                storage.ADrecords.size = store[1]
                                storage.ADrecords.use = store[2]
                                storage.ADrecords.free = store[3]
                                break;
                            }
                        }
                    }
                }        
            }else{
                //no sdc, sdb, sdc...no usb store
                checkMediaServerOnSD("")
            }        
//            console.log("devHome="+devHome+"  "+"devMusic="+devMusic+"  "+"devADrecords="+devADrecords)
//            if ((storage.ADrecords.status == "nok") && (storage.Home.status == "nok") && (storage.Music.status == "nok")){
//                getSDcardSpace()
//            }
        }
        catch(err){
            if (err.cmd.match("df -h | grep /dev/sd >&1")){
                console.log("check SD Card !")
                getSDcardSpace()
            }else  
                console.log(err)
        }
    },
    this.getSDcardSpace = function (){
        exec("df -h /home/pi/mediaServer >&1", (error, stdout, stderr) => {
            if (!error){
                storage.Music.size ="";storage.Music.use="";storage.Music.free=""
                let storX = stdout.split("\n")
                let store = storX[1].split(" ")
                storage.Music.status = storage.Home.status = storage.ADrecords.status = "ok"
                for (i in store){
                    if (store[i].match("G")){
                        if(!storage.Music.size) 
                            storage.Music.size=storage.Home.size = storage.ADrecords.size = store[i]
                        else if(!storage.Music.use) 
                            storage.Music.use = storage.Home.use = storage.ADrecords.use = store[i]
                        else if(!storage.Music.free) 
                            storage.Music.free = storage.Home.free = storage.ADrecords.free = store[i]
                    }
                }
                console.log("getSDcardSpace:")
                console.log(stdout)
                devADrecords="/home/pi/mediaServer/ADrecords"
                devMusic="/home/pi/mediaServer/Music"
                devHome="/home/pi/mediaServer/Home"
            }else{
                console.log("getSDcardSpace:"+error)
            }
        })
    },
    this.getUSBState = function(m){
        switch(m){
            case "usbmedium1": return usbState.usbmedium1
            case "usbmedium2": return usbState.usbmedium2
            case "usbmedium3": return usbState.usbmedium3
        }
    },
    this.doSystem = async function (res){
    try{
        //await getIP()
        var SDData = await execCmd('df / >&1')
        let sysData = ""
        sysData += "Tonbox Software Version: " + constants.SOFTWARE_VERSION
        if (await checkYoutubeKey(settings.youtubeKey)) sysData += " - YouTubeKey ok"
        else sysData += " - YouTubeKey not available"
        if (await checkDiscogsToken(settings.discogsUserToken)) sysData += " - discogsUserToken ok - "
        else sysData += " - discogsUserToken not available - "
        sysData += await execCmd('uname -mrsn >&1')
        sysData += " - "
        sysData += await execCmd('cat /proc/device-tree/model >&1')
        sysData += " - "
        sysData += await execCmd('lsb_release -a >&1')
        let s = await execCmd('free -m >&1'); s=s.split("\n"); s=s[1].split(" ")
        sysData += " - RPI Hauptspeicher: "
        let r = []
        for (i in s){
            if (s[i]) r.push(s[i])
        }
        sysData += "total="+r[1]+"M use="+r[2]+"M free="+r[3]+"M"
        sysData += " - SD-Karte (total | used | available | use%): "
        sysData += await execCmd('df -BG /home/pi | grep /dev/ >&1')
        sysData += " - Audio: "
        sysData += await execCmd('aplay -l | grep card >&1')

        if (res) {
            pageInfo = "System"
            res.render('pages/system', {pageInfo:pageInfo,resultTV:resultTV,settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, usb:usbState, 
            info:SDData, sys:sysData.toString(), settings:settings,devAD:devADrecords,devRM:devHome,devYT:devMusic,audio:audioInfo,
            treeH:datH, treeM:datM, treeA:datA,devHome:devHome, devMusic:devMusic, devADrecords:devADrecords, ipList:ipList})
            }
        }
        catch(err){
            procStatus.txt = err
            console.log(err)
            if (res) {
                pageInfo = "System"
                res.render('pages/system', {pageInfo:pageInfo,resultTV:resultTV,settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:err, usb:usbState, 
                info:helpData, sys:sysData, settings:settings,devAD:devADrecords,devRM:devHome,devYT:devMusic,audio:audioInfo,
                treeH:datH, treeM:datM, treeA:datA, devHome:devHome, devMusic:devMusic, devADrecords:devADrecords,ipList:ipList})
            }
        }
    },
    this.getIP = async function (){
        try{
            
            ipList.length = 0 //array löschen
            const [gatewayOut, eth0Out, wlan0Out] = await Promise.all([
                execCmd('nmcli d show | grep IP4.GATEWAY >&1'),
                execCmd('ifconfig eth0 | grep broadcast >&1'),
                execCmd('ifconfig wlan0 | grep broadcast >&1')
            ])

            let inf = gatewayOut
            inf = inf.split("\n")
            inf = inf[0].split(" ")
            if (!inf[inf.length-1].match("--")){
                settings.gateway = inf[inf.length-1]
                ipList[0] = settings.gateway 
                console.log("detected Gateway...")
            } 

            //try to get IP of eth0
            ipList[1] = ""
            if (eth0Out){
                inf = eth0Out.split("inet"); 
                inf = inf[1].split(" ")
                var ip = inf[1]
                if (ip.match("192.168")){
                    ipList[1] = ip 
                    console.log("detected eth0 IP="+ipList[1])
                } 
            }
            //try to get IP of wlan0
            ipList[2] = ""
            if (wlan0Out){
                inf = wlan0Out.split("inet")
                inf = inf[1].split(" ")
                ip = inf[1]
                if (ip.match("192.168")){
                    ipList[2] = ip
                    console.log("detected wlan0 IP="+ipList[2])
                }
            }
            console.log("eth0IP="+ipList[1] + " wlan0IP="+ipList[2])
        }
        catch(err){
            console.log("getIP: " + err)
            procStatus.text = "getIP: " + err
        }
    },
    this.getAudioOut = async function(){
        try{        
            var c = await execCmd('cat /proc/asound/cards >&1')
            c = c.split("\n")
            //USB-Plattenspieler als "CODEC" erkannt - darf nicht benutzt werden !
            //"arecord -l" listet hn auch auf
            audioInfo[0] = c[0] //always Headphone
            for (i in c){
                if (c[i].match("DAC")){ 
                    //Headphone wird nicht benutzt wenn HAT DAC vorhanden !
                    audioInfo[0] = c[i]
                    break;
                }
            }
            if (!settings.mediaOut.match("HTTP")) {
                var index = Number(settings.mediaOut)
                if (index <= audioInfo.length-1){
                    var s = audioInfo[index].indexOf("["); 
                    var e = audioInfo[index].indexOf("]");
                    var dev = 0
                    if (s>=0 && e > s) 
                        dev = audioInfo[index].slice(s+1,e)
                    dev = dev.replace(/ /g,"")
                    settings.sysAudioOut = "sysdefault:CARD=" + dev
                }else {
                    //settings.mediaOut nicht passend zur aktuellen Konfiguration
                    settings.sysAudioOut = "sysdefault:CARD=Headphones"//default in case something went wrong
                    settings.mediaOut = "0"
                    console.log("using " + settings.sysAudioOut)
                    await writeSettings()
                }
            }
        }catch(err){
            console.log(err)
        }
    },
    this.writeMediaSettings = async function (dev){
        try {
            var dat = await execCmd("cat .settings.conf >&1")
            var dat = JSON.parse(dat)
            let save = false
            if (!dat.mediaOut.match(dev)){
                dat.mediaOut = dev
                settings.mediaOut = dev
                // var data = JSON.stringify(dat)
                // fs.writeFileSync('.settings.conf', data)
                await writeSettings()
            }
        }
        catch (err){
            console.log(err)
        }
    },
    this.umountUSB = async function(){
        try{
            await execCmd("sudo umount /home/pi/media/usbmedium1 || true; \
            sudo umount /home/pi/media/usbmedium2 || true; \
            sudo umount /home/pi/media/usbmedium3 || true")
            //await execCmd("ls >/dev/null")
            usbState.usbmedium1 = constants.USB_NOK
            usbState.usbmedium1MP = ''
            usbState.usbmedium2 = constants.USB_NOK
            usbState.usbmedium2MP = ''
            usbState.usbmedium3 = constants.USB_NOK
            usbState.usbmedium3MP = ''
            settings.myUSB = ""
            myUSB = []
            procStatus.text="usbmedium unmounted"
            console.log(procStatus.text)
            initStorage()
            allDev = []
            await checkSD()
            //setInitPage(res);//this.doSystem(res)
        }catch(err){
            await checkSD()
            //setInitPage(res);//this.doSystem(res)
        }
    },
    this.checkSD = async function(){
        try{
            var result = await execCmd("ls ../mediaServer >&1")
            console.log("mediaServer on SD-Card:",result)
            if (result.match("err")){
                console.log("kein USB-Verzeichnis <mediaServer>")
                SDcardMediaServer = constants.SD_CARD_MEDIASERVER_NOK
            }
            else {
                if (result.match("ADrecords")) devADrecords="/home/pi/mediaServer/ADrecords"
                if (result.match("Music")) devMusic="/home/pi/mediaServer/Music"
                if (result.match("Home")) devHome="/home/pi/mediaServer/Home"
                console.log("devADrecords:"+ devADrecords + "  devMusic:" + devMusic + "  devHome:" + devHome)
                SDcardMediaServer = constants.SD_CARD_MEDIASERVER_OK
                readTreeSDCard()
                await generateCoverImg("deleteOld")
            }
        }
        catch(err){
            console.log("checkSD:"+err)
        }
    }
    this.resetUSB = function (res,err){
        procStatus.text="usbmedium unmounted"
        console.log(procStatus.text)
        initStorage()
        allDev = []
        setInitPage(res);//this.doSystem(res)
    },
    this.rebootSystem = function(){
        console.log("reboot system...")
        exec('sudo reboot', (error, stdout, stderr) => {})
    },
    this.shutdownSystem = function(){
        console.log("shutdown system, good-bye...")
        exec('sudo init 0', (error, stdout, stderr) => {})
    },
    this.sendSSE = function(sse){
        /*
        Das Interval wird in routeHandler() gestartet!
        Die periodischen Events werden dann beendet, indem SSE_NONE_CLEAR_INTERVAL in der Prozessumgebung gesetzt wird.
        Hierdurch werden noch die Beendigungs-Informationen ausgegeben um dann SSE_INACTIVE zu setzen.
        Mit SSE_INACTIVE wird das Interval gelöscht. Siehe auch "initiateRecEnd()" oder "initiateYTEnd()" ...
        */
        //Note: write(sseData): sseData mit linefeed "\n" stoppt Ausgabe !
        if (SSEIntervalTyp.match(constants.SSE_INACTIVE)){
            clearInterval(SSEIntervalPtr)
            sseSSEIntervalPtr = false
            console.log("clear SSEIntervalPtr " + SSEIntervalPtr)
            if ("type" in recAD){
                if (/disc/i.test(recAD.medium))
                    sse.end("sseEndDisc "+settings.ip)
                else if (/tape/i.test(recAD.medium))
                    sse.end("sseEndTape "+settings.ip)
                else
                    sse.end(" done!")  // CD or other type
                return
            }
            sse.end(" done!")
            return
        }
        if (SSEIntervalTyp.match(constants.SSE_NONE_CLEAR_INTERVAL)){
            SSEIntervalTyp = constants.SSE_INACTIVE
            console.log("sendSSE progressInfo="+progressInfo)
            sseData += (progressInfo + " - done!")
            sse.write(sseData)
            return
        }
    
        if (SSEIntervalTyp.match(constants.SSE_VIDEO_CONVERSION)){
            sseData += progressInfo
            sse.write(sseData)
            getVideoConversionData()
            return
        }

        //Internet video download progress
        if (SSEIntervalTyp.match(constants.SSE_DL_RUNNING)){
            //warte bis Prozess stabil läuft, sonst error
            setTimeout(getDownloadYT,1500)
            console.log ("Download ***")
            sseData = progressInfo
            sse.write(sseData)
            return
        }
    
        //youTube
        if (SSEIntervalTyp.match(constants.SSE_WAV2MP3)){
            sseData = getLameInfo()
            sse.write(sseData)
            return
        }

        //capture stuff
        if (SSEIntervalTyp.match(constants.SSE_MONITOR_LEVEL)){
            sseData = getMonitorLevel()
            sse.write(sseData)
            return
        }

        //all A/D progress
        if (SSEIntervalTyp.match(constants.SSE_AD_CONVERSION)){
            sseData = getAudioCaptureSize()
            sse.write(sseData)
            return
        }

        if (SSEIntervalTyp.match(constants.SSE_CD_RIPPING)){
            sseData = getCDstatus()
            sse.write(sseData)
            return
        }

        if (SSEIntervalTyp.match(constants.SSE_PROCESS_WAV)){
            // console.log("constants.SSE_PROCESS_WAV")
            if (sseData.match(progressInfo))//do not repeat
                sseData += ". "
            else
                sseData += progressInfo
            sse.write(sseData)
            addEvaluatedTracks()
            recAD.oldCaptureData = "remember"
            return
        }

        if (SSEIntervalTyp.match(constants.SSE_ADJUST_RENAME)){
            if (sseData.match(progressInfo))//do not repeat
                sseData += ". "
            else{
                if (recAD.oldCaptureData.match("remember"))
                    sseData += progressInfo
                else {
                    var y = recAD.oldCaptureData
                    var z = progressInfo.replace(y," ")
                    if (z == " ") z=". "
                    sseData += z
                }
            }
            recAD.oldCaptureData = progressInfo
            sse.write(sseData)
            return
        }

        if (SSEIntervalTyp.match(constants.SSE_PROCESS_WAV)){
            // if ((recAD.evaluatedState === constants.REC_START_ANALYZER) || 
            // (recAD.evaluatedState === constants.REC_WAV_ANALYZER))// || 
            // //(recAD.evaluatedState === constants.REC_WAV_TRACKS))
                addEvaluatedTracks() //!   
            if (sseData.match(progressInfo)){//do not repeat
                    sseData += ". "
            }
            else{
                var y = recAD.oldCaptureData
                var z = progressInfo.replace(y," ")
                if (z == " ") z=". "
                sseData += z
                
            }
            if (recAD.evaluatedState === constants.REC_WAV_TRACKS){
                recAD.oldCaptureData = progressInfo
                audioGetProcessWavState()//!
            }
            sse.write(sseData)
            return
        }

        if (SSEIntervalTyp.match(constants.SSE_ADJUST_RENAME)){
            if (sseData.match(progressInfo)){//do not repeat
                sseData += ". "
            }
            else{
                var y = recAD.oldCaptureData
                var z = progressInfo.replace(y," ")
                if (z == " ") z=". "
                sseData += z
            }
            recAD.oldCaptureData = progressInfo
            sse.write(sseData)
            return
        }
    },
	this.setHomeLink = function(res,url,name){
        if (webLinks.length < constants.LINKS_MAX){
            if(url && name){
                let n = {url:url, name:name}
                webLinks.push(n)
                var data = JSON.stringify(webLinks)
                fs.writeFile('help/linkJSON.txt', data, function (err) {
                    if (err) {
                        console.error("linkJSON.txt, " + err)
                    }else{
                        console.error("wrote linkJSON.txt")
                    }
                })        
            }
        } else procStatus.text = "Max. " + constants.LINKS_MAX + " Links possible"
        res.render('pages/entryLinks', {settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, weblinks:webLinks, webshow:-1})
    },
    this.removeHomeLink = function(res,index){
        //reject array allocation
        let a = []
        var i=0; for (i in webLinks){
            if (i != index){
                a.push(webLinks[i])
            }
        }
        webLinks = a
        var data = JSON.stringify(webLinks)
        fs.writeFile('help/linkJSON.txt', data, function (err) {
            res.render('pages/entryLinks', {settings:settings, btDevice:bluez, 
                recording:getScheduledJobsWithoutTimeout(), pState:procStatus, 
                weblinks:webLinks, webshow:-1})
        })
    },
    this.createUSB = async function (what,res){
        console.log(what) //1 c All       2 m Music
        var w = what.split( " ")
        var mp = ""
        if (w[0] === "1") mp = usbState.usbmedium1MP; else 
        if (w[0] === "2") mp = usbState.usbmedium2MP; else 
        if (w[0] === "3") mp = usbState.usbmedium3MP;
        if (w[1] === "c"){
            createdir(w[2],mp,res)
            return
        }
        else{
            if (w[1] === "m"){
                console.log("mount tbd here")
                return
            }
        }
        getBlockdevice(res,"sys")
    },
    this.checkMediaServerOnSD = async function(res){
        try{
            var stdout = await execCmd("ls /home/pi >&1")
            if (!stdout.match("mediaServer")){
                var cmd = "mkdir /home/pi/mediaServer; mkdir /home/pi/mediaServer/Music;\
                mkdir /home/pi/mediaServer/Music/Audio;mkdir /home/pi/mediaServer/Music/Radio;\
                mkdir /home/pi/mediaServer/Music/Video;mkdir /home/pi/mediaServer/ADrecords;\
                mkdir /home/pi/mediaServer/Home;mkdir /home/pi/mediaServer/Home/Pictures"
                await execCmd(cmd)
            }
            getSDcardSpace()
            if (res) setInitPage(res)
        }
        catch(err){
            console.log(err)
            if (res) setInitPage(res)
        }
    },
    // this.formatmount = function(dev,dir,mountpoint,res) {
    //     console.log("formatmount " + dev + " " + dir + " " + mountpoint + " ... wait 20s for 1000G !")
    //     exec("sudo mkfs.vfat " + dev, (error, stdout, stderr) => {
    //         if (error || stderr) {
    //             console.log(error)
    //         }
    //         console.log("format fat32 done")
    //         getBlockdevice(res,"sys")
    //     })
    // },
    this.createdir = function(dir,mountpoint,res) {
        console.log("createdir " + dir + " " + mountpoint)
        var p=mountpoint.search("/mediaServer")
        if ( p>=0 ){
            mountpoint = mountpoint.substr(0,p)
        }
        switch (dir){
            case "All":
            var cmd ="mkdir " + mountpoint + "/mediaServer; \
            mkdir " + mountpoint + "/mediaServer/Home; \
            mkdir " + mountpoint + "/mediaServer/Home/Pictures; \
            mkdir " + mountpoint + "/mediaServer/Home/Videos; \
            mkdir " + mountpoint + "/mediaServer/Music; \
            mkdir " + mountpoint + "/mediaServer/Music/Radio; \
            mkdir " + mountpoint + "/mediaServer/Music/Audio; \
            mkdir " + mountpoint + "/mediaServer/Music/Video; \
            mkdir " + mountpoint + "/mediaServer/ADrecords"
            break;

            case "Music":
            var cmd ="mkdir " + mountpoint + "/mediaServer; \
            mkdir " + mountpoint + "/mediaServer/Music; \
            mkdir " + mountpoint + "/mediaServer/Music/Radio; \
            mkdir " + mountpoint + "/mediaServer/Music/Audio; \
            mkdir " + mountpoint + "/mediaServer/Music/Video;" 
            break;

            case "Home":
            var cmd ="mkdir " + mountpoint + "/mediaServer; \
            mkdir " + mountpoint + "/mediaServer/Home; \
            mkdir " + mountpoint + "/mediaServer/Home/Pictures; \
            mkdir " + mountpoint + "/mediaServer/Home/Videos;" 
            break;

            case "ADrecords":
            var cmd ="mkdir " + mountpoint + "/mediaServer; \
            mkdir " + mountpoint + "/mediaServer/ADrecords"
            break;
        }
        exec(cmd, (error, stdout, stderr) => {
            if (error || stderr) {
                console.log(error)
            }
            getBlockdevice(res,"sys")
        })
    },
    this.setSoundDevice = async function(req){
        if (settings.mediaOut == req.body.mediaSet) 
            return
        settings.mediaOut = req.body.mediaSet
        await writeSettings()
        if (req.body.mediaSet.match("HTTP"))
        {
            //Web Equalizer required
            return
        }
        await stopMusicPlay(constants.AUDIO_ALL)
        await pipewireAudioInit()
        await getAudioOut()
        await setCardVolume(settings.jackVolume)
    },
    this.setCardVolume = async function(volume){
        if (!settings.mediaOut) 
            return
        if (settings.mediaOut.match("HTTP") && (rememberDB !== "cd")) //cd over http not possible yet
            return

        console.log("received volume " + volume)
        try{
            var mixC = "Headphone Playback Volume"
            var index = parseInt(settings.mediaOut);
            var channel = audioInfo[index].split(" ");
            var cmd = "amixer -c " + Number(channel[1]) + " controls >&1"
            var m = await execCmd(cmd)
            mixerControls = m.split("\n"); mixerControls.pop()
            var i=0; for (i in mixerControls){
                if (mixerControls[i].search("Playback Volume") >= 0){
                    var a = mixerControls[i].indexOf("name=");
                    if (a > 0){
                        mixC = mixerControls[i].slice(a+5,mixerControls[i].length)
                        mixC = mixC.replace(/'/g,'')
                        if (mixC.search("Analogue") < 0) break;
                    }
                }
            }
            cmd = "amixer -c " + channel[1] + " sset " + mixC + " " + volume + "% " +  volume + "%, unmute";
            console.log(cmd)
            await execCmd(cmd)


           value = (volume-80)/0.15
           value = Math.round(value) 

            settings.jackVolume = volumeAudioOut = value;

            //nach einem Reboot die zuletzt eingestelle Lautstärke wieder setzen, deswegen hier speichern
            await writeSettings()
            //pipewire bluetooth audio volume
            if (volume == constants.VOL_RPI_HEADPHONE_MIN) 
                volume = 0
            cmd = "pamixer --set-volume " + volume
            console.log(cmd)
            await execCmd(cmd) 
        }catch(err){
            console.log(err)
            //procStatus.text = err
        }
    },
    this.wifiConfigUser = async function(res,ssid,pass){
        try {
            var result =""
            if (ssid) {
                settings.ssid = ssid
                settings.pass = pass
                await writeSettings()
            }
            //wenn Benutzer nichts eingegeben hat
            if (!ssid || !pass){
                var wifi = await execCmd("nmcli con show | grep wlan0 >&1")
                if (wifi){
                    doSystem(res)
                    return
                }
                if (settings.ssid && settings.pass){
                    ssid = settings.ssid
                    pass = settings.pass
                } 
                else {
                    procStatus.text = "SSID ? Pass ?"
                    doSystem(res)
                    return
                }
            }
            console.log("SSID="+ ssid)

            result = await execCmd("ls /etc/NetworkManager/system-connections/ | grep Tonbox.nmconnection >&1")
            if (result){
                cmd = "sudo nmcli con modify Tonbox ifname wlan0 type wifi ssid '"+ssid+"' ipv4.addresses " + settings.ip + "/24 ipv4.method manual"
            }
            else
                cmd = "sudo nmcli con add con-name Tonbox ifname wlan0 type wifi ssid '"+ssid+"' ipv4.addresses " + settings.ip + "/24 ipv4.method manual"
            console.log(cmd)                    
            await execCmd(cmd)
            await editConTonbox()
            cmd = "sudo nmcli con reload"
            console.log(cmd)                    
            await execCmd(cmd)
            //wichtig für Radio-Streams  "mpv https://playerservice..."
            cmd = "sudo nmcli con modify Tonbox ipv4.dns "+ settings.gateway// + " ipv4.gateway "+settings.gateway
            console.log(cmd)                    
            await execCmd(cmd)

            cmd = "sudo nmcli con modify Tonbox wifi-sec.key-mgmt wpa-psk; \
                   sudo nmcli con modify Tonbox wifi-sec.psk " + pass
            console.log(cmd)                    
            await execCmd(cmd)

            await execCmd("sudo nmcli connection modify 'Tonbox' connection.autoconnect-priority 0 >&1")
            await execCmd("sudo nmcli connection modify 'Wired connection 1' connection.autoconnect-priority 10 >&1")
            await execCmd("sudo nmcli connection modify 'Tonbox' ipv4.method manual >&1")

            cmd = "sudo nmcli con up Tonbox"
            console.log(cmd)                    
            await execCmd(cmd)

            console.log("WLAN connection done")
            await getIP()
            procStatus.text = ssid + " WiFi wlan0 ok!"

            settings.ssid = ssid
            settings.pass = pass
            await writeSettings()
            doSystem(res)
        }
        catch(err){
            console.log(err)  
            procStatus.txt = "wifiConfigUser: " + err
            setInitPage(res)
        }           
    },
    this.doLAN = async function(reboot){
        console.log("doLAN...")
        // // #get rid of RadioBrowser ECONNREFUSED over wlan0 issue (force ip4)
        // let correctIP = false
        // if (settings.ip){
        //     let currentIP = await execCmd("nmcli -g ipv4.addresses connection show Tonbox 2>/dev/null | tr -d '\r' >&1")
        //     if (currentIP) {
        //         currentIP = currentIP.split("\n")[0]
        //         if (currentIP && currentIP.split("/")[0] === settings.ip) {
        //             correctIP = true
        //         }
        //     }
        // }
        // if (!correctIP){
        //     await execCmd("sudo nmcli connection modify Tonbox ipv4.dns '8.8.8.8 1.1.1.1'")
        //     await execCmd("sudo nmcli connection modify Tonbox ipv4.ignore-auto-dns yes")
        //     await execCmd("sudo nmcli connection down Tonbox")
        //     await execCmd("sudo nmcli connection up Tonbox")
        // }

        // Prüfen, ob wlan0 als Hardware-Device überhaupt vorhanden ist
        let wlanDevice = await execCmd("nmcli -t -f DEVICE,TYPE device status | grep ':wifi' >&1")
        let wlanAvailable = !!wlanDevice

        // Prüfen, ob das Tonbox-Profil existiert (unabhängig davon ob aktiv)
        let tonboxExists = await execCmd("nmcli -t -f NAME connection show | grep -x 'Tonbox' >&1")

        if (wlanAvailable && tonboxExists) {
            // #get rid of RadioBrowser ECONNREFUSED over wlan0 issue (force ip4)
            let correctIP = false
            if (settings.ip){
                let currentIP = await execCmd("nmcli -g ipv4.addresses connection show Tonbox 2>/dev/null | tr -d '\r' >&1")
                if (currentIP) {
                    currentIP = currentIP.split("\n")[0]
                    if (currentIP && currentIP.split("/")[0] === settings.ip) {
                        correctIP = true
                    }
                }
            }
            if (!correctIP){
                await execCmd("sudo nmcli connection modify Tonbox ipv4.dns '8.8.8.8 1.1.1.1'")
                await execCmd("sudo nmcli connection modify Tonbox ipv4.ignore-auto-dns yes")
                // down darf fehlschlagen (z.B. wenn WLAN nicht aktiv/erreichbar ist) - kein Showstopper
                await execCmd("sudo nmcli connection down Tonbox 2>/dev/null || true")
                await execCmd("sudo nmcli connection up Tonbox 2>/dev/null || true")            }
        } else {
            await logging("WLAN (Tonbox) nicht verfügbar - überspringe WLAN-Konfiguration, nutze nur Ethernet")
            console.log("WLAN nicht verfügbar, Ethernet-only Modus")
        }

        var rebootRequired = false
        try{
            var cmd = ""
            if (!settings.ip)
                settings.ip = constants.IP_DEFAULT
            await logging("----------------------------------------------");
            await getIP()
//Test
//var ip = settings.ip
//settings.ip = "192.168.2.140"
            if (ipList[1]){   //eth0
                await logging("etho detektiert")
                if (!ipList[1].match(settings.ip)){
                    procStatus.text = "eth0 ip change: "+settings.ip + " required"
                    await logging(procStatus.text)
                    console.log(procStatus.text)
                    if (settings.gateway){
                        await logging("gateway="+settings.gateway)
                        cmd = "sudo nmcli conn modify 'Wired connection 1' ipv4.addresses " + settings.ip +"/24 \
                        ipv4.gateway "+settings.gateway+" ipv4.dns "+settings.gateway+" ipv4.method manual; sudo nmcli con reload"
                    }else{
                        await logging("no gateway detected")
                        console.log("no gateway detected")
                    }
                    cmd = "sudo nmcli conn modify 'Wired connection 1' ipv4.addresses " + settings.ip +"/24"
                    console.log(cmd)
                    await execCmd(cmd)
                    await execCmd("sudo nmcli con 'Wired connection 1' reload;sudo nmcli con up 'Wired connection 1'")
                    await logging("etho with gateway="+settings.gateway+", ip="+settings.ip+" configured")
                    rebootRequired = true
                }
            }
//Test
            // pi@Tonbox:~ $ nmcli con show
            // NAME                UUID                                  TYPE      DEVICE 
            // Tonbox              62f3c5d1-cbc3-4107-a71e-d5dc73dd5d75  wifi      wlan0  
            // lo                  fd48a589-3657-4970-9577-e6c86a2567f7  loopback  lo     
            // Wired connection 1  ec78fb62-20ca-3f4e-980b-3e90743f2128  ethernet  --     
//Test
//wifi=""
//settings.ip = ip
            var wifi = await execCmd("nmcli con show | grep wlan0 >&1")
            if (wifi){
                await logging("wifi detected")
                if (!ipList[2].match(settings.ip)) {
                    procStatus.text = "wlan0 ip change: "+settings.ip + " required"
                    await logging(procStatus.text)
                    console.log(procStatus.text)
                    //nicht die richtige IP - benutze SSID und Pass aus ".settings.conf"
                    //modifiziere Tonbox.nmcommunicate Datei
                    await wifiConfigInit()
                    rebootRequired = true
                }
                else { //should be ok
//                     ip_config = true
                     await logging("wifiConfigInit:should be ok")
                     ping_required = false
                }
            }
            else {
                //wifi ist nicht aktiv
                await logging("wifi not found")
                await wifiConfigInit()
            } 
//            ip_config = true

            var result = await execCmd("route >&1")
            if (!result.match("default")){
                if (settings.gateway)
                    await execCmd("sudo route add default gw " + settings.gateway)
                else
                    await execCmd("sudo route add default gw 192.168.2.1")
            }
            //--------------
            await logging("wifiConfigInit:show Tonbox.nmconnection")
            result = await execCmd("sudo cat /etc/NetworkManager/system-connections/Tonbox.nmconnection >&1")
            await logging(result)
            //--------------
            if (reboot){
                if (rebootRequired){
                    console.log("IP changed, system reboots now !")
                    await execCmd("sudo reboot")
                }
            }
//            ip_config = true
        }
        catch (err){
            procStatus.text = "doLAN :" + err
            await logging("doLAN err: "+err)
        }
    },
    this.logging = async function(info){
        try{
            return
            console.log("Logger: " + info)
            await execCmd("date '+%m-%d-%y  %T' >> help/debug.log")
            await execCmd("echo " + info + " >> help/debug.log")
        }
        catch(err){
            logging(err)
        }
    },

    this.cleanSystem = function(){
        exec("bleachbit --clean system.cache; rm -rf .Trash-1000/; sudo journalctl --vacuum-time=1s", (error, stdout, stderr) => {})
    },
    this.availableSpace = function (dev,bytes){
        var free = ""
        if (dev.match("Music"))
            free = storage.Music.free
        else if (dev.match("Home"))
            free = storage.Home.free
        else if (dev.match("ADrecords"))
            free = storage.ADrecords.free
        if (free.match("M")) {
            free = free.replace("M","")
            free = parseInt(free,10) * 1048576
        }
        else if (free.match("G")){
            free = free.replace("G","")
            free = parseInt(free,10) * 1073741824
        }
        if (free >= bytes) 
            return true
        return false
    },
    this.wifiConfigInit = async function(){
    	console.log("wifiConfigInit")
        //wifi Kommunikations-Config File "Tonbox.nccommunicate" löschen und neu aufsetzen
        try{
            if (!(settings.ssid && settings.pass && settings.ip)){
                await logging("missing ip, ssid, pass ...")
                procStatus.text +=" + WLAN inactive, you may configure it"
                return
            }
            console.log("wifiConfigInit: ip =" + settings.ip + " SSID="+settings.ssid +" Pass="+settings.pass)
            await logging("wifiConfigInit: ip =" + settings.ip + " SSID="+settings.ssid +" Pass="+settings.pass)
            var result = await execCmd("ls /etc/NetworkManager/system-connections/ >&1")
            var connections = []
            if (result && !result.match("err")) {
                connections = result.split("\n").map(s=>s.trim()).filter(s=>s.length>0)
            }
            //only 1 wifi connection allowed: Tonbox.nmconnection
            var tonboxCon = false
            for (let i=0;i<connections.length;i++){
                const fn = connections[i]
                if (fn.match(/^Tonbox(\.nmconnection)?$/) || fn.match(/^Tonbox\-/)) {
                    // mark that a Tonbox related file exists
                    tonboxCon = true
                    if (fn.match(/^Tonbox\-/)){
                        // remove legacy files Tonbox-*
                        await execCmd("sudo rm -f /etc/NetworkManager/system-connections/"+fn+" >&1")
                    }
                }
            }
            //Wegen meherer ip adressen in Tonbox.nmconnection muss connection zuvor gelöscht werden
            if (tonboxCon) {
                result = await execCmd("nmcli con show | grep '^Tonbox' >&1")
                if (result && !result.match("err")){
                    // ensure connection down and deleted
                    await execCmd("sudo nmcli con down Tonbox >&1 || true")
                    await execCmd("sudo nmcli con delete Tonbox >&1 || true")
                }
            }

            // Build the add command using correct nmcli keys and quoting
            // use 'ipv4.addresses' for static ip and quote SSID to allow spaces
            let cmd = "sudo nmcli con add con-name Tonbox ifname wlan0 type wifi ssid '"+settings.ssid.replace(/'/g,"'\\''")+"' ipv4.addresses "+settings.ip+"/24"
            if (settings.gateway) cmd += " ipv4.gateway "+settings.gateway
            cmd += " ipv4.method manual"
            await logging("wifiConfigInit:"+cmd)
            await execCmd(cmd+" >&1")

            // set PSK and key management (quote PSK)
            await execCmd("sudo nmcli con modify Tonbox wifi-sec.key-mgmt wpa-psk >&1")
            await execCmd("sudo nmcli con modify Tonbox wifi-sec.psk '"+settings.pass.replace(/'/g,"'\\''")+"' >&1")

            // set autoconnect priority and keep Tonbox on manual/static IP mode
            await execCmd("sudo nmcli connection modify 'Tonbox' connection.autoconnect-priority 0 >&1")
            await execCmd("sudo nmcli connection modify 'Wired connection 1' connection.autoconnect-priority 10 >&1")
            await execCmd("sudo nmcli connection modify 'Tonbox' ipv4.method manual >&1")

            // bring connection up
            await execCmd("sudo nmcli con up Tonbox >&1")
            ping_required = true
        }
        catch(err){
            console.log("wifiConfigInit: " + err)
            ip_config = true //try
            await logging("wifiConfigInit: err="+err)
        }
    },
    this.editConTonbox = function(){
        return new Promise((resolve, reject) => {
            exec("sudo cat /etc/NetworkManager/system-connections/Tonbox.nmconnection", (error, stdout, stderr) => {
                if (error){
                    reject()
                }
                else{
                    if(stdout){
                        var con = stdout.split("\n")
                        for (i in con){
                            if (con[i].match("address1")){
                                con[i] = con [i] + ";"+settings.gateway
                                break
                            }
                        }
                        var data = ""
                        for (i in con){
                            data += con[i]+"\n"
                        }
                        exec("rm -rf Tonbox.nmconnection", (error, stdout, stderr) => {})
                        fs.writeFile('Tonbox.nmconnection', data, function (err) {
                            if(err) {
                                console.log(err)
                                reject(err)
                            }
                            else{
                                exec("sudo cp -rf Tonbox.nmconnection /etc/NetworkManager/system-connections/.;rm Tonbox.nmconnection", (error, stdout, stderr) => {
                                    if (err) reject(err)
                                    else resolve()
                                })                                    
                            }
                        })
                    }else
                        reject("no ?.nmcommunication")
                }
            })
        })
    },
    this.doSettings = async function (res, set){
        try{
            if(set.match("apikey"))
            {
                res.render('pages/apiKeySet',{pageInfo:pageInfo,resultTV:resultTV,sysdir:settings.installDir, btDevice:bluez,recording:getScheduledJobsWithoutTimeout(), pState:procStatus, settings:settings, gateway:gateway, vol:settings.jackVolume, settings:settings});
            }else{
                //await getIP()
                res.render('pages/systemSettings',{pageInfo:pageInfo,sysdir:settings.installDir, btDevice:bluez,recording:getScheduledJobsWithoutTimeout(), pState:procStatus, settings:settings, gateway:gateway, vol:settings.jackVolume, settings:settings});
            }
        }
        catch (err){
            res.render('pages/systemSettings',{pageInfo:pageInfo,resultTV:resultTV,sysdir:settings.installDir, btDevice:bluez,recording:getScheduledJobsWithoutTimeout(), pState:procStatus, settings:settings, gateway:gateway, vol:settings.jackVolume, settings:settings});
        }
    }
    this.configSettings = async function (res,set){
        try{
            procStatus.text = ""
            console.log(set)
            if(set.ip){
                var num = parseInt(set.ip,10)
                if(num){
                    if ((num >=10) && (num <= 254))
                        if (!ipList[1].match("192.168.2." + set.ip) || (!ipList[2].match("192.168.2." + set.ip))){
                            settings.ip = "192.168.2." + set.ip
                            await writeSettings()
                            if (settings.ssid && settings.pass){
                                // doLAN(true)   
                                // doSystem(res)
                                // return 
                            }else
                                procStatus.text = "SSID und Passwort fehlt"
                        }
                }
            }
            if(set.gateway){
                procStatus.text = "no valid gateway IP"
                var data = set.gateway.split(".")
                if (data.length > 1){
                    var a = parseInt(data[0],10)
                    var b = parseInt(data[1],10)
                    if (a && b){
                        if ((a > 0) && (a <= 254) && (b > 0) && (b <= 254)){
                            settings.gateway = "192.168."+data[0]+"."+data[1]
                        }
                    }
                }
            }
            await writeSettings()

            // if (set.mailhub && set.mailUser && set.mailPass){
            //     ssmtp = set.mailhub
            //     await execCmd('sudo cp -rf /etc/ssmtp/ssmtp.conf /etc/ssmtp/ssmtp.conf.backup')
            //     var dat = 'root=postmaster\nmailhub='+set.mailhub+'\nAuthUser='+set.mailUser+'\nAuthPass='+set.mailPass+'\nUseSTARTTLS=YES\nhostname=tonbox\nFromLineOverride=YES\n'
            //     await fs.writeFileSync('ssmtp.conf', dat)
            //     await execCmd("sudo cp -rf ssmtp.conf /etc/ssmtp/.")
            //     await execCmd("rm ssmtp.conf")
            //     procStatus.text += " - MTA konfiguriert -"
            // }
            // doSystem(res)
            //console.log(".settings.conf:\n"+settings)
            doSystem(res)
        }
        catch(err){
            procStatus.text += " configSettings: " + err
            doSystem(res)
        }
    },
    //DUMMY: Audio/Video library upload disabled in this BASIS build - call
    //received, no file is moved.
    this.uploadMedia = function(res,files,typ){
        if (typ == "Audio")
            showMusicDir("Audio", res)
        else
            showMusicDir("Video", res)
    },
    this.checkMedia = function (f,t){
        switch(t){
            case "Audio":
                if (f.match(".mp3") || f.match(".MP3") || f.match(".wav") || f.match(".WAV") || 
                    f.match(".ogg") || f.match(".OGG"))
                    return true
                return false
            case "Video":
                if (f.match(".mp4") || f.match(".MP4") || f.match(".flv") || f.match(".FLV") || 
                    f.match(".mpeg") || f.match(".mpeg") || f.match(".avi") || f.match(".AVI") || 
                    f.match(".mov") || f.match(".MOV") || f.match(".webp") || f.match(".WEBP") )
                    return true
                return false
            case "Home":
                if (f.match(".jpg") || f.match(".JPG") || f.match(".bmp") || f.match(".BMP") || 
                    f.match(".png") || f.match(".PNG") || f.match(".jpeg") || f.match(".JPEG") || 
                    f.match(".mp4") || f.match(".MP4") || f.match(".flv") || f.match(".FLV") || 
                    f.match(".mpeg") || f.match(".mpeg") || f.match(".avi") || f.match(".AVI") || f.match(".mov") || f.match(".MOV"))
                    return true
                return false
            default:
                console.log ("checkMedia: type mismatch")
                break;
        }
    },
    this.configureTonbox = async function (f,t){
        //Wenn SD-Karte mit neuem RPI (andere MAC-Adresse) bootet wird eine IP zugewiesen vom System!
        //Diese entspricht nicht unbedingt der settings.ip
        try{
            fs.readFile('help/radioUserSearch.json', function (err, data) {
                if (err) {
                    console.log("radioUserSearch.json not found")
                } else {
                    radioUserSearch = JSON.parse(data)
                }
            });
            await execCmd("rm -rf help/Radio")
            global.rpio = await loadRpio()
            console.log('rpio geladen:', !!rpio);
         
            /* Diese Pins sind beim DAC Pro normalerweise frei nutzbar:
            ✅ GPIO 17 (Pin 11)
            ✅ GPIO 27 (PIN 13)
            ✅ GPIO 22 (PIN 15)
            ✅ GPIO 23 (PIN 16)
            ✅ GPIO 24 (PIN 18)
            ✅ GPIO 25 (PIN 22)*/
            rpio.init({ mapping: 'gpio' });   // <-- das aktiviert GPIO‑Nummern
            rpio.open(constants.LED17_GREEN, rpio.OUTPUT, rpio.LOW); //not valid when using gpio mapping ??
            rpio.open(constants.LED27_GREEN, rpio.OUTPUT, rpio.LOW);
            rpio.open(constants.LED22_ORANGE, rpio.OUTPUT, rpio.LOW);
            rpio.open(constants.LED23_ORANGE, rpio.OUTPUT, rpio.LOW);
            rpio.open(constants.LED24_ORANGE, rpio.OUTPUT, rpio.LOW);
            rpio.open(constants.LED25_ORANGE, rpio.OUTPUT, rpio.LOW);

            await clearDiscogsResult()
            await getDiscogsHistory()
            //await getHomeLink()
            await setAudioEnvironment()
            await getBlockdevice("", "init")
            await storageEvaluation()
            await getAudioOut()
            // await getBlockdevice("", "init")
            await checkCDdrive("")
            await setYouTubeObj()
            await monitorSystem()
            await checkTV("")
            ledOrange("On")
            ledGreen("On")
        }
        catch(err){
            procStatus.text = "configureTonbox: " + err
            console.log(procStatus.text)
        }
    },
    this.reInitNodeModules = async function(){
        console.log('rpio fehlt → wird installiert...');
        try {
            console.log('Füge User zur gpio Gruppe hinzu...');
            await execCmd('sudo usermod -aG gpio pi');
            console.log('Entferne node-libgpiod, client, request, node-fetch, disogsclient');
            await execCmd('npm remove node-libgpiod');
            //get rid of old 'punycode' warnings
            await execCmd('npm remove client');     
            await execCmd('npm remove request');
            await execCmd('npm remove node-fetch');
            await execCmd('npm remove discogs-client');
            console.log('install rpio');
            await execCmd('npm install rpio');
            console.log('rebuild binary rpio');
            await execCmd("npm rebuild rpio")
            await execCmd('rm package-lock.json');
            await execCmd('sudo rm -rf node_modules');
            await execCmd('npm install');
            console.log('Installation abgeschlossen');
        }catch(err){
            procStatus.text="reInitNodeModules "+err
            console.log(procStatus.text)
        }
    }
    this.checkRpioBinary = async function(){
        let result = await execCmd("file node_modules/rpio/build/Release/rpio.node >&1")
        if (result.includes("cannot open")) 
            return false
        result = await execCmd("ldd node_modules/rpio/build/Release/rpio.node >&1")
        if (!result) 
            return false
        return true
    },
    this.loadRpio = async function(){
        try {
            // Versuch zu laden
            if (!await checkRpioBinary()){
                let result = await execCmd("npm list rpio >&1")
                if (result.match("empty")){
                    await reInitNodeModules()                }
            }
            return require('rpio');
        } catch (err) {
            if (err.code === 'MODULE_NOT_FOUND') {
                try{
                    await reInitNodeModules()
                    return require('rpio'); // zweiter Versuch
                } catch (installErr) {
                    console.error('Installation fehlgeschlagen:', installErr.message);
                    process.exit(1);
                }
            } else {
                throw err; // anderer Fehler
            }
        }
    },
    this.validateAPI = async function (ytKey,discToken,res){
        let yt="nok", disc="nok"
        if (ytKey.length > 30){
            if (await checkYoutubeKey(ytKey)) {
                yt="ok!"
                settings.youtubeKey = ytKey
                setYouTubeObj()
            }
        }
        if (discToken.length > 30){
            if (await checkDiscogsToken(discToken)) {
                disc="ok!"
                settings.discogsUserToken = discToken
            }
        }
        if (yt=="ok!" || disc=="ok!") {
          await writeSettings()
        }
        res.json({ youtubeKey: yt, discogsUserToken: disc });
    },
    //DUMMY: myUSB browsing disabled in this BASIS build. This only checks
    //(read-only, shallow) whether the USB medium has any audio files at all,
    //so the "myUSB" nav item still shows up correctly - it no longer builds
    //the real track list, so the myUSB page itself always renders empty.
    this.scanDirectory = async function(rootDir){
        const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac"]);
        myUSB = [];
        try {
            const entries = await fsPromises.readdir(rootDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isFile() && AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) {
                    return true;
                }
            }
        } catch (err) {}
        return false;
    },
    this.writeSettings = async function(){
        var data = JSON.stringify(settings)
        await fsPromises.writeFile('.settings.conf', data)
        //console.log(data)
    },
    this.loadSettings = async function(){
        try {
            var data = await fsPromises.readFile('.settings.conf', 'utf8')
            Object.assign(settings, JSON.parse(data))
        }
        catch (err) {
            if (err.code !== 'ENOENT') console.log(err)
        }
    },
    this.checkTV = async function(res){
        /*********** DLNA **************/
        console.log("TV check..")
        try{
            const rawTV = await detectTV()

            const tvList = Array.isArray(rawTV)
                ? rawTV.filter((tv) => {
                    const name = tv && tv.name ? String(tv.name).toUpperCase() : ''
                    const manufacturer = tv && tv.manufacturer ? String(tv.manufacturer).toUpperCase() : ''
                    const model = tv && tv.model ? String(tv.model).toUpperCase() : ''
                    if (name.includes('TONBOX')) return false
                    if (manufacturer.includes('JUSTIN MAGGARD')) return false
                    if (model.includes('MINIDLNA')) return false
                    return true
                })
                : []
            resultTVPlayable = tvList
            resultTV = tvList.map((tv) => {
                const capabilities = tv && tv.capabilities && typeof tv.capabilities === 'object'
                    ? tv.capabilities
                    : {}
                const avTransport = tv && tv.protocols && tv.protocols.avTransport && typeof tv.protocols.avTransport === 'object'
                    ? tv.protocols.avTransport
                    : {}

                const connectionManager =
                    tv && tv.protocols &&
                    tv.protocols.connectionManager &&
                    typeof tv.protocols.connectionManager === 'object'
                        ? tv.protocols.connectionManager
                        : {}

                const allowedAvTransportActions = new Set([
                    'SetAVTransportURI',
                    'Play',
                    'Stop',
                    'Pause',
                    'Seek'
                ])

                const avTransportActions = Array.isArray(avTransport.actions)
                    ? [...new Set(avTransport.actions.filter((action) =>
                        allowedAvTransportActions.has(action)
                    ))]
                    : []
                const avTransportActionSet = new Set(avTransportActions)

                return {
                    ip: tv && tv.ip ? tv.ip : '',
                    name: tv && tv.name ? tv.name : '',
                    manufacturer: tv && tv.manufacturer ? tv.manufacturer : '',
                    model: tv && tv.model ? tv.model : '',
                    recommended: tv && tv.recommended ? tv.recommended : '',
                    capabilities: {
                        dlnaRenderer: !!capabilities.dlnaRenderer,
                        dlnaServer: !!capabilities.dlnaServer,
                        avTransport: avTransportActions.length > 0,
                        setAVTransportURI: avTransportActionSet.has('SetAVTransportURI'),
                        setNextAVTransportURI: avTransportActionSet.has('SetNextAVTransportURI'),
                        play: avTransportActionSet.has('Play'),
                        stop: avTransportActionSet.has('Stop'),
                        pause: avTransportActionSet.has('Pause'),
                        seek: avTransportActionSet.has('Seek'),
                        next: avTransportActionSet.has('Next'),
                        previous: avTransportActionSet.has('Previous'),
                        webUriPlayable: !!capabilities.webUriPlayable,
                        dial: !!capabilities.dial,
                        samsungRemoteControl: !!capabilities.samsungRemoteControl,
                        samsungMainTVAgent: !!capabilities.samsungMainTVAgent,
                        chromecast: !!capabilities.chromecast,
                        airplay: !!capabilities.airplay
                    },
                    protocols: {
                        avTransport: {
                            serviceType: avTransport.serviceType || '',
                            controlURL: avTransport.controlURL || '',
                            eventSubURL: avTransport.eventSubURL || '',
                            SCPDURL: avTransport.SCPDURL || '',
                            actions: avTransportActions
                        },
                        connectionManager: {
                            serviceType: connectionManager.serviceType || '',
                            controlURL: connectionManager.controlURL || '',
                            eventSubURL: connectionManager.eventSubURL || '',
                            SCPDURL: connectionManager.SCPDURL || '',
                            actions: Array.isArray(connectionManager.actions)
                                ? connectionManager.actions
                                : [],
                            protocolInfo: connectionManager.protocolInfo || {
                                source: '',
                                sink: []
                            }
                        }
                    }
                }
            })

            // await fsPromises.writeFile('resultTV.json', JSON.stringify(resultTV, null, 2))

        }catch(err){
            console.log(err)
            resultTV = []
            resultTVPlayable = []
        }

        console.log("========== resultTV ==========");
        // console.dir(resultTV, { depth: null });
        // console.log("==============================");

        if (res) doSystem(res)
    }
}

