// isic-photo-upload

// Modules
var path = require('path');
var config = require('config');
var moment = require('moment-timezone');
var formidable = require('formidable');
var sha1 = require('sha1');
var fse = require('fs-extra');
var express = require('express');
var morgan = require('morgan');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var methodOverride = require('method-override');
var serveStatic = require('serve-static');
var errorHandler = require('errorhandler');
var hbs = require('hbs');
var lessMiddleware = require('less-middleware');

// Config initialisation
if (!config.port) {
  config.port = process.env.PORT || 3000;
}
if (config.redis) {
  var redis = require('redis');
  var RedisStore = require('connect-redis')(session);
  var redisClient;
  if (config.redis.host && config.redis.port) {
    redisClient = redis.createClient(config.redis.port, config.redis.host);
  }
  else {
    redisClient = redis.createClient();
  }
  var redisSessionStore = new RedisStore({ client: redisClient });
}

// Express initialisation
var app = express();
module.exports = app;

// View engine setup
app.set('views', __dirname + '/views');
app.set('view engine', 'hbs');
app.set('view options', {layout: 'layouts/main'});

// Middleware setup
app.use(morgan('dev'));
app.use(bodyParser());
app.use(cookieParser());
app.use(session({
  store: config.redis ? redisSessionStore : undefined,
  secret: config.secret,
  proxy: true
}));
app.use(methodOverride());
app.use('/css', lessMiddleware(
  __dirname + '/less',
  { dest: __dirname + '/public/css' },
  {},
  { compress: (app.get('env') != 'development') }
));
app.use(serveStatic(__dirname + '/public'));

// Actions
app.get('/favicon.ico', function(req, res, next) {
  res.redirect('http://static.wixstatic.com/ficons/' +
               '89355b_8adb1bc8d31a9b11a84eec6107dc1b89_fi.ico');
});

// Insert routes here

// Error handling
if (app.get('env') == 'development') {
  app.use(errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
}
else {
  app.use(function handleError(err, req, res, next) {
    res.statusCode = err.status || 500;
    res.render('error', { error: err.toString() });
  });
}

app.listen(config.port, function() {
  console.log('Express listening to port ' + config.port);
});