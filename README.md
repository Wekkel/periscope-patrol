# Periscope Patrol — USS Silversides

Periscope Patrol is an offline-capable browser/PWA submarine game built around a US fleet submarine in the Pacific War. It is designed as a compact, touch-friendly command game rather than a full crew-management simulator: the player makes the important skipper-level decisions while the crew handles routine observation, plotting and damage-control work.

The game is a static web application. It has no server-side dependency and can run offline once the PWA shell has been cached.

Release number: the single source of truth is `const VERSION` near the top of `sw.js`. The same version is used for the cache name and is exposed in the game UI.

## Core game loop

A normal patrol is built around a simple command cycle:

1. Find shipping with visual watch, hydrophones and — when historically fitted — SJ surface-search radar.
2. Build a useful track rather than receiving omniscient target data.
3. Close or manoeuvre for a firing position.
4. Feed the target to the TDC, flood tubes and fire.
5. Observe the result, then evade escorts or aircraft if the attack has compromised the boat.
6. Complete the mission, return to a friendly rendezvous and review the patrol debrief.

The simulation includes navigation, fuel and battery management, torpedoes, deck gun, automatic AA defence, visual observation, hydrophones, radar, weather, sea state, day/night lighting, escort ASW, active sonar, depth charges, aircraft search and attack, harbours, collision/grounding, subsystem damage, flooding, repair, radio/intelligence, traffic generation, historical refits, missions and persistent career history.

## Six stations

The central view can be switched between six stations without loading a new page:

- `TAC` — own-boat tactical picture, compass, depth column, stealth/noise information and quick depth controls.
- `BRG` — surfaced bridge watch with a wide 360-degree view, binocular observation and visual marking.
- `SND` — passive hydrophone room; train the listening bearing, make passive bearing marks, use active QC echo ranging when worth the risk, or open SJ radar when fitted.
- `SCOPE` — trainable periscope with historically appropriate 1.5× and 6× optics, visual acquisition and TDC hand-off.
- `MAP` — navigation chart, bathymetry, terrain, ports, plotted waypoints, missions, contacts, weather overlay and tactical plotting.
- `GUN` — manually trained and elevated 3-inch deck-gun sight with crew range lay, shell ballistics, splashes and ship damage.

The lower interface is divided into four skipper-level tabs: `View`, `Helm`, `Attack` and `Status`.

## Visual contacts, SCOPE and MAP

The game deliberately gives the player some arcade assistance here so that MAP can remain the main working view.

When the boat is surfaced or at periscope depth, the crew is assumed to maintain a regular 360-degree visual watch. If a surface vessel is theoretically resolvable at its current range under the current daylight, weather and sea-state conditions, MAP keeps that vessel as a sharp visual contact at its real position. The player does not need to rotate SCOPE through 360 degrees simply to keep already visible contacts precise on the chart.

This crew-level knowledge is separate from the physical optic:

- MAP visual awareness is 360 degrees while the hull is theoretically visible.
- The actual SCOPE renderer remains bearing/FOV dependent: a ship is only visible through the optic when the player is looking toward it.
- If the hull is no longer theoretically visible, MAP immediately falls back to the uncertain sensor/plot representation rather than retaining a stale exact visual position.
- SCOPE remains usable while surfaced; it is not artificially disabled simply because BRG is the more natural wide lookout station.

MAP shows a subtle sector for the current periscope bearing and field of view. A selected sharp visual contact also shows absolute bearing and range. Very small craft can receive a restrained `6× RECOMMENDED` hint when they are difficult to resolve in the 1.5× optic.

## MAP controls and waypoints

MAP is intended to work equally well with mouse, touch and a stylus:

- drag to pan;
- pinch to zoom;
- tap open water to set a waypoint;
- tap an existing waypoint to remove it;
- `◎` re-centres on the submarine;
- `✕` clears the plotted route;
- `☁ WX` toggles the weather overlay.

Pointer handling distinguishes pen input from finger gestures so a stylus can set/remove waypoints without weakening the finger pinch/pan behaviour.

