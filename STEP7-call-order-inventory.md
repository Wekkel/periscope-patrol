# STAP 7 — SimEngine call-order and dependency inventory

This is a pre-refactor reference for the current Atlantic-dev source. No production code was changed to create this document.

## `SimEngine.update(dt)` order

The public `SimEngine` is the final class in `js/simulation/physics-navigation.js`; its inherited `update` implementation is defined in `js/simulation/engine-core.js` (`SimEngineCore.update`). The ordered calls are:

1. `ensureTacticalExtensions()` — `SimEngineCore`
2. `ensureWorldExtensions()` — `SimEngineWeather`
3. `ensurePatrolRuntimeContext()` — `SimEngineCore`
4. `ensureCareerPatrolState()` — `SimEngineCareer`
5. `ensureHistoricalCampaignProfile()` — `SimEngineCore`
6. `ensureMissionFramework()` — `SimEngineMission`
7. `processCommands()` — `SimEngineCore`
8. `finalizePatrol('LOST', …)` / `offerLossAar()` when mission status is LOST — `SimEngineCareer` / `SimEngineCore`
9. `compressedCollisionWatch()` — `SimEngineCollision`
10. `updateSub(sdt)` for each fixed slice — `SimEngine`
11. `transitInterrupt()` where transit is active — `SimEngine`
12. `finalizePatrol('LOST', …)` / `offerLossAar()` after the slice loop — `SimEngineCareer` / `SimEngineCore`

Within `updateSub`, the current order is the critical second-level sequence:

1. navigation/propulsion integration; 2. collision and grounding checks; 3. sensors and contact aging; 4. aircraft and escort updates; 5. weapon/torpedo progression; 6. weather/atmosphere; 7. mission/career bookkeeping; 8. elapsed-time and campaign-date advancement.

The exact method body and inherited dispatch remain the source of truth while each leaf is moved. This list is intentionally not a substitute for preserving the method body order.

## Shared services used by multiple layers

- `log()` — writes the patrol log and is called by simulation, weapons, AI, transit and mission code.
- `notify()` — `log()` plus the simulation toast-intent queue.
- `ensureTacticalExtensions()`, `ensureWorldExtensions()`, `ensurePatrolRuntimeContext()`, `ensureHistoricalCampaignProfile()` — called by bootstrap, update, command handling and patrol creation.
- `makeConvoy()` — patrol creation and training/setup paths.
- `planNavigableCourse()` — navigation commands, waypoint/autopilot and mission setup.
- `transitInterrupt()` / `canUseOpenSeaTransitStep()` — GameLoop transit service and simulation navigation.
- `finalizePatrol()`, `offerLossAar()` — loss/completion paths and persistence/AAR flow.
- `PresentationBridge.*` — simulation-to-UI effects; no direct DOM/audio dependency belongs in leaf systems.

## Lower-to-higher calls requiring explicit context

- Weapon and collision systems call `log()`, `notify()`, damage helpers and AAR/event helpers defined by higher inherited layers.
- AI/escort and aircraft systems call sensor/contact helpers and `log()` from shared/core layers.
- Harbor/weather/sound-radar systems call shared geometry, contact and notification helpers.
- Career and mission systems call persistence/AAR intent helpers through `PresentationBridge`, not UI objects.

These are the first dependency edges to make explicit in the corresponding `ctx` object. No leaf extraction should proceed until its direct `this.*` reads/writes are listed and its callers are updated.

## Known incomplete granularity

The current source uses inherited dispatch and several helper methods whose implementations are distributed across files. Before each of the six implementation trios, generate a function-level call graph from the exact current source and attach it to that trio's report. Do not infer correctness from file-level presence.
