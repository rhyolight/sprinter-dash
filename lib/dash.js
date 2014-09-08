var path = require('path')
  , fs = require('fs')
  , qs = require('querystring')
  , _ = require('lodash')
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
      , travisOrg: cfg.travisOrg
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

SprinterDash.prototype._showView = function(name, paramFetcher) {
    var me = this;
    return function(req, res) {
        var params = {}
          , template = me._templates[name]
          , htmlOut;
        if (paramFetcher && typeof(paramFetcher) == 'function') {
            params = paramFetcher(req);
        } else if (paramFetcher) {
            params.title = paramFetcher;
        }
        params = _.extend({
            title: me.title
          , urlPrefix: me._urlPrefix
          , staticDir: me._urlPrefix + staticDir + '/'
        }, params);
        htmlOut = template(params);
        res.end(htmlOut);
    };
};

SprinterDash.prototype.showDash = function() {
    return this._showView('dash');
};

SprinterDash.prototype.showIssues = function() {
    return this._showView('main');
};

SprinterDash.prototype.showPriority = function() {
    return this._showView('priority', 'Issues by Priority');
};

SprinterDash.prototype.showSearch = function() {
    var me = this;
    return this._showView('search', function(req) {
        var dataUrl
          , title
          , filterBy = req.params.filterBy
          , value = req.params.value.replace('+', ' ');
        title = filterBy + ': ' + value;
        dataUrl = me._urlPrefix + '_search/' + filterBy + '/' + value + '?' + qs.stringify(req.query);
        return {
            title: title
          , dataUrl: dataUrl
        };
    });};

SprinterDash.prototype.showLogin = function() {
    return this._showView('login', function(req) {
        return {
            title: req.params.login + '\'s Issues'
          , login: req.params.login
        };
    });
};

SprinterDash.prototype.attach = function(app, urlPrefixIn) {
    var urlPrefix = resolveUrlPrefix(urlPrefixIn)
      , htmlRoute = urlPrefix + 'issues'
      , allIssuesRoute = urlPrefix + '_issues'
      , recentIssuesRoute = urlPrefix + '_recentIssues'
      , oldIssuesRoute = urlPrefix + '_oldIssues'
      , staleIssuesRoute = urlPrefix + '_staleIssues'
      , issuesByLoginDisplayRoute = urlPrefix + 'issues/:login'
      , issuesByLoginRoute = urlPrefix + '_issues/:login'
      , prioritizedIssuesRoute = urlPrefix + '_priority'
      , prioritizedViewRoute = urlPrefix + 'priority'
      , searchRoute = urlPrefix + 'search/:filterBy/:value'
      , searchDataRoute = urlPrefix + '_search/:filterBy/:value'
      , staticUrl = urlPrefix + staticDir;

    this._urlPrefix = urlPrefix;

    this._prepareForStartup(urlPrefix);

    app.get(urlPrefix, this.showDash());
    app.get(htmlRoute, this.showIssues());
    app.get(prioritizedViewRoute, this.showPriority());
    app.get(allIssuesRoute, this._issueFetcher.allIssues);
    app.get(recentIssuesRoute, this._issueFetcher.recentIssues);
    app.get(oldIssuesRoute, this._issueFetcher.oldIssues);
    app.get(staleIssuesRoute, this._issueFetcher.staleIssues);
    app.get(issuesByLoginDisplayRoute, this.showLogin());
    app.get(issuesByLoginRoute, this._issueFetcher.issuesByUser);
    app.get(searchRoute, this.showSearch());
    app.get(prioritizedIssuesRoute, this._issueFetcher.prioritizedIssues);
    app.get(searchDataRoute, this._issueFetcher.catchAll);
    app.use(staticUrl, express.static(path.join(__dirname, '..', staticDir)));

};

module.exports = SprinterDash;