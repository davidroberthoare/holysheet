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
  return dbGetAll(STORES.sheets).then((sheets) =>
    sheets.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  );
}

export function getSheet(id) {
  return dbGet(STORES.sheets, id);
}

export function addSheet({ id, title, mimeType, blob, createdAt, videoUrl }) {
  const sheet = {
    id: id || makeId(),
    title,
    fileType: inferFileType(mimeType),
    mimeType,
    blob,
    createdAt: createdAt || Date.now(),
    videoUrl: videoUrl || null,
  };
  return dbPut(STORES.sheets, sheet).then(() => sheet);
}

// Same file loaded twice detection: an exact (case-sensitive) title match
// plus a matching blob size is treated as the same underlying file. Used by
// both the regular upload picker and backup restore so neither can create a
// second copy of a sheet that's already in the library.
export function findDuplicateSheet(sheets, { id, title, size } = {}) {
  return sheets.find((s) => s.id !== id && s.title === title && s.blob.size === size);
}

export function renameSheet(id, title) {
  return getSheet(id).then((sheet) => {
    if (!sheet) throw new Error(`Sheet not found: ${id}`);
    sheet.title = title;
    return dbPut(STORES.sheets, sheet);
  });
}

// Attach (or, with null/'' url, remove) a YouTube link to a sheet.
export function setSheetVideoUrl(id, videoUrl) {
  return getSheet(id).then((sheet) => {
    if (!sheet) throw new Error(`Sheet not found: ${id}`);
    sheet.videoUrl = videoUrl || null;
    return dbPut(STORES.sheets, sheet);
  });
}

export function deleteSheet(id) {
  return dbDelete(STORES.sheets, id);
}
