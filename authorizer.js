"use strict";

var  _          = require('lodash');
var request     = require('request');

var Config = require('./lib/config');
var Log    = require('./lib/logger');

var StashClient = require('./lib/stash-client');

function StashAuthorizer(options, configFile) {
    var config  = Config(configFile || './config.json');
    this.log    = Log(config.get('logging'));
    this.client = new StashClient(config.get('stash'), this.log);

    this.sharedFetchSecret = options.sharedFetchSecret;
    this.frontDoorHost     = options.frontDoorHost;
}

/*
    request.path: a path representing the package authorization is being performed for.
    request.method: the type of request being authorized: GET for reads, PUT for publishes.
    request.body: the package.json contents (this is only sent for publishes).
    request.headers.authorization: contains the token issued by the authenticator.
*/
StashAuthorizer.prototype.authorize = function(request, cb) {
    if (!this._validateCredentials(request)) {
        return cb(new Error("missing credentials data from request"));
    }

    var self  = this;
    var token = request.headers.authorization.replace('Bearer ', '');

    var path = request.path;
    var body = request.body;
    var scope = (request.method === 'GET') ? 'read' : 'publish';

    this.loadPackageDescriptor(path, function (err, packageDescriptor) {
        if (err)  {
          self.log.error("failed to load existing package descriptor: " + err, err.stack);
          cb(err);
          return;
        }
        if (!packageDescriptor || packageDescriptor == null) {
            packageDescriptor = body.versions[body['dist-tags'].latest];
        } else {
            packageDescriptor = packageDescriptor.versions[packageDescriptor['dist-tags'].latest];
        }
        self.log.debug(packageDescriptor, "using package descriptor");

        if (scope === 'read') {
            self.client.hasReadPermission(token, packageDescriptor, cb);
        } else {
            self.client.hasPublishPermission(token, packageDescriptor, cb);
        }
    });
};

// fetch package.json for existing module, if present
StashAuthorizer.prototype.loadPackageDescriptor = function(path, cb) {

    this.log.debug("loading package descriptor from Frontdoor path " + path);

    var self = this;
    var options = { json: true };
    request.get(this.frontDoorHost + path.split('?')[0] + '?sharedFetchSecret=' + this.sharedFetchSecret,
             options, function(err, response, packageDescriptor) {
        if (err) return cb(err);

        if (response.statusCode === 404) {
            cb(null, null);
        } else if (response.statusCode >= 400 || response.statusCode < 200) {
            cb(new Error('invalid response from front door to query for package ' + path + ': ' + response.statusCode));
        } else {
            self.log.info("found existing package descriptor from earlier publish, using it for module " + packageDescriptor['_id']);
            self.log.debug(packageDescriptor, "existing descriptor for " + packageDescriptor['_id']);
            cb(null, packageDescriptor);
        }
    });
};

StashAuthorizer.prototype._validateCredentials = function(credentials) {
  if (!credentials) return false;
  if (!credentials.headers) return false;
  if (!credentials.headers.authorization) return false;
  return true;
};

module.exports = StashAuthorizer;
