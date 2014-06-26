module.exports = function(sequelize, DataTypes) {
  return sequelize.define('Vote', {}, {
    classMethods: {
      associate: function(models) {
        this.belongsTo(models.User);
        this.belongsTo(models.Submission);
      }
    }
  });
};