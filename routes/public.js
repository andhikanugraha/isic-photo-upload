var _ = require('lodash');
var config = require('config');
var express = require('express');

var db = require('../db');
var shared = require('../shared');

var routes = express.Router();
module.exports = routes;

routes.get('/by/:facebookId', function(req, res, next) {
  var categories = {};
  _.forEach(config.categories, function(category, categoryId) {
    categories[categoryId] = _.assign({
      id: categoryId,
      submissions: []
    }, category);
  });
  var user;

  db.User.find({ where: { facebookId: req.params.facebookId }})
  .then(function(data) {
    if (!data) {
      throw new Error('not_found');
    }
    user = data;
    return user.getSubmissions();
  })
  .then(function(allSubmissions) {
    _.forEach(allSubmissions, function(submission) {
      var cat = submission.category;
      if (!categories[cat] || categories[cat].submissions.length >= 3) {
        return;
      }

      categories[cat].submissions.push(submission);
    });
  })
  .then(function() {
    _.forEach(categories, function(value, key) {
      if (value.submissions.length === 0) {
        delete categories[key];
      }
    });
    res.locals.profile = user;
    res.locals.categories = categories;
    res.render('public/user', { layout: 'layouts/public' });
  })
  .catch(next);
});

routes.get('/view/:uuid', function(req, res, next) {
  var theSubmission;
  db.Submission.find({ where: { uuid: req.params.uuid }})
  .then(function(submission) {
    theSubmission = submission;
    return submission.getUser();
  })
  .then(function(user) {
    theSubmission.photographer = user;
    theSubmission.categoryMeta =
      config.categories[theSubmission.category];
    res.locals.submission = theSubmission;
    res.render('public/submission', { layout: 'layouts/public'});
  })
  .catch(next);
});