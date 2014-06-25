var path = require('path');
var _ = require('lodash');
var async = require('async');
var azureStorage = require('azure-storage');
var config = require('config');
var gm = require('gm');
var kue = require('kue');
var tmp = require('tmp');

var jobs = kue.createQueue();

var blobService = azureStorage.createBlobService(
                    config.azureStorage.accountName,
                    config.azureStorage.accountKey);

var LARGE_SIZE = config.sizes.large || 1280;
var MEDIUM_SIZE = config.sizes.medium || 640;
var THUMBNAIL_SIZE = config.sizes.thumbnail || 240;

function processJob(job, callback) {
  console.log('Processing job #' + job.id + '...');
  var start = _.now();

  if (!job || !job.data) {
    callback('no_job');
    return false;
  }
  if (!job.data.src) {
    callback('invalid_job');
    return false;
  }

  var jobData = job.data;

  async.series({
    validation: function(callback) {
      console.log('Validating...');
      processValidation(jobData, callback);
    },
    tmp: function(callback) {
      console.log('Generating tmp dir...');
      processTmp(jobData, callback);
    },
    resizing: function(callback) {
      console.log('Resizing...');
      processResizing(jobData, callback);
    },
    upload: function(callback) {
      console.log('Uploading to Azure...');
      processUpload(jobData, callback);
    },
    dbSave: function(callback) {
      console.log('Saving to db...');
      processDbSave(jobData, callback);
    }
  }, function(err, data) {
    console.log('Finished job in ' + (_.now() - start));
    handleJobError(err, data, callback);
  });
}

function processValidation(jobData, callback) {
  var originalImg = gm(jobData.src);

  async.series([
    function checkFormat(callback) {
      console.log('checkFormat');
      originalImg.format(function(err, format) {
        if (err) {
          return callback(err);
        }

        if (format !== 'JPEG') {
          return callback('validation_error', 'format');
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
          console.log('zsdproblem');
          return callback('validation_error', 'size');
        }

        return callback();
      });
    }
  ], callback);
}

function processTmp(jobData, callback) {
  tmp.dir(function(err, path) {
    if (err) {
      return callback(err);
    }

    console.log(path);
    jobData.tmpPath = path;
    callback(null);
  });
}

function processResizing(jobData, callback) {
  // Resize within temp dir
  var tmpPath = jobData.tmpPath;
  var fullPath = tmpPath + '/full.jpg';
  var largePath = tmpPath + '/large.jpg';
  var mediumPath = tmpPath + '/medium.jpg';
  var thumbnailPath = tmpPath + '/thumbnail.jpg';

  jobData.fullPath = fullPath;
  jobData.largePath = largePath;
  jobData.mediumPath = mediumPath;
  jobData.thumbnailPath = thumbnailPath;

  var originalImg = gm(jobData.src);
  var fullImg, largeImg, mediumImg;
  var originalSize = {};
  var isPortrait = false;

  async.series([
    function orient(callback) {
      originalImg.autoOrient().write(fullPath, callback);
    },
    function getSize(callback) {
      fullImg = gm(fullPath);
      fullImg.quality(90);
      fullImg.size(function(err, size) {
        if (err) {
          return callback(err);
        }

        originalSize = size;
        callback();
      });
    },
    function checkOrientation(callback) {
      if (originalSize.height > originalSize.width) {
        isPortrait = true;
      }
      callback();
    },
    function generateLarge(callback) {
      if (isPortrait) {
        fullImg.resize(null, LARGE_SIZE);
      }
      else {
        fullImg.resize(1600);
      }
      fullImg.write(largePath, callback);
    },
    function generateMedium(callback) {
      largeImg = gm(largePath);
      if (isPortrait) {
        largeImg.resize(null, MEDIUM_SIZE);
      }
      else {
        largeImg.resize(MEDIUM_SIZE);
      }
      largeImg.write(mediumPath, callback);
    },
    function generateThumbnail(callback) {
      var cropX, cropY, cropSize, ratio;
      var mediumImg = gm(mediumPath);
      if (isPortrait) {
        ratio = MEDIUM_SIZE / originalSize.height;
        cropSize = originalSize.width * ratio;
        cropX = 0;
        cropY = (originalSize.height * ratio / 2) - (cropSize / 2);
      }
      else {
        ratio = MEDIUM_SIZE / originalSize.width;
        cropSize = originalSize.height * ratio;
        cropX = (originalSize.width * ratio / 2) - (cropSize / 2);
        cropY = 0;
      }

      mediumImg.crop(cropSize, cropSize, cropX, cropY);
      mediumImg.resize(240, 240);

      mediumImg.sharpen(0.2);
      mediumImg.write(thumbnailPath, callback);
    }
  ], function(err) {
    if (err) {
      return callback(err);
    }

    callback();
  });
}

function processUpload(jobData, callback) {
  // Upload files from temp dir to azure blob storage
  var toUpload = [
    jobData.fullPath, jobData.largePath,
    jobData.mediumPath, jobData.thumbnailPath
  ];

  async.each(toUpload, function(originPath, callback) {
    var basename = path.basename(originPath);
    var destinationPath = jobData.uuid + '/' + basename;
    blobService.createBlockBlobFromFile(
      config.azureStorage.container,
      destinationPath,
      originPath,
      {
        contentType: 'image/jpeg'
      },
      function(err, result, response) {
        if (err) {
          return callback(err);
        }

        console.log(destinationPath);
        console.log(arguments);
        callback();
      }
    );
  }, function(err) {
    if (err) {
      console.error(arguments);
      return callback('upload_error');
    }

    callback();
  });
}

function processDbSave(jobData, callback) {
  // Save the Submission instance to DB
  callback();
}

function handleJobError(err, data, callback) {
  if (err) {
    console.error(err);
  }
  callback(err, data);
}

console.log('Workers ready.');
jobs.process('process submission', processJob);