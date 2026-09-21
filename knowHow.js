//-------------------------------------------------------
// Übung Schreibweisen

function test1(name){console.log("test1="+name)}

test2 = (name) => {console.log("test2="+name)}

function test33(){
  console.log("Test33")
  setTimeout(test1,100,"setTimeout3333");
}
function test3(){
  console.log("Test3")
  setTimeout(function() {test1("setTimeout1003")}, 200);
}
function test4(){
  console.log("Test4")
  setTimeout(() => {test1("setTimeout1004")},300 );
}

function test5(){
  let arr = ["a","b","c","d"]
  arr.forEach(function(item) {console.log("test5 ",item);});
  }

function test6(){
  let arr = ["a","b","c","d"]
  arr.forEach(item => console.log("test6 ",item));
}

test1("Hi!")
test2("HiHi!")
test33()
test3()
test4()
test5()
test6()



//Übung Zusammenhänge Promises, then, async/await
/*
https://medium.com/dont-leave-me-out-in-the-code/handling-javascript-promises-with-async-await-or-then-ceebc235933d#:~:text=The%20%E2%80%9Cawait%20%E2%80%9Dkeyword%20tells%20JavaScript%20to%20wait%20until,causing%20this%20function%20to%20be%20resolved%20in%20parallel.
Asynchronous Functions: Promises are most commonly used with asynchronous functions. In most cases, when an asynchronous function is called, 
a promise is immediately returned while the process is running. Keep in mind, promises are a mechanism to handle what happens after an 
operation is resolved or rejected. Promises do not convert synchronous functions into asynchronous functions.
*/
axios.get('http://open.mapquestapi.com/geocoding/v1/address?key=yourKey', {params: { location: 'honolulu, hawaii' },})
  .then((result) => {console.log(result.data.results[0].locations[0].latLng);  })
  .then(() => axios.get('http://open.mapquestapi.com/geocoding/v1/address?key=yourKey', {params: { location: 'miami, florida' } }))
  .then((result) => {console.log(result.data.results[0].locations[0].latLng);})
  .then(() => axios.get('http://open.mapquestapi.com/geocoding/v1/address?key=yourKey', {params: { location: 'atlanta, georgia' },}))
  .then((result) => {console.log(result.data.results[0].locations[0].latLng); }).then(() => axios.get('http://open.mapquestapi.com/geocoding/v1/address?key=yourKey', {      params: { location: 'seattle, washington' },}))
  .then((result) => {console.log(result.data.results[0].locations[0].latLng); });

  /*
  Let’s take a look at the same code as above using async/await. We must create a container function (assigned to the variable “geocode) 
  and add the “async” keyword to it. Next, for all of the asynchronous functions inside of “geocode” that we want to block, we assign 
  the “await” keyword. The “await ”keyword tells JavaScript to wait until the promise from the asynchronous function is settled before 
  executing the rest of the code. If we do not assign the “await” keyword to an asynchronous function call, JavaScript will continue 
  executing on its single thread causing this function to be resolved in parallel.
  If we forget/choose not to use the “await” keyword on our asychronous axios.get request, and we console.log its return value 
  (assigned the variable “honolulu”), what should we expect? We should expect a pending promise because axios.get synchronously returns 
  a pending promise and we didn’t tell JavaScript to wait (block the context) until the promise was settled before logging the output.
  */

  const geocode = async () => {
    const honolulu = await axios.get('http://open.mapquestapi.com/geocoding/v1/address?key=yourKey',{params: { location: 'honolulu, hawaii' },});
    console.log(honolulu.data.results[0].locations[0].latLng);
    const miami = await axios.get('http://open.mapquestapi.com/geocoding/v1/address?key=yourKey',{params: { location: 'miami, florida' },});
    console.log(miami.data.results[0].locations[0].latLng);
    const atlanta = await axios.get('http://open.mapquestapi.com/geocoding/v1/address?key=yourKey',{params: { location: 'atlanta, georgia' },});
    console.log(atlanta.data.results[0].locations[0].latLng);
    const seattle = await axios.get('http://open.mapquestapi.com/geocoding/v1/address?key=yourKey',{params: { location: 'seattle, washington' },});
    console.log(seattle.data.results[0].locations[0].latLng);
  };


//--------------------------------------
//Beispiel 1
//For Schleife wird mit Promise then / catch hier nicht richtig ausgeführt
const execCmd = cmd => {
  return new Promise((resolve, reject) => {
    console.log(cmd)
    exec(cmd,(err, stdout, stderr) => {
      if (err) {
        reject(err)
        console.log("execCmd = " + err)
      }
      else 
        resolve("ok")
    })
  })
}

function readPics(f,i) {
  return new Promise((resolve, reject) => {
    fs.readFile(f, 'utf8' , (err, data) => {
      if (err) reject(err)
      else { 
        var all = data.toString();
        pics = all.split("\n");
        if (pics.length > 0) {
          homePics[i] = devHome + "/Pictures/" + slideDirs[i] + "/" + pics[0]; //only the first one
        }else{
          homePics[i] = "not available"
        }
        console.log(homePics[i])
        resolve("ok")
      }
    })
  })
}

function doRenderPics(i,res){
  if (i==slideDirs.length-1){
    res.render('pages/slideButton', { btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, uri:slideshowURI  })
  }
}

function makeSlideshowButton(res){
  fs.readFile('help/listDir.txt', 'utf8' , (err, data) => {
    if (err) {
      console.log("makeSlideshowButton error=" + err)
      slideshowURI[0] = "could nor resolve any videos dir"
      res.render('pages/slideButton', { btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, uri:slideshowURI  })
    } 
    else {
      slideshowAvailableDirs = data
      console.log("slideshowAvailableDirs=\n" + slideshowAvailableDirs)
      extractSlideshowDirs()
      // for (var i=0;i<slideDirs.length;i++){
      var i=0; for (i in slideDirs){
          // Container functionality
          execCmd("ls /media/" + devHome + "/Pictures/" + slideDirs[i] + " > help/homePics.txt")
            .then(readFile('help/homePics.txt',i))
            .then(doRenderPics(i,res))
            .catch(err => console.log(err))
      }
    }
  })
}


//-------------------------------------------------------
//Beispiel 2
//For Schleife wird mit Promise await / catch hier richtig ausgeführt
async function execCmd(cmd) {
  return new Promise((resolve, reject) => {
    console.log(cmd)
    exec(cmd,(err, stdout, stderr) => {
      if (err) resolve("nok")//reject(err)
      else resolve("ok")
    })
  })
}

async function readPics(f,i) {
  return new Promise((resolve, reject) => {
    fs.readFile(f, 'utf8' , (err, data) => {
      if (err) reject(err)
      else { 
        var all = data.toString();
        pics = all.split("\n");
        if (pics.length > 0) {
          homePics[i] = devHome + "/Pictures/" + slideDirs[i] + "/" + pics[0]; //only the first one
        }else{
          homePics[i] = "not available"
        }
        console.log(homePics[i])
        resolve("ok")
      }
    })
  })
}

function doRenderPics(i,res){
  if (i==slideDirs.length-1){
    res.render('pages/slideButton', { btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, uri:slideshowURI  })
  }
}

//Container func !
const renderPicDir = async (res) => {
  var i=0; for (i in slideDirs){
    // console.log("i=",i)
    await execCmd("ls /media/" + devHome + "/Pictures/" + slideDirs[i] + " > help/homePics.txt")
    await readPics('help/homePics.txt',i)
    .then(doRenderPics(i,res))
    .catch(err => console.log(err))
  }
}