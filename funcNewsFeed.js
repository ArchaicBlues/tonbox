//rss news feed
//import newsFeed from 'news-feed';

//newsFeed = require('news-feed');


//https://www.rss-verzeichnis.net/index.php?seite=index&suche=boerse&submit=Suche

//Aktuelle Neuigkeiten
const nytimes =  new newsFeed('http://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml');
const pclmedia = new newsFeed('https://www.pclmedia.de/rss.xml');
const sternAll = new newsFeed('https://www.stern.de/feed/standard/alle-nachrichten');
const stuttgart = new newsFeed('https://www.stuttgarter-zeitung.de/news.rss.feed');
const dwAll = new newsFeed('https://rss.dw.com/xml/rss-de-all');

//Economy, Wirtschaft / Aktien
const economic = new newsFeed('https://economictimes.indiatimes.com/rssfeedsdefault.cms');
const boersentreff = new newsFeed('https://www.boersentreff.de/thema_D2_all.xml');
const boersefinanzen = new newsFeed('https://www.boerse-und-finanzen.de/share/ascunia_trading.xml');
const sternWirtschaft = new newsFeed('https://www.stern.de/feed/standard/wirtschaft');
const dwEco = new newsFeed('https://rss.dw.com/xml/rss-de-eco');
const wallNachrichten = new newsFeed('https://www.wallstreet-online.de/rss/nachrichten-ad-hocs.xml');
const wallAktien = new newsFeed('https://www.wallstreet-online.de/rss/nachrichten-aktien-indizes.xml');
const wallETF = new newsFeed('https://www.wallstreet-online.de/rss/nachrichten-etf.xml');


//Music
//https://blog.feedspot.com/blues_music_rss_feeds/



var newsData= [], newsUrl=[], newsDate=[], newsImage=[], index=0

