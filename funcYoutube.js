/*
yt-dlp
------

WARNUNG: „No supported JavaScript runtime“
WARNING: No supported JavaScript runtime could be found
👉 Das ist kein direkter Fehler, aber:
yt-dlp kann YouTube nicht mehr vollständig analysieren
einige Videos/Formate funktionieren nicht mehr
künftig wird es komplett brechen


So funktioniert es noch::
yt-dlp --js-runtimes node -o "/home/pi/mediaServer/Music/Video/%(title)s.%(ext)s" https://www.youtube.com/watch?v=xYFOw_PSmGM
*/



//in order to update progress at frontend (download progress) see here:
//https://www.woolha.com/tutorials/node-js-sse-server-sent-events-example-javascript-client
//const SSE = require('./funcSSE');
require('./funcsystem')();

global.ytTitle=[]
global.ytUrl=[] 
global.ytVideoId=[]
global.ytFound = 0
global.searchYouTube = ''
let youTubeObj = ""
var oldProgress =""
const fsPromises = require('fs/promises');
const fs = require ('fs');;
const { exec } = require('child_process');
const YouTube = require('youtube-node');

//var emailAddr = ""
var ytMP4 = 1 //switch what to do if MP3 or MP4 ends for initiateYTEnd()


async function readYTvideo(index,em,save){
  try{
    stdout = await execCmd('ls *.mp3 >&1')
    if (stdout){
      var d=stdout.split("\n")
      d.pop()
      var mp3Name = await escapeFilename(d[0])
      var newName = await cleanFilenameNoPromise("",mp3Name)
      if (save.match("Yes")){
        cmd = "cp -rf " + mp3Name + " " + devMusic + "/Audio/" + newName
        console.log(cmd)
        await execCmd(cmd)
      }   
      // if (em){
      //   await validateEmail(em)
      //   var cmd = 'echo "This mail, has been sent from Raspberry MAX MEDIA Server. Enjoy the mp3 !" | mail -s ' + newName + ' ' + em + ' -A ' + devMusic+"/Audio/"+newName + ' ' + em 
      //   await sendEmailMp3(em,cmd)
      //   procStatus.txt = cmd
      //   console.log(procStatus.txt);
      // }
      // await execCmd("rm -f *.mp3")
      // if (em)
      //   initiateYTEnd("email to "+em+" sent","Audio")
      // else 
        initiateYTEnd("","Audio")
    }else{
      initiateYTEnd(" ********* no MP3-File found","Audio")
    }
  }catch(err) {
    procStatus.txt = err
    initiateYTEnd(" done! " + err,"Audio")
  }
}


