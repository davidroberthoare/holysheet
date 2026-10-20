import { getSheet, renameSheet, setSheetVideoUrl } from './storage/sheets.js';
import { escapeHtml, getYouTubeVideoId } from './util.js';
import { getYouTubeApiKey, searchYouTube } from './youtube-search.js';

// Shared by the Library "..." menu and the viewer gear button. `onDone` runs
// after a change has been saved.

export async function renameSheetPrompt(app, sheetId, onDone) {
  const sheet = await getSheet(sheetId);
  if (!sheet) return;
  app.dialog.prompt(
    'Sheet title',
    'Rename',
    async (value) => {
      const title = value.trim();
      if (!title || title === sheet.title) return;
      await renameSheet(sheetId, title);
      if (onDone) onDone();
    },
    undefined,
    sheet.title
  );
}

function resultHtml(r) {
  return `
    <li>
      <a href="#" class="item-link item-content video-result" data-id="${escapeHtml(r.id)}">
        <div class="item-media">${r.thumbnail ? `<img src="${escapeHtml(r.thumbnail)}" width="80" alt="" />` : ''}</div>
        <div class="item-inner">
          <div class="item-title">${escapeHtml(r.title)}</div>
          <div class="item-subtitle">${escapeHtml(r.channel)}</div>
        </div>
      </a>
    </li>`;
}

export async function editVideoPopup(app, sheetId, onDone) {
  const sheet = await getSheet(sheetId);
  if (!sheet) return;

  const popup = app.popup.create({
    content: `
      <div class="popup">
        <div class="view">
          <div class="page">
            <div class="navbar">
              <div class="navbar-bg"></div>
              <div class="navbar-inner">
                <div class="left"><a href="#" class="link popup-close corner-btn">Cancel</a></div>
                <div class="title">Video Link</div>
                <div class="right"><a href="#" class="link corner-btn" id="video-save">Save</a></div>
              </div>
            </div>
            <div class="page-content">
              <div class="block-title">YouTube link</div>
              <div class="list">
                <ul><li class="item-content item-input"><div class="item-inner"><div class="item-input-wrap">
                  <input type="url" id="video-url" placeholder="https://www.youtube.com/watch?v=…" />
                </div></div></li></ul>
              </div>
              <div class="block-title">Search YouTube</div>
              <div class="list">
                <ul><li class="item-content item-input"><div class="item-inner"><div class="item-input-wrap">
                  <input type="search" id="video-query" placeholder="Search…" />
                </div></div></li></ul>
              </div>
              <div class="block" id="video-status"></div>
              <div class="list media-list"><ul id="video-results"></ul></div>
            </div>
          </div>
        </div>
      </div>
    `,
    on: { closed: () => popup.destroy() },
  });

  const el = popup.el;
  const urlInput = el.querySelector('#video-url');
  const queryInput = el.querySelector('#video-query');
  const statusEl = el.querySelector('#video-status');
  const resultsEl = el.querySelector('#video-results');
  urlInput.value = sheet.videoUrl || '';
  queryInput.value = sheet.title;

  let controller = null;
  let debounce = null;
  async function runSearch() {
    const q = queryInput.value.trim();
    if (controller) controller.abort();
    resultsEl.innerHTML = '';
    if (!q) {
      statusEl.textContent = '';
      return;
    }
    if (!(await getYouTubeApiKey())) {
      statusEl.textContent = 'YouTube search isn\'t configured (no youtubeApiKey in config.json). You can still paste a link above.';
      return;
    }
    controller = new AbortController();
    statusEl.textContent = 'Searching…';
    try {
      const results = await searchYouTube(q, { signal: controller.signal });
      statusEl.textContent = results.length ? '' : 'No results.';
      resultsEl.innerHTML = results.map(resultHtml).join('');
    } catch (err) {
      if (err.name === 'AbortError') return;
      statusEl.textContent = err.message;
    }
  }

  queryInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(runSearch, 600);
  });
  queryInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(debounce);
    runSearch();
  });
  // Arrow keys in these fields must not reach the viewer's song-nav handler.
  [urlInput, queryInput].forEach((i) => i.addEventListener('keydown', (e) => e.stopPropagation()));

  resultsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.video-result');
    if (!item) return;
    e.preventDefault();
    urlInput.value = `https://www.youtube.com/watch?v=${item.dataset.id}`;
    resultsEl.querySelectorAll('.video-result').forEach((a) => a.classList.toggle('selected-result', a === item));
  });

  el.querySelector('#video-save').addEventListener('click', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (url && !getYouTubeVideoId(url)) {
      app.toast.create({ text: 'Not a valid YouTube link', closeTimeout: 2500 }).open();
      return;
    }
    if (url !== (sheet.videoUrl || '')) {
      await setSheetVideoUrl(sheetId, url);
      if (onDone) onDone();
    }
    popup.close();
  });

  popup.open();
  runSearch();
}
