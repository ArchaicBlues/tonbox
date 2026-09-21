/*
Bei vielen älteren Smart-TVs ist es entscheidend, wo der moov-Atom in der MP4-Datei liegt.
Wenn moov am Ende steht, muss der Player beim Streaming eventuell erst sehr viel bzw. die 
komplette Datei lesen, bevor er anfangen kann, das Video zu dekodieren

Container/Codec und moov-Position prüfen
========================================
Prüfen mit "schlechter" Datei:
pi@tonbox:~ $ strings "/home/pi/mediaServer/Home/Pictures/MyStuff/BuergerfestES2004_2.mp4" | grep -E 'moov|mdat' | head
Umdat
moov

mit "guter" Datei:
pi@tonbox:~ $ strings "/home/pi/mediaServer/Home/Pictures/MyStuff/BuergerfestES_faststart.mp4" | grep -E 'moov|mdat' | head
moov    //d.h. "moov" muß zuerst ausgegeben werden
Umdat

Umsortieren z.B.:
ffmpeg -i /home/pi/mediaServer/Home/Pictures/MyStuff/BuergerfestES2004_2.mp4 \
-c copy -movflags +faststart /tmp/BuergerfestES2004_2_fast.mp4

Test TV                         |  DLNA->Play Ergebnis
--------------------------------|-------------------------------------
SAMSUNG UE40F5500  (2014)       |  nok falsche Umsetzung im TV
GRUNDIG Ultralogic 4K (2015)    |  ok --> mp4 (moov an den Anfang setzen)
*/


const dgram = require('dgram');
const http = require('http');
const https = require('https');
const { URL } = require('url');


global.resultTV = ""
global.television = ""

