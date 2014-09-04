$(function() {

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

    function renderTemplate($element, templateName, data) {
        var template = Handlebars.compile($('#' + templateName).html());
        $element.html(template(data));
    }

    function extractIssueAssignees(issues) {
        var all = {
            name: 'all', count: 0
        }, assignees = [];
        _.each(issues, function(issue) {
            if (issue.assignee) {
                var name = issue.assignee.login
                    , assignee = _.find(assignees, function(a) { return a.name == name; });
                if (! assignee) {
                    assignees.push({
                        name: name,
                        count: 1
                    });
                } else {
                    assignee.count++;
                }
                all.count++;
            }
        });
        assignees = _.sortBy(assignees, function(a) { return a.count; }).reverse()
        assignees.unshift(all);
        return {
            items: assignees
            , title: 'Assignees'
            , type: 'assignee'
        };
    }

    function extractIssueTypes(issues) {
        var all = {
            name: 'all', count: 0
        }, issuesOut = {
            name: 'issues', count: 0
        }, prs = {
            name: 'pull requests', count: 0
        }, allIssuesOut = [all, issuesOut, prs];
        _.each(issues, function(issue) {
            if (issue.pull_request) {
                prs.count++;
            } else {
                issuesOut.count++;
            }
            all.count++;
        });
        return {
            items: allIssuesOut
            , title: 'Type'
            , type: 'type'
        };
    }

    function extractIssueStates(issues) {
        var all = {
            name: 'all', count: 0
        }, open = {
            name: 'open', count: 0
        }, closed = {
            name: 'closed', count: 0
        }, allIssuesOut = [all, open, closed];
        _.each(issues, function(issue) {
            if (issue.state == 'open') {
                open.count++;
            } else {
                closed.count++;
            }
            all.count++;
        });
        return {
            items: allIssuesOut
            , title: 'State'
            , type: 'state'
        };
    }

    function extractIssueRepos(issues) {
        var all = {
                name: 'all', count: 0
            },
            reposOut = [];
        _.each(issues, function(issue) {
            var repoName = issue.repo.split('/').pop()
                , repo = _.find(reposOut, function(repo) { return repo.name == repoName; });
            if (! repo) {
                reposOut.push({
                    name: repoName,
                    count: 1
                });
            } else {
                repo.count++;
            }
            all.count++;
        });
        reposOut = _.sortBy(reposOut, function(r) { return r.count; }).reverse()
        reposOut.unshift(all);
        return {
            items: reposOut
            , title: 'Repositories'
            , type: 'repo'
        };
    }


    function extractIssueMilestones(issues) {
        var all = {
                name: 'all', count: 0
            },
            milestonesOut = [all];
        _.each(issues, function(issue) {
            var milestone = _.find(milestonesOut, function(ms) { return issue.milestone.title == ms.name; });
            if (! milestone) {
                milestonesOut.push({
                    name: issue.milestone.title,
                    count: 1
                });
            } else {
                milestone.count++;
            }
            all.count++;
        });
        milestonesOut = _.sortBy(milestonesOut, function(ms) {
            return ms.name.toLowerCase();
        });
        return {
            items: milestonesOut
            , title: 'Sprints'
            , type: 'milestone'
        };
    }

    function extractIssueLabels(issues) {
        var all = {
                name: 'all', count: 0
            }
            , labelsOut = [];
        _.each(issues, function(issue) {
            _.each(issue.labels, function(label) {
                var existingLabel = _.find(labelsOut, function(l) {
                    return l.name == label.name;
                });
                if (existingLabel) {
                    existingLabel.count++;
                } else {
                    labelsOut.push({
                        name: label.name,
                        count: 1
                    });
                }
            });
            all.count++;
        });
        labelsOut = _.sortBy(labelsOut, function(l) { return l.name; });
        labelsOut.unshift(all);
        return {
            items: labelsOut
            , title: 'Labels'
            , type: 'label'
        };
    }

    function FilterView(cfg, callback) {
        var me = this
          , showAffliction = true;
        if (cfg.issues) {
            me.issues = cfg.issues;
        }
        if (cfg.showAffliction != undefined) {
            showAffliction = Boolean(cfg.showAffliction);
        }
        me.listeners = [];
        loadTemplate(cfg.staticDir + 'templates/filter.html', 'filter', function(err, filterTemplate) {
            loadTemplate(cfg.staticDir + 'templates/name-count.html', 'namecount', function(err, nameCountTemplate) {
                me.nameCountTemplate = nameCountTemplate;
                me.$filter = $('#' + cfg.elementId);
                renderTemplate(me.$filter, filterTemplate, {
                    showAffliction: showAffliction
                });
                me.filterElements = {
                    assignee: me.$filter.find('#assignee-filter'),
                    repo: me.$filter.find('#repo-filter'),
                    milestone: me.$filter.find('#milestone-filter'),
                    type: me.$filter.find('#type-filter'),
                    state: me.$filter.find('#state-filter'),
                    label: me.$filter.find('#label-filter')
                };
                me.$textSearchField = me.$filter.find('#text-search');
                me.$clearSearch = me.$filter.find('#clear-search');
                me.render();
                if (callback) {
                    callback();
                }
            });
        });
    }

    FilterView.prototype.addFilterClickHandling = function() {
        var me = this
            , lastKeyPress = undefined;
        function getLocalFilter(event, filterType) {
            var filter = extractFilterFrom(window.location.hash);
            filter[filterType] = $(event.currentTarget).data('name');
            return filter;
        }
        _.each(me.filterElements, function($filterElement, filterType) {
            // On filter click, filters all issues by filter type clicked.
            $filterElement.find('ul li').click(function(event) {
                var filter = getLocalFilter(event, filterType);
                me.fireFilterChange(filter);
            });
        });
        me.$clearSearch.click(function() {
            me.$textSearchField.val('');
            var filter = extractFilterFrom(window.location.hash);
            filter.text = ''
            me.fireFilterChange(filter);
        });
        me.$textSearchField.on('keyup', function() {
            // The timeout below allows users to quickly type words without
            // triggering a UI filter between characters.
            var timePressed = new Date().getTime();
            setTimeout(function() {
                if (lastKeyPress == timePressed) {
                    var filter = extractFilterFrom(window.location.hash);
                    filter.text = me.$textSearchField.val()
                    me.fireFilterChange(filter);
                }
            }, 200);
            lastKeyPress = timePressed;
        });
    };

    FilterView.prototype.updateFilterLinks = function(filter) {
        _.each(this.filterElements, function($filterElement, filterType) {
            // Remove any selections on current filter triggers
            $filterElement.find('ul li').removeClass('active');
            // Add active to chosen filters.
            $filterElement.find('ul li[data-name=\'' + filter[filterType] + '\']').addClass('active');
        });

        // Update href links with new filter
        this.$filter.find('ul li.name-count ul li').each(function() {
            var $item = $(this)
                , $link = $item.find('a')
                , pieces = $link.attr('href').split('#')
                , name = $item.data('name')
                , type = $item.data('type')
                , linkFilter = {}
                , updatedFilter;
            linkFilter[type] = name;
            updatedFilter = _.extend({}, filter, linkFilter);
            $link.attr('href', pieces[0] + '#' + $.param(updatedFilter));
        });
    };


    FilterView.prototype.listen = function(callback) {
        this.listeners.push(callback);
    };

    FilterView.prototype.fireFilterChange = function(filter) {
        _.each(this.listeners, function(callback) {
            callback(filter);
        });
    };

    FilterView.prototype.render = function() {
        var nameCountTemplate = this.nameCountTemplate
          , issues = this.issues
          , assignees = extractIssueAssignees(issues)
          , repos = extractIssueRepos(issues)
          , milestones = extractIssueMilestones(issues)
          , types = extractIssueTypes(issues)
          , states = extractIssueStates(issues)
          , labels = extractIssueLabels(issues)
          , filter = extractFilterFrom(window.location.hash);
        renderTemplate(this.filterElements.assignee, nameCountTemplate, assignees);
        renderTemplate(this.filterElements.repo, nameCountTemplate, repos);
        renderTemplate(this.filterElements.milestone, nameCountTemplate, milestones);
        renderTemplate(this.filterElements.type, nameCountTemplate, types);
        renderTemplate(this.filterElements.state, nameCountTemplate, states);
        renderTemplate(this.filterElements.label, nameCountTemplate, labels);
        this.addFilterClickHandling();
        this.updateFilterLinks(filter);
    };

    window.FilterView = FilterView;

});