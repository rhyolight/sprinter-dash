var fs = require('fs-extra'),
    path = require('path'),
    _ = require('lodash'),

    Metalsmith = require('metalsmith'),
    layouts = require('metalsmith-layouts'),

    source = path.join(__dirname, '../site'),
    destination = path.join(__dirname, '../build'),
    layoutsDirectory = path.join(__dirname, '../site/layouts');

module.exports = function () {

    // Ensure clean build.
    fs.removeSync(destination);

    Metalsmith(__dirname)
        .source(source)
        .destination(destination)
        .use(layouts({
            engine: 'handlebars',
            directory: layoutsDirectory
        }))
        .build(function (error) {
            if (error) {
                console.error(error);
                process.exit(-1);
            }
        });
};
