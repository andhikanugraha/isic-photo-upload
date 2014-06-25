var express = require('express');
var formidable = require('formidable');
var kue = require('kue');
var uuid = require('uuid');
var winston = require('winston');

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

// array of jobs which have not yet been saved
var unsavedJobs = {};

routes.get('/upload', function(req, res, next) {
  res.send('<form method="post" enctype="multipart/form-data"><input type="file" name="file"><button type="submit">Submit</button></form>');
});

routes.post('/upload', function(req, res, next) {
  var form = new formidable.IncomingForm();
  form.keepExtensions = true;
  form.maxFieldsSize = 25 * 1024 * 1024;

  form.parse(req, function(err, fields, files) {
    if (err) {
      return next(err);
    }

    var jobUuid = uuid.v4();
    var job = jobs.create('process submission', {
      title: 'Photo submission ' + jobUuid,
      uuid: jobUuid,
      src: files.file.path
    });

    unsavedJobs[jobUuid] = job;
    setTimeout(function() {
      delete unsavedJobs[jobUuid];
    }, 30000);

    var processingUrl = '/process/' + jobUuid;

    res.send('Processing your upload. Do not close this window.' + 
      '<script>window.setTimeout(function() { window.location.href = "' +
      processingUrl +
      '" }, 0)</script>');
  });
});

routes.get('/process/:uuid', function(req, res, next) {
  var jobUuid = req.params.uuid;
  var job = unsavedJobs[jobUuid];

  if (!job) {
    res.redirect('/b');
    return false;
  }

  job.on('complete', function onComplete() {
    console.log('Done processing');
    res.redirect('/b');
  });

  job.save(function(err) {
    if (err) {
      return console.error('Failed saving job ' + jobUuid);
    }
    delete unsavedJobs[jobUuid];
  });
});

routes.get('/b', function(req, res, next) {
  res.send('Processing finished!');
});