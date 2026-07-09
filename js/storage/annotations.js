import { dbGet, dbGetAllByIndex, dbPut, dbDelete, STORES } from '../db.js';

function makeId(sheetId, page) {
  return `${sheetId}:${page}`;
}

export function getPageAnnotation(sheetId, page) {
  return dbGet(STORES.annotations, makeId(sheetId, page));
}

export function listAnnotationsForSheet(sheetId) {
  return dbGetAllByIndex(STORES.annotations, 'sheetId', sheetId);
}

// Strokes are freehand pen paths only (v1 scope): [{ points: [[x,y], ...], color, width }, ...]
// Overwrites the full stroke list for a page — the viewer keeps its own in-memory
// undo stack and calls this after each committed change.
export function saveStrokes(sheetId, page, strokes) {
  const record = {
    id: makeId(sheetId, page),
    sheetId,
    page,
    strokes,
    updatedAt: Date.now(),
  };
  return dbPut(STORES.annotations, record).then(() => record);
}

export function clearPageAnnotation(sheetId, page) {
  return dbDelete(STORES.annotations, makeId(sheetId, page));
}

export function deleteAnnotationsForSheet(sheetId) {
  return listAnnotationsForSheet(sheetId).then((records) =>
    Promise.all(records.map((r) => dbDelete(STORES.annotations, r.id)))
  );
}
