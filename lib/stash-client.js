/*jshint node: true, expr: true */
"use strict";

var url     = require('url');
var util    = require('util');
var  _      = require('lodash');
var crypto  = require('crypto');
var Chance  = require('chance');
var request = require('request');

var chance = new Chance();

var API_10_BASE_PATH = "/rest/api/1.0";
var API_10_AUTH_PATH = API_10_BASE_PATH + "/users/";

function StashClient(options, log) {
    this.log = log;
    this.url   = options.repository_host;
    this.repositoryUser = { username: options.repository_user, password: options.repository_password };

    this.log.info("configured for " + this.url);

    this.encryptionKey = options.token_encryption_key;
    this.loginTokenTTL = options.login_token_ttl;
    this.setReadAuthorizationPolicy(options.read_authorization_policy);

    this.httpOptions = options.http_client_options;
    this.httpOptions.json = true; // always expect JSON data
}

StashClient.prototype.currentTime = function() {
  return Date.now();
}

StashClient.prototype.setReadAuthorizationPolicy = function(policyName) {
  switch (policyName) {
    case 'repository-read-permission':
      this.readAuthorizer = this.hasRepositoryReadPermission;
      break;
    case 'authenticated':
      this.readAuthorizer = this.isAuthenticated;
      break;
    default:
      throw new Error("unsupported read authorization policy: " + policyName);
      break;
  }
  this.log.info("read authorization policy set to: " + policyName);
}

StashClient.prototype.basicAuth = function(username, password, cb) {
  var self = this;

  request.get(this.url + API_10_AUTH_PATH + username, this.httpOptions, function (err, response, data) {
    if (err) {
      return cb(err);
    }
    if (!data || data == null) {
      self.log.warn("empty response from server to authentication request for " + username);
      return cb(new Error("no data from server (" + response.statusCode + ")"));
    }

    // 200 OK --> SUCCESS, IF ALSO USER DATA MATCHES
    if (response.statusCode == 200) {
        if (!data.active) {
          self.log.info("npm login for %s rejected as user is not active", username);
          cb(new Error("User is inactive"));
          return;
        }
        var token;
        try {
          token = self._buildBasicToken(username);
          cb(null, data, token); // SUCCESS
        } catch (e) {
          self.log.error("failed to generate login token for %s: %s", username, e.message);
          cb(e);
        }
    } else {
        var msg = (data.errors && data.errors.length > 0) ? data.errors[0].message : 'unknown error (' + response.statusCode + ')';
        self.log.warn("login error for %s: %s", username, msg);
        cb(new Error(msg));
    }
  })
  .auth(username, password, true);
}

// TODO: move token handling to own file and implemnent session handler that automatically
//       extends token TTL when it is used...
StashClient.prototype._buildBasicToken = function(username) {
  var expiresAt = this.currentTime() + (this.loginTokenTTL * 1000);
  return this._encodeToken({mode: 'http-basic', username: username, expiresAt: expiresAt });
};

StashClient.prototype._encodeToken = function(data) {
  data.hash     = chance.guid(); // randomizing data  a bit more...
  var cipher    = crypto.createCipher('aes256', this.encryptionKey);
  var encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex') + cipher.final('hex');
  return new Buffer(encrypted).toString();
}

StashClient.prototype._decodeToken = function(token) {
  var decipher = crypto.createDecipher('aes256',this.encryptionKey);
  var decoded  = decipher.update(token,'hex','utf8') + decipher.final('utf8');
  return JSON.parse(decoded);
}

StashClient.prototype.validateToken = function (token, cb) {
  var tokenData;
  try {
    tokenData = this._decodeToken(token);
    if (!tokenData.expiresAt || tokenData.expiresAt < this.currentTime()) {
      this.log.warn("login token expired for user %s", tokenData.username);
      cb(null, null);
    } else {
      this.log.debug("login token successfully validated for user %s", tokenData.username);
      cb(null, tokenData);
    }
  } catch (err) {
    this.log.error("failed to decode login token data: " + err.message);
    cb(err);
  }
}

