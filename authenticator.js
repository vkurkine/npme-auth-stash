/*jshint node: true, expr: true */
"use strict";

var url    = require('url');
var  _     = require('lodash');
var nomnom = require('nomnom');


var Config = require('./lib/config');
var Log    = require('./lib/logger');

var StashClient = require('./lib/stash-client');

function StashAuthenticator(options, configFile) {
    var config  = Config(configFile || './config.json');
    this.log    = Log(config.get('logging'));
    this.client = new StashClient(config.get('stash'), this.log);
    this.mode = 'http-basic';
}

StashAuthenticator.prototype.authenticate = function(credentials, cb) {
  if (!this._validateCredentials(credentials)) {
    this.log.warn("invalid credentials, rejecting authentication!");
    return cb(new Error('invalid credentials format'));
  }
  var self = this;
  this.log.info("authenticating %s", credentials.body.name);

  var body      = credentials.body,
      username  = body.name,
      password  = body.password;

  try {
    switch (this.mode) {
      case 'http-basic':
         this.client.basicAuth(username, password, function(err, user, token) {
            if (err) {
              self.log.error("authentication failed with error for %s: %s", username, err.message);
              return cb(err);
            }
            self.log.info("authentication success for %s", username);
            cb(null, self._buildResult(body, user, token));
            });
         break;
      default:
        cb(new Error("unknown authentication mode: " + this.mode));
      }
  } catch (err) {
     this.log.fatal(err, "unhandled error in authentication, rejecting for %s", username);
  }
};

StashAuthenticator.prototype._buildResult = function(body, user, token) {
  // could also use e-mail returned by Stash (user.emailAddress)
  return {
    token : token,
    user  : {
      username : body.name,
      name     : (user.displayName) ? user.displayName : body.name,
      email    : body.email
    }
  };
};

StashAuthenticator.prototype._validateCredentials = function(credentials) {
  if (!credentials) return false;
  if (!credentials.body) return false;
  if (!credentials.body.name || !credentials.body.password) return false;
  return true;
};

module.exports = StashAuthenticator;
