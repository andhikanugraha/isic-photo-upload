var _ = require('lodash');

var db = require('./db');

var shared = {};
module.exports = shared;

shared.requireAuth = function(options) {
  var redirectTo = _.isString(options) ? options : '/auth/facebook';

  return function(req, res, next) {
    if (!req.user) {
      return res.redirect(redirectTo);
    }

    next();
  }
}

shared.retrieveSubmission = function() {
  return function(req, res, next) {
    if (req.params.uuid) {
      return db.Submission.find({
        where: { uuid: req.params.uuid }
      }).success(function(submission) {
        if (submission) {
          req.submission = submission;
          res.locals.submission = submission
        }

        return next();
      }).error(next);
    }

    next();
  }
}