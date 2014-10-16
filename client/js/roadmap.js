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

function renderTemplate($element, templateName, data) {
    var template = Handlebars.compile($('#' + templateName).html());
    $element.html(template(data));
}


$(function() {
    var $loadingDialog = $('#modal-loading')
      , $roadMap = $('#roadmap-container');
    $loadingDialog.modal({
        show: true
      , keyboard: false
    });
    loadTemplate(window.staticDir + 'templates/roadmap-milestones.html', 'roadmap', function(err, roadmapTemplate) {
        $.getJSON(window.urlPrefix + '_roadmap', function(response) {
            console.log(response);
            renderTemplate($roadMap, roadmapTemplate, response);
            $loadingDialog.modal('hide');
        });
    });
});
