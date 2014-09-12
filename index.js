// isic-photo-upload

// Modules
var path = require('path');
var config = require('config');
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
var passport = require('passport');
var FacebookStrategy = require('passport-facebook').Strategy;

var db = require('./db');
var routes = require('./routes');
var submissionRoutes = require('./routes/submission');
var publicRoutes = require('./routes/public');

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

// Passport initialisation
passport.serializeUser(function(user, done) {
  if (user.facebookId) {
    return done(null, { facebookId: user.facebookId });
  }

  done(null, { id: user.id });
});

passport.deserializeUser(function(user, done) {
  db.User.find({ where: user })
  .success(function(user) {
    done(null, user);
  }).error(done);
});

passport.use(new FacebookStrategy({
  clientID: config.facebook.appId,
  clientSecret: config.facebook.secret,
  callbackURL: config.baseUrl + '/auth/facebook/callback'
}, function(accessToken, refreshToken, profile, done) {
  var email = '';
  if (profile.emails && profile.emails[0] && profile.emails[0].value) {
    email = profile.emails[0].value;
  }

  db.User.findOrCreate({ facebookId: profile.id }, {
    displayName: profile.displayName,
    email: email
  }).success(function(user) {
    done(null, user);
  }).error(done);
}));

// Express initialisation
var app = express();
module.exports = app;

// View engine setup
app.set('views', __dirname + '/views');
app.set('view engine', 'hbs');
app.set('view options', {layout: 'layouts/main'});

// Middleware setup
app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  store: config.redis ? redisSessionStore : undefined,
  secret: config.secret,
  proxy: true
}));
app.use(passport.initialize());
app.use(passport.session({ secret: config.secret }));
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
  res.redirect(config.favicon);
});

// Insert routes here
app.get('/auth/facebook', passport.authenticate('facebook', {
  scope: 'email'
}));
app.get('/auth/facebook/callback', passport.authenticate('facebook', {
  successRedirect: '/',
  failureRedirect: '/?error=login'
}));
app.get('/logout', function(req, res, next) {
  req.logout();
  res.redirect('/');
});

app.use(function(req, res, next) {
  if (req.user) {
    app.locals.user = req.user;
    app.locals.loggedIn = true;
  }
  else {
    app.locals.user = {};
    app.locals.loggedIn = false;
  }

  next();
});

app.use(routes);
app.use(publicRoutes);
app.use('/submission', submissionRoutes);

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

db.sequelize.sync().success(function() {
  app.listen(config.port, function() {
    console.log('Express listening to port ' + config.port);
  });
});