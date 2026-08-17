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
4. Simulation systems and their explicit context wiring.
5. Rendering constants/helpers and station registry wiring.
6. Audio, persistence and UI services.
7. Game/controllers/tutorial/loop.
8. Bootstrap wiring, picker/gauges, PWA version reader, autosave and final start.

Nothing lower in this list needs to import something above it; the final boot code is the composition root.

## File map

### HTML and CSS

- `index.html` — semantic UI shell, overlays, desktop/touch layouts and ordered external script references.
- `css/app.css` — shared component styling plus bounded desktop/touch layout rules. Desktop columns own their scrolling; the station canvas always keeps a finite grid cell and never depends on page scrolling.

### Core and data

- `js/core/utilities.js` — math, units and shared formatting helpers.
- `js/data/torpedo-data.js` — torpedo specs, dud modes and torpedo-load helpers.
- `js/data/game-catalog.js` — explicit theater/faction/campaign/submarine identity profiles, additive surface-vessel identity profiles, mission-critical convoy composition, campaign doctrine/aircraft rosters and boat-specific sensor presentation. Runtime vessel contacts now separate `gameplayType`, `factionId`, `vesselProfileId` and `modelKey`; legacy `type` remains a compatibility alias while older saves are normalized on load.
- `js/data/pacific-terrain-data.js` — Pacific coastline source geometry and the one-entry lazy patrol-terrain cache.
- `js/data/campaign-data.js` — patrol-area metadata only; do not eagerly call `buildTerrain()` here.
- `js/navigation/route-geometry.js` — water-route/polyline geometry, including one-way progress for mission-critical routes.
- `js/simulation/weapons/tdc-math.js` — the single source of truth for TDC launch/intercept geometry (settling run + finite gyro turn + final leg).
- `js/core/state.js` — `createState()` and initial game-state schema.
- `js/core/command-bus.js` — command queue/bus.

### Simulation

The simulation is composition-based. `SimEngine` is the only remaining simulation
coordinator class. `CoreSystem` and the fifteen domain systems below are plain
system objects; they are composed through an explicit context rather than a
shared inheritance chain.

Systems:

- `CoreSystem` — command dispatch, patrol lifecycle, common state transitions and the fixed-step update orchestration.
- `HarborSystem` — harbor setup, defenses, searchlights, batteries, nets and harbor intel.
- `WeatherSystem` — weather evolution and environmental effects.
- `SoundRadarSystem` — passive sound, active echo and surface-radar operations.
- `IntelSystem` — radio intelligence, contact reports and signal interpretation.
- `SensorsSystem` — visual/lookout and acoustic contact acquisition.
- `TorpedoSystem` — tube state, launch, run, hit/miss and torpedo effects.
- `DeckGunSystem` — deck-gun laying, firing and shell effects.
- `AAGunSystem` — anti-aircraft fire and casualty effects.
- `AircraftSystem` — aircraft motion, detection and attacks.
- `ASWBrainSystem` — escort search solutions and doctrine mechanics.
- `ASWSystem` — escort behavior and depth-charge attacks.
- `EnemyAISystem` — enemy alert, search and prosecution decisions.
- `CollisionSystem` — vessel collision detection and collision consequences.
- `DamageSystem` — damage state, sinking and damage-control effects.
- `CareerSystem` — patrol completion, career persistence and AAR-facing records.

`SimEngine` owns the update loop boundary and is the composition root: it
constructs/supplies the context and system registry. `CoreSystem` owns common
command and lifecycle behavior; it is not the composition root.

The following table is the system-edge projection of the generated call graph;
ctx-only calls and intra-system calls are deliberately omitted.

The principal `sys` edges are:

| System | Explicit system dependencies |
|---|---|
| `CoreSystem` | all command-owning systems; it is the composition root |
| `HarborSystem` | `sys.damage` |
| `WeatherSystem` | none |
| `SoundRadarSystem` | `sys.enemyAI` for escort alerting |
| `IntelSystem` | `sys.harbor`; Core/traffic adapters where those remain coordinators |
| `SensorsSystem` | `sys.aswBrain`, `sys.enemyAI` |
| `TorpedoSystem` | `sys.harbor`, `sys.damage`, `sys.enemyAI` |
| `DeckGunSystem` | `sys.damage` |
| `AAGunSystem` | `sys.damage` |
| `AircraftSystem` | `sys.aaGun` |
| `ASWBrainSystem` | its declared sensor/solution services; no generic escape hatch |
| `ASWSystem` | `sys.damage` and its declared escort services |
| `EnemyAISystem` | `sys.aswBrain`, `sys.asw`, `sys.sensors` |
| `CollisionSystem` | `sys.damage` |
| `DamageSystem` | no system dependency; career/AAR effects use explicit context services |
| `CareerSystem` | no simulation-system dependency; it consumes explicit context services |

Files:

