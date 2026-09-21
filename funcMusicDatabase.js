//https://www.discogs.com/developers/?msclkid=854756abb0b411ec9dfa1002c8a63b1c

const { exec } = require('child_process');
fs = require('fs');
const path = require('path');
require('./funcAudio.js');
require('./funcsystem.js');
//Equalizer
require('./funcEqualizer')();
global.allCovers = []
const DEFAULT_AD_TYPE = "33rpm";

async function ensureRecordType(title) {
	const typeFile = path.join(devADrecords, title, "type");
	try {
		const stat = await fs.promises.stat(typeFile);
		if (stat.isDirectory()) {
			await fs.promises.rm(typeFile, { recursive: true, force: true });
			await fs.promises.writeFile(typeFile, DEFAULT_AD_TYPE, 'utf8');
			return DEFAULT_AD_TYPE;
		}
		const savedType = (await fs.promises.readFile(typeFile, 'utf8')).trim();
		const normalized = savedType.replace(/^(33|45|78)RPM$/i, (_, n) => n + 'rpm');
		return normalized || DEFAULT_AD_TYPE;
	}
	catch (err) {
		if (err && err.code === 'ENOENT') {
			await fs.promises.writeFile(typeFile, DEFAULT_AD_TYPE, 'utf8');
			return DEFAULT_AD_TYPE;
		}
		throw err;
	}
}


// async function GetCover(){
// 	try{
// 		var cmd = "rm images/helpDB/coverImg*; ls "+devADrecords+"/ADrecords/ >&1"
// 		var stdout = await execCmd(cmd)
// 		allCovers = stdout.split("\n");
// 		if (allCovers.length > 1) 
// 			allCovers.pop()
// 		procStatus.text = ""
// 	}
// 	catch(err) {
// 		procStatus.text += allCovers[i] + ":" + err + " - "; 
// 		console.log(allCovers[i] + ":" + err)
// 	}
// }


module.exports = function(required){
	this.showMusicAD = async function(res,search) {
		try{
			var imgData = await execCmd("ls public/images/helpDB/coverImg* || true")
			imgData = imgData.split("\n")
			imgData.pop()
			if (imgData.length == 0) {
				await generateCoverImg("") 
				imgData = await execCmd("ls public/images/helpDB/coverImg* || true")
				imgData = imgData.split("\n");	imgData.pop()
			}
			//list by name
			var data = await execCmd("ls -1 " + devADrecords + " | sort ")
			allTracks.length = 0
			allCovers.length = 0
			data = data.split("\n");
			data.pop()
			const recordItems = []
			if (imgData.length != data.length) {
				await generateCoverImg("")
				imgData = await execCmd("ls public/images/helpDB/coverImg* || true")
				imgData = imgData.split("\n"); imgData.pop()
			}
			if (imgData.length == data.length){
				var n = 0
				if (search){
					for (var i=0; i<data.length; i++){
						if (data[i].match(search)) {
							const type = await ensureRecordType(data[i])
							allTracks[n] = data[i]
							allCovers[n] = imgData[i]
							recordItems[n] = { title: data[i], type: type }
							n++
						}
					}
				}else{
					for (var i=0; i<data.length; i++){
						const type = await ensureRecordType(data[i])
						allTracks[n] = data[i]
						allCovers[n] = imgData[i]
						recordItems[n] = { title: data[i], type: type }
						n++
					}
				}
			}else
				procStatus.text = "Array mismatch in showMusicAD()"

			res.render('pages/showADrecords',{
				pageInfo:pageInfo, 
				btDevice:bluez, 
				recording:getScheduledJobsWithoutTimeout(), 
				pState:procStatus, 
				basetracks:allTracks, 
				dir:1, 
				baseimages:"", 
				recordItems:recordItems,
				settings:settings, 
				indexStart:0,
				vol:volumeAudioOut,
			}) 
		}
		catch(err){
			console.log(err)
			procStatus.text = "showMusicAD: " + err
			setInitialPage(res)
		}
	},
	this.selectMusicDBtrack = async function(dir, res, index) {
	//	procStatus.marquee = ""
		// Verzeichnis wenn index = -1, sonst allTracks[index]
		rememberDB="showADrecords/"+dir
		try{
			let cmd = "ls " + devADrecords  + "/" + dir + "/audio/ >&1"
			let all = await execCmd(cmd)
			allTracks = all.split("\n");
			allTracks.pop()

			all = await execCmd("ls " + devADrecords  + "/" + dir + "/image/ >&1")
			allCovers = all.split("\n");
			allCovers.pop()

			cmd = "cp " + devADrecords  + "/" + dir + "/image/image*.jpg " + settings.installDir + "/ArchaicNodeEJS/public/images/helpDB/."
			await execCmd(cmd)
			res.render('pages/showADrecords',{pageInfo:pageInfo, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:allTracks, dir:0, baseimages:allCovers,settings:settings,indexStart:index,vol:volumeAudioOut,})
			await execCmd("rm upload/* 2>/dev/null")
		}
		catch(err){
			procStatus.text = "selectMusicDBtrack: " + err;
			console.log(procStatus.text)
			res.render('pages/showADrecords',{pageInfo:pageInfo, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:allTracks, dir:0, baseimages:allCovers,settings:settings,indexStart:index,vol:volumeAudioOut,})
		}
	},
	this.killProc = function(proc) {
		return new Promise((resolve, reject) => {
			exec("pgrep -x " + proc + " >&1", (error, stdout, stderr) => {
				if (error || stderr) {
					//console.log("killProc " + proc + " " + error + " " + stderr)
					resolve("ok")//resolve anyway
				}
				else {
					data = stdout.split("\n")
					data.pop()
					var i=0; for (i in data){
						exec("sudo kill " + data[i], (error, stdout, stderr) => {
							if (error || stderr) console.log(error + " " + stderr)
							else console.log("pid " + data + " killed");
						})
					}
					resolve("ok")
				}
			}) 
		})
	}
}