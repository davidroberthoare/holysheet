import { listSheets } from '../storage/sheets.js';
import {
  listPlaylists,
  getPlaylist,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  setPlaylistSheets,
} from '../storage/playlists.js';
import { escapeHtml, setActiveTab } from '../util.js';

// ---------- Playlist list ----------

function renderPlaylistList(el, playlists) {
  const listEl = el.querySelector('#playlist-list');
  const emptyEl = el.querySelector('#empty-state');

  if (!playlists.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  listEl.innerHTML = playlists
    .map(
      (playlist) => `
      <li>
        <a href="#" class="item-link item-content" data-id="${playlist.id}">
          <div class="item-media"><i class="icon f7-icons">music_albums_fill</i></div>
          <div class="item-inner">
            <div class="item-title-row">
              <div class="item-title">${escapeHtml(playlist.name)}</div>
              <div class="item-after"><i class="icon f7-icons playlist-more" data-id="${playlist.id}">ellipsis</i></div>
            </div>
            <div class="item-subtitle">${playlist.sheetIds.length} sheet${playlist.sheetIds.length === 1 ? '' : 's'}</div>
          </div>
        </a>
      </li>`
    )
    .join('');
}

async function refreshList(page) {
  const playlists = await listPlaylists();
  renderPlaylistList(page.el, playlists);
}

function createPlaylistPrompt(app, page) {
  app.dialog.prompt('Playlist name', 'New Playlist', async (value) => {
    const name = value.trim();
    if (!name) return;
    const playlist = await createPlaylist({ name });
    app.views.main.router.navigate(`/playlists/${playlist.id}/`);
  });
}

function openPlaylistActions(app, page, playlistId) {
  app.actions
    .create({
      buttons: [
        [
          {
            text: 'Rename',
            onClick: () => {
              app.dialog.prompt('Playlist name', 'Rename', async (value) => {
                const name = value.trim();
                if (!name) return;
                await renamePlaylist(playlistId, name);
                refreshList(page);
              });
            },
          },
          {
            text: 'Delete',
            color: 'red',
            onClick: () => {
              app.dialog.confirm('Delete this playlist? Sheets themselves are not affected.', 'Delete Playlist', async () => {
                await deletePlaylist(playlistId);
                refreshList(page);
              });
            },
          },
        ],
        [{ text: 'Cancel', color: 'gray' }],
      ],
    })
    .open();
}

export const playlistsRoute = {
  path: '/playlists/',
  name: 'playlists',
  content: `
    <div class="page" data-name="playlists">
      <div class="navbar">
        <div class="navbar-bg"></div>
        <div class="navbar-inner">
          <div class="title">Playlists</div>
          <div class="right">
            <a href="#" class="link" id="new-playlist-btn"><i class="icon f7-icons">plus</i></a>
          </div>
        </div>
      </div>
      <div class="page-content">
        <div class="list media-list" id="playlist-list"></div>
        <div class="block block-strong text-align-center" id="empty-state">
          <p>No playlists yet. Tap + to create one.</p>
        </div>
      </div>
    </div>
  `,
  on: {
    pageInit(event, page) {
      const app = page.app;
      setActiveTab('playlists');
      refreshList(page);

      page.el.querySelector('#new-playlist-btn').addEventListener('click', (e) => {
        e.preventDefault();
        createPlaylistPrompt(app, page);
      });

      page.el.querySelector('#playlist-list').addEventListener('click', (e) => {
        const moreBtn = e.target.closest('.playlist-more');
        if (moreBtn) {
          e.preventDefault();
          e.stopPropagation();
          openPlaylistActions(app, page, moreBtn.dataset.id);
          return;
        }
        const link = e.target.closest('.item-link[data-id]');
        if (link) {
          e.preventDefault();
          app.views.main.router.navigate(`/playlists/${link.dataset.id}/`);
        }
      });
    },
    pageBeforeIn(event, page) {
      setActiveTab('playlists');
      refreshList(page);
    },
  },
};

// ---------- Playlist editor ----------

function renderEditorList(el, sheetsById, sheetIds) {
  const listEl = el.querySelector('#editor-sheet-list');
  const emptyEl = el.querySelector('#editor-empty-state');

  if (!sheetIds.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  listEl.innerHTML = sheetIds
    .map((id) => {
      const sheet = sheetsById.get(id);
      const title = sheet ? escapeHtml(sheet.title) : '(missing sheet)';
      return `
        <li data-id="${id}">
          <div class="item-content">
            <div class="item-inner">
              <div class="item-title-row">
                <div class="item-title">${title}</div>
                <div class="item-after"><i class="icon f7-icons editor-remove" data-id="${id}">minus_circle</i></div>
              </div>
            </div>
          </div>
          <div class="sortable-handler"></div>
        </li>`;
    })
    .join('');
}

async function refreshEditor(page, playlistId) {
  const [playlist, sheets] = await Promise.all([getPlaylist(playlistId), listSheets()]);
  if (!playlist) return null;
  const sheetsById = new Map(sheets.map((s) => [s.id, s]));
  page.el.querySelector('.navbar .title').textContent = playlist.name;
  page.el.querySelector('#play-btn').style.visibility = playlist.sheetIds.length ? 'visible' : 'hidden';
  renderEditorList(page.el, sheetsById, playlist.sheetIds);
  return playlist;
}

function openAddSheetsPopup(app, page, playlistId, currentIds) {
  listSheets().then((sheets) => {
    const available = sheets.filter((s) => !currentIds.includes(s.id));
    const itemsHtml = available.length
      ? available
          .map(
            (s) => `
        <li>
          <label class="item-checkbox item-content">
            <input type="checkbox" value="${s.id}" />
            <i class="icon icon-checkbox"></i>
            <div class="item-inner"><div class="item-title">${escapeHtml(s.title)}</div></div>
          </label>
        </li>`
          )
          .join('')
      : `<li><div class="item-content"><div class="item-inner"><div class="item-title">All sheets are already in this playlist.</div></div></div></li>`;

    const popup = app.popup.create({
      content: `
        <div class="popup">
          <div class="view">
            <div class="page">
              <div class="navbar">
                <div class="navbar-bg"></div>
                <div class="navbar-inner">
                  <div class="left"><a href="#" class="link popup-close">Cancel</a></div>
                  <div class="title">Add Sheets</div>
                  <div class="right"><a href="#" class="link" id="add-sheets-confirm">Add</a></div>
                </div>
              </div>
              <div class="page-content">
                <div class="list" id="add-sheets-list">${itemsHtml}</div>
              </div>
            </div>
          </div>
        </div>
      `,
    });

    popup.el.querySelector('#add-sheets-confirm').addEventListener('click', async (e) => {
      e.preventDefault();
      const checked = Array.from(popup.el.querySelectorAll('#add-sheets-list input:checked')).map((i) => i.value);
      if (checked.length) {
        await setPlaylistSheets(playlistId, [...currentIds, ...checked]);
        await refreshEditor(page, playlistId);
      }
      popup.close();
    });

    popup.open();
  });
}

export const playlistEditorRoute = {
  path: '/playlists/:id/',
  name: 'playlist-editor',
  content: `
    <div class="page" data-name="playlist-editor">
      <div class="navbar">
        <div class="navbar-bg"></div>
        <div class="navbar-inner">
          <div class="left"><a href="#" class="link back"><i class="icon icon-back"></i><span class="if-not-md">Back</span></a></div>
          <div class="title">Playlist</div>
          <div class="right">
            <a href="#" class="link" id="play-btn"><i class="icon f7-icons">play_fill</i></a>
            <a href="#" class="link" id="add-sheets-btn"><i class="icon f7-icons">plus</i></a>
          </div>
        </div>
      </div>
      <div class="page-content">
        <div class="list media-list sortable" id="editor-sheet-list"></div>
        <div class="block block-strong text-align-center" id="editor-empty-state">
          <p>No sheets in this playlist yet. Tap + to add some from your library.</p>
        </div>
      </div>
    </div>
  `,
  on: {
    async pageInit(event, page) {
      const app = page.app;
      setActiveTab('playlists');
      const playlistId = page.route.params.id;
      let playlist = await refreshEditor(page, playlistId);
      if (!playlist) {
        app.views.main.router.navigate('/playlists/', { reloadCurrent: true });
        return;
      }

      const sortableListEl = page.el.querySelector('#editor-sheet-list');
      app.sortable.enable(sortableListEl);

      page.sortableSortHandler = async (itemEl, data, listEl) => {
        if (listEl !== sortableListEl) return;
        const current = await getPlaylist(playlistId);
        if (!current) return;
        const ids = current.sheetIds.slice();
        const [moved] = ids.splice(data.from, 1);
        ids.splice(data.to, 0, moved);
        await setPlaylistSheets(playlistId, ids);
      };
      app.on('sortableSort', page.sortableSortHandler);

      page.el.querySelector('#play-btn').addEventListener('click', (e) => {
        e.preventDefault();
        if (page.el.querySelector('#play-btn').style.visibility === 'hidden') return;
        app.views.main.router.navigate(`/viewer/playlist/${playlistId}/`);
      });

      page.el.querySelector('#add-sheets-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        const current = await getPlaylist(playlistId);
        openAddSheetsPopup(app, page, playlistId, current.sheetIds);
      });

      page.el.querySelector('#editor-sheet-list').addEventListener('click', async (e) => {
        const removeBtn = e.target.closest('.editor-remove');
        if (!removeBtn) return;
        e.preventDefault();
        const current = await getPlaylist(playlistId);
        await setPlaylistSheets(playlistId, current.sheetIds.filter((id) => id !== removeBtn.dataset.id));
        await refreshEditor(page, playlistId);
      });
    },
    pageBeforeOut(event, page) {
      if (page.sortableSortHandler) {
        page.app.off('sortableSort', page.sortableSortHandler);
      }
    },
  },
};