- `js/simulation/engine-core.js` — main update flow and common simulation operations.
- `js/simulation/harbor.js` — harbor geometry/behavior.
- `js/simulation/weapons/torpedoes.js` — tubes, launch, run, hit/miss handling.
- `js/simulation/ai/enemy-ai.js` — enemy alert/search behavior.
- `js/simulation/ai/aircraft.js` — shared aircraft detection/attack/motion behavior; campaign doctrine supplies force posture and roster content.
- `js/simulation/weapons/deck-gun.js` — 3-inch/50 gun state, laying, firing, shell damage.
- `js/simulation/weapons/aa-gun.js` — 20 mm AA behavior.
- `js/simulation/radio-intel.js` — radio/ULTRA/intelligence flow.
- `js/simulation/sensors.js` — lookout, visual/acoustic contact tracking and signatures. Electronic contact fixes use generic `ACTIVE_ECHO` / `SURFACE_RADAR` IDs; legacy `QC ECHO` / `SJ RADAR` values are normalized for old-save compatibility.
- `js/simulation/sound-radar.js` — passive-sound/active-echo/surface-radar operation. It maps the current historical US fit data onto generic runtime capability fields while retaining legacy `sd*`/`sj*` aliases until the later campaign/equipment-by-date migration.
- `js/simulation/ai/asw-brain.js` — shared escort search/doctrine mechanics; campaign doctrine supplies area risk, escort-count and screen-role policy.
- `js/simulation/ai/escort-asw.js` — escort ASW sensor/prosecution behavior.
- `js/simulation/physics-navigation.js` — transit watch, submarine movement/physics/navigation and final `SimEngine` class.
- `js/simulation/day-night.js` — day/night cycle helper.

### Rendering

The render layer is also composition-based. `CanvasViewCore` is an independent
canvas/transform/resize/quality service. `CanvasView` is a thin registry that
dispatches by `activeStation` to six plain station objects:

`TacticalStation`, `BridgeStation`, `SoundStation`, `PeriscopeStation`,
`MapStation` and `DeckGunStation`.

Shared render modules are explicit dependencies: `optics.js` contains pure
horizon/optics mathematics, while `world-3d.js` contains shared world and
projection rendering. `battle-atmosphere.js` contains shared atmosphere
effects. No station inherits from another station or from `CanvasViewCore`.

- `js/rendering/world-geometry.js` — rendering constants, geometry models and shared world helpers.
- `js/rendering/canvas-core.js` — `CanvasViewCore`, canvas setup, resize, shared transforms, quality and registry dispatch support.
- `js/rendering/map.js` — `CanvasView` registry and `MapStation` (MAP rendering and map interaction).
- `js/rendering/tactical.js` — `TacticalStation` (TAC station).
- `js/rendering/bridge-3d.js` — `BridgeStation` (BRIDGE station).
- `js/rendering/sound-room.js` — `SoundStation` (SOUND station).
- `js/rendering/periscope-3d.js` — `PeriscopeStation` (periscope world/sea/sky/ship rendering).
- `js/rendering/deck-gun-3d.js` — `DeckGunStation` (deck-gun 3D and shell/splash rendering).
- `js/rendering/optics.js` — pure horizon projection and optics mathematics shared by stations.
- `js/rendering/world-3d.js` — shared world, projection and vessel rendering module.
- `js/rendering/battle-atmosphere.js` — shared atmosphere, harbor and combat-visibility effects.
- `js/rendering/gyro-indicator.js` — gyro widget.
- `js/rendering/particles.js` — particle effects.

## Composition boundaries

`ctx` contains shared, stateless or infrastructural services: logging,
notifications, AAR recording, audio/effect emission and temporary compatibility
services. A function belongs on `ctx` when it does not represent a separate
domain system and is intentionally reusable by many systems.

`sys` contains system-to-system dependencies. A system belongs on `sys` when it
owns domain state or behavior, such as `sys.harbor`, `sys.damage`,
`sys.aaGun`, `sys.asw`, `sys.enemyAI`, `sys.mission` or `sys.aircraft`.
Dependencies are named explicitly; generic escape hatches are not used.

## Verification gates

The repository's fixed test command runs the following controls. A non-zero
result stops the test run and the patch is not accepted.

`node tests/run-all.mjs .` is the single command that runs all eight controls.

1. `generate-call-graph.mjs` mechanically regenerates the simulation call graph.
   A failure means the generated inventory is incomplete or inconsistent; stop and fix the generator or source shape.
2. `quality-gates.mjs` checks byte budgets, required system/station composition,
   forbidden layer accesses and the no-inheritance rule. A failure blocks the patch and identifies the violated boundary.
3. `behaviour.mjs` tests pure navigation, TDC, hull, optics and render-recovery behavior. A failure is a behavioral regression to isolate before delivery.
4. `boot-harness.mjs` loads the classic scripts, exercises a patrol and command
   paths, renders every station, and verifies audio, canvas and recovery state. Any exception or missing station render blocks delivery.
5. The ESLint global generator plus `no-undef` checks unresolved identifiers;
   generated globals are deliberately top-level only. A real unresolved identifier is repaired; the allowlist is not broadened to hide it.
6. `verify-call-graph.mjs` compares update/updateSub order with the immutable
   pre-Step-7 baseline `tests/call-graph-baseline-pre-step7.json`. A difference is investigated as a possible gameplay change. The baseline is updated only after explicit approval, never merely to make the test green.
7. `verify-call-targets.mjs` checks that system calls resolve to declared targets. A missing target requires an explicit dependency or caller repair.
8. `verify-render-call-targets.mjs` checks render callers and layout propagation. A failure means the complete render call chain must be repaired before delivery.

The render-call baseline is stored in `tests/render-call-graph-step7b-pre.json`.
The quality gate also forbids new `class ... extends ...` declarations anywhere
under `js/simulation/` or `js/rendering/`.

## Script model

The project intentionally remains a classic-script PWA without ES modules,
bundling or a build step. Script order in `index.html` is the dependency order,
the same files can be cached by the service worker, and page-global composition
keeps the offline deployment small and predictable on low-memory devices.

## Reference documents

