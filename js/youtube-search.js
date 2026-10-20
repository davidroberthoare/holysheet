// YouTube Data API v3 search, used by the video-link editor. The API key comes
// from config.json in the app root (gitignored; see config.example.json), so it
// is set once on the server for every user. It is still visible to browsers —
// restrict it by HTTP referrer in Google Cloud.
let keyPromise = null;

export function getYouTubeApiKey() {
  if (!keyPromise) {
    keyPromise = fetch('config.json', { cache: 'no-cache' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((cfg) => (cfg && typeof cfg.youtubeApiKey === 'string' ? cfg.youtubeApiKey.trim() : ''))
      .catch(() => '');
    // Don't pin a failure (e.g. offline) for the rest of the session.
    keyPromise.then((k) => {
      if (!k) keyPromise = null;
    });
  }
  return keyPromise;
}

// API titles arrive HTML-entity-encoded (&amp;, &#39;, ...). Decode to plain text
// via an inert DOMParser document; callers re-escape when rendering.
function decodeEntities(str) {
  return new DOMParser().parseFromString(str, 'text/html').documentElement.textContent;
}

// Resolves to [{ id, title, channel, thumbnail }]. Throws Error with a
// user-presentable message on failure. Only embeddable videos are returned,
// since the viewer plays links through an embedded player.
export async function searchYouTube(query, { signal } = {}) {
  const key = await getYouTubeApiKey();
  if (!key) throw new Error('No YouTube API key set');
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '10',
    q: query,
    key,
  });
  let res;
  try {
    res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Search unavailable (offline?)');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || `Search failed (${res.status})`);
  }
  return (data.items || []).map((item) => ({
    id: item.id.videoId,
    title: decodeEntities(item.snippet.title),
    channel: decodeEntities(item.snippet.channelTitle),
    thumbnail: item.snippet.thumbnails && (item.snippet.thumbnails.default || {}).url,
  }));
}
