var SprinterDash = require('./lib/dash')
  , args = process.argv.slice(2)
  , port = undefined
  , dash = undefined
  , DEFAULT_REPOS = [
      'numenta/nupic'
    , 'rhyolight/sprinter.js'
    , 'numenta/nupic.core'
  ]
  , repos = DEFAULT_REPOS
  ;

if (args.length) {
    repos = args[0].split(',');
    if (args.length > 1) {
        port = args[1];
    }
} else {
    console.warn('No repos provided, starting with default repos:');
    console.warn(repos);
}

dash = new SprinterDash({repos: repos});
dash.startServer(port);
