const { exec, spawn } = require('child_process');
const fsPromises = require('fs/promises');
const fs = require ('fs');;
global.fnames = ""
global.pwPlay = false
filterGraph = {  
  preamp:"-6.0",
  "graph" : [
    {label:"bq_low_shelf",Fc:"40.0", Q:"0.7",Gain:"6.0"}, //1
    {label:"bq_peaking",Fc:"121.0",Q:"0.7",Gain:"4.0"},
    {label:"bq_peaking",Fc:"547.0",Q:"2.10",Gain:"-7.2"},
    {label:"bq_peaking",Fc:"674.0",Q:"0.72",Gain:"-7.2"},//4
    {label:"bq_peaking",Fc:"818.0",Q:"2.82",Gain:"-4.8"},
    {label:"bq_peaking",Fc:"1503.0",Q:"1.64",Gain:"4.0"},//7
    {label:"bq_peaking",Fc:"1605.0",Q:"4.95",Gain:"0.4"},
    {label:"bq_peaking",Fc:"1722",Q:"2.75",Gain:"2.5"},
    {label:"bq_peaking",Fc:"4160.0",Q:"1.62",Gain:"3.0"},
    {label:"bq_highshelf",Fc:"12000",Q:"0.7",Gain:"-3.2"},//10
]}

//https://docs.pipewire.org/page_module_filter_chain.html


function spawnAsync(cmd, args = []) {
  console.log(cmd+" "+ args)
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}



