/*jshint node: true, expr: true */
/*global describe, it, before, beforeEach, after, afterEach */
"use strict";

var nock     = require('nock');

var mockOptions = {
    stashAPIBaseURL        : "http://localhost:8080",
    authUserPathPrefix     : "/rest/api/1.0/users/",
    api10BasePath          : "/rest/api/1.0",
    frontDoorHost          : "http://localhost",
    sharedFetchSecret      : "secret",
    repositoryUser         : "npm-repository-admin",
    repositoryUserPassword : "secret"
}

var mockAPIResponseHeaders =  {
     'Content-Type': 'application/json'
};

function reset () {
    nock.cleanAll();
}

function mockBasicAuthentication(username, password) {
  var auth = new Buffer(username + ":" + password).toString('base64');
  var request = nock(mockOptions.stashAPIBaseURL)
                .matchHeader('Authorization', 'Basic ' + auth)
                .get(mockOptions.authUserPathPrefix + username);
  return request;
}


function stashAPIError(message) {
    return {
        errors :[
            {
                context       : null,
                message       : message,
                exceptionName : null
            }
        ]
    };
}

function stashAPIUser(username, displayName, email, active) {
    return {
        name         : username,
        emailAddress : email,
        id           : 2170,
        displayName  : displayName,
        active       : active,
        slug         : username,
        type         : "NORMAL",
        link         : {
            url : "/users/" + username,
            rel : "self"
        },
        links : {
            self : [
                {
                    href:"https://stash.host.com/users/" + username
                }
            ]
        }
    };
}

function npmLoginRequest(username, password, email) {
    return {
            body : {
                name     : username,
                password : password,
                email    : email
            }
        };
};


function stashAPIRepositoryPermission(username, repoPath) {
  var path = repoPath.replace(/\.git/,'');
  var auth = new Buffer(mockOptions.repositoryUser + ":" + mockOptions.repositoryUserPassword).toString('base64');
  var request = nock(mockOptions.stashAPIBaseURL)
                .matchHeader('Authorization', 'Basic ' + auth)
                .get(mockOptions.api10BasePath + path + "/permissions/users?filter=" + username);
  return request;
}

function frontdoor(path) {
  var request = nock(mockOptions.frontDoorHost)
                .get(path + '?sharedFetchSecret=' + mockOptions.sharedFetchSecret);
  return request;
}

function loginToken(username, authorizer) {
    return authorizer.client._buildBasicToken(username);
}

function npmPublishRequest(username, frontDoorPackagePath, stashRepoPath, authorizer) {
    var request = {
        path : frontDoorPackagePath,
        method : "PUT",
        body: "",
        headers : {
            authorization: 'Bearer ' + loginToken(username, authorizer)
        }
    };
    // the package.json information
    request.body = packageDescriptor('0.0.1', mockOptions.stashAPIBaseURL + stashRepoPath);
    return request;
}

function packageDescriptor(version, repositoryURL) {
    return {
        '_id' : 'my-test-module',
        'dist-tags': {
            'latest' : '0.0.1',
        },
        versions: {
            '0.0.1' : packageJson('0.0.1', repositoryURL)
            }
        }
}

function packageJson(version, url) {
    return {
        name    : "test-module",
        version : version,
        repository: {
            type : "git",
            url  : url
        }
    };
}

function stashAPIUserPermission(username, active, permission) {
    var data = {
        isLastPage : true,
        values : [],
        limit : 25,
        start : 0,
        size : 0
    };

    if (username != null) {
        var value = {
                permission : permission,
                user : {
                    link : {
                        rel : "self",
                        url : "/users/" + username
                },
                emailAddress : username + "@nodomain.com",
                active : active,
                name : username,
                slug : username,
                id : 3177,
                type : "NORMAL",
                links : {
                   self : [
                      {
                         href : "https://stash.nodomain.com/users/" + username
                      }
                   ]
                },
                displayName : username
             }
          };
        data.size++;
        data.values.push(value);
    }
    return data;
}


module.exports.reset               = reset;
module.exports.options             = mockOptions;
module.exports.apiResponseHeaders  = mockAPIResponseHeaders;
module.exports.basicAuthentication = mockBasicAuthentication;
module.exports.stashAPIError       = stashAPIError;
module.exports.stashAPIUser        = stashAPIUser;
module.exports.npmLoginRequest     = npmLoginRequest;

module.exports.frontdoor             = frontdoor;
module.exports.loginToken            = loginToken;
module.exports.npmPublishRequest     = npmPublishRequest;
module.exports.stashAPIUserPermission = stashAPIUserPermission;
module.exports.stashAPIRepositoryPermission = stashAPIRepositoryPermission;