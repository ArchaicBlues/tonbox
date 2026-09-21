//DUMMY MODULE: YouTube search/download (Mediathek) has been reduced to a
//no-op stub as part of the BASIS build. Routes stay reachable and render the
//same pages, but no YouTube API calls or yt-dlp downloads happen anymore.
//The pure filename-sanitizing helpers below are kept real because
//funcRadio.js (a kept CORE feature) calls them when naming recordings.

require('./funcsystem')();

global.ytTitle = []
global.ytUrl = []
global.ytVideoId = []
global.ytFound = 0
global.searchYouTube = ''

module.exports = function (required) {
  this.setYouTubeObj = function () {
    //no-op
  },
  this.checkYoutubeKey = async function (k) {
    return false
  },
  this.escapeFilename = function (name) {
    return Promise.resolve(
      name.replace(/ /g, String.fromCharCode(92, 32))
        .replace(/'/g, String.fromCharCode(92, 39))
        .replace(/\(/g, String.fromCharCode(92, 40))
        .replace(/\)/g, String.fromCharCode(92, 41))
    )
  },
  this.cleanFilename = function (name, data) {
    return new Promise((resolve) => {
      var txt = ""
      if (name) {
        txt = data.replace(name, "");
      } else txt = data

      txt = txt.replace(/[^a-zA-Z0-9\.\-]/g, "")
      resolve(txt)
    })
  },
  this.cleanFilenameNoPromise = async function (name, data) {
    var txt = ""
    if (name) {
      txt = data.replace(name, "");
    } else txt = data

    txt = txt.replace(/[^a-zA-Z0-9\.\-]/g, "")

    //remove spaces
    txt = txt.replace(/ /g, "")

    //remove (..) and what is in between
    var s = txt.indexOf("("); var e = txt.indexOf(")");
    if (s >= 0 && e > s) { let cut = txt.slice(s, e + 1); txt = txt.replace(cut, "") }

    //remove [..] and what is in between
    s = txt.indexOf("["); e = txt.indexOf("]");
    if (s >= 0 && e > s) { let cut = txt.slice(s, e + 1); txt = txt.replace(cut, "") }

    txt = txt.replace(/:/g, "-")
    txt = txt.replace(/;/g, "")
    txt = txt.replace(/'/g, "")
    txt = txt.replace(/&/g, "_")
    txt = txt.replace(/ß/g, "ss")
    txt = txt.replace(/\*/g, "")
    txt = txt.replace(/^-|-$/g, "") //remove - at beginning and end of filename
    return txt
  },
  this.saveMp3 = async function (mp3Name) {
    return ""
  },
  this.downloadYTconvertMp3 = async function (url, index, em, save) {
    procStatus.text = "YouTube feature disabled in this BASIS build"
    SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
  },
  this.ytSearch = async function (searchStr, res) {
    procStatus.text = "YouTube feature disabled in this BASIS build"
    if (res) res.render('pages/youtubeselect', {
      vol: volumeAudioOut, play: "", settings: settings, searchYouTube: searchYouTube, btDevice: bluez,
      recording: getScheduledJobsWithoutTimeout(), pState: procStatus, yttitle: [], ytVideoId: [],
      ytFound: 0, mediathekSearchItem: ""
    })
  },
  this.downloadYT = async function (url, res, title) {
    procStatus.text = "YouTube feature disabled in this BASIS build"
    if (res) res.render('pages/youtubeselect', {
      vol: volumeAudioOut, play: "", settings: settings, searchYouTube: searchYouTube, btDevice: bluez,
      recording: getScheduledJobsWithoutTimeout(), pState: procStatus, yttitle: ytTitle, ytVideoId: ytVideoId,
      ytFound: ytFound, mediathekSearchItem: ""
    })
  },
  this.removePart = function () {
    //no-op
  },
  this.getDownloadYT = async function () {
    //no-op
  },
  this.set_ytMP4 = function (val) {
    //no-op
  },
  this.initiateYTEnd = async function (msg, media) {
    SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
  },
  this.loadYouTubeSearch = async function () {
    //no-op: Mediathek search history is not loaded in this BASIS build
  }
}
