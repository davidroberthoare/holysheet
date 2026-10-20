import { listSheets, deleteSheet } from '../storage/sheets.js';
import { removeSheetFromAllPlaylists } from '../storage/playlists.js';
import { deleteAnnotationsForSheet } from '../storage/annotations.js';
import { importSources } from '../import/index.js';
import { importItems, initDragDropImport } from '../import/drag-drop.js';
import { renameSheetPrompt, editVideoPopup } from '../sheet-edit.js';
import { escapeHtml, formatDate, setActiveTab } from '../util.js';

function iconForFileType(fileType) {
  return fileType === 'pdf' ? 'doc_text' : 'photo';
}

function renderList(el, sheets) {
  const listEl = el.querySelector('#sheet-list');
  const emptyEl = el.querySelector('#empty-state');

  if (!sheets.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  listEl.innerHTML = sheets
    .map(
      (sheet) => `
      <li>
        <a href="#" class="item-link item-content" data-id="${sheet.id}">
          <div class="item-media"><i class="icon f7-icons">${iconForFileType(sheet.fileType)}</i></div>
          <div class="item-inner">
            <div class="item-title-row">
              <div class="item-title">${escapeHtml(sheet.title)}</div>
              <div class="item-after"><span class="row-more sheet-more" data-id="${sheet.id}"><i class="icon f7-icons">ellipsis</i></span></div>
            </div>
            <div class="item-subtitle">${formatDate(sheet.createdAt)}</div>
          </div>
        </a>
      </li>`
    )
    .join('');
}

async function refresh(page) {
  const sheets = await listSheets();
  renderList(page.el, sheets);
  return sheets;
}

function openSheetActions(app, page, sheetId) {
  const buttons = [
    [
      { text: 'Rename', onClick: () => renameSheetPrompt(app, sheetId, () => refresh(page)) },
      { text: 'Add / Edit Video', onClick: () => editVideoPopup(app, sheetId, () => refresh(page)) },
      { text: 'Delete', color: 'red', onClick: () => deleteConfirm(app, page, sheetId) },
    ],
    [{ text: 'Cancel', color: 'gray' }],
  ];
  app.actions
    .create({ buttons })
    .open();
}

function deleteConfirm(app, page, sheetId) {
  app.dialog.confirm('Delete this sheet? This also removes it from any playlists.', 'Delete Sheet', async () => {
    await deleteSheet(sheetId);
    await Promise.all([removeSheetFromAllPlaylists(sheetId), deleteAnnotationsForSheet(sheetId)]);
    refresh(page);
  });
}

async function handleUpload(app, page) {
  const source = importSources[0];
  let picked;
  try {
    picked = await source.pick();
  } catch (err) {
    app.toast.create({ text: `Upload failed: ${err.message}`, closeTimeout: 2500 }).open();
    return;
  }
  await importItems(app, picked, () => refresh(page));
}

export const libraryRoute = {
  path: '/',
  name: 'library',
  content: `
    <div class="page" data-name="library">
      <div class="navbar">
        <div class="navbar-bg"></div>
        <div class="navbar-inner">
          <div class="title">Library</div>
          <div class="right">
            <a href="#" class="link corner-btn" id="upload-btn"><i class="icon f7-icons">square_arrow_up</i></a>
          </div>
        </div>
      </div>
      <div class="page-content">
        <div class="list media-list" id="sheet-list"></div>
        <div class="block block-strong text-align-center" id="empty-state">
          <p>No sheets yet. Tap the upload icon or drop a PDF or image here to add one.</p>
        </div>
      </div>
    </div>
  `,
  on: {
    pageInit(event, page) {
      const app = page.app;
      setActiveTab('library');
      refresh(page);
      initDragDropImport(app, page, () => refresh(page));

      page.el.querySelector('#upload-btn').addEventListener('click', (e) => {
        e.preventDefault();
        handleUpload(app, page);
      });

      page.el.querySelector('#sheet-list').addEventListener('click', (e) => {
        const moreBtn = e.target.closest('.sheet-more');
        if (moreBtn) {
          e.preventDefault();
          e.stopPropagation();
          openSheetActions(app, page, moreBtn.dataset.id);
          return;
        }
        const link = e.target.closest('.item-link[data-id]');
        if (link) {
          e.preventDefault();
          app.views.main.router.navigate(`/viewer/${link.dataset.id}/`);
        }
      });
    },
    pageBeforeIn(event, page) {
      setActiveTab('library');
      refresh(page);
    },
  },
};
