var connect = require('connect');
var finalhandler = require('finalhandler');
var http  = require('http');
var bodyParser = require('body-parser');
var dash = require('./dash.js');
var Router = require('router');

var PORT = 8080;

var app = connect();
var router = Router();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(function(req, res) {
	router(req, res, finalhandler(req, res));
});

router.get('/', function(req, res) {
  res.end('test');
});
router.post('/transcribe', dash.transcribe);

// var fs = require('fs');
// fs.readFile('../base', 'utf-8', function(err, data) {
// 	dash.transcribe({body: {
// 		msg: data,
// 		security_key: 'ZGFzaGJlbGxwcm9qZWN0'
// 	}});
// });


http.createServer(app).listen(PORT);
