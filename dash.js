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
		var mode = req.body.mode || null;
		//var msg = '오른쪽으로 돌아';
		//var security_key = 'ZGFzaGJlbGxwcm9qZWN0';
		//var mode = null;
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
					if (mode == 'launcher') {
						self.launcher_parse(msg, next);
					} else {
						next(null, msg);
					}
				}, function(msg, next) {
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
					} else {
						result.time = 5.0;
					}
				} else if (err == 'launcher') {
					result.result = 'true';
					result.key_code = data.key_code;
					result.result_string = data.result_string;
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
							if (command.action == 'turn') {
								command.option = 'left';
								self.get_distance(msg, function(distance) {
									command.distance = distance;
									next();
								});
							} else {
								next(err);
							}
						} else {
							command.option = direction;
							self.get_distance(msg, function(distance) {
								command.distance = distance;
								next();
							});
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
		var unit = '';
		var index = 0;
		var int_data = 0;
		async.map(classification_source.unit, function(units, next) {
			if(msg.indexOf(units) > -1){
				distance = msg[msg.indexOf(units) - 1];
				unit = units;
				if(unit == '칸' || unit == '번') {
					if(parseInt(distance, 10) > 0) {
							int_data = 10 * parseInt(distance, 10);
							next(true);
					} else {
						self.get_number(distance, function(answer) {
							int_data = 10 * answer;
							next(true);
						});
					}
				} else if (unit == '바퀴') {
					if(parseInt(distance, 10) > 0) {
						int_data = parseInt(distance, 10);
						next(true);
					} else {
						self.get_number(distance, function(answer) {
							int_data = answer;
							next(true);
						});
					}
				} else {
					int_data = parseInt(distance, 10);
					next(true);
				}
			} else {
				next();
			}
		}, function(exist) {
			if (exist) {
					callback([int_data, unit]);
			} else {
				callback('no_distance');
			}
		});
		/*
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
		});*/
	},

	get_number: function(unit, callback) {
		var num = 0;
		var num_key = {
			'한': 1,
			'두': 2,
			'세': 3,
			'네': 4,
			'다섯': 5,
			'여섯': 6,
			'일곱': 7,
			'여덟': 8,
			'아홉': 9,
			'열': 10
		}
		callback(parseInt(num_key[unit], 10));
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


		var turn_velocity = 360; // 360degree/s

		if (exist_distance) {
			if (distance[1] == 'cm'){
				distance = distance[0];
			}	else if (distance[1] == '번') {
				if (action == 'move') {
					distance = distance[0];
				} else if (action == 'turn') {
					distance = distance[0] / 10;
				}
			} else if (distance[1] == '칸') {
				distance = distance[0];
			} else if (distance[1] == '바퀴') {
				distance = distance[0];
			} else {
				distance = distance[0] * 100;	// check meter
			}
			//distance = distance[1] == 'cm' ? distance[0] : distance[0] * 100;  '칸' 추가 하기 전
			// move_time = (parseInt((distance / 100), 10) + 1) * 2;
			// move_velocity = distance / move_time;
			move_time = parseInt((distance / 31), 10) * 0.5 + 2;
			var x = parseInt((distance / 20), 10);
			move_velocity = (distance + x + 5.2 + (121/15)*(1-Math.pow(8/11, x))) / move_time;
			move_velocity = move_velocity.toFixed(2);
			return_code.time = move_time;
		} else {
			move_velocity = '30.00';
		}

		var option_key = {
			11: { // body_move_velocity_key
				front: move_velocity,
				back: '-' + move_velocity
			},
			12: { // body_turn_velocity_key
				left: '180.0',
				right: '-180.0',
				back: '180.0'
			},
			22: { // head_turn_degree_key
				left: '90',
				right: '-90',
				front: '0'
			},
			23: {
				front: '0',
				up: '-20',
				down: '7'
			},
			3: { // light_toggle_key
				light_on: '1',
				light_off: '0'
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
			if (exist_distance) {
				if (command.distance[1] == '바퀴' || command.distance[1] == '번') {
					return_code.time = 2.38 * distance;
				} else if (option == 'back') {
					return_code.time = 1.32 * distance;
				} else {
					return_code.time = 0.82 * distance;
				}
			} else {
				if (command.distance[1] == '바퀴' || command.distance[1] == '번') {
					return_code.time = 2.38;
				} else if (option == 'back') {
					return_code.time = 1.32;
				} else {
					return_code.time = 0.82;
				}
			}
			return_code.time = return_code.time.toFixed(3).toString();
		}
/*
		if (key_code == '11' && exist_distance) {
			console.log('\n\n' + distance + '\n\n');
			var tmp_opt;
			var tmp_time;

			switch (distance) {
       	case 10:
         	tmp_opt = '7.6';
         	tmp_time = '2.0';
         	break;
       	case 20:
         	tmp_opt = '13.7';
         	tmp_time = '2.0';
         	break;
       	case 30:
         	tmp_opt = '18.7';
         	tmp_time = '2.0';
         	break;
       	case 40:
         	tmp_opt = '19.6';
         	tmp_time = '2.5';
         	break;
       	case 50:
         	tmp_opt = '23.6';
         	tmp_time = '2.5';
         	break;
			}

			option_code = tmp_opt;
			return_code.time = tmp_time;
		}
*/
		return_code.key_code = key_code;
		if (option_code == 'NaN') {
			option_code = '30.00';
		}
		return_code.option_code = option_code ? (typeof(option_code) == 'string' ? option_code : option_code.toString()) : '';
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
				console.log("distance : ",distance[0]);
				if (typeof(distance) == 'object') {
					if (distance[0] != NaN) {
						if (distance[1] == '칸') {
							result_string += (distance[0] / 10) + '칸' + ' ';
						} else if (distance[1] == '번') {
							result_string += (distance[0] / 10) + '번' + ' ';
						} else if (distance[1] == '바퀴') {
							result_string += distance[0] + '바퀴' + ' ';
						} else if (distance[1] == 'cm'){
							result_string += distance[0] + 'cm' + ' ';
						} else {
							result_string += distance[0] + 'm' + ' ';
						}
					} else {

					}
					//result_string += distance[0] + (distance[1] == 'cm' ? 'cm' : 'm') + ' ';
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
					result_string += ''
				}

				if (subject == 'head') {
					result_string += '돌립니다.';
				} else {
					if (distance[1] == '번') {
						result_string += (distance[0] / 10) + '번' + ' ';
					} else if (distance[1] == '바퀴') {
						result_string += distance[0] + '바퀴' + ' ';
					}
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

	launcher_parse: function(msg, callback) {
		var res = {
			key_code: '',
			result_string: ''
		};

		async.map(classification_source.launcher, function(launch, next) {
			if (msg.indexOf(launch) > -1) {
				next(true);
			} else {
				next();
			}
		}, function(is_launcher) {
			if (is_launcher) {
				res.key_code = '51';
				res.result_string = '대시가 공을 발사합니다.';
				callback('launcher', res);
			} else {
				async.map(classification_source.reload, function(reload, next) {
					if (msg.indexOf(reload) > -1) {
						next(true);
					} else {
						next();
					}
				}, function(is_reload) {
					if (is_reload) {
						res.key_code = '52';
						res.result_string = '대시가 공을 장전합니다.';
						callback('launcher', res);
					} else {
						res.result = false;
						callback(null, msg);
					}
				});
			}
		});
	},

	leave_log: function(sentence) {
		fs.appendFile(__dirname + '/unparsed_log.txt', sentence + '\n', function(err) {
			if (err) {
				console.log('Fail to write err log');
			}
		});
	}
};