- `docs/notify-inventory.md` — the inventory and classification of player-facing notification sources.
- `docs/command-ownership.md` — the command-to-owner map for the central command table.
- `docs/diagnose-clusters-a-b-c.md` — diagnostic findings for the parked navigation, toast and cinematic clusters.

### UI, controllers, persistence and boot

- `js/ui/briefing.js`, `scenario-selector.js`, `toast.js`, `dom-view.js`, `picker.js`, `helm-gauges.js` — UI concerns.
- `js/controllers/touch-controller.js`, `bridge-controller.js` — input/control routing. The browser UI deliberately has two shells: coarse-pointer/mobile devices use the touch shell, while a fine-pointer desktop browser uses the cockpit shell. Desktop command families are presentation-only tabs (`HELM`, `TDC`, `WEAPONS`), with navigation controls integrated into `HELM`; they must never duplicate or fork simulation commands. The canonical controls/IDs remain the same and are merely grouped for reachability. `TouchCtrl` is the single pointer-gesture owner for the shared canvas on mouse, pen and touch; never add a second desktop `click` path for MAP. `BridgeController` owns desktop keys and consults the global overlay guard before issuing commands. Wheel behavior is station-scoped: on MAP an ordinary two-finger trackpad gesture pans while Ctrl/pinch zooms with a dead zone; SCOPE horizontal trackpad movement trains the optic and vertical movement zooms; bridge, sound and gun retain their station-specific controls.
- `js/audio/audio-engine.js` — Web Audio behavior.
- `js/persistence/save-system.js`, `autosave.js` — five manual saves, one independent overwrite-style quick slot, autosave/resume and versioned portable player-profile backup/import.
- `js/tutorial/tutorial.js` — training patrol/tutorial flow.
- `js/core/game.js`, `game-loop.js` — game facade and frame/update loop.
- `js/bootstrap/wiring.js` — DOM event wiring and singleton composition.
- `js/pwa/version.js` — existing service-worker/version-reading client logic.
- `js/bootstrap/start.js` — final picker/gauge/loop start.

### Desktop/browser interaction invariants (P26)

- One primary station canvas is visible at a time. Command-family tabs change presentation only and cannot mutate or duplicate simulation truth.
- A physical pointer release produces at most one canvas action. Mouse and touch share the pointer router, including pointer capture and CSS-pixel-to-canvas conversion.
- Keyboard commands are ignored while a modal, custom picker, briefing or command sheet owns input. `Escape` closes exactly the highest visible layer, not every open layer.
- Time scale and event-driven transit remain permanently reachable in the desktop header; the bounded side columns may scroll without moving the station canvas or command rail.
- Desktop input hints are derived from the active station. Every station action exposed only as a gesture also has a button, key or wheel equivalent where applicable.
- Responsive layout selection may deliberately fall back to the touch shell when browser zoom leaves too few CSS pixels for the three-column cockpit. This changes presentation only; game state and commands are shared.

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

`MISSION_PRIMARY_TYPES` remains the small set of engine mechanics currently implemented. A campaign may expose only a subset through its mission profile. Missing mission data for a future campaign should fail explicitly rather than falling back to Pacific orders.

Concrete mission actors are campaign content as well. The `us-pacific` mission profile now owns the high-value intercept variants, Truk-specific reconnaissance contact IDs, fallback reconnaissance/escort/harbor vessels and the lifeguard survivor template. `mission-framework.js` may choose, place, track and score these objects, but it must not know Japanese vessel names or Pacific contact IDs. When a mission reassigns an existing vessel to a different tactical class, refresh `gameplayType`, `vesselProfileId` and `modelKey` together with legacy `type`; otherwise a visually promoted carrier/tanker can retain stale merchant identity from the source convoy contact.

### Campaign doctrine / air-force boundary

Campaign doctrine is authored content; tactical detection and pursuit remain shared mechanics. `US_PACIFIC_DOCTRINE_PROFILE` owns the current Pacific ASW area-risk table, escort-count/year/difficulty modifiers, screen-role policy, hostile Japanese aircraft roster and friendly Allied patrol roster/area exclusions. `asw-brain.js` may calculate and assign screen positions, but it must not know that Truk/Luzon are high-risk or Java is low-risk. `aircraft.js` may spawn, detect, attack, evade and move aircraft, but it must not contain Japanese/Allied aircraft names or Pacific area exclusions.

The profile is intentionally small and literal. Do not build a generic air-war database: a future Atlantic campaign only needs to author the doctrine values and aircraft roster required by its vertical slice. Historical war-progression multipliers such as `aswSkill` and `airThreatFactor` remain in the dated campaign historical model; doctrine supplies the force/content policy around those already-materialized factors.

### Theater special-operation boundary

Campaign-authored special operations are separate from their reusable mechanics. `US_PACIFIC_SPECIAL_OPERATIONS_PROFILE` owns the current Truk operation's area/port identity, harbor geometry, mine layout parameters, moored target roster, optional-objective identity, special radio signal and AAR event presentation. `harbor.js` owns only defended-harbor simulation; `radio-intel.js` copies the campaign-authored signal; MAP and AAR resolve the materialized operation/objective identity rather than testing for Truk-specific IDs.

Do not add a North Atlantic port by branching on area names inside `harbor.js`. A future campaign may omit a harbor special operation entirely or author one concrete operation when there is a gameplay use case. Keep the profile literal rather than growing a general scenario DSL. Existing Pacific saves are migrated additively by `ensureHarborIntel()` so their physical mine/target truth is not rerolled.

