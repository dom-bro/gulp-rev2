# gulp-rev2

> 给资源文件添加文件指纹 a.png → a-f7ee61d96b.png（文件名） 或 a.png → a.png?\_v_=f7ee61d96b（url参数）

## Install

    $ npm install --save-dev gulp-rev2

## Usage

    const gulp = require('gulp');
    const rev2 = require('gulp-rev2');

    gulp.task('build:image', ()=>{
        return gulp.src('./demo/**/*.{png,jpg,gif,ico}')
            .pipe(rev2({                // 生成文件指纹并修改文件名
                query: true,            // 以 query string的方式进行指纹关联, 默认使用修改文件名方式进行关联
            }))
            .pipe(gulp.dest('dist'))    // 输出到 dist 目录
            .pipe(rev2.manifest())      // 生成映射对照表 rev-manifest.js
            .pipe(gulp.dest('.'));      // 输出到 gulpfile.js 同级目录
    });

    gulp.task('build:css', ['build:image'], ()=>{
        return gulp.src('./demo/**/*.css')
            .pipe(rev2.update())        // 根据映射对照表更新存在引用的父文件
            .pipe(gulp.dest('dist'))
    });
