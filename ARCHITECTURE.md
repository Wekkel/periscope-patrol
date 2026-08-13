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
- `js/data/game-catalog.js` — explicit theater/faction/campaign/submarine identity profiles, additive surface-vessel identity profiles, mission-critical convoy composition, campaign doctrine/aircraft rosters and boat-specific sensor presentation. Runtime vessel contacts now separate `gameplayType`, `factionId`, `vesselProfileId` and `modelKey`; legacy `type` remains a compatibility alias while older saves are normalized on load.
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
