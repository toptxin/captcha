var fs = require('fs'),
  captcha = require('../lib/captcha');

var writeStream1 = fs.createWriteStream('./test/1.jpg');
captcha.create_pic('123G', writeStream1);

var writeStream2 = fs.createWriteStream('./test/2.jpg');
captcha.create_pic(null, writeStream2, function(code) {
  console.info(code);
});