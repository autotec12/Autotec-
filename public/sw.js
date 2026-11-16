// Service Worker for AUTOTEC Rastreamento Veicular PWA
// Replaced automatically at build time with unique Vercel/Vite build version
const CACHE_NAME = '__AUTOTEC_CACHE_VERSION__';
const STATIC_ASSETS = [
  '/manifest.json',
  '/autotec-logo-header.png',
  '/autotec-logo-original.png',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA cache addAll notice:', err);
      });
    })
  );
  // Controlled update: remain in "waiting" state until admin explicitly confirms update
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key.startsWith('autotec-finance-') && key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept or cache:
  // 1. Non-GET requests or cross-origin Firebase / Google API calls
  // 2. Service Worker itself or version.json manifest
  // 3. Vite development modules, HMR, WebSocket, TSX files
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/sw.js' ||
    url.pathname === '/version.json' ||
    url.pathname.startsWith('/@vite') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.includes('node_modules') ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }

  // Navigation / HTML shell: ALWAYS fetch fresh from network (no-store) so new Vercel versions load immediately,
  // falling back to offline cached shell only when offline.
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(new Request(request.url, { cache: 'no-store' }))
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match('/index.html').then((cached) => {
            return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
          })
        )
    );
    return;
  }

  // Hashed static assets (/assets/*) and brand icons: Network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() =>
        caches.match(request).then((cachedResponse) => {
          return cachedResponse || new Response('Offline', { status: 503, statusText: 'Offline' });
        })
      )
  );
});
