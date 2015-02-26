var fs = require('fs')
  , path = require('path')
  , _ = require('lodash')
  , async = require('async')
  , moment = require('moment')
  , Handlebars = require('handlebars')
  , marked = require('marked')
  , Sprinter = require('sprinter')
  , json = require('./jsonutils')
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
  , CACHE_DURATION = 60 * 60 // one hour cache
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

function populateMilestoneIssues(milestone, callback) {
    sprinter.getIssues({
        state: 'all'
      , milestone: milestone.title
      , format: 'network'
    }, function(err, issues) {
        var open
          , closed;
        if (err) {
            return callback(err);
        }
        open = _.filter(issues.all, function(issue) {
            return issue.state == 'open';
        }).length;
        closed = _.filter(issues.all, function(issue) {
            return issue.state == 'closed';
        }).length;
        if (closed) {
            milestone.tasksTotal = closed + open;
            milestone.tasksComplete = closed;
        } else {
            milestone.tasksTotal = 0;
            milestone.tasksComplete = 0;
        }
        if (milestone.tasksComplete == 0) {
            milestone.percentageDone = 0;
        } else {
            milestone.percentageDone = Math.round(
                (milestone.tasksComplete / milestone.tasksTotal) * 100
            );
        }
        milestone.html_description = marked(milestone.description);
        milestone.issues = issues;

        callback(null, milestone);
    });
}

function consolidateMilestones(milestones, callback) {
    var milestonesOut = []
      , enhancers = [];
    _.each(milestones, function(milestoneList) {
        _.each(milestoneList, function(milestone) {
            if (milestone.description) {
                enhancers.push(function(localCallback) {
                    populateMilestoneIssues(milestone, function(err, full) {
                        if (err) {
                            return localCallback(err);
                        }
                        milestonesOut.push(full);
                        localCallback();
                    });
                });
            }
        });
    });
    async.parallel(enhancers, function(err) {
        if (err && err.length) {
            return callback(err);
        }
        callback(null, milestonesOut);
    });
}

function generateIssueBodyMarkup(bodyMarkdown) {
    // If the GitHub Bountysource plugin is active, it appends extra
    // text to the end of the issue body that we would rather strip off.
    var markdown = bodyMarkdown.split('<bountysource-plugin>')[0];
    return marked(markdown);
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

function calculateSuperIssueProgress(milestones) {
    _.each(milestones, function(milestone) {
        _.each(milestone.issues.supers, function(issue) {
            var progressInfo = generateProgressInfo(issue.body);
            issue.html_body = generateIssueBodyMarkup(
                issue.body
            );
            issue.tasksComplete = progressInfo.tasksComplete;
            issue.tasksTotal = progressInfo.tasksTotal;
            issue.percentageDone = progressInfo.percentageDone;
        });
    });
}

function requestHandler(req, res) {
    // Clear cache before requesting if we need to.
    if (req.query.clear_cache !== undefined) {
        sprinter.clearCache();
    }
    sprinter.getMilestones(function(err, milestones) {
        if (err) {
            return reportError(err, res);
        }

        consolidateMilestones(milestones,
            function(err, consolidatedMilestones) {
                var sortedMilestones;
                if (err) {
                    return reportError(err, res);
                }
                calculateSuperIssueProgress(consolidatedMilestones);
                sortedMilestones = _.sortBy(consolidatedMilestones,
                    function(ms) {
                        return ms.title;
                    }
                );
                json.render({
                    title: pageTitle
                  , staticDir: staticDir
                  , milestones: sortedMilestones
                }, res);
            }
        );
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
        // Only use "primary" repos for road map.
        repoSlugs = _.map(_.filter(cfg.repos, function(repo) {
            return repo.type == 'primary';
        }) , function(repo) {
            return repo.slug;
        });
    } else {
        repoSlugs = cfg.repos;
    }
    sprinter = new Sprinter(ghUsername, ghPassword, repoSlugs, CACHE_DURATION);
    repos = cfg.repos;
    prepareTemplates();
    staticDir = cfg.staticDir;
    if (cfg.pageTitle) {
        pageTitle = cfg.pageTitle;
    }
    return requestHandler;
};