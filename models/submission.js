var config = require('config');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('Submission', {
    uuid: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    category: DataTypes.STRING,
    title: DataTypes.STRING,
    description: DataTypes.TEXT
  }, {
    classMethods: {
      associate: function(models) {
        this.belongsTo(models.User);
        this.hasMany(models.Vote);
      }
    },
    instanceMethods: {
      getSizeUrl: function(size) {
        return config.uploadPath + this.uuid + '/' + size + '.jpg';
      }
    },
    getterMethods: {
      fullUrl: function() { return this.getSizeUrl('full') },
      largeUrl: function() { return this.getSizeUrl('large') },
      mediumUrl: function() { return this.getSizeUrl('medium') },
      smallUrl: function() { return this.getSizeUrl('small') },
      thumbnailUrl: function() { return this.getSizeUrl('thumbnail') }
    }
  });
};