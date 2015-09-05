var express = require('express'),
    dash = require('./lib/dash'),
    buildStaticSite = require('./lib/smithy'),
    args = process.argv.slice(2),
    port = 8080,
    DEFAULT_REPOS = [
        'numenta/nupic',
        'rhyolight/sprinter.js',
        'numenta/nupic.core'
    ],
    repos = DEFAULT_REPOS,
    urlPrefix = '/',
    app;

if (args.length) {
    repos = args[0].split(',');
    if (args.length > 1) {
        port = args[1];
    }
} else {
    console.warn('No repos provided, starting with default repos:');
    console.warn(repos);
}

buildStaticSite();

app = express();

dash(app, urlPrefix, repos, function() {
    app.use(express.static('build'));
    app.listen(port, function() {
        console.log(
            'sprinter.js dashboard server running on\n' +
            '\thttp://localhost:' + port + urlPrefix
        );
    });
});

