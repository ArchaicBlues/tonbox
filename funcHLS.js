//'use strict';

const util = require('util');
const exec = util.promisify(require('child_process').exec);
const fsPromises = require('fs/promises');
const fs = require ('fs');;
const path = require('path');
const processMultipart = require('express-fileupload/lib/processMultipart');

const dir = path.join(__dirname, 'songs');
const dest = path.join(__dirname, 'chunks');

global.statusSendHLS = 0

global.mediaList =[]
global.mediaPath = ""



module.exports = function(required){
  this.createHLSmanifest = function(res,typ,target,send){
    exec("rm -f songs/*; rm -f chunks/*", (error, stdout, stderr) => {
      exec("cp " + target + " songs/.", (error, stdout, stderr) => {
        if(error){
          console.log("Err createHLSmanifest, cp songs")
          return
        }
        fs.readdir(dir, (readDirError, files) => {
          if (readDirError) {
            console.error(readDirError);
            return;
          }
          const countFiles = files.length;
          files.map(async (file, index) => { 
            const fileName = path.join(dir, file);
            //console.log(fileName)
            let cmd=""
            if (typ=="audio") cmd = `ffmpeg -i ${fileName} -profile:v baseline -level 3.0 -s 640x360 -start_number 0 -hls_time 10 -hls_list_size 0 -f hls  ${dest}/${index}.m3u8` 
            else cmd = `ffmpeg -i ${fileName} -codec: copy -bsf:v h264_mp4toannexb -start_number 0 -hls_time 10 -hls_list_size 0 -f hls  ${dest}/${index}.m3u8`
            console.log("Start..")
            let s = Date.now()
            const { err, stdout, stderr } =
              await exec(cmd);
              if (err) {
                console.log(err);
                return
              }
              if (countFiles - 1 === index) {
                console.log("chunk files and 0.m3u8 generated, duration=" + (Date.now()-s)/1000)
              }
          });
        });


      })
    })
  },
	this.sendHomeImgHLS = async function (res,p){
		try{
      var content = await fsPromises.readFile(p)
      res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Content-Length": content.length,
          "Access-Control-Allow-Origin": "*"
      });
      res.end(content);
		}catch(err){
      console.log(err)
      if(err.code === 'ENOENT'){
          res.end()
      }
      else {
          res.writeHead(500);
          console.log('Sorry, check with the site admin for error: '+err.code+' ..\n')
          res.end('Sorry, check with the site admin for error: '+err.code+' ..\n');
          res.end(); 
      }
		}
	},
	this.sendCoverHLS = async function (item,res){
		try{
      var i = item.slice(9,item.length) // i.e. /coverImg132
			var p = settings.installDir + "/ArchaicNodeEJS/public/images/helpDB/coverImg"+i+".jpg"
      var content = await fsPromises.readFile(p)
      res.writeHead(200, {
          "Content-Type": "image/jpeg",
          "Content-Length": content.length,
          "Access-Control-Allow-Origin": "*"
      });
      res.end(content);
		}catch(err){
      console.log(err)
      if(err.code === 'ENOENT'){
          res.end()
      }
      else {
          res.writeHead(500);
          console.log('Sorry, check with the site admin for error: '+err.code+' ..\n')
          res.end('Sorry, check with the site admin for error: '+err.code+' ..\n');
          res.end(); 
      }
		}
	},
  this.sendAllImgHLS = async function (item, res) {
      try {
        let reqPath = item || "";
        if (reqPath.startsWith('/')) reqPath = reqPath.slice(1);
        reqPath = reqPath.split('?')[0];
        const fileName = path.basename(reqPath);
        const candidates = [];

        // First try static image paths used by editor uploads (/images/image1.jpg, ...).
        if (reqPath.startsWith("images/")) {
          candidates.push(path.join(__dirname, "public", reqPath));
        }
        candidates.push(path.join(__dirname, "public", "images", fileName));

        // Then try ADrecords store paths used by record browser and HLS views.
        const relRemember = String(rememberDB || "").replace(/^\/+|\/+$/g, "");
        const relWithoutPrefix = relRemember.replace(/^ADrecords\/?/, "");
        if (devADrecords && devADrecords !== "nok" && relWithoutPrefix) {
          candidates.push(path.join(devADrecords, relWithoutPrefix, "image", fileName));
          candidates.push(path.join(devADrecords, relWithoutPrefix, fileName));
        }

        let content = null;
        for (const p of candidates) {
          try {
            content = await fsPromises.readFile(p);
            break;
          } catch (readErr) {
            if (!readErr || readErr.code !== "ENOENT") throw readErr;
          }
        }
        if (!content) {
          res.writeHead(404);
          res.end();
          return;
        }
          res.writeHead(200, {
              "Content-Type": "image/jpeg",
              "Content-Length": content.length,
              "Access-Control-Allow-Origin": "*"
          });
          res.end(content);
      } catch (err) {
          console.log('sendAllImgHLS error:', err.code, err.message);
          if (err.code === "ENOENT") {
              res.writeHead(404);
              res.end();
          } else {
              console.log(err);
              res.writeHead(500);
              res.end("Server error");
          }
      }
  };
  // this.sendPicHLS = async function(i,dir,res){
  //   statusSendHLS += 1 
  //   try{
  //     if (convert_ac3_active) {
  //       res.end();
  //       return
  //     }
  //     if (!slideDirs[i]) return
  //     var cmd = "" 
  //     slideDirs[i] = await escapeTrack(slideDirs[i])
  //     var src = devHome + "/Pictures/" + dir + "/" + slideDirs[i]
  //     var item = await checkVideoPic(slideDirs[i])
  //     if (item === "vid"){
  //       var fn = "smallVidPic"+i+".jpg"
  //       var result = await execCmd("ls public/images/helpDB/"+fn + " >&1")
  //       if (!result){
  //         //je größer der qscale Faktor umso kleiner der Bildspeicher
  //         cmd = "ffmpeg -y -ss 1 -i " + src + " -qscale:v 24 -frames:v 1 public/images/helpDB/"+fn
  //       }
  //     }
  //     if (item === "pic"){
  //       var fn = "smallPic"+i+".jpg"
  //       var result = await execCmd("ls public/images/helpDB/"+fn + " >&1")
  //       if (!result)
  //         cmd = "convert " + src + " -resize 10%  public/images/helpDB/"+fn
  //     }
  //     if (cmd) await execCmd(cmd)
  //     var dest = settings.installDir + "/ArchaicNodeEJS/public/images/helpDB/"+fn
  //     var content = await fsPromises.readFile(dest)
  //     res.writeHead(200, {
  //       'Access-Control-Allow-Origin': '*',
  //       'Content-Type': 'image/jpeg',
  //       'Content-Length': content.length
  //     });
  //     res.end(content);
  //     statusSendHLS -= 1
  //   }catch(err){
  //     console.log("Command failed: \n" + cmd +"\n")
  //     console.log(err)
  //     if(err.code === 'ENOENT'){
  //         res.end()
  //     }
  //     else {
  //         var dat = err.message;
  //         if (dat.match("Invalid data found when processing input")){
  //           //file damaged ! Erase !
  //           exec("rm -f "+src, (error, stdout, stderr) => {})
  //         }
  //         res.writeHead(500);
  //         //console.log('Sorry, check with the site admin for error: '+err.code+' ..\n')
  //         res.end('Sorry, check with the site admin for error: '+err.code+' ..\n');
  //         res.end(); 
  //     }
  //     statusSendHLS -= 1
  //     console.log("HLSerror="+statusSendHLS)
  //     //exec("rm -f public/images/small*", (error, stdout, stderr) => {})
  //   }
  // },
  this.sendPicHLS = async function(i,dir,res){
    statusSendHLS += 1 
    try{
      if (convert_ac3_active) {
        res.end();
        return
      }
      if (!slideDirs[i]) return
      var cmd = "" 
      slideDirs[i] = await escapeTrack(slideDirs[i])
      var src = devHome + "/Pictures/" + dir + "/" + slideDirs[i]
      var item = await checkVideoPic(slideDirs[i])
      let dest =""
      let content =""
      if (item === "vid"){
        let fn = "smallVidPic"+i+".jpg"
        let result = ""
        try{
          result = await execCmd("ls public/images/helpDB/"+fn + " >&1")
          dest = settings.installDir + "/ArchaicNodeEJS/public/images/helpDB/"+fn
        }catch(err){
          //je größer der qscale Faktor umso kleiner der Bildspeicher
          let cmd = "ffmpeg -y -ss 1 -i " + src + " -qscale:v 24 -frames:v 1 public/images/helpDB/"+fn
          await execCmd(cmd)
          dest = settings.installDir + "/ArchaicNodeEJS/public/images/helpDB/"+fn
        }
      }
      if (item === "pic"){
        dest = devHome + "/Pictures/" + dir + "/" + slideDirs[i]
      }
      content = await fsPromises.readFile(dest)
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'image/jpeg',
        'Content-Length': content.length
      });
      res.end(content);
      statusSendHLS -= 1
    }catch(err){
      console.log("Command failed: \n" + cmd +"\n")
      console.log(err)
      if(err.code === 'ENOENT'){
          res.end()
      }
      else {
          var dat = err.message;
          if (dat.match("Invalid data found when processing input")){
            //file damaged ! Erase !
            exec("rm -f "+src, (error, stdout, stderr) => {})
          }
          res.writeHead(500);
          //console.log('Sorry, check with the site admin for error: '+err.code+' ..\n')
          res.end('Sorry, check with the site admin for error: '+err.code+' ..\n');
          res.end(); 
      }
      statusSendHLS -= 1
      console.log("HLSerror="+statusSendHLS)
      //exec("rm -f public/images/small*", (error, stdout, stderr) => {})
    }
  },
  this.sendHLS = async function(res,path){
  //https://www.rfc-editor.org/rfc/rfc7231#:~:text=RFC%207231%20HTTP%2F1.1%20Semantics%20and%20Content%20June%202014,of%20an%20HTTP%20request%20is%20called%20a%20%22resource%22.
  try{
      var content = ""
      if (path) 
        content = await fsPromises.readFile(path,'utf8')
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
      });
      res.end(content, 'utf-8');
