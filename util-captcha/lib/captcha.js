var path = require('path'),
	moment = require('moment'),
	gm = require('gm');

var colors = ['#D80D6A', '#07ACD8', '#D93822', '#00A18F'],
	randxy = [{
		x: [1, 21, 41, 61],
		y: [30, 20, 30, 25]
	}, {
		x: [5, 21, 45, 61],
		y: [25, 15, 25, 25]
	}, {
		x: [8, 16, 41, 65],
		y: [30, 20, 25, 20]
	}, {
		x: [5, 20, 40, 50],
		y: [15, 16, 28, 15]
	}, {
		x: [5, 18, 46, 62],
		y: [32, 22, 30, 20]
	}, {
		x: [8, 15, 41, 50],
		y: [28, 25, 25, 25]
	}, {
		x: [4, 16, 38, 50],
		y: [25, 15, 15, 20]
	}, {
		x: [5, 18, 40, 50],
		y: [21, 30, 35, 15]
	}, {
		x: [10, 20, 30, 50],
		y: [30, 20, 30, 25]
	}, {
		x: [1, 20, 35, 54],
		y: [20, 15, 30, 18]
	}];

function create_pic(text, writeStream, fn) {
	var pic = gm(path.join(__dirname, "./template.jpg"))
		.font("Arial.ttf", 24);
	text = text || ('' + Math.random()).substr(2, 4);
	var xy = randxy[parseInt(Math.random() * 10)];
	for (var i = 0; i < text.length; i++) {
		var ci = colors[parseInt(Math.random() * 10 % 4)];
		pic.fill(ci).drawText(xy.x[i], xy.y[i], text[i]);
	}
	if (fn) fn(text);
	pic.stream().pipe(writeStream);
}

/**
 * 创建图片验证码
 */
exports.create_pic = create_pic;

/**
 * 创建图片中间件，直接返回图片，验证码存在session中
 * @param  {Number} expires 过期时间(默认为30分钟)
 */
exports.mid_pic_session = function(expires) {
	return function(req, res) {
		var type = '_cc_pic_' + (req.query.type || 'default');
		create_pic(null, res, function(code) {
			req.session[type] = {
				code: code,
				expires: moment().add(expires || 30, 'm').format('YYYYMMDDHHmmss') //30分钟过期
			};
		});
	}
}

/**
 * 创建图片中间件，直接返回图片，验证码存在redis中
 * @param  {redisClient} client redis的客户端连接
 * @param  {String} key  	识别字段，比如手机号
 * @param  {Number} expires 过期时间(默认为30分钟)
 */
exports.mid_pic_redis = function(client, key, expires) {
	return function(req, res) {
		var type = '_cc_pic_:' + (req.query.type || 'default') + ':' + key;
		create_pic(null, res, function(code) {
			client.set([type, code, 'EX', (expires || 30) * 60], function() {});
			//保存到redis中，并设置了过期时间
		});
	}
}

function create(codeLength) {
	var code = "";
	codeLength = codeLength || 6;
	var selectChar = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

	for (var i = 0; i < codeLength; i++) {
		var charIndex = Math.floor(Math.random() * 10);
		code += selectChar[charIndex];
	}
	return code;
}

/**
 * 生成短信验证码，存于session中
 * @param  {Function} fn      回调函数，通常在里面进行短信发送，然后根据短信发送情况返回数据
 * @param  {Number}   len     短信数字的长度(默认为6)
 * @param  {Number}   expires 过期时间(默认为30分钟)
 * @param  {String}	  _code    如果传入code，不再生成，只是存储到session
 */
exports.mid_text_session = function(fn, len, expires, _code) {
	return function(req, res) {
		var type = '_cc_text_' + (req.query.type || 'default');
		var code = _code || create(len);
		req.session[type] = {
			code: code,
			expires: moment().add(expires || 30, 'm').format('YYYYMMDDHHmmss') //30分钟过期
		};
		fn(code, function(err) {
			res.send({
				code: err ? -1 : 0,
				detail: err
			});
		});
	}
}

/**
 * 生成短信验证码，存于redis中
 * @param  {Function} fn      回调函数，通常在里面进行短信发送，然后根据短信发送情况返回数据
 * @param  {redisClient}   client  redis客户端连接
 * @param  {String}   key     识别字段，比如手机号
 * @param  {Number}   len     短信数字的长度(默认为6)
 * @param  {Number}   expires 过期时间(默认为30分钟)
 * @param  {String}	  _code    如果传入code，不再生成，只是存储到redis
 */
exports.mid_text_redis = function(fn, client, key, len, expires, _code) {
	return function(req, res) {
		var type = '_cc_text_:' + (req.query.type || 'default') + ':' + key;
		var code = _code || create(len);
		client.set([type, code, 'EX', (expires || 30) * 60], function() {
			fn(code, function(err) {
				res.send({
					code: err ? -1 : 0,
					detail: err
				});
			});
		});
	}
}

function valid(_t, client, value, type, key, fn) {
	var _k = '_cc_' + _t + '_';
	if (key && fn) { //redis
		type = _k + ':' + (type || 'default') + ':' + key;
		client.get(type, function(err, result) {
			fn(err, result == value);
		});
	} else {
		type = _k + (type || 'default');
		var v = client.session[type];
		return (v && v.code == value && v.expires < moment().format('YYYYMMDDHHmmss'))
	}
}

/**
 * 判断图片验证码是否正确
 * @param  {req||redisClient}   client 可以传req或者redisClient
 * @param  {String}   value  验证的值
 * @param  {String}   type   类型，如注册register
 * @param  {String}   key    如果是redis,需要传入识别字段，比如手机号
 * @param  {Function} fn     如果是redis,需要传入回调函数
 */
exports.valid_pic = function(client, value, type, key, fn) {
	return valid('pic', client, value, type, key, fn);
};

/**
 * 判断短信文字验证码是否正确
 * @param  {req||redisClient}   client 可以传req或者redisClient
 * @param  {String}   value  验证的值
 * @param  {String}   type   类型，如注册register
 * @param  {String}   key    如果是redis,需要传入识别字段，比如手机号
 * @param  {Function} fn     如果是redis,需要传入回调函数
 */
exports.valid_text = function(client, value, type, key, fn) {
	return valid('text', client, value, type, key, fn);
};