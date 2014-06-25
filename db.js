var _ = require('lodash');
var config = require('config');
var glob = require('glob');
var Sequelize = require('sequelize');

var sequelize = new Sequelize(
    config.sequelize.database || 'database',
    config.sequelize.username || 'root',
    config.sequelize.password || null,
    config.sequelize.options || null
  );

var db = {};
module.exports = db;

var modelFiles = glob.sync(__dirname + '/models/*.js');

modelFiles.forEach(function(modelFile) {
  var model = sequelize.import(modelFile);
  db[model.name] = model;
});

_.forEach(db, function(model) {
  if (_.isFunction(model.associate)) {
    model.associate(db);
  }
});

db.Sequelize = Sequelize;
db.sequelize = sequelize;