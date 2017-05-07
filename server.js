var connect = require('connect');
var connectRoute = require('connect-route');
var finalhandler = require('finalhandler');
var http  = require('http');
var bodyParser = require('body-parser');
var dash = require('./dash.js');

var PORT = 8080;

var app = connect();

var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({extended: false}));
app.use(connectRoute(function(router) {
  router.get('/', function(req, res) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Hello World!');
  });
  router.post('/transcribe', dash.transcribe);
}));

http.createServer(app).listen(PORT);
