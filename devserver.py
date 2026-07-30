#!/usr/bin/env python3
"""Drop-in replacement for `python3 -m http.server` that also sends
Cache-Control: no-cache, must-revalidate on every response.

Plain `http.server` sends no Cache-Control header at all, so the browser is
free to reuse a stale disk-cache copy of any file (including anything deep
in js/app.js's ES module import graph) even after the app's own caching
toggle is off and its Service Worker/Cache Storage are torn down — those are
a separate cache layer entirely. This mirrors the Cache-Control fix already
applied in production via .htaccess (see "Hosting gotchas" in CLAUDE.md),
so local dev gets the same guarantee: every reload revalidates against the
file's current Last-Modified time (still a cheap 304 if nothing changed),
so an APP_VERSION bump — or any file edit — is always picked up next reload.

Usage: same as `python3 -m http.server` — e.g. `python3 devserver.py 8420`.
"""
import http.server


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    http.server.test(HandlerClass=NoCacheHandler)
