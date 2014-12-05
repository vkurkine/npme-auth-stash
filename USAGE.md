# Using npmE With Stash Integration


When Stash authentication module is used with npmE, following main requirements apply to modules that are published to the npmE registry:

* Modules must be hosted by the same Stash instance.
* The `package.json` must have `repository.type` set to `git`
* The `package.json` must have `repository.url` correctly to point to the module's repository in that Stash instance.
* After initial publish, the `repository.url` cannot be changed.

Following main requirements apply to the users accessing the npmE registry:

* User logging in to the npmE registry must have valid user account in the Stash instance.
* User account in Stash must be *active*. Otherwise login will be rejected.
* Publish can be made only by users what are explicitly listed in the Users list of the module in Stash **and** have at least write permission to the repository.

Fetch is allowed to all authenticated users, or depending on npmE configuration, only to users that have explicit read access to the module's repository.

## About Scoped Modules

Registry hosts only scoped modules so all modules published and maintained by the registry must be scoped. Many scopes can be used as per organization needs.

## Login

Before you can fetch or publish scoped modules, you need login to the registry:

    $ npm login --registry=http://<registry-host> --scope=<module-scope>

Login asks your Stash credentials and e-mail address. 

Enter the credentials and e-mail address. After a few seconds, login should succeed or report if something went wrong.

**NOTE**: Login separately for each scope so that npm knows where to pull your modules scoped dependencies.

## Publishing Your Scoped Module

Ensure you have properly defined the scope to your modules `package.json`. Like:

    {
      "name": "@myscope/npme-test",
      "version": "0.0.4",
      "description": "Test private project module",
      "repository": {
        "type": "git",
        "url": "https://stash.myhost.com/users/vkurkine/repos/npme-test.git"
      },
      "main": "index.js",
      "scripts": {
        "test": "test"
      },
      "keywords": [
        "test"
      ],
      "author": "Ville Kurkinen",
      "license": "Apache2",
      "dependencies": {
        "uuid": "^2.0.1"
      }
    }

Then, assuming you are logged in with the scope `@myscope`, **and** you have explicit write permission to the module's repository, you can publish it:

    $ npm publish
   
A few things to note:

* You cannot re-publish module with same version again.
* You need to have explicit **write** or **admin** permission to the module repository.  
   