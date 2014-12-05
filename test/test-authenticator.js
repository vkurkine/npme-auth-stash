/*jshint node: true, expr: true */
/*global describe, it, before, beforeEach, after, afterEach */
"use strict";

var chai     = require("chai");
var expect   = chai.expect;
var assert   = chai.assert;
var nock     = require('nock');

var mocks    = require('./mocks');

var StashAuthenticator = require('../index.js').Authenticator;

/**
* Tests for the Stash Authenticator
*/
describe("Stash Authenticator", function() {

    var authenticator;

    beforeEach(function() {

        var options = {
            frontDoorHost           : mocks.options.frontDoorHost,
            sharedFetchSecret       : mocks.options.sharedFetchSecret
        };
        authenticator = new StashAuthenticator(options, './test/test-config.json');
    });


    describe("should reject when", function() {

        afterEach(function() {
            mocks.reset();
        });

        it("called with null credentials", function(done) {
            authenticator.authenticate(null, function(err, result) {
                expect(err).not.to.be.null;
                expect(result).to.be.undefined;
                done();
            });
        });

        it("called with empty credentials", function(done) {
            authenticator.authenticate({}, function(err, result) {
                expect(err).not.to.be.null;
                expect(result).to.be.undefined;
                done();
            });
        });

        it("called without user name", function(done) {
            var credentials = mocks.npmLoginRequest(null, 'testpass', null);
            authenticator.authenticate(null, function(err, result) {
                expect(err).not.to.be.null;
                expect(result).to.be.undefined;
                done();
            });
        });

        it("called without password", function(done) {
            var credentials = mocks.npmLoginRequest('testuser', null, null);
            authenticator.authenticate(null, function(err, result) {
                expect(err).not.to.be.null;
                expect(result).to.be.undefined;
                done();
            });
        });

        it("called without email", function(done) {
            var credentials = mocks.npmLoginRequest('testuser', 'testpassword', null);
            authenticator.authenticate(null, function(err, result) {
                expect(err).not.to.be.null;
                expect(result).to.be.undefined;
                done();
            });
        });

        it("called with wrong credentials", function(done) {
            var credentials = mocks.npmLoginRequest('testuser', 'testwrongpassword', 'test@nodomain.com');
            var authScope = mocks.basicAuthentication(credentials.body.name, credentials.body.password);
            authScope.reply(401, mocks.stashAPIError("Invalid credentials"), mocks.apiResponseHeaders);

            authenticator.authenticate(credentials, function(err, result) {
                expect(err).not.to.be.null;
                expect(err.message).to.be.eql("Invalid credentials");
                expect(result).to.be.undefined;
                done();
            });
        });

    });

    describe("with HTTP Basic authentication with correct credentials", function() {

        it("should succeed for active user", function(done) {
            var credentials = mocks.npmLoginRequest('testuser', 'testpassword', 'test@nodomain.com');
            var user;

            var authScope = mocks.basicAuthentication(credentials.body.name, credentials.body.password);
            authScope.reply(200, function (uri, requestBody) {
                user = mocks.stashAPIUser(credentials.body.name, "Test User", credentials.body.email, true);
                return user;
            }, mocks.apiResponseHeaders);

            authenticator.authenticate(credentials, function(err, result) {
                expect(err).to.be.null;
                expect(result).not.to.be.null;
                expect(result.token).to.be.a('string');
                expect(result.user.name).to.be.eql('Test User');
                expect(result.user.email).to.be.eql(credentials.body.email);
                done();
            });
        });

        it("should reject for inactive user", function(done) {
            var credentials = mocks.npmLoginRequest('testuser', 'testpassword', 'test@nodomain.com');

            var user;

            var authScope = mocks.basicAuthentication(credentials.body.name, credentials.body.password);
            authScope.reply(200, function (uri, requestBody) {
                user = mocks.stashAPIUser(credentials.body.name, "Test User", credentials.body.email, false);
                return user;
            }, mocks.apiResponseHeaders);

            authenticator.authenticate(credentials, function(err, result) {
                expect(err).not.to.be.null;
                expect(err.message).to.be.eql('User is inactive');
                expect(result).to.be.undefined;
                done();
            });
        });

        it("should reject expired login token", function(done) {
            var username = "testuser";
            var client = authenticator.client;
            var time = Date.now();
            client.currentTime = function () { return time; }
            var token = client._buildBasicToken(username);
            time = Date.now() + (client.loginTokenTTL * 1000) + 1;

            client.validateToken(token, function(err, data) {
                expect(err).to.be.null;
                expect(data).to.be.null;
                done();
            });
        });
    });

});