async function detectTV(timeout = 3000) {
    console.log("detectTV()...")

    const SSDP_ADDR = '239.255.255.250';
    const SSDP_PORT = 1900;

    const searches = [
        'ssdp:all',
        'urn:schemas-upnp-org:device:MediaRenderer:1',
        'urn:schemas-upnp-org:device:MediaServer:1'
    ];

    /*
     * Pro IP werden ALLE SSDP-Antworten gespeichert.
     *
     * Das ist bei Samsung wichtig, weil ein TV mehrere
     * UPnP-Geräte an derselben IP anbieten kann.
     */
    const devices = new Map();

    function ssdpRequest(st) {

        return [
            'M-SEARCH * HTTP/1.1',
            `HOST: ${SSDP_ADDR}:${SSDP_PORT}`,
            'MAN: "ssdp:discover"',
            'MX: 2',
            `ST: ${st}`,
            '',
            ''
        ].join('\r\n');
    }

    function parseResponse(msg) {

        const lines = msg.toString().split('\r\n');
        const result = {};

        for (const line of lines) {

            const pos = line.indexOf(':');

            if (pos > 0) {

                const key =
                    line.substring(0, pos).trim().toLowerCase();

                const value =
                    line.substring(pos + 1).trim();

                result[key] = value;
            }
        }

        return result;
    }

    /*
     * HTTP GET
     */
    function getDescription(url) {

        return new Promise((resolve) => {

            try {

                const u = new URL(url);

                const protocol =
                    u.protocol === 'https:' ? https : http;

                const req = protocol.get({

                    hostname: u.hostname,

                    port:
                        u.port ||
                        (u.protocol === 'https:' ? 443 : 80),

                    path: u.pathname + u.search,

                    timeout: 2000

                }, (res) => {

                    let data = '';

                    res.on('data', chunk => {
                        data += chunk;
                    });

                    res.on('end', () => {

                        resolve({
                            statusCode: res.statusCode,
                            data: data
                        });

                    });

                });

                req.on('error', () => resolve(null));

                req.on('timeout', () => {

                    req.destroy();
                    resolve(null);

                });

            } catch (err) {

                resolve(null);

            }

        });
    }

    /*
     * Relative UPnP URLs in absolute URLs umwandeln
     */
    function absoluteURL(baseURL, relativeURL) {

        try {

            return new URL(relativeURL, baseURL).toString();

        } catch (e) {

            return null;

        }
    }

    /*
     * XML-Tag auslesen
     */
    function getTag(xml, tag) {

        const regex = new RegExp(
            `<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`,
            'i'
        );

        const match = xml.match(regex);

        return match ? match[1].trim() : '';
    }

    /*
     * Alle Vorkommen eines XML-Tags auslesen
     */
    function getTags(xml, tag) {

        const regex = new RegExp(
            `<(?:[\\w-]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`,
            'gi'
        );

        const result = [];

        let match;

        while ((match = regex.exec(xml)) !== null) {
            result.push(match[1].trim());
        }

        return result;
    }

    /*
     * Service-Liste aus einer Device Description
     */
    function parseServices(xml, location) {

        const services = [];

        const serviceRegex =
            /<service\b[^>]*>([\s\S]*?)<\/service>/gi;

        let match;

        while ((match = serviceRegex.exec(xml)) !== null) {

            const block = match[1];

            const serviceType =
                getTag(block, 'serviceType');

            const controlURL =
                getTag(block, 'controlURL');

            const eventSubURL =
                getTag(block, 'eventSubURL');

            const SCPDURL =
                getTag(block, 'SCPDURL');

            services.push({

                serviceType,

                controlURL:
                    absoluteURL(location, controlURL),

                eventSubURL:
                    absoluteURL(location, eventSubURL),

                SCPDURL:
                    absoluteURL(location, SCPDURL)

            });
        }

        return services;
    }

    /*
     * ---------------------------------------------------------
     * 1. SSDP-Suche
     * ---------------------------------------------------------
     */

    await new Promise((resolve) => {

        const socket = dgram.createSocket('udp4');

        let finished = false;

        function finish() {

            if (finished)
                return;

            finished = true;

            try {
                socket.close();
            } catch (e) {}

            resolve();
        }

        socket.on('message', (msg, rinfo) => {

            const response = parseResponse(msg);

            if (!response.location)
                return;

            const ip = rinfo.address;

            if (!devices.has(ip)) {

                devices.set(ip, {

                    ip: ip,

                    responses: []

                });

            }

            const device = devices.get(ip);

            /*
             * Doppelte Antworten vermeiden
             */
            const exists = device.responses.some(x =>
                x.location === response.location &&
                x.usn === response.usn &&
                x.st === response.st
            );

            if (!exists) {

                device.responses.push({

                    location: response.location,

                    server: response.server || '',

                    st: response.st || '',

                    usn: response.usn || ''

                });

            }

        });

        socket.on('error', (err) => {

            console.log('SSDP error:', err.message);

            finish();

        });

        socket.bind(() => {

            for (const st of searches) {

                const msg =
                    Buffer.from(ssdpRequest(st));

                socket.send(
                    msg,
                    0,
                    msg.length,
                    SSDP_PORT,
                    SSDP_ADDR
                );

            }

        });

        setTimeout(finish, timeout);

    });

    /*
     * ---------------------------------------------------------
     * 2. Jeden gefundenen UPnP-Endpunkt untersuchen
     * ---------------------------------------------------------
     */

    const result = [];

    for (const device of devices.values()) {

        const tv = {

            reachable: true,

            ip: device.ip,

            name: device.ip,

            manufacturer: '',

            model: '',

            locations: [],

            deviceTypes: [],

            services: [],

            protocols: {},

            capabilities: {

                dlnaRenderer: false,

                dlnaServer: false,

                avTransport: false,

                setAVTransportURI: false,

                setNextAVTransportURI: false,

                play: false,

                stop: false,

                pause: false,

                seek: false,

                next: false,

                previous: false,

                webUriPlayable: false,

                dial: false,

                samsungRemoteControl: false,

                samsungMainTVAgent: false,

                chromecast: false,

                airplay: false

            },

            recommended: null

        };

        /*
         * Alle Locations dieses TVs untersuchen
         */
        for (const response of device.responses) {

            const location = response.location;

            if (!tv.locations.includes(location)) {
                tv.locations.push(location);
            }

            const description =
                await getDescription(location);

            if (!description || !description.data)
                continue;

            const xml = description.data;

            /*
             * Geräteinformationen
             */
            const friendlyName =
                getTag(xml, 'friendlyName');

            const manufacturer =
                getTag(xml, 'manufacturer');

            const modelName =
                getTag(xml, 'modelName');

            if (friendlyName && tv.name === tv.ip) {
                tv.name = friendlyName;
            }

            if (manufacturer && !tv.manufacturer) {
                tv.manufacturer = manufacturer;
            }

            if (modelName && !tv.model) {
                tv.model = modelName;
            }

            /*
             * Device Types
             */
            const deviceTypes =
                getTags(xml, 'deviceType');

            for (const type of deviceTypes) {

                if (!tv.deviceTypes.includes(type)) {
                    tv.deviceTypes.push(type);
                }

            }

            /*
             * Services
             */
            const parsedServices =
                parseServices(xml, location);

            for (const service of parsedServices) {

                const alreadyThere =
                    tv.services.some(x =>
                        x.serviceType === service.serviceType &&
                        x.controlURL === service.controlURL
                    );

                if (!alreadyThere) {
                    tv.services.push(service);
                }

            }

            /*
             * -------------------------------------------------
             * Gerätetypen erkennen
             * -------------------------------------------------
             */

            for (const type of deviceTypes) {

                const t = type.toLowerCase();

                if (t.includes('mediarenderer')) {

                    tv.capabilities.dlnaRenderer = true;

                }

                if (t.includes('mediaserver')) {

                    tv.capabilities.dlnaServer = true;

                }

                if (t.includes('dialreceiver')) {

                    tv.capabilities.dial = true;

                }

                if (t.includes('remotecontrolreceiver')) {

                    tv.capabilities.samsungRemoteControl = true;

                }

                if (t.includes('maintvserver2')) {

                    tv.capabilities.samsungMainTVAgent = true;

                }

            }

            /*
             * -------------------------------------------------
             * Services auswerten
             * -------------------------------------------------
             */

            for (const service of parsedServices) {

                const type =
                    service.serviceType.toLowerCase();

                /*
                 * AVTransport
                 */
                if (type.includes('avtransport')) {

                    tv.capabilities.avTransport = true;

                    tv.protocols.avTransport = service;

                    /*
                     * SCPD laden und verfügbare Actions ermitteln
                     */
                    if (service.SCPDURL) {

                        const scpd =
                            await getDescription(
                                service.SCPDURL
                            );

                        if (scpd && scpd.data) {

                            const actions =
                                getTags(
                                    scpd.data,
                                    'name'
                                ).map(x =>
                                    x.trim()
                                );

// console.log("===== AVTransport SCPD =====");
// console.log(scpd.data);
// console.log("===== ACTIONS =====");
// console.log(actions);
// console.log("============================");

                            if (actions.includes('SetAVTransportURI'))
                                tv.capabilities.setAVTransportURI = true;

                            if (actions.includes('SetNextAVTransportURI'))
                                tv.capabilities.setNextAVTransportURI = true;

                            if (actions.includes('Play'))
                                tv.capabilities.play = true;

                            if (actions.includes('Stop'))
                                tv.capabilities.stop = true;

                            if (actions.includes('Pause'))
                                tv.capabilities.pause = true;

                            if (actions.includes('Seek'))
                                tv.capabilities.seek = true;

                            if (actions.includes('Next'))
                                tv.capabilities.next = true;

                            if (actions.includes('Previous'))
                                tv.capabilities.previous = true;

                            tv.protocols.avTransport.actions =
                                actions;

                        }

                    }

                }

                /*
                * -------------------------------------------------
                * ConnectionManager
                * -------------------------------------------------
                */
                if (type.includes('connectionmanager')) {

                    // Nur den ersten ConnectionManager verwenden
                    if (tv.protocols.connectionManager) {
                        continue;
                    }

                    tv.protocols.connectionManager = service;

                    /*
                    * SCPD laden und verfügbare Actions ermitteln
                    */
                    if (service.SCPDURL) {

                        const scpd =
                            await getDescription(
                                service.SCPDURL
                            );

                        if (scpd && scpd.data) {

                            const actions =
                                getTags(
                                    scpd.data,
                                    'name'
                                ).map(x =>
                                    x.trim()
                                );

                            tv.protocols.connectionManager.actions =
                                actions;

                        }

                    }
                    /*
                    * Unterstützte MIME-/DLNA-Formate abfragen
                    */
                    const cm = tv.protocols.connectionManager;
                    if (
                        Array.isArray(cm.actions) &&
                        cm.actions.includes('GetProtocolInfo') &&
                        cm.controlURL
                    ) {
                        try {

                            const response =
                                await soapRequest(
                                    cm.controlURL,
                                    cm.serviceType,
                                    'GetProtocolInfo',
                                    ''
                                );

                            const sourceMatch =
                                response.match(/<Source>([\s\S]*?)<\/Source>/i);

                            const sinkMatch =
                                response.match(/<Sink>([\s\S]*?)<\/Sink>/i);

                            const source = sourceMatch
                                ? sourceMatch[1]
                                : '';

                            const sink = sinkMatch
                                ? sinkMatch[1]
                                : '';

                            tv.protocols.connectionManager.protocolInfo = {
                                source: source,
                                sink: sink
                                    .split(',')
                                    .map(x => x.trim())
                                    .filter(Boolean)
                            };
                            console.log("=== GetProtocolInfo ===");

                            // console.log("SOURCE:");
                            // console.log(source);

                            // console.log("SINK:");
                            // console.log(tv.protocols.connectionManager.protocolInfo.sink);
                        }
                        catch (err) {

                            console.log(
                                'GetProtocolInfo Fehler:',
                                err
                            );

                        }
                    }
                }


                /*
                 * RenderingControl
                 */
                if (type.includes('renderingcontrol')) {

                    tv.protocols.renderingControl =
                        service;

                }

                 /*
                 * DIAL
                 */
                if (type.includes('dial')) {

                    tv.capabilities.dial = true;

                    tv.protocols.dial = service;

                }

                /*
                 * Samsung MultiScreenService
                 */
                if (type.includes('multiscreenservice')) {

                    tv.capabilities.samsungRemoteControl = true;

                    tv.protocols.multiScreenService =
                        service;

                }

                /*
                 * Samsung MainTVAgent2
                 */
                if (type.includes('maintvagent2')) {

                    tv.capabilities.samsungMainTVAgent = true;

                    tv.protocols.mainTVAgent =
                        service;

                }

            }

            /*
             * -------------------------------------------------
             * Samsung ProductCap / WebURIPlayable
             * -------------------------------------------------
             */

            if (/WebURIPlayable/i.test(xml)) {

                tv.capabilities.webUriPlayable = true;

            }

            /*
             * Chromecast-Erkennung
             */
            if (
                /googlecast/i.test(xml) ||
                /chromecast/i.test(xml)
            ) {

                tv.capabilities.chromecast = true;

            }

            /*
             * AirPlay-Erkennung
             */
            if (
                /airplay/i.test(xml) ||
                /apple-airplay/i.test(xml)
            ) {

                tv.capabilities.airplay = true;

            }

        }

        /*
         * ---------------------------------------------------------
         * 3. Empfohlenen Übertragungsweg bestimmen
         * ---------------------------------------------------------
         */

        if (
            tv.capabilities.dlnaRenderer &&
            tv.capabilities.avTransport &&
            tv.capabilities.setAVTransportURI &&
            tv.capabilities.play
        ) {

            tv.recommended = 'DLNA_AVTRANSPORT';

        }
        else if (
            tv.capabilities.dlnaRenderer &&
            tv.capabilities.avTransport
        ) {

            tv.recommended = 'DLNA_AVTRANSPORT';

        }
        else if (tv.capabilities.chromecast) {

            tv.recommended = 'CHROMECAST';

        }
        else if (tv.capabilities.airplay) {

            tv.recommended = 'AIRPLAY';

        }
        else if (tv.capabilities.dial) {

            tv.recommended = 'DIAL';

        }
        else if (tv.capabilities.samsungRemoteControl) {

            tv.recommended = 'SAMSUNG_REMOTE';

        }
        else {

            tv.recommended = null;

        }


        /*
         * Nur Geräte zurückgeben, die zumindest irgendeine
         * interessante TV-/UPnP-Funktion anbieten.
         */
        if (
            tv.capabilities.dlnaRenderer ||
            tv.capabilities.dlnaServer ||
            tv.capabilities.dial ||
            tv.capabilities.samsungRemoteControl ||
            tv.capabilities.samsungMainTVAgent ||
            tv.capabilities.chromecast ||
            tv.capabilities.airplay
        ) {

            result.push(tv);
            console.log(
                    "AVTransport CONTROL:",
                    tv.protocols.avTransport &&
                    tv.protocols.avTransport.controlURL
                );
            television = tv
        }
    }
    return result;
}


