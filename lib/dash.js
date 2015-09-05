var _ = require('lodash'),
    moment = require('moment'),
    CronJob = require('cron').CronJob,
    Sprinter = require('sprinter'),

    attachRoutes = require('./dash-router'),

    ghUsername = process.env.GH_USERNAME,
    ghPassword = process.env.GH_PASSWORD,
    every15Minutes = '0 */15 * * * *',
    app, urlPrefix, repos,
    sprinter;

function refreshIssues(callback) {
    var twoWeeksAgo = moment().subtract(2, 'weeks')
            .utc().format("YYYY-MM-DDTHH:mm:ss") + "Z";
    console.log('Refreshing issues...');
    sprinter.getIssues({since: twoWeeksAgo}, function(err, issues) {
        if (err) return callback(err);
        attachRoutes(app, urlPrefix, repos, issues);
        callback();
    });
}

function cacheRefreshHandler(req, res) {
    refreshIssues(function(err) {
        var out = 'Issues refreshed.';
        if (err) {
            out = 'Error refreshing issues: ' + err.message;
        }
        res.end(out);
    });
}

module.exports = function(appIn, urlPrefixIn, reposIn, callback) {
    app = appIn;
    urlPrefix = urlPrefixIn;
    repos = reposIn;
    sprinter = new Sprinter(ghUsername, ghPassword, repos);

    new CronJob(every15Minutes, function(){
        refreshIssues(function(err) {
            if (err) throw err;
        });
    }, null, true, 'UTC');

    refreshIssues(function(err) {
        if (err) throw err;
        app.use('/refresh', cacheRefreshHandler);
        callback();
    });
};
