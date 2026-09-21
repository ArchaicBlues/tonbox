/*
Jede Server-Sent-Event Antwort vom Client muss entspechend beantwortet werden bevor ein neues SSE vom Server gesendet werden kann 

Server sendet msg --> Client antwortet --> Server antwortet Client damit Verbindung erhalten bleibt
*/

/*
Lodash makes JavaScript easier by taking the hassle out of working with arrays, numbers, objects, strings, etc. 
Lodash’s modular methods are great for: Iterating arrays, objects, & strings; Manipulating & testing values; 
Creating composite functions. Module Formats. Lodash is available in a variety of builds & module formats.
*/
const _ = require('lodash');
	
/**
 * The constructor.
 *
 * @param {Object} response
 * @param {Object} options
 * @return {SSE}
 * @constructor
 */
  
function SSE(response, options) {
    //console.log("SSE entry")

    if (!(this instanceof SSE)) {
      return new SSE(response, options);
    }
    
    options = _.defaults({}, options, {
      retry: 10000,
    });
    
    this.response = response;

    //console.log("SSE response")
    //..Then the server will receive the request. To indicate that the response will be an event-stream, 
    //the server has to return a response with the following headers
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Connection': 'keep-alive'
    });
    
    response.write(`:${Array(2049).join(' ')}\n`); // 2kB padding for IE
    // Set time before retry if connection error.
    // This need to be set before sending any message.
    response.write(`retry: ${options.retry}\n`);
}
  
/**
 * Send message.
 *
 * @param {*} id
 * @param {*} data
 */
// SSE.prototype.write = function (id, data) {
//   this.response.write(`id: ${id}\n`);
//   this.response.write(`data: ${data}\n\n`);
// };
SSE.prototype.write = function (data) {
  this.response.write(`data: ${data}\n\n`);
};
  
/**
 * End connection.
 *
 * @param {*} data
 */
SSE.prototype.end = function (data) {
  this.response.write('event: result\n');
  this.response.write(`data: ${data}\n\n`);
  this.response.end();
};

module.exports = SSE;
