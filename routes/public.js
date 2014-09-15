var _ = require('lodash');
var config = require('config');
var express = require('express');
var hbs = require('hbs');
var outputCache = require('express-output-cache');
var Promise = require('bluebird');

var db = require('../db');
var shared = require('../shared');

var routes = express.Router();
module.exports = routes;

// page starts from 1
function getSubmissions(where, page, perPage) {
  if (!perPage) {
    perPage = 30;
  }

  var offset = (page - 1) * perPage;

  var params = {
    offset: offset,
    limit: perPage
  };
  if (where) {
    params.where = where;
  }

  return db.Submission.findAndCountAll(params);
}

var outputCacheMiddleware = outputCache(86400);
routes.use(function cacheIfNotLoggedIn(req, res, next) {
  if (req.user || process.env.NODE_ENV !== 'production') {
    next(null, req, res);
  }
  else {
    outputCacheMiddleware(req, res, next);
  }
});

outputCache.on('hit', function() {
  console.log('HIT');
});
outputCache.on('miss', function() {
  console.log('MISS');
});

hbs.registerHelper('pagination', function(  ) {
  var base = this.paginationBase || '';
  var currentPage = this.currentPage;
  var numPages = this.numPages;
  var href;
  var output = '<ul class="pagination">';
  if (currentPage === 1) {
    output += '<li class="disabled"><a href="#">&laquo;</a></li>';
  }
  else {
    var prevPage = currentPage - 1;
    href = base + '/page/' + prevPage;
    output += '<li><a href="' + href + '">&laquo;</a></li>';
  }

  var distEnd = numPages - currentPage;
  var pagesBefore, pagesAfter;
  if (distEnd < 5) {
    pagesBefore = 10 - distEnd;
  }
  else {
    pagesBefore = 5;
  }
  if (currentPage < 5) {
    pagesAfter = 11 - currentPage;
  }
  else {
    pagesAfter = 5;
  }
  var pageStart = Math.max(currentPage - pagesBefore, 1);
  var pageEnd = Math.min(currentPage + pagesAfter, numPages);
  if (pageStart > 1) {
    output += '<li class="disabled"><a href="#">&hellip;</a></li>';
  }
  for (var i = pageStart; i <= pageEnd; ++i) {
    href = base + '/page/' + i;
    if (i === currentPage) {
      output += '<li class="active"><a href="' + href + '">' + i + 
      ' <span class="sr-only">(current)</span></a></li>';
    }
    else {
      output += '<li><a href="' + href + '">' + i + '</a></li>';
    }
  }
  if (pageEnd < numPages) {
    output += '<li class="disabled"><a href="#">&hellip;</a></li>';
  }

  if (currentPage === numPages) {
    output += '<li class="disabled"><a href="#">&raquo;</a></li>';
  }
  else {
    var nextPage = currentPage + 1;
    href = base + '/page/' + nextPage;
    output += '<li><a href="' + href + '">&raquo;</a></li>';
  }

  output += '</ul>';

  return new hbs.handlebars.SafeString(output);
});

routes.get('/', function(req, res, next) {
  getSubmissions(null, 1).then(function(data) {
    var allCount = data.count;
    res.locals.numPages = Math.ceil(data.count / 30) - 1;
    res.locals.currentPage = req.params.page || 1;
    res.locals.submissions = data.rows;
    res.locals.loggedIn = !!req.user;
    if (req.query.error === 'nosubmissions') {
      res.locals.nosubmissions = true;
    }
    res.render('public/index', { layout: 'layouts/public' });
  });
});

routes.get('/page/:page', function(req, res, next) {
  getSubmissions(null, req.params.page || 1).then(function(data) {
    var allCount = data.count;
    res.locals.numPages = Math.ceil(data.count / 30) - 1;
    res.locals.currentPage = parseInt(req.params.page || 1);
    res.locals.submissions = data.rows;
    res.locals.loggedIn = !!req.user;
    res.render('public/index', { layout: 'layouts/public' });
  });
});

routes.get('/cat/:catId', function(req, res, next) {
  var catId = req.params.catId;
  if (!config.categories[catId]) {
    next();
  }
  getSubmissions({
    category: catId
  }, 1).then(function(data) {
    var allCount = data.count;
    res.locals.numPages = Math.ceil(data.count / 30) - 1;
    res.locals.currentPage = 1;
    res.locals.paginationBase = '/cat/' + catId;
    res.locals.submissions = data.rows;
    res.locals.loggedIn = !!req.user;
    res.locals.title = config.categories[catId].title;
    res.render('public/index', { layout: 'layouts/public' });
  });
});

routes.get('/cat/:catId/page/:page', function(req, res, next) {
  var catId = req.params.catId;
  if (!config.categories[catId]) {
    next();
  }
  getSubmissions({
    category: catId
  }, req.params.page || 1).then(function(data) {
    var allCount = data.count;
    res.locals.numPages = Math.ceil(data.count / 30) - 1;
    res.locals.currentPage = parseInt(req.params.page || 1);
    res.locals.paginationBase = '/cat/' + catId;
    res.locals.submissions = data.rows;
    res.locals.loggedIn = !!req.user;
    res.locals.title = config.categories[catId].title;
    res.render('public/index', { layout: 'layouts/public' });
  });
});

function renderUserSubmissions(user, res, next) {
}

routes.get('/submission', function(req, res, next) {
  if (!req.user) {
    next();
  }

  req.user.getSubmissions().then(function(submissions) {
    if (_.isEmpty(submissions)) {
      req.logout();
      res.redirect('/?error=nosubmissions');
    }
    else {
      res.redirect('/by/' + req.user.id);
    }
  });
});

routes.get('/by/:userId', function(req, res, next) {
  var categories = {};
  _.forEach(config.categories, function(category, categoryId) {
    categories[categoryId] = _.assign({
      id: categoryId,
      submissions: []
    }, category);
  });

  var user;

  db.User.find({ where: { id: req.params.userId } })
  .then(function(data) {
    if (!data) {
      next();
      return Promise.reject();
    }
    user = data;
    return user.getSubmissions();
  })
  .then(function(allSubmissions) {
    if (_.isEmpty(allSubmissions)) {
      next();
      return Promise.reject();
    }
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