### Lazy patrol terrain

`PATROL_AREAS` is metadata. `getPatrolTerrain(areaKey)` expands only the selected coastline and keeps a one-area terrain cache; the bathymetry cache is invalidated when the selected area changes. This is deliberate for the Helios-class mobile performance target. Adding patrol areas must not reintroduce `terrain: buildTerrain(...)` in every `PATROL_AREAS` entry.

### TDC and torpedo physics

TDC solution geometry and torpedo launch physics share the settling-run distance, maximum gyro turn and turn rate. The solver evaluates the actual forward/aft tube bank and finite turn before the final intercept leg. UI/controller code consumes that result; it must not recompute a simplified straight-line solution. A `SWING BOAT` result is guidance, not a fireable high-quality solution.

### Mission-critical LOD persistence

The primary convoy/HVT may be materialised inside the tactical bubble and reduced to an abstract group outside it. The transition is a level-of-detail change, not a respawn: member identities, offsets, target designation and route progress must survive exactly. Critical routes use one-way/clamped progress so a target cannot reach the endpoint, reflect and appear to have crossed the map behind the player. Ambient traffic is allowed to use cheaper/repeating route behaviour because it is not a mission contract.

### Performance rule

Distant world = abstract, low-frequency and cheap. Local tactical world = full AI, collision, sensor and rendering work. New features should prefer data profiles and bounded local entities over new permanent animation loops or global per-frame passes. Friendly aircraft deliberately use this rule: at most a very small local presence and statistical offscreen interaction.

### Phase-1 runtime identity gate

Phase 1 ends with identity validation at the lifecycle/save boundary rather than
with permissive Pacific fallbacks. `createState()` validates the requested
theater/faction/campaign/submarine tuple and derives its bootstrap patrol area
from the campaign profile. `Game`, the initial briefing and the scenario
selector therefore do not name `Solomon Sea` themselves. `startNewPatrol()`
revalidates/materializes the active identity and chooses any omitted random
patrol only from that campaign's authored `patrolAreaIds`.

Legacy Pacific saves may omit the four additive identity IDs; `SaveSystem`
materializes those omissions once to the historical Pacific defaults, stamps
them into state, and then validates the result. Explicit unknown or mismatched
IDs are errors. `getCampaignProfile()` and `getSubmarineProfile()` must not
silently turn such IDs into `us-pacific` / `gato-silversides`. This fail-closed
rule is important when Atlantic profiles begin to exist: incomplete Atlantic
content must be obvious instead of producing plausible-looking Pacific leakage.

New career records also carry the four identity IDs plus an optional
`specialOperationId`. Campaign-authored special-operation commendations are
resolved from that identity; persistence code must not test for Truk by area
name.

The player submarine profile also owns the small propulsion/endurance parameter
set used by the existing lightweight physics. Those characteristics are copied
into `playerSub.propulsion.characteristics` at patrol/load boundaries so the hot
loop stays cheap. Generic physics must not assume Gato surface/submerged speeds,
fuel endurance, battery curve or diesel cutoff. Likewise, generic torpedo code
must not fall back to `mk14fast` or infer a Mark-14-specific square-impact
exploder penalty from a generic dud-rate threshold; such impact behavior is an
authored torpedo-spec trait.

### Portable profile / save compatibility boundary

The portable player-profile envelope is versioned separately from career records and from serialized patrol state. `SaveSystem._migrateProfile()` translates old envelope formats; `SaveSystem.STATE_SCHEMA_VERSION` plus `_migrateSnapshot()` is the compatibility boundary for manual saves, quick saves, autosaves and transferred live patrols. The quick slot has its own storage key and shares the normal snapshot/migration path rather than masquerading as manual slot six. Pre-Mega snapshots are schema 0 and are upgraded additively by the existing `ensure*` runtime shims. A future release that makes a destructive state change must add its migration in `_migrateSnapshot()` before increasing the schema version; an older build must reject a newer schema rather than guess. This separation is intentional: adding a future subsystem must not force every historical `.ppprofile.json` backup to mirror the newest in-memory schema.

A profile checksum is integrity metadata only. Because the complete game and client code are public, no symmetric key embedded in JavaScript can establish trusted scores: the key and verification path would be available to the player. Do not add obfuscated client secrets as an anti-cheat mechanism. If trusted competitive state is ever required, make the authoritative signature/validation service external to the open client.

## Why no ES-module conversion in this patch?

A conversion from one classic inline script to `type="module"` would change scope, timing and some browser-global semantics at the same time as the file split. That is avoidable risk for an architecture-only patch. The current structure already gives domain ownership and reliable patch targets while remaining a zero-build GitHub Pages app. If desired, ES modules can later be a separate, independently testable architecture patch.

## Production / Atlantic DEV build channels

The repository intentionally has one shared runtime and two deployment channels. The public build is served at the project root; the experimental Atlantic build is served below `/dev/`. Those paths are the same browser origin, so path separation alone does **not** isolate Web Storage or Cache Storage.

`js/core/utilities.js` therefore exposes `PP_BUILD`. Production preserves all historical storage keys unchanged; `/dev/` prefixes player/device keys with `ppdev_`. Never remove this namespace merely because the two builds have different manifest IDs: a manifest ID distinguishes installed apps, but it does not create a new browser origin or storage bucket.

