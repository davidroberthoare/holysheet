// Shared by index.html's bootstrap script and the Settings page toggle, so
// there's exactly one place that knows how to actually kill the service
// worker and its caches (the fix for "caching makes testing updates hard").
const STORAGE_KEY = 'holysheet:cachingEnabled';

export function isCachingEnabled() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export async function disableCaching() {
  localStorage.setItem(STORAGE_KEY, 'false');
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

export async function enableCaching() {
  localStorage.setItem(STORAGE_KEY, 'true');
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('./sw.js', { type: 'module' });
  }
}
