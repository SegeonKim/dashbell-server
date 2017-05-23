var mecab = require('mecab-ffi');
var speech = require('@google-cloud/speech')({
	projectId: 'capstone-dash',
	keyFilename: __dirname + '/dashbell_server_key.json'
});
var fs = require('fs');
var async = require('async');
var classification_source = require('./classification_source.json');

module.exports = {
	transcribe: function(req, res) {
		var self = this;
		var msg = req.body.msg;
		var security_key = req.body.security_key;
		var result = {
			result: 'false',
			key_code: '',
			option_code: '',
			time: '',
			result_string: ''
		};
		var sentence = '';

		if (security_key != 'ZGFzaGJlbGxwcm9qZWN0') {
			console.log('Uncorrected security key');
			res.end(JSON.stringify(result));
		} else {
			async.waterfall([
				function(next) {
				// 	self.google_speech_api(msg, next); // google speech api로 목소리 분석
				// }, function(str, next) {
					console.log('Sentence : ', msg);
					sentence = msg;
					next(null, msg);
				}, function(msg, next) {
					self.check_stop(msg, next);
				}, function(msg, next) {
					self.do_mecab(msg, next); // 형태소 분석
				}, function(msg, next) {
					console.log('형태소 : ', msg);
					self.parse(msg, next);
				}, function(msg, next) {
					self.make_result_string(msg, next);
				}, function(msg, next) {
					self.make_keycode(msg, next);
				},
			], function(err, data) {
				if (!err) {
					result.result = 'true';
					result.key_code = data.key_code;
					result.option_code = data.option_code;
					result.result_string = data.result_string;
					if (data.time) {
						result.time = data.time;
					}
				} else if (err && err == 'stop') {
					result.result = 'true';
					result.key_code = 400;
					result.result_string = '대시가 정지합니다.';
				} else if (err && sentence) {
					result.result_string = '다시 한번 말해주세요.';
					self.leave_log(err + '\n' + sentence + '\n');
				}

				console.log('result : ',result);
				res.end(JSON.stringify(result));
			});
		}
	},

	google_speech_api: function(msg, callback) {
		var config = {
			'encoding':'LINEAR16',
			'sampleRateHertz':16000,
			'languageCode':'ko-KR'
		};
		var content = {
			'content': msg
		};

		speech.recognize(content, config, function(err, transcript, apiResponse) {
			if (!err) {
				callback(null, transcript);
			} else {
				console.log('google speech api err :', err);
				callback(err);
			}
		});
	},

	do_mecab: function(msg, callback) {
		var result = [];

		mecab.parse(msg, function(err, res) {
			if (err) {
				console.log('Mecab Parse error :', err);
				callback(err);
			} else {
				for (var i = 0; i < res.length; i++) {
					result.push(res[i][0]);
				}
				callback(null, result);
			}
		});
	},

	parse: function(msg, callback) {
		var self = this;
		var key_code = null;
		var command = {
			subject: '',
			option: '',
			action: ''
		};
		var is_light = null

		async.waterfall([
			function(next) {
				self.get_subject(msg, next); // 주체 찾기
			},
			function(subject, next) {
				command.subject = subject;
				is_light = subject.indexOf('light') > -1 ? true : false;
				self.get_action({ // 동작 찾기
					msg: msg,
					option: is_light
				}, next);
			},
			function(action, next) {
				command.action = action;

				if (is_light && action == 'light_change') { // 라이트 색깔 바꾸는 경우 무슨 색인지 받아오기
					self.get_color(msg, function(err, color) {
						command.option = color;
						next(err || null);
					});
				} else if (!is_light) { // move or turn 경우 방향과 거리 받아오기
					self.get_direction(msg, function(err, direction) {
						if (err) {
							next(err);
						} else {
							command.option = direction;
							if (action == 'move') {
								self.get_distance(msg, function(distance) {
									command.distance = distance;
									next();
								});
							} else {
								next();
							}
						}
					});
				} else {
					next(); // 라이트 끄고 켜기
				}
			}
		], function(err) {
			if (err) {
				callback(err);
			} else {
				callback(null, command);
			}
		});
	},

	get_subject: function(msg, callback) {
		var subject = '';

		async.map(classification_source.subject.light, function(light, next) {
			if (msg.indexOf(light) > -1) {
				next(true);
			} else {
				next();
			}
		}, function(is_light) {
			async.map(classification_source.subject.head, function(head, next) {
				if (msg.indexOf(head) > -1) {
					next(true);
				} else {
					next();
				}
			}, function(is_head) {
				if (is_light) {
					subject = is_head ? 'head_light' : 'body_light';
				} else {
					subject = is_head ? 'head' : 'body';
				}
				callback(null, subject);
			});
		});
	},

	get_action: function(options, callback) {
		var msg = options.msg;
		var is_light = options.option;
		var action = '';

		if (is_light) {
			async.map(classification_source.action.light_change, function(change, next) {
				if (msg.indexOf(change) > -1) {
					next(true);
				} else {
					next();
				}
			}, function(is_change) {
				if (is_change) {
					callback(null, 'light_change');
				} else {
					async.map(classification_source.action.light_on, function(on, next) {
						if (msg.indexOf(on) > -1) {
							next(true);
						} else {
							next();
						}
					}, function(is_on) {
						if (is_on) {
							callback(null, 'light_on');
						} else {
							async.map(classification_source.action.light_off, function(off, next) {
								if (msg.indexOf(off) > -1) {
									next(true);
								} else {
									next();
								}
							}, function(is_off) {
								if (is_off) {
									callback(null, 'light_off');
								} else {
									callback('get_action no light action:221');
								}
							});
						}
					});
				}
			});
		} else {
			async.map(classification_source.action.forward, function(forward, next) {
				if (msg.indexOf(forward) > -1) {
					next(true);
				} else {
					next();
				}
			}, function(is_forward) {
				if (is_forward) {
					callback(null, 'move');
				} else {
					async.map(classification_source.action.turn, function(turn, next) {
						if (msg.indexOf(turn) > -1) {
							next(true);
						} else {
							next();
						}
					}, function(is_turn) {
						if (is_turn) {
							callback(null, 'turn');
						} else {
							callback('get_action no turn no move:250');
						}
					});
				}
			});
		}
	},

	get_color: function(msg, callback) {
		var color_str = '';
		var color = '';

		async.map(classification_source.all_color, function(list, next) {
			if (msg.indexOf(list) > -1) {
				color_str = msg[msg.indexOf(list)];
				next(true);
			} else {
				next();
			}
		}, function(is_color) {
			if (is_color) {
				async.forEachOf(classification_source.color, function(value, key, next) {
					if (value.indexOf(color_str) > -1) {
						color = key;
						next(true);
					} else {
						next();
					}
				}, function(checked) {
					if (checked) {
						callback(null, color);
					} else {
						callback('get_color no_color:282');
					}
				});
			} else {
				callback('get_color no color:286');
			}
		});
	},

	get_direction: function(msg, callback) {
		var direction = '';

		async.forEachOf(classification_source.direction, function(value, key, next) {
			async.map(value, function(dir, cb) {
				if (msg.indexOf(dir) > -1) {
					cb(true);
				} else {
					cb();
				}
			}, function(exist) {
				if (exist) {
					direction = key;
					next(true);
				} else {
					next();
				}
			});
		}, function(find) {
			if (find) {
				callback(null, direction);
			} else {
				callback('get_direction no direction:313');
			}
		});
	},

	get_distance: function(msg, callback) {
		var self = this;
		var distance = null;

		async.map(msg, function(data, next) {
			var int_data = parseInt(data, 10);
			if (int_data > 0) {
				distance = int_data;
				next(true);
			} else {
				next();
			}
		}, function(exist) {
			if (exist) {
				self.get_unit(msg, function(unit) {
					callback([distance, unit]);
				});
			} else {
				callback('no_distance');
			}
		});
	},

	get_unit: function(msg, callback) {
		var unit = '';
		async.map(classification_source.unit, function(units, next) {
			if (msg.indexOf(units) > -1) {
				unit = units
				next(true);
			} else {
				next();
			}
		}, function(exist) {
			callback(unit || 'cm');
		});
	},

	check_stop: function(msg, callback) {
		async.map(classification_source.stop, function(data, next) {
			if (msg.indexOf(data) > -1) {
				next(true);
			} else {
				next();
			}
		}, function(stop) {
			if (stop) {
				callback('stop');
			} else {
				callback(null, msg);
			}
		});
	},

	make_keycode: function(command, callback) {
		console.log('Finish : ', command);
		var subject = command.subject;
		var action = command.action;
		var option = command.option;
		var distance = command.distance;
		var exist_distance = typeof(distance) == 'object' ? true : false;
		var key_code = '';
		var option_code = '';
		var return_code = {
			key_code: '',
			option_code: '',
			time: '',
			result_string: ''
		};

		var subject_key = {
			body: 1,
			head: 2,
			head_light: 3,
			body_light: 4
		};
		var action_key = {
			move: 1,
			turn: 2
		};

		var move_time = '';
		var move_velocity = '';

		if (exist_distance) {
			distance = distance[1] == 'cm' ? distance[0] : distance[0] * 100;
			move_time = (parseInt((distance / 100), 10) + 1) * 2;
			move_velocity = distance / move_time;
			move_velocity = move_velocity.toFixed(2);
			return_code.time = move_time;
		} else {
			move_velocity = 50;
		}
		var turn_velocity = 360; // 360degree/s

		var option_key = {
			11: { // body_move_velocity_key
				front: move_velocity,
				back: (-1) * move_velocity
			},
			12: { // body_turn_velocity_key
				left: turn_velocity,
				right: (-1) * turn_velocity,
				back: turn_velocity
			},
			22: { // head_turn_degree_key
				left: 90,
				right: -90,
				front: 0
			},
			23: {
				front: 0,
				up: -20,
				down: 7
			},
			3: { // light_toggle_key
				light_on: 1,
				light_off: 0
			},
			4: { // light_color_key
				red: '100',
				blue: '001',
				yellow: '110',
				green: '010',
				white: '111'
			}
		};

		if (action == 'turn' && option == 'front') {
			subject = 'head';
		}

		key_code += subject_key[subject];

		if (action == 'light_on' || action == 'light_off') {
			key_code = '3';
			option = action;
		}
		if (action == 'light_change') {
			key_code = '4';
		}

		if (subject == 'body') {
			if (action == 'turn' && option == 'front') {
				subject = 'head';
			} else {
				key_code += action_key[action];
			}
		}
		if (subject == 'head') {
			key_code += option == 'left' || option == 'right' ? 2 : 3;
		}

		option_code = option_key[key_code][option];

		if (key_code == '12') {
			if (option == 'back') {
				return_code.time = 2;
			} else {
				return_code.time = 1.3;
			}
			return_code.time = return_code.time.toString();
		}

		return_code.key_code = key_code;
		return_code.option_code = option_code.toString();
		return_code.result_string = command.result_string;

		callback(null, return_code);
	},

	make_result_string: function(msg, callback) {
		var action = msg.action;
		var subject = msg.subject;
		var option = msg.option;
		var distance = msg.distance;
		var result_string = '대시가 ';


		switch(action) {
			case 'move':
				if (option == 'front') {
					result_string += '앞으로 ';
				} else {
					result_string += '뒤로 ';
				}

				if (typeof(distance) == 'object') {
					result_string += distance[0] + (distance[1] == 'cm' ? 'cm' : 'm') + ' ';
				}

				result_string += '이동합니다.';
				break;
			case 'turn':
				if (subject == 'head') {
					result_string += '머리를 ';
				}

				switch(option) {
					case 'front':
						result_string += '정면으로 ';
						break;
					case 'left':
					 	result_string += '왼쪽으로 ';
						break;
					case 'right':
						result_string += '오른쪽으로 ';
						break;
					case 'up':
						result_string += '위쪽으로 ';
						break;
					case 'down':
						result_string += '아래쪽으로 ';
						break;
				}

				if (subject == 'head') {
					result_string += '돌립니다.';
				} else {
					result_string += '돌아섭니다.';
				}
				break;
			case 'light_change':
				result_string += '불빛의 색깔을 ';

				var color_key = {
					red: '빨간색',
			    blue: '파란색',
			    yellow: '노란색',
			    green: '초록색',
			    white: '흰색'
				};

				result_string += color_key[option] + '으로 바꿉니다.';
				break;
			case 'light_on':
				result_string += '눈의 불빛을 켭니다.';
				break;
			case 'light_off':
				result_string += '눈의 불빛을 끕니다.';
				break;
		}

		msg.result_string = result_string;

		callback(null, msg);
	},

	leave_log: function(sentence) {
		fs.appendFile(__dirname + '/unparsed_log.txt', sentence + '\n', function(err) {
			if (err) {
				console.log('Fail to write err log');
			}
		});
	}
};
