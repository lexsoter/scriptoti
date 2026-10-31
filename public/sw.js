const CACHE = 'scriptoti-0.29.0';
const VERSION = 'name="scriptoti-version" content="0.29.0"';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon.svg', './icon-v021-192.png', './icon-v021-512.png', './icon-v021.svg'];
const allowed = new Set(ASSETS.map(path => new URL(path, self.location.href).href));

self.addEventListener('install', event => {
  // An update waits for existing windows, or for an explicit safe reload.
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await cache.addAll(ASSETS.map(path => new Request(new URL(path, self.location.href), { cache: 'reload' })));
    const shell = await cache.match('./index.html');
    if (!shell?.ok || !(await shell.text()).includes(VERSION)) throw new Error('Incomplete application update');
  }));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('scriptoti-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  const url = new URL(event.request.url); url.search = ''; url.hash = '';
  if (!allowed.has(url.href)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-cache' });
        if (!response.ok || response.redirected || !response.headers.get('Content-Type')?.includes('text/html')) throw new Error('Invalid application response');
        const body = await response.clone().text();
        // A waiting release must never replace the running release's offline shell.
        if (!body.includes(VERSION)) throw new Error('Different application version');
        await (await caches.open(CACHE)).put('./index.html', response.clone());
        return response;
      } catch {
        return (await caches.open(CACHE)).match('./index.html');
      }
    })());
    return;
  }
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
