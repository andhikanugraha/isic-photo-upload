module.exports = function(sequelize, DataTypes) {
  var Submission = sequelize.define('Submission', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true
    },
    uuid: DataTypes.STRING,
    category: DataTypes.STRING
  }, {
    classMethods: {
      associate: function(models) {
        Submission.belongsTo(models.User);
      }
    }
  });

  return Submission;
};