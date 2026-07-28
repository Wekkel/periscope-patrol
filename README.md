# Periscope Patrol

A World War II fleet submarine simulator that runs in a browser tab. Stalk convoys through the
periscope, build a firing solution on the TDC, put fish into a freighter's side — then go deep and
sit very still while the escorts hunt you.

It is one HTML file. No build step, no bundler, no dependencies, no framework. Open it and it runs.
Install it and it runs offline.

**[▶ Play / install](https://example.com/periscope-patrol)** ← *replace with your URL*

---

## What it is

A love letter to the submarine sims of the 8086 era, rebuilt for a phone. Everything is drawn with
the Canvas 2D API — the periscope view, the chart, the instruments. Everything is driven by touch.

The design rule throughout: **the boat should never lie to you, and the interface should never make
you do arithmetic.** If a number matters, it is on the dial you are already looking at.

## The boat

**Periscope station.** A first-person view out of the scope with real horizon geometry. Ships are
drawn as solid hulls and identified by silhouette. Range is taken by stadimeter against the target's
masthead height, the way it was actually done.

**Torpedo Data Computer.** Feed it bearing, range, target course and speed and it computes the gyro
angle. You do not need to point the boat at the target — the Mark 14's gyro will take up to 90° —
but a large gyro angle costs accuracy, so a good skipper still manoeuvres for a small one.

**Four torpedo types**, with their historical faults intact. The Mark 14 runs deep and its contact
exploder was crushed by its own inertia on a square hit, so a perpendicular strike is *more* likely
to be a dud than an oblique one. Below about 22° of incidence a fish will glance off the plating
without going off at all. The Mark 18 electric leaves no wake but is slow.

**Damage that means something.** Where a torpedo strikes along the hull decides how she goes down:
bow first, stern first, settling on an even keel, or broken in half — in which case the broken ends
flood and go under first while the bow and stern rear up. A miss is reported as a miss, with the
range in yards, the side, and whether the fish crossed ahead of the stem or astern of the rudder.

**Diesels and batteries.** She has no snorkel — no US fleet boat did — so the main induction shuts
the moment she goes under and the diesels shut with it. Charging is slow, the screws have first call
on the engines, and from flat it is three to four hours on the surface. Run at night, dive by day.
That is not a game mechanic; it is what the Pacific war looked like.

**The sea floor exists.** Depth orders are trimmed to the water actually under the keel, with 25 ft
of clearance. Touch the bottom and it hurts in proportion to your speed and the hardness of the
bottom. Or lie on it deliberately: all stop, everything shut down, acoustic signature under 0.02 —
the oldest trick in shallow water. Sand and mud only, and mud takes hold of a hull the longer she
sits in it.

**Aircraft, and the 20 mm.** The gun does not shoot aeroplanes down; it makes the pilot flinch. He
comes in higher, releases early, and the bombs go in the sea — which is worth a great deal, since
damage falls off exponentially with miss distance. Against that: four men and an open hatch mean she
cannot dive, a crash dive is held while they tumble below, and an aeroplane out of bombs may come
back with guns for an exposed deck. Doctrine said dive. The model agrees.

## The chart

North-up, fog of war, plotted courses with an autopilot that follows them. Bathymetry is synthesised
from the coastlines and washed in pale chart tints, with the two lines a submariner actually read:
the 10-fathom danger line and the **100-fathom curve**, outside which the deep ocean will hide you
and inside which it will not.

Radio traffic and ULTRA decrypts arrive when you come shallow enough to copy the broadcast. They are
summarised on an intel board — everything the boat holds, nearest first, each with a course to steer
and the age of the fix, because a two-hour-old position is a guess and should look like one.

## The helm

Three instruments sharing one grammar: a **gyro repeater**, a **depth gauge** and an **engine
telegraph**. On each, the heavy pale needle is where she *is* and the thin amber needle is where she
has been *ordered* — the gap between them is the state of the boat at a glance.

Tap the rim and the order goes there. Drag the face to nudge it; the mapping is angular, so dragging
further from the hub gives finer control for free. Detents click under your thumb at the orders that
have names.

Each dial carries the context that governs it:

- **Depth** rescales between a fine and a deep range, because holding 55 ft under a periscope needs
  ten times the precision of sitting at 250. The sea floor is a hatched sector the needle cannot
  enter.
- **Course** is a full circle — a compass that stopped at 270° would be a lie — with the shortest way
  round drawn as a turn arc, pips for the TDC target and the next waypoint, and the ±90° torpedo gyro
  envelope shaded on the face.
- **Power** is linear in revolutions, but the knots are marked at their true positions and bunch up
  towards flank: the last hundred revolutions buy almost no speed and a great deal of noise, and the
  noise is an amber-to-red sector on the rim. Dive, and the whole dial changes meaning — 18 knots
  becomes 8.5, and the quiet band widens from 125 rpm to 230.

## Patrol areas

Solomon Sea · Bismarck Sea · Luzon Strait · Truk Approaches · Java Sea

With scripted patrols including *USS Silversides — First Pacific Patrol*, *USS Wahoo — Yellow Sea
Rampage*, *USS Flasher — Wolf Pack Hunt*, *USS Harder — Destroyer Killer* and *USS Trigger — Night
Surface Attack*. There is a training patrol that walks you through the whole attack loop.

## Install

It is a PWA. Open it in a browser and use **Add to Home Screen** (iOS) or **Install** (Android,
Chrome, Edge). After that it runs with the network off — the service worker caches the whole app
shell, which is one HTML file and four icons.

To host it yourself, serve these from any static host over HTTPS:

```
index.html
sw.js
manifest.webmanifest
icon-192.png
icon-512.png
icon-maskable-512.png
apple-touch-icon.png
```

GitHub Pages works. So does anything else that serves files.

### Versioning

The build number lives in exactly one place — the `VERSION` constant at the top of `sw.js`:

```js
const VERSION = '0.7.0';
```

Bump it there and nothing else. It names the cache (so old caches retire on activation), it drives
the update prompt, and the game reads it back from the running service worker and shows it as a chip
in the top bar. Tap the chip to copy the build string; it is the first thing worth having when
someone reports a bug.

A new build does **not** swap itself in under a patrol in progress. It waits, raises a *"reload
when you're ready"* bar, and steps in only when the player agrees.

### Saves

Five manual save slots, plus an autosave that fires whenever the screen goes away —
`visibilitychange`, `pagehide`, `blur`, `freeze` — and on a 45-second heartbeat besides. A phone does
not close an app, it freezes it and reclaims the memory when it feels like it, so a two-hour patrol
could otherwise vanish between your pocket and your hand. The autosave lives in its own key and can
never overwrite a save you made on purpose.

## Controls

Touch is the primary interface: tabs at the bottom, an order pad behind the depth and speed
read-outs, pinch and drag on the chart, drag on the periscope to train it.

There is a desktop layout too, with keyboard shortcuts:

| | |
|---|---|
| `1` `2` `3` | Tactical screen · Periscope · Chart |
| `←` `→` | Train the periscope |
| `Space` | Pause / resume |
| `S` | Silent running |
| `E` | Emergency blow |
| `D` `P` | Damage control · Pumps |
| `H` | Head to port |
| `F` `G` `V` | Flood forward tubes · Fire tube 1 · Fire a forward spread |
| `C` `X` | Select the contact in the scope · Send it to the TDC |
| `M` `T` `?` | Mission select · Audio · This list |

## Building on it

There is nothing to build. `index.html` is the whole game — engine, renderer, UI and content in one
file. Open it in an editor, reload the browser.

The interesting seams, if you want to poke at it:

- `SimEngine` owns the world and steps it at a fixed rate; the views only read snapshots.
- `Bathy` builds the sea floor once per patrol area from the coastlines, using a scanline land mask
  and a chamfer distance transform. The whole grid costs about 60 ms.
- `CanvasView` draws the periscope and the chart; `HelmGauges` draws the instruments on its own
  60 Hz loop, gated on visibility so it costs nothing off-screen.
- The wave field is a height field in world metres — two swell systems and a wind chop with fixed
  world directions, sampled per screen column and lit by slope. That is why the sea holds still when
  you train the scope and only the waves march.

## How it was made

Written with Claude Opus 5, with Claude Fable 5 brought in for the water. Nearly every subsystem has
a headless test suite that boots the whole game against DOM stubs and asserts on behaviour rather
than pixels — sinking geometry, torpedo hit boxes, charging curves, AA engagement outcomes over
hundreds of trials, the sea floor, the gauge angle mapping. Those tests caught several bugs that
looked like UI faults and were not, which is most of the reason the thing works.

## Credits and licence

The boats, the ordnance and their failings are historical; everything else is invented. USS
Silversides, Wahoo, Flasher, Harder and Trigger were real, and so were their crews.

The snorkel, incidentally, was a Dutch invention — Lieutenant Jan Wichers designed the *snuiver* for
the O-21 class in the late 1930s. The Germans found it on the boats they captured at Rotterdam in
1940, ignored it, and only fitted the *Schnorchel* in 1944 when Allied aircraft made surfacing
suicide. The American boats fought the whole war without one, which is why you cannot charge at
periscope depth in this game.

MIT.
