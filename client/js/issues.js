$(function() {

    var DEFAULT_REFRESH_RATE = 3 * 60 * 1000; // 3 minutes

    function endsWith(needle, haystack) {
        return haystack.indexOf(needle, haystack.length - needle.length) !== -1;
    }

    function extractFilterFrom(hash) {
        var params = {milestone: 'all', repo: 'all', assignee: 'all', type: 'all', state: 'open'}
            , temp
            , items = hash.slice(1).split("&") // remove leading # and split
            , i;
        for (i = 0; i < items.length; i++) {
            temp = items[i].split("=");
            if (temp[0]) {
                if (temp.length < 2) {
                    temp.push("");
                }
                params[decodeURIComponent(temp[0])] = decodeURIComponent(temp[1]);
            }
        }
        return params;
    }

    function loadTemplate(src, id, callback) {
        $.ajax({
            url: src,
            success: function(resp) {
                var $script = $('<script type="text/template" id="' + id + '_tmpl">' + resp + '</script>');
                $('body').append($script);
                callback(null, id + '_tmpl');
            },
            failure: callback
        });
    }

    function convertIssuesToTemplateData(issues, staticDir, urlPrefix) {
        var now = new Date();
        return {
            issues: _.map(issues, function(issue) {
                issue.updated = moment(issue.updated_at).from(now);
                if (issue.closed_at) {
                    issue.closed = moment(issue.closed_at).from(now)
                }
                issue.created = moment(issue.created_at).from(now);
                issue.short_repo_name = issue.repo.split('/').pop();
                _.each(issue.builds, function(build) {
                    if (build.state == 'started') {
                        build.cssClass = 'pulsate';
                    }
                });
                return issue;
            })
          , staticDir: staticDir
          , urlPrefix: urlPrefix
        };
    }

    function IssueView(cfg) {
        if (! cfg.issuesUrl && ! cfg.issues) {
            throw new Error('Cannot load IssuesView without either a data ' +
                'URL or array of issues to show.');
        }
        this.$issues = $('#' + cfg.elementId);
        this.config = cfg;
        this.issuesUrl = cfg.issuesUrl;
        this.refreshRate = cfg.refreshRate;
        if (this.refreshRate == undefined) {
            this.refreshRate = DEFAULT_REFRESH_RATE;
        }
        this.$loadingDialog = $('#modal-loading');
        return this;
    }

    function renderTemplate($element, templateName, data) {
        var template = Handlebars.compile($('#' + templateName).html());
        $element.html(template(data));
    }

    function filterIssues(issues, filter) {
        // Replace + with space.
        _.each(filter, function(val, key) {
            filter[key] = val.replace('+', ' ');
        });
        // Operate upon a deep local clone so we don't modify the top-level issues when we filter.
        var filteredIssues = $.extend(true, {}, issues);
        filteredIssues = _.filter(filteredIssues, function(issue) {
            var labelNames = _.map(issue.labels, function(label) { return label.name; });
            if (filter.text && (issue.title.toLowerCase().indexOf(filter.text.toLowerCase()) == -1)) {
                return false;
            }
            if (filter.milestone
                && filter.milestone !== 'all'
                && (issue.milestone == undefined || filter.milestone !== issue.milestone.title)) {
                return false;
            }
            if (filter.repo
                && filter.repo !== 'all'
                && ! endsWith(filter.repo, issue.repo)) {
                return false;
            }
            if (filter.assignee
                && filter.assignee !== 'all'
                && (issue.assignee == undefined || filter.assignee !== issue.assignee.login)) {
                return false;
            }
            if (filter.type
                && filter.type !== 'all') {
                if (filter.type == 'pull requests' && ! issue.pull_request) {
                    return false;
                } else if (filter.type == 'issues' && issue.pull_request) {
                    return false;
                }
            }
            if (filter.state && filter.state !== 'all' && filter.state !== issue.state) {
                return false;
            }
            if (filter.label && filter.label !== 'all' && ! _.contains(labelNames, filter.label)) {
                return false;
            }
            return true;
        });
        return filteredIssues;
    }

    function addGhostUnassigned(issues, unassignedImageUrl) {
        _.each(issues, function(issue) {
            if (! issue.assignee) {
                issue.assignee = {
                    login: 'unassigned',
                    avatar_url: unassignedImageUrl
                };
            }
        });
    }

    IssueView.prototype.render = function(issues, filter) {
        var issuesData = convertIssuesToTemplateData(
           issues, this.config.staticDir, this.config.urlPrefix
        );
        renderTemplate(this.$issues, this.issuesTemplate, issuesData);
        if (this.$filter) {
            // Now that issues are rendered, stash them for filtering.
            this.$issueItems = this.$issues.find('tr.issue');
        }
    };

    IssueView.prototype.showLoading = function(showLoading) {
        if (showLoading) {
            this.$loadingDialog.modal({
                show: true
                , keyboard: false
            });
        } else {
            this.$loadingDialog.modal('hide');
        }
    };

    IssueView.prototype.loadPage = function(issuesUrl, callback) {
        var me = this
          , filter = extractFilterFrom(window.location.hash);
        function handleIssues(issues, cb) {
            // Keep this as the master copy to start fresh when filters are applied.
            me.allIssues = issues;
            addGhostUnassigned(me.allIssues, me.config.staticDir + 'images/unassigned.png');
            me.render(filterIssues(me.allIssues, filter), filter);
            if (cb) {
                cb();
            }
        }
        if (issuesUrl) {
            me.showLoading(true);
            $.getJSON(issuesUrl, function(response) {
                handleIssues(response.issues);
                if (me.config.filterId) {
                    me.setFilterView(new FilterView({
                        elementId: 'issue-filters'
                      , staticDir: me.config.staticDir
                      , issues: response.issues
                      , showAffliction: true
                    }));
                }
                me.showLoading(false);
            });
        } else {
            handleIssues(me.config.issues);
        }
    };

    IssueView.prototype.load = function(callback) {
        var me = this
          , staticDir = this.config.staticDir;
        loadTemplate(staticDir + 'templates/issues.html', 'issues', function(err, localIssuesTemplate) {
            if (err) {
                return console.log(err);
            }
            me.issuesTemplate = localIssuesTemplate;
            loadTemplate(staticDir + 'templates/name-count.html', 'namecount', function(err, localNameCountTemplate) {
                if (err) {
                    return console.log(err);
                }
                me.nameCountTemplate = localNameCountTemplate;
                me.loadPage(me.issuesUrl, function() {
                    setInterval(function() {
                        me.loadPage("Reloading...");
                    }, me.refreshRate);
                    if (callback) {
                        callback();
                    }
                });
            });
        });
    };

    IssueView.prototype._filterDiffers = function(filters) {
        if (! this.currentFilters) {
            return true;
        }
        return JSON.stringify(this.currentFilters) != JSON.stringify(filters);
    };

    IssueView.prototype.setFilterView = function(filterView) {
        var me = this;
        filterView.listen(function (filter) {
            if (me._filterDiffers(filter)) {
                me.currentFilters = filter;
                me.render(filterIssues(me.allIssues, filter), filter);
            }
        });
    };

    IssueView.extractFilterFrom = extractFilterFrom;

    window.IssueView = IssueView;

});