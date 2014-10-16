$(function() {
    
    var $loadingDialog = $('#modal-loading')
      , $roadMap = $('#roadmap-container')
      , roadmapTemplateUrl = window.staticDir 
          + 'templates/roadmap-milestones.html'
      , roadmapDataUrl = window.urlPrefix + '_roadmap'
      , dataLoaded = false
      , hashParams
      , detail = 1;

    function loadTemplate(src, id, callback) {
        $.ajax({
            url: src,
            success: function(resp) {
                var $script = $('<script type="text/template" id="' + id 
                    + '_tmpl">' + resp + '</script>');
                $('body').append($script);
                callback(null, id + '_tmpl');
            },
            failure: callback
        });
    }

    function renderTemplate($element, templateName, data) {
        var template = Handlebars.compile($('#' + templateName).html());
        $element.html(template(data));
    }

    function extractFilterFrom(hash) {
        var params = {
                milestone: 'all'
              , repo: 'all'
              , assignee: 'all'
              , type: 'all'
              , state: 'open'
            }
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

    function refineData(detailLevel, data) {
        // We start with the most detail, so if we want it all we leave it alone.
        if (detailLevel == 2) {
            return;
        }
        _.each(data.milestones, function(milestone) {
            if (milestone.due_on) {
                milestone.due_on = moment(milestone.due_on).format("MMM Do YYYY");
            }
            _.each(milestone.issues, function(issue) {
                var body = issue.html_body;
                if (detailLevel == 0) {
                    // Remove the entire body.
                    issue.html_body = '';
                } else if (detailLevel == 1) {
                    // Strip off the subtask list
                    issue.html_body = issue.html_body.split('<hr>')[0]
                }
            });
        });
    }

    hashParams = extractFilterFrom(window.location.hash);
    if (hashParams.detail) {
        detail = hashParams.detail;
    }

    // In case the data loads from the cache, we'll wait half a second to show the
    // loading dialog or else it's really annoying to see it pop up and disappear.
    setTimeout(function() {
        if (! dataLoaded) {
            $loadingDialog.modal({
                show: true
              , keyboard: false
            });
        }
    }, 500);

    loadTemplate(roadmapTemplateUrl, 'roadmap', function(err, roadmapTemplate) {
        $.getJSON(roadmapDataUrl + window.location.search, function(response) {
            dataLoaded = true;
            refineData(detail, response);
            renderTemplate($roadMap, roadmapTemplate, response);
            $loadingDialog.modal('hide');
        });
    });
});
