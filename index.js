'use strict';
const _ = require('underscore');
const path = require('path');
const gutil = require('gulp-util');
const PluginError  = gutil.PluginError;
const through = require('through2');
const vinylFile = require('vinyl-file');
const revHash = require('rev-hash');
const revPath = require('rev-path');
const sortKeys = require('sort-keys');
const modifyFilename = require('modify-filename');

let conf = {};

function transformFilename(file) {
    file.path = modifyFilename(file.path, (filename, extension) => {
        const extIndex = filename.indexOf('.');

    filename = extIndex === -1 ?
        revPath(filename, file.revHash) :
        revPath(filename.slice(0, extIndex), file.revHash) + filename.slice(extIndex);

    return filename + extension;
});
}

const getManifestFile = opts => vinylFile.read(opts.path, opts).catch(err => {
    if (err.code === 'ENOENT') {
    return new gutil.File(opts);
}

throw err;
});

const plugin = (opts={}) => {
    conf = opts;
    const sourcemaps = [];
    const pathMap = {};

    return through.obj((file, enc, cb) => {
        if (file.isNull()) {
        cb(null, file);
        return;
    }

    if (file.isStream()) {
        cb(new gutil.PluginError('gulp-rev', 'Streaming not supported'));
        return;
    }

    // This is a sourcemap, hold until the end
    if (path.extname(file.path) === '.map') {
        sourcemaps.push(file);
        cb();
        return;
    }

    const oldPath = file.path;

    // Save the old path for later
    file.revOrigPath = file.path;
    file.revOrigBase = file.base;
    file.revHash = revHash(file.contents);

    if(!opts.query){
        transformFilename(file);
    }
    pathMap[oldPath] = file.revHash;

    cb(null, file);
}, function (cb) {
        sourcemaps.forEach(file => {
            let reverseFilename;

        // Attempt to parse the sourcemap's JSON to get the reverse filename
        try {
            reverseFilename = JSON.parse(file.contents.toString()).file;
        } catch (err) {}

        if (!reverseFilename) {
            reverseFilename = path.relative(path.dirname(file.path), path.basename(file.path, '.map'));
        }

        if (pathMap[reverseFilename]) {
            // Save the old path for later
            file.revOrigPath = file.path;
            file.revOrigBase = file.base;

            const hash = pathMap[reverseFilename];
            file.path = revPath(file.path.replace(/\.map$/, ''), hash) + '.map';
        } else {
            transformFilename(file);
        }

        this.push(file);
    });

        cb();
    });
};

plugin.manifest = (opts) => {
    console.log(path.resolve('rev-manifest.json'));

    opts = Object.assign({
        path: path.resolve('rev-manifest.json'),
        merge: true,
        transformer: JSON
    }, opts);

    let manifest = {};

    return through.obj((file, enc, cb) => {
        // Ignore all non-rev'd files
        if (!file.path || !file.revOrigPath) {
        cb();
        return;
    }
    // 向 rev-manifest 写入映射表
    manifest[path.resolve(file.revOrigPath)] = conf.query ? `${path.basename(file.revOrigPath)}?_v_=${file.revHash}` : path.basename(file.path);

    cb();
}, function (cb) {
        // No need to write a manifest file if there's nothing to manifest
        if (Object.keys(manifest).length === 0) {
            cb();
            return;
        }

        getManifestFile(opts).then(manifestFile => {
            if (opts.merge && !manifestFile.isNull()) {
            let oldManifest = {};

            try {
                oldManifest = opts.transformer.parse(manifestFile.contents.toString());
            } catch (err) {}

            manifest = Object.assign(oldManifest, manifest);
        }

        manifestFile.contents = Buffer.from(opts.transformer.stringify(sortKeys(manifest), null, '  '));
        this.push(manifestFile);
        cb();
    }).catch(cb);
    });
};

const defaults = {
    revSuffix: '-[0-9a-f]{8,10}-?',
    extMap: {
        '.scss': '.css',
        '.less': '.css',
        '.jsx': '.js'
    }
};

function escPathPattern(pattern) {
    return pattern.replace(/[\-\[\]\{\}\(\)\*\+\?\.\^\$\|\/\\]/g, "\\$&");
}

