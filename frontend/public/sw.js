/* NobPay service worker: lets the app be installed and shows a friendly page when offline.
 * It never caches pages or /api calls (balances and proofs must always be live). */
const VERSION = 'nobpay-v2';
const STATIC = `${VERSION}-static`;
const SHELL = ['/offline.html', '/icons/icon-192.png', '/brand/nobpay-logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Pages: always the network; the offline page only when there is no connection.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline.html')));
    return;
  }

  // Fingerprinted build files, fonts, icons and images: cache first.
  if (/^\/(_next\/static|icons|covers|brand)\//.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});

/* Notifications (Web Push). The server sends { title, body, url, tag }: a sentence and a path of this site, nothing else. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const url = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/app/accueil';
  event.waitUntil(
    self.registration.showNotification(String(data.title || 'NobPay').slice(0, 80), {
      body: String(data.body || '').slice(0, 200),
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: typeof data.tag === 'string' ? data.tag : undefined,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/app/accueil', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          return w.navigate(target.href).then((c) => (c || w).focus());
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
