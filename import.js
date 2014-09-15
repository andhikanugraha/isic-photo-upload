var fs = require('fs');
var path = require('path');

var _ = require('lodash');
var async = require('async');
var config = require('config');
var csv = require('csv-parser');
var gm = require('gm');
var kue = require('kue');
var Promise = require('bluebird');
var uuid = require('uuid');
var winston = require('winston');

var db = require('./db');

var SUBS = __dirname + '/emailsubs';

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

var csvPromise = new Promise(function(resolve, reject) {
  var rows = [];
  fs.createReadStream('emailsubs.csv')
    .pipe(csv())
    .on('data', function(data) {
      delete data[''];
      var paddedNid = data.nid.toString();
      while (paddedNid.length < 3) {
        paddedNid = '0' + paddedNid;
      }
      data.fileName = path.normalize(SUBS + '/' + paddedNid + '.jpg');

      data.email =
        data.email.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}\b/i)[0];

      rows.push(data);
    })
    .on('end', function() { resolve(rows); });
});

function validateUpload(src, callback) {
  var originalImg = gm(src);

  async.series([
    function checkFormat(callback) {
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

var filterPromise = csvPromise.then(function(rows) {
  return new Promise(function(resolve, reject) {
    async.filter(rows, function(row, callback) {
      // console.log(row.fileName);
      validateUpload(row.fileName, function(err) {
        if (err) {
          console.log(
            'Rejected ' + row.fileName +
            ' by ' + row.name + ': ' + err);
          callback(false);
        }
        else {
          // console.log('OK ' + row.fileName);
          callback(true);
        }
      });
    }, function(filteredRows) {
      resolve(filteredRows);
    });
  });
});

function upload(sub) {
  return new Promise(function(resolve, reject) {
    var src = sub.fileName;
    var jobUuid = uuid.v4();
    console.log(jobUuid);

    var jobData = {
      title: 'Photo submission ' + jobUuid,
      uuid: jobUuid,
      src: sub.fileName,
      userId: sub.userId,
      category: sub.category
    };

    var job = jobs.create('process submission', jobData);

    job.on('complete', function onComplete() {
      console.log('Done processing');
      resolve(sub);
    });
    job.on('failed', function onFailure() {
      winston.error('Failed processing job: ' + sub.fileName);
      resolve();
    });

    job.save();
  });
}

filterPromise.then(function(filteredRows) {
  var uploadPromises = [];
  
  _.each(filteredRows, function(sub) {
    var p = db.User.findOrCreate({ email: sub.email }, {
      displayName: sub.name /*,
      postalAddress: sub.postalAddress || undefined,
      postalAddressCountry: sub.postalAddressCountry,
      phoneNumber: sub.phoneNumber.toString() */
    }).then(function(user) {
      sub.userId = user.id;
      return sub;
    }).then(function(sub) {
      console.log('Uploading ' + sub.fileName);
      return upload(sub);
    });

    uploadPromises.push(p);
  });

  return Promise.all(uploadPromises);
}).catch(function(err) {
  console.dir(err);
});