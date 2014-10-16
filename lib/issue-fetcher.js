var _ = require('lodash')
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

function reportAndRenderError(error, res) {
    console.error(error);
    json.renderErrors([error], res);
}

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
    if (!builds) {
        return issues;
    }
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
        var builds
          , issues = [];
        if (foreman) {
            builds = results.shift();
        }
        // Pull in all issues, closed and open.
        while (results.length) {
            issues = issues.concat(results.shift());
        }
        issues = _.sortBy(issues, 'updated_at').reverse();
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
            reportAndRenderError(err, res);
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
        if (err) {
            reportAndRenderError(err, res);
        } else {
            results.issues = _.filter(results.issues, function(issue) {
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
            reportAndRenderError(err, res);
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
            reportAndRenderError(err, res);
        } else {
            json.render(issues, res);
        }
    });
}

function prioritizedIssues(req, res) {
    var priorityLabels = ['P1', 'P2', 'P3', 'P4'],
        fetchers = [];
    _.each(priorityLabels, function(priority) {
        fetchers.push(function(callback) {
            getIssues({
                sort: 'updated'
                , labels: priority
            }, function (err, data) {
                if (err) {
                    callback(err);
                } else {
                    callback(null, data.issues);
                }
            });
        });
    });

    async.parallel(fetchers, function(err, data) {
        var out = [];
        if (err) {
            reportAndRenderError(err, res);
        } else {
            json.render({issues: out.concat.apply(out, data)}, res);
        }
    });
}

function issuesByUser(req, res) {
    var login = req.params.login,
        fetchers = {};
    if (! login) {
        json.renderErrors([new Error('No login specified')], res);
    } else {
        fetchers.assigned = function(callback) {
            getIssues({
                sort: 'updated'
              , assignee: login
            }, callback);
        };
        fetchers.mentioned = function(callback) {
            getIssues({
                sort: 'updated'
              , mentioned: login
            }, callback);
        };
        async.parallel(fetchers, function(err, data) {
            // Removed all the assigned issues from the mentioned issues to prevent duplicates.
            var assignedIds = _.map(data.assigned.issues, function(issue) {
                  return issue.id;
              });
            data.mentioned.issues = _.remove(data.mentioned.issues, function(mentionedIssue) {
                return (! _.contains(assignedIds, mentionedIssue.id));
            });
            json.render(data, res);
        });
    }
}

// UNDER CONSTRUCTION
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
            reportAndRenderError(err, res);
        } else {
            json.render(issues, res);
        }
    });
}

function catchAll(req, res) {
    var getParams = {
        sort: 'updated'
    };
    getParams[req.params.filterBy] = req.params.value;
    if (req.query.sort) {
        getParams.sort = req.query.sort;
    }
    getIssues(getParams, function(err, issues) {
        if (err) {
            reportAndRenderError(err, res);
        } else {
            json.render(issues, res);
        }
    });
}


module.exports = function(cfg) {
    var repoSlugs = undefined;
    if (! ghUsername) {
        ghUsername = cfg.ghUsername;
    }
    if (! ghPassword) {
        ghPassword = cfg.ghPassword;
    }
    // Handle repo objects instead of repo slug strings.
    if (typeof(cfg.repos[0]) == 'object') {
        repoSlugs = _.map(cfg.repos, function(repo) {
            return repo.slug;
        });
    } else {
        repoSlugs = cfg.repos;
    }
    sprinter = new Sprinter(ghUsername, ghPassword, repoSlugs, 60);
    if (cfg.travisOrg) {
        foreman = new Foreman({
            organization: cfg.travisOrg
          , username: ghUsername
          , password: ghPassword
        });
    }
    repos = cfg.repos;
    return {
        recentIssues: recentIssues
      , allIssues: allIssues
      , staleIssues: staleIssues
      , oldIssues: oldIssues
      , issuesByUser: issuesByUser
      , prioritizedIssues: prioritizedIssues
      , catchAll: catchAll
//      , deepSearch: deepSearch
    };
};