module.exports = async function(required){
  this.setVolumeSettings = async function (value){
    console.log("setVolumeSettings="+value)
    settings.jackVolume = value
    await writeSettings()
  },
  this.getVolume = function (res){
    console.log("getVolume="+settings.jackVolume)
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(settings.jackVolume), 'utf-8');
  },
  this.submitFilter = async function(filter){
    console.log("submitFilter:(" + filter +")")
    let old = settings.filterIndex;
    if (filter.match("Clear") && settings.filterIndex != "0") settings.filterIndex = "0"; else
    if (filter.match("Neutral") && settings.filterIndex != "1") settings.filterIndex = "1"; else
    if (filter.match("Warm") && settings.filterIndex != "2") settings.filterIndex = "2"; else 
    if (filter.match("Bass") && settings.filterIndex != "3") settings.filterIndex = "3"; else 
    if (filter.match("MyEQ") && settings.filterIndex != "4") settings.filterIndex = "4"; 
    if (old === settings.filterIndex)
      return
    await writeSettings()
    let raw = await fsPromises.readFile("filter/eqSlider.json","utf8")
    dat = JSON.parse(raw)
    dat.preset = Number(settings.filterIndex)
    await fsPromises.writeFile("filter/eqSlider.json",JSON.stringify(dat,null,2),"utf8")

    
    try{
      var f = escapeTrack(filter)
      var cmd = "cat filter/" + f + ".txt >&1"
      //console.log(cmd)
      var f = await execCmd(cmd)
      f = f.split("\n"); 
      if (!f[f.length-1])
        f.pop()
      var i=0; var e=""
      for (i in f){
        e = f[i].split(" ")
        if (i==0) filterGraph.preamp = e[1] 
        else {
          filterGraph.graph[i-1].bq_peaking = e[3]
          filterGraph.graph[i-1].Fc = e[5]
          filterGraph.graph[i-1].Q = e[11]
          filterGraph.graph[i-1].Gain = e[8]
        }
      }
      var equObj = await execCmd('wpctl status | grep "Equalizer Tonbox Sink" >&1')
      console.log(equObj)
      equObj = equObj.split(".")
      var objID = equObj[0].split(" ")
      //console.log("Equalizer objID: "+objID[objID.length-1])
      for (var i=1; i<=10; i++){
        var cmd = 'pw-cli s '+objID[objID.length-1]+' Props \'{params=["eq_band_'+i+':Gain"'+' '+filterGraph.graph[i-1].Gain+']}\''
        //console.log(cmd)
        await execCmd(cmd)
        await new Promise(r => setTimeout(r, 100));
      }
      //save /home/pi/.config/pipewire/pipewire.conf.d/tonboxFilter.conf for next power on
      await buildFilterConf() 

      if (filter.match("Clear")) settings.filterIndex = "0"
      else if (filter.match("Neutral")) settings.filterIndex = "1"
      else if (filter.match("Warm")) settings.filterIndex = "2"
      else if (filter.match("Bass")) settings.filterIndex = "3"
      else if (filter.match("MyEQ")) settings.filterIndex = "4"
      //await writeSettings()
    }
    catch(err){
      console.log(err)
    }
  },
  this.buildFilterConf = async function(){
    try{
      var filterconf = await execCmd("cat /home/pi/.config/pipewire/pipewire.conf.d/tonboxFilter.conf >&1")
      filterconf = filterconf.split("type  = builtin")
      var p = filterconf[0].split("\n")
      var strfilter = filterconf[0]//+"\n"
      //console.log(strfilter)

      //preamp
      var eq = filterconf[1].split("\n")
      eq[0] ="type  = builtin"
      var a = eq[3].indexOf("Gain")
      var b = eq[3].indexOf("}")
      var s = eq[3].slice(a-1,b+1)
      var s1 = "\"Gain\" = " + filterGraph.preamp + " }"
      eq[3] = eq[3].replace(s,s1)
      for (i in eq) {
        if (i == eq.length-1) strfilter += eq[i]
        else strfilter += eq[i]+"\n"
      }

      //eq1..eq10
      for (var n=2; n < filterconf.length; n++){
        eq = filterconf[n].split("\n")
        eq[0] ="type  = builtin"
        a = eq[3].indexOf("Gain")
        b = eq[3].indexOf("}")
        s = eq[3].slice(a-1,b+1)
        s1 = "\"Gain\" = " + filterGraph.graph[n-2].Gain + " }"
        eq[3] = eq[3].replace(s,s1)
        var i = 0
        for (i in eq) {
          if (i == eq.length-1) strfilter += eq[i]
          else strfilter += eq[i]+"\n"
        }
      }      
      await fs.writeFileSync('/home/pi/.config/pipewire/pipewire.conf.d/tonboxFilter.conf', strfilter)
    }
    catch(err){
      console.log(err)
    }    
  },
  this.showPage = function(b, res){
    console.log(b)
    if (b.match("Audio")){
      showMusicDir(rememberDB, res)
      return
    }
    else if(b.match("Favorites")) {
      loadRadioHistory(res)
      return
    }
    else if (b.match("Radio")){
      res.render('pages/radioStation', {pageInfo:pageInfo,
            dat: stationCount, search:radioUserSearch, rd:radioFound,
            btDevice: bluez, recording: getScheduledJobsWithoutTimeout(),
            pState: procStatus, rec: getRadioRec(),
            settings:settings,
            vol: volumeAudioOut,
            settings:settings,
            play: radioPlayIndex,
      });
      return
    }
    else if (b.match("Vinyl")) {
      showMusicAD(res, "")
      return
    }
    else setInitialPage(res)
  },
  this.setReverb = async function(body, res){
    trackIndex-- //see pw-play trackState = "done", (die gleiche Musik nochmal)
    try{
      //let conv = await execCmd("pw-link -l | grep conv >&1")
      let b = JSON.stringify(body)
      b = b.replace("{", ""); b = b.replace("}", "")
      if (b.match("on")){
          if (settings.reverb === "on"){
              console.log("already on")
              res.json({ success: true, reverb: settings.reverb });
              return
          } else {
            console.log("turn reverb on")
            if (!settings.mediaOut.match("HTTP")){
              try{
                await execCmd("pkill -f pw-play");
              }catch(e){}
            }
            await execCmd("bashScript/./conv.sh on")
            settings.reverb = "on"
          }
      }
      else{
          if (settings.reverb === "off"){
              console.log("already off")
              res.json({ success: true, reverb: settings.reverb });
              settings.reverb = "off"
              return
          } else {
            console.log("turn reverb off")
            if (!settings.mediaOut.match("HTTP")){
              try{
                await execCmd("pkill -f pw-play");
              }catch(e){}
            }
            await execCmd("bashScript/./conv.sh off")
            settings.reverb = "off"
          }
      }
      //await stopMusicPlay(constants.AUDIO_ALL)
      await execCmd("systemctl --user restart pipewire")
      res.json({ success: true, reverb: settings.reverb });
      await writeSettings()
    }
    catch(err){
      console.log("reverb:"+err)
      procStatus.text = "reverb:"+err
      if (!res.headersSent) res.json({ success: false, reverb: settings.reverb });
    }
  },
  this.setEqualizerFilter = function (eq){
    //audioWeb.js --> GET /eq --> setEqualizerFilter
    //Slider hat x=0..100, 0..50 soll -9..0 dB und 50..100 soll 0..+9 dB
    e = eq.split("=")
    var n = parseFloat(e[1])
    n = this.sliderValtoGain(n)
    //change filtergraph
    var val = n.toString()
    eqX = e[0].split("/eq")
    filterGraph.graph[eqX[1]-1].Gain = val
    console.log("SliderNum=" + eqX[1] + ", Wert="+val)
    modifyFilterOnTheFly(eqX[1],val)
  },
  this.modifyFilterOnTheFly = async function (sliderNum,gain){
    try{
      // get object id of equalizer
      var equObj = await execCmd('wpctl status | grep "Equalizer Tonbox Sink" >&1')
      console.log(equObj)
      equObj = equObj.split(".")
      var objID = equObj[0].split(" ")
      //console.log("Equalizer objID: "+objID[objID.length-1])
      //change gain on the fly
      var cmd = 'pw-cli s '+objID[objID.length-1]+' Props \'{params=["eq_band_'+sliderNum+':Gain"'+' '+gain+']}\''
      console.log(cmd)
      await execCmd(cmd)

    }
    catch(err){
      console.log(err)
    }
  },
  this.sliderValtoGain = function(n){
      //-9db..+9dB
      if (n > 50) {
        n = n-50; 
        n = n*9/50
      }else{
        n = n*9/50
        n = -9 + n
      }
      return(n)
  },
  this.gainToSliderVal = function(n){
    let y = 50/9
    y = y.toFixed(2)
    if (n > 0) y = 50 + y * n
    else  y = 50 + (y * n) 
    y = parseInt(y)
    return(y)
  }

  this.saveFilter = async function (eqData){
    try{
    //settings.filterIndex = "4"; 
    //await writeSettings()
      await fs.writeFileSync('filter/eqSlider.json', eqData)
      var eqSlider = JSON.parse(eqData)
      //Slidereinstellungen in MyEQ.txt übertragen
      var cmd = "cat filter/MyEQ.txt >&1"
      var newF = await execCmd(cmd)
      if (!newF) {
        procStatus.text = "MyEQ.txt not found!"
        console.log(procStatus.text)
        return
      }
      newF = newF.split("\n"); 
      if (!newF[newF.length-1]) 
        newF.pop()
      var ftxt = newF[0]
      var i = 0
      var gain = 0.0;
      for(i in newF){
        if (i != 0){
          ftxt+="\n"
          var filter = newF[i].split(" ")
          switch(i){
            case "1":
            gain = await sliderValtoGain(eqSlider.f40Hz[4])
            break;
            case "2":
            gain = await sliderValtoGain(eqSlider.f121Hz[4])
            break;
            case "3":
            gain = await sliderValtoGain(eqSlider.f547Hz[4])
            break;
            case "4":
            gain = await sliderValtoGain(eqSlider.f674Hz[4])
            break;
            case "5":
            gain = await sliderValtoGain(eqSlider.f818Hz[4])
            break;
            case "6":
            gain = await sliderValtoGain(eqSlider.f1503Hz[4])
            break;
            case "7":
            gain = await sliderValtoGain(eqSlider.f1605Hz[4])
            break;
            case "8":
            gain = await sliderValtoGain(eqSlider.f1722Hz[4])
            break;
            case "9":
            gain = await sliderValtoGain(eqSlider.f4160Hz[4])
            break;
            case "10":
            gain = await sliderValtoGain(eqSlider.f12000Hz[4])
            break;
          } 
          filterGraph.graph[i-1].Gain = gain 
          filter[8]=gain; 
          for (x=0; x<=11; x++) ftxt+=filter[x]+" "
        }
      }
      //console.log(ftxt)
      await fs.writeFileSync("filter/MyEQ.txt", ftxt)
      //eqSlider.json wird mit jeder page die Eq hat geholt, dewegen hier update:
      //await createEqSliderJson()
    }
    catch(err){
      console.log(err)
    }
  },

  this.sliderGain = function(){
    //clone JSON
    var sliderGain = JSON.parse(JSON.stringify(filterGraph))
    for (i in sliderGain.graph) {
      var val = parseFloat(filterGraph.graph[i].Gain)
      val = val * 10.0
      var str = val.toString()
      sliderGain.graph[i].Gain = str
    }
    return sliderGain
  },
  this.pipewireAudioInit = async function(){
    killplayAux()
    if (!settings.mediaOut) return
    if (settings.mediaOut.match("HTTP")) {
      await stopMusicPlay(constants.AUDIO_PW)
      return
    }
    try{
      var eq = "";
      var result = ""

      // //wpctl settings hier für effect_output.eq10 funktioniert nicht
      // d.h. pw-play spielt immer auf HAT-DAC, wenn vorhanden!

      result = await execCmd("wpctl status | grep 'Equalizer Tonbox Sink' >&1")
      if (result){
        result = result.split(". Equalizer Tonbox Sink")
        eq = result[0].slice(-2,result[0].length)
      }
      console.log("eq Object ID = "+ eq )//+ ", au ID = " + au + ", au2 ID =" + au2)
      //Equalizer immer setzen wenn vorhanden
      if (eq){
        await execCmd("wpctl set-default " + eq)
        console.log("pipewireAudioInit: wpctl set-default " + eq)
 
        pwPlay = true
      }else 
        pwPlay = false
      // cmd = "pamixer --set-volume " + parseInt(75+settings.jackVolume*0.15)
      // console.log(cmd)
      // await execCmd(cmd) 
    }catch(err){
      console.log(err)
      procStatus.text += "; catch " + err
      pwPlay = false
    }
  },
  this.pwPlayEq = async function(song){
    let track = escapeTrack(song)
    try{
      let cmd = "pw-play " + track //+ " >/dev/null 2>&1"
      console.log(cmd)
      await execCmd(cmd) 
      //await spawnAsync("pw-play", [song]);
    }
    catch(err){
      console.log(err)
      trackState = "done"
    }
  }
  // this.checkPwPlayAction = async function(){
  //   var result = await execCmd("wpctl status | grep pw-play >&1")
  //   if (!result){
  //     trackState = "done" //see playTrack2AudioJack
  //     trackIndex++
  //   }
  // }
}