function soapRequest(controlURL, serviceType, action, body, timeout = 5000) {
    return new Promise((resolve, reject) => {
        try {
            const url = new URL(controlURL);
            const soapBody = `<?xml version="1.0" encoding="utf-8"?>
            <s:Envelope
                xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"
                s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
                <s:Body>
                    <u:${action}
                        xmlns:u="${serviceType}">
                        ${body}
                    </u:${action}>
                </s:Body>
            </s:Envelope>`;
            const data = Buffer.from(soapBody, "utf8");
            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === "https:" ? 443 : 80),
                path: url.pathname + url.search,
                method: "POST",
                headers: {
                    "Content-Type": 'text/xml; charset="utf-8"',
                    "Content-Length": data.length,
                    "SOAPACTION": `"${serviceType}#${action}"`,
                    //"Connection": "close"
                },
                timeout: timeout
            };
            const protocol = url.protocol === "https:" ? https : http;

            // console.log("SOAP:", action);
            // console.log("URL:", controlURL);
            const req = protocol.request(options, (res) => {
                let responseData = "";
                res.setEncoding("utf8");
                res.on("data", chunk => {
                    responseData += chunk;
                });
                res.on("end", () => {
                    console.log(`SOAP ${action}: HTTP ${res.statusCode}`);
                    // -----------------------------------------
                    // HTTP-Fehler
                    // -----------------------------------------
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        console.log(`SOAP ${action}: HTTP ERROR ${res.statusCode}`);
                        console.log(responseData);
                        // SOAP Fault auslesen
                        const errorCode =
                            responseData.match(
                                /<errorCode>(.*?)<\/errorCode>/i
                            );
                        const errorDescription =
                            responseData.match(
                                /<errorDescription>(.*?)<\/errorDescription>/i
                            );
                        const fault = {
                            action: action,
                            statusCode: res.statusCode,
                            errorCode:
                                errorCode ? errorCode[1] : null,
                            errorDescription:
                                errorDescription
                                    ? errorDescription[1]
                                    : null,
                            response: responseData
                        };
                        reject(fault);
                        return;
                    }

                    // -----------------------------------------
                    // SOAP Fault trotz HTTP 200
                    // -----------------------------------------
                    if (
                        responseData.includes("<s:Fault>") ||
                        responseData.includes("<SOAP-ENV:Fault>")
                    ) {
                        const errorCode =
                            responseData.match(
                                /<errorCode>(.*?)<\/errorCode>/i
                            );
                        const errorDescription =
                            responseData.match(
                                /<errorDescription>(.*?)<\/errorDescription>/i
                            );
                        reject({
                            action: action,
                            statusCode: res.statusCode,
                            errorCode:
                                errorCode ? errorCode[1] : null,
                            errorDescription:
                                errorDescription
                                    ? errorDescription[1]
                                    : null,
                            response: responseData
                        });
                        return;
                    }

                    // -----------------------------------------
                    // Erfolgreich
                    // -----------------------------------------
                    resolve(responseData);
                });
            });

            // ---------------------------------------------
            // Timeout
            // ---------------------------------------------

            req.on("timeout", () => {

                req.destroy();

                reject({
                    action: action,
                    errorCode: "TIMEOUT",
                    errorDescription:
                        "SOAP request timed out",
                    response: ""
                });
            });

            // ---------------------------------------------
            // Netzwerkfehler
            // ---------------------------------------------

            req.on("error", (err) => {

                reject({
                    action: action,
                    errorCode: "NETWORK",
                    errorDescription: err.message,
                    response: ""
                });
            });

            req.write(data);
            req.end();

        } catch (err) {

            reject({
                action: action,
                errorCode: "EXCEPTION",
                errorDescription: err.message,
                response: ""
            });
        }
    });
}


