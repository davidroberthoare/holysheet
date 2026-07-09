import { APP_VERSION } from './js/version.js';

const CACHE_NAME = `holysheet-shell-${APP_VERSION}`;
const RUNTIME_CACHE_NAME = `holysheet-runtime-${APP_VERSION}`;

// Update this list whenever a new top-level source file is added (see
// "Planned file structure" in CLAUDE.md). cache.addAll() fails the whole
// install if any single URL 404s, which is deliberate — better to find out
// a path is wrong during testing than to silently ship a gap in the shell.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/version.js',
  './js/db.js',
  './js/caching.js',
  './js/util.js',
  './js/pages/library.js',
  './js/pages/viewer.js',
  './js/pages/playlists.js',
  './js/pages/settings.js',
  './js/storage/sheets.js',
  './js/storage/playlists.js',
  './js/storage/annotations.js',
  './js/import/local-source.js',
  './js/import/index.js',
  './js/export/backup.js',
  './vendor/framework7/css/framework7-bundle.min.css',
  './vendor/framework7/js/framework7-bundle.min.js',
  './vendor/framework7/icons/framework7-icons.css',
  './vendor/framework7/fonts/Framework7Icons-Regular.woff2',
  './vendor/framework7/fonts/Framework7Icons-Regular.woff',
  './vendor/framework7/fonts/Framework7Icons-Regular.ttf',
  './vendor/pdfjs/pdf.min.mjs',
  './vendor/pdfjs/pdf.worker.min.mjs',
  './vendor/fflate/browser.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE_NAME && key.startsWith('holysheet-'))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // SPA sub-routes (e.g. /settings/, /viewer/<id>/) aren't real files — the
  // static host 404s on a direct reload/deep-link at those paths. Always hand
  // navigations the cached shell and let the client-side router take it from
  // location.pathname; a plain 404-on-network-failure check isn't enough
  // because fetch() resolves (doesn't reject) on a successful-but-404
  // response, so that path was slipping through uncaught (caught during
  // smoke testing: reloading at /settings/ served the host's 404 page).
  if (request.mode === 'navigate') {
    event.respondWith(caches.match('./index.html').then((shell) => shell || fetch(request)));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => undefined);
    })
  );
});
