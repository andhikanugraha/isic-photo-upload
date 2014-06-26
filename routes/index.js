var express = require('express');

var routes = express.Router();
module.exports = routes;

routes.all('/', function index(req, res, next) {
  var loggedIn = false;
  if (req.user) {
    loggedIn = true;
  }

  res.render('index', {
    loggedIn: loggedIn
  });
})