async function playViaDLNA(tv, filename) {
    const mediaURL = `http://192.168.2.140:8000/mediaShow/${encodeURIComponent(filename)}`;
    console.log("playViaDLNA: ",filename);
    /*
     * ---------------------------------------------------------
     * TV auswählen
     * ---------------------------------------------------------
     */

    if (Array.isArray(tv)) {

        tv = tv.find((entry) => {

            const caps =
                entry && entry.capabilities
                    ? entry.capabilities
                    : {};

            const av =
                entry &&
                entry.protocols &&
                entry.protocols.avTransport;

            const hasAvCtrl =
                !!(av && av.controlURL);

            return (
                !!caps.dlnaRenderer &&
                !!caps.avTransport &&
                !!caps.setAVTransportURI &&
                !!caps.play &&
                hasAvCtrl
            );

        }) || tv[0];
    }

    if (!tv) {
        throw new Error("Kein TV angegeben");
    }


    /*
     * ---------------------------------------------------------
     * Fähigkeiten prüfen
     * ---------------------------------------------------------
     */

    if (
        !tv.capabilities ||
        !tv.capabilities.dlnaRenderer ||
        !tv.capabilities.avTransport ||
        !tv.capabilities.setAVTransportURI ||
        !tv.capabilities.play
    ) {

        throw new Error(
            `TV "${tv.name || tv.ip}" unterstützt kein DLNA_AVTRANSPORT`
        );
    }

    await setAVTransportURI(filename)

    await playDLNA()

    return {
        ok: true,
        method: "DLNA_AVTRANSPORT",
        tv: tv.name || tv.ip,
        url: mediaURL
    };
}