module.exports = function(required){
    //one after the other nytimes->pclmedia->sternall->stuttgart->dwAll
    this.checkActualNews = function(searchText,res){
        console.log("checkActualNews:" + searchText)
        newsData [0] = "sorry, nothing found"
        index = 0
        nytimes.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
                index = Number(index) + Number(x)
                console.log("found nytimes=" + index)
                getpclmedia(searchText, res)
            }
        });    
    },
    this.getpclmedia = function(searchText, res){
        //console.log("indexEco=" + index)
        pclmedia.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
            }
            index = Number(index) + Number(x)
            console.log("found pclmedia=" + x + " index=" + index)
            getsternAll(searchText, res)
        }); 
    },    
    this.getsternAll = function(searchText, res){
        //console.log("indexEco=" + index)
        sternAll.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
            }
            index = Number(index) + Number(x)
            console.log("found sternall=" + x + " index=" + index)
            getstuttgart(searchText, res)
        }); 
    },    
    this.getstuttgart = function(searchText, res){
        //console.log("indexEco=" + index)
        stuttgart.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
            }
            index = Number(index) + Number(x)
            console.log("found stuttgart=" + x + " index=" + index)
            getdwAll(searchText, res)
        }); 
    },    
    this.getdwAll = function(searchText, res){
        //console.log("indexEco=" + index)
        dwAll.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
            }
            index = Number(index) + Number(x)
            console.log("found dwAll=" + x + " index=" + index)
           
            res.render('pages/rssfeednews', {btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, 
                news:newsData, 
                newsU:newsUrl, 
                newsD:newsDate,
                newsI:newsImage,
                newsf:index
            })        
        }); 
    },    
    //-------------------------------------------------------------
    //one after the other economic->boersentreff->boersefinanzen->sternWirtschaft->
    //dwEco->wallNachrichten->wallAktien->wallETF
    this.checkEcoNews = function(searchText,res){
        console.log("checkEcoNews")
        newsData [0] = "sorry, nothing found"
        index = 0
        economic.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
                index = Number(index) + Number(x)
                console.log("found economic=" + index)
                getboersentreff(searchText, res)
            }
        });    
    },
    this.getboersentreff = function(searchText,res){
        boersentreff.load().then((result) => {
            if (!result.error) {
                var x = evaluateSearch(result,searchText)
            }
            index = Number(index + x)
            console.log("found boersentreff=" + x + " index=" + index)
            getboersefinanzen(searchText,res)
        }); 
    },
    this.getboersefinanzen = function(searchText, res){
        //console.log("indexEco=" + index)
        boersefinanzen.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
            }
            index = Number(index) + Number(x)
            console.log("found boersefinanzen=" + x + " index=" + index)
            getsternWirtschaft(searchText, res)
        }); 
    },
    this.getsternWirtschaft = function(searchText,res){
        sternWirtschaft.load().then((result) => {
            if (!result.error) {
                //console.log(JSON.stringify(result))
                var x = evaluateSearch(result,searchText)
            }
            index = Number(index) + Number(x)
            console.log("found sternWirtschaft=" + x + " index=" + index)
            getdwEco(searchText,res)
        }); 
    },
    this.getdwEco = function(searchText, res){
        //console.log("indexEco=" + index)
        dwEco.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
            }
            index = Number(index) + Number(x)
            console.log("found dwEco=" + x + " index=" + index)
            getwallNachrichten(searchText, res)
        }); 
    },
    this.getwallNachrichten = function(searchText, res){
        //console.log("indexEco=" + index)
        wallNachrichten.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
            }
            index = Number(index) + Number(x)
            console.log("found wallNachrichten=" + x + " index=" + index)
            getwallAktien(searchText, res)
        }); 
    },
    this.getwallAktien = function(searchText, res){
        //console.log("indexEco=" + index)
        wallAktien.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
            }
            index = Number(index) + Number(x)
            console.log("found wallAktien=" + x + " index=" + index)
            getwallETF(searchText, res)
        }); 
    },
    this.getwallETF = function(searchText, res){
        //console.log("indexEco=" + index)
        wallETF.load().then((result) => {
            if (!result.error) {
                var x= evaluateSearch(result,searchText)
            }
            index = Number(index) + Number(x)
            console.log("found wallETF=" + x + " index=" + index)
            res.render('pages/rssfeednews', {btDevice:bluez, recording:getScheduledJobsWithoutTimeout(), pState:procStatus, 
                news:newsData, 
                newsU:newsUrl, 
                newsD:newsDate,
                newsI:newsImage,
                newsf:index
            })        
        }); 
    },
    //-------------------------------------------------------------
    this.evaluateSearch = function(result,searchText){
        var searchArray = searchText.split(" ")
        //console.log("searchText=" + searchArray + " ,length=" + searchArray.length)
        var found=[], x=0

        for(i in result.items){
            if (result.items[i].title !== null) {
                var data=result.items[i].title
                //console.log(data)
                //console.log(i)                
                for (var n=0; n<searchArray.length; n++){
                    if(data.match(searchArray[n])){
                        //console.log("searchArray[" + n + "]=" + searchArray[n] + ", data:" + data)
                        if (sameSearchResultIndex(found,i) == false){
                            found[x++]=i  
                        }
                    }              
                }
            }
        }
        if (x > 0)
        {
            //var i=0
            //index = Number(index)
            //console.log("index:" + index)
            for(z in found){
                y = Number(index) + Number(z);
                //console.log("y=" + y + "=" + index + "+" + z)
                newsData[y]=result.items[found[z]].title
                //console.log("newsData[y]=" + newsData[y] + "==" + result.items[found[z]].title)
                newsUrl[y]=result.items[found[z]].url
                newsDate[y]=result.items[found[z]].date
                newsImage[y]=result.items[found[z]].image
            }
        }
        return x
    },
    this.sameSearchResultIndex = function (found,i){
        for (var x=0; x<found.length; x++){
            if (found[x] == i) return true
        }
        return false
    }
}
