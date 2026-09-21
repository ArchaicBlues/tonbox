//DUMMY MODULE: CD/DVD ripping & playback (Tools > CD) has been reduced to a
//no-op stub as part of the BASIS build. Routes stay reachable and render the
//same pages, but no drive detection, ripping, or playback ever happens.

global.maxCDtracks = 0;
global.cdInfo = { tracks: [], images: [], discogsTitel: "empty", status: "" };
global.currentCDTrack = 1;
global.cdripping = false;
global.blkCDdev = "";
global.discInfo = {
  type: "Unknown",
  filesystem: null,
  files: {},
  tracks: 0
};

module.exports = function (required) {
  this.isUsbAudioCaptureDetected = function () {
    return false
  },
  this.hasCdDriveDetected = function () {
    return false
  },
  this.cdDvd = async function (action, tr, res) {
    if (res) return res.json({ success: false, error: "CD feature disabled in this BASIS build" });
  },
  this.startCDPlay = function (track, blkCDdev, res) {
    if (res) return res.json({ success: false, currentTrack: 0 });
  },
  this.mplayerPlay = async function (track, blkCDdev, res, filePath = "") {
    if (res) return res.json({ success: false, currentTrack: 0 });
  },
  this.killMplayer = async function () {
    //no-op
  },
  this.checkCDdrive = async function (res) {
    if (res) {
      res.render('pages/cddvd', {
        pageInfo: pageInfo, recAD: recAD,
        btDevice: bluez,
        pState: procStatus, recording: getScheduledJobsWithoutTimeout(),
        settings: settings,
        vol: volumeAudioOut,
        tracks: cdInfo,
        currentTrack: 0,
        discInfo: discInfo,
        hasCdDrive: false,
        usbAudioCaptureDetected: false
      });
    }
  },
  this.checkCDRipping = async function () {
    return ""
  },
  this.captureCD = async function (res) {
    procStatus.text = "CD feature disabled in this BASIS build"
    if (res && !res.headersSent) {
      res.render('pages/cddvd', {
        pageInfo: pageInfo, recAD: recAD,
        btDevice: bluez,
        pState: procStatus, recording: getScheduledJobsWithoutTimeout(),
        settings: settings,
        vol: volumeAudioOut,
        tracks: cdInfo,
        currentTrack: 0,
        discInfo: discInfo,
        hasCdDrive: false,
        usbAudioCaptureDetected: false
      });
    }
  },
  this.checkCDRecExist = async function (cdNum) {
    return false
  },
  this.startRipping = async function (startTrack = 1, retryDepth = 0) {
    return "Success"
  },
  this.getCDstatus = function () {
    return "."
  },
  this.saveUserInfoCD = async function (res, cdNum, artist, title, tracks, images) {
    if (res) return captureCD(res);
  },
  this.generateImage = async function (b, h, title) {
    //no-op
  },
  this.detectDisc = async function (dev) {
    return {
      type: "Unknown",
      filesystem: null,
      files: {},
      tracks: 0
    }
  },
  this.moveCDAudiodata = async function (res) {
    if (res) return res.json({ status: "disabled" });
  }
}
