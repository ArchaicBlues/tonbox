
console.log("videoWeb.js")
// console.log("audioOut="+audioOut)
// console.log("audioTag="+audioTag+", modalWin="+modalWin)
loadEventAt = 0
player=document.getElementById('myVideo');
console.log("singleVid="+singleVid)
volumeSliderPos = 0
//-------------volume slider & Equalizer ------------------
// Create AudioContext and gain node
audioCtx = new AudioContext();
vGain = audioCtx.createGain();
const media = document.getElementById("myVideo");
// Connect video player's audio source to gain node
const videoPlayer = audioCtx.createMediaElementSource(media);
pass31 = audioCtx.createBiquadFilter()
pass31.type = "peaking"
pass31.frequency.value = 31
pass31.Q.filter = 1.41

pass62 = audioCtx.createBiquadFilter()
pass62.type = "peaking"
pass62.frequency.value = 62
pass62.Q.filter = 1.41

pass125 = audioCtx.createBiquadFilter()
pass125.type = "peaking"
pass125.frequency.value = 125
pass125.Q.filter = 1.41

pass250 = audioCtx.createBiquadFilter()
pass250.type = "peaking"
pass250.frequency.value = 250
pass250.Q.filter = 1.41

pass500 = audioCtx.createBiquadFilter()
pass500.type = "peaking"
pass500.frequency.value = 500
pass500.Q.filter = 1.41

pass1000 = audioCtx.createBiquadFilter()
pass1000.type = "peaking"
pass1000.frequency.value = 1000
pass1000.Q.filter = 1.41

pass2000 = audioCtx.createBiquadFilter()
pass2000.type = "peaking"
pass2000.frequency.value = 2000
pass2000.Q.filter = 1.41

pass4000 = audioCtx.createBiquadFilter()
pass4000.type = "peaking"
pass4000.frequency.value = 4000
pass4000.Q.filter = 1.41

pass8000 = audioCtx.createBiquadFilter()
pass8000.type = "peaking"
pass8000.frequency.value = 8000
pass8000.Q.filter = 1.41

pass16000 = audioCtx.createBiquadFilter()
pass16000.type = "peaking"
pass16000.frequency.value = 16000
pass16000.Q.filter = 1.41

videoPlayer.connect(pass31)
pass31.connect(pass62)
pass62.connect(pass125)
pass125.connect(pass250)
pass250.connect(pass500)
pass500.connect(pass1000)
pass1000.connect(pass2000)
pass2000.connect(pass4000)
pass4000.connect(pass8000)
pass8000.connect(pass16000)
pass16000.connect(vGain)
vGain.connect(audioCtx.destination)

vGain.gain.value = 0.1
getEqData()
getVolumeSettings()

//-------------volume slider
//console.clear();
//volumeSliderPos = 0
currentFilterNum=4 // entspricht MyEQ.txt on rpi
let eqSlider ={}
changedEQ = false
oldCurrentFilterNum = -1

