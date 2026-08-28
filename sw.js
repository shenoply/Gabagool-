/* Service worker — cache-first for assets.
   The site pulls roughly 50 MB of models, textures and audio on first load, and
   until now every reload paid that again. That is also what made the flaky-network
   failures so painful: a dropped asset meant a full re-fetch.

   Strategy is deliberately split:
     - HTML: network-first, so a new build is never masked by the cache
     - everything else (glb/webp/mp3/m4a/mp4/js): cache-first, since those change
       only when their filename does
*/
const CACHE = 'gabagool-v1';
const ASSET_RE = /\.(glb|webp|png|jpg|jpeg|mp3|m4a|mp4|js)$/i;

self.addEventListener('install', (e) => {
  self.skipWaiting(); // don't wait for old tabs to close
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // drop caches from earlier versions
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // don't touch anything cross-origin

  if (ASSET_RE.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        // offline and not cached — let the game's own retry logic handle it
        throw err;
      }
    })());
    return;
  }

  // HTML and anything else: network first, cache as a fallback
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && req.destination === 'document') {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req);
      if (hit) return hit;
      throw err;
    }
  })());
});
