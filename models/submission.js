module.exports = function(sequelize, DataTypes) {
  return sequelize.define('Submission', {
    uuid: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    category: DataTypes.STRING
  }, {
    classMethods: {
      associate: function(models) {
        this.belongsTo(models.User);
      }
    }
  });
};