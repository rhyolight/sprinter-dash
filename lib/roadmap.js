var fs = require('fs')
  , path = require('path')
  , _ = require('lodash')
  , async = require('async')
  , moment = require('moment')
  , Handlebars = require('handlebars')
  , marked = require('marked')
  , Sprinter = require('sprinter')
  , ghUsername = process.env.GH_USERNAME
  , ghPassword = process.env.GH_PASSWORD
  , sprinter
  , repos
  , roadmapTemplate
  , errorTemplate
  , staticDir
  , allTasksRegex = /(\-|\*) \[.\]/g
  , completeTasksRegex = /(\-|\*) \[[a-zA-Z]\]/g
  , pageTitle = 'Road Map'
  , CACHE_FOR = 60 * 60 * 1000 // 60 minutes
  , CACHE_OBJECT = undefined
  , CACHED_AT = undefined
  ;

marked.setOptions({
    renderer: new marked.Renderer(),
    gfm: true,
    sanitize: true,
    smartLists: true,
    smartypants: false
});

function prepareTemplates() {
    var templateText = fs.readFileSync(
        path.join(__dirname, '../client/templates/roadmap.html'), 'utf-8'
    );
    roadmapTemplate = Handlebars.compile(templateText);
    templateText = fs.readFileSync(
        path.join(__dirname, '../client/templates/error.html'), 'utf-8'
    );
    errorTemplate = Handlebars.compile(templateText);
}

function reportError(err, res) {
    console.log(err);
    res.end(errorTemplate({
        title: 'Error Reported'
      , message: err.message
    }));
}

function enhanceMilestone(milestone, fast, callback) {
    var issueFetchers = {};
    issueFetchers.closed = function(issueCallback) {
        console.log('getting closed issues for %s', milestone.title);
        var start = new Date().getTime();
        sprinter.getIssues({
            state: 'closed', milestone: milestone.title
        }, function(err, issues) {
            var end = new Date().getTime();
            console.log('getting closed issues for %s took %ss', milestone.title, ((end - start) / 1000));
            issueCallback(err, issues);
        });
    };
    issueFetchers.open = function(issueCallback) {
        console.log('getting open issues for %s', milestone.title);
        var start = new Date().getTime();
        sprinter.getIssues({
            state: 'open', milestone: milestone.title
        }, function(err, issues) {
            var end = new Date().getTime();
            console.log('getting open issues for %s took %ss', milestone.title, ((end - start) / 1000));
            issueCallback(err, issues);
        });
    };

    var start = new Date().getTime();

    function issuesFetched(err, issues) {
        var end = new Date().getTime();
        console.log(((end - start) / 1000) + 's');
        if (err) {
            return callback(err);
        }
        if (issues.closed) {
            milestone.tasksTotal = issues.closed.length + issues.open.length;
            milestone.tasksComplete = issues.closed.length;
        } else {
            milestone.tasksTotal = 0;
            milestone.tasksComplete = 0;
        }
        milestone.percentageDone = Math.round(
            (milestone.tasksComplete / milestone.tasksTotal) * 100
        );
        milestone.html_description = marked(milestone.description);
        callback(null, milestone);
    }

    if (fast) {
        issuesFetched(null, {});
    } else {
        async.parallel(issueFetchers, issuesFetched);
    }
}

function consolidateMilestones(milestones, fast, callback) {
    var milestonesOut = []
      , enhancers = [];
    _.each(milestones, function(milestoneList, name) {
        _.each(milestoneList, function(milestone) {
            if (milestone.description) {
                enhancers.push(function(localCallback) {
                    enhanceMilestone(milestone, fast, function(err, enhanced) {
                        if (err) {
                            return localCallback(err);
                        }
                        milestonesOut.push(enhanced);
                        localCallback();
                    });
                });
            }
        });
    });
    async.parallel(enhancers, function(err) {
        if (err) {
            return callback(err);
        }
        callback(null, milestonesOut);
    });
}

