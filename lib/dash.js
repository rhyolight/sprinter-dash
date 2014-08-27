var path = require('path')
  , fs = require('fs')
  , _ = require('underscore')
  , express = require('express')
  , Handlebars = require('handlebars')
  , IssueFetcher = require('./issue-fetcher')
  , DEFAULT_PORT = 8181
  , DEFAULT_TITLE = 'Sprinter Dash'
  , DEFAULT_URL_PREFIX = 'dash'
  , staticDir = 'client'
  ;

function resolveUrlPrefix(urlPrefixIn) {
    var urlPrefix = urlPrefixIn;
    if (! urlPrefix) {
        urlPrefix = DEFAULT_URL_PREFIX;
    }
    if (urlPrefix.substr(0,1) !== '/') {
        urlPrefix = '/' + urlPrefix;
    }
    if (urlPrefix.substr(urlPrefix.length - 1) !== '/') {
        urlPrefix = urlPrefix + '/';
    }
    return urlPrefix
}

function SprinterDash(cfg) {
    this.repos = cfg.repos;
    this.title = DEFAULT_TITLE;
    if (cfg.title) {
        this.title = cfg.title;
    }
    this._issueFetcher = IssueFetcher({
        repos: this.repos
      , ghUsername: cfg.ghUsername
      , ghPassword: cfg.ghPassword
    });
    this.app = undefined;
    this._templates = undefined;
    this._urlPrefix = undefined;
}

SprinterDash.prototype._prepareForStartup = function() {
    var fullDir = path.join(__dirname, '../client/templates')
      , templates = {};
    fs.readdirSync(fullDir).forEach(function(fileName) {
        var templateName = fileName.split('.').shift()
          , fullPath = path.join(fullDir, fileName)
          , templateText = fs.readFileSync(fullPath, 'utf-8')
          ;
        templates[templateName] = Handlebars.compile(templateText);
    });
    // console.log(templates);
    this._templates = templates;
};

SprinterDash.prototype.startServer = function(port, urlPrefix) {
    console.log('Starting sprinter.js dashboard server...');

    var me = this
      , app = this.app = express()
        .use(express.json())
        .use(express.urlencoded())
        .use(express.static(__dirname + '/client'));

    if (! port) {
        port = DEFAULT_PORT;
    }

    this.attach(app, urlPrefix);

    app.listen(port, function() {
        console.log('sprinter.js dashboard server running on\n'
            + '\thttp://localhost:' + port + me._urlPrefix);
    });
};

SprinterDash.prototype.showDash = function() {
    var me = this;
    return function(req, res) {
        var template = me._templates.dash
          , htmlOut = template({
              title: me.title
            , urlPrefix: me._urlPrefix
            , staticDir: me._urlPrefix + staticDir + '/'
          })
          ;
        res.end(htmlOut);
    };
};

SprinterDash.prototype.showIssues = function() {
    var me = this;
    return function(req, res) {
        var template = me._templates.main
          , htmlOut = template({
              title: me.title
            , urlPrefix: me._urlPrefix
            , staticDir: me._urlPrefix + staticDir + '/'
          })
          ;
        res.end(htmlOut);
    };
};

SprinterDash.prototype._showIssues = function() {
    return this._issueFetcher.allIssues;
};

SprinterDash.prototype.attach = function(app, urlPrefixIn) {
    var urlPrefix = resolveUrlPrefix(urlPrefixIn)
      , htmlRoute = urlPrefix + 'issues'
      , dataRoute = urlPrefix + '_issues'
      , oldIssuesRoute = urlPrefix + '_oldIssues'
      , staleIssuesRoute = urlPrefix + '_staleIssues'
      , staticUrl = urlPrefix + staticDir;

    // console.log('urlPrefix: %s\nroute: %s\nstatic: %s', urlPrefix, route, staticUrl);

    this._urlPrefix = urlPrefix;
    // route = urlPrefix + 'issues/:datefilter/:since';

    this._prepareForStartup(urlPrefix);

    // console.log(route);
    app.get(urlPrefix, this.showDash());
    app.get(htmlRoute, this.showIssues());
    app.get(dataRoute, this._showIssues());
    app.get(oldIssuesRoute, this._showIssues());
    app.get(staleIssuesRoute, this._showIssues());
    // console.log(path.join(__dirname, '../client'));
    app.use(staticUrl, express.static(path.join(__dirname, '..', staticDir)));

};

module.exports = SprinterDash;