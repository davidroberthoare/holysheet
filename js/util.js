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
