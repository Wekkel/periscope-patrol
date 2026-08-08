# Phase 2 test report

All reported PASS results below were actually executed against the reconstructed current build. The raw console output is included as `PHASE_2_TEST_OUTPUT.txt`.

## Regression contract

- 47 runtime JavaScript files passed syntax checking.
- Phase 0 regression passed: patrol start, new-patrol map recenter, MAP, periscope, time compression, save/load, torpedo flood/fire and deck-gun auto-man/fire.
- Phase 1 collision regression passed: shared hull geometry, avoidance, physical collisions, deep-sub vertical clearance, high-speed swept contact, collision-risk time-compression interrupt, and no phantom collisions in normal convoy formation.

## Phase 2 state + simulation + UI acceptance

- New Truk patrol: physical harbor present, H-04 present, 30 physical mines present, optional objectives = 0; mine/channel knowledge `NONE`, net unknown, heavy identity unknown.
- Special-intelligence broadcast pending/not copied: optional objectives remained 0.
- After the existing 40-second copy path: optional objective count became 1 with `Investigate Truk Anchorage`; minefield/channel became `REPORTED`; net remained unknown.
- Reported map output contained `REPORTED MINEFIELDS` and `REPORTED SWEPT CHANNEL`, with no net-gate label.
- Approach observation upgraded minefield/channel to `OBSERVED` while leaving the net hidden.
- Close visual/contact reconnaissance revealed `OBSERVED TORPEDO NET`.
- Real contact tracking visually identified H-04; in the recorded run it was a HEAVY CRUISER at confidence 0.84 and the objective became `Heavy cruiser identified at Truk Anchorage`.
- UI mission HTML rendered `◇ OPTIONAL — Heavy cruiser identified at Truk Anchorage`.
- Save/load preserved heavy-unit identity and the optional objective.
- A real deck-gun damage calculation produced about 8% accumulated gun damage and changed the optional raid result to `damaged`.
- Marking H-04 sunk changed the raid result to `sunk`, `done=true`, `failed=false`.
- Completing a patrol without attempting the raid left result `not_attempted`, `failed=false`, while the required mission completed normally.
- Entering and then leaving the raid without a result recorded `abandoned`, never failure.
- Inactive searchlight: zero searchlight map drawing operations; active real sweep: nine drawing operations.
- Strong acoustic-only H-04 track reached confidence 1.0 but remained `SURFACE SHIP`; exact carrier/cruiser identity stayed unknown.
- Physical truth vs knowledge: the unknown physical net still registered a hit; an unknown physical mine still triggered and damaged the submarine (100% hull to ~42.65% in that seeded/run sample).
- A coastal battery became one `POSSIBLE BATTERY` estimate only after actual fire.
- Static map check found no hydrophone-range or coastal-battery-range drawing references.

Result: `PHASE 2 TRUK OPTIONAL RAID CONTRACT: PASS`.

## Browser smoke-test note

A Chromium `--dump-dom` smoke was attempted in the container, but this environment returned no DOM output and emitted DBus/runtime noise. It is therefore **not counted as a passed browser test**. The successful tests above are Node/VM simulation, state, persistence and DOM/rendering harness tests. Final GitHub Pages/device smoke remains appropriate after deployment.
