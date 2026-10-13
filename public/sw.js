const BASE = new URL('./', self.location.href);
const CACHE_PREFIX = `laplace-shell-${encodeURIComponent(BASE.pathname)}-preact-`;
const LEGACY_CACHE_PREFIX = `laplace-shell-${encodeURIComponent(BASE.pathname)}-react-`;
const CACHE_NAME = `${CACHE_PREFIX}8565c96ec7225c1b`;
const shellUrl = new URL('index.html', BASE).href;
const APP_SHELL = [
  'index.html',
  'manifest.webmanifest',
  'icons/laplace.svg',
  'icons/laplace-192.png',
  'icons/laplace-512.png',
].map((path) => new URL(path, BASE).href);

function isLocalAsset(value) {
  const url = new URL(value, BASE);
  return (
    url.origin === BASE.origin &&
    url.pathname.startsWith(BASE.pathname) &&
    /\.(?:js|css|svg|png|webmanifest)$/.test(url.pathname)
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const response = await fetch(shellUrl, { cache: 'reload' });
      if (!response.ok) throw new Error('Could not cache the application shell');
      const html = await response.clone().text();
      await cache.put(shellUrl, response);
      const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g)]
        .map((match) => new URL(match[1], shellUrl).href)
        .filter(isLocalAsset);
      await Promise.all(assets.map((path) => cache.add(path)));
      await Promise.all(APP_SHELL.slice(1).map((path) => cache.add(path).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key !== CACHE_NAME &&
              (key.startsWith(CACHE_PREFIX) ||
                key.startsWith(LEGACY_CACHE_PREFIX) ||
                (BASE.pathname === '/' && /^laplace-shell-v\d+$/.test(key))),
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_LOADED_ASSETS' || !Array.isArray(event.data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        event.data.urls
          .filter((value) => typeof value === 'string' && isLocalAsset(value))
          .map(async (url) => {
            if (!(await cache.match(url))) await cache.add(url).catch(() => undefined);
          }),
      );
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== BASE.origin ||
    !url.pathname.startsWith(BASE.pathname)
  )
    return;
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          // Keep index.html and its hashed entry assets from the same release together.
          return response;
        } catch {
          return (await caches.open(CACHE_NAME))
            .match(shellUrl)
            .then((response) => response || Response.error());
        }
      })(),
    );
    return;
  }
  if (!isLocalAsset(url.href)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Preview/static hosts may send Vary: Origin; these build assets are public and immutable.
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