Service-worker caches need the same separation. `sw.js` is maintained manually by the project owner and is deliberately not patched by normal ChatGPT ZIPs. The production and DEV workers must use distinct cache families and must never delete each other's caches. The production worker also needs to leave `/dev/` requests alone so the narrower `/dev/sw.js` registration owns that subtree once installed.

The nested same-origin deployment is an explicitly temporary development experiment, not an architectural promise. Separate manifest IDs and names help Chrome distinguish installs, but they do not create independent origins: site-data clearing/uninstall prompts, quotas, permissions and other origin-scoped browser state can still couple the two builds. Before DEV installation, export the production player profile. If the target Android devices do not keep the installs predictably distinct, move DEV to a separate origin (preferred) or at minimum a non-overlapping deployment path rather than adding browser/device hacks.

The build channel is a development convenience, not access control. Do not add hardware fingerprinting or treat `/dev/` as secret. Atlantic feature visibility may key from `PP_BUILD.isDev`, but all security assumptions must remain zero-trust because the complete client-side code is public.

Atlantic DEV also carries a human-facing `PP_BUILD.devPatch` number. This is deliberately separate from `sw.js`'s release/cache `VERSION` and from the commit SHA that the Pages workflow appends to the deployed DEV service worker. Bump `devPatch` in every numbered Atlantic patch. The version chip then shows `AD Pxx`, while tap/click diagnostics retain the full deployed `-ad-<sha>` token. This gives device feedback an unambiguous patch identity without asking the owner to edit `sw.js` for each development patch.


### Campaign radio-intelligence boundary

Routine radio copying and stale-position/dead-reckoning are shared mechanics;
the active campaign owns the presentation and mix of routine broadcasts.
`US_PACIFIC_RADIO_INTEL_PROFILE` therefore contains the current ULTRA, air,
lifeguard and weather wording plus the existing routine selection thresholds.
`radio-intel.js`, MAP and transit interruption resolve those labels through the
campaign profile. The internal `world.ultra`/`ULTRA` track naming remains a
Phase-1 compatibility detail for existing state and UI styling; new theater
code must not depend on that internal name for player-facing terminology.

Intercept planning must also take the boat's authored propulsion characteristics
rather than a US-fleet-boat constant. The Silversides profile preserves the
existing 17.5-knot effective flank intercept assumption separately from its
18-knot maximum surface speed. A future submarine profile must author its own
value or deliberately use its maximum surface speed.

### Phase-1 completion gate

Phase 1 is complete when the Pacific build passes the deterministic regression
suite with explicit runtime identity, campaign-authored sensors/equipment,
vessel identity, convoy/ambient traffic, missions and targets, special
operations, doctrine/aircraft, radio presentation, and submarine propulsion
behind profile boundaries. Remaining Pacific names inside Pacific data,
historical scenarios/tutorial copy, comments, or explicit legacy save aliases
are not engine dependencies and should not be abstracted merely for cosmetic
purity. The next theater should add only the concrete data/mechanics required by
the Type VII vertical slice; if that work exposes a genuinely shared missing
contract, add it then with a Pacific regression gate rather than pre-building a
generic framework.

### Phase-2 patch 11 — Atlantic / Type VIIC bootstrap boundary

Phase 2 begins with an intentionally non-playable Atlantic foundation rather
than a copied Pacific scenario. `ATLANTIC_1941_GAME_IDENTITY` selects the
`german-atlantic-1941` campaign and `type-viic-1941` submarine profile for
deterministic development tests, but the normal Pacific scenario selector only
renders patrol areas authored by its active campaign. Do not expose the
Atlantic campaign as a normal patrol until it has its own convoy, mission,
doctrine/escort and return-loop content.

The first Atlantic slice is anchored to late 1941. The Type VIIC profile uses
contemporary German handbook / Allied examination data for the dimensions,
submerged displacement used by the collision model, five-tube arrangement,
maximum fourteen-torpedo load, 8.8 cm / 2 cm ammunition and broad maximum
speeds. G7e T2 and G7a T1 fast-setting specifications are likewise authored as
separate torpedo specs. The current reserve magazine remains the game's cheap
undifferentiated reload pool; modelling historically exact mixed rack loads is
not a prerequisite for this bootstrap patch.

Historical-source confidence must remain visible in data comments. In
particular, the German Type VIIC handbook gives a 100 m construction depth and
105 m pressure-dock test but does not provide one universal operational/collapse
limit in the referenced table. The engine nevertheless requires a finite
failure boundary, so the Type VIIC `crushDepthFeet` is explicitly tagged
`crushDepthProvisional:true`. It must not be presented as an exact historical
collapse depth until a stronger source and gameplay decision exist. The
lightweight fuel/battery response coefficients are also provisional gameplay
calibration; profile ownership is proven now, exact endurance calibration comes
with the playable vertical slice.

The 1941 boat has only authored passive GHG hydrophones at this stage. Generic
sensor UI/controller code must treat missing capabilities as genuinely absent:
no fallback Active Echo or surface-radar control may appear, and the engine
must reject an active-echo command if no such set is fitted. Likewise, helm,
engine-command and machinery-audio RPM scaling must read the materialized
submarine propulsion characteristics rather than retaining Gato's 450-rpm
normalization in a UI/audio side path.

`North Atlantic Convoy Lanes` is deliberately an open-ocean bootstrap area with
`terrainKey:null`. `createState()` therefore materializes an empty terrain list
instead of asking the Pacific terrain provider to invent an unknown map. Real
Atlantic coastline/port geography should be added only when a concrete vertical
slice needs it, preserving the one-selected-area / low-memory terrain rule.


