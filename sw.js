/* ══════════════════════════════════════════════════════════════════════
   PERISCOPE PATROL — service worker

   ┌──────────────────────────────────────────────────────────────────┐
   │  THE ONE PLACE TO CHANGE THE VERSION.                            │
   │  Bump the line below and nothing else. That number becomes the   │
   │  cache name, so a new value retires every old cache, and it is   │
   │  what the game shows in the top bar and the About panel — so a   │
   │  player can always tell you exactly what they are running.       │
   └──────────────────────────────────────────────────────────────────┘ */

const VERSION = '0.7.3'; // fixed bug in depth gauge, added campaign ending message

/* ─────────────────────────────────────────────────────────────────────
   Nothing below here needs touching for a routine release.
   ───────────────────────────────────────────────────────────────────── */

const CACHE = `periscope-patrol-v${VERSION}`;

// The app shell. Everything the game needs to start with no network at all.
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // addAll is all-or-nothing; add one at a time so a single missing
    // icon cannot stop the whole install.
    await Promise.all(SHELL.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
    ));
  })());
  // Do NOT skipWaiting here. A boat halfway through a patrol should not have
  // the deck swapped under her; the new worker waits until the player agrees
  // to reload (see the SKIP_WAITING message below) or closes every tab.
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.filter(n => n.startsWith('periscope-patrol-') && n !== CACHE)
           .map(n => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

/* Cache-first, because the whole game is one static file and offline play is
   the point. Anything fetched successfully is put back in the cache, so a
   soft refresh while online quietly picks up whatever the shell missed. */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // leave third parties alone

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      // offline and not in the cache: for a navigation, hand back the game
      if (req.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});

/* The game asks "what version are you?" over a MessagePort at start-up, and
   sends SKIP_WAITING when the player accepts an update. */
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'GET_VERSION') {
    const reply = { type: 'VERSION', version: VERSION, cache: CACHE };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  }
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
});
