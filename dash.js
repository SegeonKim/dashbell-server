var mecab = require('mecab-ffi');
var speech = require('@google-cloud/speech')({
	projectId: 'capstone-dash',
	keyFilename: './dashbell_server_key.json'
});

/*
var result = mecab.parseSync(paragraph);
console.log('형태소 분석2\n', result);

// 명사 추출
mecab.extractNounMap(paragraph, function(err, result) {
    console.log('명사 추출\n', result);
});
*/


module.exports = {
	test: function(req, res) {
		var paragraph = '대시 10cm 앞으로 가';
		var result = [];
		// 형태소 분석
		mecab.parse(paragraph, function(err, res) {
			for (var i = 0; i < res.length; i++) {
				result.push(res[i][0]);
			}
			console.log('\n  ' + paragraph + '\n\n  ');
			console.log(result);
			console.log('\n\n');
		});

		res.end('test!');

	},

	google_api: function(req, res) { // 임시 함수
		var encoded_data = '';
		var config = {
			'encoding':'FLAC',
			'sampleRateHertz':16000,
			'languageCode':'ko-KR'
		};
		var content = {
			'content': encoded_data
		};

		speech.recognize(content, config, function(err, transcript, apiResponse) {
			if (!err) {
				console.log('transcript : ', transcript);
				console.log('apiResponse : ', apiResponse);
			} else {
				console.log('err!', err);
			}
		});
	},

	transcribe: function(req, res) {
		console.log('body : ', req.body);
		res.json({result: false});
		// var msg = req.body.msg;
		// var security_key = req.body.security_key;
		// var result = {
		// 	result: false,
		// 	key_code: 0
		// }
		// console.log('security_key : ', security_key);
		//
		// if (security_key != 'ZGFzaGJlbGxwcm9qZWN0') {
		// 	res.json(result);
		// } else {
		// 	res.json(result);
		// }
	}
};
