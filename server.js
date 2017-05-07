var finalhandler = require('finalhandler');
var http  = require('http');
var bodyParser = require('body-parser');
var Router = require('router');
var dash = require('./dash.js');
var jsonParser = bodyParser.json();

var PORT = 8080;

var router = Router();
router.get('/', function (req, res) {
	res.setHeader('Content-Type', 'text/plain; charset=utf-8');
	res.end('Hello World!');
});
router.get('/test', dash.test);
router.post('/transcribe', jsonParser, dash.transcribe);


var server = http.createServer(function(req, res) {
	router(req, res, finalhandler(req, res));
});

server.listen(PORT);
