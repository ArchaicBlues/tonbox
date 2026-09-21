require ('./funcsystem.js')()


//require('./server.js')
fs = require('fs');
var mjpegServer =require('mjpeg-server');

const { exec } = require('child_process');

//https://stackabuse.com/reading-a-file-line-by-line-in-node-js/
const { log } = require('util');

//Pictures / Slideshow -------------------------------------------------
var imgUri = []
var imgViewCount = 0
global.slideDirs = []
let homePics = []
//global.rememberSlide = ""
global.rememberSubDir = ""

var mjpegReqHandler = ''
var slideTimer = ''
global.allPics = []

//Video show
global.allVids = ""


//callback schreibt stream
function sendJPGData(err, data) {
  if (err){
    console.log("sendJPGData err=" + err)
  }
  else
  {
    if (imgViewCount >= imgUri.length) {
      endSlideShow()
    }
    else {
      mjpegReqHandler.write(data)
      imgViewCount++        
    }
  }
}

// async function nextSlide(){
//   if (imgViewCount < imgUri.length) {
//     console.log('imgUri[' + imgViewCount + ']=' + imgUri[imgViewCount])
//     try{
//       await execCmd('cp -f ' + imgUri[imgViewCount] + " .")
//       //filename.jpg aus Pfad herausfinden
//       const loc = imgUri[imgViewCount];
//       const path = loc.split("/");
//       const filename = path.pop();
//       var cmd ="convert "+filename+" -resize 20% x.jpg"
//       await execCmd(cmd)
//       fs.readFile("x.jpg", sendJPGData);
//     }
//     catch (err){
//       console.log(err)
//     } 
//     }
//     else {
//       endSlideShow()
//     }
// }


function readPics(i) {
  return new Promise((resolve, reject) => {
    var cmd = "ls " + devHome + "/Pictures/" + slideDirs[i] + " >&1"
    //console.log(cmd)
    exec(cmd, (error, stdout, stderr) => {
      if (stdout){
        var pics = stdout.split("\n");
        pics.pop()
        homePics[i] = devHome + "/Pictures/" + slideDirs[i] + "/" + pics[0]; //only the first one
        resolve("ok")
      }else{
        homePics[i] = "not available"
        resolve("ok")
      }
    })
  })
}

//Container func !
const renderPicDir = async (res) => {
  try{
    var i=0; 
    for (i in slideDirs){
      await readPics(i)
      if (i >= slideDirs.length-1){
        res.render('pages/picvids', {pageInfo:pageInfo,vol:volumeAudioOut, settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, dirs:slideDirs })
        return
      }
    }
  }catch(err){
    console.log(err)
    procStatus.text = err
    res.render('pages/picvids', {pageInfo:pageInfo,vol:volumeAudioOut, settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, dirs:slideDirs })
  }
}

//Video-----------------------------------------------------------
var vidAvailableDirs = ""
var vidUri = [] 


