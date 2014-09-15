var DIR_NAME = __dirname + '/emailsubs';

var fs = require('fs');

var files = fs.readdirSync(DIR_NAME);

files.forEach(function(file) {
  if (file.match(/JPG$/)) {
    var lc = file.toLowerCase();
    fs.renameSync(DIR_NAME + '/' + file, DIR_NAME + '/_' + lc);
    fs.renameSync(DIR_NAME + '/_' + lc, DIR_NAME + '/' + lc);
    console.log(lc);
  }
});