import gulp from 'gulp';
import gulpSass from 'gulp-sass';
import * as sass from 'sass';
import concat from 'gulp-concat';
import uglify from 'gulp-uglify';
import browserSync from 'browser-sync';

const scss = gulpSass(sass);
const bs   = browserSync.create();

// ── Paths ────────────────────────────────────────────────────────────────────
const paths = {
  styles: {
    src:  'src/scss/**/*.scss',
    dest: 'dist/css',
  },
  scripts: {
    src: [
      'node_modules/jquery/dist/jquery.min.js',
      'node_modules/bootstrap/dist/js/bootstrap.bundle.min.js',
      'src/js/main.js',
    ],
    dest: 'dist/js',
  },
  html: {
    src:  'src/**/*.html',
    dest: 'dist',
  },
};

// ── SCSS → CSS ───────────────────────────────────────────────────────────────
export function styles() {
  return gulp
    .src(paths.styles.src, { sourcemaps: true })
    .pipe(scss({ outputStyle: 'compressed' }).on('error', scss.logError))
    .pipe(gulp.dest(paths.styles.dest, { sourcemaps: '.' }))
    .pipe(bs.stream());
}

// ── JS Bundle ────────────────────────────────────────────────────────────────
export function scripts() {
  return gulp
    .src(paths.scripts.src, { sourcemaps: true })
    .pipe(concat('app.js'))
    .pipe(uglify())
    .pipe(gulp.dest(paths.scripts.dest, { sourcemaps: '.' }));
}

// ── Copy HTML ────────────────────────────────────────────────────────────────
export function html() {
  return gulp.src(paths.html.src).pipe(gulp.dest(paths.html.dest));
}

// ── Copy Bootstrap Icons font (optional) ────────────────────────────────────
export function assets() {
  return gulp
    .src('node_modules/bootstrap/dist/css/bootstrap.min.css')
    .pipe(gulp.dest('dist/css'));
}

// ── BrowserSync ──────────────────────────────────────────────────────────────
function serve(done) {
  bs.init({
    server: { baseDir: './dist' },
    port:   3000,
    notify: false,
  });
  done();
}

// ── Reload ───────────────────────────────────────────────────────────────────
function reload(done) {
  bs.reload();
  done();
}

// ── Watch ────────────────────────────────────────────────────────────────────
export function watch() {
  serve( () => {} );
  gulp.watch(paths.styles.src,  styles);
  gulp.watch(paths.scripts.src, gulp.series(scripts, reload));
  gulp.watch(paths.html.src,    gulp.series(html, reload));
}

// ── Build ────────────────────────────────────────────────────────────────────
export const build = gulp.series(
  gulp.parallel(styles, scripts, html, assets)
);

export default build;
