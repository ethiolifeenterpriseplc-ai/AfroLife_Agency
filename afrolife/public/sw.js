const CACHE = 'afrolife-shell-v17';
const SHELL = ['/', '/styles.css', '/app.js', '/api-errors.js', '/mfi.js', '/edir.js', '/privacy.js', '/i18n.js', '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];
const SHELL_PATHS = new Set(SHELL);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith('afrolife-shell-') && key !== CACHE).map((key) => caches.delete(key)),
  )));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search
      || request.headers.has('authorization') || request.headers.has('range')) return;

  // Only the public application shell may be cached. Member, identity,
  // financial, and document routes are deliberately network-only.
  const path = url.pathname;
  if (!SHELL_PATHS.has(path)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      const cacheControl = response.headers.get('cache-control') ?? '';
      if (response.ok && !/\b(private|no-store)\b/i.test(cacheControl)) {
        await cache.put(path, response.clone());
      }
      return response;
    } catch {
      return (await cache.match(path)) ?? Response.error();
    }
  })());
});