A plotted waypoint engages the simple navigation autopilot. Manual helm input releases the autopilot.

## Weather and visibility

Weather is part of the live simulation rather than a decorative layer. Local daylight, visibility, sea state and moving weather cells affect visual detection and rendering.

The MAP weather toggle displays the moving weather cells together with a persistent overlay-status/local-visibility indication. This means the player can still see that WX is active even when the nearest squall is outside the current chart window.

The training patrol deliberately uses generally clear conditions so weather does not interfere with learning the controls.

## Sound room and radar

The sound room is intentionally skipper-level rather than a separate sonar minigame.

- `Train ◀ / ▶` or dragging rotates the hydrophone listening bearing.
- `✚ Mark Bearing` records a passive line of bearing. It does not transmit and does not reveal the boat.
- Repeated passive marks after ownship has changed position can improve/triangulate the chart plot.
- `◉ Echo Range` sends an active QC pulse. It can give a strong short-range range fix, but nearby escorts can hear the transmission. Treat it as the acoustic equivalent of ringing a bell underwater.
- `SJ Radar` is available only on patrol dates where the boat has the historical fit.

Ownship noise matters. Slowing or stopping the shafts improves passive listening; silent running further reduces the boat's acoustic signature.

## Propulsion and battery

Surface/awash propulsion uses the diesels. For playability the induction is treated as available to roughly 12 ft on the way down and returns at roughly 8 ft on the way up. Below that the boat runs on electric motors; there is no snorkel.

Submerged battery use is expressed as a clear percentage-per-simulated-hour model. Approximate endurance from a full, undamaged battery is:

| Regime | Approximate endurance |
| --- | ---: |
| STOP | 80 h |
| 120 rpm | 12.9 h |
| 250 rpm | 3.3 h |
| 450 rpm / flank | 1 h |
| Silent + STOP | 111 h |
| Silent + 120 rpm | 13.5 h |

The fixed hotel load is lower during silent running. Propulsion demand rises sharply with motor power, dewatering pumps add a small additional load, and electrical damage increases total consumption. High submerged speed is therefore an emergency resource; slow running and waiting are viable.

On the surface the diesels can recharge the battery, but the screws have priority. Charging is fastest while loafing at low revolutions and becomes very poor at flank speed. A heavily discharged battery normally needs several hours on the surface to recover.

Time compression advances battery/fuel use in simulated time as expected.

## Torpedoes and the TDC

The Attack tab provides the Torpedo Data Computer, tube states and firing controls. Tubes must be flooded before firing; `FIRE` does not silently prepare a dry tube for the player.

The TDC works from the selected track and now solves the same launch geometry that the torpedo actually flies: tube bank, initial settling run, finite-rate gyro turn and final intercept leg. The Attack UI reports the preferred `FWD`/`AFT` bank, gyro/tube turn and a launch-geometry cue (`GOOD`, `WIDE GYRO`, `VERY WIDE GYRO` or `SWING BOAT`). A mathematically tempting solution that cannot complete its turn cleanly at very short range is not presented as fireable. This keeps high-quality solutions honest without requiring the bow to point exactly at the target.

Historical torpedo availability and configurable dud behaviour remain separate from fire-control accuracy. Training torpedoes are made reliable so the tutorial can teach the attack flow.

Torpedo collision uses the same physical hull dimensions as the visible ship model and uses swept movement checks so a fast torpedo cannot step through a narrow or manoeuvring target between simulation ticks.

### Torpedo impact presentation

A torpedo hit from SCOPE or BRG automatically opens a short cinematic observation. From non-optical stations the player can choose to view the impact rather than being forcibly pulled away from the working station.

The cinematic deliberately prioritises readability over pretending to replay the last seconds of simulation exactly:

- it cuts immediately to a close impact view while keeping the complete ship in frame with some sea around it;
- the target, camera and already-laid steam-torpedo bubble trail are held still during the short anticipation beat;
- after roughly 1.5 seconds the visible impact/explosion begins;
- damage, fire, flooding/sinking state and the damage assessment are then shown before returning to the original station;
- the cinematic runs on wall-clock time with normal simulation time paused, so 8×/16×/32× does not turn the impact into a fast-forward sequence.