async function playDLNA() {
    console.log("DLNA: Play");
    try {
        await soapRequest(
            resultTVPlayable[tvNum].protocols.avTransport.controlURL,
            resultTVPlayable[tvNum].protocols.avTransport.serviceType,
            "Play",
            `
            <InstanceID>0</InstanceID>
            <Speed>1</Speed>
            `
        );
        console.log("DLNA: Wiedergabe gestartet");
    } catch (err) {
        console.error(
            "Play Fehler:",
            err
        );
        throw new Error(
            `DLNA Play fehlgeschlagen: ${
                err.errorDescription ||
                err.message ||
                "unbekannter Fehler"
            }`
        );
    }
}

async function getMediaInfo(){
    console.log("DLNA: GetMediaInfo");
    try {
        const mediaInfo =
            await soapRequest(
                resultTVPlayable[tvNum].protocols.avTransport.controlURL,
                resultTVPlayable[tvNum].protocols.avTransport.serviceType,
                "GetMediaInfo",
                `
                <InstanceID>0</InstanceID>
                `
            );
        console.log("DLNA GetMediaInfo:"+mediaInfo);
    } catch (err) {
        console.log("DLNA GetMediaInfo ERROR:"+err);
    }
}

async function getTransportInfo(){
    console.log("DLNA: GetTransportInfo");
    try {
        const transportInfo =
            await soapRequest(
                resultTVPlayable[tvNum].protocols.avTransport.controlURL,
                resultTVPlayable[tvNum].protocols.avTransport.serviceType,
                "GetTransportInfo",
                `
                <InstanceID>0</InstanceID>
                `
            );
        console.log("DLNA GetTransportInfo:"+transportInfo);
    } catch (err) {
        console.log("DLNA GetTransportInfo ERROR:"+err);
    }
}


