# Architecture after refactor

## Design constraints

- Browser-first, no framework, no bundler and no transpilation.
- Classic external `<script>` files are intentionally used instead of converting everything to ES modules. This preserves the original page-global bindings and minimizes behavior changes in a pure refactor.
- Dependency direction is represented by the order of script tags in `index.html`. There are no `import`/`export` statements, therefore there are no JavaScript import cycles.
- Large subsystems are split only at domain boundaries. Methods were not rewritten merely to achieve smaller files.
- Persistence remains browser-local, but portable profile export/import is layered around the existing manual-save/autosave formats with an independent migration envelope.

## Dependency direction

1. `core/utilities.js` and immutable/static data.
2. Navigation/TDC maths and state creation.
3. Command bus.
4. Simulation inheritance chain.
5. Rendering constants/helpers and rendering inheritance chain.
6. Audio, persistence and UI services.
7. Game/controllers/tutorial/loop.
8. Bootstrap wiring, picker/gauges, PWA version reader, autosave and final start.

Nothing lower in this list needs to import something above it; the final boot code is the composition root.

## File map

### HTML and CSS

- `index.html` — semantic UI shell, overlays, desktop/touch layouts and ordered external script references.
- `css/app.css` — the original inline stylesheet, transferred without rule changes.

### Core and data

- `js/core/utilities.js` — math, units and shared formatting helpers.
- `js/data/torpedo-data.js` — torpedo specs/dud modes, coastline source geometry and the one-entry lazy patrol-terrain cache.
- `js/data/campaign-data.js` — patrol-area metadata only; do not eagerly call `buildTerrain()` here.
- `js/navigation/route-geometry.js` — water-route/polyline geometry, including one-way progress for mission-critical routes.
- `js/simulation/weapons/tdc-math.js` — the single source of truth for TDC launch/intercept geometry (settling run + finite gyro turn + final leg).
- `js/core/state.js` — `createState()` and initial game-state schema.
- `js/core/command-bus.js` — command queue/bus.

### Simulation

`SimEngine` is now a deliberately linear inheritance chain. Each layer owns a coherent method group while retaining the original public class name at the end:

`SimEngineCore` → `SimEngineHarbor` → `SimEngineTorpedoes` → `SimEngineEnemyAI` → `SimEngineAircraft` → `SimEngineDeckGun` → `SimEngineAAGun` → `SimEngineIntel` → `SimEngineSensors` → `SimEngineASW` → `SimEngine`.

Files:

- `js/simulation/engine-core.js` — main update flow and common simulation operations.
- `js/simulation/harbor.js` — harbor geometry/behavior.
- `js/simulation/weapons/torpedoes.js` — tubes, launch, run, hit/miss handling.
- `js/simulation/ai/enemy-ai.js` — enemy alert/search behavior.
- `js/simulation/ai/aircraft.js` — air threat and attack behavior.
- `js/simulation/weapons/deck-gun.js` — 3-inch/50 gun state, laying, firing, shell damage.
- `js/simulation/weapons/aa-gun.js` — 20 mm AA behavior.
- `js/simulation/radio-intel.js` — radio/ULTRA/intelligence flow.
- `js/simulation/sensors.js` — lookout, visual/acoustic contact tracking and signatures.
- `js/simulation/ai/escort-asw.js` — escort ASW behavior.
- `js/simulation/physics-navigation.js` — transit watch, submarine movement/physics/navigation and final `SimEngine` class.
- `js/simulation/day-night.js` — day/night cycle helper.

### Rendering

`CanvasView` uses the same conservative pattern:

`CanvasViewCore` → `CanvasViewTactical` → `CanvasViewDeckGun` → `CanvasViewPeriscope` → `CanvasView`.

- `js/rendering/world-geometry.js` — rendering constants/models/world helpers.
- `js/rendering/canvas-core.js` — canvas setup, resize, shared camera/math/render dispatch.
- `js/rendering/tactical.js` — TAC station.
- `js/rendering/deck-gun-3d.js` — deck-gun 3D station and shell/splash rendering.
- `js/rendering/periscope-3d.js` — periscope world/sea/sky/ship 3D rendering.
- `js/rendering/map.js` — MAP station and map interaction/rendering.
- `js/rendering/gyro-indicator.js` — gyro widget.
- `js/rendering/particles.js` — particle effects.

### UI, controllers, persistence and boot

- `js/ui/briefing.js`, `scenario-selector.js`, `toast.js`, `dom-view.js`, `picker.js`, `helm-gauges.js` — UI concerns.
- `js/controllers/touch-controller.js`, `bridge-controller.js` — input/control routing.
- `js/audio/audio-engine.js` — Web Audio behavior.
- `js/persistence/save-system.js`, `autosave.js` — manual saves, autosave/resume and versioned portable player-profile backup/import.
- `js/tutorial/tutorial.js` — training patrol/tutorial flow.
- `js/core/game.js`, `game-loop.js` — game facade and frame/update loop.
- `js/bootstrap/wiring.js` — DOM event wiring and singleton composition.
- `js/pwa/version.js` — existing service-worker/version-reading client logic.
- `js/bootstrap/start.js` — final picker/gauge/loop start.

## Mega Pacific engine boundaries

### World → camera → renderer

