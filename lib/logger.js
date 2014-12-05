var bunyan = require('bunyan');

module.exports = function (logConfig) { return bunyan.createLogger(logConfig); }