async function nextDLNA(tv) {
    // const avTransport = tv.protocols && tv.protocols.avTransport;
    // if (!avTransport || !avTransport.controlURL) {
    //     throw new Error("Kein AVTransport controlURL vorhanden");
    // }
    // const serviceType =
    //     avTransport.serviceType ||
    //     "urn:schemas-upnp-org:service:AVTransport:1";
    console.log("DLNA: Next");
    await soapRequest(
        resultTVPlayable[tvNum].protocols.avTransport.controlURL,
        resultTVPlayable[tvNum].protocols.avTransport.serviceType,
        "Next",
        `
        <InstanceID>0</InstanceID>
        `
    );
    console.log("DLNA: Next erfolgreich");
    return true;
}

async function setAVTransportURI(filename){
    const mediaURL =
        `http://192.168.2.140:8000/mediaShow/${encodeURIComponent(filename)}`;

    try {
        await soapRequest(
            resultTVPlayable[tvNum].protocols.avTransport.controlURL,
            resultTVPlayable[tvNum].protocols.avTransport.serviceType,
            "SetAVTransportURI",
            `
            <InstanceID>0</InstanceID>
            <CurrentURI>${escapeXML(mediaURL)}</CurrentURI>
            <CurrentURIMetaData></CurrentURIMetaData>
            `,
            15000
        );
        console.log("DLNA: SetAVTransportURI erfolgreich");

    } catch (err) {
        console.error(
            "SetAVTransportURI Fehler:",
            err
        );
        throw new Error(
            `SetAVTransportURI fehlgeschlagen: ${
                err.errorDescription ||
                err.message ||
                "unbekannter Fehler"
            }`
        );
    }
}


