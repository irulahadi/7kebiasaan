/* sw.js — Service worker "Data 7 Kebiasaan Siswa".
 * - Precache app shell saat install.
 * - Cache-first untuk aset same-origin (aplikasi tetap terbuka penuh offline).
 * - TIDAK menyentuh request lintas-origin (GAS: script.google.com / googleusercontent.com) maupun non-GET:
 *   semua panggilan API langsung ke jaringan, jadi data tidak pernah tersaji dari cache.
 * - Ubah VERSI setiap kali Anda merilis berkas aplikasi yang baru, agar cache lama diganti.
 */
const VERSI = 'v1.0.0';
const CACHE = 'db7kebiasaan-' + VERSI;
const SHELL = [
  './', 'index.html', 'style.css', 'config.js', 'db.js', 'auth.js', 'sync.js', 'app.js',
  'admin-pengguna.js', 'admin-lanjutan.js', 'manifest.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))) // lewati cache HTTP browser
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.indexOf('db7kebiasaan-') === 0 && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                         // POST ke GAS dll. tidak disentuh
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // lintas-origin (GAS) tidak di-cache
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') {                        // buka rute/URL apa pun saat offline -> app shell
        const fb = (await cache.match('index.html')) || (await cache.match('./'));
        if (fb) return fb;
      }
      return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
