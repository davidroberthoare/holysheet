import { zipSync, unzipSync, strFromU8, strToU8 } from '../../vendor/fflate/browser.js';
import { APP_VERSION } from '../version.js';
import { dbGet, dbGetAll, dbPut, STORES } from '../db.js';
import { listSheets, addSheet, findDuplicateSheet } from '../storage/sheets.js';
import { listPlaylists, createPlaylist, getPlaylist } from '../storage/playlists.js';
import { listAnnotationsForSheet } from '../storage/annotations.js';

function extForMime(mimeType) {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/jpeg') return 'jpg';
  return 'bin';
}

// Bundles the whole library (sheet files + metadata + playlists + annotations)
// into a single .zip Blob. This is the only backup mechanism — IndexedDB is
// otherwise the sole copy of the library.
export async function exportLibrary() {
  const [sheets, playlists, annotations] = await Promise.all([
    listSheets(),
    listPlaylists(),
    dbGetAll(STORES.annotations),
  ]);

  const files = {};
  const sheetEntries = [];

  for (const sheet of sheets) {
    const path = `sheets/${sheet.id}.${extForMime(sheet.mimeType)}`;
    files[path] = new Uint8Array(await sheet.blob.arrayBuffer());
    sheetEntries.push({
      id: sheet.id,
      title: sheet.title,
      mimeType: sheet.mimeType,
      fileType: sheet.fileType,
      createdAt: sheet.createdAt,
      videoUrl: sheet.videoUrl || null,
      file: path,
    });
  }

  const manifest = {
    version: APP_VERSION,
    exportedAt: Date.now(),
    sheets: sheetEntries,
    playlists,
    annotations,
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' });
}

// Bundles a single playlist (only the sheets it contains, their annotations,
// and the playlist record itself) into a .zip. Reuses the same manifest shape
// as exportLibrary, so importLibrary can restore either kind of backup as-is.
export async function exportPlaylist(playlistId) {
  const playlist = await getPlaylist(playlistId);
  if (!playlist) throw new Error(`Playlist not found: ${playlistId}`);

  const allSheets = await listSheets();
  const sheetsById = new Map(allSheets.map((s) => [s.id, s]));
  const sheets = playlist.sheetIds.map((id) => sheetsById.get(id)).filter(Boolean);

  const files = {};
  const sheetEntries = [];

  for (const sheet of sheets) {
    const path = `sheets/${sheet.id}.${extForMime(sheet.mimeType)}`;
    files[path] = new Uint8Array(await sheet.blob.arrayBuffer());
    sheetEntries.push({
      id: sheet.id,
      title: sheet.title,
      mimeType: sheet.mimeType,
      fileType: sheet.fileType,
      createdAt: sheet.createdAt,
      videoUrl: sheet.videoUrl || null,
      file: path,
    });
  }

  const annotationLists = await Promise.all(sheets.map((s) => listAnnotationsForSheet(s.id)));

  const manifest = {
    version: APP_VERSION,
    exportedAt: Date.now(),
    type: 'playlist',
    sheets: sheetEntries,
    playlists: [playlist],
    annotations: annotationLists.flat(),
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

  return new Blob([zipSync(files, { level: 6 })], { type: 'application/zip' });
}

export function downloadExport(blob, filename) {
  const name = filename || `holysheet-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  // Without this, Framework7's router intercepts the synthetic click on this
  // <a href> (it hijacks any in-app link click by default) and navigates to
  // its catch-all route instead of letting the browser perform the native
  // download — the export silently "worked" (blob built fine) but the file
  // never downloaded and the app dropped back to the root route.
  a.classList.add('external');
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Restores sheets/playlists/annotations from a previously exported .zip.
// Records carry their original ids, so re-importing the same backup is a
// safe no-op overwrite rather than creating duplicates.
//
// A *different* backup can still reference a sheet (same title + file size)
// that's already in the library under a different id — e.g. re-exporting
// after the app assigned a fresh id some other way, or importing a backup
// taken on another device that also has this sheet. Those entries are
// skipped rather than added as a second copy, and any playlist/annotation
// that pointed at the skipped id is remapped onto the existing sheet instead
// so the restored playlist doesn't end up silently missing a song.
export async function importLibrary(file) {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));

  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) throw new Error('Invalid backup file: missing manifest.json');
  const manifest = JSON.parse(strFromU8(manifestBytes));

  const existing = await listSheets();
  const duplicateMap = new Map(); // skipped entry id -> id of the existing sheet it duplicates

  for (const entry of manifest.sheets || []) {
    const bytes = files[entry.file];
    if (!bytes) continue;
    const alreadyTracked = existing.some((s) => s.id === entry.id);
    if (!alreadyTracked) {
      const dup = findDuplicateSheet(existing, { title: entry.title, size: bytes.length });
      if (dup) {
        duplicateMap.set(entry.id, dup.id);
        continue;
      }
    }
    const sheet = await addSheet({
      id: entry.id,
      title: entry.title,
      mimeType: entry.mimeType,
      blob: new Blob([bytes], { type: entry.mimeType }),
      createdAt: entry.createdAt,
      videoUrl: entry.videoUrl,
    });
    if (!alreadyTracked) existing.push(sheet);
  }

  const remapId = (id) => duplicateMap.get(id) || id;

  for (const playlist of manifest.playlists || []) {
    await createPlaylist({
      id: playlist.id,
      name: playlist.name,
      sheetIds: Array.from(new Set(playlist.sheetIds.map(remapId))),
      createdAt: playlist.createdAt,
    });
  }

  for (const annotation of manifest.annotations || []) {
    if (!duplicateMap.has(annotation.sheetId)) {
      await dbPut(STORES.annotations, annotation);
      continue;
    }
    // Remapped onto a sheet that was already in the library — don't clobber
    // whatever annotations it already has at this page.
    const sheetId = remapId(annotation.sheetId);
    const id = `${sheetId}:${annotation.page}`;
    const already = await dbGet(STORES.annotations, id);
    if (already) continue;
    await dbPut(STORES.annotations, { ...annotation, sheetId, id });
  }

  return {
    sheets: (manifest.sheets || []).length - duplicateMap.size,
    skipped: duplicateMap.size,
    playlists: (manifest.playlists || []).length,
    annotations: (manifest.annotations || []).length,
  };
}
