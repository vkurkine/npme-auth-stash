/*jshint node: true, expr: true */
/*global describe, it, before, beforeEach, after, afterEach */
"use strict";

var _        = require('lodash');
var chai     = require("chai");
var expect   = chai.expect;
var assert   = chai.assert;
var nock     = require('nock');
var url      = require('url');

var mocks    = require('./mocks');

var StashAuthorizer = require('../index.js').Authorizer;

/**
* Tests for the Stash Authorizer
*/
describe("Stash Authorizer", function() {

    var authorizer;
    var frontDoorPackagePath;
    var stashRepoPath;
    var publishRequest;
    var username;

    var frontdoor;
    var stashAPI;

    beforeEach(function() {

        var options = {
            frontDoorHost           : mocks.options.frontDoorHost,
            sharedFetchSecret       : mocks.options.sharedFetchSecret
        };
        authorizer = new StashAuthorizer(options,'./test/test-config.json');

        username = "testuser";
        var repoPath = "/projects/myproject/repos/myrepo";

        frontDoorPackagePath = repoPath + "/package.json";
        stashRepoPath        = repoPath + ".git";

        publishRequest = mocks.npmPublishRequest(username, frontDoorPackagePath, stashRepoPath, authorizer);
        frontdoor      = mocks.frontdoor(publishRequest.path);
        stashAPI       = mocks.stashAPIRepositoryPermission(username, stashRepoPath);

    });

    afterEach(function() {
      mocks.reset();
    });

    describe("should reject publish when called", function() {

      it("without token", function(done) {
            publishRequest.headers.authorization = null;
            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).not.to.be.null;
                 expect(result).to.be.undefined;
                 done();
            });
        });

        it("with invalid token", function(done) {
            publishRequest.headers.authorization = "DEADBEEF";
            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).not.to.be.null;
                 expect(result).to.be.undefined;
                 done();
            });
        });

        it("when Frontdoor returns non-success response", function(done) {
            frontdoor.reply(500);
            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).not.to.be.null;
                 expect(result).to.be.undefined;
                 done();
            });
        });

        it("when Stash API returns non-success response", function(done) {
            frontdoor.reply(404);
            stashAPI.reply(500);
            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).not.to.be.null;
                 expect(result).to.be.false;
                 done();
            });
        });

        it("for an inactive user", function(done) {
            frontdoor.reply(404);
            stashAPI.reply(200, function(url, body) {
                return mocks.stashAPIUserPermission(username, false, "REPO_WRITE");
            }, mocks.apiResponseHeaders);

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).to.be.null;
                 expect(result).to.be.false;
                 done();
            });
        });

        it("for user without any permission", function(done) {
            frontdoor.reply(404);
            stashAPI.reply(200, function(url, body) {
                return mocks.stashAPIUserPermission(null, false, null);
            }, mocks.apiResponseHeaders);

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).to.be.null;
                 expect(result).to.be.false;
                 done();
            });
        });

        it("for user with REPO_READ permission", function(done) {
            frontdoor.reply(404);
            stashAPI.reply(200, function(url, body) {
                return mocks.stashAPIUserPermission(username, true, "REPO_READ");
            },mocks.apiResponseHeaders);

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).to.be.null;
                 expect(result).to.be.false;
                 done();
            });
        });

        it("for a repository URL in different host", function(done) {
            frontdoor.reply(404);
            stashAPI.reply(404, function(url, body) {
                return mocks.stashAPIError("Repository Not Found");
            }, mocks.apiResponseHeaders);

            publishRequest.body.versions['0.0.1'].repository.url = 'https://non-localhost/repos.git';

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).not.to.be.null;
                 expect(err.message).to.be.eql("repository host mismatch (localhost != non-localhost)");
                 expect(result).to.be.false;
                 done();
            });
        });

        it("for non-existing repository", function(done) {
            frontdoor.reply(404);
            stashAPI.reply(404, function(url, body) {
                return mocks.stashAPIError("Repository Not Found");
            }, mocks.apiResponseHeaders);

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).not.to.be.null;
                 expect(err.message).to.be.eql("Repository Not Found");
                 expect(result).to.be.false;
                 done();
            });
        });

    });

    describe("with read authorization policy 'authenticated'", function() {
        it("should authorize for authenticated user", function(done) {
            authorizer.client.setReadAuthorizationPolicy('authenticated');

            frontdoor.reply(404,"");
            stashAPI.reply(500, function(url, body) {
                return "THIS SHOULD NOT BE CALLED";
            }, mocks.apiResponseHeaders);

            publishRequest.method = 'GET';

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).to.be.null;
                 expect(result).to.be.true;
                 done();
            });
        });

        it("should reject for a non-valid user", function(done) {
            authorizer.client.setReadAuthorizationPolicy('authenticated');

            frontdoor.reply(404,"");
            stashAPI.reply(500, function(url, body) {
                return "THIS SHOULD NOT BE CALLED";
            }, mocks.apiResponseHeaders);

            publishRequest.method = 'GET';
            publishRequest.headers.authorization = 'Bearer XXXX';
            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).not.to.be.null;
                 expect(result).to.be.undefined;
                 done();
            });
        });
    });

    describe("should authorize publish when called", function() {

        it("for user with REPO_WRITE permission to project repository", function(done) {
            frontdoor.reply(404,"");
            stashAPI.reply(200, function(url, body) {
              return mocks.stashAPIUserPermission(username, true, "REPO_WRITE");
            }, mocks.apiResponseHeaders);

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).to.be.null;
                 expect(result).to.be.true;
                 done();
            });
        });

        it("for user with REPO_ADMIN permission to project repository", function(done) {
            frontdoor.reply(404,"");
            stashAPI.reply(200, function(url, body) {
                return mocks.stashAPIUserPermission(username, true, "REPO_ADMIN");
            }, mocks.apiResponseHeaders);

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).to.be.null;
                 expect(result).to.be.true;
                 done();
            });
        });

        it("for an authorized user to user repository", function(done) {

            var userStashRepoPath = "/users/myuser/repos/myrepository";
            var userStashAPI = mocks.stashAPIRepositoryPermission(username, userStashRepoPath + '.git');

            frontdoor.reply(404,"");

            userStashAPI.reply(200, function(url, body) {
                return mocks.stashAPIUserPermission(username, true, "REPO_ADMIN");
            }, mocks.apiResponseHeaders);


            publishRequest.body.versions['0.0.1'].repository.url = mocks.options.stashAPIBaseURL + userStashRepoPath + '.git';

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).to.be.null;
                 expect(result).to.be.true;
                 done();
            });
        });

        it("for an authorized user to first time publish", function(done) {
            frontdoor.reply(404); // no published module exists yet
            stashAPI.reply(200, function(url, body) {
                return mocks.stashAPIUserPermission(username, true, "REPO_WRITE");
            }, mocks.apiResponseHeaders);

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).to.be.null;
                 expect(result).to.be.true;
                 done();
            });
        });

        it("for an authorized user to existing package", function(done) {
            var origPackage = _.cloneDeep(publishRequest.body);
            var repoInfo = stashRepoPath.replace(/\.git/,'');

            frontdoor.reply(200, function (url, body) {
                return origPackage;
            }, mocks.apiResponseHeaders);

            publishRequest.body.versions['0.0.1'].repository.url = 'https://non-localhost.com/projects/newproject/repos/newrepo.git';
            stashAPI.reply(200, function(requestURL, body) {
                var u = url.parse(requestURL);
                assert(u.pathname.indexOf(repoInfo) >= 0,'expecting original repo path, got ' + u.pathname + ', not ' + stashRepoPath);
                return mocks.stashAPIUserPermission(username, true, "REPO_WRITE");
            }, mocks.apiResponseHeaders);

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).to.be.null;
                 expect(result).to.be.true;
                 done();
            });
        });

        it("for an authorized user and use repository URL in Frontdoor provided package.json", function(done) {
            var origPackage = _.cloneDeep(publishRequest.body);
            var repoInfo = stashRepoPath.replace(/\.git/,'');

            frontdoor.reply(200, function (url, body) {
                return origPackage;
            }, mocks.apiResponseHeaders);

            publishRequest.body.versions['0.0.1'].repository.url = 'https://non-localhost.com/projects/newproject/repos/newrepo.git';
            stashAPI.reply(200, function(requestURL, body) {
                var u = url.parse(requestURL);
                assert(u.pathname.indexOf(repoInfo) >= 0,'expecting original repo path, got ' + u.pathname + ', not ' + stashRepoPath);
                return mocks.stashAPIUserPermission(username, true, "REPO_WRITE");
            }, mocks.apiResponseHeaders);

            authorizer.authorize(publishRequest, function(err, result) {
                 expect(err).to.be.null;
                 expect(result).to.be.true;
                 done();
            });
        });

    });

});