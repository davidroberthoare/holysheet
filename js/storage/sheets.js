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

// Duplicate detection. When only `title` is given, any existing sheet with
// that title is returned so the caller can replace it. When `size` is also
// given (e.g. backup restore), both title and blob size must match so that
// files that share a name but differ in content are not treated as identical.
export function findDuplicateSheet(sheets, { id, title, size } = {}) {
  if (size !== undefined) {
    return sheets.find((s) => s.id !== id && s.title === title && s.blob.size === size);
  }
  return sheets.find((s) => s.id !== id && s.title === title);
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
