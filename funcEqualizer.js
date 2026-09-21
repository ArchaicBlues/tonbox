//PARTIAL DUMMY MODULE: this module mixes the real audio-output primitives
//used by the kept Radio/System features (setVolumeSettings, getVolume,
//pipewireAudioInit, pwPlayEq, sliderValtoGain, gainToSliderVal, sliderGain -
//kept real) with the equalizer-EDITING actions, which are reduced to no-ops
//as part of the BASIS build (submitFilter, buildFilterConf, setReverb,
//setEqualizerFilter, modifyFilterOnTheFly, saveFilter).

const { exec, spawn } = require('child_process');
global.fnames = ""
global.pwPlay = false
filterGraph = {
  preamp: "-6.0",
  "graph": [
    { label: "bq_low_shelf", Fc: "40.0", Q: "0.7", Gain: "6.0" },
    { label: "bq_peaking", Fc: "121.0", Q: "0.7", Gain: "4.0" },
    { label: "bq_peaking", Fc: "547.0", Q: "2.10", Gain: "-7.2" },
    { label: "bq_peaking", Fc: "674.0", Q: "0.72", Gain: "-7.2" },
    { label: "bq_peaking", Fc: "818.0", Q: "2.82", Gain: "-4.8" },
    { label: "bq_peaking", Fc: "1503.0", Q: "1.64", Gain: "4.0" },
    { label: "bq_peaking", Fc: "1605.0", Q: "4.95", Gain: "0.4" },
    { label: "bq_peaking", Fc: "1722", Q: "2.75", Gain: "2.5" },
    { label: "bq_peaking", Fc: "4160.0", Q: "1.62", Gain: "3.0" },
    { label: "bq_highshelf", Fc: "12000", Q: "0.7", Gain: "-3.2" },
  ]
}

module.exports = async function (required) {
  this.setVolumeSettings = async function (value) {
    console.log("setVolumeSettings=" + value)
    settings.jackVolume = value
    await writeSettings()
  },
  this.getVolume = function (res) {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(settings.jackVolume), 'utf-8');
  },
  this.submitFilter = async function (filter) {
    //no-op: equalizer filter editing disabled in this BASIS build
  },
  this.buildFilterConf = async function () {
    //no-op
  },
  this.showPage = function (b, res) {
    setInitialPage(res)
  },
  this.setReverb = async function (body, res) {
    if (res) res.json({ success: false, reverb: settings.reverb });
  },
  this.setEqualizerFilter = function (eq) {
    //no-op: live equalizer editing disabled in this BASIS build
  },
  this.modifyFilterOnTheFly = async function (sliderNum, gain) {
    //no-op
  },
  this.sliderValtoGain = function (n) {
    //-9db..+9dB
    if (n > 50) {
      n = n - 50;
      n = n * 9 / 50
    } else {
      n = n * 9 / 50
      n = -9 + n
    }
    return (n)
  },
  this.gainToSliderVal = function (n) {
    let y = 50 / 9
    y = y.toFixed(2)
    if (n > 0) y = 50 + y * n
    else y = 50 + (y * n)
    y = parseInt(y)
    return (y)
  }

  this.saveFilter = async function (eqData) {
    //no-op: equalizer filter editing disabled in this BASIS build
  },

  this.sliderGain = function () {
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
  this.pipewireAudioInit = async function () {
    killplayAux()
    if (!settings.mediaOut) return
    if (settings.mediaOut.match("HTTP")) {
      await stopMusicPlay(constants.AUDIO_PW)
      return
    }
    try {
      var eq = "";
      var result = ""

      result = await execCmd("wpctl status | grep 'Equalizer Tonbox Sink' >&1")
      if (result) {
        result = result.split(". Equalizer Tonbox Sink")
        eq = result[0].slice(-2, result[0].length)
      }
      console.log("eq Object ID = " + eq)
      if (eq) {
        await execCmd("wpctl set-default " + eq)
        console.log("pipewireAudioInit: wpctl set-default " + eq)

        pwPlay = true
      } else
        pwPlay = false
    } catch (err) {
      console.log(err)
      procStatus.text += "; catch " + err
      pwPlay = false
    }
  },
  this.pwPlayEq = async function (song) {
    let track = escapeTrack(song)
    try {
      let cmd = "pw-play " + track
      console.log(cmd)
      await execCmd(cmd)
    }
    catch (err) {
      console.log(err)
      trackState = "done"
    }
  }
}