The optical views share a lightweight Canvas2D pseudo-3D world engine. World entities are authored once in world coordinates; station code creates a camera (`position`, `heightM`, `bearingDeg`, `fovDeg`, viewport), then terrain/vessel/atmosphere/effect renderers project through that camera. A shared renderer must not read `state.tactical.periscopeBearing`, deck-gun train or another station-specific bearing to position world geometry. That would recreate the historical bug where terrain stayed visually attached to SCOPE while BRG/GUN turned.

`makeWorldCamera()` / `setWorldCameraBearing()` in `js/rendering/world-geometry.js` are the common boundary. SCOPE, BRG, GUN and impact cameras may add their own HUD/foreground presentation, but world-space objects should not need per-station positioning patches.

### Lazy patrol terrain

`PATROL_AREAS` is metadata. `getPatrolTerrain(areaKey)` expands only the selected coastline and keeps a one-area terrain cache; the bathymetry cache is invalidated when the selected area changes. This is deliberate for the Helios-class mobile performance target. Adding patrol areas must not reintroduce `terrain: buildTerrain(...)` in every `PATROL_AREAS` entry.

### TDC and torpedo physics

TDC solution geometry and torpedo launch physics share the settling-run distance, maximum gyro turn and turn rate. The solver evaluates the actual forward/aft tube bank and finite turn before the final intercept leg. UI/controller code consumes that result; it must not recompute a simplified straight-line solution. A `SWING BOAT` result is guidance, not a fireable high-quality solution.

### Mission-critical LOD persistence

The primary convoy/HVT may be materialised inside the tactical bubble and reduced to an abstract group outside it. The transition is a level-of-detail change, not a respawn: member identities, offsets, target designation and route progress must survive exactly. Critical routes use one-way/clamped progress so a target cannot reach the endpoint, reflect and appear to have crossed the map behind the player. Ambient traffic is allowed to use cheaper/repeating route behaviour because it is not a mission contract.

### Performance rule

Distant world = abstract, low-frequency and cheap. Local tactical world = full AI, collision, sensor and rendering work. New features should prefer data profiles and bounded local entities over new permanent animation loops or global per-frame passes. Friendly aircraft deliberately use this rule: at most a very small local presence and statistical offscreen interaction.

### Portable profile / save compatibility boundary

The portable player-profile envelope is versioned separately from career records and from serialized patrol state. `SaveSystem._migrateProfile()` translates old envelope formats; `SaveSystem.STATE_SCHEMA_VERSION` plus `_migrateSnapshot()` is the compatibility boundary for manual saves, autosaves and transferred live patrols. Pre-Mega snapshots are schema 0 and are upgraded additively by the existing `ensure*` runtime shims. A future release that makes a destructive state change must add its migration in `_migrateSnapshot()` before increasing the schema version; an older build must reject a newer schema rather than guess. This separation is intentional: adding a future subsystem must not force every historical `.ppprofile.json` backup to mirror the newest in-memory schema.

A profile checksum is integrity metadata only. Because the complete game and client code are public, no symmetric key embedded in JavaScript can establish trusted scores: the key and verification path would be available to the player. Do not add obfuscated client secrets as an anti-cheat mechanism. If trusted competitive state is ever required, make the authoritative signature/validation service external to the open client.

## Why no ES-module conversion in this patch?

A conversion from one classic inline script to `type="module"` would change scope, timing and some browser-global semantics at the same time as the file split. That is avoidable risk for an architecture-only patch. The current structure already gives domain ownership and reliable patch targets while remaining a zero-build GitHub Pages app. If desired, ES modules can later be a separate, independently testable architecture patch.

## Production / Atlantic DEV build channels

The repository intentionally has one shared runtime and two deployment channels. The public build is served at the project root; the experimental Atlantic build is served below `/dev/`. Those paths are the same browser origin, so path separation alone does **not** isolate Web Storage or Cache Storage.

`js/core/utilities.js` therefore exposes `PP_BUILD`. Production preserves all historical storage keys unchanged; `/dev/` prefixes player/device keys with `ppdev_`. Never remove this namespace merely because the two builds have different manifest IDs: a manifest ID distinguishes installed apps, but it does not create a new browser origin or storage bucket.

Service-worker caches need the same separation. `sw.js` is maintained manually by the project owner and is deliberately not patched by normal ChatGPT ZIPs. The production and DEV workers must use distinct cache families and must never delete each other's caches. The production worker also needs to leave `/dev/` requests alone so the narrower `/dev/sw.js` registration owns that subtree once installed.

The nested same-origin deployment is an explicitly temporary development experiment, not an architectural promise. Separate manifest IDs and names help Chrome distinguish installs, but they do not create independent origins: site-data clearing/uninstall prompts, quotas, permissions and other origin-scoped browser state can still couple the two builds. Before DEV installation, export the production player profile. If the target Android devices do not keep the installs predictably distinct, move DEV to a separate origin (preferred) or at minimum a non-overlapping deployment path rather than adding browser/device hacks.

The build channel is a development convenience, not access control. Do not add hardware fingerprinting or treat `/dev/` as secret. Atlantic feature visibility may key from `PP_BUILD.isDev`, but all security assumptions must remain zero-trust because the complete client-side code is public.

