/* ══════════════════════════════════════════════════════════════════════
   PERISCOPE PATROL — service worker

   ┌──────────────────────────────────────────────────────────────────┐
   │  THE ONE PLACE TO CHANGE THE VERSION.                            │
   │  Bump the line below and nothing else. That number becomes the   │
   │  cache name, so a new value retires every old cache, and it is   │
   │  what the game shows in the top bar and the About panel — so a   │
   │  player can always tell you exactly what they are running.       │
   └──────────────────────────────────────────────────────────────────┘ */

const VERSION = '0.9.8'; // pre relese version - Build dynamic submarine audio architecture and procedural combat soundscape
/* ─────────────────────────────────────────────────────────────────────
   Nothing below here needs touching for a routine release.
   ───────────────────────────────────────────────────────────────────── */

const CACHE = `periscope-patrol-v${VERSION}`;

// The app shell. Everything the game needs to start with no network at all.
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './periscope-patrol-icon-192-v2.png',
  './periscope-patrol-icon-512-v2.png',
  './periscope-patrol-icon-maskable-512-v2.png',
  './periscope-patrol-apple-touch-icon-v2.png',
  './css/app.css',
  './js/core/utilities.js',
  './js/data/torpedo-data.js',
  './js/data/campaign-data.js',
  './js/navigation/route-geometry.js',
  './js/simulation/weapons/tdc-math.js',
  './js/core/state.js',
  './js/core/command-bus.js',
  './js/simulation/engine-core.js',
  './js/simulation/harbor.js',
  './js/simulation/weapons/torpedoes.js',
  './js/simulation/ai/enemy-ai.js',
  './js/simulation/ai/aircraft.js',
  './js/simulation/weapons/deck-gun.js',
  './js/simulation/weapons/aa-gun.js',
  './js/simulation/radio-intel.js',
  './js/simulation/sensors.js',
  './js/simulation/ai/escort-asw.js',
  './js/simulation/physics-navigation.js',
  './js/rendering/world-geometry.js',
  './js/rendering/canvas-core.js',
  './js/rendering/tactical.js',
  './js/rendering/deck-gun-3d.js',
  './js/rendering/periscope-3d.js',
  './js/rendering/map.js',
  './js/ui/briefing.js',
  './js/data/historical-scenarios.js',
  './js/audio/audio-engine.js',
  './js/persistence/save-system.js',
  './js/ui/scenario-selector.js',
  './js/ui/toast.js',
  './js/rendering/gyro-indicator.js',
  './js/simulation/day-night.js',
  './js/rendering/particles.js',
  './js/core/game.js',
  './js/controllers/touch-controller.js',
  './js/ui/dom-view.js',
  './js/controllers/bridge-controller.js',
  './js/tutorial/tutorial.js',
  './js/core/game-loop.js',
  './js/bootstrap/wiring.js',
  './js/ui/picker.js',
  './js/ui/helm-gauges.js',
  './js/pwa/version.js',
  './js/persistence/autosave.js',
  './js/bootstrap/start.js',
  './js/simulation/collision/hull-geometry.js',
  './js/simulation/collision/vessel-collision.js',
  './js/simulation/damage-control.js',
  './js/simulation/career-history.js',
  './js/simulation/ai/asw-brain.js',
  './js/simulation/surface-watch.js',
  './js/rendering/bridge-3d.js',
  './js/simulation/sound-radar.js',
  './js/rendering/sound-room.js',
  './js/simulation/weather-system.js',
  './js/simulation/ship-damage.js',
  './js/simulation/mission-framework.js',
  './js/simulation/traffic-director.js',
  './js/simulation/after-action-report.js',
  './js/ui/after-action-report.js',
  './js/simulation/historical-campaign.js',
  './js/simulation/battle-atmosphere.js',
  './js/rendering/battle-atmosphere.js',
  './js/audio/audio-director.js'
];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // Runtime/app-shell files are mandatory. If one of these cannot be
    // cached, installation of this service worker must fail rather than
    // activating an incomplete offline version.
    const OPTIONAL_SHELL = new Set([
      './icon-192.png',
      './icon-512.png',
      './icon-maskable-512.png',
      './apple-touch-icon.png'
    ]);

    const required = SHELL.filter(url => !OPTIONAL_SHELL.has(url));
    const optional = SHELL.filter(url => OPTIONAL_SHELL.has(url));

    await Promise.all(
      required.map(url =>
        cache.add(new Request(url, { cache: 'reload' }))
      )
    );

    // Icons are non-critical: failure to cache one should not prevent
    // installation of an otherwise complete game.
    await Promise.all(
      optional.map(url =>
        cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
      )
    );
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
