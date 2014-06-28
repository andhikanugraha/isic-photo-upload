var _ = require('lodash');
var async = require('async');
var config = require('config');
var express = require('express');
var formidable = require('formidable');
var gm = require('gm');
var kue = require('kue');
var uuid = require('uuid');
var winston = require('winston');

var db = require('../db');
var shared = require('../shared');

var routes = express.Router();
module.exports = routes;

var jobs = kue.createQueue();

jobs.on('job complete', function(id,result) {
  kue.Job.get(id, function(err, job){
    if (err) {
      return;
    }
    job.remove(function(err){
      if (err) {
        throw err;
      }
      winston.log('Removed completed job #%d', job.id);
    });
  });
});

var unsavedJobs = {};

function validateUpload(src, callback) {
  var originalImg = gm(src);

  async.series([
    function checkFormat(callback) {
      console.log('checkFormat');
      originalImg.format(function(err, format) {
        if (err) {
          return callback(err);
        }

        if (format !== 'JPEG') {
          return callback('invalid_format');
        }

        callback();
      });
    },
    function checkSize(callback) {
      console.log('checkSize');
      originalImg.size(function(err, size) {
        if (err) {
          return callback(err);
        }

        var longestDimension = Math.max(size.width, size.height);
        if (longestDimension < config.sizes.minimum) {
          return callback('invalid_size');
        }

        return callback();
      });
    }
  ], callback);
}

// Begin routes

routes.use(function(req, res, next) {
  res.locals.submissionSection = true;
  next();
});

routes.use(shared.requireAuth());

routes.get('/', function(req, res, next) {
  var categories = {};
  _.forEach(config.categories, function(category, categoryId) {
    categories[categoryId] = _.assign({
      id: categoryId,
      submissions: []
    }, category);
  });

  req.user.getSubmissions().success(function(submissions) {
    _.forEach(submissions, function(submission) {
      var cat = submission.category;
      if (!categories[cat] || categories[cat].submissions.length >= 3) {
        return;
      }

      categories[cat].submissions.push(submission);
    });

    _.forEach(categories, function(category) {
      category.canSubmit = category.submissions.length < 3;
    });

    render();
  }).error(render);

  function render(err) {
    if (err) {
      return res.render('submission/index', { error: err });
    }

    res.render('submission/index', { categories: categories });
  }
});

routes.route('/upload/:categoryId')
  .get(function(req, res, next) {
    var categoryId = req.params.categoryId;

    if (req.query.error) {
      return render(req.query.error);
    }

    if (!config.categories[categoryId]) {
      return render('no_category');
    }

    var categoryTitle = config.categories[categoryId].title;
    render();

    function render(err) {
      res.locals.categoryId = categoryId;
      if (categoryTitle) {
        res.locals.categoryTitle = categoryTitle;
      }

      if (err) {
        if (err === 'no_category') {
          next();
        }
        else if (err === 'no_files') {
          res.locals.noFiles = true;
        }
        else if (err === 'invalid_format') {
          res.locals.invalidFormat = true;
        }
        else if (err === 'invalid_size') {
          res.locals.invalidSize = true;
        }

        return res.render('submission/upload', { error: err });
      }

      res.render('submission/upload');
    }
  })
  .post(function(req, res, next) {
    var categoryId = req.params.categoryId;
    var redirectTo;
    var form = new formidable.IncomingForm();
    form.keepExtensions = true;

    if (!config.categories[categoryId]) {
      return render('no_category');
    }

    form.parse(req, function(err, fields, files) {
      if (err) {
        return next(err);
      }

      if (files.length === 0) {
        return render('no_files');
      }

      var src = files.file.path;
      validateUpload(src, function(err) {
        if (err) {
          return render(err);
        }

        var jobUuid = uuid.v4();
        var job = jobs.create('process submission', {
          title: 'Photo submission ' + jobUuid,
          uuid: jobUuid,
          src: files.file.path,
          userId: req.user.id,
          category: categoryId
        });

        unsavedJobs[jobUuid] = job;
        setTimeout(function() {
          delete unsavedJobs[jobUuid];
        }, 30000);

        redirectTo = '/submission/process/' + jobUuid;

        render();
      });
    });

    function render(err) {
      if (err) {
        return res.redirect('/submission/upload/' + categoryId +
                            '?error=' + err);
      }

      res.render('submission/processing', {
        redirectTo: redirectTo
      });
    }
  });

routes.get('/process/:uuid', function(req, res, next) {
  var jobUuid = req.params.uuid;
  var job = unsavedJobs[jobUuid];

  if (!job) {
    res.redirect('/submission?error=processing_upload');
    return false;
  }

  job.on('complete', function onComplete() {
    console.log('Done processing');
    render();
  });
  job.on('failed', function onFailure() {
    winston.error('Failed processing job.')
    render('upload_failed');
  });

  job.save(function(err) {
    if (err) {
      return console.error('Failed saving job ' + jobUuid);
    }
    delete unsavedJobs[jobUuid];
  });

  function render(err) {
    if (err) {
      return res.render('submission/processing', {
        error: true,
        uploadFailed: true
      });
    }

    res.redirect('/submission/edit/' + jobUuid + '?message=uploaded');
  }
});

routes.route('/edit/:uuid')
  .get(shared.retrieveSubmission(), function(req, res, next) {
    var submission = req.submission;
    console.log(req.params);

    if (!submission) {
      return render('not_found');
    }
    if (submission.UserId != req.user.id) {
      return render('unauthorised');
    }

    render();

    function render(err) {
      if (err) {
        return res.render('submission/edit', { error: err });
      }

      if (req.query.message === 'saved') {
        res.locals.justSaved = true;
      }
      else if (req.query.message === 'uploaded') {
        res.locals.justUploaded = true;
      }

      res.render('submission/edit', { submission: submission });
    }
  })
  .post(shared.retrieveSubmission(), function(req, res, next) {
    var submission = req.submission;

    if (!submission) {
      render('not_found');
    }

    submission.updateAttributes({
      title: req.body.title,
      description: req.body.description
    }).success(function() {
      render();
    }).error(render);

    function render(err) {
      if (err) {
        return res.render('submission/edit', { error: err });
      }

      res.redirect('/submission/edit/' + req.params.uuid + '?message=saved');
    }
  });

routes.route('/delete/:uuid')
  .get(shared.retrieveSubmission(), function(req, res, next) {
    var submission = req.submission;
    console.log(req.params);

    if (!submission) {
      return render('not_found');
    }
    if (submission.UserId != req.user.id) {
      return render('unauthorised');
    }

    render();

    function render(err) {
      if (err) {
        return res.render('submission/delete', { error: err });
      }

      res.render('submission/delete');
    }
  })
  .post(shared.retrieveSubmission(), function(req, res, next) {
    var submission = req.submission;

    if (!submission) {
      render('not_found');
    }
    if (submission.UserId != req.user.id) {
      return render('unauthorised');
    }

    submission.updateAttributes({
      title: req.body.title,
      description: req.body.description
    }).success(function() {
      render();
    }).error(render);

    function render(err) {
      if (err) {
        return res.render('submission/delete', { error: err });
      }

      res.redirect('/submission/?message=deleted');
    }
  });


routes.post('/delete/:uuid', shared.retrieveSubmission(), function(req, res, next) {
  res.render('submission/view');
});