### Phase-2 patch 12 — first Atlantic convoy world slice

The `german-atlantic-1941` campaign now owns its first mission-critical surface
world content: a representative late-1941 Allied convoy plus a deliberately
minimal close-escort doctrine. This is not a named HX/SC convoy reconstruction.
The engine should be able to prove non-Pacific materialization before the game
spends complexity on exact sailing manifests, national merchant mixes, named
escort groups or Atlantic ambient traffic.

`GERMAN_ATLANTIC_1941_PRIMARY_CONVOY_PROFILE` owns nine merchant/tanker slots
and three Flower-class escort identities. Merchant size/tonnage mix is authored
gameplay data within plausible wartime bands, not a claim that one historical
convoy contained those exact hulls. Contemporary U-boat KTBs support the
existing 7–9 knot area speed band, with 8 knots repeatedly appearing in convoy
plots. Flower corvettes are a historically appropriate Atlantic close-escort
class, but the first slice reuses the existing low-cost `PATROL_CRAFT` render
mesh. `vesselProfileId='uk-flower-corvette-1941'` is the historical/gameplay
identity; `modelKey='PATROL_CRAFT'` is only a temporary rendering choice and
must not be confused with a finished Flower-class 3-D model.

The campaign also authors `GERMAN_ATLANTIC_1941_DOCTRINE_PROFILE`. Its one-to-
three-escort screen is intentionally representative gameplay doctrine rather
than a universal claim about every September 1941 escort group. It is enough to
exercise the existing ASW role/state machine without importing Japanese area
risk or Pacific aircraft. Aircraft remain absent from this first Atlantic
slice; they should be added only with a dated Atlantic air doctrine.

The traffic director still requires explicit campaign ownership, so Atlantic
has an authored zero-density ambient profile. This is intentional. A zero
profile is preferable to either a Pacific fallback or invented background
shipping: patch 12 proves the mission-critical convoy can pass tactical →
abstract → tactical LOD while preserving British vessel identity. Ambient
freighters, independents, stragglers and other U-boats can be introduced later
when they support concrete Atlantic gameplay.


### Phase-2 patch 13 — Atlantic contact-keeper loop

The first playable Atlantic loop is deliberately narrower than a full wolfpack
simulation. `GERMAN_ATLANTIC_1941_MISSION_PROFILE` makes CONTACT KEEPER the sole
late-1941 mission: find the assigned convoy, build a sufficiently reliable
course/speed track, hold a safe shadowing band, then come to the surface/antenna
depth long enough to transmit a contact report to B.d.U. The Pacific
`SHADOW_REPORT` path keeps its previous timings and completion behavior when no
`CONTACT_KEEPER` content is authored.

Other U-boats are event/state only at this stage. A completed report creates one
small `world.cooperativeSubmarines` record with a deterministic count and ETA;
it does not spawn tactical submarine contacts, run extra AI, or consume the
simulation budget on boats the player cannot currently interact with. A later
attack/wolfpack patch may consume that state if it creates a concrete gameplay
benefit.

Atlantic now owns a B.d.U. radio-intelligence presentation profile. The shared
radio room still receives, copies and dead-reckons stale shipping fixes using
its existing cheap mechanics, but player-facing text no longer inherits ULTRA.
The internal `world.ultra` key remains a legacy implementation detail only.
Optional radio categories are truly optional: a campaign without an authored
air/lifeguard broadcast falls through to its weather copy rather than borrowing
Pacific content.

The Atlantic DEV scenario selector may switch campaign identity only on the DEV
build. `NEW_PATROL` therefore accepts an explicitly validated `gameIdentity` at
the patrol lifecycle boundary. Switching submarines does not carry an old
boat's torpedo spec across factions, terrain-less open ocean stays terrain-less,
and air-warning state is rebuilt from the selected submarine profile. Historical
scenario launches explicitly return to the default Pacific identity so a user
cannot strand a Pacific scenario inside the Atlantic campaign by switching tabs.


### Phase-2 patch 14 — B.d.U. attack order and night surface approach

CONTACT KEEPER no longer ends when the outbound movement report is transmitted.
For the Atlantic 1941 profile only, the report schedules one campaign-authored
priority B.d.U. reply through the existing radio receiver. The order is not
telepathic mission state: it becomes player knowledge only after the normal
antenna-depth / 40-second copy path has received it. `world.radio.priority` is a
lazy mission queue and is absent from untouched Pacific state.

The player must then preserve contact until darkness and gain a surfaced attack
position ahead of the convoy. This is deliberately a gameplay abstraction of
late-1941 night surface doctrine, not an exact reconstruction of a single
historical attack drill. Contemporary KTBs show contact keepers operating at the
limit of visibility, B.d.U. issuing approach/initiation orders, commanders
waiting for sufficient darkness, and night brightness/moonlight affecting the
attack decision. The German commander's handbook likewise treats the night
surface attack as a positioning/course problem forward of the target's beam.
The profile therefore authors broad tuning thresholds (daylight, depth, range,
forward/lateral geometry and a short hold time); none should be presented as a
literal Kriegsmarine regulation distance.

The mission framework only verifies campaign-authored approach geometry and
whether the existing enemy state has firm contact. It does not add a second
stealth/detection model. Weather, moon, visual range, escort lookouts and enemy
knowledge remain owned by the existing shared world/AI systems. When the
position is held long enough the mission marks `attackPositionReady` but remains
ACTIVE: torpedo attack, escort reaction and withdrawal are intentionally left
for the next vertical-slice step rather than declaring victory before a weapon
is fired.

