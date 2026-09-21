//DUMMY MODULE: Vinyl/CD "record shelf" library browsing has been reduced to a
//no-op stub as part of the BASIS build. The page still renders, but no real
//filesystem scan / cover generation / process killing happens anymore.

module.exports = function (required) {
	this.showMusicAD = async function (res, search) {
		res.render('pages/showADrecords', {
			pageInfo: pageInfo,
			btDevice: bluez,
			recording: getScheduledJobsWithoutTimeout(),
			pState: procStatus,
			basetracks: [],
			dir: 1,
			baseimages: "",
			recordItems: [],
			settings: settings,
			indexStart: 0,
			vol: volumeAudioOut,
		})
	},
	this.selectMusicDBtrack = async function (dir, res, index) {
		res.render('pages/showADrecords', {
			pageInfo: pageInfo,
			btDevice: bluez,
			recording: getScheduledJobsWithoutTimeout(),
			pState: procStatus,
			basetracks: [],
			dir: 0,
			baseimages: [],
			settings: settings,
			indexStart: index,
			vol: volumeAudioOut,
		})
	},
	this.killProc = function (proc) {
		return Promise.resolve("ok")
	}
}
