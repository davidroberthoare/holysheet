export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setActiveTab(name) {
  const tabbar = document.getElementById('main-tabbar');
  if (!tabbar) return;
  tabbar.querySelectorAll('a[data-tab]').forEach((link) => {
    link.classList.toggle('tab-link-active', link.dataset.tab === name);
  });
}

export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Extracts the 11-char YouTube video id from any of the common URL shapes
// (watch?v=, youtu.be/, /shorts/, /embed/, /live/, /v/, ...). Returns null
// for anything that is not a recognizable YouTube URL.
export function getYouTubeVideoId(url) {
  let u;
  try {
    u = new URL(url);
  } catch (err) {
    return null;
  }
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const validHosts = ['youtube.com', 'youtu.be', 'youtube-nocookie.com'];
  if (!validHosts.includes(host)) return null;

  let id = null;
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] || '';
  } else {
    const v = u.searchParams.get('v');
    if (v) {
      id = v;
    } else {
      const seg = u.pathname.split('/');
      const kinds = ['shorts', 'embed', 'live', 'v'];
      const kindIdx = kinds.indexOf(seg[1]);
      if (kindIdx >= 0) id = seg[2] || '';
    }
  }
  return /^[\w-]{11}$/.test(id) ? id : null;
}

// Embed URL for a given link, or null if it isn't a playable YouTube URL.
export function youtubeEmbedUrl(url) {
  const id = getYouTubeVideoId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}
