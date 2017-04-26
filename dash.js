var mecab = require('mecab-ffi');

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

	}
};


