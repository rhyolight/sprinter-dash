var _ = require('lodash'),
    moment = require('moment'),
    jsonUtils = require('./jsonutils'),
    issues = [];

function renderIssues(issues, res) {
    jsonUtils.render(null, issues, res);
}

function reviewHandler(req, res) {
    renderIssues(issues, res);
}

module.exports = function(app, urlPath, repos, issuesIn) {
    var dashPath = urlPath;
    var reviewPath;

    console.log('router got %s issues.', issuesIn.length);

    issues = issuesIn;

    if (! _.endsWith(dashPath, '/')) {
        dashPath = dashPath + '/';
    }

    reviewPath = dashPath + 'review';

    app.use(reviewPath, reviewHandler);
};