StashClient.prototype.hasPublishPermission = function(token, packageDescriptor, cb) {
  var self = this;
  this.validateToken(token, function (err, data) {
    if (err) return cb(err);
    if (data == null) return cb(null, false);
    self.hasAnyPermission(data.username, packageDescriptor, ['REPO_WRITE','REPO_ADMIN'], cb);
  });
}

StashClient.prototype.hasReadPermission = function(token, packageDescriptor, cb) {
  this.readAuthorizer(token, packageDescriptor, cb);
}

StashClient.prototype.hasRepositoryReadPermission = function(token, packageDescriptor, cb) {
  var self = this;
  this.validateToken(token, function (err, data) {
    if (err) return cb(err);
    if (data == null) return cb(null, false);
    self.hasAnyPermission(data.username, packageDescriptor, ['REPO_WRITE','REPO_ADMIN','REPO_READ'], cb);
  });
}

StashClient.prototype.isAuthenticated = function(token, packageDescriptor, cb) {
  var self = this;
  this.validateToken(token, function (err, data) {
    if (err) {
      self.log.warn("failed to decode login token: " + err);
      cb(new Error("user token is not valid, relogin required"));
      return;
    };
    cb(null, (data != null));
  });
}

StashClient.prototype.hasAnyPermission = function(username, packageDescriptor, permissions, cb) {
  var self = this;
  this.log.debug("checking permissions for user %s to any of %s", username, permissions.join(','));

  if (packageDescriptor.repository.type !== 'git') {
    this.log.warn(packageDescriptor, "repository type in package.json from user %s not set to 'git', rejecting", username);
    cb(new Error('only Git repositories are supported. Ensure that repoitory.type is set to \'git\''));
  }

  var repoURL  = url.parse(packageDescriptor.repository.url);
  var repoPath = repoURL.pathname.replace(/\.git/,'');

  var apiHost = url.parse(this.url).hostname;
  if (apiHost !== repoURL.hostname) {
    this.log.warn('repository host mismatch (%s != %s), rejecting authorization for %s',apiHost, repoURL.hostname, packageDescriptor['_id']);
    return cb(new Error(util.format('repository host mismatch (%s != %s)',apiHost, repoURL.hostname)), false);
  }

  this.log.info("checking permission for %s to repository %s", username, repoPath);
  // check repository permission
  var permissionAPI = API_10_BASE_PATH + repoPath + "/permissions/users?filter=" + username;

  try {
    request.get(this.url + permissionAPI, this.httpOptions, function (err, response, data) {
      if (err) {
         self.log.error('error from permission check: ' + err);
         return cb(err);
      }

      if (response.statusCode !== 200) {
        var errorMessage;
        if (data && data.errors && data.errors.length > 0) {
          errorMessage = data.errors[0].message;
        } else {
           errorMessage = "no valid response data received to a failed request";
        }

        if (response.statusCode === 401) {
          self.log.warn("wrong credentials to Stash API: %s", errorMessage);
        } else if (response.statusCode === 404) {
          self.log.warn("repository not found from Stash: %s", errorMessage);
        } else {
           self.log.error("non-success response to repository permissions check (%s): %s (data: %s)", response.statusCode, errorMessage, JSON.stringify(data));
        }
        return cb(new Error(errorMessage), false);
      }

      self.log.debug(data, 'permission check response data received for user %s', username);
      var hasPermission = false;
      var value = _.find(data.values, function (entry) { return entry.user.name === username; });
      if (value) {
        if (!value.user.active) {
          self.log.info("user %s not active, not authorizing", username);
          return cb(null, false);
        }
        hasPermission = _.contains(permissions, value.permission);
      }
      self.log.info('permission check result for %s: %s', username, hasPermission);
      cb(null, hasPermission);
    })
    .auth(this.repositoryUser.username, this.repositoryUser.password, true);
  } catch (error) {
    this.log.error("failed to query permission status!", err.stack);
    cb(error);
  }
}
module.exports = StashClient;
