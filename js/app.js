import { APP_VERSION } from './version.js';
import { libraryRoute } from './pages/library.js';
import { playlistsRoute, playlistEditorRoute } from './pages/playlists.js';
import { settingsRoute } from './pages/settings.js';
import { viewerRoute, viewerPlaylistRoute } from './pages/viewer.js';

// More specific/literal routes first — defensive against Framework7's router
// matching order, even though differing segment counts already disambiguate
// these in practice.
const routes = [
  viewerPlaylistRoute,
  viewerRoute,
  playlistEditorRoute,
  playlistsRoute,
  settingsRoute,
  libraryRoute,
  { path: '(.*)', redirect: '/' },
];

// eslint-disable-next-line no-undef
const app = new Framework7({
  el: '#app',
  name: 'HolySheet',
  theme: 'auto',
  routes,
  view: {
    // Hash-based history (URLs like /#!/viewer/playlist/<id>/), not real
    // pushState paths. Everything after the hash never reaches the server,
    // so reload/back-navigation on any sub-route work correctly on any
    // static host with zero server-side rewrite config — this app will run
    // under whatever local dev server the user has (python http.server,
    // VS Code Live Server, ...) plus eventually holysheet.drhmedia.net, and
    // we can't assume SPA-fallback config on any of them.
    browserHistory: true,
    browserHistorySeparator: '#!',
  },
});

app.views.create('#view-main', { main: true });

const tabbar = document.getElementById('main-tabbar');
if (tabbar) {
  tabbar.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-route]');
    if (!link) return;
    e.preventDefault();
    app.views.main.router.navigate(link.dataset.route);
  });
}

console.log(`HolySheet v${APP_VERSION}`);

export { app };
