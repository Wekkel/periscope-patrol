# Phase 3 test report

All reported PASS results below were actually executed against the Phase-3 build.

## Phase 3 acceptance contract

- JavaScript syntax: 48 runtime JS files passed `node --check`.
- UI wiring: all eight desktop/touch repair-priority controls plus the status element are present; `damage-control.js` is loaded; no visible `Toggle Damage Control` button remains.
- Reproducibility: scenario seed 4242 + a 36-point shock produced byte-for-byte identical new subsystem damage values and calibration biases in two independent simulations.
- Rudder: after 10 seconds of the same 90-degree turn order, clean boat heading = 33.60 degrees; 72% rudder damage = 15.456 degrees.
- Ballast: after the same 30-second dive order, clean depth = 47.60 ft; 75% ballast damage = 25.621 ft. Trim bias was a stable +0.04122 ft/s for that seed.
- TDC/gyro: clean gyro answer = 32.3621 degrees; damaged answer = 30.51425 degrees on both successive calculations, exactly unchanged between calls. The gyro calibration bias in that test was -2.03272 degrees.
- Pumps: with 40% pump damage over 120 seconds, pumps OFF left flooding at 0.57143; pumps ON reduced it to 0.22743. Acoustic signature rose from 0.08571 to 0.15411. Effective pump capacity = 75.04%.
- Repair priority: after 180 seconds with identical 50% casualties, PROPULSION priority reduced motor/electrical damage to 0.21714 / 0.19143 while rudder remained 0.47429. STEERING priority reduced rudder to 0.14857 while motor/electrical remained 0.47429 / 0.47857.
- Severe field repair: a 92% damaged periscope stopped repairing at 47.84% damage rather than returning to zero.
- Pump trip: an 80% damaged pump under heavy flooding tripped after sustained load and switched itself OFF.
- Drive bank: with one bank offline, the same propulsion test fell from 7.6917 kn to 5.1883 kn and RPM was capped at 320.
- Optics renderer: 16% damage produced scratches without blur; 58% produced `blur(1.38px)` plus contrast loss/distortion; 95% selected the severe mostly-unusable optic renderer.
- Damage-report UI: rendered output contains Electrical, TDC, Gyro, Pumps and `DC priority: OPTICS / FIRE CONTROL`.
- Legacy migration: a pre-Phase-3 save acquired zero/default new subsystem fields; a legacy 90% periscope casualty retained a 46.8% at-sea repair floor.

Result: `PHASE 3 SUBSYSTEM DAMAGE CONTRACT: PASS`.

## Regression contract

The existing regression suites were rerun after integrating the new simulation layer:

- Phase 0: PASS — patrol start, new-patrol map recenter, save/load, torpedo launch, TAC/MAP/periscope, time compression and deck gun remain operational.
- Phase 1: PASS — shared hull geometry, swept collision, merchant avoidance, vertical submarine clearance, impact damage, collision-risk transit stop and zero phantom collisions in the convoy test remain operational.
- Phase 2: PASS — Truk optional objective/radio-copy gating, phased harbor fog of war, heavy-unit identification, optional result states and physical unknown mine/net behavior remain operational.

The complete console outputs are included as `PHASE_0_RECHECK_PHASE3.txt`, `PHASE_1_RECHECK_PHASE3.txt`, `PHASE_2_RECHECK_PHASE3.txt` and `PHASE_3_TEST_OUTPUT.txt`.

## Browser smoke limitation

A Chromium runtime smoke was attempted, but this execution environment applies an administrator policy that blocks navigation to both localhost and `file://` pages (`ERR_BLOCKED_BY_ADMINISTRATOR`). That attempt is not counted as a passed browser test. The acceptance results above come from syntax checks plus deterministic state/simulation/UI/canvas-render harnesses.