//      res.writeHead(200, { 'Access-Control-Allow-Origin': '*'});
    }catch(error){
      console.log(error)
      if(error.code === 'ENOENT'){
          res.end()
        }
      else {
          res.writeHead(500);
          procStatus.text = 'ERROR: funcHLS.js: '+error.code+' path='+path+'\n'
          console.log(procStatus.text)
          console.log("eventually use splitMPEG.sh")
          res.end(procStatus.text);
          res.end(); 
      }
    }
  },
  this.streamMP3 = async function(req,res,path){
  //https://www.rfc-editor.org/rfc/rfc7231#:~:text=RFC%207231%20HTTP%2F1.1%20Semantics%20and%20Content%20June%202014,of%20an%20HTTP%20request%20is%20called%20a%20%22resource%22.
    const range = req.headers.range;
    try{
      if (!range){
        const content = await fsPromises.readFile(path)
        res.writeHead(200, 
          { 'Access-Control-Allow-Origin': 'anonymous',
            'Content-Type':'audio/mpeg',
            'Content-Length': content.length,
            'Accept-Ranges': 'bytes'
          });
        return res.end(content);
      }

      const stat = await fs.promises.stat(path);
      const positions = range.replace(/bytes=/, "").split("-");
      const start = parseInt(positions[0], 10);
      const end = positions[1] ? parseInt(positions[1], 10) : stat.size - 1;
      const chunkSize = (end - start) + 1;

      const stream = fs.createReadStream(path, { start, end });
      res.writeHead(206, {
        'Access-Control-Allow-Origin': '*',
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'audio/mpeg'
      });
      stream.pipe(res);      

    }catch(error){
      console.log(error)
      if(error.code === 'ENOENT'){
          res.end()
        }
      else {
          res.writeHead(500);
          procStatus.text = 'ERROR: funcHLS.js: '+error.code+' path='+path+'\n'
          console.log(procStatus.text)
          console.log("eventually use splitMPEG.sh")
          res.end(procStatus.text);
          res.end(); 
      }
    }
  },
  this.quitHLS = function(res){
    //console.log('quitHLS')
    res.writeHead(500);
    res.end(); 
  },
  this.mediaShow = async function(res,pauseTime){
    let rS = ""
    const safePauseTime = Number.parseInt(pauseTime, 10)
    let match = settings.powerUpSoundURL && settings.powerUpSoundURL.match(/https?:\/\/\S+/);
    if (match) rS = match[0].trim().replace(/['"]+$/, '')
    res.render('pages/mediaShow', {lastRadiostation:rS, settings:settings, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, vol:settings.jackVolume, settings:settings,pauseTime:Number.isFinite(safePauseTime) && safePauseTime > 0 ? safePauseTime : 4});
  },
  this.sendMediaList = async function(res){
    // mediaPath = "../media/usbmedium1/mediaServer/Home/Pictures/test"
    var list = await execCmd("ls "+mediaPath+" >&1")
    // mediaList = list.split("\n")
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(mediaList), 'utf-8');
  }
}