Electric torpedoes do not receive an artificial steam bubble trail.

## 3-inch deck gun

The deck gun is only available with the boat on the surface and the crew topside. It is intended for small, unescorted or already crippled targets rather than as a substitute for evading a destroyer.

`LAY` uses the same drag-aware ballistic model as the actual shell rather than a separate vacuum trajectory. Fine elevation adjustment remains under player control. At very long range the shell is no longer rendered as an implausible glowing tracer all the way to the target; splashes and horizon clipping are handled separately.

A shell hit creates a smaller, higher shipboard impact than a torpedo strike: local irregular flash/sparks at deck or superstructure height, atmospheric bloom and a broad soft reflection over the sea. The nearby submarine/deck can receive a subtle warm light response without adding a separate expensive dynamic-lighting pass.

## Enemy ASW and aircraft

Escorts search, acquire and attack rather than merely following scripted paths. Active sonar, contact quality, ownship noise, thermal-layer effects, manoeuvring, knuckles and finite depth-charge stores all affect an ASW engagement.

Aircraft can search for and attack a surfaced submarine. Diving remains the primary defence. The 20 mm AA weapon is treated as an automatic last-ditch crew action rather than a separate manual station; SD air-search radar is handled automatically when historically fitted and usable.

### Surface traffic, ship classes and friendly air

Surface traffic distinguishes small patrol/subchaser craft, kaibokan/escort vessels, destroyers, heavy cruisers and carriers rather than rendering every warship as a merchant-shaped placeholder. The heavier classes use their own lightweight Canvas2D/pseudo-3D silhouettes while sharing the same world/collision/damage model.

Friendly surface traffic is part of the local world. Visually identified friendly/neutral contacts are labelled separately, enemy surface combatants can engage a nearby Allied transport, and the transport will attempt to evade rather than pass through a hostile patrol as scenery. A deliberately sparse friendly-air layer can also produce an Allied PBY or fighter patrol in appropriate areas; these aircraft never enter the hostile attack state machine. Fighters may statistically drive off a nearby hostile aircraft and patrol aircraft can provide a rough contact report without creating an exact MAP track.

## Training patrol

The training course is paced as an actual lesson rather than a sequence of state checks that can race past the player.

Each lesson is treated as one of three kinds internally:

- acknowledgement/read steps;
- state objectives;
- fresh-action objectives that require the relevant action after that lesson has begun.

This prevents an old state — for example an already flooded tube or a previously selected station — from instantly consuming several later tutorial steps.

The current course teaches:

- station switching;
- MAP panning/zooming and waypoint plotting;
- helm, speed/noise and depth control;
- passive visual/sound detection;
- the difference between safe passive `Mark Bearing` and revealing active `Echo Range`;
- contact interpretation;
- SCOPE and target lock;
- TDC solution reading, flooding and firing;
- following a torpedo run on MAP and using time compression;
- surfacing and using the deck gun;
- silent/deep evasion of a deliberately introduced escort;
- aircraft behaviour, Status, damage, radio and return-to-base flow.

During `The Run` the player may use MAP and high time compression while the torpedo is still distant. The training instructor returns the clock to 1× shortly before the expected terminal run.

The deck-gun lesson is a sandbox: ordinary ambient traffic/air attacks are suppressed and the practice hulk is inert. The scripted escort does not appear until the later evasion exercise, after the player explicitly confirms readiness.

The tutorial card can be minimised to keep the mobile interface usable. Once an objective is completed, the obsolete control highlight is released so the instruction card cannot trap its own `CONTINUE` control behind collision-avoidance behaviour.

## Missions, ports and campaign

A patrol has a primary mission. The Mega Pacific mission framework supports twelve families:

1. Convoy interdiction
2. High-value intercept
3. Anchorage reconnaissance
4. Lifeguard duty
5. Special transport / coastwatchers
6. Minelaying
7. Shadow & report
8. Escort hunt
9. Harbor strike
10. Recon party insertion
11. Recon party extraction
12. Weather ambush

