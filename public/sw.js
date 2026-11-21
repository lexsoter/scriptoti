const CACHE = 'scriptoti-0.38.0';
const BUILD = 'cbb1bdbc591646140af0609e2777f93b71eee2dd9271c0877ffc0192f5b0c84d';
const SHELL = '4fbd2343587a1703c9e19a150c6d874b2e3bca36be88b34c60cfdeeccbc550b9';
const RELEASE = CACHE + '-' + BUILD;
const VERSION = 'name="scriptoti-version" content="0.38.0"';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon.svg', './icon-v021-192.png', './icon-v021-512.png', './icon-v021.svg', './icon-s2-32.png', './icon-s2-180.png', './icon-s2-192.png', './icon-s2-512.png', './icon-s2-mark.png', './logo-esteso-bianco.png', './logo-esteso-nero.png'];
const allowed = new Set(ASSETS.map(path => new URL(path, self.location.href).href));
const digest = async response => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');

self.addEventListener('install', event => {
  // Each publication prepares its own cache while the current one keeps running.
  event.waitUntil(caches.open(RELEASE).then(async cache => {
    await cache.addAll(ASSETS.map(path => new Request(new URL(path, self.location.href), { cache: 'reload' })));
    const shell = await cache.match('./index.html');
    if (!shell?.ok || !(await shell.clone().text()).includes(VERSION) || await digest(shell) !== SHELL) throw new Error('Incomplete application update');
  }));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('scriptoti-') && key !== RELEASE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
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
        if (!body.includes(VERSION) || await digest(response.clone()) !== SHELL) throw new Error('Different application release');
        await (await caches.open(RELEASE)).put('./index.html', response.clone());
        return response;
      } catch {
        return (await caches.open(RELEASE)).match('./index.html');
      }
    })());
    return;
  }
  event.respondWith(caches.open(RELEASE).then(async cache => (await cache.match(event.request)) || fetch(event.request)));
});
