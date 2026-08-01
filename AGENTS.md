# AGENTS.md

HolySheet: a single-user, offline-first sheet-music reader PWA (Framework7 + pdf.js + fflate). Hobby project, favor simplicity. Detailed history/decisions are in `CLAUDE.md` (gitignored, local only) — this file is the committed, always-present summary.

## Non-negotiable architecture (confirmed with user, do not re-litigate)

- **No build pipeline, no npm, no bundler.** Raw HTML/CSS/JS only. There is no `package.json`, no test framework, no lint/format config. Do not introduce one.
- **Framework7 only** (bundled Dom7 + Framework7 Icons). All UI framework code is vendored under `vendor/`; never switch to a CDN (offline-first requirement).
- **Offline-first PWA.** Service worker + IndexedDB. Data lives only in the user's browser; the only backup is the zip export in Settings.
- **Caching is toggleable** and **OFF by default**. A setting, not implicit. Never "just add caching."

## Running / verifying

- Local dev server (required — service workers don't work on `file://`):
  `python3 devserver.py 8420`, then open `http://localhost:8420/index.html`.
  Use `devserver.py`, NOT bare `python3 -m http.server`: it adds `Cache-Control: no-cache, must-revalidate` so edits are picked up next reload instead of the browser's disk cache serving stale files (a real, previously-hit bug).
- **No test suite.** Verification is manual browser testing (a headless-Chromium Playwright smoke test exists as a one-off session script, not committed). Verify your changes by serving and loading the app.

## Making changes — checklists that are easy to forget

- **Bump `APP_VERSION` in `js/version.js`** whenever JS/CSS changes are deployed or SW-cache staleness is suspected. It stamps the SW's cache name; without a bump, the old shell stays cached.
- **New source file (top-level `js/**` or app asset)?** Add it to `PRECACHE_URLS` in `sw.js`. `cache.addAll()` fails the whole install if any URL 404s — that's deliberate, so test it.
- **New route module in `js/pages/`?** Importing it is NOT enough: its exported route object must be pushed into the `routes` array in `js/app.js`, before the `(.*)` catch-all redirect. Omission silently redirects to `/` with no error.
- **New import source (Drive/Dropbox)?** Add it to the `importSources` array in `js/import/index.js`. No other file changes.
- **Route lifecycle callbacks take TWO args: `(event, page)`** — `pageInit`, `pageBeforeIn`, `pageBeforeOut`. One-arg form binds `page` to the DOM event and everything silently becomes `undefined`.

## Framework7 gotchas (real bugs, don't reintroduce)

- Dark theme class is `dark` on `<html>`, not `theme-dark` (silently does nothing).
- `index.html` needs `<base href="/">` or relative assets re-resolve against the current pushState path.
- Routing is **hash-based by design** (`#!` URLs via `browserHistorySeparator`). Don't switch to clean pushState URLs without solving SPA-fallback on every static host.
- A `.list.sortable` (drag reorder) requires its `<li>` items inside a real `<ul>`. Without it, dragging looks fine but items never resort (see `js/pages/playlists.js` `renderEditorList`).
- Any JS-created `<a>` for a download/external link needs `class="external"`, or Framework7's router hijacks the click (zip export silently never downloaded — `js/export/backup.js`).
- Don't override `.page-content`'s `padding` shorthand (breaks fixed-navbar spacing; viewer uses a flex `::after` spacer instead). Flex children in a scrolling column container need `flex-shrink: 0` or they get squeezed.
- Tabbar is a sibling of `.view-main`, styled manually in `css/app.css` with `position: fixed; z-index: 5001` (must exceed `.view-main`'s 5000).

## Filesystem / hosting quirks

- PWA icons live in `app-icons/`, NOT `icons/` — Apache has a built-in `/icons/` alias that silently intercepts requests (rename would break production). `manifest.json` references `app-icons/`.
- `.htaccess` sets `Cache-Control: no-cache, must-revalidate` on `index.html`, `sw.js`, `manifest.json`, and all `.js`/`.mjs`/`.css`. This layer (HTTP disk cache) is separate from the SW's Cache Storage; the Settings toggle can't touch it. Don't remove these headers.
- Storage is IndexedDB (`js/db.js`: sheets/playlists/annotations/settings stores); the only localStorage use is the caching flag `holysheet:cachingEnabled` (deliberately, it must be readable synchronously at bootstrap).
- Styling note: Framework7's styled checkboxes/toggles visually hide the raw `<input>` — for any automation, click the wrapping label.

## Source layout

- `js/app.js` — Framework7 init + route table. `js/version.js` — version string. `js/db.js` — IndexedDB. `js/caching.js` — shared SW kill-switch.
- `js/pages/` — one file per route (library, viewer, playlists, settings). `js/storage/` — per-entity CRUD. `js/import/` — pluggable upload sources. `js/export/backup.js` — zip export/import (fflate).
- `vendor/` — framework7, pdfjs, fflate, all vendored ESM/UMD. `test.pdf` in repo root is a test fixture for upload.