Mission-critical ships keep one identity and one route state even when the distant-traffic LOD abstracts them for performance. High-value/escort hunts therefore do not fail merely because an arbitrary clock expired, and their targets do not reverse across the whole chart after the player has travelled toward an old report. Periodic radio/intelligence updates remain deliberately imperfect rather than becoming a live GPS marker. Timers are retained only where time is part of the action itself, such as a transfer once the submarine is actually on station.

The Pacific catalogue contains ten patrol areas. Terrain is expanded lazily for the selected patrol rather than eagerly constructing every coastline/bathymetry field at startup; this is a deliberate memory/startup safeguard for lower-spec mobile hardware. Historical scenarios pin their own date, area, refit and mission conditions.

Friendly ports/rendezvous points serve two purposes:

- during an active patrol, stop inside the green 0.30 nm service ring to rearm, refuel and repair;
- once the campaign status is `RETURN TO BASE`, return surfaced and stopped inside the same safe ring to complete the patrol.

## After Action Report and career history

The old animated AAR replay has been removed from the player-facing report. The AAR is now a static patrol debrief: more useful to browse, cheaper to run and substantially less fragile than replaying the tactical simulation after the fact.

The report contains:

- mission result and patrol summary;
- overall patrol statistics;
- a swipe/scroll engagement carousel for damaged and sunk enemy vessels;
- ship type/profile, outcome, tonnage, length, speed and weapons used;
- hits, firing range and damage-state bars;
- score credit;
- `GAME RARITY` from common to very rare;
- `ATTACK DIFFICULTY` on a 0–100 game scale;
- contextual badges such as long shot, small target, manoeuvring target, escorted attack, night attack, heavy sea, rare contact or one-hit sinking;
- a small static firing/impact geometry diagram for each recorded engagement;
- patrol highlights such as hardest attack, rarest contact and heaviest ship engaged;
- the Captain's Log.

`GAME RARITY` and `ATTACK DIFFICULTY` are game measures, not claims of exact historical probability. Difficulty is derived from the recorded tactical circumstances, including range, target speed/size, manoeuvring/alert state, escort threat, visibility, sea state and day/night conditions.

Older saved patrol records without the newer engagement snapshots remain readable; the UI can build simpler fallback cards from their existing sunk/damaged ship records.

## Portable player profiles and save compatibility

The `Save / Load` screen can export a portable player profile for reinstall/device migration. The profile contains the normalized career history, occupied manual save slots and (when meaningful) the current resumable patrol/autosave. Import is transactional at the application level: all profile-related `localStorage` keys are rolled back if a write fails part-way through.

The portable envelope has its own `formatVersion`, deliberately separate from the career format and `STATE_SCHEMA_VERSION` used by serialized patrol snapshots. Future releases should migrate old profile envelopes in `SaveSystem._migrateProfile()` and old patrol-state schemas in `SaveSystem._migrateSnapshot()`, while keeping simulation migrations additive wherever practical. A newer, unsupported state schema is refused rather than half-loaded. Do not rewrite an imported backup file merely to migrate it; migration happens on the parsed copy before storage.

Exports include a SHA-256 checksum when Web Crypto is available, with a small non-cryptographic fallback for unusual non-secure contexts. This is corruption/edit detection, not an anti-cheat security boundary. Periscope Patrol is a client-side open-source game: a technically capable player can inspect the algorithm and recompute any client-side checksum or embedded-key MAC. If a future competitive leaderboard needs trusted scores, validation/signing must happen outside the client (for example on a server); the local profile format should remain focused on reliable portability.

## Rendering and mobile performance

Rendering uses a lightweight custom Canvas2D pseudo-3D naval world engine; there is no WebGL dependency. World entities live in shared world coordinates and SCOPE, BRG, GUN and impact presentation project them through explicit camera objects. Station controllers own station-specific camera state; terrain, ships and effects should not reach back into a station's bearing. This boundary prevents an island or vessel from being accidentally pinned to one view when another camera turns.

