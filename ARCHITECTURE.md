# Architecture after refactor

## Design constraints

- Browser-first, no framework, no bundler and no transpilation.
- Classic external `<script>` files are intentionally used instead of converting everything to ES modules. This preserves the original page-global bindings and minimizes behavior changes in a pure refactor.
- Dependency direction is represented by the order of script tags in `index.html`. There are no `import`/`export` statements, therefore there are no JavaScript import cycles.
- Large subsystems are split only at domain boundaries. Methods were not rewritten merely to achieve smaller files.
- Existing save/load code was transferred unchanged apart from a section-heading comment.

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
- `js/data/torpedo-data.js` — torpedo specs/dud modes and related static data.
- `js/data/campaign-data.js` — coastlines, terrain and patrol-area definitions.
- `js/navigation/route-geometry.js` — water-route/polyline geometry.
- `js/simulation/weapons/tdc-math.js` — TDC/intercept/range calculations.
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
- `js/persistence/save-system.js`, `autosave.js` — manual saves and autosave/resume.
- `js/tutorial/tutorial.js` — training patrol/tutorial flow.
- `js/core/game.js`, `game-loop.js` — game facade and frame/update loop.
- `js/bootstrap/wiring.js` — DOM event wiring and singleton composition.
- `js/pwa/version.js` — existing service-worker/version-reading client logic.
- `js/bootstrap/start.js` — final picker/gauge/loop start.

## Why no ES-module conversion in this patch?

A conversion from one classic inline script to `type="module"` would change scope, timing and some browser-global semantics at the same time as the file split. That is avoidable risk for an architecture-only patch. The current structure already gives domain ownership and reliable patch targets while remaining a zero-build GitHub Pages app. If desired, ES modules can later be a separate, independently testable architecture patch.
