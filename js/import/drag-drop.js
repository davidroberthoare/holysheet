import { listSheets, addSheet, findDuplicateSheet } from '../storage/sheets.js';

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];

function titleFromFilename(filename) {
  return filename.replace(/\.[^/.]+$/, '');
}

// Shared "add these files to the library" logic, used by both the upload
// button (file picker) and drag & drop. `onDone` is called once all items
// have been processed, with the array of sheets that were actually added
// (skipped/failed items are excluded) — e.g. to refresh a page's list or to
// append the new sheets to a playlist.
export async function importItems(app, items, onDone) {
  if (!items.length) return [];
  const existing = await listSheets();
  const added = [];
  for (const item of items) {
    if (findDuplicateSheet(existing, { title: item.title, size: item.blob.size })) {
      app.toast.create({ text: `Skipped ${item.title}: already in library`, closeTimeout: 2500 }).open();
      continue;
    }
    try {
      const sheet = await addSheet(item);
      existing.push(sheet);
      added.push(sheet);
    } catch (err) {
      app.toast.create({ text: `Skipped ${item.title}: ${err.message}`, closeTimeout: 2500 }).open();
    }
  }
  if (onDone) onDone(added);
  return added;
}

// Wires up drag & drop of PDF/image files onto a page's .page-content,
// importing them into the library the same way the upload button does.
// `onImported` is called with the array of newly added sheets after a drop
// has been processed (e.g. to refresh the page's list, or to append the
// sheets to a playlist). `overlayText` customizes the message shown while
// dragging over the drop target.
export function initDragDropImport(app, page, onImported, overlayText) {
  const pageContent = page.el.querySelector('.page-content');
  if (!pageContent) return;

  const overlay = document.createElement('div');
  overlay.className = 'drop-overlay';
  overlay.innerHTML = `<span>${overlayText || 'Drop PDF or image to import'}</span>`;
  pageContent.appendChild(overlay);

  let dragCounter = 0;

  pageContent.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    overlay.classList.add('active');
  });

  pageContent.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  pageContent.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.classList.remove('active');
    }
  });

  pageContent.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove('active');

    const files = Array.from(e.dataTransfer.files).filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (!files.length) {
      app.toast.create({ text: 'Only PDF and image files are supported', closeTimeout: 2500 }).open();
      return;
    }
    const items = files.map((f) => ({ title: titleFromFilename(f.name), mimeType: f.type, blob: f }));
    await importItems(app, items, onImported);
  });
}
