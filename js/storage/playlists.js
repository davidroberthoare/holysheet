import { dbGet, dbGetAll, dbPut, dbDelete, STORES } from '../db.js';

function makeId() {
  return crypto.randomUUID();
}

export function listPlaylists() {
  return dbGetAll(STORES.playlists).then((playlists) => playlists.sort((a, b) => a.createdAt - b.createdAt));
}

export function getPlaylist(id) {
  return dbGet(STORES.playlists, id);
}

export function createPlaylist({ id, name, sheetIds, createdAt } = {}) {
  const playlist = {
    id: id || makeId(),
    name: name || 'New Playlist',
    sheetIds: sheetIds || [],
    createdAt: createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  return dbPut(STORES.playlists, playlist).then(() => playlist);
}

export function renamePlaylist(id, name) {
  return getPlaylist(id).then((playlist) => {
    if (!playlist) throw new Error(`Playlist not found: ${id}`);
    playlist.name = name;
    playlist.updatedAt = Date.now();
    return dbPut(STORES.playlists, playlist);
  });
}

// Used by the drag-drop editor to persist a full reorder/add/remove in one write.
export function setPlaylistSheets(id, sheetIds) {
  return getPlaylist(id).then((playlist) => {
    if (!playlist) throw new Error(`Playlist not found: ${id}`);
    playlist.sheetIds = sheetIds;
    playlist.updatedAt = Date.now();
    return dbPut(STORES.playlists, playlist);
  });
}

export function deletePlaylist(id) {
  return dbDelete(STORES.playlists, id);
}

// Removes a deleted sheet from every playlist that references it.
export function removeSheetFromAllPlaylists(sheetId) {
  return listPlaylists().then((playlists) =>
    Promise.all(
      playlists
        .filter((p) => p.sheetIds.includes(sheetId))
        .map((p) => setPlaylistSheets(p.id, p.sheetIds.filter((id) => id !== sheetId)))
    )
  );
}