function generateIssueBodyMarkup(bodyMarkdown, expanded) {
    if (! expanded && bodyMarkdown.indexOf('* * *') > -1) {
        return marked(bodyMarkdown.split('* * *')[0]);
    }
    return marked(bodyMarkdown);
}

function generateProgressInfo(bodyMarkdown) {
    var tasksTotalMatches = bodyMarkdown.match(allTasksRegex)
      , tasksCompleteMatches = bodyMarkdown.match(completeTasksRegex)
      , tasksTotal = 0
      , tasksComplete = 0;

    if (tasksTotalMatches) {
        tasksTotal = tasksTotalMatches.length;
    }
    if (tasksCompleteMatches) {
        tasksComplete = tasksCompleteMatches.length;
    }

    return {
        tasksComplete: tasksComplete
      , tasksTotal: tasksTotal
      , percentageDone: Math.round( (tasksComplete / tasksTotal) * 100)
    };
}

function populateSuperIssues(milestones, expandedIssues, callback) {
    var fetchers = [];
    _.each(milestones, function(ms) {
        fetchers.push(function(callback) {
            sprinter.getIssues({
                milestone: ms.title
              , labels: 'super'
            }, callback);
        });
    });
    async.parallel(fetchers, function(err, issuesList) {
        if (err) {
            return callback(err);
        }
        _.each(issuesList, function(issues, index) {
            // Process markdown body of each issue for display.
            _.each(issues, function(issue) {
                var progressInfo = generateProgressInfo(issue.body);
                issue.html_body = generateIssueBodyMarkup(issue.body, expandedIssues);
                issue.tasksComplete = progressInfo.tasksComplete;
                issue.tasksTotal = progressInfo.tasksTotal;
                issue.percentageDone = progressInfo.percentageDone;
            });
            milestones[index].issues = issues;
        });
        callback(null, milestones);
    });
}

function setCache(obj) {
    CACHE_OBJECT = obj;
    CACHED_AT = new Date().getTime();
    return CACHE_OBJECT;
}

function clearCache() {
    CACHE_OBJECT = undefined;
}

function shouldUseCache() {
    var cacheDiff
    if (! CACHE_OBJECT || ! CACHED_AT) {
        return false;
    }
    cacheDiff = (CACHED_AT + CACHE_FOR) - new Date().getTime()
    // console.log('Caching for another %s minutes', (cacheDiff / 1000 / 60));
    return cacheDiff > 0;
}

function requestHandler(req, res) {
    if (req.query.clearCache) {
        clearCache();
    }
    if (shouldUseCache()) {
        console.log('using cache');
        res.end(CACHE_OBJECT);
    } else {
        console.log('fetching fresh data');

        sprinter.getMilestones(function(err, milestones) {
            var consolidatedMilestones;
            if (err) {
                return reportError(err, res);
            }
            consolidateMilestones(milestones, req.query.fast, function(err, consolidatedMilestones) {
                if (err) {
                    return reportError(err, res);
                }
                populateSuperIssues(consolidatedMilestones, req.query.expand_issues, 
                    function(err, milestonesWithIssues) {
                        var sortedMilestones = _.sortBy(milestonesWithIssues, function(ms) {
                            return ms.title;
                        });
                        res.end(setCache(roadmapTemplate({
                            title: pageTitle
                          , staticDir: staticDir
                          , milestones: sortedMilestones
                        })));
                    }
                );
            });
        });
    }
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
        // Only use "primary" repos for road map.
        repoSlugs = _.map(_.filter(cfg.repos, function(repo) {
            return repo.type == 'primary';
        }) , function(repo) {
            return repo.slug;
        });
    } else {
        repoSlugs = cfg.repos;
    }
    sprinter = new Sprinter(ghUsername, ghPassword, repoSlugs);
    repos = cfg.repos;
    prepareTemplates();
    staticDir = cfg.staticDir;
    if (cfg.pageTitle) {
        pageTitle = cfg.pageTitle;
    }
    return requestHandler;
};