Patch-13 saves that completed CONTACT KEEPER at report transmission are migrated
narrowly on first mission-framework ensure: if the patrol has not already been
completed at port, the mission is reopened with the new `release` and `approach`
objectives. Any reward already credited by patch 13 is retained and flagged so
it cannot be awarded twice. New patch-14 patrols do not complete or credit the
mission at report transmission.

### Phase-2 patch 15 — convoy attack, escort reaction and withdrawal

CONTACT KEEPER v3 now carries the first Atlantic loop through the player's own
attack and escape. An attack objective is satisfied only by a torpedo launched
after the night attack position was earned and directed at the main convoy (or,
for manual TDC, by a geometrically plausible shot from close to the convoy).
The mission does not require a hit: tactical consequences and survival remain
interesting after a miss or dud, and ship damage continues to belong to the
shared weapons/damage systems.

Crucially, mission code does not alert the escorts. `fireTorpedo()`, merchant
lookouts, torpedo wakes, hits/duds and the existing local information relay
continue to decide what the convoy can plausibly know. CONTACT KEEPER merely
observes that shared enemy state. A quiet electric-torpedo attack may therefore
start its withdrawal before an escort has a firm datum; an observed attack may
instead trigger the existing search/prosecution system.

Evasion deliberately permits both historically plausible tactical outcomes:
breaking an actual firm escort contact after diving, or using darkness/surface
speed to open the inner screen when no firm contact was ever obtained. The
campaign authors only broad gameplay thresholds for quiet hold and withdrawal
range. Once firm contact is broken and the boat remains at least six nautical
miles from the convoy core for the authored hold time, the primary mission is
complete and the normal return-to-base lifecycle resumes. This is a mission
state layer only; it adds no duplicate ASDIC, visibility or escort AI.

Patch-14 CONTACT KEEPER saves migrate additively to v3 by gaining `attack`,
`evade` and `withdraw` objectives. Completed report/order/approach state is
retained, and no prior reward is reissued.


## Atlantic DEV patch 17 — North Atlantic environment

The 1941 Atlantic slice now owns a concrete `NORTH_ATLANTIC_1941` climate identity and `NORTH_ATLANTIC` visual tone. Weather keeps a persistent low-overcast background between broader, longer-lived frontal cells rather than collapsing to the Pacific clear-sky baseline after weather initialization. The shared renderer uses the same row/particle budget but selects a colder sky/sea palette, stronger horizon haze and longer swell only for that visual tone. Pacific weather/rendering stays on the existing branch. Bridge motion speed normalization also reads the materialized submarine surface-speed characteristic instead of assuming an 18-knot Gato.


## Atlantic DEV patch 18 — vessel visual pass

Atlantic vessel identity now reaches dedicated shared-renderer model keys. The Flower-class escort, freighter/tramp/cargo-liner/coaster/tanker variants and Type VIIC ownship casing no longer borrow Pacific patrol-craft/Gato silhouettes. These are recognition-grade Canvas2D vector models, deliberately not museum meshes; all damage, sinking, wake and LOD mechanics remain shared. The Type VIIC forward deck-gun mount and visible casing proportions are selected from the submarine profile's `visualModelKey`, while Pacific keeps the existing fleet-boat deck path.

## Atlantic DEV patch 19 — campaign picker UI regression

The DEV-only theater/campaign `<select>` is created while `ScenarioSelector` is
constructed, before `picker.js` has loaded.  The per-render enhancement therefore
cannot wrap that first instance, while the older PRIMARY MISSION select is repaired
later by `Picker.enhanceAll()` in bootstrap.  Android consequently opened its native
system selector for THEATER / CAMPAIGN.

Patch 19 adds `campaignProfileSelect` to that bootstrap enhancement pass and gives
it the same explicit in-app picker footprint as PRIMARY MISSION.  Subsequent
`renderCards()` calls continue to enhance newly-created instances directly.  This
is a DEV UI regression fix only; no campaign, simulation or production behavior is
changed.

## Atlantic DEV patch 20 — living convoy columns

The first world-building pass deliberately reuses the existing shared convoy,
damage, tactical-LOD and escort-role systems.  The Atlantic primary-convoy
profile now authors a readable three-column merchant body plus bounded station
jitter, individual station-keeping quality and a possible slow after-column
straggler.  These values are materialized once when the patrol is created, so
the simulation hot loop performs no random generation and saves reproduce the
same convoy character.

Healthy ships correct toward imperfect personal stations instead of converging
on mathematically exact points.  A natural straggler follows the convoy route at
its own sustainable pace, while damaged merchants continue to become stragglers
through the existing propulsion/flotation/fire rules.  The existing ASW role
allocator may leave one escort with a qualifying straggler when enough escorts
remain; it does not duplicate escort AI or reveal player position.  Pacific
profiles do not author these dynamics and therefore retain their prior behavior.

## Atlantic DEV patch 21 — abstract wolfpack effects

The CONTACT KEEPER support record can now produce a bounded one-or-two-event
attack sequence after B.d.U. release.  Supporting boats remain abstract: no
submarine contact, physics body, sensor loop or tactical AI is spawned.  When
the primary convoy is inside the tactical bubble, an event can damage (but not
sink or credit) one merchant, turn it into a real straggler, create a visible
blast and divert the nearest available escort to a local remote-alarm search.

