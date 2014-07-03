var randomstring = require('randomstring');

module.exports = function(sequelize, DataTypes) {
  return sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    facebookId: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    username: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: true
    },
    salt: {
      type: DataTypes.STRING,
      allowNull: true
    },
    displayName: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true
      }
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        isEmail: true,
        notEmpty: true
      }
    },
    agreedTC: DataTypes.BOOLEAN,
    postalAddress: {
      type: DataTypes.STRING(512),
      allowNull: true,
      validate: {
        notEmpty: true
      }
    },
    postalAddressCity: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true
      }
    },
    postalAddressState: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true
      }
    },
    postalAddressPostcode: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true
      }
    },
    postalAddressCountry: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true
      }
    },
    phoneNumber: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        notEmpty: true
      }
    }
  }, {
    classMethods: {
      associate: function(models) {
        this.hasMany(models.Submission);
        this.hasMany(models.Vote);
      }
    },
    instanceMethods: {
      generateSalt: function(length) {
        this.salt = randomstring.generate(length);
        return this.salt;
      },
      setPassword: function(unhashedPassword) {
        this.generateSalt();
        this.passwordHash = sha1(this.salt + unhashedPassword);
      }
    },
    setterMethods: {
      password: function(unhashedPassword) {
        this.setPassword(unhashedPassword);
      }
    }
  });
};