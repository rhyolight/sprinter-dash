# Sprinter Dash

> Powered by [sprinter](https://github.com/rhyolight/sprinter.js)

This is a web UI for Sprinter. It is under construction.

## Authentication with GitHub

You must provide GitHub credentials to run SprinterDash. At this time, they must be provided as environment variables: `GH_USERNAME`, `GH_PASSWORD`.

## Start the sample server

    node index.js

This will start a server monitoring a couple of default repositories.

### Use your own repos

You can specify what repositories to gather issues from with a comma-delimited list of repository slugs.

    node index.js org1/repo1,org1/repo2,org2/repo3

## Incorporate into your own Express server

You can create an instance of `SprinterDash` and attach it to an existing Express application.

    var SprinterDash = require('sprinter-dash');
    var dash = new SprinterDash(['org1/repo1', 'org1/repo2']);
    var app = express();
    dash.attach(app, 'dashboard');
    app.listen(8080);

SprinterDash will be running on `http://localhost:8080/dashboard`.