module.exports = function(){
  this.showPicDir = async function(res){
    if (devHome === "nok"){
      procStatus.text = "kein Verzeichnis mediaServer. Siehe Konfiguration."
      setInitialPage(res)
      return
    }
    try {
      var cmd='ls ' + devHome + '/' + rememberDB + ' >&1'
      var stdout = await execCmd(cmd)
      if (stdout){
        slideDirs = stdout.split("\n");
        slideDirs.pop()
        renderPicDir(res)
      }else
        res.render('pages/picvids', {pageInfo:pageInfo,vol:volumeAudioOut, settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, dirs:slideDirs })
    }catch(err){
        procStatus.text = err
        setInitialPage(res)
        return
    }
  },  
  // this.prepareSlideshow = function(uri,req,res){
  //   var cmd = "ls " + devHome+"/"+rememberDB+"/" + uri + "/ | grep -e jpg -e JPG -e jpeg -e JPEG -e bmp -e BMP -e png -e PNG > help/allImages.txt"
  //   //wenn kein *png o.a. vorhanden kommt zwar Fehlermeldung, kann man aber ignorieren, hier dann kein return!
  //   console.log(cmd)
  //   exec(cmd, (error, stdout, stderr) => {
  //     if (error || stderr) {
  //       procStatus.text = "kein Bild gefunden"
  //       showPicSubDir(res,rememberSubDir,"")
  //       return
  //     } 
  //     console.log("allImages written")
  //     readAllImages(req,res,uri)
  //   })
  // },
  // this.startSlideshow = function(req,res,pause) {
  //     console.log("Pause=" + pause)
  //     console.log("Anzahl=" + imgUri.length)
  //     if (imgUri.length > 0){        
  //       mjpegReqHandler = mjpegServer.createReqHandler(req, res);
  //       imgViewCount = 0
  //       nextSlide()
  //       if (imgUri.length > 1){        
  //         slideTimer = setInterval(nextSlide,pause)
  //       }
  //     } else {
  //       res.render('pages/slideerror',{pageInfo:pageInfo, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus });
  //     }
  // },
  this.endSlideShow = function(){
    //stopAllwav()
    //console.log("if not playing: ignore if stopAllWav failed")

    if (slideTimer) {
      clearInterval(slideTimer);
    }
    if (mjpegReqHandler) {
      mjpegReqHandler.close();
      console.log('End slideshow request');
    }
    imgViewCount = 0
    exec('rm *.jpg; rm *.bmp; rm *.jpeg; rm allImages', (error, stdout, stderr) => {})
  },
  // this.getHomePics = function(i){
  //   return homePics[i]
  // },
  this.checkVideoPic = function (item) {
    return new Promise((resolve, reject) => {
      if (item){
        if (item.match(".jpg") || item.match(".JPG") || item.match(".JPEG") || item.match(".jpeg") || 
            item.match(".png") || item.match(".PNG") || item.match(".bmp") || item.match(".BMP"))
          resolve("pic")
        else 
          resolve("vid")
      }
      else  
        reject("no item")
    })
  },
  this.renamePicDir = async function(path,newName,res) {
    var n = await cleanFilenameNoPromise("",newName)
    if (n.match("/")){
      procStatus.text="kein gültiges Zeichen /"
      showPicDir(res)
    }
    var cmd = "mv " + devHome + "/Pictures/" + path + " " + devHome + "/Pictures/" + n
    console.log(cmd)
    try {
      await execCmd(cmd)
      showPicDir(res,p[0],"")
    }catch(err){
      console.log(err)
      procStatus.text=err
      showPicDir(res,path,"")
    }
  },
  //Files liegen zunächst im Aufrufverzeichnis ~/ArchaicNodeEJS und werden gelöscht, siehe weiteer unten
  this.uploadPics = function(res,files){
    var filename =""
    console.log("starte upload...")
    //if just one item
    if (files.upfile.name){
      if (checkMedia(files.upfile.name,"Home")){
        var dest = devHome + "/" + rememberDB + "/" + rememberSubDir + "/" + files.upfile.name
        files.upfile.mv(dest,(err => {
          if (err) 
            console.log("pic upload failed") 
          else {
            console.log("upload " + files.upfile.name + " done")
            showPicSubDir(res,rememberSubDir,"")
          }
        }))
      }else
        showPicDir(res)
    }else{ //more than one item
      var sendOK = false
      var x = 0
      var i=0; for (i in files.upfile){
        filename = files.upfile[i].name
        if (checkMedia(filename,"Home")){
          filename = filename.replace(/ /g,"" )
          var dest = devHome+"/Pictures/" + rememberSubDir + "/" + filename
          files.upfile[i].mv(dest,(err => {
            if (err){ 
              console.log("pics upload failed") 
              x++
            }else {
              console.log("upload " + files.upfile[i].name + " done")
              x++
              // var cmd = "sudo rm " + files.upfile[i].name
              // exec(cmd,(err, stdout, stderr) => {
              //   if (err || stderr) console.log(err + "  " + stderr)
              // })
            }
            console.log("i="+x)
            if (x >= files.upfile.length)
              showPicSubDir(res,rememberSubDir,"")
          }))
        }
      }
    }
  },
  this.createPicDir = async function (res,newDir){
    try{
      var dir = await cleanFilename("",newDir)
      if (dir.match("/")){
        procStatus.text="kein gültiges Zeichen /"
        showPicDir(res)
        return
      }
      var i=0; for (i in slideDirs){
        if (slideDirs[i].match(dir)){
          procStatus.text="Verzeichnis existiert bereits"
          if (rememberSubDir)
            showPicSubDir(res,rememberSubDir,"")
          else 
            showPicDir(res)
          return
        }
      }
      

      var path = devHome + "/" + rememberDB + "/"
      //if (rememberSubDir)
      //  path += rememberSubDir + "/" + dir
      //else
        path += dir
      await execCmd("mkdir " + path)
      if (rememberSubDir)
        showPicSubDir(res,rememberSubDir,"")
      else 
        showPicDir(res)
  }catch(err) {
      console.log(err)
      procStatus.text=err
      showPicDir(res)
    }
  },
  this.renderNewDir = function (res,dir) {
    rememberSubDir = rememberSubDir + "/" + dir
    res.render('pages/picDir', {pageInfo:pageInfo,vol:volumeAudioOut,  settings:settings,btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, data:"", dir:dir,   bigpath:""})
  },
  this.execCmd = function(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd,(err, stdout, stderr) => {
        if (err && stderr) {
          if (stderr.match("cannot remove") || stderr.match("rm:") || stderr.match("No such file")) resolve("")
          else reject(err)
        }
        else {
          if (stderr) console.log(stderr)//procStatus.text = stderr
          resolve(stdout)
        }
      })
    })
  },
  this.showPicSubDir = async function(res,dir,bigpath){
    var cmd = "ls " + devHome + "/" +rememberDB + "/" + dir + " >&1"
    try{
      var dat = await execCmd(cmd)
      rememberSubDir = dir
      quit_HLS = false
      if (dat){
        slideDirs = dat.split("\n")
        slideDirs.pop()
        ////show dirs first
        let slides = []
        var x=0
        var i=0; 
        for (i in slideDirs){ //check if dot
          if (!slideDirs[i].match(/\.(?=[A-Za-z])/g)) slides[x++]=slideDirs[i]
        }
        for (i in slideDirs){
          if (slideDirs[i].match(/\.(?=[A-Za-z])/g)) slides[x++]=slideDirs[i]
        }
        slideDirs = slides; //will be used in sendPicHLS() !

        mediaList = slideDirs
        mediaPath = devHome + "/" +rememberDB + "/" + dir
        res.render('pages/picDir', {pageInfo:pageInfo,vol:volumeAudioOut,  settings:settings,btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, data:slideDirs, dir:dir,   bigpath:bigpath})
        return
      }
      res.render('pages/picDir', {pageInfo:pageInfo,vol:volumeAudioOut,  settings:settings,btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, data:"", dir:dir,   bigpath:""})
    }catch(err) {
      console.log(err)
      //enterPicVidsSubDir(stdout,res,dir,bigpath)
      showPicDir(res)
    }
  },
  this.deletePicVidItem = async function (item,res){
    try{
      var cmd = ""
      if (Array.isArray(item)){
        for (i in item){
          escapeName = escapeTrack(item[i])
          cmd += "rm " + devHome + "/" + rememberDB + "/" + escapeName+";"
        }
      }
      else{
        if (item.match(/\./g)){
          var cmd = "rm " + devHome + "/" + rememberDB + "/" + item
        }
        else{
          var cmd = "ls " + devHome + "/" + rememberDB + "/" + item
          console.log(cmd)
          var dat = await execCmd(cmd)
          if (dat.match(".mp4")){
            let d = dat.split("\n")
            d.pop()
            if (d.length > 0){
              procStatus.text="Verzeichnis nicht leer"
              showPicSubDir(res,rememberSubDir,"")
              return
            }
          } //else need to convert: user need to delete them, okay
          var cmd = "rm -rf " + devHome + "/" + rememberDB + "/" + item
          rememberSubDir =""
        }
      }
      console.log(cmd)
      await execCmd(cmd)
      if (rememberSubDir)
        showPicSubDir(res,rememberSubDir,"")
      else
        showPicDir(res)

    }catch(err){
      console.log(err)
      showPicDir(res)
    }
  },
  this.deletePicDir = async function (dir,res){
    var cmd = "rmdir " + devHome + "/" + rememberDB + "/" + dir
    try{
      await execCmd(cmd)
      showPicDir(res)
    }catch(err){
      procStatus.text=err
      showPicDir(res)
    }
  },
  this.renamePicVidDir = async function (path,newName,res){
    var n = await cleanFilenameNoPromise("",newName)
    if (n.match("/")){
      procStatus.text="kein gültiges Zeichen /"
      showPicSubDir(res,path,"")
      return
    }
    var i=0; for (i in slideDirs){
      if (slideDirs[i].match(newName)){
        procStatus.text="Verzeichnis existiert bereits"
        showPicSubDir(res,rememberSubDir,"")
        return
      }
    }
    let newSubDir = ""
    newSubDir=path.split("/")
    if (newSubDir.length > 1){
      var newSub = ""
      var i=0; for (i in newSubDir){
        if (i < newSubDir.length-2) newSub+=newSubDir[i]+"/"
        else if (i < newSubDir.length-1) newSub+=newSubDir[i]
      }
      if (rememberSubDir == path) rememberSubDir = newSub + "/" + n
      else rememberSubDir = newSub

      var cmd = "mv " + devHome + "/Pictures/" + path + " " + devHome + "/Pictures/" + rememberSubDir + "/" + n

    }
    else{
      var cmd = "mv " + devHome + "/Pictures/" + path + " " + devHome + "/Pictures/" + n
      rememberSubDir = n
    }
    console.log(cmd)
    try {
      await execCmd(cmd)
      showPicSubDir(res,rememberSubDir,"")
    }catch(err){
      console.log(err)
      procStatus.text=err
      showPicSubDir(res,path,"")
    }
  },
  this.checkEmptyPicVidDir = async function (path,dir,res){
    var cmd = "ls " + devHome + "/Pictures/" + dir + " >&1"
    try {
      var stdout = await execCmd(cmd)
      checkEmptyDir(stdout,res)
    }catch(err) {
      console.log(err)
      showPicSubDir(res,dir,"")
    }
  },
  this.checkEmptyDir = async function(dat,dir,res){
    if (dat){
      //not empty
      showPicSubDir(res,dir,"")
    }else{
      var cmd = "sudo rmdir " + devHome + "/Pictures/" + dir
      try{
        await execCmd(cmd)
        showPicSubDir(res,dir,"")
      }catch(err){
        console.log(err)
        showPicSubDir(res,dir,"")
      }
    }
  },
  this.cleanVideoExt = function(src,dir){
    return new Promise((resolve, reject) => {
      console.log("src="+src + " dir=" +dir)
      var match = ""
      if (src){
        var s = src.search("/")
        if (s > 0){
          var subdir = src.substring(0,s+1)
          var path = devHome + "/Pictures/"
          exec("ls " + path + subdir + " >&1",(err, stdout, stderr) => {
            if (stdout.length > 0){
              let d = stdout.split("\n")
              d.pop()
              var i=0; for (i in d){
                var file = ""
                if (d[i].match(".MTS.") || d[i].match(".mts.") || d[i].match(".MPG.") || d[i].match(".mpg.")
                || d[i].match(".flv.") || d[i].match(".FLV.")){
                  file = d[i]
                }
                if (file){
                  p1 = d[i].indexOf(".")
                  p2 = d[i].indexOf(".",p1+1)
                  match = file.substring(p1,p2)
                  file = file.replace(match,"R")
                  //do not move if exist
                  exec("ls " + path + file + " >&1",(err, stdout, stderr) => {
                    if (!(stdout.length > 1)){
                      exec("sudo mv " + p + " " + subdir,(err, stdout, stderr) => {})
                    }
                  })
                }
              }
              resolve("ok")
            }else reject("no dir content")
          })
        } else reject("no path found")
      }
    })
},
  this.convertVideo = async function(res,dir,src){
    try {
      var cmd = "ls " + devHome + "/" +rememberDB + "/" + dir + " >&1"
      var dat = await execCmd(cmd)
      rememberSubDir = dir
      var data = dat.split("\n")
      data.pop()

      //check subdir
      var bP = src
      // if (src.match(".")){
      //   bP = ""
      //   //F5 könnte gedrückt worden sein, und src inzwischen nicht mehr vorhanden sein
      //   var d = src.split("/")
      //   var f = d[d.length-1]
      //   if (!dat.match(f)){
      //     res.render('pages/picDir', {pageInfo:pageInfo,vol:volumeAudioOut,  settings:settings,btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:"video conversion already in progress, wait..", data:data, dir:dir,   bigpath:bP})
      //     return
      //   }
      // }
      var act = await execCmd("pgrep ffmpeg >&1")
      if (act){
        res.render('pages/picDir', {pageInfo:pageInfo,vol:volumeAudioOut,  settings:settings,btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:"video conversion already in progress, wait..", data:data, dir:dir,   bigpath:""})
        return
      }
      var filein = devHome + "/Pictures/" + src
      var out = src.substr(0,src.length-4)
      var newFilename = out + ".mp4"
      //check if newfilename exist
      var i=0; for (i in data){
        if (data[i] === newFilename){
          newFilename = "R"+newFilename
          break;
        }
      }
      var fileout = devHome + "/Pictures/" + newFilename
      cmd = await checkFileout(filein,fileout)
      procStatus.text = "ein Video wird gewandelt"
      showPicDir(res)
  //    res.render('pages/picDir', {pageInfo:pageInfo,vol:volumeAudioOut,  settings:settings,btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:"video conversion: " + cmd, data:data, dir:dir,   bigpath:bP})
      await execCmd(cmd)
      var result = await execCmd("cat ffmpeg.log >&1")
      if (result.match("Error")){
          procStatus.text = error
      }
      else {
          await execCmd("rm "+filein)
          console.log("conversion done") 
      }
      if (result) await execCmd("rm ffmpeg.log")

    }catch(err){
      console.log(err)
    } 
  },
  this.checkFileout = function(filein, fileout) {
    return new Promise((resolve, reject) => {
      var cmd = ""
      if (filein.match(".mts") || filein.match(".MTS")){
        cmd = "ffmpeg -y -i " + filein + " " + fileout + " 2> ffmpeg.log"
      }else 
      if(filein.match(".flv") || filein.match(".FLV")){
        cmd = "ffmpeg -y -i " + filein + " -c:v libx264 -crf 19 " + fileout + " 2> ffmpeg.log"
      }else //try other
        cmd = "ffmpeg -y -i " + filein + " " + fileout + " 2> ffmpeg.log"
      console.log(cmd)
      resolve(cmd)
    })
  },
  this.rotateSlide = async function(p,res){
    const rawPath = String(p || '').trim().replace(/"/g, '');
    let filePath = rawPath;

    if (filePath.startsWith('~')) {
      filePath = filePath.replace(/^~/, process.env.HOME || '/home/pi');
    } else if (!filePath.startsWith('/')) {
      if (filePath.startsWith('home/')) {
        filePath = '/' + filePath;
      } else if (filePath.startsWith('mediaServer/')) {
        filePath = '/' + filePath;
      } else {
        filePath = (devHome || '/home/pi/mediaServer/Home') + '/' + rememberDB + '/' + filePath.replace(/^\/+/, '');
      }
    }

    const cmd = `mogrify -rotate 90 "${filePath}"`;
    console.log(cmd)
    try{
      await execCmd(cmd)
    }catch(err){
      console.log('rotateSlide error:', err)
      procStatus.text = 'Bild konnte nicht gedreht werden'
    }
    res.render('pages/picDir', {pageInfo:pageInfo,vol:volumeAudioOut,  
      settings:settings,btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), 
      pState:procStatus, data:slideDirs, dir:rememberSubDir,   bigpath:filePath})
  },
  this.getPicData = async function(i,dir){
    try{
      var cmd = "ls " + devHome + "/Pictures/" + dir + " >&1"
      var stdout = await execCmd(cmd)
      if (!stdout) return
      var data = stdout.split("\n")
      data.pop()

    }catch(err){

    }
  },
  this.clearSmallPics = function (){
    exec("rm -f public/images/helpDB/small*", (error, stdout, stderr) => {})
  }
}
