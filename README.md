# npme-auth-stash


Authenticator module for NPM Enterprise to using Atlassian Stash as the user authenticatio and
publish authorization authority.

Much based on `npme-auth-github` module but adjusted to work against Stash REST API 1.0.

The implementation is quite basic and not perfect but allows using Stash as the authorative backend for authentication and controlling publish permissions, which might be sufficient for basic use. 

## Authentication

User authentication uses **HTTP Basic** method by requesting user's profile data from Stash.

If authentication succeeds **and** user is marked as *active* in Stash, the login is accepted. 

A login token is created by generating an encrypted token that contains the user's user name.

Each login token is valid only for a configured time and expires after that. This functionality could be improved by implementing session management better and to e.g. automatically extend the TTL of login token if the token is actively used. 

## Authorization

Authorization works in two modes:

* `read` access i.e. downloading published modules.
* `publish` access for uploading new versions from existing modules, or new modules.


All authorization is done against the same Stash instance where authentication is made to. Also, authorization requires checks against the module's repository permissions so the module repository **must** be located in the same Stash instance. 

The repository URL is read from the `package.json` of each module being published so it is crucial that the `registry.url` is set correctly. Also, `registry.type` must be `git`.

**NOTE**: The `package.json` of the module submitted to the registry is trusted only during the first publish operation. Subsequent publish operations are validated against the latest published version so the **module repository URL cannot be changed after initial publish has been made**. This is a security  feature that ensures publish authorization is checked from correct location.


#### Read Access

Read access authorization is supported via two alternative policies:

* `authenticated`: Any user that has gained a valid login token is allowed read access to any module in the registry. This is the default and simplest authorization policy.
* `repository-read-permission`: Any active user that has gained a valid login token and explicitly has been granted at least **read** access to the module's repository.

#### Publish Access

Publish access is restricted to users that explicitly have been granted **write** or admin access to the module's repository in the Stash instance where the authentication is made from.

# Installation

The `npme-auth-stash` module is installed to an existing **npmE** installation as any other module. It can be installed to the base level of the **npmE** installation. 

Currently, this module is not published to any public registry so one needs to copy it to the npmE machine directly. 

The instructions below assume that **npmE** is located in `/etc/npme` directory of the registry machine.

After installing / copying this module to the machine (`/etc/npme/node_modules`), install its dependencies:

    $ cd /etc/npme/node_modules/npme-auth-stash
    $ npm install
    
The above steps are only needed if module is copied to host manually.

After that, create configuration file for the module and update **npmE** to use it.

# Configuration

Module requires a few configuration settings to be defined in order to be functional.

Most relevant settings are: 

* Log file location, log level and log file rotation. Bunyan is used so configuration follows it directly.
* Stash instance URL
* Stash user account that is allowed to perform permission check queries to all projects and repositories. 
* Encryption key for login token encryption.
* Validity duration (in seconds) for the login tokens.

All settings are defined in a configuration file whose location is defined with a command line argument `--npme-auth-stash-config-file` property. 

Convention is to locate the file to `/etc/npme/npme-auth-stash-config.json`.

This module's directory contains default configuration file that is read **in addition** to the specifically configured file. The results are merged so that the file defined by command line are preferred over default settings. 

However, the default config file is fully functional, should the dummy host names and credentials be valid. So it can be used as a template. The default configuration file looks like:


    {
        "logging": {
            "level" : "info",
            "streams": [
            {
              "type"   : "rotating-file",
              "path"   : "/etc/npme/logs/npme-auth-stash.log",
              "period" : "1d",
              "count"  : 5
            }
          ]
        },

        "stash": {
            "repository_user"           : "npm-repository-user",
            "repository_password"       : "secret",
            "repository_host"           : "https://stash.myhost.com",
            "token_encryption_key"      : "changeit",
            "read_authorization_policy" : "authenticated",
            "login_token_ttl"           : 2592000,
            "http_client_options"       : {
              "strictSSL"   : false
            }
        }
    }

# Configuring npmE to Use Stash Authentication

 Open the `/etc/npme/service.json` file into a text editor.
 
 In the end of the file, modify to look like below:
 
    "args": {
       "--front-door-host": "http://192.168.70.11:8080",
       "--white-list-path": "/etc/npme/whitelist",
       "--github-host": "https://api.github.com",
       "--binary-directory": "/etc/npme/packages",
       "--auth-fetch": "true",
       "--shared-fetch-secret": "change-me-to-a-secure-token",
       "--authentication-method": "stash",
       "--authorization-method": "stash",
       "--session-handler": "redis",
       "--npme-auth-stash-config-file": "/etc/npme/npme-auth-stash-config.json"
   }

That is, following settings: 

* `--authentication-method`
* `--authorization-method`
* `--session-handler`
* `--npme-auth-stash-config-file`

Generate new configuration for **npmE**:

    $ npme generate-scripts
 
Restart to take new configuration into use:

    $ npme restart

See [USAGE](./USAGE.md) documentation for how to use with the `npm` tool.

# Troubleshooting

Adjust log level in the configuration file as needed and check the log file for details when problems occur. **npm** client does not report errors very well and also the base **npmE** loses interesting error messages so often the module's log file is the only place where to see what really is going wrong.