The game is designed to remain usable on phones and lower-memory tablets as well as faster devices.

Low-memory/low-core devices receive a reduced effects budget and capped backing-store DPR. MAP uses rasterised/reused bathymetry at very wide zoom levels and returns to the detailed vector chart as the player zooms in. Coast geometry is thinned only when sub-pixel detail would not be visible.

Visual effects are intentionally implemented with lightweight Canvas2D primitives rather than separate particle/light engines wherever possible. This includes wakes, impact flashes, deck lighting and the impact cinematic.

Touch, mouse and stylus paths are all supported. Finger pinch/pan rules remain conservative while pen taps receive their own tolerance for accurate waypoint work.

## Project layout

The in-game `About` tab identifies the project as `A WekSoft project · © 2026` and records that the source is MIT licensed. `WekSoft` is a project/development label; the bundled `LICENSE` remains the licensing source of truth.

The GitHub Pages root is the directory containing `index.html`.

```text
index.html
sw.js
manifest.webmanifest
README.md
ARCHITECTURE.md
PWA_CACHE_FILES.txt
LICENSE
apple-touch-icon.png
icon-192.png
icon-512.png
icon-maskable-512.png
css/
  app.css
js/
  audio/
  bootstrap/
  controllers/
  core/
  data/
  navigation/
  persistence/
  pwa/
  rendering/
  simulation/
  tutorial/
  ui/
```

The production app currently consists of 63 ordered runtime JavaScript files under `js/`. It intentionally uses classic ordered `<script>` loading rather than ES modules, so GitHub Pages deployment remains a simple static-file upload. `ARCHITECTURE.md` documents dependency/load-order considerations in more detail.

Development tests, temporary patch notes and generated audit JSON are not required by the production PWA and can be kept outside the clean runtime repository.

## Service worker and offline releases

`sw.js` is the release/cache source of truth and is intentionally maintained manually.

For a routine runtime release:

1. Upload the changed runtime files while preserving their existing relative paths.
2. If a new runtime file has been introduced, add its exact relative path to `SHELL` in `sw.js`.
3. Change the single `VERSION` value near the top of `sw.js`.
4. Do not change the cache name anywhere else; it is derived from `VERSION`.
5. Open the deployed game online and allow the normal PWA update/reload flow to activate the new worker.

The service worker is cache-first for same-origin game assets. Critical HTML/CSS/runtime JavaScript files are treated as required during installation: a new worker should not activate with an incomplete offline runtime. Icons are optional installation assets and may fail softly without invalidating an otherwise complete game cache.

The worker intentionally does not call `skipWaiting()` automatically during installation. A new worker waits until the player accepts/reloads or all existing clients close, avoiding a code/cache swap in the middle of a patrol. Old `periscope-patrol-*` caches are removed when the new worker activates.

## Development rules that matter

A few design rules have become important as the game has grown:

- Treat `index.html` plus the ordered runtime scripts as one coherent application; load order matters.
- Do not create duplicate global helpers in later files to paper over dependency problems.
- MAP crew knowledge and the physical SCOPE FOV are intentionally different concepts.
- Rendering failures in one station should not freeze the simulation or prevent switching to another station.
- UI messages should reflect committed command/state changes, not merely a pointer event that may later be rejected.
- Avoid coupling game physics to cinematic presentation. Impact observations may pause/present state, but should not change whether a hit physically occurred.
- Any new runtime JavaScript file must also be considered for the `sw.js` `SHELL` cache list.
- Keep mobile performance in mind before adding new per-frame effects, timers or full-scene passes.
- Shared world renderers consume `world + camera`; they must not read `periscopeBearing`, gun train or another station-specific bearing for projection.
- TDC launch geometry and torpedo steering constants must stay shared; never introduce a second simplified intercept model in the UI.
- Mission-critical contacts may be abstracted for LOD, but abstraction must preserve identity, route progress and member offsets exactly.
- Keep distant entities abstract and cheap; spend full AI/collision/render work only inside the tactical bubble.

No server, npm build, bundler or local Git installation is required to play or deploy the game.
