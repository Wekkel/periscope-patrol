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
| `CoreSystem` | `sys.career`, `sys.collision`, `sys.damage`, `sys.deckGun`, `sys.enemyAI`, `sys.harbor`, `sys.intel`, `sys.soundRadar`, `sys.torpedoes`, `sys.weather` |
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
- `js/simulation/sensors.js` — lookout, visual/acoustic contact tracking and signatures. Electronic contact fixes use generic `ACTIVE_ECHO` / `SURFACE_RADAR` IDs; schema-v4 migration converts legacy `QC ECHO` / `SJ RADAR` values once at load.
- `js/simulation/sound-radar.js` — passive-sound/active-echo/surface-radar operation. It maps historical fit data onto generic runtime capability fields; serialized `sd*`/`sj*` aliases are converted by schema-v4 migration.
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

New code should prefer `historicalProfile.sensorCapabilities[CAPABILITY_ID]` and `availableTorpedoes`. Schema-v4 migration converts serialized radar aliases (`sdAvailable`, `sjAvailable`, `sjRangeNm`, `sjErrorFactor`, `sjSweepSec`, `sjRadarDepthFt`) to equipment-neutral runtime names before simulation begins. A future Atlantic campaign must author its own historical model in the catalog; do not add Type VII, Kriegsmarine or Allied date exceptions to `historical-campaign.js`.

Legacy serialized track sources `SJ RADAR` and `QC ECHO` are converted by schema-v4 migration; simulation code uses only `SURFACE_RADAR` and `ACTIVE_ECHO`.

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

The portable player-profile envelope is versioned separately from career records and from serialized patrol state. `SaveSystem._migrateProfile()` translates old envelope formats; `SaveSystem.STATE_SCHEMA_VERSION` plus `_migrateSnapshot()` is the compatibility boundary for manual saves, quick saves, autosaves and transferred live patrols. The quick slot has its own storage key and shares the normal snapshot/migration path rather than masquerading as manual slot six. Pre-Mega snapshots are schema 0 and are upgraded additively by versioned migration steps, including schema v4 legacy-name normalization. A future release that makes a destructive state change must add its migration in `_migrateSnapshot()` before increasing the schema version; an older build must reject a newer schema rather than guess. This separation is intentional: adding a future subsystem must not force every historical `.ppprofile.json` backup to mirror the newest in-memory schema.

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

### Phase-2 patches 11–36 — Atlantic Foundation, Expansion & Acceptance (Summary)

The Atlantic theater introduces the Type VIIC profile (`german-atlantic-1941`) with historical displacement, five-tube configuration, G7e/G7a torpedo specifications, and passive GHG hydrophone modeling. Open-ocean convoy operations (`North Atlantic Convoy Lanes`, `Western Approaches`, `Greenland–Iceland Gap`) operate under the single-area memory boundary.

- **Convoy & Shadowing (P11–21)**: Three-column convoy formations, stragglers, and the `CONTACT_KEEPER` v3 loop covering detection, B.d.U. reporting, night surface approach, and cooperative U-boat simulation (`world.cooperativeSubmarines`).
- **Air Gap & Radio Bearings (P22)**: Historical date bands through 1944; progressive air gap closure; date-dependent HF/DF risk generating broad `RADIO_BEARING` cues for nearby escorts.
- **Campaign Breadth (P23)**: Three open-ocean patrol areas, diversified AUTO mission pools (contact-keeper, direct attack, weather ambush), and bounded ambient shipping materialization.
- **Combat Feedback (P24)**: Target-specific TDC miss coaching, active-echo cue replacement, two-step sound transmission, mechanical klaxon alarm, and horizontal-plus-depth slant burst loudness.
- **Hardware Guardrails (P25)**: Helio G88 / 4 GB tablet performance compliance (1.5 DPR ceiling, 2.2 MP canvas budget, lazy terrain, 420 particle / 120 spark caps).
- **Future Campaign Gates (P35)**: Canonical theater family separation, strict `verticalSliceReadiness()` requirements contract, and single-active-area terrain cache eviction.
- **Release Acceptance (P36)**: 24-run regression matrix, 7,200s heavy scene stress validation, and complete save/load lifecycle round-tripping.
