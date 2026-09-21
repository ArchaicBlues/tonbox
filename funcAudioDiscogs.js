//https://www.discogs.com/developers/?msclkid=854756abb0b411ec9dfa1002c8a63b1c
//https://www.discogs.com/developers/
const { exec } = require('child_process');
const path = require('path');
fs = require('fs');
fsPromises = require('fs/promises')
require('./funcAudio.js')
const https = require('https');

const { exitCode } = require('process');

//global.discogsUserToken = ""//'IsAhxyaCkYQHZScaqOhChOmeTqTfzzdypWcnpUIA'
global.discogsResult = {
	"state": constants.DISCOGS_RESULT_STATE_EMPTY,
	"cd": {
	},
	"info": "none",
	"sideA": {
	},
	"sideB": {
	},
	"sideC": {
	},
	"sideD": {
	},
	"sideE": {
	},
	"sideF": {
	}
}
global.adjustRenameState = {
	discTracks:0,
	current:0,
	process:false,
	discSide:[],
	userCheck:false
}
global.updatePlattenschrank = true
global.discogsNewSearchTitle = ""
global.discogsSearchItem = { "Artist": "","Title": "","discType": ""}

async function titleDiscogsTrack(){
	try{
		if (Object.keys(discogsResult.info)){
			txt = await cleanFilename("",discogsResult.info)
			discogsResult.info = txt
		}

		if (Object.keys(discogsResult.sideA))
			var i=0; for (i in discogsResult.sideA){
				if (discogsResult.sideA[i]){
					var a = +i + 1
					if (!discogsResult.sideA[i].match("A"+a))
						discogsResult.sideA[i] = "A"+ a.toString()+"-"+discogsResult.sideA[i]
				}
			}
		if (Object.keys(discogsResult.sideB))
			var i=0; for (i in discogsResult.sideB){
				if (discogsResult.sideB[i]){
					var a = +i + 1
					if (!discogsResult.sideB[i].match("B"+a))
						discogsResult.sideB[i] = "B"+ a.toString()+"-"+discogsResult.sideB[i]
				}
			}
		if (Object.keys(discogsResult.sideC))
			var i=0; for (i in discogsResult.sideC){
				if (discogsResult.sideC[i]){
					var a = +i + 1
					if (!discogsResult.sideC[i].match("C"+a))
						discogsResult.sideC[i] = "C"+ a.toString()+"-"+discogsResult.sideC[i]
				}
			}
		if (Object.keys(discogsResult.sideD))
			var i=0; for (i in discogsResult.sideD){
				if (discogsResult.sideD[i]){
					var a = +i + 1
					if (!discogsResult.sideD[i].match("D"+a))
						discogsResult.sideD[i] = "D"+ a.toString()+"-"+discogsResult.sideD[i]
				}
			}
		if (Object.keys(discogsResult.sideE))
			var i=0; for (i in discogsResult.sideE){
				if (discogsResult.sideE[i]){
					var a = +i + 1
					if (!discogsResult.sideE[i].match("E"+a))
						discogsResult.sideE[i] = "D"+ a.toString()+"-"+discogsResult.sideE[i]
				}
			}
		if (Object.keys(discogsResult.sideF))
			var i=0; for (i in discogsResult.sideF){
				if (discogsResult.sideF[i]){
					var a = +i + 1
					if (!discogsResult.sideF[i].match("D"+a))
						discogsResult.sideF[i] = "D"+ a.toString()+"-"+discogsResult.sideF[i]
				}
			}
		}catch(err){
		console.log("titleDiscogsTrack:" + err)
	}
}