That detached escort steers only from the other boat's attack position.  It
does not write or consume player `enemy.solution`, does not join
`alertedEscortIds`, and therefore gains no telepathic knowledge of ownship.  A
later direct observation or convoy relay about the player's attack takes
priority normally.  If the player did not have a useful plot or proximity to
the event, only generic B.d.U. group traffic is logged rather than revealing an
exact target position.

## Atlantic DEV patch 22 — air gap and radio bearings

The historical model now continues through 1944 instead of freezing every
career patrol in the September-1941 force balance.  Aircraft, escort skill,
surface opportunity, merchant density and HF/DF risk change in authored date
bands; the improved straight-running G7e T3 becomes available in 1942.  The
existing career calendar and refit message path expose these changes without an
XP tree.

Coastal Command patrols use the shared aircraft AI with an Atlantic roster.
Their spawn chance is multiplied by a cheap position/date coverage profile: a
broad central air gap is very quiet in 1941, then progressively closes through
1943–44.  This is pressure, not omniscience; actual detection still uses local
daylight, weather, sea state, surface trace and aircraft geometry.

The campaign's required contact transmission now carries a date-dependent
HF/DF risk.  When triggered, escorts within plausible relay range receive only
a deliberately broad `RADIO_BEARING` cue.  The cue error is much larger than a
weapon/visual datum and no escort outside the local communication boundary is
magically alerted.  Pacific missions never author this exposure.

## Atlantic DEV patch 23 — campaign breadth

The Atlantic career now exposes three terrain-less open-ocean patrol areas:
the mid-ocean convoy lanes, the air-threatened Western Approaches and the cold
Greenland–Iceland route. They deliberately share no invented coastline; route
geometry, weather, air pressure, start/return points and difficulty create
different operational problems inside the existing single-area memory budget.

AUTO orders are no longer CONTACT KEEPER every patrol. Campaign-authored area
and era pools select contact-keeper/wolfpack work, direct convoy attacks or a
front-line weather ambush. All three reuse proven mission mechanics with
Atlantic wording. The late-war escort table can add a fourth Town-class
destroyer to the Flower screen.

Ambient Atlantic traffic is a bounded three-to-seven abstract groups:
independents, tankers, slow unescorted stragglers and occasional small convoys.
The traffic director materializes only the nearest groups, preserves their
Atlantic vessel/model identity and reduces them again outside the tactical
bubble. This adds horizon uncertainty without a full-ocean entity cost.

## Atlantic DEV patch 24 — shared combat feedback

The shared MAIN-FIRST backlog is forward-ported without changing Atlantic's
theater-specific sensor names or AI paths. Torpedo miss coaching now follows
only the intended TDC target; a fresh, noisy active-echo cue can replace an
older enemy plot without exposing exact ownship position. Active transmission
uses a red two-step confirmation and a short directional wave in SOUND.

Weapon refusals state the corrective action. The general alarm is an irregular
mechanical klaxon, depth-charge water entry has separate slap/body/bubble
layers, and burst loudness uses actual horizontal-plus-depth slant distance
rather than damage. AAR merchant side profiles place the superstructure aft.

## Atlantic DEV patch 25 — 4 GB tablet guardrails

The Helio G88 / 4 GB device class remains an explicit render target. Existing
adaptive frame quality, a 1.5 DPR ceiling, a 2.2-megapixel canvas budget, lazy
terrain, three tactical traffic groups and capped battle-atmosphere lists are
retained. The general particle system now also has hard 420-particle and
120-spark ceilings, preventing simultaneous convoy wakes, gunfire and depth
charges from creating an unbounded transient render list.

## Atlantic DEV patch 35 — future campaign gates

`THEATER_FAMILIES`, `THEATER_PROFILES` and `REGION_PROFILES` separate
presentation grouping from geography. The Baltic Sea has one canonical region
under the European family and is neither Pacific nor Atlantic terrain. The
Norwegian Arctic remains an Atlantic-presented region. Future Japanese,
British, Soviet, German, Mediterranean and Indian Ocean slices live only in
`FUTURE_VERTICAL_SLICE_BLUEPRINTS`; these reference records are never scenario
options and do not import their proposed campaign modules.

A campaign may become DEV-selectable only when `verticalSliceReadiness()`
passes the complete `VERTICAL_SLICE_REQUIREMENTS` contract: identity, boat and
station presentation, dated equipment, rosters, air/ASW doctrine, geography,
at least three missions, terminology, tutorials, AAR, persistence and
performance acceptance. `getSelectableCampaignProfiles()` is the sole selector
source, so a partial catalog entry fails closed instead of exposing an empty
campaign.

`CAMPAIGN_LOAD_BOUNDARIES` records a one-active-area terrain budget for every
playable campaign. Terrain continues through `getPatrolTerrain(areaKey)`, whose
one-entry cache evicts the previous large chart. Planned module names are only
ownership boundaries: they must not enter `index.html`, `sw.js` or the offline
shell until a complete vertical slice is implemented.

## Atlantic DEV patch 36 — release-candidate acceptance

The cumulative candidate is gated by syntax and assetgraph checks, the full
P27–P35 targeted regression set, a 24-run Atlantic matrix (three areas, 1941–44,
NORMAL/HARD, 600 simulated seconds each) and a separate 7,200-second heavy
scene. That scene requires four escorts, three tactical ambient groups and an
aircraft while driving battle-atmosphere lists to their hard ceilings. It also
round-trips patrol start, mid-mission, attack/cinematic, damage and return/AAR
states. Browser/device interaction remains a physical acceptance gate; the VM
stress result is not presented as a measured device frame rate.
