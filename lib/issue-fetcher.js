var _ = require('underscore')
  , async = require('async')
  , moment = require('moment')
  , Sprinter = require('sprinter')
  , json = require('./jsonutils')
  , ghUsername = process.env.GH_USERNAME
  , ghPassword = process.env.GH_PASSWORD
  , Foreman = require('travis-foreman')
  , foreman = undefined
  , sprinter
  , repos
  ;

function addTypes(issues) {
    _.each(issues, function(issue) {
        _.each(repos, function(repo) {
            if (repo.slug == issue.repo) {
                issue.type = repo.type;
            }
        });
    });
    return issues;
}

function buildTravisUrl(repoSlug, buildId) {
    return 'https://travis-ci.org/' + repoSlug + '/builds/' + buildId;
}

function addRunningBuildInfo(issues, builds) {
    _.each(builds, function(repoBuilds, repo) {
        _.each(issues, function(issue) {
            _.each(repoBuilds, function(build) {
                if(issue.pull_request && build.pull_request && issue.repo.indexOf(repo) > -1) {
                    if (build.pull_request_number == issue.number) {
                        if (! foreman || ! issue.builds) {
                            issue.builds = [];
                        }
                        build.html_url = buildTravisUrl(issue.repo, build.id);
                        issue.builds.push(build);
                    }
                }
            });
        });
    });
    return issues;
}

function addBacklog(issues) {
    _.each(issues, function(issue) {
        if (! issue.milestone) {
            issue.milestone = {
                title: 'Backlog',
                number: 'none'
            };
        }
    });
    return issues;
}

function getIssues(params, callback) {
    var fetchers = [function(callback) {
            if (foreman) {
                foreman.listRunningBuilds(callback);
            } else {
                callback(null, []);
            }
        }, function(callback) {
            sprinter.getIssues(params, callback);
        }];
    // If state is all, we add another query to get all the closed issues.
    if (params.state && params.state == 'all') {
        params.state = 'open';
        fetchers.push(function(callback) {
            var closedParams = _.extend({}, params, {state: 'closed'});
            sprinter.getIssues(closedParams, callback);
        });
    }
    async.parallel(fetchers, function(err, results) {
        if (err) {
            return callback(err);
        }
        var builds = results[0]
          , issues = results[1];
        if (results.length > 2) {
            issues = _.sortBy(issues.concat(results[2]), function(issue) {
                return new Date(issue.updated_at);
            }).reverse();
        }
        callback(null, {
            issues: addRunningBuildInfo(addBacklog(addTypes(issues)), builds)
        });
    });
}

function recentIssues(req, res) {
    var twoDaysAgo = moment().subtract(2, 'days').utc().format("YYYY-MM-DDTHH:mm:ss") + "Z";
    getIssues({
        sort: 'updated'
      , state: 'open'
      , since: twoDaysAgo
    }, function(err, issues) {
        if (err) {
            json.renderErrors([err], res);
        } else {
            json.render(issues, res);
        }
    });
}

function staleIssues(req, res) {
    var twoMonthsAgo = moment().subtract(2, 'months');
    getIssues({
        sort: 'updated'
    }, function(err, results) {
        var issues = results.issues;
        if (err) {
            json.renderErrors([err], res);
        } else {
            results.issues = _.filter(issues, function(issue) {
                return new Date(issue.updated_at) < twoMonthsAgo;
            });
            json.render(results, res);
        }
    });
}

function oldIssues(req, res) {
    var sixMonthsAgo = moment().subtract(6, 'months');
    getIssues({
        sort: 'created'
    }, function(err, results) {
        var issues = results.issues;
        if (err) {
            json.renderErrors([err], res);
        } else {
            results.issues = _.filter(issues, function(issue) {
                return new Date(issue.created_at) < sixMonthsAgo;
            });
            json.render(results, res);
        }
    });
}

function allIssues(req, res) {
    var twoMonthsAgo = moment().subtract(2, 'months').utc().format("YYYY-MM-DDTHH:mm:ss") + "Z";
    getIssues({
        sort: 'updated'
      , state: 'all'
      , since: twoMonthsAgo
    }, function(err, issues) {
        if (err) {
            json.renderErrors([err], res);
        } else {
            json.render(issues, res);
        }
    });
}

function deepSearch(req, res) {
    var filter = req.query;
    // Delete any filters that say "all".
    _.each(_.keys(filter), function(name) {
        if (filter[name] == 'all') {
            delete filter[name];
        }
    });
    console.log(filter);
    getIssues(filter, function(err, issues) {
        if (err) {
            json.renderErrors([err], res);
        } else {
            json.render(issues, res);
        }
    });
}


module.exports = function(reposIn, ghUsernameIn, ghPasswordIn, travisOrg) {
    if (! ghUsername) {
        ghUsername = ghUsernameIn;
    }
    if (! ghPassword) {
        ghPassword = ghPasswordIn;
    }
    sprinter = new Sprinter(ghUsername, ghPassword, reposIn);
    if (travisOrg) {
        foreman = new Foreman({
            organization: travisOrg
          , username: ghUsername
          , password: ghPassword
        });
    }
    repos = reposIn;
    return {
        recentIssues: recentIssues
      , allIssues: allIssues
      , staleIssues: staleIssues
      , oldIssues: oldIssues
      , deepSearch: deepSearch
    };
};