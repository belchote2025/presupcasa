// PWA Service Worker - NAVEGA360PRO
// Cachea el shell de la app; las peticiones a api.php (y opc. backend.php/data.json) pasan siempre al servidor.

const CACHE_NAME = 'navega360pro-pwa-v1';
const STATIC_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_URLS.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {}))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const u = new URL(event.request.url);
  const sameOrigin = u.origin === self.location.origin;
  const isGet = event.request.method === 'GET';
  const isApi = u.pathname.indexOf('api.php') !== -1 || u.pathname.indexOf('backend.php') !== -1 || u.pathname.indexOf('data.json') !== -1;

  if (isApi || !sameOrigin || !isGet) {
    return;
  }

  // Navegación (p. ej. / o /index.html) → devolver index.html del scope
  if (event.request.mode === 'navigate') {
    const scopeIndex = new URL('index.html', self.registration.scope).href;
    event.respondWith(
      caches.match(scopeIndex).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  const path = u.pathname.replace(/^\//, '') || '';
  const isStatic =
    path === '' ||
    path === 'index.html' ||
    /(^|\/)(index\.html|style\.css|app\.js|logo\.png|manifest\.json)$/i.test(path);

  if (!isStatic) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        const clone = res.clone();
        if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return res;
      });
    })
  );
});
