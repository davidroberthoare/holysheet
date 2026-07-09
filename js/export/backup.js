import { zipSync, unzipSync, strFromU8, strToU8 } from '../../vendor/fflate/browser.js';
import { APP_VERSION } from '../version.js';
import { dbGetAll, dbPut, STORES } from '../db.js';
import { listSheets, addSheet } from '../storage/sheets.js';
import { listPlaylists, createPlaylist } from '../storage/playlists.js';

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

export function downloadExport(blob, filename) {
  const name = filename || `holysheet-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Restores sheets/playlists/annotations from a previously exported .zip.
// Records carry their original ids, so re-importing the same backup is a
// safe no-op overwrite rather than creating duplicates.
export async function importLibrary(file) {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));

  const manifestBytes = files['manifest.json'];
  if (!manifestBytes) throw new Error('Invalid backup file: missing manifest.json');
  const manifest = JSON.parse(strFromU8(manifestBytes));

  for (const entry of manifest.sheets || []) {
    const bytes = files[entry.file];
    if (!bytes) continue;
    await addSheet({
      id: entry.id,
      title: entry.title,
      mimeType: entry.mimeType,
      blob: new Blob([bytes], { type: entry.mimeType }),
      createdAt: entry.createdAt,
    });
  }

  for (const playlist of manifest.playlists || []) {
    await createPlaylist({
      id: playlist.id,
      name: playlist.name,
      sheetIds: playlist.sheetIds,
      createdAt: playlist.createdAt,
    });
  }

  for (const annotation of manifest.annotations || []) {
    await dbPut(STORES.annotations, annotation);
  }

  return {
    sheets: (manifest.sheets || []).length,
    playlists: (manifest.playlists || []).length,
    annotations: (manifest.annotations || []).length,
  };
}
