var connect = require('connect');
var finalhandler = require('finalhandler');
var http  = require('http');
var bodyParser = require('body-parser');
var dash = require('./dash.js');
var Router = require('router');

var PORT = 8080;

var app = connect();
var router = Router();

app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(bodyParser.json({limit: '50mb'}));
app.use(function(req, res) {
	router(req, res, finalhandler(req, res));
});

router.get('/', function(req, res) {
  res.end('test');
});
router.post('/transcribe', function(req, res) {
	dash.transcribe(req, res);
});
http.createServer(app).listen(PORT);

process.on('uncaughtException', function (err) {
  console.log('Error : ', err);
	dash.leave_log(err + '\n');
});
