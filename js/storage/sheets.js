import { dbGet, dbGetAll, dbPut, dbDelete, STORES } from '../db.js';

function makeId() {
  return crypto.randomUUID();
}

export function inferFileType(mimeType) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('image/')) return 'image';
  throw new Error(`Unsupported file type: ${mimeType}`);
}

export function listSheets() {
  return dbGetAll(STORES.sheets).then((sheets) => sheets.sort((a, b) => a.createdAt - b.createdAt));
}

export function getSheet(id) {
  return dbGet(STORES.sheets, id);
}

export function addSheet({ id, title, mimeType, blob, createdAt }) {
  const sheet = {
    id: id || makeId(),
    title,
    fileType: inferFileType(mimeType),
    mimeType,
    blob,
    createdAt: createdAt || Date.now(),
  };
  return dbPut(STORES.sheets, sheet).then(() => sheet);
}

export function renameSheet(id, title) {
  return getSheet(id).then((sheet) => {
    if (!sheet) throw new Error(`Sheet not found: ${id}`);
    sheet.title = title;
    return dbPut(STORES.sheets, sheet);
  });
}

export function deleteSheet(id) {
  return dbDelete(STORES.sheets, id);
}
