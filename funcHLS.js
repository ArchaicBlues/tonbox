//PARTIAL DUMMY MODULE: this module mixes generic static/stream senders used
//by the kept Radio feature (sendHLS, streamMP3, quitHLS - kept real) with
//Gallery/Vinyl-cover-specific image senders that are reduced to no-ops as
//part of the BASIS build (createHLSmanifest, sendHomeImgHLS, sendCoverHLS,
//sendAllImgHLS, sendPicHLS, mediaShow, sendMediaList).

const fsPromises = require('fs/promises');
const fs = require('fs');

global.statusSendHLS = 0
global.mediaList = []
global.mediaPath = ""

module.exports = function (required) {
  this.createHLSmanifest = function (res, typ, target, send) {
    //no-op
  },
  this.sendHomeImgHLS = async function (res, p) {
    res.writeHead(404); res.end();
  },
  this.sendCoverHLS = async function (item, res) {
    res.writeHead(404); res.end();
  },
  this.sendAllImgHLS = async function (item, res) {
    res.writeHead(404); res.end();
  },
  this.sendPicHLS = async function (i, dir, res) {
    res.writeHead(404); res.end();
  },
  this.sendHLS = async function (res, path) {
    try {
      var content = ""
      if (path)
        content = await fsPromises.readFile(path, 'utf8')
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
      });
      res.end(content, 'utf-8');
    } catch (error) {
      console.log(error)
      if (error.code === 'ENOENT') {
        res.end()
      }
      else {
        res.writeHead(500);
        procStatus.text = 'ERROR: funcHLS.js: ' + error.code + ' path=' + path + '\n'
        console.log(procStatus.text)
        res.end(procStatus.text);
        res.end();
      }
    }
  },
  this.streamMP3 = async function (req, res, path) {
    const range = req.headers.range;
    try {
      if (!range) {
        const content = await fsPromises.readFile(path)
        res.writeHead(200,
          {
            'Access-Control-Allow-Origin': 'anonymous',
            'Content-Type': 'audio/mpeg',
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

    } catch (error) {
      console.log(error)
      if (error.code === 'ENOENT') {
        res.end()
      }
      else {
        res.writeHead(500);
        procStatus.text = 'ERROR: funcHLS.js: ' + error.code + ' path=' + path + '\n'
        console.log(procStatus.text)
        res.end(procStatus.text);
        res.end();
      }
    }
  },
  this.quitHLS = function (res) {
    res.writeHead(500);
    res.end();
  },
  this.mediaShow = async function (res, pauseTime) {
    res.render('pages/mediaShow', { lastRadiostation: "", settings: settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, vol: settings.jackVolume, pauseTime: 4 });
  },
  this.sendMediaList = async function (res) {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify([]), 'utf-8');
  }
}