module.exports = function(required){
  this.setYouTubeObj = function(){
    youTubeObj = new YouTube();
    youTubeObj.setKey(settings.youtubeKey);
  },
  this.checkYoutubeKey = async function (k) {
    try {
      const yTube = new YouTube();
      yTube.setKey(k);
      const response = await new Promise((resolve, reject) => {
        yTube.search("Johnny Winter", 2, { type: 'video' }, function(err, result){
          if (err) reject(err); else resolve(result);
        });
      });
      console.log("Auth funktioniert ✅");
      console.log("Kanalname:", response.items[0].snippet.title);
      return true
    } catch (error) {
      console.error("Auth fehlgeschlagen ❌");
      console.error(error.message || error);
      return false
    }
  },
  this.escapeFilename = function(name){
    return new Promise((resolve, reject) => {
      name = name.replace(/ /g,String.fromCharCode(92,32)) //"\ "
      name = name.replace(/'/g,String.fromCharCode(92,39)) //"\'"
      name = name.replace(/\(/g,String.fromCharCode(92,40)) //"\("
      name = name.replace(/\)/g,String.fromCharCode(92,41)) //"\)"
      resolve(name)
    })
  },
  this.cleanFilename = function(name,data){
    return new Promise((resolve, reject) => {
      var txt =""
      if (name){
         txt=data.replace(name,"");
      }else txt=data
      
      txt=txt.replace(/[^a-zA-Z0-9\.\-]/g, "")
      resolve(txt)
      
      // //remove spaces
      // txt=txt.replace(/ /g,"")

      // //remove (..) and what is in between
      // s=txt.indexOf("("); e=txt.indexOf(")");
      // if (s>=0 && e > s) {let=txt.slice(s,e+1); txt=txt.replace(let,"")}

      // //remove [..] and what is in between
      // s=txt.indexOf("["); e=txt.indexOf("]");
      // if (s>=0 && e > s) {let=txt.slice(s,e+1); txt=txt.replace(let,"")}

      // //remove all after first occurence of "/"
      // s=txt.indexOf("/"); e=txt.length-4; 
      // if (s>=0 && e>s) {let=txt.slice(s,e); txt=txt.replace(let,"")}

      // //convert text from one character encoding to another
      // exec('echo ' + '"' + txt + '"' + " > fn.txt;", (error, stdout, stderr) => {
      //   if (error)
      //     reject(error)
      //   else
      //   exec("iconv -f utf-8 -t ascii//translit fn.txt >&1", (error, stdout, stderr) => {
      //     if (error) {
      //       console.log(error)
      //       reject(error)
      //     }
      //     let n = stdout.split("\n")
      //     txt = n[0]
      //     txt = replaceU16Code(txt, 0x2010,"-")
      //     txt = replaceU16Code(txt, 0x2011,"-")
      //     txt = replaceU16Code(txt, 0x2013,"-")
      //     txt = replaceU16Code(txt, 0x2014,"-")
      //     txt = replaceU16Code(txt, 0x003A,"-")//:
      //     txt = replaceU16Code(txt, 0x02bb,"-")//see https://www.fileformat.info/info/charset/UTF-16/list.htm
      //     txt = replaceU16Code(txt, 0x02bc,"-")
      //     txt = replaceU16Code(txt, 0x02f8,"-")
      //     txt=txt.replace(/:/g,"-")
      //     txt=txt.replace(/;/g,"")
      //     txt=txt.replace(/'/g,"")
      //     txt=txt.replace(/'/g,"")
      //     txt=txt.replace(/&/g,"_")
      //     txt=txt.replace(/ß/g,"ss")
      //     txt=txt.replace(/\*/g,"")
      //     txt=txt.replace(/(\r\n|\n|\r)/gm, "")
      //     exec("rm -f fn.txt", (error, stdout, stderr) => {})
      //     resolve(txt)
      //   })
      // })
    })
  },
  this.cleanFilenameNoPromise = async function(name,data){
      if (name){
        key = name
        //console.log(key)
        txt=data.replace(key,"");
      }else txt=data

      txt=txt.replace(/[^a-zA-Z0-9\.\-]/g, "")

      //remove spaces
      txt=txt.replace(/ /g,"")

      //remove (..) and what is in between
      s=txt.indexOf("("); e=txt.indexOf(")");
      if (s>=0 && e > s) {let=txt.slice(s,e+1); txt=txt.replace(let,"")}

      //remove [..] and what is in between
      s=txt.indexOf("["); e=txt.indexOf("]");
      if (s>=0 && e > s) {let=txt.slice(s,e+1); txt=txt.replace(let,"")}

      // //remove all after first occurence of "/"
      // s=txt.indexOf("/"); e=txt.length-4; 
      // if (s>=0 && e>s) {let=txt.slice(s,e); txt=txt.replace(let,"")}

      // txt = replaceU16Code(txt, 0x2010,"-")
      // txt = replaceU16Code(txt, 0x2011,"-")
      // txt = replaceU16Code(txt, 0x2013,"-")
      // txt = replaceU16Code(txt, 0x2014,"-")
      // txt = replaceU16Code(txt, 0x003A,"-")//:
      // txt = replaceU16Code(txt, 0x02bb,"-")//see https://www.fileformat.info/info/charset/UTF-16/list.htm
      // txt = replaceU16Code(txt, 0x02bc,"-")
      // txt = replaceU16Code(txt, 0x02f8,"-")
      txt=txt.replace(/:/g,"-")
      txt=txt.replace(/;/g,"")
      txt=txt.replace(/'/g,"")
      txt=txt.replace(/&/g,"_")
      txt=txt.replace(/ß/g,"ss")
      txt=txt.replace(/\*/g,"")
      txt=txt.replace(/^-|-$/g, "") //remove - at beginning and end of filename
      // txt=txt.replace(/(\r\n|\n|\r)/gm, "")
      return txt
  },
  this.saveMp3 = async function(mp3Name){
      try{
        if (mp3Name){
          var newName = await cleanFilenameNoPromise("",mp3Name)
          cmd = "cp -rf " + mp3Name + " " + devMusic + "/Audio/" + newName
          console.log(cmd)
          await execCmd(cmd)
          progressInfo += "   Transfer " + mp3Name + " ok"
        }
        else 
          progressInfo += " saveMp3: no MP3 Filename detected!"
        return newName
      }
      catch(err){
        console.log(err)
        progressInfo += " ********** saveMp3 " + error
        return ""
      }
    },
    this.downloadYTconvertMp3 = async function(url,index,em,save){
      try {
        procStatus.text="try to convert..."
        await fsPromises.writeFile('help/progress.out', "...") 
        emailAddr = em 
        //move old mp3 
        var cmd = "mv *.mp3 " + devMusic + "/Audio/.; rm -f help/vid.txt"
        console.log(cmd)
        await execCmd(cmd)
        cmd="yt-dlp --js-runtimes node -x --audio-format mp3 --audio-quality 0 " + url + " > help/progress.out"
        console.log(cmd)
        await execCmd(cmd)
        procStatus.text="downloadYTconvertMp3 done"; console.log(procStatus.text)
        readYTvideo(index,em,save)
      }
      catch(err){
        procStatus.text="`downloadYTconvertMp3 + err: " + err
        console.error()
        SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
      }
    },
    this.ytSearch = async function(searchStr, res){
      console.log('search string= ' + searchStr)
      var result = ""
      try{
          const response = await new Promise((resolve, reject) => {
            youTubeObj.search(searchStr, 100, { type: 'video' }, function(err, data){
              if (err) reject(err); else resolve(data);
            });
          });

          result = response.items;
          //https://developers.google.com/youtube/v3/docs/search/list

          youTubeData=JSON.stringify(result, null, 2)
          //console.log(youTubeData);
          let yTD=JSON.parse(youTubeData)
          console.log(yTD[0])
          //console.log("Anz. Items=" + yTD.length)
          var i=0
          var found=0
          ytTitle.length = 0; ytUrl.length = 0; ytVideoId.length = 0;
          for (let i=0; i<yTD.length; i++){
            if (yTD[i].id.videoId){
              urlYT='https://www.youtube.com/watch?v=' + yTD[i].id.videoId
              //console.log(yTD.items[i].snippet.title + "  " + urlYT)
              ytTitle[found]=yTD[i].snippet.channelTitle + " - " + yTD[i].snippet.title
              //remove extension .mp4 if exist
              if(ytTitle[found].match(".mp4")){
                ytTitle[found] = ytTitle[found].replace(".mp4","")
              }
              ytUrl[found]=urlYT
              ytVideoId[found]=yTD[i].id.videoId
              found++
            } 
          }
        ytFound=found
        if (ytFound > 0){
            var yUrl = "", yT = "", yID = ""
            var i=0; 
            for (i in ytUrl){
              yUrl += ytUrl[i]+"\n"; yT += ytTitle[i]+"\n"; yID += ytVideoId[i]+"\n"
            }
            var data=JSON.stringify(yUrl)
            fs.writeFile('help/yUrl.json', data, function (err) {});
            var data=JSON.stringify(yT)
            fs.writeFile('help/yT.json', data, function (err) {});
            var data=JSON.stringify(yID)
            fs.writeFile('help/yID.json', data, function (err) {});
        }
        res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"", settings:settings, searchYouTube:searchYouTube,btDevice:bluez, 
        recording:getScheduledJobsWithoutTimeout(), pState:procStatus, yttitle:ytTitle, ytVideoId:ytVideoId, 
        ytFound:found, mediathekSearchItem:""})
      }catch(err){
        console.log("ytSearch: "+err)
        procStatus.text="API Key not valid, check System Settings"
        res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"", settings:settings, searchYouTube:searchYouTube,btDevice:bluez, 
        recording:getScheduledJobsWithoutTimeout(), pState:procStatus, yttitle:ytTitle, ytVideoId:ytVideoId, 
        ytFound:found, mediathekSearchItem:""})

      }
  },
  this.downloadYT = async function(url,res,title){
    try{
      var cmd = "ls "+devMusic+"/Video/"+title+".* >&1"
      console.log("downloadYT: " + cmd)
      var track = await execCmd(cmd)
      if (!track){
        //https://write.corbpie.com/downloading-youtube-videos-and-playlists-with-yt-dlp/
        //https://github.com/yt-dlp/yt-dlp#format-selection
        // cmd = "yt-dlp -f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best' \
        // --js-runtimes node -o "+devMusic+"/Video/"+title + " " + url
        cmd = "yt-dlp --js-runtimes node -o "+devMusic+"/Video/"+title + ".mp4 " + url
        console.log(cmd)
        procStatus.text = "";
        await execCmd(cmd)
      }else console.log("downloadYT: found "+title)
      res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"Video/"+title, settings:settings, searchYouTube: searchYouTube, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), 
      pState: procStatus, yttitle:ytTitle, ytVideoId:ytVideoId, ytFound: ytFound, mediathekSearchItem: ""})

      // cmd = "ffprobe "+devMusic+"/Video/"+title+" 2>&1 >/dev/null | grep Stream >&1"
      // console.log(cmd)
      // result = await execCmd(cmd)
      // if (result.match("Video: h264")){
      //   if (result.match("ac3")){
      //     console.log("ac3 need to convert: "+devMusic+"/Video/"+title)
      //     await convertAC3(devMusic+"/Video/"+title)
      //   }
      // }else{
      //   //no video stream
      //   await execCmd("rm "+devMusic+"/Video/"+title)
      //   procStatus.text = "no video stream detected in newYT.mp4"
      // }
    }
    catch(err){
      console.log(err)
      procStatus.text = err;
      progressInfo = procStatus.text
      res.render('pages/youtubeselect', {vol:volumeAudioOut, play:"mediaServer/Music/Video/"+title+".mp4", settings:settings, searchYouTube: searchYouTube, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), 
      pState: procStatus, yttitle:ytTitle, ytVideoId:ytVideoId, ytFound: ytFound, mediathekSearchItem: ""})
    }
  },
  this.removePart = function(){
    //rm downloaded part if download breaks
    exec("rm $XDG_DOWNLOAD_DIR"+devMusic+"/Video/*.part; rm $XDG_DOWNLOAD_DIR"+devMusic+"/Video/*.ytdl", (error, stdout, stderr) => {})
  },
  this.getDownloadYT = async function (){
    if (progressInfo.match("Error")){
      procStatus.text = progressInfo
      initiateYTEnd(procStatus.text + " - done!","Video")
      oldProgress=""
      return
    }
    try{
      var stdout = await execCmd("pgrep -x yt-dlp >&1")
      if (stdout) {
        console.log("download / extracting in progress " + stdout)
        var data = await execCmd("cat help/progress.out >&1")
        data = String(data).replace(/\r?\n|\r/g, ' - ')
        //cut old stuff
        var dat = data.slice(oldProgress.length,data.length)
        oldProgress = data
        progressInfo = dat  
      }
      else{ 
        console.log("download finished!")
        if (ytMP4){
  //          if (progressInfo.match("Error")) procStatus.text = progressInfo
          setTimeout(initiateYTEnd,500,procStatus.text + " - see Video Downloads, done!","Video")
        }
      }
    }
    catch(err){
      console.log(err)
    }
  },
  this.set_ytMP4 = function(val){
    //switch what to do if MP3 or MP4 ends for initiateYTEnd("..",val)
    ytMP4 = val
  },
  this.initiateYTEnd = async function(msg,media){
    await setAudioCaptureInfo(msg)
    SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
    var cmd = "ls " + devMusic + "/" + media + " >&1"
    console.log(cmd)
    //clean all Filesnames
    var stdout = await execCmd(cmd)
    if (stdout){
      var files = stdout.split("\n")
      files.pop()
      var i=0; for (i in files){
        var newFilename = await cleanFilenameNoPromise("",files[i])
        var c1 = devMusic + "/" + media + "/" + files[i]
        var c2 = devMusic + "/" + media + "/" + newFilename
        if (c1 != c2){
          c1 = await escapeFilename(c1)
          cmd = "mv " + c1 + " " + c2
          console.log(cmd)
          try{
            await execCmd(cmd)
            console.log(newFilename)
          }catch(err) {
            console.log(err)
          }
        }
      }
    }
  },
  this.loadYouTubeSearch = async function(){
    try{
      let data = await fsPromises.readFile('help/yID.json','utf8')
      if (data.length > 0) {
        var yid = JSON.parse(data)
        ytVideoId = yid.split("\n")
        ytVideoId.pop()
        ytFound = ytVideoId.length      
      }
      data = await fsPromises.readFile('help/yT.json','utf8')
      if (data.length > 0) {
        var yt = JSON.parse(data)
        ytTitle = yt.split("\n")
        ytTitle.pop()
      }
      data = await fsPromises.readFile('help/yUrl.json',"utf8")
      if (data.length > 0) {
        var yu = JSON.parse(data)
        ytUrl = yu.split("\n")
        ytUrl.pop()
      }
    }catch(err){
      console.log("loadYouTubeSearch " + err)
    }
  }
}
