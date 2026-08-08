# Phase 4 test report

All tests below were actually executed against the Phase-4 build.

## Runtime / path checks

- JavaScript syntax: PASS — 49 runtime `.js` files.
- `index.html` script paths: PASS — 49 script references, 0 missing files.
- `career-history.js` dependency position: PASS — after `damage-control.js`, before final `physics-navigation.js`.
- Career and Captain's Log UI wiring: PASS.

## Career migration

Legacy input:

`{ totalScore: 12345, patrols: 4, tonnage: 28750 }`

Result:

- schema version: 2
- total score: 12,345
- total tonnage: 28,750
- legacy patrol count: 4
- fabricated patrol-history rows: 0
- `First War Patrol` preserved/inferred from the fact that four legacy patrols existed

A pre-Phase-4 full patrol state with all new career fields removed was instantiated in the current simulation and survived `update(0)` without error. It received deterministic legacy history id `legacy:1:Solomon Sea:1:1943-08-17` and an empty Captain's Log.

## Completed patrol / source-of-truth statistics

A controlled patrol executed:

- 1 real torpedo launch from a READY tube;
- 4 real calls to `fireDeckGun()`;
- 4 real deck-gun hit registrations through `damageShipByDeckGun()`;
- 1 tanker actually sunk;
- 3 escorts damaged but left afloat;
- return to Tulagi through `completeMission()`.

Measured before finalization:

- deck-gun shots: 4
- deck-gun hits: 4
- deck-gun ammunition: 120 → 116
- torpedo launch sequence: `nextTorpedoId` 1 → 2
- active torpedoes: 1

Persisted debrief:

- deck-gun rounds: 4
- deck-gun hits: 4
- torpedoes fired: 1
- ships sunk: 1
- tonnage: 6,200
- ships damaged: 3
- hull at return: 74%
- Captain's Log contained `CONVOY_SIGHTED`, `SHIP_SUNK`, `RETURNED_TO_PORT`.

A second finalization of the same patrol left history at exactly 1 row and totals at exactly 6,200 tons / 1 ship.

After finalization, the active state was deliberately corrupted to 99 deck-gun shots, 999,999 tons and a fake log entry. The stored record remained 4 rounds / 6,200 tons and did not acquire the fake event. PASS.

## Lost patrol / continuity / reload

- Starting the next patrol left history at 1 row. PASS.
- The second patrol was then set to `LOST` and `update(0)` was called twice. Career history ended with exactly two rows: `COMPLETED`, `LOST`. PASS.
- The lost record contained `BOAT_LOST`. PASS.
- A completely fresh JavaScript VM context was then created with the same `localStorage` backing data. It read both records, 6,200 total tons and 1 total ship. PASS. This is the persistence/reload-equivalent test; it is not claimed as a successful real Chromium browser reload.

## Additional Captain's Log hooks

Executed gameplay hooks produced:

- `HEAVY_UNIT_IDENTIFIED`
- `MINE_STRUCK`
- `DEPTH_CHARGE_ATTACK_SURVIVED`

PASS.

## Commendations

A separate persistent-career test reached the relevant historical facts and produced exactly:

- `first-war-patrol`
- `50000-tons`
- `truk-penetration`
- `critical-hull-return`

PASS. No gameplay modifiers are attached to these badges.

## Regression contracts

Re-run after Phase 4:

- Phase 0 baseline/regression: PASS.
- Phase 1 vessel collision: PASS.
- Phase 2 Truk optional harbor raid/fog of war: PASS.
- Phase 3 subsystem damage/damage control: PASS.
- Phase 4 career history: PASS.

The raw outputs are included alongside this report as `PHASE_0_REGRESSION_OUTPUT.txt` through `PHASE_4_TEST_OUTPUT.txt`.

## Browser smoke-test limitation

A direct Chromium `file://` smoke attempt was made in the execution environment. Chromium did not finish within the timeout and produced only environment/DBus errors. It is therefore explicitly NOT counted as a passed browser smoke test. Browser-facing behavior is covered here by state/simulation/persistence/UI VM harnesses plus the retained Phase 0–3 regression contracts.