if (!singleVid){
    mp4Vid = document.getElementById('mp4Source');

    vidsrc = vid.replace(/\"/g,"")
    vidsrc = vidsrc.split(",")
    count = 0
    anz = vidsrc.length
    console.log(vidsrc[count])
    mp4Vid.src = vidsrc[count]
    console.log("init play " + vidsrc[count])
    player.load();

    player.addEventListener('ended',videoEnd,false);

    player.addEventListener('play', function() {
    player.style.opacity = 1;
    setTimeout(function() {
        player.style.opacity = 1;
    }, 1000); // fade-in over 1 second
    });

    // Get a reference to the button element 
    const buttonNext = document.getElementById('next'); 
    // Add a click event listener to the button 
    buttonNext.addEventListener('click', function() { 
        // This function will be executed whenever the button is clicked 
        console.log('Next'); 
        count++
        if ((count) < anz){
            player.pause()
            player.currentTime = 0
            count
            mp4Vid.src = vidsrc[count]
            player.load();
        }else count--

    }); 

    const buttonPre = document.getElementById('pre'); 
    // Add a click event listener to the button 
    buttonPre.addEventListener('click', function() { 
        // This function will be executed whenever the button is clicked 
        console.log('Pre'); 
        if ((count-1) >= 0){
            player.pause()
            player.currentTime = 0
            count--
            mp4Vid.src = vidsrc[count]
            player.load();
        }
    }); 

    const buttonPlay = document.getElementById('play'); 
    buttonPlay.addEventListener('click', function() { 
        console.log('Play'); 
    //    document.getElementById('fin').innerHTML = "play " + vidsrc[count]
        player.play();
    }); 

    const buttonStop = document.getElementById('stop'); 
    buttonStop.addEventListener('click', function() { 
        console.log('Stop'); 
    //                document.getElementById('fin').innerHTML = ""
        player.pause()
        player.currentTime = 0
    }); 
}else{
    player.addEventListener('loadstart', function() {
        loadEventAt = Date.now()
    })

    player.addEventListener('play', function() {
        // var xhr = new XMLHttpRequest();
        // xhr.open("GET", "/StartMpv", true);
        // xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        // xhr.send();

        let data = volumeSliderPos
        data *= 0.5
        data /= 100;
        player.volume = data
        console.log("set controls volume="+data)

    })

    player.addEventListener('pause', function() {
        console.log("video pause detected")
        // if (!audioOut.match("HTTP")){
        //     var xhr = new XMLHttpRequest();
        //     xhr.open("GET", "/killMpv", true);
        //     xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        //     xhr.send();
        // }
    })

}

function getVolumeSettings(){
    fetch('/get_volume_settings')
    .then(response => response.json())
    .then(data => {
        volumeSliderPos = data
        sl = document.getElementById('vol')
        if (audioOut.match("HTTP")){
            sl.value = data*0.5
//            if (audioTag){
                data *= 0.5
                data /= 100;
                vGain.gain.setValueAtTime(data, audioCtx.currentTime); 
                player.volume = data
//            }
        }
        else{
            sl.value =80+data*0.15
        }
        // console.log("getVolumeSettings="+data+": set SliderPos="+sl.value)
        // //init video controls volume
        // console.log("volumeSliderPos ="+volumeSliderPos)
        // let v = volumeSliderPos / 100.0
        // console.log("video vol="+v)
        // player.volume = v
        // //visualize slider position
        // sl = document.getElementById('vol')
        // sl.value = 1
    });
}

function setVolumeSettings(val){
    value = Math.round(val)
    var xhr = new XMLHttpRequest();
    console.log("setVolumeSettings="+value)
    xhr.open("POST", "/equalizer", true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send("setVolumeSettings="+value);      
}

function videoEnd(e)
{
    console.log("received event")
    //console.log("anz="+anz)
    
    if(!e) {
        e = window.event; 
    }
    if (++count < anz){
        console.log("count="+count+" anz="+anz)
        mp4Vid.src = vidsrc[count]
        console.log("play " + vidsrc[count])
        player.load();
    }else{
        document.getElementById('fin').innerHTML = "ok!"
    }
}

//change pipewire volume
function volumeRPI(val){
    var value = parseFloat(val)
    console.log("volumeRPI("+val+")="+value)
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "/set_volume_pw="+value, true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send();
    value = (value-80)/0.15
    value = Math.round(value)
    setTimeout(setVolumeSettings,100,value)
}

function setEq(i){
    //[0]=>Clear, [1]=>Neutral, [2]=>Warm, [3]=>Bass, [4]=>myEQ
    currentFilterNum=i
    //adjust slider visu
    var slObj = document.getElementById("40Hz")
    slObj.value = eqSlider.f40Hz[i]
    slObj = document.getElementById("121Hz")
    slObj.value = eqSlider.f121Hz[i]
    slObj = document.getElementById("547Hz")
    slObj.value = eqSlider.f547Hz[i]
    slObj = document.getElementById("674Hz")
    slObj.value = eqSlider.f674Hz[i]
    slObj = document.getElementById("818Hz")
    slObj.value = eqSlider.f818Hz[i]
    slObj = document.getElementById("1503Hz")
    slObj.value = eqSlider.f1503Hz[i]
    slObj = document.getElementById("1605Hz")
    slObj.value = eqSlider.f1605Hz[i]
    slObj = document.getElementById("1722Hz")
    slObj.value = eqSlider.f1722Hz[i]
    slObj = document.getElementById("4160Hz")
    slObj.value = eqSlider.f4160Hz[i]
    slObj = document.getElementById("12000Hz")
    slObj.value = eqSlider.f12000Hz[i]

    pass31.gain.value = eqSlider.f40Hz[i]/10 //dB
    pass62.gain.value = eqSlider.f121Hz[i]/10
    pass125.gain.value = eqSlider.f547Hz[i]/10
    pass250.gain.value = eqSlider.f674Hz[i]/10
    pass500.gain.value = eqSlider.f818Hz[i]/10
    pass1000.gain.value = eqSlider.f1503Hz[i]/10
    pass2000.gain.value = eqSlider.f1605Hz[i]/10
    pass4000.gain.value = eqSlider.f1722Hz[i]/10
    pass8000.gain.value = eqSlider.f4160Hz[i]/10
    pass16000.gain.value = eqSlider.f12000Hz[i]/10
}


findex0obj = document.getElementById("fIndex0")
findex0obj.addEventListener('change', () => {
    console.log("clicked eq 0")
    setEq(0)
})
findex1obj = document.getElementById("fIndex1")
findex1obj.addEventListener('change', () => {
    console.log("clicked eq 1")
    setEq(1)
})
findex2obj = document.getElementById("fIndex2")
findex2obj.addEventListener('change', () => {
    console.log("clicked eq 2")
    setEq(2)
})
findex3obj = document.getElementById("fIndex3")
findex3obj.addEventListener('change', () => {
    console.log("clicked eq 3")
    setEq(3)
})
findex4obj = document.getElementById("fIndex4")
findex4obj.addEventListener('change', () => {
    console.log("clicked eq 4")
    setEq(4)
})

player.addEventListener('volumechange', () => {
    if (audioOut.match("HTTP")){
        console.log("volumechange="+player.volume)
        sl.value = player.volume * 100
    }
})

function getEqData(){
    fetch('eqSlider.json')
    .then(response => response.json())
    .then(data => {
        eqSlider = data
        console.log(eqSlider)
        setEq(4) //MyEQ default
    });
}

function eqGain(string,type)
{
    //string == slider position 1..100  
    var value = parseFloat(string)
    // if (type == 'vGain'){
    //     console.log("save volume="+value)
    //     var xhr = new XMLHttpRequest();
    //     xhr.open("POST", "/equalizer", true);
    //     xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    //     xhr.send("setVolumeSettings="+value);      
    // }
    loadMyEQ()
    if (audioOut.match("HTTP")) { //WEb Audio API
        value /= 100.0;
        if (type != 'vGain')
            value *= 10.0
        console.log("eqGain="+value+", type="+type)
        switch(type)
        {
            case 'vGain': 
            vGain.gain.setValueAtTime(value, audioCtx.currentTime); 
            console.log("vGain="+value)
            break;

            case '40Gain':
            pass31.gain.value=value;
            eqSlider.f40Hz[4]=value*10
            break;
            case '121Gain':
            pass62.gain.value=value;
            eqSlider.f121Hz[4]=value*10
            break;
            case '547Gain':
            pass125.gain.value=value;
            eqSlider.f547Hz[4]=value*10
            break;
            case '674Gain':
            pass250.gain.value=value;
            eqSlider.f674Hz[4]=value*10
            break;
            case '818Gain':
            pass500.gain.value=value;
            eqSlider.f818Hz[4]=value*10
            break;
            case '1503Gain':
            pass1000.gain.value=value;
            eqSlider.f1503Hz[4]=value*10
            break;
            case '1605Gain':
            pass2000.gain.value=value;
            eqSlider.f1605Hz[4]=value*10
            break;
            case '1722Gain':
            pass4000.gain.value=value;
            eqSlider.f1722Hz[4]=value*10
            break;
            case '4160Gain':
            pass8000.gain.value=value;
            eqSlider.f4160Hz[4]=value*10
            break;
            case '11605Gain':
            pass16000.gain.value=value;
            eqSlider.f12000Hz[4]=value*10
            break;
        }
    }else{
        //Line-Out, Pipewire filtergraph on RPI
        newVal = value
        console.log("slider value="+value)

        switch(type)
        {
            case '40Gain':
            var slider = document.getElementById("40Hz");
            eqSlider.f40Hz[4]=value
            slider.onchange = function(){
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/eq1="+newVal, true);
                xhr.send();
            }
            break;

            case '121Gain':
            var slider = document.getElementById("121Hz");
            eqSlider.f121Hz[4]=value
            slider.onchange = function(){
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/eq2="+newVal, true);
                xhr.send();
            }
            break;

            case '547Gain':
            var slider = document.getElementById("547Hz");
            eqSlider.f547Hz[4]=value
            slider.onchange = function(){
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/eq3="+newVal, true);
                xhr.send();
            }
            break;

            case '674Gain':
            var slider = document.getElementById("674Hz");
            eqSlider.f674Hz[4]=value
            slider.onchange = function(){
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/eq4="+newVal, true);
                xhr.send();
            }
            break;

            case '818Gain':
            var slider = document.getElementById("818Hz");
            eqSlider.f818Hz[4]=value
            slider.onchange = function(){
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/eq5="+newVal, true);
                xhr.send();
            }
            break;

            case '1503Gain':
            var slider = document.getElementById("1503Hz");
            eqSlider.f1503Hz[4]=value
            slider.onchange = function(){
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/eq6="+newVal, true);
                xhr.send();
            }
            break;

            case '1605Gain':
            var slider = document.getElementById("1605Hz");
            eqSlider.f1605Hz[4]=value
            slider.onchange = function(){
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/eq7="+newVal, true);
                xhr.send();
            }
            break;

            case '1722Gain':
            var slider = document.getElementById("1722Hz");
            eqSlider.f1722Hz[4]=value
            slider.onchange = function(){
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/eq8="+newVal, true);
                xhr.send();
            }
            break;

            case '4160Gain':
            var slider = document.getElementById("4160Hz");
            eqSlider.f4160Hz[4]=value
            slider.onchange = function(){
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/eq9="+newVal, true);
                xhr.send();
            }
            break;

            case '11605Gain':
            var slider = document.getElementById("12000Hz");
            eqSlider.f12000Hz[4]=value
            slider.onchange = function(){
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/eq10="+newVal, true);
                xhr.send();
            }
            break;
        }
    }
}			

function loadMyEQ(){
    if (oldCurrentFilterNum != currentFilterNum){
        console.log("loadMyEQ")
        oldCurrentFilterNum = currentFilterNum;
        eqSlider.f40Hz[4] = eqSlider.f40Hz[currentFilterNum]
        eqSlider.f121Hz[4] = eqSlider.f121Hz[currentFilterNum]
        eqSlider.f547Hz[4] = eqSlider.f547Hz[currentFilterNum]
        eqSlider.f674Hz[4] = eqSlider.f674Hz[currentFilterNum]
        eqSlider.f818Hz[4] = eqSlider.f818Hz[currentFilterNum]
        eqSlider.f1503Hz[4] = eqSlider.f1503Hz[currentFilterNum]
        eqSlider.f1605Hz[4] = eqSlider.f1605Hz[currentFilterNum]
        eqSlider.f1722Hz[4] = eqSlider.f1722Hz[currentFilterNum]
        eqSlider.f4160Hz[4] = eqSlider.f4160Hz[currentFilterNum]
        eqSlider.f12000Hz[4] = eqSlider.f12000Hz[currentFilterNum]
    }
    changedEQ = true
}

function volumeWEB(string,type){
    //string == slider position 1..100  
    var value = parseFloat(string)
    if (type == 'vGain'){
        console.log("save volume to server for next web page change")
        var xhr = new XMLHttpRequest();
        xhr.open("POST", "/equalizer", true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send("setVolumeSettings="+value);      
    }
    loadMyEQ()
    console.log("volumeWEB="+value+", type="+type)

    value /= 10

    switch(type)
    {
        case 'vGain': 
        //Lautstärke slider
        value /= 10
        vGain.gain.setValueAtTime(value, audioCtx.currentTime); 
        console.log("vGain="+value)
        //video controls Lautstärke
        player.volume = value
        break;

        case '40Gain':
        pass31.gain.value=value;
        eqSlider.f40Hz[4]=value*10
        console.log("pass31="+value)
        break;
        case '121Gain':
        pass62.gain.value=value;
        eqSlider.f121Hz[4]=value*10
        break;
        case '547Gain':
        pass125.gain.value=value;
        eqSlider.f547Hz[4]=value*10
        break;
        case '674Gain':
        pass250.gain.value=value;
        eqSlider.f674Hz[4]=value*10
        break;
        case '818Gain':
        pass500.gain.value=value;
        eqSlider.f818Hz[4]=value*10
        break;
        case '1503Gain':
        pass1000.gain.value=value;
        eqSlider.f1503Hz[4]=value*10
        break;
        case '1605Gain':
        pass2000.gain.value=value;
        eqSlider.f1605Hz[4]=value*10
        break;
        case '1722Gain':
        pass4000.gain.value=value;
        eqSlider.f1722Hz[4]=value*10
        break;
        case '4160Gain':
        pass8000.gain.value=value;
        eqSlider.f4160Hz[4]=value*10
        break;
        case '11605Gain':
        pass16000.gain.value=value;
        eqSlider.f12000Hz[4]=value*10
        break;
    }
}			

function saveMyEQ(){
    changedEQ = false
    console.log("save myEQ on RPI")
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/equalizer", true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    var data = JSON.stringify(eqSlider)
    console.log(eqSlider)
    //save eqSlider.json and MyEQ.txt on rpi
    xhr.send("SaveFilter="+data);      
}



//modal window ----------------------------------------------------
function openModal(){
    modal = document.getElementById("eqModel");
//    console.log("clicked modal")
    modal.style.display = "flex";
    changedEQ = false
}

// When the user clicks X of the modal, close it
span = document.getElementsByClassName("close")[0];
span.onclick = function() {
    modal.style.display = "none";
    if (changedEQ)// && !audioOut.match("HTTP"))
        saveMyEQ()
}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function(event) {
    //console.log("window clicked="+event.target)
    modal = document.getElementById("eqModel");
    if (event.target == modal) {
        modal.style.display = "none";
        if (changedEQ)// && !audioOut.match("HTTP"))
            saveMyEQ()
    }
}
