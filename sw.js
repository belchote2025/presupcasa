// sw.js - Versión de seguridad (Pass-through)
// Esto evita que el Service Worker bloquee las peticiones a la API en Hostinger.

const CACHE_NAME = 'presunavegatel-v4';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map((key) => caches.delete(key)));
        })
    );
});

self.addEventListener('fetch', (event) => {
    // No interceptar nada. Dejar que el navegador se encargue de todo.
    // Esto soluciona los errores 508 Loop Detected.
    return;
});
