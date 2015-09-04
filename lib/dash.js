var _ = require('lodash'),
    moment = require('moment'),
    CronJob = require('cron').CronJob,
    Sprinter = require('sprinter'),

    jsonUtils = require('./jsonutils'),
    attachRoutes = require('./dash-router'),

    every15Minutes = '0 */1 * * * *',
    ghUsername = process.env.GH_USERNAME,
    ghPassword = process.env.GH_PASSWORD,
    sprinter;

function refreshIssues(callback) {
    var twoWeeksAgo = moment().subtract(2, 'weeks')
            .utc().format("YYYY-MM-DDTHH:mm:ss") + "Z";
    console.log('Refreshing issues...');
    sprinter.getIssues({since: twoWeeksAgo}, callback);
}

module.exports = function(app, urlPrefix, repos, callback) {
    sprinter = new Sprinter(ghUsername, ghPassword, repos);

    new CronJob(every15Minutes, function(){
        refreshIssues(function(err, issues) {
            if (err) throw err;
            attachRoutes(app, urlPrefix, repos, issues);
        });
    }, null, true, 'UTC');

    refreshIssues(function(err, issues) {
        if (err) throw err;
        attachRoutes(app, urlPrefix, repos, issues);
        callback();
    });
};
