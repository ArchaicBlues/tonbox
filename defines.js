'use strict';

let constants = {
    //Internet Radio
    REC_DEFAULT_HTTP: "http",
    REC_DEFAULT_REC: "false",
    REC_DEFAULT_PID: "",
    REC_DEFAULT_NO_ERR: "",
    REC_KILL_ERR: "kill",
    REC_PROCESS_ERR: "access forbidden",
    REC_PID_ERR: "pid",
    REC_MAX_RADIO_RECORDINGS: "5",
    REC_WAIT_PROCESS_START: 2500,//access forbidden could raise ! Wait a bit
    //AD conversion
    AD_RECORDING_ACTIVE: 1,
    AD_RECORDING_STOP_IN_PROGRESS: 2,
    AD_RECORDING_STOPPED: 3,    
    AD_MAX_LP_CONVERSION_TIME: 30,//max.LP time about 27min
    AD_MAX_EP_CONVERSION_TIME: 6,//max. single time 5min
    AD_MAX_TAPE_CONVERSION_TIME: 60,//max. Cassette time 120min
    AD_MAX_AUX_CONVERSION_TIME: 80,//max. CD 700MB
    AD_MIN_CONVERSION_TIME: 1,
    /*
    Data rate of a single 16-bit/44100 kHz audio stream is computed in mebibytes per minute. 
    Division by 1048576 converts from bits to mebibits. Division by 8 converts from mebibits to mebibytes; 
    multiply by 60 converts seconds to minutes: Mono: (((16 x 44100) / 1,048,576) / 8) x 60 = 5.04684448242 MiB/min
    Stereo: 10.0936889648 MiB/min
    */
    AD_MIB_MIN_MONO: 5.04684448242,
    AD_MIB_MIN_STEREO: 10.0936889648,
    //--------------------------------
    DISCOGS_STATUS_OAUTH_CHECK_OK: 1,
    DISCOGS_STATUS_OAUTH_CHECK_NOK: 0,
    DISCOGS_RESULT_STATE_EMPTY: "0",
    DISCOGS_RESULT_STATE_EXIST: "1",
    DISCOGS_RESULT_STATE_IN_ADRECORDS: "2",
    //--------------------------------
    SSE_INACTIVE: "inactive",
    SSE_NONE_CLEAR_INTERVAL: "none",
    SSE_WAV2MP3: "wav2mp3",
    SSE_AD_CONVERSION: "ADconversion",
    SSE_CD_RIPPING: "CDripping",
    SSE_PROCESS_WAV: "WAVanalyze",
    SSE_ADJUST_RENAME: "adjustRename",
    SSE_COMPLETED: "you may play the recorded file / done",
    SSE_INTERVAL: 1000,
    SSE_DL_INTERVAL: 1000,
    SSE_DL_RUNNING: "YouTubeProcess",
    SSE_VIDEO_CONVERSION: "VideoConversion",
    SSE_MONITOR_LEVEL: "AudioMonitorLevel",
    SSE_MONITOR_LEVEL_INTERVAL: 1500,
    //--------------------------------
    //FFMPEG silence detection
    FFMPEG_MAX_THRESHOLD_DURATION: -25,
    FFMPEG_MIN_THRESHOLD_DURATION: -13,
    FFMPEG_MIN_REC_START_SILENCE: 8, //Ruhezeit bis zum ersten Track
    SILENCE_INTERVAL_500MS: 500,//ms
    SILENCE_DETECTION_35dB: -35,
    REC_IGNORE_START_SILENCE_10s: 20,  //for silence detection ignore first 20 sec 
    REC_STOP_SILENCE_10s: 20, //500ms interval! Stop recording after continues silence 
    MAX_PEAKS: 50,         //stop recording if more than 50 peaks detected
    SILENCE_FACTOR_INIT: 50,
    SILENCE_FACTOR_MAX: 450,
    //Deep Split
    DEEP_SPLIT_MAX_END_TIME: 600,
    DEEP_SPLIT_ADJUST_TIME: 20,
    DEEP_SPLIT_MIN_DISTANCE_TIME: 80,
    DEEP_SPLIT_MAX_DISTANCE_TIME: 200,
    //--------------------------------
    LINKS_MAX: 10,
    //--------------------------------
    MAX_PIC_SUBDIRS: 4,
    //--------------------------------
    USB_NOK: "nok", 
    USB_OK: "ok",   //dev present, mounted, dir "mediaServer" exist
    USB_EMPTY: "empty",
    USB_NOT_EMPTY:"data",
    SD_CARD_MEDIASERVER_NOK:0,
    SD_CARD_MEDIASERVER_OK:1,
    //--------------------------------
    //procStatus.stat
    PROC_STAT_DIGI_ON: 1,//BIT 0 
    PROC_STAT_REC_ON: 2, //BIT 1
    //--------------------------------
    REC_RECORDING: "recording", //rec 
    REC_START_ANALYZER: "analyze",//check mumber_of_tracks in all.wav.tracks thru gramcli action
    REC_WAV_TRACKS: "WavTracks",//analyze wav file separation thru gramcli action
    REC_SILENCE_FACTOR_LENGTH: "10",
    //stopMusicPlay
    AUDIO_MPV: "1",
    AUDIO_PW: "2",
    AUDIO_ALL: "3",
    VIDEO_PLAY_DELAY: "140",
    VIDEO_PLAY_OFFSET: "0",
    //IP configuration
    IP_CONFIG: "yes",
    IP_CONFIG_ELAPSED_EVENTS: "20",
    IP_DEFAULT: "",//192.168.2.140",
    IP_GATEWAY_DEFAULT: "", //192.168.2.1",
    //Lautstärke Slider Range
    VOL_RPI_HEADPHONE_MIN:"75", //Wert-Änderung in *.ejs und Script nötig
    LED17_GREEN:17, 
    LED27_GREEN:27,
    LED22_ORANGE:22,
    LED23_ORANGE:23,
    LED24_ORANGE:24,
    LED25_ORANGE:25,
    //Marquee & ffmpegRecorder
    META_DATA_INTERVAL: 1000, //ms
    //Tonbox
    SOFTWARE_VERSION: "210926"
}

module.exports = Object.freeze(constants); // freeze prevents changes by users
