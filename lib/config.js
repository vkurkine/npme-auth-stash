/**
* Reads configuration files from the "conf" directory and applies
* system and deployment overrides, if available.
*
*
* Final config is exported as an instance of "nconf".
*/
var fs    = require('fs');
var nconf = require('nconf');
var _ 	  = require('lodash');

/**
* Reads and provides configuration settings for the application.
*/
var config = function(file) {

	// 1. overrides, these must always be like this.
	nconf.overrides({
		logging: {
			name: "npme-auth-stash"
		}
	});


	// Allow defining settings in env variables.
	//
	// 2. `process.env`
	// 3. `process.argv`
	//
	nconf.env('__').argv();

	// 4. Config file from environment settings, if defined.
	var mainConfig = nconf.get('npme-auth-stash-config-file');
	if (mainConfig) {
		nconf.file('main', mainConfig);
	}

	// 5. Main configuration with common settings.
	//
	nconf.file('common', file);

	//
	// 6. Any common default values
	//
	var defaults = {};

	nconf.defaults(defaults);

	return nconf;
}

module.exports = config;