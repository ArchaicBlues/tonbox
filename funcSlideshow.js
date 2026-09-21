//DUMMY MODULE: Gallery / picture & video slideshow has been reduced to a
//no-op stub as part of the BASIS build. Routes stay reachable and render the
//same pages, but no filesystem scanning, uploads, conversion or deletion
//ever happens anymore.

global.slideDirs = []
global.rememberSubDir = ""
global.allPics = []
global.allVids = ""

module.exports = function () {
  this.showPicDir = async function (res) {
    res.render('pages/picvids', { pageInfo: pageInfo, vol: volumeAudioOut, settings: settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, dirs: [] })
  },
  this.endSlideShow = function () {
    //no-op (kept as a harmless callable used by generic navigation cleanup)
  },
  this.checkVideoPic = async function (item) {
    return "pic"
  },
  this.renamePicDir = async function (path, newName, res) {
    if (res) showPicDir(res)
  },
  this.uploadPics = function (res, files) {
    if (res) showPicDir(res)
  },
  this.createPicDir = async function (res, newDir) {
    if (res) showPicDir(res)
  },
  this.renderNewDir = function (res, dir) {
    res.render('pages/picDir', { pageInfo: pageInfo, vol: volumeAudioOut, settings: settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, data: "", dir: dir, bigpath: "" })
  },
  this.showPicSubDir = async function (res, dir, bigpath) {
    res.render('pages/picDir', { pageInfo: pageInfo, vol: volumeAudioOut, settings: settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, data: "", dir: dir, bigpath: "" })
  },
  this.deletePicVidItem = async function (item, res) {
    if (res) showPicDir(res)
  },
  this.deletePicDir = async function (dir, res) {
    if (res) showPicDir(res)
  },
  this.renamePicVidDir = async function (path, newName, res) {
    if (res) showPicSubDir(res, path, "")
  },
  this.checkEmptyPicVidDir = async function (path, dir, res) {
    if (res) showPicSubDir(res, dir, "")
  },
  this.checkEmptyDir = async function (dat, dir, res) {
    if (res) showPicSubDir(res, dir, "")
  },
  this.cleanVideoExt = async function (src, dir) {
    return "ok"
  },
  this.convertVideo = async function (res, dir, src) {
    procStatus.text = "Gallery video conversion disabled in this BASIS build"
    if (res) showPicDir(res)
  },
  this.checkFileout = async function (filein, fileout) {
    return ""
  },
  this.rotateSlide = async function (p, res) {
    if (res) res.render('pages/picDir', { pageInfo: pageInfo, vol: volumeAudioOut, settings: settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, data: [], dir: rememberSubDir, bigpath: "" })
  },
  this.getPicData = async function (i, dir) {
    //no-op
  },
  this.clearSmallPics = function () {
    //no-op
  }
}
