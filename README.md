# gulp-rev2

> 给资源文件添加文件指纹

> `a.png` → `a-f7ee61d96b.png`（文件名方式）

> `a.png` → `a.png?_v_=f7ee61d96b`（url参数方式）

## Install
```bash
$ npm install --save-dev gulp-rev2
```
## Usage

```js
const gulp = require('gulp');
const rev2 = require('gulp-rev2');

gulp.task('build:image', ()=>{
    return gulp.src('./demo/**/*.{png,jpg,gif,ico}')
        .pipe(rev2({                // 生成文件指纹并修改文件名
            // 以 query string的方式进行指纹关联, 默认使用修改文件名方式进行关联   
            query: true,            
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
```

## 设计思路
**gulp-rev2** 主要借鉴了 **gulp-rev** 和 **gulp-rev-collector** 的设计实现，主要实现思路如下：

1. 根据文件的内容 `file.contents` 生成文件指纹（`hash`值）；

2. 根据前面生成的文件指纹集合成一张`（源文件，构建文件）`映射对照表（并保存在清单文件 rev-manifest.json 中）；

3. 根据前面生成的映射对照表级联更新存在引用的父文件；

## 配置项

### rev2([opts])

#### query

Type: `boolean`<br>
Default: `false`

设置文件指纹的关联方式，`true` 通过url参数关联 `a.png` → `a.png?_v_=f7ee61d96b`，`false` 通过文件名关联 `a.png` → `a-f7ee61d96b.png`。

## Demo

这里有一个栗子：[**gulp-rev2-demo**](https://github.com/makemoretime/gulp-rev2-demo)

这里有一篇教程：[**给资源文件添加指纹（Gulp版）**](https://www.cnblogs.com/iovec/p/7772567.html)
