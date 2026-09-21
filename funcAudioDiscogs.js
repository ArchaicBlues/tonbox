//DUMMY MODULE: Discogs metadata lookup (used by Vinyl/CD capture) has been
//reduced to a no-op stub as part of the BASIS build. Routes stay reachable
//and render the same pages, but no Discogs API calls, image downloads or
//file moves happen anymore.

global.discogsResult = {
	"state": constants.DISCOGS_RESULT_STATE_EMPTY,
	"cd": {},
	"info": "none",
	"sideA": {},
	"sideB": {},
	"sideC": {},
	"sideD": {},
	"sideE": {},
	"sideF": {},
	"image": {}
}
global.adjustRenameState = {
	discTracks: 0,
	current: 0,
	process: false,
	discSide: [],
	userCheck: false
}
global.updatePlattenschrank = true
global.discogsNewSearchTitle = ""
global.discogsSearchItem = { "Artist": "", "Title": "", "discType": "" }

module.exports = function (required) {
	this.discogsDone = async function (res) {
		if (res) res.json({ success: false, error: "Discogs feature disabled in this BASIS build" });
	},
	this.initiateRecEnd = async function (msg) {
		procStatus.text = ""
		procStatus.stat = 0
	},
	this.reportKey = function () {
		//no-op
	}
	this.GetDiscogsStatus = function () {
		return ""
	},
	this.SetDiscogsStatus = function (state) {
		//no-op
	},
	this.saveTracknames = async function (info, from) {
		//no-op
	},
	this.getDiscogsData = async function (res, searchResult) {
		if (res) res.status(200).json({ error: "Discogs feature disabled in this BASIS build" });
	},
	this.handleImages = async function (data) {
		//no-op
	},
	this.downloadImage = async function (url, targetPath) {
		//no-op
	},
	this.addEvaluatedTracks = async function () {
		//no-op (only relevant while a real capture/analyze pipeline is running)
	},
	this.clearDiscogsResult = async function () {
		discogsResult.state = constants.DISCOGS_RESULT_STATE_EMPTY;
		discogsResult.cd = {};
		discogsResult.info = "none";
		discogsResult.sideA = {};
		discogsResult.sideB = {};
		discogsResult.sideC = {};
		discogsResult.sideD = {};
		discogsResult.sideE = {};
		discogsResult.sideF = {};
		discogsResult.image = {};
		adjustRenameState.discTracks = 0
		adjustRenameState.current = 0
		adjustRenameState.process = false
		adjustRenameState.discSide = []
		adjustRenameState.userCheck = false
	},
	this.cleanRecDiscogs = async function () {
		clearDiscogsResult()
	},
	this.saveADrecords = async function (disc) {
		return false
	},
	this.getAnzImg = async function (dir) {
		return 0
	},
	this.checkADrecords = async function (title) {
		return false
	},
	this.updateDiscogsResult = async function () {
		return "ok"
	},
	this.retrieveImage = async function (upfile, target) {
		return "ok"
	},
	this.getImageFilesFromUser = async function (req, res) {
		if (res) res.render('pages/audioCapture', { pageInfo: pageInfo, settings: settings, silenceFacor: silenceFactor, recSide: recSide, page: "normal", storage: storage, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, audioInfo: progressInfo, discogs: discogsResult, recAD: recAD, userSave: adjustRenameState.userCheck, getPara: false, vol: settings.jackVolume, settings: settings })
	},
	this.convertImage = async function (f) {
		return f
	},
	this.setDiscogsImage = async function (num, img) {
		//no-op
	},
	this.setDiscogsResult = async function () {
		//no-op
	},
	this.getDiscogsHistory = async function () {
		//no-op (kept as a callable no-op for System diagnostics compatibility)
	},
	this.replaceU16Code = function (txt, hex, c) {
		return txt
	},
	this.doWav2Mp3 = async function (trackF, pfad) {
		//no-op
	},
	this.playADRecord = async function (res, title) {
		if (res) {
			res.render('pages/showADrecords', { pageInfo: pageInfo, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, basetracks: [], dir: 0, baseimages: "", settings: settings, indexStart: 0, vol: volumeAudioOut })
		}
	},
	this.checkDiscogsExist = function () {
		return false
	},
	this.checkDiscogsToken = async function (token) {
		return false
	},
	this.searchDiscogs = async function (res) {
		if (res) res.json({ success: false, error: "Discogs feature disabled in this BASIS build" });
	},
	this.discogsInput = async function (res) {
		if (res) res.render('pages/discogsInput', { settings: settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, discogsState: false })
	}
}