async function setNextAVTransportURI(tv, filename) {
    const mediaURL = `http://192.168.2.140:8000/mediaShow/${encodeURIComponent(filename)}`;

    console.log("DLNA: SetNextAVTransportURI");
    console.log("DLNA Next URL:", mediaURL);

    await soapRequest(
        resultTVPlayable[tvNum].protocols.avTransport.controlURL,
        resultTVPlayable[tvNum].protocols.avTransport.serviceType,
        "SetNextAVTransportURI",
        `
        <InstanceID>0</InstanceID>
        <NextURI>${escapeXML(mediaURL)}</NextURI>
        <NextURIMetaData></NextURIMetaData>
        `
    );
    console.log("DLNA: SetNextAVTransportURI erfolgreich");
    return {
        ok: true,
        method: "DLNA_SetNextAVTransportURI",
        tv: tv.name || tv.ip,
        url: mediaURL
    };
}


async function waitUntilStopped(tv, timeout = 3600000) {
    console.log("Warte auf Videoende...");
    // Wichtig: dem TV Zeit geben, den Play-Zustand aufzubauen
    await sleep(2000);
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const response =
                await soapRequest(
                    resultTVPlayable[tvNum].protocols.avTransport.controlURL,
                    resultTVPlayable[tvNum].protocols.avTransport.serviceType,
                    "GetTransportInfo",
                    `
                    <InstanceID>0</InstanceID>
                    `
                );
            const match =
                response.match(
                    /<CurrentTransportState>(.*?)<\/CurrentTransportState>/
                );
            const state =
                match ? match[1] : "";

            //console.log("MediaShow TV TransportState:",state);
            if (state === "STOPPED") {

                // console.log(
                //     "MediaShow: Video beendet"
                // );

                return;
            }
        } catch (err) {
            console.log(
                "GetTransportInfo Fehler:",
                err
            );
        }
        await sleep(1000);
    }

    throw new Error(
        "MediaShow: Video Timeout"
    );
}


async function stopDLNA() {
    // const av = television.protocols.avTransport;
    // if (!av || !av.controlURL) {
    //     throw new Error("Kein AVTransport controlURL vorhanden");
    // }
    await soapRequest(
        resultTVPlayable[tvNum].protocols.avTransport.controlURL,
        resultTVPlayable[tvNum].protocols.avTransport.serviceType,
        "Stop",
        `
        <InstanceID>0</InstanceID>
        `
    );
    console.log("DLNA: Wiedergabe gestoppt");

    const stopped = await waitUntilStopped(television);

    if (!stopped) {
        throw new Error(
            "DLNA: Fernseher wurde innerhalb des Timeouts nicht geSTOPPED"
        );
    }
    console.log("DLNA: Media STOPPED");    
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeXML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}


module.exports = detectTV;
module.exports.playViaDLNA = playViaDLNA;
module.exports.waitUntilStopped = waitUntilStopped;
module.exports.stopDLNA = stopDLNA;
module.exports.sleep = sleep;
module.exports.setNextAVTransportURI = setNextAVTransportURI;
module.exports.nextDLNA = nextDLNA;
module.exports.getMediaInfo = getMediaInfo;
module.exports.getTransportInfo = getTransportInfo;