module.exports = function(required){
	this.discogsDone = async function (res){ 
		console.log("Discogs done")
		if (discogsSearchItem.discType.includes("Vinyl")){
			res.render('pages/discogsResult', {pageInfo:pageInfo,btDevice:bluez, 
				recording:getScheduledJobsWithoutTimeout(), 
				pState:procStatus, 
				discogs:discogsResult
			})
			return
		}
		else{ //cddvd
			if (maxCDtracks === undefined) {
				maxCDtracks = 0;
			}

			if (discogsResult.state.match("0")){
				cdInfo = {
					tracks: [{track:1,title: "Nothing found"}],
					images: ['/images/Tonbox.jpg'],
					discogsTitel: discogsSearchItem.Title
				}
				res.json(JSON.stringify(cdInfo))
				return
			}
			let imgArr = await execCmd("cd public;ls images/image*.jpg >&1; cd ..;")
			if (imgArr){
				imgArr = imgArr.split("\n"); imgArr.pop()
				const disc = Object.values(discogsResult.cd);
				cdInfo = {
					tracks: disc.map((title, index) => ({
						track: index + 1,
						title
					})),
					images:imgArr,
					discogsTitel:discogsSearchItem.Title
				}
			}
			if (cdInfo){
				//make each CD starting with track 1
				for (const t of cdInfo.tracks) {
					const m = t.title.match(/^(\d+)-(\d+)/);
					if (!m) continue;

					const disc  = Number(m[1]);
					const track = Number(m[2]);

					t.disc  = disc;
					t.track = track;
				}
			}
			res.json(JSON.stringify(cdInfo))
		}
	},
	this.initiateRecEnd = async function(msg){
		console.log(msg)
		await setAudioCaptureInfo(msg)

		console.log("initiateRecEnd..."+msg)
		SSEIntervalTyp = constants.SSE_NONE_CLEAR_INTERVAL
		clearInterval(adjustRenameState.intervalPtr)

		exec("sudo killall gramocli", (error, stdout, stderr) => {})
		procStatus.text = ""
		procStatus.stat = 0
	},
	this.reportKey = function(){
		return (alert(discogsConsumer))
	}
	this.GetDiscogsStatus = function (){
		return discogsStatus;
 	},
	this.SetDiscogsStatus = function (state){
		discogsStatus = state;
  	},
	this.saveTracknames = async function(info,from){
		if (discogsSearchItem.discType != "Vinyl"){
			for (i in info){
				discogsResult.cd[i]= info[i].position + " " + info[i].title
			}
			return
		}
		if (from === "discogs"){
			if (info[0].position.search("A") != -1){
				for (i in info){
					if (info[i].position.search("A") != -1)
						discogsResult.sideA[i]= info[i].title
					else if (info[i].position.search("B") != -1)
						discogsResult.sideB[i]= info[i].title
					else if (info[i].position.search("C") != -1)
						discogsResult.sideC[i]= info[i].title
					else if (info[i].position.search("D") != -1)
						discogsResult.sideD[i]= info[i].title
				}
			}
			else{
				if (info[i].position.search("1-") != -1){
					for (i in info){
						if (info[i].position.search("1-") != -1)
							discogsResult.sideA[i]= info[i].titel
						else if (info[i].position.search("2-") != -1)
							discogsResult.sideB[i]= info[i].title
						else if (info[i].position.search("3-") != -1)
							discogsResult.sideC[i]= info[i].title
						else if (info[i].position.search("4-") != -1)
							discogsResult.sideD[i]= info[i].title
					}
				}else 
					console.log("Error in saveTracknames()")
			}
		}else{
			if (from === "edit"){
				if (info.info) discogsResult.info = info.info
				Object.keys(info).forEach(key => {
					// Match things like A1, A2, B12, C3 ...
					const match = key.match(/^([A-F])(\d+)$/);
					if (!match) return;
					const sideLetter = match[1];   // A, B, C...
					const trackNumber = parseInt(match[2], 10) - 1; // 1 → index 0
					const sideName = "side" + sideLetter;
					// Ensure side exists
					if (!discogsResult[sideName]) {
						discogsResult[sideName] = {};
					}
					discogsResult[sideName][trackNumber] = info[key];
				});
			}else{
				if (from === "image")
					console.log("todo..")
			}
			await setDiscogsResult()
		}
		discogsResult.state = constants.DISCOGS_RESULT_STATE_EXIST
	},
	this.getDiscogsData = async function(res, searchResult) {
	try {
		const releaseUrl = `https://api.discogs.com/releases/${searchResult.id}`;
		const releaseResponse = await fetch(releaseUrl, {
			headers: {
				'User-Agent': 'ArchaicNodeEJS/1.0',
				'Authorization': `Discogs token=${settings.discogsUserToken}`
			}
		});
		if (!releaseResponse.ok) {
			const errorText = await releaseResponse.text();
			throw new Error(`Discogs release fetch failed: ${releaseResponse.status} ${releaseResponse.statusText} - ${errorText}`);
		}
		const releaseData = await releaseResponse.json();
		const tracks = releaseData.tracklist.filter(t => t.type_ === 'track');
		tracks.forEach(t => console.log(t.position, t.title));
		await saveTracknames(tracks,"discogs")
		await handleImages(releaseData)
		var txt = discogsSearchItem.Title
		txt = await await cleanFilenameNoPromise("", txt)
		txt = txt.split(" ").join("");
		discogsResult.info = txt     
				
		let files = await execCmd("ls public/images/*_*.jpeg >&1")
		files = files.split("\n"); files.pop()
		let renamed = files.map((_, index) => `image${index + 1}.jpg`);

		for (i=0; i<renamed.length; i++) {
			await execCmd("mv "+files[i]+ " public/images/"+renamed[i])
			discogsResult.image[i] = " public/images/"+renamed[i];
		}
		await setDiscogsResult()
		discogsDone(res);
		} catch (err) {
			console.error("Error fetching release data:", err);
			res.status(500).json({ error: "Failed to fetch Discogs release" });
		}
	},
	this.handleImages = async function(data){
		if (!data.images || !data.images.length) {
			console.log('No images available');
			return 0;
		}
		const baseDir = __dirname+"/public/images"
		exec("rm "+baseDir+"/*_*; rm "+baseDir+"/image*.jpg;rm "+baseDir+"/helpDB/*",(err, stdout, stderr) => {})
		//execCmd("rm "+baseDir+"/*_* || true; rm "+baseDir+"/image*.jpg || true;rm "+baseDir+"/helpDB/*" || true)
		console.log(`Downloading ${data.images.length} images…`);

		for (let i = 0; i < data.images.length; i++) {
			const img = data.images[i];
			const ext = path.extname(img.uri) || '.jpg';
			const filename = `${i}_${img.type}${ext}`;
			const target = path.join(baseDir, filename);

			try {
				await downloadImage(img.uri, target);
				console.log(`✔ ${filename}`);
			} catch (e) {
				console.warn(`✖ ${filename}:`, e);
			}
		}
	},
	this.downloadImage = function(url, targetPath) {
		return new Promise((resolve, reject) => {
			if (fs.existsSync(targetPath)) {
				return resolve('cached');
			}

			https.get(url, res => {
				if (res.statusCode !== 200) {
					return reject(`HTTP ${res.statusCode}`);
				}

				const file = fs.createWriteStream(targetPath);
				res.pipe(file);

				file.on('finish', () => file.close(resolve));
			}).on('error', reject);
		});
	},		
	//called from SSE Interval
	this.addEvaluatedTracks = async function(){
		try{
			//da die Ausgabe von gramocli bei kleiner "all.wav" Datei sehr schnell fertig sein kann, muss "addEvaluatedTracks()"
			//2mal durchlaufen werden...
			//Beispielausgabe gramocli: all.wav  all.wav.rms  all.wav.tracks  song01.wav song02.wav 
			//console.log("addEvaluatedTracks...")
			if (recAD.evaluatedState === constants.REC_START_ANALYZER) {			
				var stdout = await execCmd("cat ad/all.wav.tracks | grep number_of_tracks >&1")
				if (stdout){
					var dat = stdout.split("=")
					recAD.number_of_tracks = Number(dat[1])
					if (recAD.trackCount != recAD.number_of_tracks){
						await setAudioCaptureInfo(" - track count=".toString() + " not valid")
					}else
						await setAudioCaptureInfo(" "+ recAD.number_of_tracks.toString() + " tracks found: ok, extract songs - wait..")
					recAD.evaluatedState = constants.REC_WAV_TRACKS
					recAD.visu = 0
				}
			}
			else{
				if (recAD.evaluatedState === constants.REC_WAV_TRACKS) {
					var stdout = await execCmd("ls ad/song*.wav >&1")
					var dat = stdout.split("\n")
					dat.pop()
					var s = ""
					var i=0; for (i in dat) {
						//doppelte Anzeige vemeiden
						if (i == recAD.visu){
							s += (" " + dat[i])
							recAD.visu++
						}
					}
					await setAudioCaptureInfo(s)
					if (dat.length >= Number(recAD.number_of_tracks)){			
						//gramocli now done
						console.log(" first splitting done")
						//rename, wenn nur ein song detektiert worden ist
						if(dat[0]){
							if (dat[0].match("ad/song.wav"))
								exec("mv ad/song.wav ad/song01.wav", (error, stdout, stderr) => {})
						}
					}
				}
			}
		}
		catch(err){
			await setAudioCaptureInfo("addEvaluatedTracks:"+err)
		}
	},
	this.clearDiscogsResult = async function(){
		cdInfo = ""
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
		adjustRenameState.discTracks=0
		adjustRenameState.current=0
		adjustRenameState.process=false
		adjustRenameState.discSide=[]
		adjustRenameState.userCheck=false
	},
	this.cleanRecDiscogs = async function() {
		try{
			await execCmd("rm ad/*")
			clearDiscogsResult()
		}catch(err) { 
			console.log("cleanRecDiscogs " + err)
		}
	},
	// this.save2Audio = async function(){
	// 	try {
	// 		cmd = "rm ad/all.wav*; rm ad/song*; mv ad/*.wav " + devMusic +"/Audio/."
	// 		console.log(cmd)
	// 		await execCmd(cmd)
	// 		clearDiscogsResult()
	// 	}catch(err) {
	// 		console.log("save2Audio " + err)
	// 	}
	// },
	this.saveADrecords = async function(disc){
		adjustRenameState.userCheck = false
		console.log("save Music")
		if (discogsResult.info == "none"){
			console.log("discogsResult.info == none")
			procStatus.text = "saveADrecords discogsResult.info == none"
			return false
		}
		let cmd = ""
		let dir = await cleanFilename("",discogsResult.info)
		let path = devADrecords + "/" + dir
		try{
			var dirExist = await checkADrecords(dir)
			if (!dirExist){
				await execCmd("mkdir " + path)
			}
			var subdir = await execCmd("ls " + path + " >&1")
			if(subdir.length < 4){ //should be "audio image"
				if (subdir.length < 8) {
					await execCmd("mkdir " + path + "/audio")
					await execCmd("mkdir " + path + "/image")
				}
			}
			const typePath = path + "/type"
			try {
				const typeStat = await fsPromises.stat(typePath)
				if (typeStat.isDirectory()) {
					await fsPromises.rm(typePath, { recursive: true, force: true })
					await fsPromises.writeFile(typePath, recAD.type, "utf8")
				} else {
					await fsPromises.writeFile(typePath, recAD.type, "utf8")
				}
			} catch (typeErr) {
				if (typeErr && typeErr.code === "ENOENT") {
					await fsPromises.writeFile(typePath, recAD.type, "utf8")
				}
			}
			if(disc==="vinyl"){
				/* 
				ad/*.wav must exist 
				--> create dir in ADrecords (=disogsResult.info) + subdirs (audio, image)
				--> eventually convert to mp3
				--> move all ad/*.wav or ad/*.mp3 to subdir audio
				--> move max 4 discogsResult.image[i] to subdir image
				*/
				if (recAD.Format == "MP3") {
					await execCmd("rm -f ad_copy/*; mv ad/all.wav* ad_copy/.")
					f = await execCmd("ls ad/*.wav >&1")
					if (f){
						//MP3 Verschiebung in Plattenschrank über "lame"
						await doWav2Mp3(f,path)
						await execCmd("rm ad/*")
					}
				}
				else {
					await setAudioCaptureInfo(" - verschiebe WAV-Files in Plattenschrank...")
					cmd = "mv ad/all.wav* ad_copy/.; mv ad/*.wav " + path + "/audio/."
					console.log(cmd)
					await execCmd(cmd)
				}
				var img = await execCmd("ls " + path + "/image/ >&1")
				if(img.length < 7){ //should be "image1.jpg image2.jpg image3.jpg image4.jpg"
					if (discogsResult.image[0]){
						cmd = "cp " + discogsResult.image[0] + " " + path + "/image/.;"
						if (discogsResult.image[1]) cmd += "cp " + discogsResult.image[1] + " " + path + "/image/.;"
						if (discogsResult.image[2]) cmd += "cp " + discogsResult.image[2] + " " + path + "/image/.;"
						if (discogsResult.image[3]) cmd += "cp " + discogsResult.image[3] + " " + path + "/image/.;"
						console.log(cmd)
					}
					await execCmd(cmd)
				}
				recAD.medium="Disc" //if Process stops, visualize url "audioCapture", see funcSystem.js
				//initiateRecEnd(" in Plattenschrank verschoben")
				updatePlattenschrank = true
				return true
			}else{
				/* 
				*cdda.wav must be in ad/ 
				--> create dir in ADrecords (=disogsResult.info) + subdirs (audio, image)
				--> move all *cdda.wav to subdir audio
				--> escape various chars in cdInfo.tracks[].titel 
				--> rename all *cdda.wav to cdInfo.tracks[].titel
				--> move all discogsResult.image[i] to subdir image
				*/
				cdInfo.status = " move to vinyl store ..."
				// only move files >= 1 MB to avoid saving incomplete/stalled tracks
				const MIN_SIZE_BYTES = 1024 * 1024;
				const ripFiles = await execCmd("ls ad/*.cdda.wav >&1")
				const ripList = ripFiles ? ripFiles.split("\n").filter(f => f.trim()) : []
				for (const f of ripList) {
					try {
						const st = fs.statSync(f.trim())
						if (st.size >= MIN_SIZE_BYTES) {
							await execCmd("mv " + f.trim() + " " + path + "/audio/.")
							console.log("moved " + f.trim() + " (" + (st.size/1024/1024).toFixed(1) + " MB)")
						} else {
							console.log("skip small file " + f.trim() + " (" + st.size + " bytes)")
							await execCmd("rm -f " + f.trim())
						}
					} catch (statErr) {
						console.log("saveADrecords skip: " + f.trim() + " - " + statErr)
					}
				}
				let list = await execCmd("ls "+path+"/audio/ || true")
				list = list.split("\n"); list.pop()
				for (i in cdInfo.tracks){
					cdInfo.tracks[i].title = cdInfo.tracks[i].title.replace(" ", "-").replaceAll(" ", "");
					cdInfo.tracks[i].title = escapeTrack(cdInfo.tracks[i].title)
				}
				let n = 0
				for(i in list){	
					if (list[i].match("cdda.")){
						cmd = "mv "+path+'/audio/'+list[i]+" "+path+"/audio/"+cdInfo.tracks[n++].title+".wav"
						console.log(cmd)			
						await execCmd(cmd)
					}
				}
				cmd = ""
				for (i in discogsResult.image){
					cmd += "cp " + discogsResult.image[i] + " " + path + "/image/.;"
				}
				console.log(cmd)
				await execCmd(cmd)
				await execCmd("mv "+ discogsResult.image[i] + " public/images/helpDB/" + path + "/image/.;")
				await generateCoverImg("")
				return true
			}
		}catch(err) {
			cdInfo.status = " " + err
			procStatus.text = err
			//initiateRecEnd("!" + err)
			procStatus.text = err
			return false
		}
	},
	this.getAnzImg = async function(dir){
		var cmd = "ls "+devADrecords + "/" + dir + "/image/ >&1"
		let anzImg = await execCmd(cmd)
		anzImg = anzImg.split("\n")
		return anzImg.length
	},
	this.checkADrecords = function (title){
		return new Promise((resolve, reject) => {
			var cmd = "ls " + devADrecords + " >&1"
			exec(cmd, (error, stdout, stderr) => {
				if (stdout){
					let dir = stdout.split("\n")
					dir.pop()
					var i=0; for (i in dir){
						if (dir[i].match(title)){
							resolve(true)
							break;
						}
					}
					resolve(false)
				}else
					resolve(false)
			})
		})
	},
	this.updateDiscogsResult = function(){
		return new Promise((resolve, reject) => {
			exec("ls public/images/image* >&1", (error, stdout, stderr) => {
				var imageFiles = stdout.split("\n")
				imageFiles.pop()
				var i=0; for (i in imageFiles){
					if (imageFiles[i]) discogsResult.image[i] = "public/images/image"+(i+1)+".jpg"
				}
				resolve("ok")
			})
		})
	},
	this.retrieveImage = function(upfile,target){
		return new Promise((resolve,reject) => {
			upfile.mv(target,(err => {
                if (err) console.log("uploaded file1 failed")
                else {
                    console.log("upload 1 ok")
                }
				resolve("ok")
			}))		
		})
	},
	this.getImageFilesFromUser = async function(req,res){
		const files = req.files;
		if (!files || files.length === 0) {
			const result = await execCmd("ls public/images/image*.jpg")
			if (!result) procStatus.text = "Please load at least one image !"
				res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus,audioInfo:progressInfo,discogs:discogsResult, recAD: recAD, userSave:adjustRenameState.userCheck, getPara: false,  vol:settings.jackVolume, settings:settings})
			return
		}

		await execCmd("rm -rf public/images/image*.jpg;rm -rf public/images/image*.jpeg")
		console.log("request files..")
        var uploadDir = settings.installDir + "/ArchaicNodeEJS/upload/"
        var upfile, updest, newName
		let list = Object.keys(discogsResult.image)
		for (i in list) delete discogsResult.image[list[i]]
		//await execCmd("rm -rf public/images/image1.jpg;rm -rf public/images/image2.jpg;rm -rf public/images/image3.jpg;rm -rf public/images/image4.jpg;")
		try{
			if (req.files.upfile1){
				upfile = req.files.upfile1
				updest = uploadDir + upfile.name
				await retrieveImage(upfile,updest)
				newName = await convertImage(updest)
				await setDiscogsImage(0,newName)
			}

			if (req.files.upfile2){
				upfile = req.files.upfile2
				updest = uploadDir + upfile.name
				await retrieveImage(upfile,updest)
				newName = await convertImage(updest)
				await setDiscogsImage(1,newName)
			}

			if (req.files.upfile3){
				upfile = req.files.upfile3
				updest = uploadDir + upfile.name
				await retrieveImage(upfile,updest)
				newName = await convertImage(updest)
				await setDiscogsImage(2,newName)
			}

			if (req.files.upfile4){
				upfile = req.files.upfile4
				updest = uploadDir + upfile.name
				await retrieveImage(upfile,updest)
				newName = await convertImage(updest)
				await setDiscogsImage(3,newName)
			}
	        await saveTracknames(req.body,"edit")
			res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus,audioInfo:progressInfo,discogs:discogsResult, recAD: recAD, userSave:adjustRenameState.userCheck, getPara: false,  vol:settings.jackVolume, settings:settings})
		}catch(err){
			console.log(err)
			res.render('pages/audioCapture', {pageInfo:pageInfo,settings:settings,silenceFacor:silenceFactor, recSide:recSide, page:"normal", storage:storage, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus,audioInfo:progressInfo,discogs:discogsResult, recAD: recAD, userSave:adjustRenameState.userCheck, getPara: false,  vol:settings.jackVolume, settings:settings})
		}
	},
	this.convertImage = async function(f){
		let fn = f.split(".")
		if (!f.match(".JPG") || !f.match(".jpg")){
			var cmd = "convert "+f+" "+fn[0]+".jpg"
			console.log(cmd)
			await execCmd(cmd)
			//img = rnimg[0]+".jpg"
		}else{
			if (f.match(".JPG")){
				var cmd = "mv "+f+" "+fn[0]+".jpg"
				console.log(cmd)
				await execCmd(cmd)
			}
		}
		return fn[0]+".jpg"
	},
	this.setDiscogsImage = async function (num,img){
		let rnimg = img.split(".")
			if (num > 3){
				//max 4 images
				console.log("discogsResult.image.length=" + discogsResult.image.length)
				return
			}
			//rename, move to public/images, set discogsResult.image
			let i = num+1
			let n = String(i)
			cmd = "mv " + img + " public/images/image"+n+".jpg"
			console.log(cmd)
			await execCmd(cmd)
			if ((n>=0) && (n<4))
				discogsResult.image[num]="public/images/image"+n+".jpg"
	},
	this.setDiscogsResult = async function(){
		try{
			await execCmd("cd public/images/ && i=1; \
				for f in *_*.jpeg; \
				do mv \"\$f\" \"image\$i.jpg\"; \
				i=$((i+1)); done; cd ../..;")
			await execCmd("rm -rf public/images/*_.jpeg")
			//Reihenfolge einhalten: Tracks werden mit vorangestellten A1..,A2..,A3 für Seite A etc. neu betitelt
			discogsResult.state = constants.DISCOGS_RESULT_STATE_EXIST
			titleDiscogsTrack()
			var data = JSON.stringify(discogsResult)
			await fs.writeFileSync('help/discogs.txt', data);
		}catch(err){
			console.log("setDiscogsResult " + err);
		}
	},
	this.getDiscogsHistory = async function(){
		try{
			let dat = await fsPromises.readFile('help/discogs.txt','utf8')
			if (dat.length > 3){
				discogsResult = JSON.parse(dat)
			}
		}catch(err){
			console.log("getDiscogsHistory " + err)
		}
	},
	this.replaceU16Code = function (txt,hex,c){
		var p = txt.search(String.fromCodePoint(hex))
		if (p>0)
		{
			txt = txt.substr(0,p-1) + c + txt.substr(p+1,txt.length)
		}
		return txt 
	},
	this.doWav2Mp3 = function (trackF,pfad){
		//alle ad/*.wav files in ad/*.mp3 umwandeln
		return new Promise((resolve, reject) => {
			setAudioCaptureInfo("..start compression MP3 192 kbit/s und verschiebe in Plattenschrank")
			let tracks = trackF.split("\n")
			tracks.pop()
			var cmd = "";
			for (i in tracks){
				if (tracks[i] != "ad/all.wav"){
					cmd = "lame -b 320 --disptime 2 --nohist " + tracks[i] + " --out-dir " + pfad + "/Audio/"
					console.log(cmd)
					exec(cmd, (error, stdout, stderr) => {
						if (error){
							console.log("lame error, " + error)
							reject(error)
						}
						if (i >= tracks.length-1)
							resolve()
					})
				}
			}

		})
	},
	// this.showSearchADrecords = async function(res,search){
	// 	console.log(allTracks)
	// 	showMusicAD(res, search)
	// },
	this.playADRecord = async function (res,title){
		try{
            //play mit selektierterm MP3-Song und play alle anderen im Alphabet danach
            let index=0;
			for (i in allTracks){
				if (allTracks[i] === title){
					trackIndex = i;
					break;
				}
			}
			console.log("found at pos " + trackIndex + ", " + title)
            musicDir = devADrecords
            if (settings.mediaOut.length == 1) {
                trackState = "done"
				//procStatus.marquee = "";//rememberDB + " " + title

                res.render('pages/showADrecords',{pageInfo:pageInfo, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:allTracks, dir:0, baseimages:"",settings:settings,indexStart:trackIndex,vol:volumeAudioOut, })
                playTrack2AudioJack("start")
                return
            }
            else {
                trackState = "done"
                res.render('pages/showADrecords',{pageInfo:pageInfo, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:allTracks, dir:0, baseimages:allCovers,settings:settings,indexStart:trackIndex,vol:volumeAudioOut, })
                return
            }
		}
		catch(err){
			console.log(err)
			res.render('pages/showADrecords',{pageInfo:pageInfo, btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, basetracks:allTracks, dir:0, baseimages:allCovers,settings:settings,indexStart:trackIndex,vol:volumeAudioOut, })
		}
	},
	this.checkDiscogsExist = function(){
		//check if already present
		let strInfo = discogsSearchItem.Artist + " " + discogsSearchItem.Title;
		strInfo = strInfo.toLowerCase()
		if (strInfo.length > 5){
			strInfo = strInfo.split(" ")
			for (i in strInfo){
				if (!strInfo[i].match(discogsResult.info.toLowerCase())) 
					return false;
			}
			return true;
		}
	},
	this.checkDiscogsToken = async function (token) {
		try {
			const response = await fetch('https://api.discogs.com/oauth/identity', {
			headers: {
				'Authorization': `Discogs token=${token}`,
				'User-Agent': 'MyApp/1.0'
			}
			});
			if (!response.ok) 
				return false;
			const data = await response.json();
			console.log("Token gültig ✅ User:", data.username);
			return true;

		} catch (err) {
			console.error("Fehler:", err.message);
			return false;
		}
	},
	this.searchDiscogs = async function(res){
		try {
			let data = null
			if (!checkDiscogsExist()){
					
				await clearDiscogsResult()
				await execCmd("rm -f public/image/image*.jpg")

				const buildParams = (withFormat) => {
					const params = {
						q: discogsSearchItem.Artist + " " + discogsSearchItem.Title,
						type: "release",
						per_page: 100,
						token: settings.discogsUserToken
					};
					// Only pass format filter for Vinyl; CD filtering is unreliable in Discogs
					// (releases may be listed as "Album", "Comp", "CDr" etc. instead of "CD")
					if (withFormat && discogsSearchItem.discType && discogsSearchItem.discType === "Vinyl") {
						params.format = discogsSearchItem.discType;
					}
					return params;
				};

				const doSearch = async (withFormat) => {
					const url = new URL("https://api.discogs.com/database/search");
					url.search = new URLSearchParams(buildParams(withFormat));
					console.log(url.toString());
					const response = await fetch(url, {
						headers: { 'User-Agent': 'ArchaicNodeEJS/1.0' }
					});
					return await response.json();
				};

				data = await doSearch(true);

				// Fallback: retry without format filter if nothing returned
				if (!data || !Array.isArray(data.results) || data.results.length === 0) {
					console.log("searchDiscogs: no results with format filter, retrying without...");
					data = await doSearch(false);
				}

				if (!data || !Array.isArray(data.results) || data.results.length === 0) {
					console.log("no data")
					procStatus.text = "No data found for " + discogsSearchItem.Artist + " " + discogsSearchItem.Title
					discogsDone(res);
					return
				}
			}
			if (!data || !Array.isArray(data.results)) {
				// checkDiscogsExist() returned true but data was never fetched — use existing result
				discogsDone(res);
				return
			}
			let searchStrings = discogsSearchItem.Artist + " " + discogsSearchItem.Title
			searchStrings = discogsSearchItem.Title.split(" ");	
			let allMatch = false
			let result2 = ""
			for (const result of data.results) {
				let match = 0;
				for (const str of searchStrings) {
					//console.log(result.title)
					if (result.title.toLowerCase().includes(str.toLowerCase())) {
						if (++match >= (searchStrings.length)){
							allMatch = true
							//wenn über formats "CD" nichts gefunden wird, dann "Vinyl übernehmen
							if (discogsSearchItem.discType != "Vinyl") {
								//wir wollen "CD"
								if (result.format.includes("Vinyl")) {
									result2 = result //wenn "CD" Format nicht vorhanden dann result 2...
								}else {
									result2 = result
									break;
								}
							}else{		
								//Vinyl wurde gesucht, dann result übernehmen	
								result2 = result
								break;
							}
						}
					}
				}
			}
			if (allMatch){
				console.log({
					id: result2.id,
					title: result2.title,
					year: result2.year,
					format: result2.format
				});
				discogsSearchItem.Title = result2.title
				await getDiscogsData(res, result2)		
				return
			}
			await execCmd("rm "+__dirname+"/public/images/*_*;\
				rm "+__dirname+"/public/images/image*.jpg;\
				rm "+__dirname+"/public/images/helpDB/*")
			discogsDone(res);
		} catch (error) {
			console.error('Error fetching data from Discogs API:', error);
			procStatus.text = "Please check Discogs User Token in SYSTEM"
			discogsDone(res);
		}
	},
	this.discogsInput = async function(res){
    	result = await checkDiscogsToken(settings.discogsUserToken)
		//result = false
    	res.render('pages/discogsInput', { settings:settings, btDevice: bluez, recording: getScheduledJobsWithoutTimeout(), pState: procStatus, discogsState:result})
  }

}