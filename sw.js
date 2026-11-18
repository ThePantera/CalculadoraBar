// Service worker de Bar Manager Pro: deja la app disponible sin internet.
// Estrategia: se guarda todo al instalar y se responde desde la copia local;
// en segundo plano se actualiza, así la próxima apertura ya trae la versión nueva.
// Para forzar una actualización en todos los dispositivos, subí el número de VERSION.
const VERSION = 'v5';
const CACHE = 'bar-manager-pro-' + VERSION;
const FILES = [
    './',
    './index.html',
    './legal.html',
    './manifest.webmanifest',
    './icons/icon-48.png',
    './icons/icon-96.png',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './img/portada.jpg',
    './img/logomp.png',
    './audio/musica.mp3'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.startsWith('bar-manager-pro-') && k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // la app no pide nada externo
    event.respondWith(
        caches.open(CACHE).then(cache =>
            cache.match(req, { ignoreSearch: true }).then(hit => {
                const refresh = fetch(req).then(res => {
                    if (res && res.ok) cache.put(req, res.clone());
                    return res;
                }).catch(() => null);
                if (hit) { event.waitUntil(refresh); return hit; }
                return refresh.then(res => res || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error()));
            })
        )
    );
});