function closeDirBySep(dirname) {
    return dirname + (!dirname || new RegExp( escPathPattern('/') + '$' ).test(dirname) ? '' : '/');
}

plugin.update = (opts) => {
    opts = _.defaults((opts || {}), defaults);

    var manifest  = require(opts.manifestFile || path.resolve('rev-manifest'));
    var mutables = [];
    return through.obj(function (file, enc, cb) {
        if (!file.isNull()) {
            mutables.push(file);
        }
        cb();
    }, function (cb) {
        var changes = [];
        var dirReplacements = [];
        if ( _.isObject(opts.dirReplacements) ) {
            Object.keys(opts.dirReplacements).forEach(function (srcDirname) {
                dirReplacements.push({
                    dirRX:  escPathPattern( closeDirBySep(srcDirname) ),
                    dirRpl: opts.dirReplacements[srcDirname]
                });
            });
        }

        if (opts.collectedManifest) {
            this.push(
                new gutil.File({
                    path: opts.collectedManifest,
                    contents: new Buffer(JSON.stringify(manifest, null, "\t"))
                })
            );
        }

        for (var key in manifest) {
            var patterns = [ escPathPattern(key) ];
            if (opts.replaceReved) {
                var patternExt = path.extname(key);
                if (patternExt in opts.extMap) {
                    patternExt = '(' + escPathPattern(patternExt) + '|' + escPathPattern(opts.extMap[patternExt]) + ')';
                } else {
                    patternExt = escPathPattern(patternExt);
                }
                patterns.push( escPathPattern( (path.dirname(key) === '.' ? '' : closeDirBySep(path.dirname(key)) ) )
                    + path.basename(key, path.extname(key))
                        .split('.')
                        .map(function(part){
                            return escPathPattern(part) + '(' + opts.revSuffix + ')?';
                        })
                        .join('\\.')
                    + patternExt
                );
            }

            if ( dirReplacements.length ) {
                dirReplacements.forEach(function (dirRule) {
                    patterns.forEach(function (pattern) {
                        changes.push({
                            regexp: new RegExp(  dirRule.dirRX + pattern, 'g' ),
                            patternLength: (dirRule.dirRX + pattern).length,
                            replacement: _.isFunction(dirRule.dirRpl)
                                ? dirRule.dirRpl(manifest[key])
                                : closeDirBySep(dirRule.dirRpl) + manifest[key]
                        });
                    });
                });
            } else {
                patterns.forEach(function (pattern) {
                    // without dirReplacements we must leave asset filenames with prefixes in its original state
                    var prefixDelim = '([\/\\\\\'"';
                    // if dir part in pattern exists, all exsotoic symbols should be correct processed using dirReplacements
                    if (/[\\\\\/]/.test(pattern)) {
                        prefixDelim += '\(=';
                    } else {
                        if (!/[\(\)]/.test(pattern)) {
                            prefixDelim += '\(';
                        }
                        if (!~pattern.indexOf('=')) {
                            prefixDelim += '=';
                        }
                    }
                    prefixDelim += '])';
                    changes.push({
                        regexp: new RegExp( prefixDelim + pattern, 'g' ),
                        patternLength: pattern.length,
                        replacement: '$1' + manifest[key]
                    });
                });
            }
        }

        // Replace longer patterns first
        // e.g. match `script.js.map` before `script.js`
        changes.sort(
            function(a, b) {
                return b.patternLength - a.patternLength;
            }
        );
        mutables.forEach(function (file){
            if (!file.isNull()) {
                var src = file.contents.toString('utf8');
                let dir = path.dirname(path.resolve(file.path));

                let assetReg = /\((.+(?:png|jpg|gif)"?'?)\)/g,
                    res;
                while(res = assetReg.exec(src)){
                    let absPath = path.join(dir, res[1]);
                    let fileName = path.basename(absPath).replace(/([\|\^\*\.\+\$\?\[\]\(\)\{\}])/g, '\\$1');
                    if(manifest[absPath]){
                        // 全局字符串替换
                        src = src.replace(new RegExp(fileName, 'g'), manifest[absPath]);
                    }
                }
                file.contents = new Buffer(src);
            }
            this.push(file);
        }, this);

        cb();
    });
};

module.exports = plugin;