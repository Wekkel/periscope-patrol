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
- `js/data/torpedo-data.js` — torpedo specs, dud modes and torpedo-load helpers.
- `js/data/game-catalog.js` — explicit theater/faction/campaign/submarine identity profiles, additive surface-vessel identity profiles, mission-critical convoy composition and boat-specific sensor presentation. Runtime vessel contacts now separate `gameplayType`, `factionId`, `vesselProfileId` and `modelKey`; legacy `type` remains a compatibility alias while older saves are normalized on load.
- `js/data/pacific-terrain-data.js` — Pacific coastline source geometry and the one-entry lazy patrol-terrain cache.
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
- `js/simulation/sensors.js` — lookout, visual/acoustic contact tracking and signatures. Electronic contact fixes use generic `ACTIVE_ECHO` / `SURFACE_RADAR` IDs; legacy `QC ECHO` / `SJ RADAR` values are normalized for old-save compatibility.
- `js/simulation/sound-radar.js` — passive-sound/active-echo/surface-radar operation. It maps the current historical US fit data onto generic runtime capability fields while retaining legacy `sd*`/`sj*` aliases until the later campaign/equipment-by-date migration.
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
- `js/controllers/touch-controller.js`, `bridge-controller.js` — input/control routing. The browser UI deliberately has two shells: coarse-pointer/mobile devices use the touch shell, while a fine-pointer desktop browser uses the cockpit shell. Desktop command families are presentation-only tabs (`HELM`, `TDC`, `WEAPONS`, `NAV`); they must never duplicate or fork simulation commands. The canonical controls/IDs remain the same and are merely grouped for reachability.
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

### Sensor capability boundary

Sensor simulation must not infer equipment identity from a US-specific display string. `game-catalog.js` owns the boat-specific presentation (`SJ Radar`, `SD Radar`, `Active QC` for the current Gato profile); `sensors.js` owns generic contact-fix semantics; `sound-radar.js` consumes generic dated sensor capabilities and emits the generic `ACTIVE_ECHO` alert reason.

### Campaign / equipment-by-date boundary

`CAMPAIGN_PROFILES` owns authored historical progression. The current `us-pacific` profile contains the broad Pacific era bands, dated radar/torpedo availability, radar performance bands, war-progression factors and the small set of area-specific multipliers that previously lived as US/Pacific conditionals inside `historical-campaign.js`. `historical-campaign.js` is now a materializer: once per patrol/date change it resolves those data into `campaign.historicalProfile`, which remains the cheap runtime object used by sensors, ASW and traffic.

New code should prefer `historicalProfile.sensorCapabilities[CAPABILITY_ID]` and `availableTorpedoes`. The old `sdAvailable`, `sjAvailable`, `sjRangeNm`, `sjErrorFactor`, `sjSweepSec` and `sjRadarDepthFt` fields remain additive compatibility aliases while untouched Pacific UI/save consumers migrate. A future Atlantic campaign must author its own historical model in the catalog; do not add Type VII, Kriegsmarine or Allied date exceptions to `historical-campaign.js`.

Legacy serialized track sources `SJ RADAR` and `QC ECHO` are accepted and normalized at read/use boundaries. Do not remove those aliases until the save-schema migration explicitly converts them.

### Surface-vessel identity boundary

A contact's historical identity must not be inferred from one overloaded `type` string. `game-catalog.js` stamps four orthogonal fields: `gameplayType` for movement/combat classification, `factionId` for historical allegiance, `vesselProfileId` for the authored hull/profile identity, and `modelKey` for lightweight rendering. Existing Pacific contacts still retain their original `type` value byte-for-byte as a legacy alias, so untouched systems and old saves behave as before.

`side` deliberately remains the cheap tactical FRIENDLY/ENEMY/NEUTRAL relationship used by current AI; it is not a substitute for `factionId`. New theaters should author explicit profile/faction IDs at contact creation. During the migration window, `materializeVesselIdentity()` may infer the current Pacific defaults for legacy contacts, and `SaveSystem` stamps the additive identity on load without a destructive schema bump. Physical movement/classification and shared vessel rendering should prefer `gameplayType` / `modelKey`; do not add a German or Allied Atlantic hull by inventing another meaning for legacy `type`.

### Mission-critical convoy composition boundary

The active campaign owns the authored hull mix for the primary convoy. `game-catalog.js` therefore contains the current `us-pacific` merchant/escort templates and their initial formation offsets; `engine-core.js` only materializes those definitions, applies historical tonnage/count factors and hands escorts to the existing ASW doctrine. Do not put Japanese names, kaibokan/subchaser templates or a Pacific fallback back into `makeConvoy()`.

Primary convoy composition and ambient traffic are deliberately separate campaign profiles because their persistence contracts differ. `game-catalog.js` now owns both the current `us-pacific` primary-convoy profile and its ambient/distant-world traffic profile. `traffic-director.js` still owns route motion, deterministic spawning, the cheap abstract/tactical LOD boundary and three small manifest primitives (`SINGLE`, `SMALL_CONVOY`, `TASK_GROUP`), but it must not contain Pacific area-density tables, Japanese vessel names, faction sides, lane preferences or base speeds. A future Atlantic campaign must provide its own primary convoy and ambient traffic profiles; missing profiles should fail explicitly rather than silently materializing Pacific shipping.

### Mission assignment / briefing boundary

The active campaign owns player-facing mission definitions and the patrol-area mission mix. `game-catalog.js` contains the current `us-pacific` mission titles, rewards, briefing text, AUTO description and per-area mission pools; `mission-framework.js` owns only the supported mission mechanics and runtime progression. Do not put COMSUBPAC/Japanese wording or Pacific area names back into mission selection logic.

`MISSION_PRIMARY_TYPES` remains the small set of engine mechanics currently implemented. A campaign may expose only a subset through its mission profile. Missing mission data for a future campaign should fail explicitly rather than falling back to Pacific orders. Theater-specific target templates and special mission objects are a separate migration boundary and may still contain Pacific content until their own regression-gated refactor.

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

